# Kazio Scraper Admin — Complete Agent Prompt Pack

> [!CAUTION]
> ### MANDATORY PRECAUTION RULE FOR ALL LAUNCHED AGENTS:
> 1. **Extra Caution Around the Real Scraper**: The real scraping and extraction engine across all 5 Rwandan job portals took tremendous time, precision, and effort to build and tune. All agents must be **EXTRA CAUTIOUS** when working around the scraper code.
> 2. **Never Alter Scraper Functionality**: Do not change, refactor, or break core scraping mechanisms, Cheerio/regex selectors, network headers, or pagination. Only UI, dashboards, monitoring, diagnostics, filters, and presentations may be upgraded.
> 3. **Systematic Schema Lock**: **DO NOT TOUCH OR ALTER THE DATABASE SCHEMA**. Do not modify table definitions, change column names, alter constraints, or run schema migrations on Supabase. The schema feeding staging tables (`raw_*`, `jobs_*`) and central `jobs` table is strictly locked.

This file contains the complete, self-contained deployment prompts for all 10 specialized feature agents. Each prompt provides total context, schema references, file targets, UI design requirements, and verification criteria.

---

## Agent 1: Overview & Ingestion Monitor
```markdown
You are Agent 1: Overview & Ingestion Monitor.
Your objective is to complete `src/pages/OverviewPage.tsx` for the Kazio Scraper Admin.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 4).
- Design must follow `scraper/revolution/kazio-scraper-admin (1).html` and Kazio brand rules (8px radius, Warm Paper background, Deep Ink text, Public Sans headings, Manrope body).
- Use `useDashboard()` from `src/context/DashboardContext.tsx`.

Features to implement:
1. Dynamic Issues & Alerts Banner:
   - Render `data.issues` dynamically sorted critical -> warning -> info.
   - Each card displays severity chip, title, description, and an action button navigating to the relevant page (e.g., `keys`, `queue`, `sources`).
2. Central Database Hero Number:
   - `data.totals.jobs` formatted with comma separator.
   - Subtitle: `data.totals.active` active listings.
   - Breakdown strip: Enriched (`data.totals.enrichedActive`), Pending (`data.totals.pending`), Processing (`data.totals.processing`), Failed (`data.totals.failed`), Skipped (`data.totals.skipped`).
3. Run Monitor Gauge:
   - Visual track and animated fill bar.
   - Status chip (`idle` | `running` | `done`).
   - Real-time status text and "Run Scraper Now" button invoking `triggerScrapeAll()`.
4. 4 Metric Cards:
   - New Jobs Today (`data.totals.newToday`).
   - Awaiting AI (`data.capacity.awaiting`) + days to clear estimate (`data.capacity.daysToClear`).
   - AI Calls Used (`data.capacity.used` / `data.capacity.rpd`) + usable keys count.
   - Skipped by Gates (`data.totals.skipped`).
5. 5-Source Summary Strip:
   - Card per source: Name, Staging Table name, Jobs total, Staging total, Enriched %, Health verdict badge (`ok`, `warn`, `bad`), Ingestion path text.
   - Clicking a source switches to that source tab on the Sources page.
6. 7-Day Ingestion Trend Chart:
   - SVG or CSS bar chart rendering `data.trends` (last 7 days).
   - Hover tooltips showing exact row counts.
7. Terminal Activity Log:
   - Realtime terminal window showing recent ingestion, cron, and staging events with color-coded tags.

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Confirm all metrics bind to live Supabase data.
- Output the standardized Completion Notice.
```

---

## Agent 2: Sources Hub & Staging Explorer
```markdown
You are Agent 2: Sources Hub & Staging Explorer.
Your objective is to complete `src/pages/SourcesPage.tsx` for the Kazio Scraper Admin.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 5).
- Match design in `scraper/revolution/kazio-scraper-admin (1).html` (Section 5).
- Use `useDashboard()` from `src/context/DashboardContext.tsx`.

Features to implement:
1. Source Navigation Tabs:
   - 5 source tabs (`Job in Rwanda`, `BrighterMonday`, `Ndangira`, `Great Rwanda Jobs`, `JobWeb Rwanda`).
   - Badge showing total jobs per source.
2. Source Diagnostics & Metrics Grid (10 cards):
   - In Staging (`raw.total`), In Jobs (`jobs.total`), Live (`jobs.active`), Enriched (`jobs.enriched`), Pending (`jobs.pending` + `raw.pending`), Failed (`jobs.failed` + `raw.failed`), At Retry Cap (`jobs.atCap`), Skipped (`jobs.skipped` + `raw.skipped`), Duplicates (`jobs.dups`), Expired (`jobs.expired`).
3. Health Banner & Pipeline Gap Warning:
   - If `source.noPipeline` is true (JobWeb Rwanda), show pipeline gap notice explaining that rows accumulate in staging but are unlinked from AI extraction.
4. "What We Know About This Source" Notes Box:
   - Curated technical observations per source (pagination limits, deduplication keys, quirks).
5. Two View Tabs: "In Jobs Table" vs "Staging Table":
   - "In Jobs Table": Queries `jobs` filtered by `job_url ILIKE '%{domain}%'`.
   - "Staging Table": Queries the source's actual staging table (`raw_brightermonday_jobs`, `raw_ndangira_jobs`, `jobs_greatrwandajobs`, `raw_jobinrwanda_jobs`, `jobs_jobwebrwanda`).
   - Paginated table with search input, sorting, and external link.
   - Row click on Jobs table opens `JobDrawer`.
6. Scraper Trigger:
   - "Scrape Now" button invoking `triggerSingleScrape(activeSourceTab)`.

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Verify switching between all 5 source tabs and both view tabs.
- Output the standardized Completion Notice.
```

---

## Agent 3: Jobs Explorer & Deep Inspection Drawer
```markdown
You are Agent 3: Jobs Explorer & Deep Inspection Drawer.
Your objective is to polish `src/pages/JobsExplorerPage.tsx` and `src/components/layout/JobDrawer.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 6).
- Use `fetchJobsExplorer()` and `fetchJobDetail()` from `src/services/dataService.ts`.

Features to implement:
1. Search & Multi-Filter Bar:
   - Live debounced text search matching `title` OR `company`.
   - Source dropdown: All Sources, Job in Rwanda, BrighterMonday, Ndangira, Great Rwanda Jobs, JobWeb Rwanda, Manual/Other.
   - Status dropdown: All, Done, Pending, Processing, Failed, Skipped.
   - Quick Filter dropdown: Active Only, Active & Unenriched, At Retry Cap (>=3), Missing Deadline, Expired Deadline, Flagged Duplicate.
2. Paginated Jobs Table (25 rows/page):
   - Columns: ID, Title, Company, Status chip, Enrichment tags (Industry + Job Function or "live · not enriched"), Deadline, External link.
   - Row click opens `JobDrawer`.
   - Pagination controls: Page indicator, Prev/Next buttons, jump to page.
3. Slide-over JobDrawer:
   - Header with ID, title, company, location, deadline.
   - Tabs: "AI Enriched Fields", "Description Text", "Raw JSON Record".
   - AI Enriched tab shows: Status chip, error alert if failed, AI companion summary, metadata grid (industry, job function, experience, job type), Tier 1 skills pills, external link.
   - Action buttons: "Requeue Extraction" (updates status to 'pending', attempts to 0), "Activate/Deactivate Job" (toggles `is_active`).

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Test filter changes, search input, and drawer opening.
- Output the standardized Completion Notice.
```

---

## Agent 4: Extraction Queue & AI Controls
```markdown
You are Agent 4: Extraction Queue & AI Controls.
Your objective is to complete `src/pages/QueuePage.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 7).

Features to implement:
1. Queue Metric Cards:
   - Jobs Pending (`totals.pending`), Processing (`totals.processing` with stuck count), Jobs Failed (`totals.failed` with retry cap count), Staging Pending, Staging Failed, Total Awaiting (`capacity.awaiting`).
2. Queue Breakdown by Table:
   - Table rows for: `public.jobs`, `raw_brightermonday_jobs`, `raw_ndangira_jobs`, `jobs_greatrwandajobs`, `raw_jobinrwanda_jobs`, `jobs_jobwebrwanda`.
   - Columns: Table Name, Pending, Processing, Failed, At Cap, Done, Skipped, Drained By (describing the worker/cron).
3. "Why Extractions Fail" Error Breakdown:
   - Category bars matching regex: API key pool exhausted, Rate limited 429, Model overloaded 503, Short description, Other.
4. Operational Controls:
   - "Trigger AI Extractor Batch" button (invokes `ai-job-extractor` edge function).
   - "Reset Transient 429/503 Errors" button (bulk PATCH resetting `extraction_attempts = 0` and `extraction_status = 'pending'`).
   - "Mark Staged Tenders as Skipped" button (bulk PATCH on `raw_brightermonday_jobs`).
5. Throughput Projection:
   - Displays daily capacity, queue drain time estimate, and cron drip rates.

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Test control buttons with live feedback messages.
- Output the standardized Completion Notice.
```

---

## Agent 5: AI Keys & Capacity Manager
```markdown
You are Agent 5: AI Keys & Capacity Manager.
Your objective is to complete `src/pages/KeysPage.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 8).
- Security rule: NEVER select or display `api_key` in the frontend.

Features to implement:
1. Capacity Summary Cards:
   - Active Gemini Keys, Configured Daily RPD, Requests Used Today, OpenRouter Fallback Count, Usable Keys.
2. Key Pool Table:
   - Columns: Key ID, Provider, Status chip (Usable, Cooling Down, Daily Limit, Disabled), Daily Usage progress bar (`requests_today` / `rpd_limit`), Last Used timestamp, Fail Count.
   - Actions per row:
     - Clear Cooldown Block (nulls `rpm_blocked_until` and `rpd_blocked_until`).
     - Reset Counter (zeros `requests_today` and sets `day_window_start` to now).
     - Toggle Active (enables/disables key).
3. "Add Key" Modal / Drawer:
   - Input form for Provider, API Key, RPM Limit, RPD Limit with secure write-only insertion.
4. Rotation Architecture Guide:
   - Static technical note explaining round-robin rotation, automatic backoff, and failover behavior.

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Test key toggle and counter reset.
- Output the standardized Completion Notice.
```

---

## Agent 6: Automation & Crons Center
```markdown
You are Agent 6: Automation & Crons Center.
Your objective is to complete `src/pages/AutomationPage.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 9).
- Uses `rpc/admin_cron_overview` and `rpc/admin_set_cron_active`.

Features to implement:
1. Scheduled Jobs Table:
   - Reads live from `admin_cron_overview()`.
   - Columns: Job Name, Schedule (cron format), Status pill, Last Run timestamp, Description.
   - Pause / Resume toggle calling `admin_set_cron_active(jobid, active)`.
2. Maintenance Function Triggers:
   - Action cards to invoke RPCs:
     - `deactivate_expired_jobs`
     - `flag_duplicate_jobs`
     - `retry_failed_staging_rows`
     - `retry_failed_jobs`
3. Pipeline Triggers Reference:
   - Table documenting database triggers (`trg_a_normalize_job_row`, `trg_enforce_tender_salary_null`, etc.).
4. Deployed Edge Functions Reference:
   - Table documenting active edge functions (`ai-job-extractor`, `process-job`, `pipeline-quality-check`, etc.).

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Verify live RPC responses from `admin_cron_overview`.
- Output the standardized Completion Notice.
```

---

## Agent 7: Data Quality & Vocabulary Studio
```markdown
You are Agent 7: Data Quality & Vocabulary Studio.
Your objective is to complete `src/pages/DataQualityPage.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 10).

Features to implement:
1. 15 Field Completeness Bars:
   - Percentage of active jobs with populated data for: deadline, salary, industry, job_function, skills_t1, min_degree, experience, job_type, ai_summary, languages, local_company, company_description, company_logo, contact_emails, apply_contact.
   - Color coded: green (>=80%), sage (>=40%), amber (<40%).
2. Deadline Origin Distribution:
   - Cards showing count of deadlines from Source Field vs AI Inferred vs Missing.
3. Near-Duplicates Detector:
   - Live query calling `rpc/admin_near_duplicates({ p_threshold: 0.7 })`.
   - Table displaying suspected duplicate pairs with similarity score and preview.
4. Skill Vocabulary Studio:
   - Total vocabulary count vs approved count from `skill_vocabulary`.
   - Most-used unapproved terms list with an "Approve" button that updates `is_approved = true`.

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Verify field completeness percentages render correctly against live active jobs.
- Output the standardized Completion Notice.
```

---

## Agent 8: Alerts & Incidents Center
```markdown
You are Agent 8: Alerts & Incidents Center.
Your objective is to complete `src/pages/AlertsPage.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 11).

Features to implement:
1. Incident Metrics:
   - Total Alerts, Alerts in Last 24h, Bursts Count, Latest Alert Time.
2. 30-Minute Burst Clustering:
   - Cluster alerts occurring within 30 minutes of each other into incident bursts.
   - Display burst timeline card with count of collapsed alerts.
3. All Events Table:
   - Queries `ops_alert_events` ordered by `created_at desc`.
   - Columns: Timestamp, Severity badge (critical, warning, info), Event Code, Message, and expandable JSON metric details.
   - Filter by severity dropdown.

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Test severity filtering and event detail expansion.
- Output the standardized Completion Notice.
```

---

## Agent 9: Stats & Health Matrix
```markdown
You are Agent 9: Stats & Health Matrix.
Your objective is to complete `src/pages/StatsPage.tsx`.

Context & Rules:
- Read `scraper/SHARED_AGENT_CONTEXT.md` and `scraper/revolution/dashboard-data-sources.md` (Section 12).

Features to implement:
1. Macro Ingestion Charts:
   - 7-day ingestion history chart with daily bars.
   - Top 10 industries in Rwanda distribution bars.
   - Top 8 job functions in Rwanda distribution bars.
2. Extraction Failures Breakdown:
   - Categorized error breakdown bars.
3. Source Reliability Matrix:
   - Table comparing all 5 sources: Portal Name, Jobs in Central DB, In Staging, Last Scrape timestamp, Error Rate %, Health Verdict badge (`Healthy`, `Stale`, `Errors`, `No pipeline`).

Verification Checklist:
- Run `npm run build` to verify zero TypeScript errors.
- Verify distribution bars calculate correctly from live active jobs.
- Output the standardized Completion Notice.
```

---

## Agent 10: Scraper Engine & Parallel Runner
```markdown
You are Agent 10: Scraper Engine & Parallel Runner.
Your objective is to enhance `server.ts` in `scraper/job-scraper-rwanda`.

Features to implement:
1. Parallel Execution Endpoint:
   - Implement `POST /api/scrape/all`: runs scrapers for all 5 portals concurrently using `Promise.allSettled()`.
   - Aggregates results: duration, total jobs scraped, breakdown per site.
2. Robust Error Handling:
   - Ensure a failure on one portal (e.g. timeout) does not interrupt or fail the other 4 portals.
3. Persistent Run Logging (`scrape_runs`):
   - If the `public.scrape_runs` table exists, record each run's start time, end time, portal, count of jobs found, and errors.
4. Server Verification:
   - Verify that all individual endpoints (`/api/scrape/list`, `/api/scrape/brightermonday/list`, `/api/scrape/ndangira/list`, `/api/scrape/greatrwandajobs/list`, `/api/scrape/jobwebrwanda/list`) remain operational.

Verification Checklist:
- Run test script against `POST /api/scrape/all`.
- Verify response format and error boundaries.
- Output the standardized Completion Notice.
```
