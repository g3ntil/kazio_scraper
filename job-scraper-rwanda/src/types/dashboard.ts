export type PageId = 
  | 'overview'
  | 'pipeline'
  | 'sources'
  | 'jobs'
  | 'queue'
  | 'keys'
  | 'automation'
  | 'quality'
  | 'alerts'
  | 'stats'
  | 'tweet-generator';

export type SourceId = 
  | 'jobinrwanda'
  | 'brightermonday'
  | 'ndangira'
  | 'greatrwandajobs'
  | 'jobwebrwanda';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: 'SCRAPE' | 'STAGING' | 'AI' | 'CRON' | 'WARN' | 'ERROR' | 'INFO';
  message: string;
  source?: SourceId | 'system';
  details?: any;
}

export interface FunnelStageCounts {
  local: number;
  staged: number;
  live: number;
  stagedToLivePct: number;
}

export interface DashboardTotals {
  jobs: number;
  active: number;
  done: number;
  failed: number;
  pending: number;
  processing: number;
  skipped: number;
  atCap: number;
  enrichedActive: number;
  noDeadlineActive: number;
  expiredActive: number;
  dupsActive: number;
  stuck: number;
  newToday: number;
  other: number;
  funnelExtracted: number;
  funnelPending: number;
  funnelFailed: number;
  funnelSkipped: number;
}

export interface FieldCompleteness {
  deadline: number;
  salary: number;
  industry: number;
  job_function: number;
  skills_t1: number;
  min_degree: number;
  experience: number;
  job_type: number;
  ai_summary: number;
  languages: number;
  local_company: number;
  company_description: number;
  company_logo: number;
  contact_emails: number;
  apply_contact: number;
}

export interface SourceHealth {
  lvl: 'ok' | 'warn' | 'bad';
  label: string;
  errorRate: number;
  hoursSinceScrape: number | null;
}

export interface SourceMetrics {
  id: SourceId;
  name: string;
  domain: string;
  stagingTable: string;
  ingestionPath: string;
  notes: string[];
  noPipeline?: boolean;
  newToday: number;
  funnel: FunnelStageCounts;
  jobs: {
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
  };
  raw: {
    total: number;
    pending: number;
    failed: number;
    done: number;
    skipped: number;
    promoted: number;
    tender: number;
    lastSeen: string | null;
  };
  health: SourceHealth;
}

export interface GeminiKey {
  id: number;
  provider: string;
  status: string;
  active: boolean;
  last_used_at: string | null;
  fail_count: number;
  rpm_limit: number;
  rpd_limit: number;
  requests_today: number;
  day_window_start: string | null;
  rpm_blocked_until: string | null;
  rpd_blocked_until: string | null;
}

export interface CapacityMath {
  g: GeminiKey[];
  rpd: number;
  rpm: number;
  used: number;
  usable: number;
  awaiting: number;
  daysToClear: number;
}

export interface ErrorClassification {
  pool: number;
  rate429: number;
  overload503: number;
  short: number;
  other: number;
  total: number;
}

export interface TrendDay {
  day: string;
  count: number;
}

export interface DistributionItem {
  name: string;
  count: number;
}

export interface OpsAlertEvent {
  id: string | number;
  created_at: string;
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  metrics?: any;
}

export interface AlertBurst {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  count: number;
  dominantSeverity: 'critical' | 'warning' | 'info';
  codes: string[];
  events: OpsAlertEvent[];
  summary: string;
}

export interface CronJobInfo {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status?: string;
  runs_24h?: number;
  failed_24h?: number;
  description?: string;
}

export interface IssueCard {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  actionLabel?: string;
  targetPage?: PageId;
}

export interface AggregateDashboardData {
  totals: DashboardTotals;
  fill: FieldCompleteness;
  sources: Record<SourceId, SourceMetrics>;
  capacity: CapacityMath;
  errors: ErrorClassification;
  trends: TrendDay[];
  sourceTrends?: Record<SourceId, TrendDay[]>;
  industryDist: DistributionItem[];
  jobFunctionDist: DistributionItem[];
  deadlineDist: {
    source_field: number;
    ai: number;
    none: number;
  };
  issues: IssueCard[];
  asOf: string;
}

export interface JobRow {
  id: string | number;
  title: string;
  company: string | null;
  location: string | null;
  deadline: string | null;
  job_url: string;
  extraction_status: string;
  extraction_error: string | null;
  extraction_attempts: number;
  is_active: boolean;
  content_type: string | null;
  skip_reason: string | null;
  industry: string | null;
  job_function: string | null;
  experience_level_new: string | null;
  job_type_new: string | null;
  min_degree: string | null;
  salary_min: number | null;
  salary_max: number | null;
  deadline_source: string | null;
  scraped_at: string | null;
  duplicate_of_job_id: string | number | null;
  skills_t1: string[] | null;
}

export interface JobDetail extends JobRow {
  ai_summary: string | null;
  description: string | null;
  skills_t2: string[] | null;
  skills_t3: string[] | null;
  languages_required: string[] | null;
  contact_emails: string[] | null;
  apply_method: string | null;
  apply_contact: string | null;
  company_description: string | null;
  dedup_key: string | null;
  salary_is_estimated: boolean | null;
  published_on: string | null;
}

export interface NearDuplicatePair {
  idA: string | number;
  titleA: string;
  companyA: string;
  idB: string | number;
  titleB: string;
  companyB: string;
  similarity: number;
}

export interface AiDuplicateReview {
  decision: 'duplicate' | 'not_duplicate' | 'uncertain';
  confidence: number;
  canonicalJob: 'A' | 'B' | null;
  probabilities?: Partial<Record<'duplicate' | 'not_duplicate' | 'uncertain', number>>;
  reasonCodes?: string[];
  explanation?: string;
  model: string;
}

export interface SkillVocabularyItem {
  skill: string;
  canonical: string | null;
  usage_count: number;
  is_approved: boolean;
}

export interface DownstreamReadiness {
  users: number;
  matchScores: number;
  generatedCvs: number;
  benchmarks: number;
}

export interface SyncResult {
  status: string;
  syncedCount: number;
  newlyAdded: number;
  alreadyExisting: number;
  source: SourceId;
}

export interface CompareResult {
  source: SourceId;
  totalLocal: number;
  newlyAdded: number;
  alreadyExisting: number;
  items: (any & { isNewToStaging: boolean; lookupKey: string })[];
}
