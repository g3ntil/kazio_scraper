import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  Zap, 
  Pause, 
  PlayCircle, 
  Search, 
  Copy, 
  Check, 
  Terminal, 
  Layers, 
  Database, 
  ExternalLink,
  ChevronRight,
  Info,
  Sliders
} from 'lucide-react';
import { fetchCronOverview, setCronJobActive, executeMaintenanceRpc, BASELINE_CRON_JOBS } from '../services/dataService';
import { CronJobInfo } from '../types/dashboard';

interface TriggerInfo {
  name: string;
  table: string;
  timing: string;
  purpose: string;
  type: 'Normalization' | 'Constraint' | 'Pipeline Sync' | 'Sanitization';
}

interface EdgeFunctionInfo {
  name: string;
  version: string;
  jwtVerify: boolean;
  role: string;
  description: string;
  category: 'AI Pipeline' | 'Portal Scraper' | 'Quality & Deduplication' | 'Infrastructure';
}

const DATABASE_TRIGGERS: TriggerInfo[] = [
  {
    name: 'trg_a_normalize_job_row',
    table: 'public.jobs',
    timing: 'BEFORE INSERT OR UPDATE',
    purpose: 'Sanitizes text fields, computes deterministic dedup_key, strips HTML entities, and validates URL schemas.',
    type: 'Normalization'
  },
  {
    name: 'trg_enforce_tender_salary_null',
    table: 'public.jobs',
    timing: 'BEFORE INSERT OR UPDATE',
    purpose: 'Ensures content_type = "tender" always has NULL salary_min and salary_max to prevent benchmark distortion.',
    type: 'Constraint'
  },
  {
    name: 'trg_jobs_invoke_process_job',
    table: 'public.jobs',
    timing: 'AFTER INSERT',
    purpose: 'Dispatches pg_net webhook invoking process-job Edge Function when extraction_status is initialized as pending.',
    type: 'Pipeline Sync'
  },
  {
    name: 'trg_clean_brightermonday_description',
    table: 'raw_brightermonday_jobs',
    timing: 'BEFORE INSERT OR UPDATE',
    purpose: 'Strips bloated inline CSS/scripts and telemetry markup from raw HTML description payload.',
    type: 'Sanitization'
  },
  {
    name: 'trg_sync_raw_brightermonday_to_jobs',
    table: 'raw_brightermonday_jobs',
    timing: 'AFTER INSERT OR UPDATE',
    purpose: 'Syncs promoted rows from raw BrighterMonday staging into central public.jobs table.',
    type: 'Pipeline Sync'
  }
];

const EDGE_FUNCTIONS: EdgeFunctionInfo[] = [
  {
    name: 'ai-job-extractor',
    version: 'v3',
    jwtVerify: false,
    role: 'AI Batch Funnel Worker',
    description: 'Drips batch extractions through Gemini key pool with exponential backoff and rate limit handling.',
    category: 'AI Pipeline'
  },
  {
    name: 'process-job',
    version: 'v2',
    jwtVerify: false,
    role: 'Single Job Processor',
    description: 'Trigger-driven edge worker invoked on new job inserts to normalize and populate extraction queue.',
    category: 'AI Pipeline'
  },
  {
    name: 'pipeline-quality-check',
    version: 'v1',
    jwtVerify: true,
    role: 'Sanity & Gate Validator',
    description: 'Verifies field completeness and integrity thresholds across freshly extracted listings.',
    category: 'Quality & Deduplication'
  },
  {
    name: 'admin-cron-dispatcher',
    version: 'v2',
    jwtVerify: false,
    role: 'Cron Handler & Scheduler',
    description: 'Bridges pg_net webhook calls from database pg_cron into edge function workers.',
    category: 'Infrastructure'
  },
  {
    name: 'brightermonday-scraper',
    version: 'v1',
    jwtVerify: true,
    role: 'Dedicated Portal Scraper',
    description: 'Headless runner and JSON-LD scraper for BrighterMonday Rwanda listings.',
    category: 'Portal Scraper'
  },
  {
    name: 'ndangira-scraper',
    version: 'v1',
    jwtVerify: true,
    role: 'Dedicated Portal Scraper',
    description: 'Periodic fetcher and HTML parser for Ndangira Rwanda job opportunities.',
    category: 'Portal Scraper'
  },
  {
    name: 'jobinrwanda-scraper',
    version: 'v1',
    jwtVerify: true,
    role: 'Dedicated Portal Scraper',
    description: 'Automated ingestion pipeline for Job in Rwanda listings.',
    category: 'Portal Scraper'
  },
  {
    name: 'greatrwandajobs-scraper',
    version: 'v1',
    jwtVerify: true,
    role: 'Dedicated Portal Scraper',
    description: 'Joomla API connector and pagination crawler for Great Rwanda Jobs.',
    category: 'Portal Scraper'
  },
  {
    name: 'jobwebrwanda-scraper',
    version: 'v1',
    jwtVerify: true,
    role: 'Dedicated Portal Scraper',
    description: 'Feed collector and staging sink for JobWeb Rwanda.',
    category: 'Portal Scraper'
  },
  {
    name: 'dedup-embeddings',
    version: 'v1',
    jwtVerify: true,
    role: 'Vector Deduplication',
    description: 'Calculates cosine similarity on text embeddings for fuzzy job similarity matching.',
    category: 'Quality & Deduplication'
  },
  {
    name: 'salary-estimator',
    version: 'v1',
    jwtVerify: true,
    role: 'AI Benchmarking',
    description: 'Infers local Rwandan RWF salary brackets based on role, seniority, and industry standards.',
    category: 'AI Pipeline'
  }
];

export const AutomationPage: React.FC = () => {
  const [crons, setCrons] = useState<CronJobInfo[]>([]);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cronToggling, setCronToggling] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Search & Filter States
  const [cronSearch, setCronSearch] = useState<string>('');
  const [triggerSearch, setTriggerSearch] = useState<string>('');
  const [functionSearch, setFunctionSearch] = useState<string>('');
  const [functionCategory, setFunctionCategory] = useState<string>('all');
  const [copiedFunction, setCopiedFunction] = useState<string | null>(null);

  const loadCrons = async () => {
    setLoading(true);
    try {
      const res = await fetchCronOverview();
      setCrons(res.crons);
      setIsLive(res.isLive);
    } catch (err: any) {
      setMsg({ type: 'error', text: `Failed to load cron overview: ${err.message}` });
      setCrons(BASELINE_CRON_JOBS);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCrons();
  }, []);

  const handleToggleCron = async (cron: CronJobInfo) => {
    const nextState = !cron.active;
    setCronToggling(cron.jobid);
    setMsg(null);

    // Optimistic UI update
    setCrons(prev => prev.map(c => c.jobid === cron.jobid ? { ...c, active: nextState } : c));

    try {
      const res = await setCronJobActive(cron.jobid, nextState);
      if (res.success) {
        setMsg({ type: 'success', text: res.message });
      } else {
        // Revert on failure
        setCrons(prev => prev.map(c => c.jobid === cron.jobid ? { ...c, active: !nextState } : c));
        setMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setCrons(prev => prev.map(c => c.jobid === cron.jobid ? { ...c, active: !nextState } : c));
      setMsg({ type: 'error', text: `Error: ${err.message}` });
    } finally {
      setCronToggling(null);
    }
  };

  const handleRunMaintenance = async (fnName: string, label: string) => {
    setActionLoading(fnName);
    setMsg(null);
    try {
      const res = await executeMaintenanceRpc(fnName);
      if (res.success) {
        setMsg({ type: 'success', text: `[${label}] ${res.message}` });
      } else {
        setMsg({ type: 'error', text: `[${label}] Failed: ${res.message}` });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: `[${label}] Execution failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFunction(text);
    setTimeout(() => setCopiedFunction(null), 2000);
  };

  // Helper for humanizing cron schedules
  const humanizeCron = (cron: string) => {
    if (cron === '*/3 * * * *') return 'Every 3 minutes';
    if (cron === '*/2 * * * *') return 'Every 2 minutes';
    if (cron === '*/15 * * * *') return 'Every 15 minutes';
    if (cron === '0 1 * * *') return 'Daily at 01:00 UTC';
    if (cron === '0 2 * * *') return 'Daily at 02:00 UTC';
    if (cron === '0 * * * *') return 'Every hour on the hour';
    return 'Custom interval';
  };

  // Filtered crons
  const filteredCrons = useMemo(() => {
    return crons.filter(c => 
      c.jobname.toLowerCase().includes(cronSearch.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(cronSearch.toLowerCase())) ||
      c.schedule.toLowerCase().includes(cronSearch.toLowerCase())
    );
  }, [crons, cronSearch]);

  // Filtered triggers
  const filteredTriggers = useMemo(() => {
    return DATABASE_TRIGGERS.filter(t =>
      t.name.toLowerCase().includes(triggerSearch.toLowerCase()) ||
      t.table.toLowerCase().includes(triggerSearch.toLowerCase()) ||
      t.purpose.toLowerCase().includes(triggerSearch.toLowerCase())
    );
  }, [triggerSearch]);

  // Filtered edge functions
  const filteredFunctions = useMemo(() => {
    return EDGE_FUNCTIONS.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(functionSearch.toLowerCase()) ||
        f.role.toLowerCase().includes(functionSearch.toLowerCase()) ||
        f.description.toLowerCase().includes(functionSearch.toLowerCase());
      const matchesCategory = functionCategory === 'all' || f.category === functionCategory;
      return matchesSearch && matchesCategory;
    });
  }, [functionSearch, functionCategory]);

  const activeCronsCount = crons.filter(c => c.active).length;

  return (
    <div className="space-y-6 font-body pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">
              Automation &amp; Crons Center
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
              isLive ? 'bg-[#16813d]/10 text-[#16813d] border border-[#16813d]/20' : 'bg-[#a5690c]/10 text-[#a5690c] border border-[#a5690c]/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-[#16813d]' : 'bg-[#a5690c]'}`} />
              {isLive ? 'pg_cron Live' : 'Baseline Snapshot'}
            </span>
          </div>
          <p className="text-xs text-[#725a39] mt-1">
            Real-time monitor and management for Supabase pg_cron workers, maintenance RPC triggers, database triggers, and edge functions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadCrons}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white hover:bg-[#fbf9f5] border border-[#e6e2d6] text-xs font-semibold text-[#442a22] cursor-pointer transition-all shadow-xs disabled:opacity-50"
            title="Refresh cron states"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#725a39] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Message Banner */}
      {msg && (
        <div className={`p-4 rounded-lg text-xs font-semibold border flex items-center justify-between animate-fadeIn ${
          msg.type === 'success' 
            ? 'bg-[#16813d]/10 border-[#16813d]/20 text-[#16813d]' 
            : msg.type === 'error'
            ? 'bg-[#ba1a1a]/10 border-[#ba1a1a]/20 text-[#ba1a1a]'
            : 'bg-[#725a39]/10 border-[#725a39]/20 text-[#442a22]'
        }`}>
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
          <button 
            onClick={() => setMsg(null)}
            className="text-xs opacity-60 hover:opacity-100 cursor-pointer ml-4 font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#725a39] mb-1">
            <span>Active pg_cron Jobs</span>
            <Clock className="w-4 h-4 text-[#293417]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#442a22]">
            {activeCronsCount} <span className="text-xs font-sans font-normal text-[#725a39]">/ {crons.length} enabled</span>
          </div>
          <p className="text-[11px] text-[#725a39] mt-1">
            {crons.length - activeCronsCount === 0 ? 'All scheduled workers active' : `${crons.length - activeCronsCount} jobs currently paused`}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#725a39] mb-1">
            <span>Fastest Drip Cadence</span>
            <Zap className="w-4 h-4 text-[#16813d]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#442a22]">
            2 min
          </div>
          <p className="text-[11px] text-[#725a39] mt-1 font-mono">
            retry-failed-jobs-drip (≤5/batch)
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#725a39] mb-1">
            <span>Maintenance RPCs</span>
            <Sliders className="w-4 h-4 text-[#725a39]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#442a22]">
            4
          </div>
          <p className="text-[11px] text-[#725a39] mt-1">
            Deactivation, dedup &amp; retry handlers
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#725a39] mb-1">
            <span>Edge Functions</span>
            <Cpu className="w-4 h-4 text-[#293417]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#442a22]">
            11
          </div>
          <p className="text-[11px] text-[#725a39] mt-1">
            Scrapers, AI pipeline &amp; sanitizers
          </p>
        </div>
      </div>

      {/* SECTION 1: Scheduled Jobs Table */}
      <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#e6e2d6] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fbf9f5]">
          <div>
            <h2 className="text-sm font-sans font-bold text-[#442a22] tracking-wide flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#293417]" />
              Scheduled pg_cron Schedules
            </h2>
            <p className="text-[11px] text-[#725a39] mt-0.5">
              Automated database workers running inside PostgreSQL via pg_cron extension.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#725a39] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter cron jobs..."
              value={cronSearch}
              onChange={(e) => setCronSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-white text-xs text-[#442a22] placeholder:text-[#725a39]/60 focus:outline-none focus:border-[#442a22] w-full sm:w-56 font-body"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-xs text-[#725a39]">
            <RefreshCw className="w-5 h-5 animate-spin mb-2 text-[#293417]" />
            Loading cron schedule from PostgreSQL...
          </div>
        ) : filteredCrons.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#725a39]">
            No scheduled jobs match &ldquo;{cronSearch}&rdquo;
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4">Job Name</th>
                  <th className="py-3 px-4">Schedule</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Run (UTC)</th>
                  <th className="py-3 px-4">24h Activity</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e2d6]">
                {filteredCrons.map((c) => (
                  <tr key={c.jobid || c.jobname} className="hover:bg-[#fbf9f5]/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-[#442a22] flex items-center gap-1.5">
                        {c.jobname}
                      </div>
                      <div className="text-[10px] text-[#725a39]">ID: #{c.jobid}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-[#442a22] bg-[#fbf9f5] px-2 py-0.5 rounded-lg inline-block border border-[#e6e2d6]">
                        {c.schedule}
                      </div>
                      <div className="text-[10.5px] text-[#725a39] mt-0.5">
                        {humanizeCron(c.schedule)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        c.active 
                          ? 'bg-[#16813d]/10 text-[#16813d] border border-[#16813d]/20' 
                          : 'bg-[#725a39]/10 text-[#725a39] border border-[#725a39]/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-[#16813d]' : 'bg-[#725a39]'}`} />
                        {c.active ? 'Active' : 'Paused'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#725a39] text-[11px] whitespace-nowrap">
                      {c.last_run ? (
                        <div>
                          <div>{new Date(c.last_run).toISOString().replace('T', ' ').substring(0, 19)}</div>
                        </div>
                      ) : (
                        <span className="text-[#725a39]/60 italic">Scheduled next tick</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-[#725a39] font-mono text-[11px]">
                      {c.runs_24h !== undefined ? (
                        <div>
                          <span className="font-bold text-[#442a22]">{c.runs_24h}</span> runs
                          {c.failed_24h ? (
                            <span className="text-[#ba1a1a] ml-1.5">({c.failed_24h} failed)</span>
                          ) : (
                            <span className="text-[#16813d] ml-1.5">(0 fail)</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#725a39]/60">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-[#725a39] text-[11.5px] max-w-xs">
                      {c.description || 'Database maintenance worker'}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleToggleCron(c)}
                        disabled={cronToggling === c.jobid}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                          c.active
                            ? 'bg-white hover:bg-[#ba1a1a]/10 text-[#ba1a1a] border-[#e6e2d6] hover:border-[#ba1a1a]/30'
                            : 'bg-white hover:bg-[#16813d]/10 text-[#16813d] border-[#e6e2d6] hover:border-[#16813d]/30'
                        } disabled:opacity-50`}
                      >
                        {cronToggling === c.jobid ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : c.active ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {c.active ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: Run Maintenance Functions Now */}
      <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#293417]" />
              Run Maintenance Functions Now
            </h2>
            <p className="text-xs text-[#725a39] mt-0.5">
              Execute on-demand database maintenance routines directly via PostgreSQL RPC.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Function 1: Deactivate Expired Jobs */}
          <div className="p-4 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] flex flex-col justify-between hover:border-[#725a39]/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-bold text-[#442a22]">deactivate_expired_jobs()</span>
                <span className="text-[10px] font-semibold text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded-lg">RPC</span>
              </div>
              <p className="text-xs text-[#725a39] mb-4">
                Marks active jobs whose deadline has passed (deadline &lt; CURRENT_DATE) as inactive to prevent stale postings on Kazio.
              </p>
            </div>
            <div className="pt-2 border-t border-[#e6e2d6]/60 flex items-center justify-between">
              <span className="text-[11px] text-[#725a39] font-mono">cron: 0 1 * * *</span>
              <button
                onClick={() => handleRunMaintenance('deactivate_expired_jobs', 'Deactivate Expired Jobs')}
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#442a22] hover:bg-[#293417] text-white text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                {actionLoading === 'deactivate_expired_jobs' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Run Now
              </button>
            </div>
          </div>

          {/* Function 2: Flag Duplicate Jobs */}
          <div className="p-4 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] flex flex-col justify-between hover:border-[#725a39]/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-bold text-[#442a22]">flag_duplicate_jobs()</span>
                <span className="text-[10px] font-semibold text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded-lg">RPC</span>
              </div>
              <p className="text-xs text-[#725a39] mb-4">
                Scans for matching dedup_key collisions across active listings and populates duplicate_of_job_id pointers.
              </p>
            </div>
            <div className="pt-2 border-t border-[#e6e2d6]/60 flex items-center justify-between">
              <span className="text-[11px] text-[#725a39] font-mono">cron: 0 2 * * *</span>
              <button
                onClick={() => handleRunMaintenance('flag_duplicate_jobs', 'Flag Duplicate Jobs')}
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#442a22] hover:bg-[#293417] text-white text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                {actionLoading === 'flag_duplicate_jobs' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Run Now
              </button>
            </div>
          </div>

          {/* Function 3: Retry Failed Staging Rows */}
          <div className="p-4 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] flex flex-col justify-between hover:border-[#725a39]/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-bold text-[#442a22]">retry_failed_staging_rows()</span>
                <span className="text-[10px] font-semibold text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded-lg">RPC</span>
              </div>
              <p className="text-xs text-[#725a39] mb-4">
                Resets extraction_attempts and status to &lsquo;pending&rsquo; across all staging tables for rows under attempt limit (attempts &lt; 3).
              </p>
            </div>
            <div className="pt-2 border-t border-[#e6e2d6]/60 flex items-center justify-between">
              <span className="text-[11px] text-[#725a39] font-mono">cron: */15 * * * *</span>
              <button
                onClick={() => handleRunMaintenance('retry_failed_staging_rows', 'Retry Staging Failures')}
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#442a22] hover:bg-[#293417] text-white text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                {actionLoading === 'retry_failed_staging_rows' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Run Now
              </button>
            </div>
          </div>

          {/* Function 4: Retry Failed Jobs */}
          <div className="p-4 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] flex flex-col justify-between hover:border-[#725a39]/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-bold text-[#442a22]">retry_failed_jobs()</span>
                <span className="text-[10px] font-semibold text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded-lg">RPC</span>
              </div>
              <p className="text-xs text-[#725a39] mb-4">
                Drips failed rows in public.jobs with attempts &lt; 3 back into pending state for immediate AI re-extraction.
              </p>
            </div>
            <div className="pt-2 border-t border-[#e6e2d6]/60 flex items-center justify-between">
              <span className="text-[11px] text-[#725a39] font-mono">cron: */2 * * * *</span>
              <button
                onClick={() => handleRunMaintenance('retry_failed_jobs', 'Retry Failed Jobs')}
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#442a22] hover:bg-[#293417] text-white text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                {actionLoading === 'retry_failed_jobs' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Run Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Database Pipeline Triggers */}
      <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#e6e2d6] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fbf9f5]">
          <div>
            <h2 className="text-sm font-sans font-bold text-[#442a22] tracking-wide flex items-center gap-2">
              <Database className="w-4 h-4 text-[#293417]" />
              Database Pipeline Triggers
            </h2>
            <p className="text-[11px] text-[#725a39] mt-0.5">
              Automated database constraints and webhooks executing synchronously on insert/update events.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#725a39] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search triggers..."
              value={triggerSearch}
              onChange={(e) => setTriggerSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-white text-xs text-[#442a22] placeholder:text-[#725a39]/60 focus:outline-none focus:border-[#442a22] w-full sm:w-56 font-body"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4">Trigger Name</th>
                <th className="py-3 px-4">Table</th>
                <th className="py-3 px-4">Timing &amp; Event</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Purpose &amp; Mechanism</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e2d6]">
              {filteredTriggers.map((t) => (
                <tr key={t.name} className="hover:bg-[#fbf9f5]/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-[#442a22]">
                    {t.name}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#725a39]">
                    {t.table}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#442a22]">
                    <span className="bg-[#fbf9f5] px-2 py-0.5 rounded-lg border border-[#e6e2d6]">
                      {t.timing}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-lg bg-[#293417]/10 text-[#293417] text-[10px] font-bold uppercase tracking-wider">
                      {t.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[#725a39] text-[11.5px] leading-relaxed">
                    {t.purpose}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Deployed Edge Functions Reference */}
      <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#e6e2d6] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fbf9f5]">
          <div>
            <h2 className="text-sm font-sans font-bold text-[#442a22] tracking-wide flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#293417]" />
              Deployed Supabase Edge Functions
            </h2>
            <p className="text-[11px] text-[#725a39] mt-0.5">
              Serverless TypeScript microservices handling AI extraction, deduplication, and portal scraping.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={functionCategory}
              onChange={(e) => setFunctionCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-[#e6e2d6] bg-white text-xs text-[#442a22] focus:outline-none focus:border-[#442a22] font-body cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="AI Pipeline">AI Pipeline</option>
              <option value="Portal Scraper">Portal Scrapers</option>
              <option value="Quality &amp; Deduplication">Quality &amp; Dedup</option>
              <option value="Infrastructure">Infrastructure</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#725a39] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search functions..."
                value={functionSearch}
                onChange={(e) => setFunctionSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-white text-xs text-[#442a22] placeholder:text-[#725a39]/60 focus:outline-none focus:border-[#442a22] w-full sm:w-48 font-body"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4">Function Name</th>
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Auth / JWT</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Copy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e2d6]">
              {filteredFunctions.map((f) => (
                <tr key={f.name} className="hover:bg-[#fbf9f5]/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono">
                    <span className="font-bold text-[#442a22]">{f.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#725a39]">
                    <span className="bg-[#fbf9f5] px-2 py-0.5 rounded-lg border border-[#e6e2d6] text-[10.5px]">
                      {f.version}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-lg bg-[#725a39]/10 text-[#442a22] text-[10px] font-bold uppercase tracking-wider">
                      {f.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      f.jwtVerify 
                        ? 'bg-[#16813d]/10 text-[#16813d] border border-[#16813d]/20' 
                        : 'bg-[#a5690c]/10 text-[#a5690c] border border-[#a5690c]/20'
                    }`}>
                      {f.jwtVerify ? 'JWT Required' : 'Public / Anon'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-[#442a22]">
                    {f.role}
                  </td>
                  <td className="py-3.5 px-4 text-[#725a39] text-[11.5px] max-w-sm">
                    {f.description}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleCopy(f.name)}
                      className="p-1.5 rounded-lg hover:bg-[#ede9de] text-[#725a39] hover:text-[#442a22] transition-colors cursor-pointer"
                      title="Copy function name"
                    >
                      {copiedFunction === f.name ? (
                        <Check className="w-3.5 h-3.5 text-[#16813d]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AutomationPage;
