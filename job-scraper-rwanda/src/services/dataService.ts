import { supabase } from '../lib/supabase';
import { 
  AggregateDashboardData, 
  DashboardTotals, 
  FieldCompleteness, 
  SourceMetrics, 
  SourceHealth,
  SourceId, 
  GeminiKey, 
  CapacityMath, 
  ErrorClassification, 
  TrendDay, 
  DistributionItem, 
  IssueCard, 
  JobRow, 
  JobDetail, 
  CronJobInfo,
  OpsAlertEvent,
  AlertBurst,
  NearDuplicatePair,
  AiDuplicateReview,
  SkillVocabularyItem,
  DownstreamReadiness,
  SyncResult,
  CompareResult
} from '../types/dashboard';

export async function reviewDuplicateWithAi(
  jobIdA: string | number,
  jobIdB: string | number
): Promise<AiDuplicateReview> {
  const response = await fetch('/api/ai/review-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jobIdA, jobIdB })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === 'string'
      ? body.message
      : response.status === 503
        ? 'Kio duplicate review is not configured yet. Add an OpenRouter API key to enable it.'
        : 'Kio could not review this pair. Please try again.';
    throw new Error(message);
  }

  return body as AiDuplicateReview;
}

const SOURCES_CONFIG: Record<SourceId, { name: string; domain: string; stagingTable: string; ingestionPath: string; notes: string[]; noPipeline?: boolean }> = {
  jobinrwanda: {
    name: 'Job in Rwanda',
    domain: 'jobinrwanda.com',
    stagingTable: 'raw_jobinrwanda_jobs',
    ingestionPath: 'fetch + regex → raw_jobinrwanda_jobs → AI Funnel → jobs',
    notes: [
      'Scrapes page 1 of /jobs/all without pagination',
      'Uses direct raw_jobinrwanda_jobs staging table',
      'Deduplication key: job_url'
    ]
  },
  brightermonday: {
    name: 'BrighterMonday',
    domain: 'brightermonday.co.rw',
    stagingTable: 'raw_brightermonday_jobs',
    ingestionPath: 'Playwright / Cheerio → raw_brightermonday_jobs → AI → jobs',
    notes: [
      'Up to 5 pages scraped in server.ts',
      'JSON-LD extraction used where available',
      'Deduplication key: external_id slug'
    ]
  },
  ndangira: {
    name: 'Ndangira',
    domain: 'ndangira.com',
    stagingTable: 'raw_ndangira_jobs',
    ingestionPath: 'Cheerio fetch → raw_ndangira_jobs → AI → jobs',
    notes: [
      'Extracts direct jobs feed with numeric ID parsing',
      'Deduplication key: external_id'
    ]
  },
  greatrwandajobs: {
    name: 'Great Rwanda Jobs',
    domain: 'greatrwandajobs.com',
    stagingTable: 'jobs_greatrwandajobs',
    ingestionPath: 'Joomla API pagination → jobs_greatrwandajobs → AI → jobs',
    notes: [
      'Scrapes up to 30 pages via getnextjobs endpoint',
      'Staging table has no timestamp column',
      'Deduplication key: job_url'
    ]
  },
  jobwebrwanda: {
    name: 'JobWeb Rwanda',
    domain: 'jobwebrwanda.com',
    stagingTable: 'jobs_jobwebrwanda',
    ingestionPath: 'Direct listing fetch → jobs_jobwebrwanda (Pipeline paused)',
    noPipeline: true,
    notes: [
      'Table has no extraction_status column',
      'Scraper active, but AI promotion pipeline is paused'
    ]
  }
};

export const srcOfUrl = (url: string | null): SourceId | 'other' => {
  if (!url) return 'other';
  const u = url.toLowerCase();
  if (u.includes('jobinrwanda')) return 'jobinrwanda';
  if (u.includes('brightermonday')) return 'brightermonday';
  if (u.includes('ndangira')) return 'ndangira';
  if (u.includes('greatrwandajobs')) return 'greatrwandajobs';
  if (u.includes('jobwebrwanda')) return 'jobwebrwanda';
  return 'other';
};

const errClass = (errorStr: string | null): 'pool' | '429' | '503' | 'short' | 'other' => {
  if (!errorStr) return 'other';
  const e = errorStr.toLowerCase();
  if (/all keys|no active api key|over their daily|402|billing|credits|prepayment/.test(e)) return 'pool';
  if (/429|rate|quota/.test(e)) return '429';
  if (/50[234]|overload|high demand|unavailable/.test(e)) return '503';
  if (/too short|missing/.test(e)) return 'short';
  return 'other';
};

export async function aggregateLive(): Promise<AggregateDashboardData> {
  if (!supabase) throw new Error("Supabase client is not configured");

  // 1. Fetch all jobs in chunks of 1000
  const jobsCols = 'id,job_url,extraction_status,extraction_error,extraction_attempts,is_active,content_type,skip_reason,deadline,industry,job_function,skills_t1,min_degree,experience_level_new,job_type_new,ai_summary,company_description,company_logo_url,contact_emails,languages_required,is_local_company,apply_contact,salary_min,deadline_source,scraped_at,duplicate_of_job_id,processing_started_at';
  
  let allJobs: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from('jobs')
      .select(jobsCols)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    allJobs = allJobs.concat(chunk);
    if (chunk.length < pageSize) break;
    page++;
  }

  // 2. Fetch protected key telemetry through the local server. Direct anon
  // reads are intentionally hidden by RLS and previously produced a false
  // zero-capacity result across Overview, Queue and Keys.
  let geminiKeys: GeminiKey[] = [];
  try {
    const keyResponse = await fetch('/api/ai-keys/telemetry', { headers: { Accept: 'application/json' } });
    const keyBody = await keyResponse.json().catch(() => ({}));
    if (!keyResponse.ok) throw new Error(keyBody.error || `HTTP ${keyResponse.status}`);
    geminiKeys = Array.isArray(keyBody.keys) ? keyBody.keys : [];
  } catch (error: any) {
    console.warn('Could not fetch protected AI key telemetry:', error.message);
  }

  // 3. Fetch alerts
  const { data: alertsData } = await supabase
    .from('ops_alert_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const alerts: OpsAlertEvent[] = alertsData || [];

  // 4. Fetch staging aggregates in parallel
  const [bmStg, ndStg, grjStg, jirStg, jwrStg] = await Promise.all([
    supabase.from('raw_brightermonday_jobs').select('extraction_status,extraction_error,content_type,promoted_job_id,last_seen_at'),
    supabase.from('raw_ndangira_jobs').select('extraction_status,extraction_error,promoted_job_id,last_seen_at,is_duplicate'),
    supabase.from('jobs_greatrwandajobs').select('extraction_status,extraction_error,content_type,promoted_job_id'),
    supabase.from('raw_jobinrwanda_jobs').select('extraction_status,extraction_error,promoted_job_id,scraped_at,content_type'),
    supabase.from('jobs_jobwebrwanda').select('deadline')
  ]);

  const todayStr = new Date().toISOString().split('T')[0];
  const now = Date.now();

  // Aggregate jobs totals
  const totals: DashboardTotals = {
    jobs: allJobs.length,
    active: 0,
    done: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    skipped: 0,
    atCap: 0,
    enrichedActive: 0,
    noDeadlineActive: 0,
    expiredActive: 0,
    dupsActive: 0,
    stuck: 0,
    newToday: 0,
    other: 0,
    funnelExtracted: 0,
    funnelPending: 0,
    funnelFailed: 0,
    funnelSkipped: 0
  };

  const fillCounts = {
    deadline: 0,
    salary: 0,
    industry: 0,
    job_function: 0,
    skills_t1: 0,
    min_degree: 0,
    experience: 0,
    job_type: 0,
    ai_summary: 0,
    languages: 0,
    local_company: 0,
    company_description: 0,
    company_logo: 0,
    contact_emails: 0,
    apply_contact: 0
  };

  const errorClassCounts = { pool: 0, rate429: 0, overload503: 0, short: 0, other: 0, total: 0 };
  const industryMap: Record<string, number> = {};
  const functionMap: Record<string, number> = {};
  const deadlineDist = { source_field: 0, ai: 0, none: 0 };
  const trendMap: Record<string, number> = {};

  // Initialize 7 days trend map
  const srcTrendMap: Record<SourceId, Record<string, number>> = {
    jobinrwanda: {},
    brightermonday: {},
    ndangira: {},
    greatrwandajobs: {},
    jobwebrwanda: {}
  };

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    trendMap[dayStr] = 0;
    srcTrendMap.jobinrwanda[dayStr] = 0;
    srcTrendMap.brightermonday[dayStr] = 0;
    srcTrendMap.ndangira[dayStr] = 0;
    srcTrendMap.greatrwandajobs[dayStr] = 0;
    srcTrendMap.jobwebrwanda[dayStr] = 0;
  }

  // Per source tracking
  const srcJobs: Record<SourceId, {
    total: number;
    active: number;
    enriched: number;
    pending: number;
    failed: number;
    skipped: number;
    dups: number;
    expired: number;
    atCap: number;
    lastScraped: string | null;
  }> = {
    jobinrwanda: { total: 0, active: 0, enriched: 0, pending: 0, failed: 0, skipped: 0, dups: 0, expired: 0, atCap: 0, lastScraped: null },
    brightermonday: { total: 0, active: 0, enriched: 0, pending: 0, failed: 0, skipped: 0, dups: 0, expired: 0, atCap: 0, lastScraped: null },
    ndangira: { total: 0, active: 0, enriched: 0, pending: 0, failed: 0, skipped: 0, dups: 0, expired: 0, atCap: 0, lastScraped: null },
    greatrwandajobs: { total: 0, active: 0, enriched: 0, pending: 0, failed: 0, skipped: 0, dups: 0, expired: 0, atCap: 0, lastScraped: null },
    jobwebrwanda: { total: 0, active: 0, enriched: 0, pending: 0, failed: 0, skipped: 0, dups: 0, expired: 0, atCap: 0, lastScraped: null }
  };

  const srcNewToday: Record<SourceId, number> = {
    jobinrwanda: 0,
    brightermonday: 0,
    ndangira: 0,
    greatrwandajobs: 0,
    jobwebrwanda: 0
  };

  for (const j of allJobs) {
    const s = srcOfUrl(j.job_url);
    if (s !== 'other') {
      srcJobs[s].total++;
      if (j.scraped_at) {
        if (!srcJobs[s].lastScraped || j.scraped_at > srcJobs[s].lastScraped!) {
          srcJobs[s].lastScraped = j.scraped_at;
        }
        if (j.scraped_at.split('T')[0] === todayStr) {
          srcNewToday[s]++;
        }
      }
    } else {
      totals.other++;
    }

    if (j.is_active) {
      totals.active++;
      if (s !== 'other') srcJobs[s].active++;

      if (j.industry) {
        totals.enrichedActive++;
        if (s !== 'other') srcJobs[s].enriched++;
        industryMap[j.industry] = (industryMap[j.industry] || 0) + 1;
      }
      if (j.job_function) {
        functionMap[j.job_function] = (functionMap[j.job_function] || 0) + 1;
      }

      if (!j.deadline) {
        totals.noDeadlineActive++;
      } else if (j.deadline < todayStr) {
        totals.expiredActive++;
        if (s !== 'other') srcJobs[s].expired++;
      }

      if (j.duplicate_of_job_id) {
        totals.dupsActive++;
        if (s !== 'other') srcJobs[s].dups++;
      }

      // Fill completeness tracking
      if (j.deadline) fillCounts.deadline++;
      if (j.salary_min !== null && j.salary_min !== undefined) fillCounts.salary++;
      if (j.industry) fillCounts.industry++;
      if (j.job_function) fillCounts.job_function++;
      if (j.skills_t1 && j.skills_t1.length > 0) fillCounts.skills_t1++;
      if (j.min_degree) fillCounts.min_degree++;
      if (j.experience_level_new) fillCounts.experience++;
      if (j.job_type_new) fillCounts.job_type++;
      if (j.ai_summary) fillCounts.ai_summary++;
      if (j.languages_required && j.languages_required.length > 0) fillCounts.languages++;
      if (j.is_local_company !== null && j.is_local_company !== undefined) fillCounts.local_company++;
      if (j.company_description) fillCounts.company_description++;
      if (j.company_logo_url) fillCounts.company_logo++;
      if (j.contact_emails && j.contact_emails.length > 0) fillCounts.contact_emails++;
      if (j.apply_contact) fillCounts.apply_contact++;

      // Deadline source
      if (j.deadline_source === 'source_field') deadlineDist.source_field++;
      else if (j.deadline_source === 'ai') deadlineDist.ai++;
      else deadlineDist.none++;
    }

    // Status counts
    const status = j.extraction_status || 'pending';
    if (status === 'done') totals.done++;
    else if (status === 'failed') {
      totals.failed++;
      if (s !== 'other') srcJobs[s].failed++;
      if (j.extraction_attempts >= 3) {
        totals.atCap++;
        if (s !== 'other') srcJobs[s].atCap++;
      }
      const c = errClass(j.extraction_error);
      if (c === 'pool') errorClassCounts.pool++;
      else if (c === '429') errorClassCounts.rate429++;
      else if (c === '503') errorClassCounts.overload503++;
      else if (c === 'short') errorClassCounts.short++;
      else errorClassCounts.other++;
      errorClassCounts.total++;
    } else if (status === 'pending') {
      totals.pending++;
      if (s !== 'other') srcJobs[s].pending++;
    } else if (status === 'processing') {
      totals.processing++;
      if (j.processing_started_at && (now - new Date(j.processing_started_at).getTime() > 5 * 60 * 1000)) {
        totals.stuck++;
      }
    } else if (status.startsWith('skipped')) {
      totals.skipped++;
      if (s !== 'other') srcJobs[s].skipped++;
    }

    // Trend & new today
    if (j.scraped_at) {
      const day = j.scraped_at.split('T')[0];
      if (day === todayStr) totals.newToday++;
      if (trendMap[day] !== undefined) trendMap[day]++;
      if (s !== 'other' && srcTrendMap[s] && srcTrendMap[s][day] !== undefined) {
        srcTrendMap[s][day]++;
      }
    }
  }

  // Parse staging numbers
  const parseRawStaging = (rows: any[] | null) => {
    const res = { total: 0, pending: 0, failed: 0, done: 0, skipped: 0, promoted: 0, tender: 0, newToday: 0, lastSeen: null as string | null };
    if (!rows) return res;
    res.total = rows.length;
    for (const r of rows) {
      const st = r.extraction_status || 'pending';
      if (st === 'pending') res.pending++;
      else if (st === 'failed') res.failed++;
      else if (st === 'done') res.done++;
      else if (st.startsWith('skipped')) res.skipped++;

      if (r.promoted_job_id) res.promoted++;
      if (r.content_type === 'tender' || r.content_type === 'paid_program') res.tender++;

      const ts = r.last_seen_at || r.scraped_at;
      if (ts) {
        if (!res.lastSeen || ts > res.lastSeen) res.lastSeen = ts;
        if (ts.split('T')[0] === todayStr) res.newToday++;
      }
    }
    return res;
  };

  const rawStaging: Record<SourceId, ReturnType<typeof parseRawStaging>> = {
    jobinrwanda: parseRawStaging(jirStg.data),
    brightermonday: parseRawStaging(bmStg.data),
    ndangira: parseRawStaging(ndStg.data),
    greatrwandajobs: parseRawStaging(grjStg.data),
    jobwebrwanda: parseRawStaging(jwrStg.data)
  };

  // Fetch local store counts from backend if available
  const localStoreCounts: Record<SourceId, number> = {
    jobinrwanda: 0,
    brightermonday: 0,
    ndangira: 0,
    greatrwandajobs: 0,
    jobwebrwanda: 0
  };

  try {
    const localRes = await fetch('/api/scrape/local');
    if (localRes.ok) {
      const localData = await localRes.json();
      for (const [s, items] of Object.entries(localData)) {
        if (Array.isArray(items)) {
          localStoreCounts[s as SourceId] = items.length;
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // Calculate Accurate 3-Stage Ingestion Funnel Numbers
  const stagingPending = rawStaging.jobinrwanda.pending +
                         rawStaging.brightermonday.pending +
                         rawStaging.ndangira.pending +
                         rawStaging.greatrwandajobs.pending +
                         rawStaging.jobwebrwanda.pending;
  const stagingFailed = rawStaging.jobinrwanda.failed +
                        rawStaging.brightermonday.failed +
                        rawStaging.ndangira.failed +
                        rawStaging.greatrwandajobs.failed +
                        rawStaging.jobwebrwanda.failed;
  const stagingSkipped = rawStaging.jobinrwanda.skipped + rawStaging.jobinrwanda.tender +
                         rawStaging.brightermonday.skipped + rawStaging.brightermonday.tender +
                         rawStaging.ndangira.skipped +
                         rawStaging.greatrwandajobs.skipped + rawStaging.greatrwandajobs.tender +
                         rawStaging.jobwebrwanda.skipped;

  // Extracted: Live in jobs table
  totals.funnelExtracted = totals.done > 0 ? totals.done : allJobs.length;
  // Pending: In staging awaiting extraction + jobs in processing/pending
  totals.funnelPending = stagingPending + totals.pending + totals.processing;
  // Failed: Staging extraction failed + jobs failed
  totals.funnelFailed = stagingFailed + totals.failed;
  // Skipped: Tenders, duplicates, expired listings across staging & live
  totals.funnelSkipped = stagingSkipped + totals.skipped + totals.dupsActive + totals.expiredActive;

  // Compute source health verdicts
  const computeHealth = (id: SourceId): SourceHealth => {
    const cfg = SOURCES_CONFIG[id];
    if (cfg.noPipeline) return { lvl: 'bad', label: 'No pipeline', errorRate: 0, hoursSinceScrape: null };

    const jb = srcJobs[id];
    const rw = rawStaging[id];
    const lastTime = rw.lastSeen || jb.lastScraped;
    const hoursSince = lastTime ? (now - new Date(lastTime).getTime()) / (1000 * 60 * 60) : null;
    const totalProcessed = jb.enriched + jb.failed;
    const errorRate = totalProcessed > 0 ? jb.failed / totalProcessed : 0;

    if (errorRate > 0.5) return { lvl: 'bad', label: 'Extraction failing', errorRate, hoursSinceScrape: hoursSince };
    if (hoursSince !== null && hoursSince > 24) return { lvl: 'warn', label: 'Stale (>24h)', errorRate, hoursSinceScrape: hoursSince };
    if (errorRate > 0.1) return { lvl: 'warn', label: 'High errors', errorRate, hoursSinceScrape: hoursSince };
    return { lvl: 'ok', label: 'Healthy', errorRate, hoursSinceScrape: hoursSince };
  };

  const makeSourceMetrics = (id: SourceId): SourceMetrics => {
    const jobsCount = srcJobs[id].total;
    const stagedCount = rawStaging[id].total;
    const localCount = localStoreCounts[id] || 0;
    const convPct = stagedCount > 0 ? Math.round((jobsCount / stagedCount) * 100) : 0;
    const sourceNewToday = srcNewToday[id] > 0 ? srcNewToday[id] : rawStaging[id].newToday;

    return {
      ...SOURCES_CONFIG[id],
      id,
      newToday: sourceNewToday,
      funnel: {
        local: localCount,
        staged: stagedCount,
        live: jobsCount,
        stagedToLivePct: convPct
      },
      jobs: srcJobs[id],
      raw: rawStaging[id],
      health: computeHealth(id)
    };
  };

  const sources: Record<SourceId, SourceMetrics> = {
    jobinrwanda: makeSourceMetrics('jobinrwanda'),
    brightermonday: makeSourceMetrics('brightermonday'),
    ndangira: makeSourceMetrics('ndangira'),
    greatrwandajobs: makeSourceMetrics('greatrwandajobs'),
    jobwebrwanda: makeSourceMetrics('jobwebrwanda')
  };

  // AI Capacity Math (Gemini + OpenRouter rotation pool)
  const activeKeys = geminiKeys.filter(k => k.active && k.status === 'active');
  const rpd = activeKeys.reduce((sum, k) => sum + (k.rpd_limit || 200), 0);
  const rpm = activeKeys.reduce((sum, k) => sum + (k.rpm_limit || 15), 0);
  const requestsInCurrentWindow = (k: GeminiKey) =>
    k.day_window_start?.split('T')[0] === todayStr ? (k.requests_today || 0) : 0;
  const used = activeKeys.reduce((sum, k) => sum + requestsInCurrentWindow(k), 0);

  const usable = activeKeys.filter(k => {
    const nowIso = new Date().toISOString();
    const rpmBlocked = k.rpm_blocked_until && k.rpm_blocked_until > nowIso;
    const rpdBlocked = k.rpd_blocked_until && k.rpd_blocked_until > nowIso;
    const overDaily = requestsInCurrentWindow(k) >= (k.rpd_limit || 200);
    return !rpmBlocked && !rpdBlocked && !overDaily;
  }).length;

  const awaitingStaging = rawStaging.brightermonday.pending + rawStaging.brightermonday.failed +
    rawStaging.ndangira.pending + rawStaging.ndangira.failed +
    rawStaging.greatrwandajobs.pending + rawStaging.greatrwandajobs.failed;
  const awaiting = totals.pending + totals.processing + totals.failed + awaitingStaging;
  const daysToClear = rpd > 0 ? awaiting / rpd : 0;

  const capacity: CapacityMath = {
    g: activeKeys,
    rpd,
    rpm,
    used,
    usable,
    awaiting,
    daysToClear
  };

  // Dynamic Issues list (Section 3k & Mockup logic)
  const issues: IssueCard[] = [];
  
  if (usable === 0 && activeKeys.length > 0) {
    issues.push({
      id: 'keys_exhausted',
      severity: 'critical',
      title: 'All AI keys are exhausted or cooling down',
      description: `All ${activeKeys.length} active AI keys (Gemini / OpenRouter) are blocked or limited. Extractions will pause until cooldown resets.`,
      actionLabel: 'Manage AI Keys',
      targetPage: 'keys'
    });
  }

  if (errorClassCounts.rate429 > 0) {
    issues.push({
      id: 'rate_limit_429',
      severity: 'critical',
      title: `${errorClassCounts.rate429} extractions failed on Gemini 429 quota errors`,
      description: `Successful AI calls today: ${used} of ${rpd.toLocaleString()} configured. Key capacity may be shared or lower than configured limits.`,
      actionLabel: 'Check AI Keys',
      targetPage: 'keys'
    });
  }

  if (totals.atCap > 0) {
    issues.push({
      id: 'at_retry_cap',
      severity: 'critical',
      title: `${totals.atCap} failed jobs are stuck at 3-attempt retry cap`,
      description: 'The background retry cron skips rows with >= 3 attempts. Reset transient counters in the queue to requeue.',
      actionLabel: 'Review & Reset',
      targetPage: 'queue'
    });
  }

  const unenriched = totals.active - totals.enrichedActive;
  if (unenriched > 0) {
    issues.push({
      id: 'unenriched_active',
      severity: unenriched / Math.max(1, totals.active) > 0.25 ? 'critical' : 'warning',
      title: `${unenriched.toLocaleString()} of ${totals.active.toLocaleString()} live jobs have no AI enrichment`,
      description: 'Jobs are visible on Kazio but lack structured industry, function, or skill tags.',
      actionLabel: 'View Unenriched',
      targetPage: 'jobs'
    });
  }

  if (rawStaging.brightermonday.tender > 0) {
    issues.push({
      id: 'staged_tenders',
      severity: 'warning',
      title: `${rawStaging.brightermonday.tender} BrighterMonday staging rows labelled tender / paid program`,
      description: 'Tenders and paid opportunities should be marked skipped to avoid consuming AI quota.',
      actionLabel: 'Manage Queue',
      targetPage: 'queue'
    });
  }

  if (rawStaging.jobwebrwanda.total > 0) {
    issues.push({
      id: 'jwr_no_pipeline',
      severity: 'info',
      title: `JobWeb Rwanda excluded: ${rawStaging.jobwebrwanda.total} historical rows`,
      description: 'Scraping and extraction are disabled for this source by request.',
      actionLabel: 'Inspect Source',
      targetPage: 'sources'
    });
  }

  if (rawStaging.jobinrwanda.pending > 0) {
    issues.push({
      id: 'jir_staging_pending',
      severity: 'warning',
      title: `${rawStaging.jobinrwanda.pending} Job in Rwanda rows sit in staging`,
      description: 'These raw records are waiting for the scheduled AI extractor. Check provider capacity and row errors.',
      actionLabel: 'Open Source',
      targetPage: 'sources'
    });
  }

  if (totals.stuck > 0) {
    issues.push({
      id: 'stuck_jobs',
      severity: 'warning',
      title: `${totals.stuck} jobs stuck in 'processing' (>5 min)`,
      description: 'Processing lock expired. Automatic retry routine will release and requeue these jobs.',
      actionLabel: 'Check Queue',
      targetPage: 'queue'
    });
  }

  if (totals.expiredActive > 0) {
    issues.push({
      id: 'expired_active',
      severity: 'warning',
      title: `${totals.expiredActive} active jobs are past their application deadline`,
      description: 'Nightly deactivation cron cleans these up at 02:15 UTC. You can trigger maintenance now.',
      actionLabel: 'Open Automation',
      targetPage: 'automation'
    });
  }

  if (totals.noDeadlineActive > 0) {
    issues.push({
      id: 'no_deadline',
      severity: 'info',
      title: `${totals.noDeadlineActive} live jobs have no deadline specified`,
      description: 'These listings rely on the 60-day stale sweeper for deactivation.',
      actionLabel: 'View in Explorer',
      targetPage: 'jobs'
    });
  }

  // Sort critical -> warning -> info
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));

  // Field completeness calculation (denom = totals.active)
  const denom = Math.max(totals.active, 1);
  const fill: FieldCompleteness = {
    deadline: Math.round((fillCounts.deadline / denom) * 100),
    salary: Math.round((fillCounts.salary / denom) * 100),
    industry: Math.round((fillCounts.industry / denom) * 100),
    job_function: Math.round((fillCounts.job_function / denom) * 100),
    skills_t1: Math.round((fillCounts.skills_t1 / denom) * 100),
    min_degree: Math.round((fillCounts.min_degree / denom) * 100),
    experience: Math.round((fillCounts.experience / denom) * 100),
    job_type: Math.round((fillCounts.job_type / denom) * 100),
    ai_summary: Math.round((fillCounts.ai_summary / denom) * 100),
    languages: Math.round((fillCounts.languages / denom) * 100),
    local_company: Math.round((fillCounts.local_company / denom) * 100),
    company_description: Math.round((fillCounts.company_description / denom) * 100),
    company_logo: Math.round((fillCounts.company_logo / denom) * 100),
    contact_emails: Math.round((fillCounts.contact_emails / denom) * 100),
    apply_contact: Math.round((fillCounts.apply_contact / denom) * 100)
  };

  const trends: TrendDay[] = Object.entries(trendMap).map(([day, count]) => ({ day, count }));
  const sourceTrends: Record<SourceId, TrendDay[]> = {
    jobinrwanda: Object.entries(srcTrendMap.jobinrwanda).map(([day, count]) => ({ day, count })),
    brightermonday: Object.entries(srcTrendMap.brightermonday).map(([day, count]) => ({ day, count })),
    ndangira: Object.entries(srcTrendMap.ndangira).map(([day, count]) => ({ day, count })),
    greatrwandajobs: Object.entries(srcTrendMap.greatrwandajobs).map(([day, count]) => ({ day, count })),
    jobwebrwanda: Object.entries(srcTrendMap.jobwebrwanda).map(([day, count]) => ({ day, count }))
  };
  const industryDist: DistributionItem[] = Object.entries(industryMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const jobFunctionDist: DistributionItem[] = Object.entries(functionMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totals,
    fill,
    sources,
    capacity,
    errors: errorClassCounts,
    trends,
    sourceTrends,
    industryDist,
    jobFunctionDist,
    deadlineDist,
    issues,
    asOf: new Date().toLocaleTimeString()
  };
}

export async function fetchJobsExplorer(params: {
  page: number;
  pageSize: number;
  search?: string;
  source?: string;
  status?: string;
  quickFilter?: string;
}): Promise<{ rows: JobRow[]; total: number }> {
  if (!supabase) throw new Error("Supabase client is not configured");

  let query = supabase.from('jobs').select(
    'id,title,company,location,deadline,job_url,extraction_status,extraction_error,extraction_attempts,is_active,content_type,skip_reason,industry,job_function,experience_level_new,job_type_new,min_degree,salary_min,salary_max,deadline_source,scraped_at,duplicate_of_job_id,skills_t1',
    { count: 'exact' }
  );

  if (params.search) {
    const q = `%${params.search}%`;
    query = query.or(`title.ilike.${q},company.ilike.${q}`);
  }

  if (params.source && params.source !== 'all') {
    if (params.source === 'other') {
      query = query
        .not('job_url', 'ilike', '%jobinrwanda%')
        .not('job_url', 'ilike', '%brightermonday%')
        .not('job_url', 'ilike', '%ndangira%')
        .not('job_url', 'ilike', '%greatrwandajobs%')
        .not('job_url', 'ilike', '%jobwebrwanda%');
    } else {
      query = query.ilike('job_url', `%${params.source}%`);
    }
  }

  if (params.status && params.status !== 'all') {
    query = query.eq('extraction_status', params.status);
  }

  if (params.quickFilter) {
    const today = new Date().toISOString().split('T')[0];
    switch (params.quickFilter) {
      case 'active': query = query.eq('is_active', true); break;
      case 'unenriched': query = query.eq('is_active', true).is('industry', null); break;
      case 'at_cap': query = query.eq('extraction_status', 'failed').gte('extraction_attempts', 3); break;
      case 'no_deadline': query = query.eq('is_active', true).is('deadline', null); break;
      case 'expired': query = query.lt('deadline', today); break;
      case 'duplicate': query = query.not('duplicate_of_job_id', 'is', null); break;
    }
  }

  const offset = (params.page - 1) * params.pageSize;
  query = query.order('id', { ascending: false }).range(offset, offset + params.pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data as JobRow[]) || [], total: count || 0 };
}

export async function fetchJobDetail(id: string | number): Promise<JobDetail | null> {
  if (!supabase) throw new Error("Supabase client is not configured");

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as JobDetail;
}


export interface StagingFetchParams {
  source: SourceId;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortAsc?: boolean;
}

export interface StagingRowNormalized {
  id: string | number;
  title: string;
  company: string;
  location?: string | null;
  deadline?: string | null;
  url?: string | null;
  status?: string;
  error?: string | null;
  attempts?: number;
  scrapedAt?: string | null;
  promotedId?: string | number | null;
  contentType?: string | null;
  isDuplicate?: boolean;
  rawRecord: Record<string, any>;
}

export async function fetchStagingRows(params: {
  source: SourceId;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortAsc?: boolean;
}): Promise<{ rows: StagingRowNormalized[]; total: number }> {
  if (!supabase) throw new Error("Supabase client is not configured");

  const { source, page, pageSize, search, status, sortBy, sortAsc } = params;

  let tableName = 'raw_jobinrwanda_jobs';
  let cols = '*';
  let defaultSortCol = 'id';
  let defaultSortAsc = false;

  switch (source) {
    case 'jobinrwanda':
      tableName = 'raw_jobinrwanda_jobs';
      cols = 'id,job_url,source_url,title,company,location,deadline,extraction_status,extraction_error,scraped_at,promoted_job_id,content_type';
      defaultSortCol = 'scraped_at';
      break;
    case 'brightermonday':
      tableName = 'raw_brightermonday_jobs';
      cols = 'external_id,source_url,title,company_name,location_raw,valid_through_jsonld,extraction_status,extraction_error,extraction_attempts,content_type,scraped_at,last_seen_at,promoted_job_id';
      defaultSortCol = 'last_seen_at';
      break;
    case 'ndangira':
      tableName = 'raw_ndangira_jobs';
      cols = 'id,source_url,title_raw,title_clean,company_name,location_raw,deadline_date,extraction_status,extraction_error,extraction_attempts,is_duplicate,scraped_at,last_seen_at,promoted_job_id';
      defaultSortCol = 'last_seen_at';
      break;
    case 'greatrwandajobs':
      tableName = 'jobs_greatrwandajobs';
      cols = 'id,job_url,title,company,location,deadline,extraction_status,extraction_error,extraction_attempts,content_type,promoted_job_id';
      defaultSortCol = 'id';
      break;
    case 'jobwebrwanda':
      tableName = 'jobs_jobwebrwanda';
      cols = 'id,job_url,title,company,location,deadline';
      defaultSortCol = 'id';
      break;
  }

  let query = supabase.from(tableName).select(cols, { count: 'exact' });

  // Search filter
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    if (source === 'brightermonday') {
      query = query.or(`title.ilike.${q},company_name.ilike.${q}`);
    } else if (source === 'ndangira') {
      query = query.or(`title_raw.ilike.${q},title_clean.ilike.${q},company_name.ilike.${q}`);
    } else {
      query = query.or(`title.ilike.${q},company.ilike.${q}`);
    }
  }

  // Status filter (where column exists)
  if (status && status !== 'all' && source !== 'jobwebrwanda') {
    if (status === 'skipped') {
      query = query.ilike('extraction_status', 'skipped%');
    } else {
      query = query.eq('extraction_status', status);
    }
  }

  // Sorting
  const sortCol = sortBy || defaultSortCol;
  const ascending = sortAsc !== undefined ? sortAsc : defaultSortAsc;
  query = query.order(sortCol, { ascending, nullsFirst: false });

  // Pagination
  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    // If order by column failed (e.g. column doesn't exist), retry with order by default id
    if (sortBy && sortBy !== 'id') {
      const fallbackQuery = supabase
        .from(tableName)
        .select(cols, { count: 'exact' })
        .order(source === 'brightermonday' ? 'external_id' : 'id', { ascending: false })
        .range(offset, offset + pageSize - 1);
      const res = await fallbackQuery;
      if (res.error) throw res.error;
      return { rows: normalizeStagingData(source, res.data || []), total: res.count || 0 };
    }
    throw error;
  }

  return {
    rows: normalizeStagingData(source, data || []),
    total: count || 0
  };
}

function normalizeStagingData(source: SourceId, items: any[]): StagingRowNormalized[] {
  return items.map((r, i) => {
    switch (source) {
      case 'brightermonday':
        return {
          id: r.external_id || `bm_${i}`,
          title: r.title || 'Untitled Listing',
          company: r.company_name || '—',
          location: r.location_raw || null,
          deadline: r.valid_through_jsonld || null,
          url: r.source_url || null,
          status: r.extraction_status || 'pending',
          error: r.extraction_error || null,
          attempts: r.extraction_attempts || 0,
          scrapedAt: r.last_seen_at || r.scraped_at || null,
          promotedId: r.promoted_job_id || null,
          contentType: r.content_type || null,
          rawRecord: r
        };
      case 'ndangira':
        return {
          id: r.id || `nd_${i}`,
          title: r.title_clean || r.title_raw || 'Untitled Listing',
          company: r.company_name || '—',
          location: r.location_raw || null,
          deadline: r.deadline_date || null,
          url: r.source_url || null,
          status: r.extraction_status || 'pending',
          error: r.extraction_error || null,
          attempts: r.extraction_attempts || 0,
          scrapedAt: r.last_seen_at || r.scraped_at || null,
          promotedId: r.promoted_job_id || null,
          isDuplicate: !!r.is_duplicate,
          rawRecord: r
        };
      case 'greatrwandajobs':
        return {
          id: r.id || `grj_${i}`,
          title: r.title || 'Untitled Listing',
          company: r.company,
          location: r.location || null,
          deadline: r.deadline || null,
          url: r.job_url || null,
          status: r.extraction_status || 'pending',
          error: r.extraction_error || null,
          attempts: r.extraction_attempts || 0,
          promotedId: r.promoted_job_id || null,
          contentType: r.content_type || null,
          rawRecord: r
        };
      case 'jobwebrwanda':
        return {
          id: r.id || `jwr_${i}`,
          title: r.title || 'Untitled Listing',
          company: r.company || '—',
          location: r.location || null,
          deadline: r.deadline || null,
          url: r.job_url || null,
          status: 'unprocessed',
          rawRecord: r
        };
      case 'jobinrwanda':
      default:
        return {
          id: r.id || `jir_${i}`,
          title: r.title || 'Untitled Listing',
          company: r.company || '—',
          location: r.location || null,
          deadline: r.deadline || null,
          url: r.job_url || r.source_url || null,
          status: r.extraction_status || 'pending',
          error: r.extraction_error || null,
          attempts: 0,
          scrapedAt: r.scraped_at || null,
          promotedId: r.promoted_job_id || null,
          contentType: r.content_type || null,
          rawRecord: r
        };
    }
  });
}

export async function triggerSourceExtraction(source: SourceId, limit: number = 10): Promise<{ success: boolean; message: string; count?: number }> {
  if (!supabase) throw new Error("Supabase client is not configured");

  try {
    const { data, error } = await supabase.functions.invoke('ai-job-extractor', {
      body: { source, limit }
    });
    if (error) throw error;
    return {
      success: true,
      message: `Successfully triggered extraction for ${source} (limit: ${limit})`,
      count: data?.processed || data?.count || 0
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to trigger extraction'
    };
  }
}

export interface RepairAuditSource {
  source: string;
  name: string;
  count: number;
  eligibleForAi: number;
  noPipeline: boolean;
}

export interface RepairMissingField {
  field: string;
  count: number;
}

export interface RepairMissingDetailsAudit {
  totalAffected: number;
  eligibleForRepair: number;
  jobWebNoPipeline: number;
  bySource: RepairAuditSource[];
  missingFields: RepairMissingField[];
  auditToken?: string;
  auditedAt?: string;
}

export interface RepairMissingDetailsResult {
  success: boolean;
  message: string;
  runId?: string;
  status?: string;
  dryRun: boolean;
  summary: {
    selected: number;
    rescraped: number;
    updated: number;
    requeued: number;
    failed: number;
    jobWebHeld: number;
  };
  bySource: RepairAuditSource[];
  errors: string[];
  auditToken?: string;
}

const repairSourceName = (source: string) => {
  const key = source as SourceId;
  return SOURCES_CONFIG[key]?.name || source || 'Unknown source';
};

const normalizeRepairSources = (value: any): RepairAuditSource[] => {
  if (!value) return [];
  const entries: Array<[string, any]> = Array.isArray(value)
    ? value.map((item: any) => [item.source || item.id || item.name || 'unknown', item])
    : Object.entries(value);

  return entries.map(([source, raw]) => {
    const item = typeof raw === 'number' ? { count: raw } : (raw || {});
    const noPipeline = Boolean(item.noPipeline ?? item.no_pipeline ?? source === 'jobwebrwanda');
    const count = Number(item.count ?? item.total ?? item.affected ?? 0);
    return {
      source,
      name: item.name || repairSourceName(source),
      count,
      eligibleForAi: Number(item.eligibleForAi ?? item.eligible_for_ai ?? (noPipeline ? 0 : count)),
      noPipeline,
    };
  });
};

const normalizeMissingFields = (value: any): RepairMissingField[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item: any) => ({
      field: item.field || item.name || 'unknown',
      count: Number(item.count ?? item.total ?? 0),
    }));
  }
  return Object.entries(value).map(([field, count]) => ({ field, count: Number(count || 0) }));
};

export async function auditMissingDetailsRepair(): Promise<RepairMissingDetailsAudit> {
  const response = await fetch('/api/repair-missing-details/audit', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Audit failed (${response.status})`);

  const bySource = normalizeRepairSources(body.bySource ?? body.by_source ?? body.sources);
  const jobWeb = bySource.find((source) => source.source === 'jobwebrwanda');
  const totalAffected = Number(body.totalAffected ?? body.total_affected ?? body.total ?? bySource.reduce((sum, item) => sum + item.count, 0));
  const jobWebNoPipeline = Number(body.jobWebNoPipeline ?? body.jobweb_no_pipeline ?? jobWeb?.count ?? 0);
  return {
    totalAffected,
    eligibleForRepair: Number(body.eligibleForRepair ?? body.eligible_for_repair ?? Math.max(0, totalAffected - jobWebNoPipeline)),
    jobWebNoPipeline,
    bySource,
    missingFields: normalizeMissingFields(body.missingFields ?? body.missing_fields ?? body.fields),
    auditToken: body.auditToken ?? body.audit_token,
    auditedAt: body.auditedAt ?? body.audited_at ?? new Date().toISOString(),
  };
}

export async function runMissingDetailsRepair(options: {
  batchSize: number;
  dryRun: boolean;
  auditToken?: string;
}): Promise<RepairMissingDetailsResult> {
  const batchSize = Math.min(100, Math.max(1, Math.trunc(options.batchSize)));
  const response = await fetch('/api/repair-missing-details/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      batchSize,
      dryRun: options.dryRun,
      ...(options.auditToken ? { auditToken: options.auditToken } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Repair request failed (${response.status})`);

  const summary = body.summary || body.result || {};
  return {
    success: body.success !== false,
    message: body.message || (options.dryRun ? 'Dry run completed.' : 'Repair batch completed.'),
    runId: body.runId ?? body.run_id,
    status: body.status,
    dryRun: Boolean(body.dryRun ?? body.dry_run ?? options.dryRun),
    summary: {
      selected: Number(summary.selected ?? summary.scanned ?? body.selected ?? 0),
      rescraped: Number(summary.rescraped ?? summary.scraped ?? 0),
      updated: Number(summary.updated ?? summary.repaired ?? 0),
      requeued: Number(summary.requeued ?? summary.queued ?? 0),
      failed: Number(summary.failed ?? summary.errors ?? 0),
      jobWebHeld: Number(summary.jobWebHeld ?? summary.jobweb_held ?? 0),
    },
    bySource: normalizeRepairSources(body.bySource ?? body.by_source ?? summary.bySource),
    errors: Array.isArray(body.errors) ? body.errors.map(String) : [],
    auditToken: body.auditToken ?? body.audit_token ?? options.auditToken,
  };
}

export async function requeueFailedSourceRows(source: SourceId): Promise<{ success: boolean; message: string }> {
  if (!supabase) throw new Error("Supabase client is not configured");

  try {
    let tableName = '';
    switch (source) {
      case 'brightermonday': tableName = 'raw_brightermonday_jobs'; break;
      case 'ndangira': tableName = 'raw_ndangira_jobs'; break;
      case 'greatrwandajobs': tableName = 'jobs_greatrwandajobs'; break;
      case 'jobinrwanda': tableName = 'raw_jobinrwanda_jobs'; break;
      default: break;
    }

    if (tableName) {
      await supabase
        .from(tableName)
        .update({
          extraction_status: 'pending',
          extraction_error: null,
          extraction_attempts: 0
        })
        .eq('extraction_status', 'failed');
    }

    // Also requeue any failed rows attributed to this source in public.jobs
    const { error: jobsErr } = await supabase
      .from('jobs')
      .update({
        extraction_status: 'pending',
        extraction_error: null,
        extraction_attempts: 0,
        processing_started_at: null
      })
      .eq('extraction_status', 'failed')
      .ilike('job_url', `%${source}%`);

    if (jobsErr) throw jobsErr;

    return {
      success: true,
      message: `Requeued failed records for ${source}`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to requeue rows'
    };
  }
}

export const BASELINE_CRON_JOBS: CronJobInfo[] = [
  {
    jobid: 1,
    jobname: 'ai-job-extractor-drip',
    schedule: '*/3 * * * *',
    active: true,
    last_run: new Date(Date.now() - 2 * 60000).toISOString(),
    runs_24h: 480,
    failed_24h: 0,
    description: 'Drips up to 6 pending rows into AI extraction every 3 minutes'
  },
  {
    jobid: 2,
    jobname: 'deactivate-expired-jobs',
    schedule: '0 1 * * *',
    active: true,
    last_run: new Date(Date.now() - 14 * 3600000).toISOString(),
    runs_24h: 1,
    failed_24h: 0,
    description: 'Marks active jobs whose deadline has passed as inactive (runs daily at 01:00 UTC)'
  },
  {
    jobid: 3,
    jobname: 'flag-duplicate-jobs',
    schedule: '0 2 * * *',
    active: true,
    last_run: new Date(Date.now() - 13 * 3600000).toISOString(),
    runs_24h: 1,
    failed_24h: 0,
    description: 'Scans for matching dedup_key and flags duplicate_of_job_id (runs daily at 02:00 UTC)'
  },
  {
    jobid: 4,
    jobname: 'retry-failed-staging-rows',
    schedule: '*/15 * * * *',
    active: true,
    last_run: new Date(Date.now() - 8 * 60000).toISOString(),
    runs_24h: 96,
    failed_24h: 0,
    description: 'Retries failed staging table rows with extraction_attempts < 3'
  },
  {
    jobid: 5,
    jobname: 'retry-failed-jobs-drip',
    schedule: '*/2 * * * *',
    active: true,
    last_run: new Date(Date.now() - 1 * 60000).toISOString(),
    runs_24h: 720,
    failed_24h: 0,
    description: 'Drips up to 5 failed jobs with attempts < 3 back into pending every 2 minutes'
  }
];

export async function fetchCronOverview(): Promise<{ crons: CronJobInfo[]; isLive: boolean }> {
  if (!supabase) {
    return { crons: BASELINE_CRON_JOBS, isLive: false };
  }

  try {
    const { data, error } = await supabase.rpc('admin_cron_overview');
    if (error) {
      console.warn('admin_cron_overview RPC not available, using baseline config:', error.message);
      return { crons: BASELINE_CRON_JOBS, isLive: false };
    }

    if (Array.isArray(data) && data.length > 0) {
      const crons: CronJobInfo[] = data.map((item: any, idx: number) => ({
        jobid: item.jobid || item.job_id || idx + 1,
        jobname: item.jobname || item.name || item.job_name || 'unnamed_cron',
        schedule: item.schedule || '* * * * *',
        active: typeof item.active === 'boolean' ? item.active : true,
        last_run: item.last_run || item.last_run_at || null,
        runs_24h: typeof item.runs_24h === 'number' ? item.runs_24h : undefined,
        failed_24h: typeof item.recent_failures === 'number' ? item.recent_failures : (typeof item.failed_24h === 'number' ? item.failed_24h : undefined),
        description: item.description || BASELINE_CRON_JOBS.find(b => b.jobname === (item.jobname || item.name))?.description || 'Scheduled cron worker'
      }));
      return { crons, isLive: true };
    }

    return { crons: BASELINE_CRON_JOBS, isLive: false };
  } catch (err) {
    console.warn('fetchCronOverview exception:', err);
    return { crons: BASELINE_CRON_JOBS, isLive: false };
  }
}

export async function setCronJobActive(jobid: number, active: boolean): Promise<{ success: boolean; message: string }> {
  if (!supabase) {
    return { success: false, message: 'Supabase client is not initialized' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_set_cron_active', {
      p_jobid: jobid,
      p_active: active
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Cron job #${jobid} ${active ? 'resumed' : 'paused'} successfully`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to update cron job status'
    };
  }
}

export async function executeMaintenanceRpc(fnName: string, params: Record<string, any> = {}): Promise<{ success: boolean; message: string; result?: any }> {
  if (!supabase) {
    return { success: false, message: 'Supabase client is not initialized' };
  }

  try {
    const { data, error } = await supabase.rpc(fnName, params);
    if (error) {
      return { success: false, message: error.message };
    }

    let resultMsg = `Function ${fnName} completed successfully.`;
    if (typeof data === 'number') {
      resultMsg = `Successfully processed ${data} rows.`;
    } else if (data && typeof data === 'object') {
      resultMsg = JSON.stringify(data);
    }

    return {
      success: true,
      message: resultMsg,
      result: data
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || `Failed to execute ${fnName}`
    };
  }
}

/**
 * Data Quality & Vocabulary Studio Data Methods
 */

export async function fetchNearDuplicates(threshold: number = 0.7): Promise<{ pairs: NearDuplicatePair[]; count: number; isRpcAvailable: boolean }> {
  if (!supabase) return { pairs: [], count: 0, isRpcAvailable: false };

  try {
    const { data, error } = await supabase.rpc('admin_near_duplicates', { p_threshold: threshold });
    if (error) {
      console.warn('admin_near_duplicates RPC not available:', error.message);
      return { pairs: [], count: 0, isRpcAvailable: false };
    }

    if (Array.isArray(data)) {
      const pairs: NearDuplicatePair[] = data.map((item: any) => ({
        idA: item.job_id_a || item.id_a || item.job_id_1 || item.id1 || item.id_1 || item.id,
        titleA: item.title_a || item.title_1 || item.title1 || 'Job A',
        companyA: item.company_a || item.company_1 || item.company1 || 'Company A',
        idB: item.job_id_b || item.id_b || item.job_id_2 || item.id2 || item.id_2,
        titleB: item.title_b || item.title_2 || item.title2 || 'Job B',
        companyB: item.company_b || item.company_2 || item.company2 || 'Company B',
        similarity: typeof item.similarity === 'number' ? item.similarity : (typeof item.score === 'number' ? item.score : threshold)
      }));
      return { pairs, count: pairs.length, isRpcAvailable: true };
    }

    return { pairs: [], count: 0, isRpcAvailable: true };
  } catch (err) {
    console.warn('fetchNearDuplicates exception:', err);
    return { pairs: [], count: 0, isRpcAvailable: false };
  }
}

export async function fetchSkillVocabulary(): Promise<{
  total: number;
  approved: number;
  unapprovedTerms: SkillVocabularyItem[];
}> {
  if (!supabase) return { total: 0, approved: 0, unapprovedTerms: [] };

  try {
    const [totalRes, approvedRes, unapprovedRes] = await Promise.all([
      supabase.from('skill_vocabulary').select('*', { count: 'exact', head: true }),
      supabase.from('skill_vocabulary').select('*', { count: 'exact', head: true }).eq('is_approved', true),
      supabase.from('skill_vocabulary')
        .select('skill, canonical, usage_count, is_approved')
        .eq('is_approved', false)
        .order('usage_count', { ascending: false })
        .limit(25)
    ]);

    const total = totalRes.count || 0;
    const approved = approvedRes.count || 0;
    const unapprovedTerms: SkillVocabularyItem[] = (unapprovedRes.data as SkillVocabularyItem[]) || [];

    return { total, approved, unapprovedTerms };
  } catch (err) {
    console.warn('fetchSkillVocabulary error:', err);
    return { total: 0, approved: 0, unapprovedTerms: [] };
  }
}

export async function approveSkillVocabularyTerm(skill: string): Promise<{ success: boolean; message: string }> {
  if (!supabase) return { success: false, message: 'Supabase is not configured' };

  try {
    const { error } = await supabase
      .from('skill_vocabulary')
      .update({ is_approved: true })
      .eq('skill', skill);

    if (error) throw error;
    return { success: true, message: `Term "${skill}" approved successfully` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to approve skill term' };
  }
}

export async function fetchDownstreamReadiness(): Promise<DownstreamReadiness> {
  if (!supabase) return { users: 0, matchScores: 0, generatedCvs: 0, benchmarks: 0 };

  try {
    const [usersRes, matchRes, cvsRes, benchRes] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('match_scores').select('*', { count: 'exact', head: true }),
      supabase.from('generated_cvs').select('*', { count: 'exact', head: true }),
      supabase.from('salary_benchmarks').select('*', { count: 'exact', head: true })
    ]);

    return {
      users: usersRes.count || 0,
      matchScores: matchRes.count || 0,
      generatedCvs: cvsRes.count || 0,
      benchmarks: benchRes.count || 0
    };
  } catch (err) {
    console.warn('fetchDownstreamReadiness error:', err);
    return { users: 0, matchScores: 0, generatedCvs: 0, benchmarks: 0 };
  }
}

/**
 * Alerts & Incidents Center Helpers (Agent 8)
 */

export function clusterAlertsIntoBursts(alerts: OpsAlertEvent[], windowMinutes: number = 30): AlertBurst[] {
  if (!alerts || alerts.length === 0) return [];

  // Sort chronological for clustering
  const sorted = [...alerts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const windowMs = windowMinutes * 60 * 1000;

  const bursts: AlertBurst[] = [];
  let currentGroup: OpsAlertEvent[] = [];

  for (const event of sorted) {
    if (currentGroup.length === 0) {
      currentGroup.push(event);
    } else {
      const prevTime = new Date(currentGroup[currentGroup.length - 1].created_at).getTime();
      const currTime = new Date(event.created_at).getTime();

      if (currTime - prevTime <= windowMs) {
        currentGroup.push(event);
      } else {
        bursts.push(createBurstFromGroup(currentGroup, bursts.length + 1));
        currentGroup = [event];
      }
    }
  }

  if (currentGroup.length > 0) {
    bursts.push(createBurstFromGroup(currentGroup, bursts.length + 1));
  }

  // Return reverse chronological so newest burst is first
  return bursts.reverse();
}

function createBurstFromGroup(events: OpsAlertEvent[], index: number): AlertBurst {
  const startTime = events[0].created_at;
  const endTime = events[events.length - 1].created_at;
  const durationMinutes = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / (60 * 1000)));

  let dominantSeverity: 'critical' | 'warning' | 'info' = 'info';
  if (events.some(e => e.severity === 'critical')) {
    dominantSeverity = 'critical';
  } else if (events.some(e => e.severity === 'warning')) {
    dominantSeverity = 'warning';
  }

  const codes = Array.from(new Set(events.map(e => e.code)));
  const summary = events.find(e => e.severity === dominantSeverity)?.message || events[0].message;

  return {
    id: `burst-${index}-${new Date(startTime).getTime()}`,
    startTime,
    endTime,
    durationMinutes,
    count: events.length,
    dominantSeverity,
    codes,
    events: [...events].reverse(),
    summary
  };
}

export async function fetchAlertEvents(limit: number = 200): Promise<{
  alerts: OpsAlertEvent[];
  bursts: AlertBurst[];
  metrics: {
    total: number;
    last24h: number;
    burstsCount: number;
    latestTime: string | null;
    latestSeverity: 'critical' | 'warning' | 'info' | null;
  };
}> {
  if (!supabase) {
    return {
      alerts: [],
      bursts: [],
      metrics: { total: 0, last24h: 0, burstsCount: 0, latestTime: null, latestSeverity: null }
    };
  }

  try {
    const { data, error } = await supabase
      .from('ops_alert_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const alerts: OpsAlertEvent[] = data || [];

    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const last24h = alerts.filter(a => new Date(a.created_at).getTime() >= twentyFourHoursAgo).length;
    const bursts = clusterAlertsIntoBursts(alerts, 30);
    const latestTime = alerts.length > 0 ? alerts[0].created_at : null;
    const latestSeverity = alerts.length > 0 ? alerts[0].severity : null;

    return {
      alerts,
      bursts,
      metrics: {
        total: alerts.length,
        last24h,
        burstsCount: bursts.length,
        latestTime,
        latestSeverity
      }
    };
  } catch (err) {
    console.error('Failed to fetch alert events:', err);
    return {
      alerts: [],
      bursts: [],
      metrics: { total: 0, last24h: 0, burstsCount: 0, latestTime: null, latestSeverity: null }
    };
  }
}

export async function fetchLocalScraped(): Promise<Record<SourceId, any[]>> {
  try {
    const res = await fetch('/api/scrape/local');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch local scraped store:', err);
  }
  return {
    jobinrwanda: [],
    brightermonday: [],
    ndangira: [],
    greatrwandajobs: [],
    jobwebrwanda: []
  };
}

export async function syncLocalToStaging(source: SourceId, items?: any[]): Promise<SyncResult> {
  const res = await fetch('/api/scrape/sync-to-staging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, items })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}: Failed to sync ${source} to staging`);
  }
  return await res.json();
}

export async function compareLocalWithStaging(source: SourceId): Promise<CompareResult> {
  const res = await fetch(`/api/scrape/compare/${source}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}: Failed to compare ${source}`);
  }
  return await res.json();
}

/**
 * Data Quality Studio Helpers: Deadline Review & Duplicate Resolution
 */

export interface NoDeadlineJobRow {
  id: string | number;
  title: string;
  company: string;
  location: string | null;
  job_url: string;
  scraped_at: string | null;
  ai_summary: string | null;
  industry: string | null;
  job_function: string | null;
  experience_level_new: string | null;
  salary_min: number | null;
  salary_max: number | null;
}

export async function fetchJobsMissingDeadline(params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{ rows: NoDeadlineJobRow[]; total: number }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { page, pageSize, search } = params;
  let query = supabase
    .from('jobs')
    .select('id,title,company,location,job_url,scraped_at,ai_summary,industry,job_function,experience_level_new,salary_min,salary_max', { count: 'exact' })
    .eq('is_active', true)
    .is('deadline', null);

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`title.ilike.${q},company.ilike.${q}`);
  }

  const offset = (page - 1) * pageSize;
  query = query.order('scraped_at', { ascending: false, nullsFirst: false }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data as NoDeadlineJobRow[]) || [], total: count || 0 };
}

export async function updateJobDeadline(jobId: string | number, deadline: string): Promise<{ success: boolean; message: string }> {
  if (!supabase) return { success: false, message: "Supabase is not configured" };

  try {
    const { error } = await supabase
      .from('jobs')
      .update({
        deadline,
        deadline_source: 'manual'
      })
      .eq('id', jobId);

    if (error) throw error;
    return { success: true, message: `Updated deadline to ${deadline}` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update deadline' };
  }
}

export async function deactivateJob(jobId: string | number): Promise<{ success: boolean; message: string }> {
  if (!supabase) return { success: false, message: "Supabase is not configured" };

  try {
    const { error } = await supabase
      .from('jobs')
      .update({ is_active: false })
      .eq('id', jobId);

    if (error) throw error;
    return { success: true, message: "Job deactivated successfully" };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to deactivate job' };
  }
}

export async function deleteJob(jobId: string | number): Promise<{ success: boolean; message: string }> {
  if (!supabase) return { success: false, message: "Supabase is not configured" };

  try {
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId);

    if (error) throw error;
    return { success: true, message: "Job removed completely" };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to delete job' };
  }
}

export async function fetchJobPairDetails(idA: string | number, idB: string | number): Promise<{ jobA: JobDetail | null; jobB: JobDetail | null }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const [resA, resB] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', idA).maybeSingle(),
    supabase.from('jobs').select('*').eq('id', idB).maybeSingle()
  ]);

  return {
    jobA: resA.data as JobDetail | null,
    jobB: resB.data as JobDetail | null
  };
}

export async function resolveDuplicatePair(options: {
  pairIdA: string | number;
  pairIdB: string | number;
  action: 'keep_a_deactivate_b' | 'keep_b_deactivate_a' | 'delete_a' | 'delete_b';
}): Promise<{ success: boolean; message: string }> {
  if (!supabase) return { success: false, message: "Supabase is not configured" };

  const { pairIdA, pairIdB, action } = options;

  try {
    if (action === 'keep_a_deactivate_b') {
      const { error } = await supabase
        .from('jobs')
        .update({ is_active: false, duplicate_of_job_id: pairIdA })
        .eq('id', pairIdB);
      if (error) throw error;
      return { success: true, message: `Kept Job #${pairIdA} and flagged Job #${pairIdB} as duplicate (deactivated)` };
    } else if (action === 'keep_b_deactivate_a') {
      const { error } = await supabase
        .from('jobs')
        .update({ is_active: false, duplicate_of_job_id: pairIdB })
        .eq('id', pairIdA);
      if (error) throw error;
      return { success: true, message: `Kept Job #${pairIdB} and flagged Job #${pairIdA} as duplicate (deactivated)` };
    } else if (action === 'delete_b') {
      const { error } = await supabase.from('jobs').delete().eq('id', pairIdB);
      if (error) throw error;
      return { success: true, message: `Deleted Job #${pairIdB} from database` };
    } else if (action === 'delete_a') {
      const { error } = await supabase.from('jobs').delete().eq('id', pairIdA);
      if (error) throw error;
      return { success: true, message: `Deleted Job #${pairIdA} from database` };
    }

    return { success: false, message: "Unknown resolution action" };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to resolve duplicate pair' };
  }
}

export async function fetchActiveCompleteJobs(limit: number = 6): Promise<JobRow[]> {
  if (!supabase) return [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('jobs')
      .select('id, title, company, location, deadline, job_url, scraped_at, is_active, ai_summary, industry, job_function, experience_level_new, salary_min, salary_max')
      .eq('is_active', true)
      .not('ai_summary', 'is', null)
      .or(`deadline.gte.${today},deadline.is.null`)
      .order('scraped_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as unknown as JobRow[];
  } catch (err) {
    console.error('Error fetching active complete jobs:', err);
    return [];
  }
}
