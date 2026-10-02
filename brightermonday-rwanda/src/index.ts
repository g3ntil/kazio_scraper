import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { checkRobotsTxt } from './utils/robots.js';
import { fetchAllListingSummaries } from './scraper/listing.js';
import { fetchDetailPage } from './scraper/detail.js';
import { upsertBrighterMondayJobs } from './db/supabase.js';
import type { RawBrighterMondayJob } from './types.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const maxPagesArg = args.find((a) => a.startsWith('--max-pages='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  const maxPages = maxPagesArg
    ? parseInt(maxPagesArg.split('=')[1], 10)
    : (limit ? Math.max(1, Math.ceil(limit / 15)) : 37);

  return { isDryRun, limit, maxPages };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScraper() {
  const { isDryRun, limit, maxPages } = parseArgs();
  console.log(`=======================================================`);
  console.log(` Starting BrighterMonday Rwanda Scraper Service`);
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (no DB writes)' : 'LIVE (upserts to Supabase)'}`);
  if (limit) console.log(` Limit: ${limit} items`);
  console.log(`=======================================================`);

  // 1. Robots.txt check
  console.log('\n[1/3] Checking robots.txt rules...');
  const wwwRobots = await checkRobotsTxt('www.brightermonday.co.rw');
  const apiRobots = await checkRobotsTxt('api.brightermonday.co.rw');

  console.log(` > www.brightermonday.co.rw/robots.txt: ${wwwRobots.isAllowed ? 'ALLOWED' : 'DISALLOWED'}`);
  console.log(` > api.brightermonday.co.rw/robots.txt: ${apiRobots.isAllowed ? 'ALLOWED' : 'DISALLOWED'}`);

  // 2. Listing Discovery Pass
  console.log('\n[2/3] Starting listing discovery pass (Playwright)...');
  const summaries = await fetchAllListingSummaries({
    maxPages,
    headless: process.env.HEADLESS !== 'false',
    canUseApi: apiRobots.isAllowed,
  });

  console.log(`\nFound total ${summaries.length} listings across discovery pass.`);

  const targets = limit ? summaries.slice(0, limit) : summaries;
  console.log(`Processing ${targets.length} listings for detail extractions...`);

  // 3. Detail Pass & Stream Upsert
  console.log('\n[3/3] Fetching detail pages and compiling raw records...');
  const delayMs = parseInt(process.env.RATE_LIMIT_DELAY_MS || '500', 10);
  const rawJobs: RawBrighterMondayJob[] = [];
  const batchBuffer: RawBrighterMondayJob[] = [];
  let totalSaved = 0;

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  const detailPage = await browser.newPage();

  try {
    for (let i = 0; i < targets.length; i++) {
      const card = targets[i];
      console.log(`\n[${i + 1}/${targets.length}] Fetching detail for: ${card.title} (${card.external_id})`);
      console.log(` > URL: ${card.source_url}`);

      const detail = await fetchDetailPage(card.source_url, detailPage);
      const scraped_at = new Date().toISOString();

      const rawRecord: RawBrighterMondayJob = {
        external_id: card.external_id,
        source_url: card.source_url,
        title: card.title,
        company_name: card.company_name,
        company_url: card.company_url,
        location_raw: card.location_raw,
        work_type: card.work_type,
        category: card.category,
        industry_tag: detail.industry_tag,
        salary_raw: card.salary_raw || detail.salary_raw || null,
        posted_relative: card.posted_relative,
        posted_date_jsonld: detail.posted_date_jsonld,
        valid_through_jsonld: detail.valid_through_jsonld,
        base_salary_jsonld: detail.base_salary_jsonld,
        employment_type_jsonld: detail.employment_type_jsonld,
        badges: card.badges,
        job_summary_text: detail.job_summary_text,
        min_qualification: detail.min_qualification,
        experience_level: detail.experience_level,
        experience_length: detail.experience_length,
        language_requirement: detail.language_requirement,
        working_hours: detail.working_hours,
        applicant_location: detail.applicant_location,
        description_html: detail.description_html,
        description_text: detail.description_text,
        apply_url: null,
        scraped_at,
      };

      rawJobs.push(rawRecord);
      batchBuffer.push(rawRecord);

      // Stream upsert every 10 items or at final item
      if (!isDryRun && (batchBuffer.length >= 10 || i === targets.length - 1)) {
        console.log(` > Stream-upserting batch of ${batchBuffer.length} records to Supabase...`);
        const { count, error } = await upsertBrighterMondayJobs(batchBuffer);
        if (error) {
          console.error(` [Supabase Error] Stream-upsert failed:`, error);
        } else {
          totalSaved += count;
          console.log(` > SUCCESS! Stream-upserted batch to Supabase. Total saved in DB: ${totalSaved}`);
        }
        batchBuffer.length = 0;
      }

      if (i < targets.length - 1 && delayMs > 0) {
        await sleep(delayMs);
      }
    }
  } finally {
    await browser.close();
  }

  if (isDryRun) {
    console.log('\n[DRY RUN SUMMARY] Scraped records sample:');
    console.log(JSON.stringify(rawJobs.slice(0, 2), null, 2));
    console.log(`\nScraped ${rawJobs.length} records successfully (dry-run). No database writes executed.`);
  } else {
    console.log(`\nCOMPLETED! Total ${totalSaved} raw records successfully saved/upserted in Supabase table 'raw_brightermonday_jobs'.`);
  }
}

runScraper().catch((err) => {
  console.error('Fatal error running BrighterMonday scraper:', err);
  process.exit(1);
});
