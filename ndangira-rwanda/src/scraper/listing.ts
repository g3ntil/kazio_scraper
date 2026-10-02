import * as cheerio from 'cheerio';
import type { ListingSummary } from '../types.js';

export function cleanTitle(rawTitle: string): string {
  // Strip trailing deadline indicators like ": (Deadline 24 September 2026)" or "(Deadline 24-09-2026)"
  return rawTitle ? rawTitle.replace(/\s*:?\s*\([^)]*Deadline[^)]*\)/gi, '').trim() : '';
}

export function extractExternalId(url: string): string | null {
  // Slug format: https://ndangira.com/{slug}-{numeric-id}
  const match = url.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

export async function fetchListingSummaries(entryUrl: string = 'https://ndangira.com/jobs'): Promise<ListingSummary[]> {
  console.log(` Fetching listing page: ${entryUrl}`);
  const res = await fetch(entryUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch listing page ${entryUrl}: HTTP status ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const summaries: ListingSummary[] = [];
  const seenIds = new Set<string>();

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const rawTitle = $(el).text().trim();

    const externalId = extractExternalId(href);
    if (externalId && !seenIds.has(externalId) && rawTitle.length > 5) {
      seenIds.add(externalId);
      const fullUrl = href.startsWith('http') ? href : `https://ndangira.com/${href.replace(/^\//, '')}`;
      summaries.push({
        external_id: externalId,
        source_url: fullUrl,
        title_raw: rawTitle,
        title_clean: cleanTitle(rawTitle),
      });
    }
  });

  console.log(` > Discovered ${summaries.length} distinct job postings on listing page.`);
  return summaries;
}
