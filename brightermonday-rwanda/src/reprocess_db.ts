import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { getSupabaseClient, upsertBrighterMondayJobs } from './db/supabase.js';
import { fetchDetailPage } from './scraper/detail.js';
import type { RawBrighterMondayJob } from './types.js';

dotenv.config();

async function reprocessExistingDatabaseRows() {
  console.log('=======================================================');
  console.log(' Reprocessing Existing Raw BrighterMonday Database Rows');
  console.log('=======================================================');

  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('raw_brightermonday_jobs')
    .select('external_id, source_url, title, company_name, company_url, location_raw, work_type, category, badges, posted_relative');

  if (error || !rows) {
    console.error('Failed to query raw_brightermonday_jobs:', error);
    process.exit(1);
  }

  console.log(`Found ${rows.length} existing raw records to re-fetch and re-parse.`);

  const browser = await chromium.launch({ headless: true });
  const detailPage = await browser.newPage();

  const updatedRecords: RawBrighterMondayJob[] = [];
  const now = new Date().toISOString();

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`[${i + 1}/${rows.length}] Re-fetching: ${row.title} (${row.external_id})`);
      const detail = await fetchDetailPage(row.source_url, detailPage);

      const record: RawBrighterMondayJob = {
        external_id: row.external_id,
        source_url: row.source_url,
        title: row.title,
        company_name: row.company_name,
        company_url: row.company_url,
        location_raw: row.location_raw,
        work_type: row.work_type,
        category: row.category || detail.industry_tag,
        industry_tag: detail.industry_tag,
        salary_raw: detail.salary_raw || null,
        posted_relative: row.posted_relative || 'Recently',
        posted_date_jsonld: detail.posted_date_jsonld,
        valid_through_jsonld: detail.valid_through_jsonld,
        base_salary_jsonld: detail.base_salary_jsonld,
        employment_type_jsonld: detail.employment_type_jsonld,
        badges: row.badges || [],
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
        scraped_at: now,
      };

      updatedRecords.push(record);
      await new Promise(r => setTimeout(r, 300));
    }
  } finally {
    await browser.close();
  }

  console.log(`\nUpserting ${updatedRecords.length} updated records into Supabase...`);
  const { count, error: upsertError } = await upsertBrighterMondayJobs(updatedRecords);

  if (upsertError) {
    console.error('Error upserting updated records:', upsertError);
  } else {
    console.log(`SUCCESS! Reprocessed and updated ${count} records in Supabase!`);
  }
}

reprocessExistingDatabaseRows().catch(err => {
  console.error('Fatal error during reprocessing:', err);
  process.exit(1);
});
