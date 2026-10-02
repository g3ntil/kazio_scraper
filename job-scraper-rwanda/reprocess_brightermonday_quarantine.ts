import { createClient } from '@supabase/supabase-js';
import { classifyContent, extractTenderMetadata } from './src/lib/bm_classifier.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ndjvazyeykrzkqlipwbs.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kanZhenlleWtyemtxbGlwd2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTAzMzAsImV4cCI6MjA4NzA2NjMzMH0.OXKzbKKc05qYmy9nCFNyA5JwJVXJYz8u8Y9eGHCSdxo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function parseDateToYYYYMMDD(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

async function reprocessQuarantinedBrighterMondayJobs() {
  console.log(' Starting BrighterMonday Rwanda Quarantine Reprocessing Pass...');

  // Query quarantined BrighterMonday jobs
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, description, company, job_url, is_active, extraction_status, salary_min, salary_max')
    .ilike('job_url', '%brightermonday%')
    .eq('is_active', false)
    .eq('extraction_status', 'pending');

  if (error) {
    console.error('Error fetching quarantined jobs:', error);
    process.exit(1);
  }

  console.log(`Found ${jobs?.length || 0} quarantined BrighterMonday jobs to reprocess.`);

  const stats = {
    job: 0,
    tender: 0,
    paid_program: 0,
    unclear: 0,
  };

  const now = new Date().toISOString();

  for (const job of jobs || []) {
    const contentType = classifyContent({
      title: job.title,
      description: job.description,
      company: job.company,
    });

    stats[contentType]++;

    if (contentType === 'job') {
      // Re-activate as clean job
      await supabase
        .from('jobs')
        .update({
          content_type: 'job',
          is_active: true,
          extraction_status: 'done',
          extracted_at: now,
        })
        .eq('id', job.id);
    } else {
      // Extract tender fields and keep quarantined (is_active = false)
      const tenderFields = extractTenderMetadata(job.title, job.description || '', job.company);
      const parsedDeadline = parseDateToYYYYMMDD(tenderFields.submission_deadline);

      await supabase
        .from('jobs')
        .update({
          content_type: contentType,
          is_active: false,
          salary_min: null,
          salary_max: null,
          skills_t1: null,
          skills_t2: null,
          skills_t3: null,
          submission_deadline: parsedDeadline,
          contact_emails: tenderFields.contact_emails,
          procuring_organization: tenderFields.procuring_organization,
          extraction_status: 'done',
          extracted_at: now,
        })
        .eq('id', job.id);
    }
  }

  console.log(' Reprocessing pass completed!');
  console.log('Summary of reprocessed BrighterMonday listings:');
  console.log(`  - Real Jobs (activated): ${stats.job}`);
  console.log(`  - Tenders / Procurement (quarantined): ${stats.tender}`);
  console.log(`  - Paid Programs (quarantined): ${stats.paid_program}`);
  console.log(`  - Unclear (quarantined): ${stats.unclear}`);
}

reprocessQuarantinedBrighterMondayJobs().catch((err) => {
  console.error('Fatal error during reprocessing:', err);
  process.exit(1);
});
