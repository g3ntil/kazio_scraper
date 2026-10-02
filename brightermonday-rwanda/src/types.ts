export interface RawBrighterMondayJob {
  external_id: string;
  source_url: string;
  title: string;
  company_name: string | null;
  company_url: string | null;
  location_raw: string;
  work_type: string | null;
  category: string | null;
  industry_tag: string | null;
  salary_raw: string | null;
  posted_relative: string;
  posted_date_jsonld: string | null;
  valid_through_jsonld: string | null;
  base_salary_jsonld: Record<string, any> | null;
  employment_type_jsonld: string | null;
  badges: string[];
  job_summary_text: string | null;
  min_qualification: string | null;
  experience_level: string | null;
  experience_length: string | null;
  language_requirement: string | null;
  working_hours: string | null;
  applicant_location: string | null;
  description_html: string;
  description_text: string;
  apply_url: null;
  scraped_at: string;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface ListingCardSummary {
  external_id: string;
  source_url: string;
  title: string;
  company_name: string | null;
  company_url: string | null;
  location_raw: string;
  work_type: string | null;
  category: string | null;
  salary_raw: string | null;
  posted_relative: string;
  badges: string[];
}

export interface DetailPageFields {
  industry_tag: string | null;
  posted_date_jsonld: string | null;
  valid_through_jsonld: string | null;
  base_salary_jsonld: Record<string, any> | null;
  employment_type_jsonld: string | null;
  job_summary_text: string | null;
  min_qualification: string | null;
  experience_level: string | null;
  experience_length: string | null;
  language_requirement: string | null;
  working_hours: string | null;
  applicant_location: string | null;
  salary_raw?: string | null;
  description_html: string;
  description_text: string;
}
