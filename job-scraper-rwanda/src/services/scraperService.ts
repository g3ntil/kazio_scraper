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
  if (source === 'jobwebrwanda') throw new Error('JobWeb Rwanda scraping is disabled.');
  const response = await fetch('/api/scrape/all', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not start scraping.');
  const result = data.breakdown?.[source];
  if (!result || result.status === 'failed') throw new Error(result?.error || 'Scraping failed.');
  return { source, status: result.status, jobsFound: result.count || 0,
    durationMs: result.durationMs || 0, enrichedCount: result.enrichedCount || 0,
    incompleteCount: result.incompleteCount || 0 };
}
