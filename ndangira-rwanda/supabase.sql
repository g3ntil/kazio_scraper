-- ======================================================================
-- RAW NDANGIRA JOBS TABLE & DEDUP INDEXES
-- Supabase Project: ndjvazyeykrzkqlipwbs
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.raw_ndangira_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE NOT NULL,
    source_url TEXT NOT NULL,
    category TEXT DEFAULT 'Jobs',
    title_raw TEXT NOT NULL,
    title_clean TEXT,
    company_name TEXT,
    location_raw TEXT,
    deadline_raw TEXT,
    deadline_date DATE,
    posted_date_raw TEXT,
    posted_date DATE,
    views_count INTEGER,
    image_url TEXT,
    description_html TEXT,
    description_text TEXT,
    apply_url TEXT,
    extraction_status TEXT DEFAULT 'pending',
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on external_id for fast upsert checks
CREATE INDEX IF NOT EXISTS idx_raw_ndangira_external_id ON public.raw_ndangira_jobs (external_id);
CREATE INDEX IF NOT EXISTS idx_raw_ndangira_status ON public.raw_ndangira_jobs (extraction_status);

-- Enable pg_trgm for fuzzy duplicate matching against public.jobs
CREATE EXTENSION IF NOT EXISTS pg_trgm;
