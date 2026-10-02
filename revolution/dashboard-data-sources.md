# Kazio Scraper Admin — Field-by-Field Data Source Reference

**Purpose of this document:** every stat, table column, chart, badge and chip shown in the dashboard (`kazio-scraper-admin.html`), mapped to the exact Supabase table/column/RPC it comes from (or flagged as computed client-side, or flagged as static hardcoded text). Built by reading the actual `kazio-scraper-admin.html` source line by line and cross-checking every table/column/RPC name against the live schema of Supabase project `ndjvazyeykrzkqlipwbs` (name: `jobify`). Nothing here is guessed.

**How to use this doc:** Sections 1–3 are the foundation — read them first. Sections 4–12 are one per dashboard page, and every field in them refers back to a variable name from Section 2/3 rather than re-deriving it, so the logic is defined exactly once.

---

## 1. The 3 states of a value in this dashboard

Every field on this dashboard is one of three kinds. Getting this distinction wrong is the most likely way to build a broken or misleading rebuild:

| Kind | Meaning | Example |
|---|---|---|
| **A — Direct column** | Read straight from one Supabase table/column, no computation. | `gemini_keys.rpm_limit` |
| **B — Derived** | Computed by looping over rows already fetched for kind A (counting, summing, grouping, percentage). Real, and reflects true live data — but is *not* itself a single column anywhere. This doc gives the exact rule, and an equivalent SQL query you can run instead if you'd rather compute it server-side. | "Enriched jobs" = count of active jobs where `industry` is not null |
| **C — Static/curated** | Hardcoded text written by a human (or a prior analysis) into the JS. **Never updates automatically, ever** — not on refresh, not live. If you rebuild this as live-only, you must explicitly decide to either keep these as static config or turn them into real queries. | The 4 "Findings the automated gates miss" bullet points on the Data Quality page; every bullet under "What we know about this source" on the Sources page; the entire Triggers and Edge Functions tables on the Automation page |

---

## 2. Core data fetches (Kind A — the foundation)

These are the only network requests the dashboard makes. Every Kind-B derived value in Section 3 is computed from the results of these. All are plain PostgREST REST calls (`GET {SUPABASE_URL}/rest/v1/...`) except the 3 explicitly marked RPC.

| # | What it loads | Table / endpoint | Columns selected (`select=`) | Notes |
|---|---|---|---|---|
| 1 | Every job, for aggregate stats | `jobs` | `id,job_url,extraction_status,extraction_error,extraction_attempts,is_active,content_type,skip_reason,deadline,industry,job_function,skills_t1,min_degree,experience_level_new,job_type_new,ai_summary,company_description,company_logo_url,contact_emails,languages_required,is_local_company,apply_contact,salary_min,deadline_source,scraped_at,duplicate_of_job_id,processing_started_at` | Paginated internally 1000 rows at a time until exhausted (`fetchAll`). This one fetch feeds almost the entire Overview, Sources-page metrics, Data Quality, and Stats pages. Deliberately excludes `title`/`company`/`description` — too heavy for an aggregate pass. |
| 2 | AI key pool | `gemini_keys` | `id,provider,status,active,last_used_at,fail_count,rpm_limit,rpd_limit,requests_today,day_window_start,rpm_blocked_until,rpd_blocked_until` | Ordered by `id`. Powers the entire Keys page + capacity math used on Overview/Queue. **`api_key` is never selected** — the key value never reaches the browser after being written. |
| 3 | Alert log | `ops_alert_events` | `*` | `order=created_at.desc&limit=200`. Powers the Alerts page + the "critical alerts" stat + issue list. |
| 4 | BrighterMonday staging | `raw_brightermonday_jobs` | `extraction_status,extraction_error,content_type,promoted_job_id,last_seen_at` | Used only for aggregate counts (Sources-page "In staging" numbers, Queue table). The Sources-page *row table* for this source does a **separate** fetch with more columns (see §2b). |
| 5 | Ndangira staging | `raw_ndangira_jobs` | `extraction_status,extraction_error,promoted_job_id,last_seen_at,is_duplicate` | Same pattern as #4. |
| 6 | Great Rwanda Jobs staging | `jobs_greatrwandajobs` | `extraction_status,extraction_error,content_type,promoted_job_id` | No timestamp column exists on this table — "last scraped" cannot be computed for it from this fetch. |
| 7 | Job in Rwanda staging | `raw_jobinrwanda_jobs` | `extraction_status,extraction_error,promoted_job_id,scraped_at,content_type` | This staging table is **not read by any extraction process** — it's dead data (see §12 caveats). |
| 8 | JobWeb Rwanda staging | `jobs_jobwebrwanda` | `deadline` | Only `deadline` — this table has no `extraction_status`, no timestamp, nothing else usable. |
| 9 | Skill vocabulary counts | `skill_vocabulary` | count only, twice: once with no filter, once with `is_approved=eq.true` | Uses `Prefer: count=exact` + `Range: 0-0` (a HEAD-style count, no rows returned). |
| 10 | Downstream readiness | `users`, `match_scores`, `generated_cvs`, `salary_benchmarks` | count only (same technique as #9), one call per table | Purely a "is anything downstream ready" indicator. |
| 11 | Cron overview | **RPC** `rpc/admin_cron_overview` | POST, empty body `{}` | Returns `jobid, jobname, schedule, active, last_run, runs_24h, failed_24h` per cron job (exact return shape depends on how you define the function — the dashboard reads `name`/`jobid`/`active`/`last_run`/`runs_24h`/`failed_24h`/`schedule` off each returned row). Wrapped in `optional()` — if the RPC doesn't exist, the dashboard silently falls back to a static list (see §12). |
| 12 | Near-duplicate detector | **RPC** `rpc/admin_near_duplicates` | POST, body `{p_threshold: 0.7}` | Returns pairs of similar active jobs. Dashboard only reads `.length` (count) and the first 6 rows. Wrapped in `optional()`. |
| 13 | Scrape-run log probe | `scrape_runs` | `select=*&order=started_at.desc&limit=20` | **This table does not exist yet.** Wrapped in `optional()` — the probe fails, `hasRunsTable` becomes `false`, and the "no scrape-run log" info banner shows instead. If you create this table and have your scraper write to it, the Overview activity log will automatically start showing real per-run entries. |
| 14 | Unapproved skill terms | `skill_vocabulary` | `select=skill,canonical,usage_count&is_approved=eq.false&order=usage_count.desc&limit=12` | Loaded only when the Data Quality page is open and the dashboard is in live mode — not part of the main load. |

### 2b. Separate, on-demand fetches (not part of the aggregate load)

These run only when their specific view is opened — they do **not** feed the aggregate `T`/`fill`/`dist` numbers.

| What | Table | Columns | When |
|---|---|---|---|
| Jobs Explorer table rows (paginated) | `jobs` | `id,title,company,location,deadline,job_url,extraction_status,extraction_error,extraction_attempts,is_active,content_type,skip_reason,industry,job_function,experience_level_new,job_type_new,min_degree,salary_min,salary_max,deadline_source,scraped_at,duplicate_of_job_id,skills_t1` | Every time the Jobs Explorer page loads or its filters/search/sort/page change. `limit`/`offset` set per page (25 rows/page), `Prefer: count=exact` so total count is known without a second query. |
| Sources-page "In jobs table" tab rows | `jobs` | same as above | Filtered additionally by `job_url=ilike.*{sourceMatchString}*` |
| Sources-page "Staging" tab rows | per-source staging table | see §7 staging column list | Uses the exact `select`/`order`/search-column list defined per source in `STG` (§7) |
| Row drawer "Extracted fields" detail | `jobs` | `ai_summary,description,skills_t1,skills_t2,skills_t3,languages_required,contact_emails,apply_method,apply_contact,company_description,dedup_key,salary_is_estimated,published_on` | Only when a `jobs`-table row is clicked open, filtered to `id=eq.{that row's id}` |

---

## 3. Derived values (Kind B) — computed once per aggregate load

All of these are computed in a single pass over the **fetch #1** `jobs` rows (plus a second pass over the staging fetches #4–8), in a function called `aggregateLive()`. Below is each derived bucket, the rule, and an equivalent SQL query if you'd rather do this in Postgres instead of in JS (recommended for a rebuild — much less data over the wire).

### 3a. `T` — dashboard-wide totals

| Field | Rule (over all `jobs` rows) | Equivalent SQL |
|---|---|---|
| `T.jobs` | count of all rows | `select count(*) from jobs` |
| `T.active` | `is_active = true` | `... where is_active` |
| `T.done` / `T.failed` / `T.pending` / `T.processing` / `T.skipped` | count grouped by `extraction_status` | `select extraction_status, count(*) from jobs group by 1` |
| `T.atCap` | `extraction_status='failed' AND extraction_attempts >= 3` | `... where extraction_status='failed' and extraction_attempts>=3` |
| `T.enrichedActive` | `is_active=true AND industry IS NOT NULL` | `... where is_active and industry is not null` |
| `T.noDeadlineActive` | `is_active=true AND deadline IS NULL` | `... where is_active and deadline is null` |
| `T.expiredActive` | `is_active=true AND deadline < today` | `... where is_active and deadline < current_date` |
| `T.dupsActive` | `is_active=true AND duplicate_of_job_id IS NOT NULL` | `... where is_active and duplicate_of_job_id is not null` |
| `T.stuck` | `extraction_status='processing' AND now() - processing_started_at > 5 minutes` | `... where extraction_status='processing' and now()-processing_started_at > interval '5 min'` |
| `T.newToday` | `scraped_at::date = current_date` (UTC) | `... where scraped_at::date = current_date` |
| `T.other` | rows whose `job_url` matches none of the 5 known source domains (see §3c) | needs the same string-match logic in SQL |

### 3b. `fill` — field-completeness (Data Quality "Field completeness" panel)

Denominator for every row below is **`T.active`** (only active/live jobs count). Rule for each: count of active jobs where the column is non-null / non-empty.

| Field | Column checked | "populated" means |
|---|---|---|
| `fill.deadline` | `deadline` | not null |
| `fill.salary` | `salary_min` | not null |
| `fill.industry` | `industry` | not null |
| `fill.job_function` | `job_function` | not null |
| `fill.skills_t1` | `skills_t1` | array not null and length > 0 |
| `fill.min_degree` | `min_degree` | not null |
| `fill.experience` | `experience_level_new` | not null |
| `fill.job_type` | `job_type_new` | not null |
| `fill.ai_summary` | `ai_summary` | not null |
| `fill.languages` | `languages_required` | array not null and length > 0 |
| `fill.local_company` | `is_local_company` | not null (boolean, so `false` counts as filled) |
| `fill.company_description` | `company_description` | not null |
| `fill.company_logo` | `company_logo_url` | not null |
| `fill.contact_emails` | `contact_emails` | array not null and length > 0 |
| `fill.apply_contact` | `apply_contact` | not null |

SQL for any one row, e.g. industry: `select count(*) filter (where industry is not null) as filled, count(*) as active from jobs where is_active`

### 3c. Per-source attribution — `srcOfUrl()`

**There is no foreign key or source column on `jobs`.** Every "which source is this job from" computation is a **string match on `job_url`**:

```
jobinrwanda      → job_url contains "jobinrwanda"
brightermonday   → job_url contains "brightermonday"
ndangira         → job_url contains "ndangira"
greatrwandajobs  → job_url contains "greatrwandajobs"
jobwebrwanda     → job_url contains "jobwebrwanda"
(none match)     → "other" (manual/test rows)
```
SQL equivalent for one source: `... where job_url ilike '%brightermonday%'`

Every per-source number on the Sources page, the Overview source strip, and the Stats/health table is `T`-style aggregation (§3a rules) run **again, separately, per source**, using this filter. That means for 5 sources you're effectively running the §3a aggregation 6 times (once overall, once per source) — in SQL this is one `GROUP BY` with a `CASE WHEN job_url ILIKE ...` expression instead of 6 round trips.

### 3d. Per-source **staging** numbers (`src[id].raw`)

Computed the same way, but from the staging fetches (§2 #4–8), grouped by `extraction_status`:

| Field | Rule |
|---|---|
| `raw.total` | row count |
| `raw.pending` / `raw.failed` / `raw.done` | `extraction_status = 'pending'/'failed'/'done'` |
| `raw.skipped` | `extraction_status` starts with `'skipped'` (covers `skipped_expired`, `skipped_tender`, etc.) |
| `raw.promoted` | `promoted_job_id IS NOT NULL` |
| `raw.tender` | `content_type IN ('tender','paid_program')` |
| `raw.lastSeen` | `MAX(last_seen_at)`, falling back to `MAX(scraped_at)` where `last_seen_at` doesn't exist on that table |
| `raw.newestDeadline` / `raw.past` (JobWeb Rwanda only) | `MAX(deadline)`, and count where `deadline < today` |

### 3e. Failure-reason classification — `errClass()`

**This is regex pattern matching on `extraction_error` text, not a status column.** Run once over every `failed` row in both `jobs` and every staging table, combined into one list:

| Bucket | Regex (case-insensitive) applied to `extraction_error` |
|---|---|
| `pool` — "All keys exhausted or cooling down" | `/all keys\|no active api key\|over their daily/` |
| `429` — "Gemini 429 — rate / quota limited" | `/429\|rate\|quota/` |
| `503` — "Gemini 503 — model overloaded" | `/50[234]\|overload\|high demand\|unavailable/` |
| `short` — "Description missing or too short" | `/too short\|missing/` |
| `other` — everything else | (no match) |

This is what populates the "Failed extractions — by reason" panel on Stats, "Why extractions fail" on Queue, and the count on the Overview issues list. **A rebuild should replicate the regex exactly** or the categories will disagree with what's actually in the data.

### 3f. `dist` — industry / job-function distribution

Group-by count of `industry` / `job_function` over **active jobs only**, sorted descending, job-function list capped to top 8.
SQL: `select industry, count(*) from jobs where is_active and industry is not null group by 1 order by 2 desc`

### 3g. `dl` — deadline source breakdown

Group-by count of `deadline_source` over active jobs, bucketed into exactly 3: `source_field`, `ai`, and "none recorded" (anything else, including null).

### 3h. 7-day trend chart data

Group `jobs.scraped_at::date` by day for the last 7 days (including today), count per day. Used identically by the Overview and Stats page charts (same underlying `trend` array, rendered twice).
SQL: `select scraped_at::date as day, count(*) from jobs where scraped_at >= current_date - interval '6 days' group by 1 order by 1`

### 3i. Capacity math (`capacity()`) — powers Overview/Queue/Keys "AI calls" numbers

All computed from the `gemini_keys` rows already fetched (§2 #2) — no extra query:

| Field | Rule |
|---|---|
| Active Gemini key set (`g`) | `provider='gemini' AND active=true AND status='active'` |
| `rpd` (daily capacity) | `SUM(rpd_limit)` over that set |
| `rpm` (combined RPM) | `SUM(rpm_limit)` over that set |
| `used` (calls today) | for each key, `requests_today` **only if** `day_window_start::date = today` (otherwise treated as 0 — the window hasn't reset in the row yet), summed |
| `usable` | count of keys in `g` that are not currently blocked (`rpm_blocked_until` or `rpd_blocked_until` in the future) |
| `awaiting` | `T.pending + T.processing + T.failed` (from `jobs`) **plus** `pending + failed` summed across every staging table — this is a deliberate over-count where the same posting can be mid-pipeline in two places at once; documented on-screen as an upper bound |
| Days to clear | `awaiting / rpd` |

### 3j. Source health verdict — `srcHealth()`

Not stored anywhere — computed per source, per render:
```
if source has no pipeline at all           → "No pipeline" (bad)
else let errorRate = failed / (done+failed)
     let hoursSinceLastScrape = now - lastScrape
if errorRate > 50%                          → "Extraction failing" (bad)
else if hoursSinceLastScrape > 24            → "Stale" (warn)
else if errorRate > 10%                      → "Errors" (warn)
else                                          → "Healthy" (ok)
```

### 3k. "Needs attention" list (`computeIssues()`)

Not a query — a fixed sequence of `if` checks over values already derived above (§3a–3j) plus the alert log (§2 #3), each producing zero or one issue card. There are 13 possible issues; they're generated fresh on every render, sorted critical → warning → info, and the Overview page shows the top 5 with a "show all" toggle. None of these 13 checks reads anything not already covered in §2/§3 above — see §4 for the exact list and thresholds if you need to reproduce this logic 1:1.

---

## 4. Overview page

| Field / element | DOM id | Source | Notes |
|---|---|---|---|
| Page description line | `#ovDesc` | mode + `asOf` timestamp | "Live data" or "Snapshot", plus the load timestamp |
| Snapshot-mode banner | `#modeBanner` | UI state only | Only shown when not connected live |
| **Needs attention** card | `#attnCard` | §3k | Up to 13 dynamically-generated issue cards |
| **Jobs in database** hero number | `#heroJobs` | `T.jobs`, `T.active`, `T.enrichedActive`, `T.done`, `T.pending`+`T.processing`, `T.failed`, `T.skipped` | All from §3a |
| **Run monitor** gauge | `#gaugeFill`/`#gaugeStatus`/`#gaugeNote` | UI-only | Reflects an in-browser operation (a scrape/extract/RPC call in progress), not a database value at all |
| New jobs today | stat card | `T.newToday` | §3a |
| Awaiting AI | stat card | `capacity().awaiting` | §3i |
| AI calls today | stat card | `capacity().used` / `capacity().rpd`, plus `usable`/`g.length` | §3i |
| Skipped by gates | stat card | `D.src.greatrwandajobs.raw.skipped + T.skipped + sum of every source's jobs.dups` | §3d + §3a |
| Sources healthy | stat card | count of sources where `srcHealth().lvl === 'ok'` out of 5 | §3j |
| Critical alerts (24h) | stat card | count of `ops_alert_events` rows where `created_at` within last 24h | §2 #3 |
| **Sources** strip (5 cards) | `#sourceStrip` | per source: `jobs.total`, `raw.total`, `jobs.enriched`/`jobs.active` (progress %), `srcHealth()` | §3c, §3d, §3j. The "ingestion path" text under each name (e.g. "Playwright → raw_brightermonday_jobs → AI → jobs") is **Kind C — static**, from `SRC[].path` |
| **activity.log** terminal panel | `#termBody` | synthesized, not a table | Merges: each cron job's last-run status (§7), alert bursts (§9), each source's latest staging write time (§3d `raw.lastSeen`), each `scrape_runs` row if that table exists (§2 #13), and each Gemini key's `last_used_at`. Sorted by time, last 16 shown. **Not a log table** — if you want a real persistent activity log, build the `scrape_runs` table and have your scraper write to it. |
| **Rows added to jobs, last 7 days** chart | `#chartHost1` | §3h | Same data feeds the Stats-page chart |
| **AI capacity** mini panel | `#capacityMini` | `capacity()` | §3i |

---

## 5. Sources page (one tab per source — 5 tabs)

Everything below repeats identically for each of the 5 sources; only the underlying filter (§3c) changes.

| Field | Source |
|---|---|
| Pipeline-gap banners | `SRC[id].noPipeline` / `SRC[id].extractor` (Kind C, static config) combined with live `raw.pending` count (§3d) |
| "In staging" metric | `raw.total` (§3d) — subtitle shows the real staging table name (Kind C) |
| "In jobs" metric | `jobs.total` (§3c) |
| "Live" metric | `jobs.active` (§3c) — subtitle: `is_active = true` |
| "Enriched" metric | `jobs.enriched` of `jobs.active` (§3c/§3a `enrichedActive` rule, scoped to this source) |
| "Pending" metric | `jobs.pending + jobs.processing`, subtitle shows staging `raw.pending` |
| "Failed" metric | `jobs.failed` (§3a rule, scoped), subtitle shows staging `raw.failed` |
| "At retry cap" metric | `jobs.atCap` (§3a rule, scoped) |
| "Skipped" metric | `jobs.skipped + raw.skipped` |
| "Duplicates" metric | `jobs.dups` (§3a `duplicate_of_job_id` rule, scoped) |
| "Past deadline" metric | `jobs.expired` (§3a rule, scoped) |
| Progress bar + "Last scrape activity X ago" | `pc(jobs.enriched, jobs.active)`; timestamp = `raw.lastSeen` falling back to `jobs.lastScraped` (max `scraped_at` among this source's `jobs` rows) |
| **"What we know about this source"** notes box | **Kind C — fully static**, from `SRC[id].notes`. These are written observations (e.g. "0 of 241 staging rows have `is_duplicate` set") from a point-in-time manual analysis. **They will not update if the underlying numbers change.** If rebuilding, decide whether to keep this as editable static config or convert each bullet into a live-computed check. |
| Row table ("In jobs table" tab) | `jobs` filtered to `job_url ilike *{source}*`, columns = the Jobs Explorer column set (§2b) |
| Row table ("Staging" tab) | per-source staging table, using the exact column list and search columns below |

### Staging table column map (`STG`)

| Source | Table | Columns selected | Search columns | Default order |
|---|---|---|---|---|
| jobinrwanda | `raw_jobinrwanda_jobs` | `id,job_url,source_url,title,company,location,deadline,extraction_status,extraction_error,scraped_at,promoted_job_id,content_type` | `title, company` | `scraped_at desc` |
| brightermonday | `raw_brightermonday_jobs` | `external_id,source_url,title,company_name,location_raw,valid_through_jsonld,extraction_status,extraction_error,extraction_attempts,content_type,scraped_at,last_seen_at,promoted_job_id` | `title, company_name` | `last_seen_at desc` |
| ndangira | `raw_ndangira_jobs` | `id,source_url,title_raw,title_clean,company_name,location_raw,deadline_date,extraction_status,extraction_error,extraction_attempts,is_duplicate,scraped_at,last_seen_at,promoted_job_id` | `title_raw, company_name` | `last_seen_at desc` |
| greatrwandajobs | `jobs_greatrwandajobs` | `id,job_url,title,company,location,deadline,extraction_status,extraction_error,extraction_attempts,content_type,promoted_job_id` | `title, company` | `deadline desc nulls last` |
| jobwebrwanda | `jobs_jobwebrwanda` | `id,job_url,title,company,location,deadline` | `title, company` | `deadline desc nulls last` |

Note: `raw_brightermonday_jobs.description_html` is **deliberately never selected anywhere** in this dashboard — it's 25–79 KB per row.

---

## 6. Jobs Explorer page

| Field | Source |
|---|---|
| Row count in nav badge | `T.jobs` (§3a) |
| Table rows | `jobs` table, §2b column list, paginated 25/page |
| Source filter dropdown | maps to `job_url ilike *{match}*` (or the 5-way `not.ilike` combo for "Manual / test" = §3c "other") |
| Status filter dropdown | maps to `extraction_status=eq.{value}` |
| Quick-filter dropdown (Active / Unenriched / At retry cap / No deadline / Expired / Duplicate) | translates directly to the same predicates as §3a: `is_active=true`; `is_active=true AND industry IS NULL`; `extraction_status=failed AND extraction_attempts>=3`; `is_active=true AND deadline IS NULL`; `deadline < today`; `duplicate_of_job_id IS NOT NULL` |
| Search box | `title ilike *q* OR company ilike *q*` |
| "Enrichment" column | if `industry` present: shows industry + job_function + skills_t1 length; if active but no industry: "live · not enriched"; else blank |
| Row click → drawer | see §2b drawer detail fetch |

---

## 7. Extraction Queue page

| Field | Source |
|---|---|
| Jobs pending / Processing / Jobs failed | `T.pending`, `T.processing` (+ `T.stuck` subtitle), `T.failed` (+ `T.atCap` subtitle) — §3a |
| Staging pending / Staging failed | sum of `raw.pending` / `raw.failed` across brightermonday + ndangira + greatrwandajobs only (jobinrwanda and jobwebrwanda excluded — nothing drains them) — §3d |
| Skipped | `T.skipped` + sum of every source's `raw.skipped` |
| **Queue by table** rows | one row per table (`jobs` + the 4 staging tables), each showing pending/processing/failed/atCap/done/skipped from §3a/§3d, plus a **Kind C static** "Drained by" description of which cron/function processes that table |
| **Why extractions fail** | same `D.errors` list as §3e, rendered as bars |
| **Controls** panel | not data display — buttons that call: `ai-job-extractor` edge function (POST), `rpc/retry_failed_jobs`, a bulk `PATCH ... extraction_attempts=0` filtered to transient-error rows, and a bulk `PATCH raw_brightermonday_jobs ... extraction_status='skipped_tender'` for tender rows |
| **Throughput** panel | `capacity()` numbers again (§3i) — daily capacity, awaiting count, estimated days to clear, and static text describing the drip pace (`ai-job-extractor-drip` ≤ 6 rows/3 min, `retry-failed-jobs-drip` ≤ 5 rows/2 min — Kind C, from the cron descriptions) |

---

## 8. AI Keys & Capacity page

| Field | Source |
|---|---|
| Active Gemini keys / Configured capacity / Used today / OpenRouter fallback / Alerts (24h) | all from `gemini_keys` (§2 #2) via `capacity()` (§3i), except OpenRouter count which is `provider='openrouter' AND active=true` count, and Alerts(24h) which is `ops_alert_events` (§2 #3) |
| Key table — every column | **direct from `gemini_keys`**: `id`, `provider`, computed state chip (see below), `requests_today`/`rpd_limit` as a progress bar, `rpm_limit` (labelled "not enforced" — see caveats §12), `last_used_at`, `fail_count` |
| State chip logic | `!active` → "disabled"; `status != 'active'` → shows raw status; blocked (`rpm_blocked_until`/`rpd_blocked_until` in future) → "cooling down"; `requests_today >= rpd_limit` → "daily limit"; else → "usable" |
| "How rotation works today" text block | **Kind C — fully static**, written from reading the deployed `process-job` / `ai-job-extractor` edge function source code, not from any table |

---

## 9. Automation page

| Field | Source |
|---|---|
| **Scheduled jobs** table | Baseline is a **Kind C static list of the 5 known jobs** (`ai-job-extractor-drip`, `deactivate-expired-jobs`, `flag-duplicate-jobs`, `retry-failed-staging-rows`, `retry-failed-jobs-drip`) with their `id`/`schedule`/description hardcoded. **If connected live and `rpc/admin_cron_overview` exists**, each row's `active`/`last_run`/`runs_24h`/`failed_24h`/`schedule` is overwritten with the live value matched by job name or id (§2 #11). If the RPC doesn't exist, the whole table silently stays on the static snapshot numbers with no visual warning beyond a banner. |
| Pause/resume toggle | calls `rpc/admin_set_cron_active(p_jobid, p_active)` — only enabled when `admin_cron_overview` succeeded (`cronLive`), otherwise locked |
| **Run a maintenance function now** panel | Kind C static list of 4 functions (`deactivate_expired_jobs`, `flag_duplicate_jobs`, `retry_failed_staging_rows`, `retry_failed_jobs`) with hardcoded labels/descriptions/argument defaults; the "Run" button calls `rpc/{fn}` with whatever values are in the number inputs |
| **Triggers on the jobs pipeline** table | **Kind C — fully static**, 5 hardcoded rows describing `trg_a_normalize_job_row`, `trg_enforce_tender_salary_null`, `trg_jobs_invoke_process_job`, `trg_clean_brightermonday_description`, `trg_sync_raw_brightermonday_to_jobs`. Not queried from `information_schema.triggers` at runtime — if a trigger is added/removed/renamed in the database, this table will not reflect it until someone edits the JS. |
| **Edge functions** table | **Kind C — fully static**, 11 hardcoded rows (function name, version, JWT-verification flag, role, description). Supabase's edge-function list isn't reachable through the PostgREST/anon-key surface this dashboard uses, so this was captured once via the Supabase management API/CLI and pasted in. Same staleness caveat as Triggers. |

---

## 10. Data Quality page

| Field | Source |
|---|---|
| **Field completeness** bars (15 rows) | `fill.*` / `T.active` — §3b |
| **Findings the automated gates miss** | Mixed: the near-duplicate-pairs bullet uses live `admin_near_duplicates` count (§2 #12) when available; **the other 4 bullets are Kind C — fully static text** (two extraction paths disagreeing on salary/degree defaults; salary benchmarks hardcoded in code vs the `salary_benchmarks` table; raw HTML entities in `jobs_jobwebrwanda` titles; an Expression-of-Interest posting mistyped as `content_type='job'`). These do not re-check themselves — they were true as of one manual read of the data and are not guaranteed to still be true. |
| **Where deadlines come from** | `dl.source_field` / `dl.ai` / `dl.none` — §3g |
| **By industry** / **By job function** | `dist.industry` / `dist.fn` — §3f |
| **Skill vocabulary** panel | `vocab.total` / `vocab.approved` — `skill_vocabulary` counts (§2 #9); the "most-used unapproved terms" list loads on demand (§2 #14) |
| **Downstream readiness** | `users` / `match_scores` / `generated_cvs` / `salary_benchmarks` row counts — §2 #10 |

---

## 11. Alerts page

| Field | Source |
|---|---|
| Total alerts / Last 24h / Bursts / Latest | all computed from the `ops_alert_events` rows already fetched (§2 #3) |
| **Burst** clustering | Kind B — not a query. Sort alerts by time; any two alerts less than **30 minutes apart** are merged into the same burst; each burst's `n` = how many alerts it absorbed |
| **All events** table | direct columns from `ops_alert_events`: `created_at`, `severity`, `code`, `message`, and `detail` (read from the `metrics` jsonb column's `detail` key) |

---

## 12. Stats & Health page

| Field | Source |
|---|---|
| **Failed extractions — by reason** | identical `D.errors` list as §3e / §7 |
| **Health table** — Last scrape | `raw.lastSeen` falling back to `jobs.lastScraped`, per source — §3d/§3c |
| **Health table** — In jobs | `jobs.total` per source |
| **Health table** — Extraction errors | `jobs.failed / (jobs.done + jobs.failed)` as a percentage, per source |
| **Health table** — Status | `srcHealth()` — §3j |
| **Rows added to jobs, last 7 days** chart | identical to the Overview chart — §3h |

---

## 13. Sidebar / chrome (not a page, but always visible)

| Element | Source |
|---|---|
| "Sources" nav count | static `5` |
| "Jobs explorer" nav count | `T.jobs` |
| "Extraction queue" badge | `T.failed` (hidden when 0) |
| "AI keys" badge | shows "0 usable" only when `capacity().usable === 0` |
| "Alerts" badge + bell dot | count of `ops_alert_events` in last 24h (hidden when 0) |
| "Stats & health" badge | count of sources whose `srcHealth().lvl !== 'ok'` (hidden when 0) |
| Connection pill (Snapshot/Live) | in-browser connection state, not a table |
| Sidebar health dot + text | same bad-source count as the Stats badge, 3-tier: 0 bad = green, 1–2 = amber, 3+ = red |

---

## 14. Everything that writes to Supabase (for completeness — not display fields, but every button's exact effect)

| Action | Effect |
|---|---|
| "Scrape now" / "Scrape all" | POSTs to a **user-configured webhook URL** per source (n8n or your scraper's own endpoint) — nothing in Supabase is touched directly; this is just a trigger |
| "Extract pending" / "Run extraction" | POSTs to the `ai-job-extractor` edge function (`{source, limit}` or `{limit}`) |
| "Retry now" (queue) | `rpc/retry_failed_jobs(p_max_attempts, p_limit)` |
| "Reset jobs table" / "Reset staging tables" | bulk `PATCH` setting `extraction_attempts=0` on failed rows whose `extraction_error` matches a transient-error pattern (429/503/quota/rate/limit/timeout/overload), and (for `jobs`) that aren't expired or duplicate |
| "Skip staged tenders" | bulk `PATCH raw_brightermonday_jobs` → `extraction_status='skipped_tender'` where `content_type in (tender,paid_program)` and status is pending/failed |
| Drawer "Requeue extraction" | `PATCH` that row → `extraction_status='pending', extraction_error=null, extraction_attempts=0` (+ `processing_started_at=null` if it's a `jobs` row) |
| Drawer "Activate"/"Deactivate" | `PATCH jobs.is_active` |
| Keys page "Disable/Enable" | `PATCH gemini_keys` → toggles `active`+`status` |
| Keys page "Clear block" | `PATCH gemini_keys` → nulls `rpm_blocked_until`/`rpd_blocked_until` |
| Keys page "Reset counter" | `PATCH gemini_keys` → `requests_today=0, day_window_start=now()` |
| "Add key" | `POST gemini_keys` with the new key + provider + limits |
| Automation cron toggle | `rpc/admin_set_cron_active(p_jobid, p_active)` |
| Automation "Run now" (maintenance fn) | `rpc/{deactivate_expired_jobs \| flag_duplicate_jobs \| retry_failed_staging_rows \| retry_failed_jobs}` |
| Data Quality "Approve" (vocab term) | `PATCH skill_vocabulary` → `is_approved=true` |

---

## 15. Known gotchas an AI coder must not trip over

1. **`jobs` has no source column.** Attribution is a `job_url ILIKE` string match (§3c). If you add a 6th source, you must add it to that match list everywhere it appears, or its jobs silently fall into "other."
2. **Two different `jobs` column sets are used in two different places** — the aggregate load (§2 #1) and the Jobs Explorer table (§2b) select different (overlapping but not identical) columns. Don't assume one fetch can replace the other.
3. **`greatrwandajobs`'s staging table has no timestamp column at all.** "Last scraped" for this source can only ever come from `MAX(jobs.scraped_at)` among its promoted rows — never from staging.
4. **`jobwebrwanda` has no pipeline.** Its staging table has no `extraction_status` column, and nothing promotes its rows into `jobs`. Every "extracted/failed/pending" stat for it should show as unavailable, not zero.
5. **`raw_jobinrwanda_jobs` is dead weight** — nothing reads it. The real `jobinrwanda` jobs are inserted directly into `jobs` by a process outside Supabase, then picked up by a trigger.
6. **`requests_this_minute` / per-key RPM is not actually enforced anywhere** — only the daily counter (`requests_today`) is real. Don't build a rate-limit visualization implying RPM is tracked live.
7. **The 4 static "findings" and all of Triggers/Edge-Functions/Source-notes (Kind C) will drift from reality over time.** Either keep them as an explicitly-labelled "as of {date}" reference, or replace them with real `information_schema` queries if you want them live.
8. **`scrape_runs` doesn't exist yet.** The whole Overview activity log is a best-effort reconstruction from other tables until that table is created and your scraper writes to it.
9. **The near-duplicate and cron-overview RPCs are optional** — always code the "RPC missing" fallback path, don't assume they exist on every environment this dashboard might be pointed at.
10. **`api_key` on `gemini_keys` is never selected, anywhere.** Keep it that way in a rebuild — it's the one column on that table that must never reach the browser after being written once.
