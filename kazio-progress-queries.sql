-- =====================================================================
--  Kazio pipeline — reference queries for checking progress
--  Run these in the Supabase SQL editor. All are read-only (SELECT).
-- =====================================================================


-- ============================================================
-- 1) AI KEY POOL — what can serve right now, and when it can't
-- ============================================================

-- Is there any usable key right now? (the same check every cron uses)
select public.pool_has_capacity();

-- Full state of every active key: usage today, and when its blocks lift
select
  id, provider, active, status,
  requests_today, rpd_limit,
  to_char(rpm_blocked_until, 'MM-DD HH24:MI') as rpm_blocked_until,   -- short cooldown (rate limit / billing hiccup)
  to_char(rpd_blocked_until, 'MM-DD HH24:MI') as rpd_blocked_until,   -- blocked until Google's daily quota resets
  to_char(last_used_at, 'MM-DD HH24:MI:SS') as last_used_at,
  fail_count
from public.gemini_keys
where active
order by provider, id;


-- ============================================================
-- 2) EXTRACTION PROGRESS — jobs table (the "legacy" repair path)
-- ============================================================

-- One-line snapshot: live, extracted, failed, pending
select
  count(*) filter (where is_active and extraction_status = 'done')      as live_and_extracted,
  count(*) filter (where extraction_status = 'failed')                   as failed,
  count(*) filter (where extraction_status = 'failed' and extraction_attempts >= 3) as failed_at_retry_cap,
  count(*) filter (where extraction_status in ('pending','processing'))  as still_queued,
  count(*)                                                               as total_rows
from public.jobs;

-- How fast is it moving? rows touched in the last N minutes
select count(*) as extracted_last_20min
from public.jobs
where extracted_at > now() - interval '20 minutes';

-- Why are failed jobs failing? (grouped by error type)
select
  case
    when extraction_error ~* '402|billing|credits' then '402 — AI billing/credits depleted'
    when extraction_error ~* '429|quota|rate'       then '429 — rate/quota limited'
    when extraction_error ~* '50[234]|overload'      then '50x — provider overloaded'
    else left(coalesce(extraction_error,'(no error text)'), 60)
  end as reason,
  count(*) as n
from public.jobs
where extraction_status = 'failed'
group by 1
order by n desc;


-- ============================================================
-- 3) EXTRACTION PROGRESS — staging tables (the real funnel)
-- ============================================================

-- Pending + failed per source, side by side
select 'brightermonday' as source,
       count(*) filter (where extraction_status = 'pending') as pending,
       count(*) filter (where extraction_status = 'failed')  as failed,
       count(*) filter (where extraction_status = 'done')    as done,
       max(last_seen_at) as last_scraper_activity
from public.raw_brightermonday_jobs
union all
select 'ndangira',
       count(*) filter (where extraction_status = 'pending'),
       count(*) filter (where extraction_status = 'failed'),
       count(*) filter (where extraction_status = 'done'),
       max(last_seen_at)
from public.raw_ndangira_jobs
union all
select 'jobinrwanda',
       count(*) filter (where extraction_status = 'pending'),
       count(*) filter (where extraction_status = 'failed'),
       count(*) filter (where extraction_status = 'done'),
       max(last_seen_at)
from public.raw_jobinrwanda_jobs
union all
select 'greatrwandajobs',
       count(*) filter (where extraction_status = 'pending'),
       count(*) filter (where extraction_status = 'failed'),
       count(*) filter (where extraction_status = 'done'),
       null
from public.jobs_greatrwandajobs;

-- Total rows still waiting on the AI, across every table (the "backlog" number)
select
  (select count(*) from public.jobs where extraction_status in ('failed','pending','processing') and extraction_attempts < 3)
+ (select count(*) from public.raw_brightermonday_jobs  where extraction_status in ('pending','failed'))
+ (select count(*) from public.raw_ndangira_jobs         where extraction_status in ('pending','failed'))
+ (select count(*) from public.raw_jobinrwanda_jobs      where extraction_status in ('pending','failed'))
+ (select count(*) from public.jobs_greatrwandajobs      where extraction_status in ('pending','failed'))
  as total_awaiting_ai;


-- ============================================================
-- 4) DATA QUALITY — live jobs only (is_active + extraction_status='done')
-- ============================================================

-- Field completeness across the fields that matter for search/matching
with a as (select * from public.jobs where is_active and extraction_status = 'done')
select
  count(*)                                                        as total_live,
  count(deadline)                                                 as has_deadline,
  count(salary_min)                                                as has_salary,
  count(*) filter (where salary_is_estimated)                      as salary_is_estimated,
  count(industry)                                                  as has_industry,
  count(job_function)                                              as has_job_function,
  count(*) filter (where coalesce(array_length(skills_t1,1),0)>0)  as has_must_have_skills,
  count(*) filter (where coalesce(array_length(skills_t1,1),0)=0)  as zero_skills,
  count(company_description)                                       as has_company_description,
  count(company_logo_url)                                          as has_logo,
  count(*) filter (where coalesce(array_length(contact_emails,1),0)>0) as has_email
from a;

-- Distribution by industry (live jobs)
select industry, count(*) as n
from public.jobs
where is_active and extraction_status = 'done'
group by industry
order by n desc;

-- Sanity checks: nothing that should have been filtered out is still live
select
  count(*) filter (where deadline < current_date)         as expired_but_still_active,   -- should be 0
  count(*) filter (where duplicate_of_job_id is not null)  as duplicate_but_still_active  -- should be 0
from public.jobs
where is_active;

-- Any duplicate GROUPS still live (same normalized title+company, both live)?
select dedup_key, count(*) as n
from public.jobs
where is_active and duplicate_of_job_id is null and dedup_key <> '|'
group by dedup_key
having count(*) > 1;                                        -- should return 0 rows


-- ============================================================
-- 5) ALERTS — what the monitor has flagged
-- ============================================================

select created_at, severity, code, message
from public.ops_alert_events
order by created_at desc
limit 20;

-- Critical alerts in the last 24h only
select created_at, code, message
from public.ops_alert_events
where severity = 'critical' and created_at > now() - interval '24 hours'
order by created_at desc;


-- ============================================================
-- 6) RECENT ACTIVITY — is the extractor actually running?
-- ============================================================

-- Cron run history for the extraction-related jobs, last hour
select j.jobname, d.status, d.start_time
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname in ('ai-job-extractor-drip','retry-failed-jobs-drip','retry-failed-staging-rows','pipeline-heal','pipeline-monitor')
  and d.start_time > now() - interval '1 hour'
order by d.start_time desc;

-- Raw HTTP responses from the last extractor calls (status code + body/error)
select created, status_code, left(content, 300) as body, left(error_msg, 150) as error
from net._http_response
where created > now() - interval '15 minutes'
order by id desc
limit 10;
