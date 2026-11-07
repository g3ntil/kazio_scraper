export const SOURCE_TABLES: Record<string, { table: string; key: string; name: string }> = {
  jobinrwanda: { table: 'raw_jobinrwanda_jobs', key: 'job_url', name: 'Job in Rwanda' },
  brightermonday: { table: 'raw_brightermonday_jobs', key: 'external_id', name: 'BrighterMonday' },
  ndangira: { table: 'raw_ndangira_jobs', key: 'external_id', name: 'Ndangira' },
  greatrwandajobs: { table: 'jobs_greatrwandajobs', key: 'job_url', name: 'Great Rwanda Jobs' },
  jobwebrwanda: { table: 'jobs_jobwebrwanda', key: 'job_url', name: 'JobWeb Rwanda' },
};

export function intervalFrom(value: unknown) {
  const interval = value === undefined ? 2000 : Number(value);
  if (!Number.isFinite(interval) || interval < 1000 || interval > 30000) throw new Error('Choose a page interval between 1 and 30 seconds.');
  return Math.round(interval);
}

/** Retry transient listing discovery failures without changing source parsers. */
export async function discoverWithRetry(url: string, onRetry: (attempt: number, error: string) => void,
  fetcher: typeof fetch = fetch, wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(180000) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        if (response.status < 500 && ![408, 429].includes(response.status)) throw Object.assign(error, { permanent: true });
        throw error;
      }
      return await response.json();
    } catch (error: any) {
      if (error.permanent || attempt === 3) throw error;
      onRetry(attempt, error.message);
      await wait(attempt * 3000);
    }
  }
}

export function hasDescription(item: any) {
  return [item?.description_text, item?.description_html, item?.description].some(value => {
    const text = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length >= 100 && !/^no (detailed )?description available/i.test(text);
  });
}

export function createPipelineState() {
  return {
    running: false, syncing: false, startedAt: null as string | null, finishedAt: null as string | null,
    intervalMs: 2000, error: null as string | null,
    sources: Object.fromEntries(Object.entries(SOURCE_TABLES).map(([source, config]) => [source, {
      name: config.name, stage: 'idle', found: 0, completed: 0, enriched: 0, incomplete: 0,
      currentJob: '', error: null as string | null, sync: 'idle', added: 0, existing: 0, held: 0,
      extraction: 'idle', extractionError: null as string | null,
    }])),
    addedJobs: [] as any[],
  };
}

/** Only confirmed inserts are reported; conflicts never reset extraction state. */
export async function insertNewRows(client: any, table: string, key: string, rows: any[], onBatch: (rows: any[]) => void) {
  const unique = [...new Map(rows.map(row => [row[key], row])).values()];
  if (unique.some(row => !row[key])) throw new Error('A job is missing its source identifier.');
  for (let offset = 0; offset < unique.length; offset += 50) {
    const { data, error } = await client.from(table).upsert(unique.slice(offset, offset + 50), {
      onConflict: key, ignoreDuplicates: true,
    }).select('*');
    if (error) throw error;
    onBatch(data || []);
  }
}

export async function kickExtractor(client: any, source: string) {
  const { data: config, error: configError } = await client.from('pipeline_sources').select('enabled').eq('source', source).maybeSingle();
  if (configError) throw configError;
  if (!config?.enabled) return { status: 'disabled', error: 'Automatic extraction is disabled for this source in Supabase.' };
  const { data: token, error: tokenError } = await client.rpc('get_process_job_bearer');
  if (tokenError || !token) throw new Error('Could not authenticate the extractor. Check the server credential.');
  const { data, error } = await client.functions.invoke('ai-job-extractor', {
    body: { source, limit: 2 }, headers: { 'X-Kazio-Extractor-Token': token },
  });
  if (error) throw new Error(`Extractor request failed: ${error.message}`);
  if (data?.error || data?.stopped) throw new Error(data.error || data.stopped);
  const failures = data?.results?.filter((row: any) => row.status === 'failed' || row.status === 'error');
  if (failures?.length) throw new Error(failures.map((row: any) => row.error).join('; '));
  return { status: 'requested', processed: data?.processed || 0 };
}
