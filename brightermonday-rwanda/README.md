# BrighterMonday Rwanda Raw Scraper

Standalone web scraper service for **BrighterMonday Rwanda** (`brightermonday.co.rw/jobs`).
Parses raw listing cards and detail pages, extracting JSON-LD metadata and structured fields before batch upserting to Supabase table `raw_brightermonday_jobs`.

## Scraper Architecture

1. **Discovery Pass (Listing)**:
   - Uses Playwright to load page 1 (`https://www.brightermonday.co.rw/jobs`).
   - Paginate through listing pages (via Playwright UI navigation or direct requests).
2. **Detail Pass**:
   - Performs lightweight HTTP fetches per detail page (`/listings/{slug}-{id}`).
   - Extracts `schema.org/JobPosting` JSON-LD if present (`datePosted`, `validThrough`, `baseSalary`, `employmentType`).
   - Extracts structured summary fields (`min_qualification`, `experience_level`, `experience_length`, etc.).
   - Captures `job_summary_text` and raw `description_html` + plain text `description_text`.
   - **Explicitly skips** the site-wide broken "Similar jobs" lorem-ipsum section.
3. **Database Sink**:
   - Upserts into dedicated Supabase table `raw_brightermonday_jobs` on `external_id`.

## Quick Start

### Installation

```bash
npm install
npx playwright install chromium
```

### Configuration

Set up `.env` from template:

```bash
cp .env.example .env
```

Ensure `SUPABASE_URL` and `SUPABASE_KEY` are configured.

### Execution

- **Dry-run (5 items)**:
  ```bash
  npm run scrape:dry
  ```

- **Full Live Run**:
  ```bash
  npm start
  ```
