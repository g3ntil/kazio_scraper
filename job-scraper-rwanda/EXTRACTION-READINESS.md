# Prepare a scraped batch for AI extraction

Run `node prepare-extraction.mjs` while the scraper service is available on port 3000.
Run `node submission-deadline.test.mjs` to test the explicit tender deadline formats.

The preparation command saves an untouched timestamped cache snapshot and generates:

- `output/extraction-readiness/ready.json`: cleaned current job records for the four enabled sources.
- `output/extraction-readiness/held.json`: retained records with reasons for exclusion.
- `output/extraction-readiness/report.json`: counts and checks from that snapshot.

The command does not sync or invoke AI. The deployed AI cron runs every two minutes, so syncing pending rows may initiate extraction automatically.

Checks include title, company, source URL, unique URL within each source, substantive plain description text, deadline format, expiry, content type and whether detail enrichment has completed. Unknown deadlines remain null: they cannot safely be invented. These checks establish input readiness, not factual verification of every statement or final AI field completeness.

Every source also passes through `job-batch-filter.mjs`. Existing non-job classifications, tender/procurement titles and bidding instructions are excluded, even when a source labels them as jobs. Ambiguous terms-of-reference notices are held for review. Ordinary procurement duties do not alone make a vacancy a tender. Run `node job-batch-filter.test.mjs` for regression tests. This protects the prepared batch; it does not alter the separate live scraper sync endpoint or historical database rows.

Tender deadlines recovered from explicit instructions remain with the held tender records. The job extractor batch excludes tenders. Advertising elements are removed and text is preserved for AI consumption. Raw snapshots allow comparison and recovery.

## JobWeb Rwanda limitation

The deployed `pipeline_sources` registry disables JobWeb Rwanda. Its staging table lacks the extraction tracking columns used by `ai-job-extractor`. Preparation retains these records separately. Enabling that route requires a separately reviewed pipeline/schema change; simply turning on the registry flag will fail.

## Cache status

List endpoints populate the cache before the source detail loop completes. Concurrent runs can therefore show missing descriptions even while details are being fetched successfully. The preparation command checks source start/completion logs and holds records from an unfinished source. Re-run preparation after completion to refresh the artifacts.
