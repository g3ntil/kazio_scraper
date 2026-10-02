import dotenv from 'dotenv';
import { checkRobotsTxt } from './utils/robots.js';
import { fetchListingSummaries } from './scraper/listing.js';
import { fetchDetailPage } from './scraper/detail.js';
import { upsertNdangiraJobs } from './db/supabase.js';
import type { RawNdangiraJob } from './types.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  return { isDryRun, limit };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScraper() {
  const { isDryRun, limit } = parseArgs();
  console.log(`=======================================================`);
  console.log(` Starting Ndangira Rwanda Jobs Scraper Service`);
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (no DB writes)' : 'LIVE (upserts to Supabase)'}`);
  if (limit) console.log(` Limit: ${limit} items`);
  console.log(`=======================================================`);

  // 1. Robots.txt check
  console.log('\n[1/3] Checking robots.txt rules...');
  const robots = await checkRobotsTxt('ndangira.com');
  console.log(` > ndangira.com/robots.txt: ${robots.isAllowed ? 'ALLOWED' : 'DISALLOWED'}`);

  if (!robots.isAllowed) {
    console.warn('Scraping disallowed by robots.txt. Aborting.');
    return;
  }

  // 2. Listing Discovery Pass
  console.log('\n[2/3] Starting listing discovery pass (Static HTML Fetch)...');
  const summaries = await fetchListingSummaries('https://ndangira.com/jobs');
  console.log(`\nFound total ${summaries.length} listings.`);

  const targets = limit ? summaries.slice(0, limit) : summaries;
  console.log(`Processing ${targets.length} listings for detail extractions...`);

  // 3. Detail Pass & Stream Upsert
  console.log('\n[3/3] Fetching detail pages and compiling raw records...');
  const delayMs = parseInt(process.env.RATE_LIMIT_DELAY_MS || '300', 10);
  const rawJobs: RawNdangiraJob[] = [];
  const batchBuffer: RawNdangiraJob[] = [];
  let totalSaved = 0;

  for (let i = 0; i < targets.length; i++) {
    const card = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] Fetching detail for: ${card.title_clean} (${card.external_id})`);
    console.log(` > URL: ${card.source_url}`);

    try {
      const detail = await fetchDetailPage(card, 'Jobs');
      rawJobs.push(detail);
      batchBuffer.push(detail);

      console.log(`   + Company: ${detail.company_name || 'N/A'}`);
      console.log(`   + Location: ${detail.location_raw || 'N/A'}`);
      console.log(`   + Deadline: ${detail.deadline_raw || 'N/A'}`);
      console.log(`   + Apply URL: ${detail.apply_url || 'N/A'}`);

      // Stream upsert every 10 items or at final item
      if (!isDryRun && (batchBuffer.length >= 10 || i === targets.length - 1)) {
        console.log(` > Stream-upserting batch of ${batchBuffer.length} records to Supabase...`);
        const { count, error } = await upsertNdangiraJobs(batchBuffer);
        if (error) {
          console.error(` [Supabase Error] Stream-upsert failed:`, error);
        } else {
          totalSaved += count;
          console.log(` > SUCCESS! Stream-upserted batch to Supabase. Total saved: ${totalSaved}`);
        }
        batchBuffer.length = 0;
      }
    } catch (err) {
      console.error(` [Error] Failed detail extraction for ${card.source_url}:`, err);
    }

    if (i < targets.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  if (isDryRun) {
    console.log('\n[DRY RUN SUMMARY] Scraped records sample:');
    console.log(JSON.stringify(rawJobs.slice(0, 2), null, 2));
    console.log(`\nScraped ${rawJobs.length} records successfully (dry-run). No database writes executed.`);
  } else {
    console.log(`\nCOMPLETED! Total ${totalSaved} raw records saved/upserted in Supabase table 'raw_ndangira_jobs'.`);
  }
}

runScraper().catch((err) => {
  console.error('Fatal error running Ndangira scraper:', err);
  process.exit(1);
});
