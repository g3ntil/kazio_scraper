# Ndangira.com Rwanda Job Scraper (`ndangira-rwanda`)

A high-performance static HTML web scraper for `ndangira.com` job opportunities in Rwanda.

## Features

- **Static HTML Fetching**: Blazingly fast standard HTTP fetches using `cheerio` (no Playwright needed).
- **Robots.txt Validation**: Automatic pre-flight verification against `https://ndangira.com/robots.txt`.
- **Field Extraction**:
  - `external_id`: Unique numeric suffix extracted from URL slug.
  - `title_raw` & `title_clean`: Normalized job titles with deadline suffixes stripped.
  - `company_name`: Employer name from page metadata block.
  - `location_raw`: Job location/city.
  - `deadline_raw` & `deadline_date`: Formatted deadline string & ISO date.
  - `posted_date_raw` & `posted_date`: Posting date metadata.
  - `views_count`: Public view metrics.
  - `apply_url`: Outbound employer application URL.
  - `description_html` & `description_text`: Complete job description body.
- **Supabase Integration**: Streamed upserts to `public.raw_ndangira_jobs`.

## Usage

```bash
# Dry run test (5 items, no database writes)
npm run scrape:dry

# Production run (Full scrape and stream-upsert to Supabase)
npm start
```
