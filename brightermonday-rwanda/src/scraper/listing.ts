import { chromium, Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { ListingCardSummary } from '../types.js';

const BASE_URL = 'https://www.brightermonday.co.rw';

export function extractSlugId(url: string): string {
  const parts = url.split('-').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart && /^[a-z0-9]+$/i.test(lastPart)) {
    return lastPart;
  }
  // Fallback: full pathname
  const match = url.match(/\/listings\/([^/?#]+)/);
  return match ? match[1] : url;
}

export function parseListingCardsFromHtml(html: string): ListingCardSummary[] {
  const $ = cheerio.load(html);
  const cards: ListingCardSummary[] = [];

  // Card selector on BrighterMonday / Kazi platform
  $('[data-cy="listing-cards-components"], [data-cy="listing-card"], .mx-5.md\\:mx-0, div.flex.flex-col.grow, article, .job-card, .listing-card').each((_, el) => {
    const card = $(el);
    const titleAnchor = card.find('a[href*="/listings/"]').first();
    if (!titleAnchor.length) return;

    const relativeHref = titleAnchor.attr('href') || '';
    const source_url = relativeHref.startsWith('http') ? relativeHref : `${BASE_URL}${relativeHref}`;
    const external_id = extractSlugId(source_url);
    const title = titleAnchor.text().trim();

    if (!title || !external_id) return;

    // Company
    const companyAnchor = card.find('a[href*="/company/"]').first();
    let company_name: string | null = null;
    let company_url: string | null = null;

    if (companyAnchor.length) {
      company_name = companyAnchor.text().trim() || null;
      const compHref = companyAnchor.attr('href');
      company_url = compHref ? (compHref.startsWith('http') ? compHref : `${BASE_URL}${compHref}`) : null;
    } else {
      const companyP = card.find('p.text-blue-700, [aria-label]').first();
      if (companyP.length) {
        company_name = companyP.attr('aria-label') || companyP.text().trim() || null;
      }
      if (!company_name) {
        const metaText = card.find('.text-sm, .text-gray-500, p').text();
        const compMatch = metaText.match(/by\s+([A-Za-z0-9\s.,&-]+)/i);
        if (compMatch) {
          company_name = compMatch[1].trim();
        }
      }
    }

    // Badges (e.g. Easy Apply, New, Featured, Urgent)
    const badges: string[] = [];
    card.find('span, div, p, .badge').each((_, b) => {
      const bText = $(b).text().trim();
      if (!bText || bText.length > 30) return;
      const lower = bText.toLowerCase();
      if (lower === 'easy apply' || lower === 'new' || lower === 'featured' || lower === 'urgent') {
        const formatted = bText.charAt(0).toUpperCase() + bText.slice(1);
        if (!badges.includes(formatted)) {
          badges.push(formatted);
        }
      }
    });

    // Work type & Location & Salary
    let location_raw = 'Rwanda';
    let work_type: string | null = null;
    let category: string | null = null;
    let salary_raw: string | null = null;
    let posted_relative = 'Recently';

    // Tags & spans
    const textNodes: string[] = [];
    card.find('span, div, p').each((_, tag) => {
      const txt = $(tag).text().trim();
      if (txt && txt.length < 80) {
        textNodes.push(txt);
      }
    });

    // Detect work type
    const workTypes = ['Full Time', 'Contract', 'Part Time', 'Internship & Graduate', 'Temporary'];
    for (const wt of workTypes) {
      if (textNodes.some((t) => t.toLowerCase() === wt.toLowerCase())) {
        work_type = wt;
        break;
      }
    }

    // Detect Salary
    const salaryMatch = card.text().match(/(?:USD|FRw|RWF)\s*[\d,]+(?:\s*-\s*[\d,]+)?/i);
    if (salaryMatch) {
      salary_raw = salaryMatch[0].replace(/\s+/g, ' ').trim();
    } else if (card.text().toLowerCase().includes('confidential')) {
      salary_raw = null;
    }

    // Relative date
    const dateMatch = card.text().match(/\b(Today|\d+\s+(?:day|days|week|weeks|month|months)\s+ago)\b/i);
    if (dateMatch) {
      posted_relative = dateMatch[1].trim();
    }

    // Category / Job function tag
    const categoryAnchor = card.find('a[href*="job_function"], a[href*="/category/"]').first();
    if (categoryAnchor.length) {
      category = categoryAnchor.text().trim();
    } else {
      const categoryP = card.find('p.text-sm.text-gray-500').first();
      if (categoryP.length) {
        category = categoryP.text().trim() || null;
      }
    }

    // Location
    const locMatch = card.text().match(/\b(Kigali|Remote(?:\s*\([^)]*\))?|\w+\s*\(capital\))\b/i);
    if (locMatch) {
      location_raw = locMatch[0].trim();
    }

    cards.push({
      external_id,
      source_url,
      title,
      company_name,
      company_url,
      location_raw,
      work_type,
      category,
      salary_raw,
      posted_relative,
      badges,
    });
  });

  return cards;
}

export async function fetchAllListingSummaries(options: {
  maxPages?: number;
  headless?: boolean;
  canUseApi?: boolean;
}): Promise<ListingCardSummary[]> {
  const { maxPages = 37, headless = true } = options;
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  const allSummaries: Map<string, ListingCardSummary> = new Map();

  try {
    let currentPageNum = 1;
    let hasNextPage = true;

    while (hasNextPage && currentPageNum <= maxPages) {
      const pageUrl = currentPageNum === 1 ? `${BASE_URL}/jobs` : `${BASE_URL}/jobs?page=${currentPageNum}`;
      console.log(`[Listing Scraper] Navigating to ${pageUrl}...`);
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);

      const html = await page.content();
      const summaries = parseListingCardsFromHtml(html);
      console.log(`[Listing Scraper] Page ${currentPageNum}: extracted ${summaries.length} listings`);

      if (summaries.length === 0) {
        console.log(`[Listing Scraper] 0 listings on page ${currentPageNum}, ending pagination.`);
        hasNextPage = false;
        break;
      }

      for (const card of summaries) {
        if (!allSummaries.has(card.external_id)) {
          allSummaries.set(card.external_id, card);
        }
      }

      currentPageNum++;
    }
  } catch (error) {
    console.error('[Listing Scraper] Error during listing discovery:', error);
  } finally {
    await browser.close();
  }

  return Array.from(allSummaries.values());
}
