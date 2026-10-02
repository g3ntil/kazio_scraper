# Ndangira Job Enrichment Agent Context

## 1. Objective & Scope
The Kazio scraping ingestion pipeline previously imported ~135 job records originating from `ndangira.com` where descriptions were truncated or deadlines were set to `null` due to incomplete field parsing during initial scrape runs.

This agent's sole purpose is to **enrich and complete all missing fields (deadline, full description, company, location, apply_url)** for existing job rows in the central `public.jobs` table.

---

## 2. Mandatory Rules & Guarantees
1. **UPDATE ONLY**: Never insert new rows into `public.jobs` or staging tables. Only execute `UPDATE public.jobs SET ... WHERE id = ...`.
2. **NO DELETIONS**: Never delete existing job records unless explicitly flagged.
3. **SCHEMA LOCK**: The database schema is strictly locked. Do not add, drop, rename, or modify any columns or tables.
4. **ID INTEGRITY**: All updates must target exact primary key IDs (`UUID` format in `public.jobs.id`).

---

## 3. Ndangira Data & URL Architecture
Ndangira job listings embed highly structured metadata directly in their URL slug and HTML content:

### A. URL Slug Structure
Examples:
- `https://ndangira.com/product-operations-lead-fixed-term-at-one-acre-fund-deadline-03-11-2026-745`
- `https://ndangira.com/regional-audit-at-eastern-province-ep-deadline-sep-22-2026-1209`
- `https://ndangira.com/2-job-positions-of-tv-engineers-at-rwanda-broadcasting-agency-rba-deadline-2026-09-04-1082`

**Slug Regex Parsers:**
1. `deadline-(\d{2})-(\d{2})-(\d{4})` (DD-MM-YYYY or MM-DD-YYYY, standardized to ISO `YYYY-MM-DD`)
2. `deadline-(\d{4})-(\d{2})-(\d{2})` (ISO `YYYY-MM-DD`)
3. `deadline-([a-zA-Z]+)-(\d{1,2})-(\d{4})` (e.g. `sep-22-2026` -> `2026-09-22`)

### B. Title Structure for Company Extraction
- Pattern: `"<Job Title> at <Company Name>"` (e.g., `"Product Operations Lead (Fixed-Term) at One Acre Fund"` -> Company: `"One Acre Fund"`).

### C. Detail Page HTML Selectors
- **Container**: `.post-content`, `.entry-content`, or `.listing-description`
- **Info Boxes**: `.info-box` containing `Organization / Company`, `Location`, `Deadline:`
- **Qualifications / Requirements**: Bullet points and responsibilities headers inside content.

---

## 4. Supabase Target Contract (`public.jobs`)
Columns updated by this agent:
| Column | Type | Target Format |
|---|---|---|
| `deadline` | `date` | `YYYY-MM-DD` (e.g. `2026-11-03`) |
| `description` | `text` | Clean markdown or plain text (responsibilities, qualifications, how to apply) |
| `company` | `text` | Cleaned organization name (avoid `"Unknown"`) |
| `location` | `text` | e.g. `"Kigali, Rwanda"` or district name |
| `job_url` | `text` | Source URL for verification |
| `is_active` | `boolean` | `true` if deadline is in the future, `false` if expired |
