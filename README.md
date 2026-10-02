# Kazio Job Scrapers Index

> [!CAUTION]
> ### CRITICAL PRECAUTION RULE FOR ALL DEVELOPERS & AGENTS:
> **Extra Caution Around Real Scrapers**: The scraping engines and DOM parsers across Rwandan job portals took extensive effort to build, tune, and calibrate.
> - **DO NOT ALTER SCRAPER FUNCTIONALITY**: Do not change core scraping mechanisms, Cheerio/regex selectors, pagination rules, or rate limits. Only the UI, dashboards, analytics, and diagnostics should be enhanced.
> - **SYSTEMATIC SCHEMA LOCK**: **DO NOT TOUCH OR ALTER THE DATABASE SCHEMA**. Do not modify table structures, alter columns, or change types in Supabase. The schema feeding `raw_*` and `jobs` tables is strictly locked.

This directory contains the web scrapers powering Kazio's job ingestion pipeline.

## Available Scrapers

| Scraper Directory | Target Website | Architecture / Tech | Destination Table |
|---|---|---|---|
| [`job-scraper-rwanda`](./job-scraper-rwanda) | JobWebRwanda & General Rwanda Job Feeds | React / Node + Gemini AI Extractor | `jobs` |
| [`brightermonday-rwanda`](./brightermonday-rwanda) | BrighterMonday Rwanda (`brightermonday.co.rw/jobs`) | Node.js + Playwright + Cheerio + JSON-LD | `raw_brightermonday_jobs` |
| [`ndangira-rwanda`](./ndangira-rwanda) | Ndangira Rwanda (`ndangira.com/jobs`) | Node.js + Cheerio (Static HTML) | `raw_ndangira_jobs` |

---

## 1. BrighterMonday Rwanda Scraper (`brightermonday-rwanda`)

- **Target URL**: `https://www.brightermonday.co.rw/jobs`
- **Output Table**: `public.raw_brightermonday_jobs`
- **Primary Features**:
  - Client-side pagination handling with Playwright headless browser.
  - JSON-LD `schema.org/JobPosting` metadata extraction (`datePosted`, `validThrough`, `baseSalary`, `employmentType`).
  - Separation of teaser `job_summary_text` and main `description_html` / `description_text`.
  - Automatic filtering to ignore broken "Similar jobs" site-wide lorem-ipsum block.
  - Upsert on `external_id`.
- **Run command**:
  ```bash
  cd scraper/brightermonday-rwanda
  npm install
  npm start
  ```

---

## 2. JobWebRwanda / Rwanda Job Scraper (`job-scraper-rwanda`)

- **Target URL**: `https://jobwebrwanda.com`
- **Output Table**: `public.jobs`
- **Run command**:
  ```bash
  cd scraper/job-scraper-rwanda
  npm install
  npm run dev
  ```

---

## 3. Dashboard Observability & Visualization Toolkit

- **Visualization Inspiration Catalog**: [`DASHBOARD_VISUALIZATION_INSPIRATION.md`](./DASHBOARD_VISUALIZATION_INSPIRATION.md) (Curated benchmarks from Grafana, Tremor Raw, Datadog, Vercel, and Monte Carlo Data Observability).
- **Reusable Visualization Components**: [`job-scraper-rwanda/src/components/visualization/`](./job-scraper-rwanda/src/components/visualization/) (`Sparkline`, `GaugeMeter`, `PipelineStageFlow`, `TelemetryAreaChart`, `DataFreshnessMeter`, `StatusPulseBadge`, `MetricKpiCard`).
- **Antigravity Visualization Skill**: [`.agents/skills/scraper-dashboard-viz/SKILL.md`](../.agents/skills/scraper-dashboard-viz/SKILL.md).

