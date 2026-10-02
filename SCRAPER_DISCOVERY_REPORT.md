# Kazio Scraper Codebase Discovery & Technical Audit Report

**Date:** September 18, 2026  
**Target System:** Kazio / Jobify Ingestion Pipeline (`scraper/`)  
**Supabase Project:** `ndjvazyeykrzkqlipwbs` (name: `jobify`)

---

## Executive Summary

The scraper codebase is divided into two distinct implementations:
1. **Integrated Web App & API (`scraper/job-scraper-rwanda`)**: A full-stack Express + Vite + React application (`server.ts` + `src/App.tsx`) that contains HTTP-based scraping endpoints for **all 5 Rwandan job portals** (`jobinrwanda.com`, `brightermonday.co.rw`, `ndangira.com`, `greatrwandajobs.com`, and `jobwebrwanda.com`), alongside in-browser Supabase diffing and synchronization.
2. **Standalone CLI Scripts (`scraper/brightermonday-rwanda` & `scraper/ndangira-rwanda`)**: Isolated Node.js batch scripts that scrape their respective targets (BrighterMonday using Playwright headless browser; Ndangira using static HTML `fetch`) and write directly to Supabase via CLI invocations.

Currently, the web UI's "Scrape All" function iterates through the 5 portals **strictly sequentially** in a hardcoded frontend `for` loop, without parallel execution or unified structured reporting.

---

## 1. Runtime & Structure

| Question | Findings from Codebase Inspection |
|---|---|
| **Language & Runtime** | **TypeScript / Node.js** (ES Modules, Node 18+ / 20+). Uses `tsx` for execution. |
| **Code Location & Architecture** | <ul><li>**All-in-one Server & UI**: `scraper/job-scraper-rwanda/server.ts` (Express backend) and `scraper/job-scraper-rwanda/src/App.tsx` (React frontend).</li><li>**Standalone CLI 1**: `scraper/brightermonday-rwanda/src/index.ts` (Playwright + Cheerio).</li><li>**Standalone CLI 2**: `scraper/ndangira-rwanda/src/index.ts` (Fetch + Cheerio).</li></ul> |
| **Execution Trigger** | **Manual execution only**. There are no cron jobs, GitHub Actions workflows, or Supabase `pg_cron` schedules in the repository. Runs when a developer executes `npm run dev` in `scraper/job-scraper-rwanda` (or `npm start` in the CLI directories). |
| **Why it runs "one by one"** | In `job-scraper-rwanda/src/App.tsx` (`startScrapeAllSources`), execution is governed by a synchronous `for (let i = 0; i < SOURCES.length; i++)` loop that awaits `scrapeSingleSource()` for each portal before proceeding to the next. |
| **Current Full Run Entry Point** | Run `npm run dev` in `scraper/job-scraper-rwanda`, open `http://localhost:3000`, and click **"Run Unified Scraper"**, followed by **"Sync to Supabase"**. |

---

## 2. Per-Site Scraping Logic

| Site Portal | Source URL & Target Table | Extraction Engine | Pagination & Stopping Rules | Anti-Bot & Rate Limits | Deduplication & DB Upsert Key |
|---|---|---|---|---|---|
| **Job in Rwanda** | `jobinrwanda.com/jobs/all`<br>➔ `raw_jobinrwanda_jobs` | `fetch` + Regex parser / DOM cleaner in `server.ts` | **No pagination** (scrapes page 1 `/jobs/all` only). | Static Chrome `User-Agent`. No delays or proxies. | In-memory URL `Set`. Upsert conflict key: `job_url`. |
| **BrighterMonday** | `brightermonday.co.rw/jobs`<br>➔ `raw_brightermonday_jobs` | `server.ts`: `fetch` + `cheerio` + JSON-LD.<br>*CLI*: Playwright headless browser. | **5 pages max** in `server.ts` (`/jobs?page=N`). Stops early if a page returns 0 cards.<br>*CLI*: up to 37 pages. | Static `User-Agent`. CLI checks `robots.txt` and applies 500ms delay. | Slug ID extracted as `external_id`. Upsert conflict key: `external_id`. |
| **Ndangira** | `ndangira.com/jobs`<br>➔ `raw_ndangira_jobs` | `fetch` + `cheerio` HTML parser. | **No pagination** (scrapes `/jobs` single feed only). | Static `User-Agent`. CLI checks `robots.txt` and applies 300ms delay. | Numeric ID extracted from slug (`-(\d+)/?$`) as `external_id`. Upsert conflict key: `external_id`. |
| **Great Rwanda Jobs** | `greatrwandajobs.com/`<br>➔ `jobs_greatrwandajobs` | `fetch` + HTML string slicing & regex. | **Up to 30 pages** (`pagenum=N`). Halts if 0 new jobs on page or if 3 consecutive pages have 0 active jobs. | Static `User-Agent`. No proxies. | In-memory URL `Set`. Upsert conflict key: `job_url`. |
| **JobWeb Rwanda** | `jobwebrwanda.com/`<br>➔ `jobs_jobwebrwanda` | `fetch` + `cheerio` + JSON-LD fallback. | **Up to 30 pages** (`/page/N/?s...`). Halts when 0 job blocks are returned or on network error. | Static `User-Agent`. No proxies. | In-memory URL `Set`. Upsert conflict key: `job_url`. |

### Status of `jobs_jobwebrwanda`
- **Confirmed**: `jobwebrwanda.com` is **actively scraped** in `server.ts` and included in the frontend `SOURCES` array.
- **Schema Discrepancy**: While `raw_brightermonday_jobs`, `raw_ndangira_jobs`, and `raw_jobinrwanda_jobs` have `extraction_status` (`pending`, `done`, `failed`), `promoted_job_id`, `first_seen_at`, and `last_seen_at`, table `jobs_jobwebrwanda` is structured as a legacy direct table (like `jobs_greatrwandajobs`) and does not participate in the standard raw-staging promotion tracking columns.

---

## 3. Error Handling & Logging Today

1. **Individual Listing Failures**:
   - In `App.tsx`, if fetching a listing's detail fails (`POST /api/scrape/.../details`), it marks `status: 'failed'` in the frontend React state and continues the batch without throwing.
2. **Site-Wide Feed Failures**:
   - If a portal's list endpoint fails (e.g. HTTP 500 or timeout), `server.ts` returns an error payload.
   - `App.tsx` catches the error, logs a string (`❌ Failed scraping ${source.name}`) into the UI terminal log box, and moves directly to the next site.
3. **Log Persistence**:
   - **No persistent logging exists**. Failures are output to `console.error` and stored in an in-memory React state array (`logs`, capped at 60 lines). All logs are lost upon browser reload.
4. **Usage of `extraction_error`**:
   - **The scraper does NOT populate `extraction_error`**.
   - Scraper insertions initialize rows with `extraction_status: 'pending'`. The `extraction_error` column is populated exclusively by subsequent AI-extraction Supabase Edge Functions (`extract-job`, `process-job`, `ai-job-extractor`).

---

## 4. Current UI

- **Location**: `scraper/job-scraper-rwanda/src/App.tsx` (React 19 + Tailwind CSS + Lucide Icons).
- **Current Flow & Display**:
  - Provides a single-select dropdown or a "Run Unified Scraper" button.
  - Queries Supabase via client-side JavaScript (`Promise.all` across 6 tables) to compute a diff (`in_supabase: true/false`).
  - Displays filtered views: "New Only", "Clean In-Supabase", "Cleaned Active", "Duplicates", "Expired", "Invalid".
  - Requires a second manual action ("Sync to Supabase") to push the scraped data into the DB.
- **Shortcoming**: It lacks a unified dashboard report showing high-level run metrics (Total Scraped, Genuinely New, Already in Staging, Already Extracted to `public.jobs`, Failed by Portal, Duration, and actionable Error Breakdowns).

---

## 5. Constraints & Architectural Readiness for Rebuild

1. **Parallel / Concurrent Execution**:
   - **100% Safe to run in parallel**: All 5 scrapers in `job-scraper-rwanda/server.ts` use lightweight Node `fetch` and Cheerio (no heavy Playwright browser instances inside `server.ts`).
   - Because each scraper targets a completely different domain, running all 5 simultaneously via `Promise.allSettled()` will not trigger rate limits across sites and will drastically reduce total execution time (from ~2–3 minutes down to ~15–30 seconds).
2. **Database Write Concurrency**:
   - Each site routes to its own staging table (`raw_jobinrwanda_jobs`, `raw_brightermonday_jobs`, `raw_ndangira_jobs`, `jobs_greatrwandajobs`, `jobs_jobwebrwanda`). There are zero table write contention locks.
3. **Authentication & Hosting Context**:
   - Currently a standalone admin developer tool. Runs locally or on internal dev servers with direct Supabase environment credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 6. Open Questions & Items for User Clarification

Before building the consolidated "Scrape All" engine and report UI, please confirm:

1. **`jobs_jobwebrwanda` & `jobs_greatrwandajobs` Schema Alignment**:
   - Would you like us to migrate/align `jobs_jobwebrwanda` and `jobs_greatrwandajobs` to have the same `raw_*` standard columns (`extraction_status`, `promoted_job_id`, `extraction_error`, `first_seen_at`, `last_seen_at`) as the other 3 tables, or keep their existing schemas intact?
2. **Auto-Sync vs. Review-Then-Sync**:
   - Should "Scrape All" automatically persist new raw jobs into Supabase upon completion and immediately display the summary report, or should it run in staging mode with an explicit "Confirm & Push to Supabase" button?
3. **Downstream AI Extraction Trigger**:
   - After the scraper identifies genuinely new jobs and saves them to raw staging tables, should the new UI provide an option to immediately trigger the AI promotion Edge Functions (`extract-job` / `ai-job-extractor`), or should extraction remain decoupled?
4. **Standalone CLI Directories**:
   - Should `scraper/brightermonday-rwanda` and `scraper/ndangira-rwanda` be archived/deprecated in favor of the consolidated `job-scraper-rwanda` codebase?
