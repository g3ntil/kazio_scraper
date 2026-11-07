import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import type { RawBrighterMondayJob } from '../types.js';
import { classifyContent, extractTenderMetadata } from '../utils/classifier.js';

export function getSupabaseClient() {
  // Server-only fallback for the existing local workspace; never a VITE secret.
  dotenv.config({ path: fileURLToPath(new URL('../../../../app/.env.local', import.meta.url)), override: false });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }

  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function upsertBrighterMondayJobs(jobs: RawBrighterMondayJob[]): Promise<{ count: number; error: any }> {
  if (jobs.length === 0) return { count: 0, error: null };

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  // Strict Validation Guard: Only process valid records with title, external_id, and source_url
  const validJobs = jobs.filter((j) => j && j.external_id && j.title && j.source_url);
  if (validJobs.length === 0) return { count: 0, error: null };

  const formattedJobs = validJobs.map((job) => {
    let descText = (job.description_text || job.job_summary_text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (descText.length > 15000) {
      descText = descText.slice(0, 15000).trim() + '...';
    }

    const cleanTitle = job.title.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanCompany = job.company_name ? job.company_name.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() : null;
    const cleanSalary = job.salary_raw ? job.salary_raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() : null;

    const contentType = classifyContent({
      title: cleanTitle,
      description: descText,
      category: job.category,
      work_type: job.work_type,
      salary_raw: cleanSalary,
      company: cleanCompany,
    });

    const tenderMeta = contentType !== 'job'
      ? extractTenderMetadata(cleanTitle, descText, cleanCompany)
      : { submission_deadline: null, contact_emails: [], procuring_organization: null };

    return {
      ...job,
      title: cleanTitle,
      company_name: cleanCompany,
      salary_raw: cleanSalary,
      description_text: descText,
      content_type: contentType,
      submission_deadline: tenderMeta.submission_deadline,
      contact_emails: tenderMeta.contact_emails,
      procuring_organization: tenderMeta.procuring_organization,
      scraped_at: job.scraped_at || now,
      first_seen_at: job.first_seen_at || now,
      last_seen_at: now,
    };
  });

  const { data, error } = await supabase
    .from('raw_brightermonday_jobs')
    .upsert(formattedJobs, {
      onConflict: 'external_id',
      ignoreDuplicates: false,
    })
    .select('external_id');

  if (error) {
    console.error('[Supabase Error] Failed to upsert raw jobs:', error);
    return { count: 0, error };
  }

  // Also upsert cleaned usable records into main production 'jobs' table
  const cleanedJobsForProduction = jobs.map((job) => {
    const descText = job.description_text || job.job_summary_text || '';
    const contentType = classifyContent({
      title: job.title,
      description: descText,
      category: job.category,
      work_type: job.work_type,
      salary_raw: job.salary_raw,
      company: job.company_name,
    });

    const tenderMeta = contentType !== 'job'
      ? extractTenderMetadata(job.title, descText, job.company_name)
      : { submission_deadline: null, contact_emails: [], procuring_organization: null };

    const isValidDate = (dStr: string | null | undefined): boolean => {
      if (!dStr) return false;
      return !isNaN(new Date(dStr).getTime());
    };

    // For non-job content, set is_active = false
    const isActive = contentType === 'job'
      ? (isValidDate(job.valid_through_jsonld) ? new Date(job.valid_through_jsonld!) >= new Date() : true)
      : false;

    return {
      title: job.title ? job.title.trim() : 'Untitled',
      company: (job.company_name && job.company_name !== 'Company Name') ? job.company_name.trim() : 'Unknown',
      location: job.location_raw || 'Rwanda',
      deadline: job.valid_through_jsonld ? job.valid_through_jsonld.split('T')[0] : null,
      published_on: job.posted_date_jsonld ? job.posted_date_jsonld.split('T')[0] : job.posted_relative,
      job_url: job.source_url,
      experience_level: contentType === 'job' ? (job.experience_level || 'Not specified') : null,
      job_type: contentType === 'job' ? (job.work_type || 'Full Time') : null,
      description: descText,
      is_active: isActive,
      scraped_at: job.scraped_at || now,
      content_type: contentType,
      submission_deadline: tenderMeta.submission_deadline,
      contact_emails: tenderMeta.contact_emails,
      procuring_organization: tenderMeta.procuring_organization,
    };
  });

  const { error: cleanUpsertError } = await supabase
    .from('jobs')
    .upsert(cleanedJobsForProduction, {
      onConflict: 'job_url',
    });

  if (cleanUpsertError) {
    console.warn('[Supabase Warning] Syncing to clean jobs table encountered an issue:', cleanUpsertError.message);
  }

  return { count: data ? data.length : jobs.length, error: null };
}
