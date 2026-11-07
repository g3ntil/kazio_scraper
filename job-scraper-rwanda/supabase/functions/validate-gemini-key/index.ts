import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;


const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function alert(severity: string, code: string, message: string, metrics: Record<string, unknown>) {
  try {
    await supabase.rpc('emit_ops_alert_once', {
      p_severity: severity,
      p_code: code,
      p_message: message,
      p_metrics: metrics,
      p_window_min: 5,
    });
  } catch { /* best effort */ }
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  const incoming = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const { data: expected, error: authError } = await supabase.rpc('get_process_job_bearer');
  if (authError || !expected || !incoming || incoming !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let key_id: number;
  try {
    const body = await req.json();
    key_id = body.key_id;
    if (!key_id) throw new Error('Missing key_id');
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Bad request', detail: String(e) }), { status: 400 });
  }

  const { data: key, error: fetchErr } = await supabase.from('gemini_keys').select('*').eq('id', key_id).single();
  if (fetchErr || !key) {
    return new Response(JSON.stringify({ error: 'Key not found', detail: fetchErr?.message }), { status: 404 });
  }
  // Only act on keys still awaiting their first check -- never re-judge a key that's already in real use.
  if (key.status !== 'pending_validation') {
    return new Response(JSON.stringify({ skipped: true, reason: `status is '${key.status}', not pending_validation` }), { status: 200 });
  }

  if (key.provider === 'openrouter') {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', { headers: { Authorization: `Bearer ${key.api_key}` } });
      if (res.ok) {
        await supabase.from('gemini_keys').update({ status: 'active', fail_count: 0 }).eq('id', key_id);
        await supabase.rpc('heal_pipeline');
        return new Response(JSON.stringify({ success: true, provider: 'openrouter', verdict: 'valid' }), { status: 200 });
      }
      const body = await res.text();
      await supabase.from('gemini_keys').update({ active: false, status: 'invalid' }).eq('id', key_id);
      await alert('warning', 'new_key_invalid',
        `New OpenRouter key #${key_id} failed validation (HTTP ${res.status}) and was disabled automatically before touching any real jobs.`,
        { key_id, status: res.status, detail: body.slice(0, 200) });
      return new Response(JSON.stringify({ success: false, provider: 'openrouter', verdict: 'invalid', status: res.status }), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Validation request failed', detail: String(e) }), { status: 500 });
    }
  }

  // Gemini: smallest possible real call (5 output tokens max) -- proves auth + live quota without touching real job data.
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.api_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with exactly one word: OK' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
        }),
      },
    );

    if (res.status === 200) {
      await supabase.from('gemini_keys').update({ status: 'active', fail_count: 0 }).eq('id', key_id);
      await supabase.rpc('heal_pipeline');
      return new Response(JSON.stringify({ success: true, provider: 'gemini', verdict: 'valid' }), { status: 200 });
    }

    const body = await res.text();

    // Google returns 400 for a malformed/garbage key, 401/403 for an auth-rejected one -- all three mean the key itself is bad.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      await supabase.from('gemini_keys').update({ active: false, status: 'invalid' }).eq('id', key_id);
      await alert('warning', 'new_key_invalid',
        `New Gemini key #${key_id} was rejected (HTTP ${res.status} -- bad/revoked key) and disabled automatically before it could touch any real jobs.`,
        { key_id, status: res.status, detail: body.slice(0, 200) });
      return new Response(JSON.stringify({ success: false, provider: 'gemini', verdict: 'invalid', status: res.status }), { status: 200 });
    }

    if (res.status === 402) {
      await supabase.from('gemini_keys').update({ active: false, status: 'no_credits' }).eq('id', key_id);
      await alert('warning', 'new_key_no_credits',
        `New Gemini key #${key_id} has no billing credits (HTTP 402) and was disabled automatically before touching any real jobs. Top up billing in Google AI Studio, then re-enable it.`,
        { key_id, detail: body.slice(0, 200) });
      return new Response(JSON.stringify({ success: false, provider: 'gemini', verdict: 'no_credits' }), { status: 200 });
    }

    if (res.status === 429) {
      // The key itself authenticated fine -- just rate-limited on this one test call. Trust it, let normal rotation handle timing.
      await supabase.from('gemini_keys').update({ status: 'active' }).eq('id', key_id);
      await supabase.rpc('heal_pipeline');
      return new Response(JSON.stringify({ success: true, provider: 'gemini', verdict: 'valid_but_rate_limited' }), { status: 200 });
    }

    // Unknown/transient (5xx etc.) -- don't condemn the key on Google's own hiccup, leave it pending for a manual re-check.
    await alert('info', 'new_key_validation_inconclusive',
      `Could not validate new Gemini key #${key_id} (HTTP ${res.status}) -- left as pending_validation, not yet in rotation.`,
      { key_id, status: res.status, detail: body.slice(0, 200) });
    return new Response(JSON.stringify({ success: false, provider: 'gemini', verdict: 'inconclusive', status: res.status }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Validation request failed', detail: String(e) }), { status: 500 });
  }
});

