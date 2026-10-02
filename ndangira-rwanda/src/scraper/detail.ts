import * as cheerio from 'cheerio';
import type { RawNdangiraJob, ListingSummary } from '../types.js';

function parseDateStringToIso(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();

  // Handle DD-MM-YYYY format (e.g., 24-09-2026)
  const ddmmyyyy = cleanStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [_, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

export async function fetchDetailPage(summary: ListingSummary, category: string = 'Jobs'): Promise<RawNdangiraJob> {
  const res = await fetch(summary.source_url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch detail page ${summary.source_url}: HTTP status ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Clean ads, scripts, and extra elements
  $('script, style, ins.adsbygoogle, iframe').remove();

  // 1. Meta / Head fields
  const imageUrl = $('meta[property="og:image"]').attr('content') || null;

  // 2. Extract Info Boxes (.info-box)
  let companyName: string | null = null;
  let locationRaw: string | null = null;
  let deadlineRaw: string | null = summary.deadline_raw || null;
  let postedDateRaw: string | null = null;
  let viewsCount: number | null = null;

  $('.info-box').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');

    if (text.includes('Organization / Company')) {
      const val = text.replace('Organization / Company', '').trim();
      if (val) companyName = val;
    } else if (text.includes('Location')) {
      const val = text.replace('Location', '').trim();
      if (val) locationRaw = val;
    } else if (text.includes('Deadline')) {
      const val = text.replace(/Deadline:?/i, '').trim();
      if (val) deadlineRaw = val;
    }
  });

  // Extract views count
  const metaText = $('.ndangira-post-meta').text().trim() || $('body').text();
  const viewsMatch = metaText.match(/(\d+)\s+views/i);
  if (viewsMatch) {
    viewsCount = parseInt(viewsMatch[1], 10);
  }

  // Extract posted date near header
  const postedDateMatch = metaText.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
  if (postedDateMatch) {
    postedDateRaw = postedDateMatch[1];
  }

  // 3. Apply URL Extraction (Outbound external application link)
  let applyUrl: string | null = null;
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();
    
    if ((text.includes('apply') || text.includes('read more and apply') || text.includes('click here')) &&
        href.startsWith('http') &&
        !href.includes('ndangira.com') &&
        !href.includes('whatsapp.com') &&
        !href.includes('facebook.com') &&
        !href.includes('twitter.com') &&
        !href.includes('linkedin.com')) {
      applyUrl = href;
    }
  });

  // Fallback apply URL search in main content
  if (!applyUrl) {
    $('.post-content a, .listing-description a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http') && !href.includes('ndangira.com') && !href.includes('whatsapp.com') && !href.includes('facebook.com') && !href.includes('twitter.com') && !href.includes('linkedin.com')) {
        applyUrl = href;
      }
    });
  }

  // 4. Clean Description Body
  const $content = $('.post-content, .listing-description').clone();
  $content.find('.post-share-box, .ndangira-important-notice, .ndangira-whatsapp-channel, .post-navigation, style, script, ins').remove();

  const descriptionHtml = $content.html() ? $content.html()!.trim() : null;
  const descriptionText = $content.text() ? $content.text().trim().replace(/\n\s*\n/g, '\n\n') : null;

  return {
    external_id: summary.external_id,
    source_url: summary.source_url,
    category,
    title_raw: summary.title_raw,
    title_clean: summary.title_clean,
    company_name: companyName,
    location_raw: locationRaw,
    deadline_raw: deadlineRaw,
    deadline_date: parseDateStringToIso(deadlineRaw),
    posted_date_raw: postedDateRaw,
    posted_date: parseDateStringToIso(postedDateRaw),
    views_count: viewsCount,
    image_url: imageUrl,
    description_html: descriptionHtml,
    description_text: descriptionText,
    apply_url: applyUrl,
    scraped_at: new Date().toISOString(),
  };
}
