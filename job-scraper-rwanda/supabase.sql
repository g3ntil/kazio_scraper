-- FIX FOR: "permission denied for table jobs" (Error 42501)
-- Run this in your Supabase SQL Editor

-- 1. Ensure the table exists with the correct structure
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  company text,
  location text,
  deadline date, -- Matches your image
  job_url text UNIQUE NOT NULL,
  job_type text DEFAULT 'Job',
  experience_level text,
  published_on text,
  description text,
  taxonomy_category text,
  company_description text,
  company_logo_url text,
  company_website text,
  company_rating numeric,
  company_rating_count int4,
  company_facebook_url text,
  company_twitter_url text,
  company_linkedin_url text
);

-- 2. Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 3. Create the Policy to allow the "anon" key to Sync/Upsert data
-- This allows anyone with your API key (the app) to save jobs.
DROP POLICY IF EXISTS "Enable all access for everyone" ON public.jobs;

CREATE POLICY "Enable all access for everyone" 
ON public.jobs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 4. Grant explicit table permissions to the public roles
GRANT ALL ON TABLE public.jobs TO anon, authenticated, service_role;

-- 5. RUN THIS IF THE TABLE ALREADY EXISTS AND LACKS JOB_TYPE
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'Job';

-- 6. FIX FOR: record "new" has no field "category"
-- If you see this error, it means you have a stale Trigger or Function.
-- Run this to drop likely broken triggers:
-- DROP TRIGGER IF EXISTS jobs_search_update ON public.jobs;
-- DROP FUNCTION IF EXISTS public.jobs_search_trigger();

-- To see which trigger is broken, you can list them:
-- SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'jobs';
