import { createClient } from "jsr:@supabase/supabase-js@2";
import { applicationDestination, normalizeLocation, supportedDegree } from './quality.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const OPENROUTER_MODEL = "google/gemini-2.5-flash";

const INDUSTRY_ENUM = ["technology_it","banking_finance","healthcare_pharma","education_academia","ngo_development","government_public_sector","agriculture_agribusiness","manufacturing_industry","hospitality_tourism","media_communications","retail_ecommerce","real_estate_construction","transport_logistics","energy_utilities","consulting_advisory","legal_services","telecom"];
const JOB_FUNCTION_ENUM = ["software_engineering","data_analytics","product_management","design_creative","devops_infrastructure","cybersecurity","finance_accounting","audit_compliance","human_resources","legal","sales_business_dev","marketing_digital","customer_service","operations_admin","supply_chain_procurement","project_management","health_clinical","medical_lab","pharmacy","teaching_training","research_academia","ngo_programs","policy_advocacy","civil_engineering","mechanical_engineering","electrical_engineering","agriculture_field","environment_sustainability","communications_pr","content_writing","driving_transport","trades_technical","hospitality_service"];
const JOB_TYPE_ENUM = ["full_time","part_time","contract","internship","volunteer","freelance"];
const EXPERIENCE_LEVEL_ENUM = ["entry","mid","senior","lead","executive"];
const DEGREE_ENUM = ["none","certificate","diploma","bachelor","master","phd"];
const LANGUAGE_ENUM = ["english","french","kinyarwanda","swahili","other"];
const CONTENT_TYPE_ENUM = ["job","tender","paid_program","unclear"];

// ---------------------------------------------------------------------------
// Source registry (public.pipeline_sources). Adding a source = adding a row there.
// The fallback below only exists so a registry outage can never stop extraction.
// ---------------------------------------------------------------------------
type SourceCfg = {
  source: string; staging_table: string; key_col: string; title_cols: string[];
  company_col: string | null; location_col: string | null; description_col: string | null;
  url_col: string | null; deadline_col: string | null; salary_flag_col: string | null; has_content_type: boolean;
};
const FALLBACK_SOURCES: SourceCfg[] = [
  { source: "brightermonday", staging_table: "raw_brightermonday_jobs", key_col: "external_id", title_cols: ["title"], company_col: "company_name", location_col: "location_raw", description_col: "description_text", url_col: "source_url", deadline_col: "valid_through_jsonld", salary_flag_col: "base_salary_jsonld", has_content_type: true },
  { source: "ndangira", staging_table: "raw_ndangira_jobs", key_col: "id", title_cols: ["title_clean", "title_raw"], company_col: "company_name", location_col: "location_raw", description_col: "description_text", url_col: "source_url", deadline_col: "deadline_date", salary_flag_col: null, has_content_type: false },
  { source: "greatrwandajobs", staging_table: "jobs_greatrwandajobs", key_col: "id", title_cols: ["title"], company_col: "company", location_col: "location", description_col: "description", url_col: "job_url", deadline_col: "deadline", salary_flag_col: null, has_content_type: true },
  { source: "jobinrwanda", staging_table: "raw_jobinrwanda_jobs", key_col: "id", title_cols: ["title"], company_col: "company", location_col: "location", description_col: "description", url_col: "job_url", deadline_col: "deadline", salary_flag_col: null, has_content_type: true },
];

async function loadSources(only?: string): Promise<SourceCfg[]> {
  let list: SourceCfg[] = FALLBACK_SOURCES;
  try {
    const { data, error } = await supabase.from("pipeline_sources").select("*").eq("enabled", true);
    if (!error && data && data.length) list = data as SourceCfg[];
  } catch { /* use fallback */ }
  return only ? list.filter((s) => s.source === only) : list;
}

async function getVocabulary(): Promise<string[]> {
  const { data } = await supabase
    .from("skill_vocabulary")
    .select("canonical")
    .eq("is_approved", true)
    .order("usage_count", { ascending: false })
    .limit(300);
  return (data ?? []).map((r: any) => r.canonical);
}

function buildPrompt(
  job: { title: string; company: string | null; location: string | null; description: string },
  vocabulary: string[],
  knownDeadline: boolean,
  knownSalary: boolean,
) {
  const vocabBlock = vocabulary.length
    ? `\n\nApproved skill vocabulary — prefer these terms for skills_t1/t2/t3 whenever they genuinely fit; only add a term outside this list when nothing close exists, and keep any new term short (2-4 words, never a full sentence):\n${vocabulary.join(", ")}`
    : "";

  const shape: string[] = [
    `  "content_type": one of ${JSON.stringify(CONTENT_TYPE_ENUM)} — "tender" for procurement/RFP/RFQ notices, "paid_program" if the applicant must pay a fee (training programs etc), "unclear" if you genuinely cannot tell, "job" otherwise`,
    `  "industry": one of ${JSON.stringify(INDUSTRY_ENUM)} — always pick the closest match, never leave unset`,
    `  "job_function": one of ${JSON.stringify(JOB_FUNCTION_ENUM)} — always pick the closest match, never leave unset`,
    `  "job_type_new": one of ${JSON.stringify(JOB_TYPE_ENUM)} — default "full_time" if not stated`,
    `  "experience_level_new": one of ${JSON.stringify(EXPERIENCE_LEVEL_ENUM)} — default "mid" if not stated`,
    `  "min_degree": one of ${JSON.stringify(DEGREE_ENUM)} or null — ONLY an explicitly required education level; null if not stated. Never infer from seniority.`,
    `  "skills_t1": array of strings — skills explicitly stated as required/must-have`,
    `  "skills_t2": array of strings — skills explicitly stated as preferred/nice-to-have`,
    `  "skills_t3": array of strings — skills reasonably implied by the role but never actually written in the text`,
    `  "languages_required": array from ${JSON.stringify(LANGUAGE_ENUM)} — only explicitly required languages; [] if not stated`,
    `  "ai_summary": string — 2-3 plain-English sentences summarizing the role`,
    `  "company_description": string or null — a short 1-2 sentence description of the COMPANY itself (what it does, its industry, its size), taken ONLY from an "About us"/"About the company"/company-profile section if the posting actually has one. Return null if the text never describes the company — never invent one from the job title alone.`,
    `  "contact_emails": array of strings — any email addresses found in the text, empty array if none`,
    `  "application_email": string or null — ONLY an email explicitly inviting applications. Exclude fraud-reporting, privacy, complaints and addresses that say not to send applications. null when uncertain.`,
    `  "is_local_company": boolean — true unless the posting clearly indicates an international/remote-only employer with no Rwanda presence`,
  ];
  if (!knownSalary) {
    shape.push(`  "salary_min": number or null — ONLY if the posting states or strongly implies a real figure, null otherwise. Never invent a number.`);
    shape.push(`  "salary_max": number or null — same rule`);
    shape.push(`  "salary_is_estimated": boolean — true only if you inferred the range from role/experience/industry context rather than the posting stating it directly`);
  }
  if (!knownDeadline) {
    shape.push(`  "deadline": "YYYY-MM-DD" or null — the application deadline if stated anywhere in the text, null if not stated`);
  }

  return `You are a job-posting data extractor for a Rwandan job platform. Read the posting below and return ONLY a JSON object, no other text.

TITLE: ${job.title}
COMPANY: ${job.company ?? "unknown"}
LOCATION: ${job.location ?? "unknown"}
DESCRIPTION:
${job.description.slice(0, 8000)}${vocabBlock}

Return this exact JSON shape (do not include any field not listed here):
{
${shape.join(",\n")}
}

Rules:
- If content_type is "tender" or "paid_program", leave skills_t1/t2/t3 as empty arrays${knownSalary ? "" : " and salary_min/salary_max as null"} — do not fabricate job-style data on non-job content.
- Never fabricate a salary, a deadline, or a company description. Missing is better than wrong.
- Return valid JSON only.`;
}

// ---------------------------------------------------------------------------
// Key pool
// ---------------------------------------------------------------------------
function isSameUtcDay(a: string | null, b: Date) {
  if (!a) return false;
  const d = new Date(a);
  return d.getUTCFullYear() === b.getUTCFullYear() && d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() === b.getUTCDate();
}

async function getActiveKey(excludeIds: number[] = []) {
  const now = new Date();
  const { data, error } = await supabase
    .from("gemini_keys")
    .select("*")
    .eq("active", true)
    .eq("status", "active");
  if (error || !data || data.length === 0) throw new Error("No active API key available in gemini_keys");

  const usable = data.filter((k) => {
    if (excludeIds.includes(k.id)) return false;
    const requestsToday = isSameUtcDay(k.day_window_start, now) ? (k.requests_today ?? 0) : 0;
    if (requestsToday >= (k.rpd_limit ?? Infinity)) return false;
    if (k.rpd_blocked_until && new Date(k.rpd_blocked_until) > now) return false;
    if (k.rpm_blocked_until && new Date(k.rpm_blocked_until) > now) return false;
    return true;
  });
  if (usable.length === 0) throw new Error("All keys are over their daily/rate limit or excluded");

  usable.sort((a, b) => {
    if (a.provider !== b.provider) return a.provider === "gemini" ? -1 : 1;
    const at = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
    const bt = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
    return at - bt;
  });
  return usable[0];
}

// Google resets daily quotas at midnight Pacific.
function nextPacificMidnight(now = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const sinceMidnight = ((Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000;
  return new Date(now.getTime() + (24 * 3600 * 1000 - sinceMidnight));
}

async function parse429(res: Response): Promise<{ daily: boolean; retryMs: number | null }> {
  let text = "";
  try { text = await res.text(); } catch { /* ignore */ }
  const daily = /PerDay/i.test(text) || /per day/i.test(text);
  const m = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return { daily, retryMs: m ? Math.ceil(parseFloat(m[1]) * 1000) : null };
}

// Daily quota gone -> block until Google resets it. Otherwise escalating backoff (30s, 1m, 2m ... 15m), honouring Google's retryDelay.
async function markKeyRateLimited(key: any, info: { daily: boolean; retryMs: number | null }) {
  if (info.daily) {
    await supabase.from("gemini_keys").update({
      rpd_blocked_until: new Date(nextPacificMidnight().getTime() + 60_000).toISOString(),
      fail_count: (key.fail_count ?? 0) + 1,
    }).eq("id", key.id);
    return;
  }
  const streak = Math.min((key.fail_count ?? 0) + 1, 6);
  const backoff = Math.min(30_000 * 2 ** (streak - 1), 15 * 60_000);
  const wait = Math.max(info.retryMs ? info.retryMs + 2000 : 0, backoff);
  await supabase.from("gemini_keys").update({
    rpm_blocked_until: new Date(Date.now() + wait).toISOString(),
    fail_count: streak,
  }).eq("id", key.id);
}

// HTTP 402 = the Google project's prepaid credits are gone. That is an ACCOUNT problem, not a row problem:
// block the key for 15 min (a newly added key from a funded project is picked up immediately), raise ONE critical alert,
// and report it as a rate/quota-class error so the row is retried later for free instead of being marked permanently failed.
async function markKeyBillingBlocked(key: any, body: string) {
  await supabase.from("gemini_keys").update({
    rpm_blocked_until: new Date(Date.now() + 15 * 60_000).toISOString(),
    fail_count: (key.fail_count ?? 0) + 1,
  }).eq("id", key.id);
  try {
    await supabase.rpc("emit_ops_alert_once", {
      p_severity: "critical",
      p_code: "ai_billing_exhausted",
      p_message: "Gemini API returned 402: prepayment credits are depleted. Top up billing in Google AI Studio, or insert a key from a funded project into public.gemini_keys (it starts automatically).",
      p_metrics: { key_id: key.id, detail: body.slice(0, 200) },
      p_window_min: 60,
    });
  } catch { /* best effort */ }
}

async function markKeyDisabled(keyId: number) {
  await supabase.from("gemini_keys").update({ fail_count: 1, active: false, status: "inactive" }).eq("id", keyId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function markKeyUsed(key: any) {
  const now = new Date();
  const sameDay = isSameUtcDay(key.day_window_start, now);
  await supabase.from("gemini_keys").update({
    last_used_at: now.toISOString(),
    requests_today: sameDay ? (key.requests_today ?? 0) + 1 : 1,
    day_window_start: sameDay ? key.day_window_start : now.toISOString(),
    fail_count: 0,
  }).eq("id", key.id);
}

async function callGemini(key: any, prompt: string): Promise<any> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.api_key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (res.status === 429) {
    const info = await parse429(res);
    await markKeyRateLimited(key, info);
    throw new Error(`Gemini key ${key.id} rate/quota limited: 429${info.daily ? " (daily quota exhausted until Pacific midnight)" : ""}`);
  }
  if (res.status === 402) {
    const b = await res.text();
    await markKeyBillingBlocked(key, b);
    throw new Error(`Gemini key ${key.id} rate/quota limited: 402 (billing: prepayment credits depleted)`);
  }
  if (res.status === 401 || res.status === 403) { await markKeyDisabled(key.id); throw new Error(`Gemini key ${key.id} auth error: ${res.status}`); }
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  await markKeyUsed(key);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

async function callOpenRouter(key: any, prompt: string): Promise<any> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (res.status === 429 || res.status === 402) {
    await markKeyRateLimited(key, { daily: false, retryMs: null });
    throw new Error(`OpenRouter key ${key.id} rate/quota limited: ${res.status}`);
  }
  if (res.status === 401) {
    await markKeyDisabled(key.id);
    throw new Error(`OpenRouter key ${key.id} auth error: ${res.status}`);
  }
  if (res.status === 403) {
    const body = await res.text();
    if (body.includes("limit exceeded")) {
      await markKeyDisabled(key.id);
      throw new Error(`OpenRouter key ${key.id} spend cap exhausted: ${body.slice(0, 200)}`);
    }
    throw new Error(`OpenRouter request rejected (403) on key ${key.id}: ${body.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  await markKeyUsed(key);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");
  return JSON.parse(content);
}

// Tries up to 4 keys. A blocked key is skipped and the NEXT key is tried immediately (no fixed sleep).
async function callAI(prompt: string): Promise<any> {
  const tried: number[] = [];
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let key;
    try {
      key = await getActiveKey(tried);
    } catch (e) {
      throw lastError ?? (e as Error);
    }
    tried.push(key.id);
    try {
      return key.provider === "gemini" ? await callGemini(key, prompt) : await callOpenRouter(key, prompt);
    } catch (e) {
      lastError = e as Error;
      if (/\b50[234]\b/.test(String(lastError.message))) await sleep(2000);
    }
  }
  throw lastError ?? new Error("AI call failed after retries");
}

function validateEnum(value: string, allowed: string[], fallback: string) {
  return allowed.includes(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Row handling (generic over the registry)
// ---------------------------------------------------------------------------
function getJobInput(cfg: SourceCfg, row: any) {
  let title = "";
  for (const c of cfg.title_cols) {
    const v = row[c];
    if (typeof v === "string" && v.trim()) { title = v.trim(); break; }
  }
  return {
    title,
    company: cfg.company_col ? (row[cfg.company_col] ?? null) : null,
    location: cfg.location_col ? (row[cfg.location_col] ?? null) : null,
    description: cfg.description_col ? (row[cfg.description_col] ?? "") : "",
  };
}

function getStructuredDeadline(cfg: SourceCfg, row: any): string | null {
  const v = cfg.deadline_col ? row[cfg.deadline_col] : null;
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function isPast(dateStr: string) {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

// The scrapers never populate company_description on staging rows, so the AI reads it from the posting text.
function getStructuredCompanyDescription(row: any): string | null {
  return typeof row.company_description === "string" && row.company_description.trim().length > 0
    ? row.company_description.trim()
    : null;
}

async function processRow(cfg: SourceCfg, row: any, vocabulary: string[]) {
  const table = cfg.staging_table;
  const keyCol = cfg.key_col;
  const keyVal = row[keyCol];
  const nowIso = () => new Date().toISOString();
  const mark = (patch: Record<string, unknown>) => supabase.from(table).update(patch).eq(keyCol, keyVal);

  const jobInput = getJobInput(cfg, row);
  const sourceUrl = cfg.url_col ? row[cfg.url_col] : null;
  const structuredDeadline = getStructuredDeadline(cfg, row);
  const hasStructuredSalary = cfg.salary_flag_col ? row[cfg.salary_flag_col] != null : false;
  let usedAI = false;

  try {
    if (!sourceUrl) throw new Error("Row has no source URL");

    // ---- gates that cost no AI call ----
    if (!jobInput.description || jobInput.description.trim().length < 50) {
      await mark({ extraction_status: "failed", extraction_error: "Description missing or too short", extracted_at: nowIso() });
      return { status: "failed", error: "Description missing or too short", usedAI };
    }
    if (structuredDeadline && isPast(structuredDeadline)) {
      await mark({ extraction_status: "skipped_expired", extraction_error: "deadline passed before extraction", extracted_at: nowIso() });
      return { status: "skipped_expired", usedAI };
    }
    const { data: twinId } = await supabase.rpc("find_job_twin", { p_title: jobInput.title, p_company: jobInput.company ?? "", p_url: sourceUrl });
    if (twinId) {
      await mark({ extraction_status: "done", extracted_at: nowIso(), promoted_job_id: twinId });
      return { status: "duplicate", jobId: twinId, usedAI };
    }

    // ---- AI ----
    usedAI = true;
    const ai = await callAI(buildPrompt(jobInput, vocabulary, structuredDeadline !== null, hasStructuredSalary));

    const contentType = validateEnum(ai.content_type, CONTENT_TYPE_ENUM, "unclear");
    const aiDeadline = !structuredDeadline && typeof ai.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ai.deadline) ? ai.deadline : null;
    const deadline = structuredDeadline ?? aiDeadline;
    const isExpired = deadline !== null && isPast(deadline);

    if (contentType !== "job") {
      const patch: Record<string, unknown> = { extraction_status: "done", extracted_at: nowIso() };
      if (cfg.has_content_type) patch.content_type = contentType; else patch.extraction_error = `not_a_job:${contentType}`;
      await mark(patch);
      return { status: "skipped_not_job", contentType, usedAI };
    }
    if (isExpired) {
      const patch: Record<string, unknown> = { extraction_status: "done", extracted_at: nowIso(), extraction_error: "expired at extraction time" };
      if (cfg.has_content_type) patch.content_type = contentType;
      await mark(patch);
      return { status: "skipped_expired", usedAI };
    }

    const aiCompanyDesc = typeof ai.company_description === "string" && ai.company_description.trim().length > 0
      ? ai.company_description.trim()
      : null;

    const insertPayload: Record<string, unknown> = {
      title: jobInput.title,
      company: jobInput.company,
      location: normalizeLocation(jobInput.location),
      ...applicationDestination(ai.application_email, jobInput.description, sourceUrl),
      job_url: sourceUrl,
      description: jobInput.description,
      published_on: row.posted_relative ?? row.published_on ?? row.posted_date_raw ?? null,
      company_logo_url: row.company_logo_url ?? row.image_url ?? null,
      company_description: getStructuredCompanyDescription(row) ?? aiCompanyDesc,
      is_active: true,
      content_type: contentType,
      industry: validateEnum(ai.industry, INDUSTRY_ENUM, "technology_it"),
      job_function: validateEnum(ai.job_function, JOB_FUNCTION_ENUM, "operations_admin"),
      job_type_new: validateEnum(ai.job_type_new, JOB_TYPE_ENUM, "full_time"),
      experience_level_new: validateEnum(ai.experience_level_new, EXPERIENCE_LEVEL_ENUM, "mid"),
      min_degree: supportedDegree(ai.min_degree, jobInput.description),
      skills_t1: Array.isArray(ai.skills_t1) ? ai.skills_t1 : [],
      skills_t2: Array.isArray(ai.skills_t2) ? ai.skills_t2 : [],
      skills_t3: Array.isArray(ai.skills_t3) ? ai.skills_t3 : [],
      languages_required: Array.isArray(ai.languages_required) && ai.languages_required.length
        ? ai.languages_required.filter((l: string) => LANGUAGE_ENUM.includes(l))
        : [],
      deadline,
      deadline_source: structuredDeadline ? "source_field" : (aiDeadline ? "ai" : null),
      ai_summary: typeof ai.ai_summary === "string" ? ai.ai_summary : null,
      contact_emails: Array.isArray(ai.contact_emails) ? ai.contact_emails : [],
      is_local_company: ai.is_local_company !== false,
      extraction_status: "done",
      extracted_at: nowIso(),
    };

    if (hasStructuredSalary) {
      insertPayload.salary_min = null;
      insertPayload.salary_max = null;
      insertPayload.salary_is_estimated = false;
    } else {
      insertPayload.salary_min = typeof ai.salary_min === "number" ? ai.salary_min : null;
      insertPayload.salary_max = typeof ai.salary_max === "number" ? ai.salary_max : null;
      insertPayload.salary_is_estimated = Boolean(ai.salary_is_estimated);
    }

    const { data: inserted, error: insertErr } = await supabase.from("jobs").insert(insertPayload).select("id").single();
    if (insertErr) {
      if ((insertErr as any).code === "23505") {   // job_url already exists (race with another run)
        const { data: ex } = await supabase.from("jobs").select("id").eq("job_url", sourceUrl).maybeSingle();
        await mark({ extraction_status: "done", extracted_at: nowIso(), promoted_job_id: ex?.id ?? null });
        return { status: "duplicate", usedAI };
      }
      throw insertErr;
    }

    await mark({ extraction_status: "done", extracted_at: nowIso(), promoted_job_id: inserted.id });
    return { status: "inserted", jobId: inserted.id, usedAI };
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    await mark({ extraction_status: "failed", extraction_error: msg.slice(0, 500) });
    return { status: "failed", error: msg, usedAI };
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body.limit ?? 10) || 10, 25));
    const sources = await loadSources(body.source);
    if (body.source && sources.length === 0) {
      return new Response(JSON.stringify({ error: `Unknown or disabled source: ${body.source}` }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const vocabulary = await getVocabulary();
    const results: any[] = [];
    let stopped: string | null = null;

    outer: for (const cfg of sources) {
      const { data: rows, error } = await supabase
        .from(cfg.staging_table)
        .select("*")
        .eq("extraction_status", "pending")
        .limit(limit);
      if (error) { results.push({ source: cfg.source, status: "error", error: error.message }); continue; }
      for (const row of rows ?? []) {
        // No usable key -> stop without touching rows (they stay pending; nothing is marked failed or burns attempts).
        try { await getActiveKey(); } catch { stopped = "no_ai_capacity"; break outer; }
        const r = await processRow(cfg, row, vocabulary);
        const { usedAI, ...out } = r as any;
        results.push({ source: cfg.source, id: row[cfg.key_col], ...out });
        if (usedAI) await sleep(12000);   // pace AI calls; rows skipped by a gate cost nothing and don't wait
      }
    }

    return new Response(JSON.stringify({ processed: results.length, stopped, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

