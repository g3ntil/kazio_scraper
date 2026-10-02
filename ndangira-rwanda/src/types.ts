export interface ListingSummary {
  external_id: string;
  source_url: string;
  title_raw: string;
  title_clean: string;
  deadline_raw?: string;
}

export interface RawNdangiraJob {
  external_id: string;
  source_url: string;
  category: string;
  title_raw: string;
  title_clean: string;
  company_name: string | null;
  location_raw: string | null;
  deadline_raw: string | null;
  deadline_date: string | null;
  posted_date_raw: string | null;
  posted_date: string | null;
  views_count: number | null;
  image_url: string | null;
  description_html: string | null;
  description_text: string | null;
  apply_url: string | null;
  scraped_at: string;
}
