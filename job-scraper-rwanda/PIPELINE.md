# Scrape & sync

Open the local dashboard at http://127.0.0.1:3000 and select **Scrape & sync**.

1. Choose 1–30 seconds between job pages (default: 2 seconds).
2. Click **Scrape all 4 websites**. Each website shows listing discovery, detail-page progress, ready descriptions, and failures. The server continues when you leave the page.
3. Click **Sync all to Supabase**. Complete jobs are inserted into their existing raw/staging tables. Existing rows retain their extraction state. Incomplete descriptions stay in the local buffer.
4. The new-jobs table shows confirmed inserts and polls their actual extraction status and errors. Each source sync requests `ai-job-extractor` immediately, using a server-only internal credential. Existing Supabase scheduled batches and retries continue processing the queue.

JobWeb Rwanda is excluded by user request, including its direct scraping endpoints. No database schema changes were made. Great Rwanda Jobs uses its existing `jobs_greatrwandajobs` staging table; the other enabled sources use `raw_*` tables.

Completed scrape buffers and the inserted-job ledger are checkpointed to ignored `output/pipeline-session.json`. Browser refreshes reconnect to server progress. After a server restart, unfinished runs are marked for review; start a new scrape to finish them. This is a local single-server workflow, not a distributed worker queue.

Detail requests have a 60-second timeout and up to three attempts with backoff. Readiness requires at least 100 characters of description text. This catches empty/loading/placeholder responses; it is not a guarantee that every posting is factually complete. Ndangira supports both the older markup and the observed October 2026 `.nd-content` layout. Current listing slugs are used as IDs because their trailing numbers are deadline years, not unique post IDs.

## Verification

- TypeScript check and production build passed.
- Pipeline and local-admin tests: 9 passed. Existing content-filter tests: 11 passed. Deadline tests: 7 passed.
- Live sample: two jobs per enabled source (8 complete detail pages). The normal button has no sample limit and processes every discovered listing under each existing pagination policy.
- Browser verification: desktop and 390px mobile, running-state controls, actual Sync All click, and new-job status display.
- Supabase verification: six new rows were inserted; all six reached `done` and were independently verified in the main `jobs` table. Automatic extractor calls and scheduled retries recovered temporary Gemini 503 failures. Existing rows were not reinserted during the repeated sync.

Run tests from this directory with `node --import tsx --test server/__tests__/*.test.ts`, `node job-batch-filter.test.mjs`, and `node submission-deadline.test.mjs`. Use `npm run lint` and `npm run build` for checks. Start the app with `npm run dev`.

## Quality recovery — 31 October 2026

Follow-up: listing discovery now retries network errors, HTTP 408/429 and 5xx up to three attempts with backoff; permanent HTTP errors stop immediately. All 14 regression tests, TypeScript and production build passed. Overview no longer claims all sources are synchronized while idle, and source insert counters are explicitly labelled cumulative.

Deployed `ai-job-extractor` version 14 with explicit application destinations (fraud/reporting emails are rejected), null for unsupported education requirements, no default required English, and deduplicated locations. The two records identified in the dashboard audit were corrected in place. No schema changes were required or made; JWT verification remains enabled.

Queue controls now surface capacity/row errors, include Job in Rwanda in totals and source choices, and exclude JobWeb Rwanda's historical records from the pending queue. Data Quality describes completed extraction without claiming semantic accuracy.

Validation: 13 regression tests passed, TypeScript check passed, production build passed (existing large-bundle warning). Live retry after clearing both Gemini cooldowns produced two new extracted jobs with version 14: Business Intelligence Manager and Lead, Gates Foundation Partnerships. Their stored descriptions contain the reported degree terms and their application destinations point to source pages.

Provider capacity is still blocked: key 10 returned billing/prepayment HTTP 402; key 11 completed two calls then returned daily-quota HTTP 429 and was blocked until the next provider reset. Increasing a local dashboard quota does not increase the provider's allowance. Another full scrape was not run during this recovery; the previous 448-listing collection/sync audit remains the full-run evidence. Pending extraction cannot be declared complete until funded/available provider capacity is confirmed. Missing source deadlines and editorial boilerplate are not fabricated or automatically rewritten by these changes.
