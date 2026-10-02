import { SourceId } from '../types/dashboard';

export interface ScrapedItemSummary {
  title: string;
  company: string;
  job_url: string;
  deadline?: string | null;
  location?: string | null;
  is_active?: boolean;
}

export interface ScrapeResult {
  source: SourceId;
  status: 'success' | 'failed';
  jobsFound: number;
  newJobs?: number;
  durationMs: number;
  enrichedCount?: number;
  incompleteCount?: number;
  error?: string;
  items?: ScrapedItemSummary[];
}

export async function scrapeSource(source: SourceId): Promise<ScrapeResult> {
  const start = Date.now();
  let endpoint = '';
  switch (source) {
    case 'jobinrwanda': endpoint = '/api/scrape/list'; break;
    case 'brightermonday': endpoint = '/api/scrape/brightermonday/list'; break;
    case 'ndangira': endpoint = '/api/scrape/ndangira/list'; break;
    case 'greatrwandajobs': endpoint = '/api/scrape/greatrwandajobs/list'; break;
    case 'jobwebrwanda': endpoint = '/api/scrape/jobwebrwanda/list'; break;
  }

  try {
    // Use the same precision-enrichment path as the Overview/Home "Scrape All"
    // action so a source-specific run does not silently cache list-only rows.
    const precisionRes = await fetch('/api/scrape/all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    });
    if (precisionRes.ok) {
      const precisionData = await precisionRes.json();
      const result = precisionData.breakdown?.[source];
      if (result) {
        return {
          source,
          status: result.status,
          jobsFound: result.count || 0,
          durationMs: result.durationMs || Date.now() - start,
          enrichedCount: result.enrichedCount || 0,
          incompleteCount: result.incompleteCount || 0,
          error: result.error
        };
      }
    }

    // Compatibility fallback for older/local servers that do not support a
    // source-scoped unified run yet.
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    const items = data.jobs || data.results || (Array.isArray(data) ? data : []);
    return {
      source,
      status: 'success',
      jobsFound: items.length,
      durationMs: Date.now() - start,
      items
    };
  } catch (err: any) {
    return {
      source,
      status: 'failed',
      jobsFound: 0,
      durationMs: Date.now() - start,
      error: err.message
    };
  }
}

export async function scrapeAllSources(): Promise<Record<SourceId, ScrapeResult>> {
  // Try calling unified backend endpoint first
  try {
    const res = await fetch('/api/scrape/all', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const output: Partial<Record<SourceId, ScrapeResult>> = {};
      if (data.breakdown) {
        for (const [src, r] of Object.entries(data.breakdown as Record<string, any>)) {
          output[src as SourceId] = {
            source: src as SourceId,
            status: r.status,
            jobsFound: r.count || 0,
            durationMs: r.durationMs || 0,
            enrichedCount: r.enrichedCount || 0,
            incompleteCount: r.incompleteCount || 0,
            error: r.error
          };
        }
        return output as Record<SourceId, ScrapeResult>;
      }
    }
  } catch {
    // Fall back to client-side parallel fetch
  }

  const sources: SourceId[] = ['jobinrwanda', 'brightermonday', 'ndangira', 'greatrwandajobs', 'jobwebrwanda'];
  const results = await Promise.allSettled(sources.map(s => scrapeSource(s)));
  const output: Partial<Record<SourceId, ScrapeResult>> = {};

  results.forEach((res, index) => {
    const s = sources[index];
    if (res.status === 'fulfilled') {
      output[s] = res.value;
    } else {
      output[s] = {
        source: s,
        status: 'failed',
        jobsFound: 0,
        durationMs: 0,
        error: res.reason?.message || 'Scrape execution failed'
      };
    }
  });

  return output as Record<SourceId, ScrapeResult>;
}
