# Kazio Scraper Admin — Universal Agent Context Window & Blueprint

**Target System:** Kazio Scraper & Ingestion Pipeline Admin  
**Location:** `scraper/job-scraper-rwanda/`  
**Supabase Project ID:** `ndjvazyeykrzkqlipwbs` (`jobify`)  
**Design Reference:** `scraper/revolution/kazio-scraper-admin (1).html`  
**Data Specification:** `scraper/revolution/dashboard-data-sources.md`  

---

## 1. Role & Mandate for Autonomous Specialist Agents

You are an autonomous frontend/full-stack engineer assigned by the Orchestrator to build and verify a specific page or feature of the Kazio Scraper Admin.

### Core Principles
1. **MANDATORY PRECAUTION: SCRAPER PRESERVATION & SCHEMA LOCK**:
   - **Extra Caution Around Real Scrapers**: The scraping engines, Cheerio selectors, regex parsers, and detail extraction routines took intensive engineering to build and tune across all 5 Rwandan job portals. You must be **EXTRA CAUTIOUS** when touching or operating around the real scraper code.
   - **Do NOT Alter Scraper Functionality**: Under no circumstances should any agent alter or break core scraper logic, DOM parsing, network headers, or pagination. Only UI, dashboards, monitoring, diagnostics, filters, and presentations may be upgraded.
   - **SYSTEMATIC SCHEMA LOCK**: **DO NOT TOUCH OR ALTER THE DATABASE SCHEMA**. Do not modify table definitions, change column names, alter constraints, or run schema migrations on Supabase. The staging tables (`raw_*`, `jobs_*`) and central `jobs` table are locked.
2. **Faithful Reproduction of Inspiration**: Replicate the exact visual hierarchy, card layouts, table densities, badges, progress bars, and interactions demonstrated in `kazio-scraper-admin (1).html`.
3. **Kazio Brand Alignment**:
   - **Border Radius**: Strictly uniform `8px` (`rounded-lg` or `border-radius: 8px`) across all cards, buttons, dialogs, chips, and inputs.
   - **Color System**: Warm Paper background (`#fbf9f5` / `--bg`), Deep Ink (`#442a22` / `--text`), Warm Clay (`#725a39` / `--text-secondary`), Sage (`#293417` / `--accent`), and clear semantic colors (Green `#16813d`, Amber `#a5690c`, Red `#ba1a1a`).
   - **Typography**: Headings use `Public Sans` (`font-sans`), body and labels use `Manrope` (`font-body`), tabular metrics use monospace (`font-mono` / `mono`).
4. **Real Data First**: Use the shared data service (`src/services/dataService.ts`) and global context (`useDashboard()`). Never mock data if a live PostgREST query or RPC is available.
5. **Resilience**: Every RPC or optional table (e.g. `admin_cron_overview`, `admin_near_duplicates`, `scrape_runs`) must handle missing/null responses gracefully with fallbacks.
6. **Completion Notice**: When your page/feature is implemented, you must run live build tests (`npm run lint`, `npm run build`), verify that data renders cleanly, and output a standardized Completion Notice.

---

## 2. Shared Data Architecture & Context

All pages have access to the global dashboard state via:
```tsx
import { useDashboard } from '../context/DashboardContext';

export default function MyPage() {
  const { 
    data,              // Live aggregate totals, source metrics, key capacity, trends
    loading,           // Global data fetching state
    error,             // Global error state if queries fail
    refreshAll,        // Trigger full reload of aggregate stats
    setActivePage,     // Switch between pages ('overview' | 'sources' | 'jobs' | ...)
    openJobDrawer      // Open deep job inspection drawer for a given job ID
  } = useDashboard();
  ...
}
```

### Key Derived Buckets Available in `data`:
- `data.totals`:
  - `jobs`, `active`, `done`, `failed`, `pending`, `processing`, `skipped`, `atCap`, `enrichedActive`, `noDeadlineActive`, `expiredActive`, `dupsActive`, `stuck`, `newToday`
- `data.sources[sourceId]`: (`jobinrwanda`, `brightermonday`, `ndangira`, `greatrwandajobs`, `jobwebrwanda`)
  - `jobs`: `total`, `active`, `enriched`, `pending`, `failed`, `skipped`, `dups`, `expired`, `atCap`, `lastScraped`
  - `raw`: `total`, `pending`, `failed`, `done`, `skipped`, `promoted`, `tender`, `lastSeen`
  - `health`: `lvl` (`'ok'` | `'warn'` | `'bad'`), `label`, `errorRate`, `hoursSinceScrape`
- `data.capacity`:
  - `g`: array of active Gemini keys
  - `rpd`: total daily call capacity
  - `rpm`: combined RPM
  - `used`: total calls made today
  - `usable`: number of non-blocked active keys
  - `awaiting`: total jobs/staging rows pending or failed
  - `daysToClear`: floating days to clear queue
- `data.fill`:
  - 15 field completeness percentages: `deadline`, `salary`, `industry`, `job_function`, `skills_t1`, `min_degree`, `experience`, `job_type`, `ai_summary`, `languages`, `local_company`, `company_description`, `company_logo`, `contact_emails`, `apply_contact`
- `data.errors`:
  - Classification of extraction errors: `pool`, `429`, `503`, `short`, `other` with counts and percentages
- `data.trends`:
  - 7-day ingestion history array: `[{ day: 'YYYY-MM-DD', count: N }, ...]`

---

## 3. Database Schema & Query Cheatsheet

### 1. `public.jobs` (Central table, 655+ rows)
- Attribution: String match on `job_url`:
  - `job_url ILIKE '%jobinrwanda%'` ➔ `jobinrwanda`
  - `job_url ILIKE '%brightermonday%'` ➔ `brightermonday`
  - `job_url ILIKE '%ndangira%'` ➔ `ndangira`
  - `job_url ILIKE '%greatrwandajobs%'` ➔ `greatrwandajobs`
  - `job_url ILIKE '%jobwebrwanda%'` ➔ `jobwebrwanda`
- Key Columns:
  - `id`, `job_url`, `title`, `company`, `location`, `deadline`, `is_active`
  - `extraction_status` (`pending`, `processing`, `done`, `failed`, `skipped`)
  - `extraction_error`, `extraction_attempts`, `processing_started_at`
  - `industry`, `job_function`, `skills_t1`, `min_degree`, `experience_level_new`, `job_type_new`
  - `ai_summary`, `company_description`, `company_logo_url`, `contact_emails`
  - `salary_min`, `salary_max`, `deadline_source`, `duplicate_of_job_id`, `scraped_at`

### 2. Staging Tables
| Source | Table Name | Key Columns |
|---|---|---|
| BrighterMonday | `raw_brightermonday_jobs` | `external_id`, `title`, `company_name`, `valid_through_jsonld`, `extraction_status`, `extraction_error`, `promoted_job_id`, `last_seen_at` |
| Ndangira | `raw_ndangira_jobs` | `id`, `title_clean`, `company_name`, `deadline_date`, `extraction_status`, `extraction_error`, `is_duplicate`, `promoted_job_id`, `last_seen_at` |
| Great Rwanda Jobs | `jobs_greatrwandajobs` | `id`, `title`, `company`, `deadline`, `extraction_status`, `extraction_error`, `promoted_job_id` (No timestamp column) |
| Job in Rwanda | `raw_jobinrwanda_jobs` | `id`, `title`, `company`, `deadline`, `extraction_status`, `extraction_error`, `scraped_at`, `promoted_job_id` |
| JobWeb Rwanda | `jobs_jobwebrwanda` | `id`, `title`, `company`, `deadline` (No extraction_status column) |

### 3. AI Keys (`gemini_keys`)
- Columns: `id`, `provider`, `status`, `active`, `last_used_at`, `fail_count`, `rpm_limit`, `rpd_limit`, `requests_today`, `day_window_start`, `rpm_blocked_until`, `rpd_blocked_until`
- **Security Rule**: NEVER select or log `api_key` in the frontend.

### 4. Live RPCs & Edge Functions
- `rpc/admin_cron_overview()`: Returns live pg_cron schedule & status
- `rpc/admin_near_duplicates(p_threshold)`: Near-duplicate detector
- `rpc/admin_set_cron_active(p_jobid, p_active)`: Toggle cron jobs
- Edge Function `ai-job-extractor`: Trigger manual extraction batch

---

## 4. Work Package Matrix & Responsibilities

### **Agent 1: Overview Page (`src/pages/OverviewPage.tsx`)**
- **Elements to Build:**
  - Hero statistics banner (`T.jobs` total, active, enriched, pending, failed)
  - Run monitor gauge with status chip (`idle`, `running`, `done`), animated progress bar, and operation notes
  - 4 key stat cards: New jobs today, Awaiting AI, Skipped by gates, Critical alerts (24h)
  - 5-source summary strip showing status, health pill, and ingestion path
  - Activity log terminal feed (merging cron jobs, alerts, recent scrape writes)
  - 7-day ingestion trend bar/line chart
  - AI capacity mini panel with daily quota bar
  - "Needs attention" dynamically computed issue cards (critical/warning/info)

### **Agent 2: Sources Hub (`src/pages/SourcesPage.tsx`)**
- **Elements to Build:**
  - 5 source tabs (`Job in Rwanda`, `BrighterMonday`, `Ndangira`, `Great Rwanda Jobs`, `JobWeb Rwanda`)
  - Source health banner & pipeline gap notice
  - Source metrics grid: In staging, In jobs, Live, Enriched, Pending, Failed, At retry cap, Skipped, Duplicates, Expired
  - Progress bar for enrichment percentage + "Last scrape activity X ago"
  - Cachable source notes box
  - Sub-navigation tabs: "In jobs table" vs "Staging"
  - Paginated data table with search, sorting, and row detail trigger
  - Action buttons: "Scrape now" (calls backend endpoint) and "Extract pending" (triggers edge function)

### **Agent 3: Jobs Explorer (`src/pages/JobsExplorerPage.tsx`)**
- **Elements to Build:**
  - Search bar (`title` OR `company`)
  - Filter dropdowns: Source (5 sources + Manual/other), Status (`done`, `failed`, `pending`, `processing`, `skipped`), Quick-filter (Active, Unenriched, At retry cap, No deadline, Expired, Duplicate)
  - Paginated data table (25 rows/page) with total count badge
  - Enrichment preview pill in row (industry + function + skill count or "live · not enriched")
  - Row click interaction opening the universal `JobDrawer`

### **Agent 4: Extraction Queue (`src/pages/QueuePage.tsx`)**
- **Elements to Build:**
  - Top metric cards: Jobs pending, Processing (with stuck alert), Jobs failed (with retry cap), Staging pending, Staging failed, Skipped
  - Queue by table breakdown table (`jobs` + 4 staging tables) showing status counts and draining cron/worker
  - "Why extractions fail" error categorization bars (API key pool exhausted, Rate limited 429, Model overloaded 503, Short description, Other)
  - Action controls panel: "Run extraction now" button, "Reset transient errors" button, "Skip staged tenders" button
  - Throughput projection card showing daily capacity, queue drain time estimate, and drip pace

### **Agent 5: AI Keys & Capacity (`src/pages/KeysPage.tsx`)**
- **Elements to Build:**
  - Capacity metrics: Active keys, Configured RPD capacity, Used today, OpenRouter fallback, Alerts (24h)
  - Keys table displaying ID, provider, status chip (usable, cooling down, daily limit, disabled), requests today / RPD limit progress bar, last used, fail count
  - Actions per key: Enable/Disable toggle, Clear cooldown block, Reset daily counter
  - "Add new key" modal/drawer
  - Rotation architecture explanation panel

### **Agent 6: Automation & Crons (`src/pages/AutomationPage.tsx`)**
- **Elements to Build:**
  - Scheduled jobs table (from `admin_cron_overview` RPC) displaying job name, schedule, active state, last run, 24h runs/failures
  - Pause/resume toggle calling `admin_set_cron_active`
  - "Run maintenance function now" panel with triggers for `deactivate_expired_jobs`, `flag_duplicate_jobs`, `retry_failed_staging_rows`, `retry_failed_jobs`
  - Pipeline triggers inventory table
  - Deployed edge functions reference table

### **Agent 7: Data Quality & Vocabulary (`src/pages/DataQualityPage.tsx`)**
- **Elements to Build:**
  - 15 field-completeness progress bars showing percentage of active jobs with populated data
  - Near-duplicates detection panel (from `admin_near_duplicates` RPC) with similarity percentage and merge actions
  - Deadline source breakdown (source field vs AI inferred vs missing)
  - Industry and job-function distribution charts
  - Skill vocabulary manager: approved vs unapproved count, most-used unapproved terms list with one-click "Approve" button

### **Agent 8: Alerts & Incidents (`src/pages/AlertsPage.tsx`)**
- **Elements to Build:**
  - Stat cards: Total alerts, Last 24h count, Bursts count, Latest event time
  - 30-minute burst clustering view
  - Event log table from `ops_alert_events`: timestamp, severity badge (critical, warning, info), code, message, and detail payload viewer

### **Agent 9: Stats & Analytics (`src/pages/StatsPage.tsx`)**
- **Elements to Build:**
  - 7-day ingestion history chart
  - Top industries bar distribution
  - Top job functions distribution
  - Extraction failure breakdown by category
  - Source health verdict matrix (Source, Last scrape, In jobs count, Error rate %, Health verdict badge)

### **Agent 10: Scraper Engine & Parallel Runner (`server.ts`)**
- **Elements to Build:**
  - Parallel scrape endpoint: `POST /api/scrape/all` using `Promise.allSettled()` across all 5 sites
  - Server-Sent Events (SSE) progress streaming: `GET /api/scrape/events`
  - Scraper run persistence: insert run metrics into `scrape_runs` table upon completion
  - Ensure individual detail extraction routines remain robust and non-blocking

---

## 5. Standardized Completion Notice Format

Every agent MUST output this exact completion notice upon finishing its assigned task:

```markdown
### [AGENT COMPLETION NOTICE]
- **Agent Role**: [e.g., Agent 1: Overview Page]
- **Target Files Modified / Created**:
  - `src/pages/OverviewPage.tsx`
  - ...
- **Live Test Verification Results**:
  - Build Check: `npm run lint` / `npm run build` -> [PASSED / FAILED]
  - Live Data Query Check -> [e.g., Successfully loaded 655 jobs, 5 sources, 5 keys]
  - UI Interactivity Check -> [e.g., Tested gauge toggle, card hover lifts, drawer opening]
- **Key Features Implemented**:
  - [Bullet 1]
  - [Bullet 2]
- **Status**: READY FOR ORCHESTRATOR INTEGRATION
```
