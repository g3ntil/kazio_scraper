import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { classifyContent, extractTenderMetadata } from './src/lib/bm_classifier.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ndjvazyeykrzkqlipwbs.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kanZhenlleWtyemtxbGlwd2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTAzMzAsImV4cCI6MjA4NzA2NjMzMH0.OXKzbKKc05qYmy9nCFNyA5JwJVXJYz8u8Y9eGHCSdxo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BASE_URL = 'https://www.brightermonday.co.rw';

function parseDateToYYYYMMDD(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

function sanitize(str: string): string {
  return str.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').trim();
}

async function testLiveBrighterMondaySync() {
  console.log(' Starting Live BrighterMonday Scrape & Supabase Sync Test...');

  // 1. Scrape listing pages
  const jobsList: any[] = [];
  const maxPages = 5;

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const pageUrl = pageNum === 1 ? `${BASE_URL}/jobs` : `${BASE_URL}/jobs?page=${pageNum}`;
    try {
      const resp = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!resp.ok) break;
      const html = await resp.text();
      const $ = cheerio.load(html);

      let countOnPage = 0;
      $('[data-cy="listing-cards-components"], [data-cy="listing-card"], .job-card, .listing-card').each((_, el) => {
        const card = $(el);
        const titleAnchor = card.find('a[href*="/listings/"]').first();
        if (!titleAnchor.length) return;

        const relativeHref = titleAnchor.attr('href') || '';
        const job_url = relativeHref.startsWith('http') ? relativeHref : `${BASE_URL}${relativeHref}`;
        const title = titleAnchor.text().trim();
        if (!title || !job_url) return;

        let company = 'Unknown';
        const companyAnchor = card.find('a[href*="/company/"]').first();
        if (companyAnchor.length) {
          company = companyAnchor.text().trim() || 'Unknown';
        } else {
          const companyP = card.find('p.text-blue-700, [aria-label]').first();
          if (companyP.length) {
            const ariaVal = companyP.attr('aria-label');
            company = (ariaVal && ariaVal.trim() && ariaVal.trim() !== 'Company Name') ? ariaVal.trim() : (companyP.text().trim() || 'Unknown');
          }
        }

        let job_type = 'Full Time';
        const cardText = card.text();
        const workTypes = ['Full Time', 'Contract', 'Part Time', 'Internship', 'Temporary'];
        for (const wt of workTypes) {
          if (new RegExp(`\\b${wt}\\b`, 'i').test(cardText)) {
            job_type = wt;
            break;
          }
        }

        let location = 'Rwanda';
        const locMatch = cardText.match(/\b(Kigali|Remote(?:\s*\([^)]*\))?|\w+\s*\(capital\))\b/i);
        if (locMatch) location = locMatch[0].trim();

        jobsList.push({
          job_url,
          title,
          company,
          location,
          job_type,
          published_on: null,
          deadline: null,
          experience_level: 'Not specified',
        });
        countOnPage++;
      });

      if (countOnPage === 0) break;
    } catch (err) {
      console.error(`Error scraping list page ${pageNum}:`, err);
      break;
    }
  }

  console.log(`Scraped total ${jobsList.length} raw listings from BrighterMonday.`);

  // 2. Fetch detail & classify for each item
  const jobsToSync: any[] = [];
  const stats = { job: 0, tender: 0, paid_program: 0, unclear: 0 };

  for (let i = 0; i < jobsList.length; i++) {
    const item = jobsList[i];
    try {
      const resp = await fetch(item.job_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      let description = 'No detailed description available.';
      let deadline: string | null = null;
      let published_on: string | null = null;
      let company_name: string | null = item.company;

      if (resp.ok) {
        const html = await resp.text();
        const $ = cheerio.load(html);
        $('#similar-jobs, .similar-jobs').remove();

        const descContainer = $('article.break-words, article, .job-description, [data-cy="job-description"], [data-cy="listing-description"], .description').first();
        if (descContainer.length) {
          description = sanitize(descContainer.html() || '') || descContainer.text().trim();
        }

        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const content = $(el).html() || '';
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const pItem of items) {
              if (pItem && (pItem['@type'] === 'JobPosting' || pItem['@type']?.includes?.('JobPosting'))) {
                if (pItem.validThrough) deadline = parseDateToYYYYMMDD(pItem.validThrough);
                if (pItem.datePosted) published_on = parseDateToYYYYMMDD(pItem.datePosted);
                if (pItem.hiringOrganization?.name) company_name = pItem.hiringOrganization.name;
              }
            }
          } catch (e) {}
        });
      }

      const plainText = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const contentType = classifyContent({
        title: item.title,
        description: plainText,
        company: company_name,
      });

      stats[contentType]++;

      const tenderMeta = contentType !== 'job'
        ? extractTenderMetadata(item.title, plainText, company_name)
        : { submission_deadline: null, contact_emails: [], procuring_organization: null };

      const today = new Date().toISOString().split('T')[0];
      const isActive = contentType === 'job' ? (deadline ? deadline >= today : true) : false;

      jobsToSync.push({
        title: item.title,
        company: company_name || 'Unknown',
        location: item.location || 'Rwanda',
        deadline,
        published_on,
        job_url: item.job_url,
        experience_level: contentType === 'job' ? (item.experience_level || 'Not specified') : null,
        job_type: contentType === 'job' ? (item.job_type || 'Full Time') : null,
        description,
        is_active: isActive,
        content_type: contentType,
        submission_deadline: parseDateToYYYYMMDD(tenderMeta.submission_deadline),
        contact_emails: tenderMeta.contact_emails,
        procuring_organization: tenderMeta.procuring_organization,
      });
    } catch (err) {
      console.error(`Error processing details for ${item.job_url}:`, err);
    }
  }

  console.log(`\nReady to upsert ${jobsToSync.length} items to Supabase table 'jobs'...`);
  console.log(`Classification stats:`, stats);

  // 3. Upsert into Supabase table 'jobs'
  const { data, error } = await supabase
    .from('jobs')
    .upsert(jobsToSync, { onConflict: 'job_url' })
    .select('id, title, content_type, is_active');

  if (error) {
    console.error('Supabase Upsert Error:', error);
    process.exit(1);
  }

  console.log(`\n SUCCESS! Successfully upserted ${data?.length || jobsToSync.length} rows to Supabase table 'jobs'!`);
}

testLiveBrighterMondaySync().catch((err) => {
  console.error('Fatal live sync test error:', err);
  process.exit(1);
});
