/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Skill {
  name: string;
  tier: 1 | 2 | 3;
}

export interface Job {
  title: string;
  company: string;
  location: string;
  deadline: string | null;
  published_on: string | null;
  job_url: string;
  employer_url?: string | null;
  experience_level: string | null;
  job_type: string;
  
  // From details
  description?: string;
  taxonomy_category?: string | null;
  company_description?: string | null;
  company_logo_url?: string | null;
  company_website?: string | null;
  company_rating?: number | null;
  company_rating_count?: number | null;
  company_facebook_url?: string | null;
  company_twitter_url?: string | null;
  company_linkedin_url?: string | null;
  
  is_active?: boolean;
  content_type?: 'job' | 'tender' | 'paid_program' | 'unclear';
  submission_deadline?: string | null;
  contact_emails?: string[];
  procuring_organization?: string | null;
  is_duplicate?: boolean;
  is_invalid?: boolean;
  invalid_reason?: string;
  status?: 'pending' | 'scraping' | 'done' | 'failed';
  
  // Multi-source & Supabase diffing
  source_domain?: 'jobinrwanda.com' | 'greatrwandajobs.com' | 'jobwebrwanda.com' | 'brightermonday.co.rw' | 'ndangira.com' | string;
  source_name?: string;
  target_table?: string;
  in_supabase?: boolean;
  external_id?: string;
  title_raw?: string;
  company_name?: string;
  location_raw?: string;
  deadline_raw?: string;
  posted_date_raw?: string;
  views_count?: number;
  image_url?: string;
  description_html?: string;
  description_text?: string;
  apply_url?: string;
}

export enum ScrapeStatus {
  IDLE = 'idle',
  FETCHING_LIST = 'fetching_list',
  SCRAPING_DETAILS = 'scraping_details',
  SAVING = 'saving',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
