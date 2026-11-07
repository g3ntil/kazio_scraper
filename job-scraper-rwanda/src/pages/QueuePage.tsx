import React, { useState } from 'react';
import { 
  Play, 
  RefreshCw, 
  RotateCcw, 
  Ban, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Clock, 
  Zap, 
  Server, 
  ShieldAlert,
  Info,
  SearchCheck,
  Wrench,
  FileWarning
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { supabase } from '../lib/supabase';
import {
  auditMissingDetailsRepair,
  RepairMissingDetailsAudit,
  RepairMissingDetailsResult,
  runMissingDetailsRepair,
} from '../services/dataService';

export const QueuePage: React.FC = () => {
  const { data, loading, refreshAll } = useDashboard();
  
  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Form states for operations
  const [extractorSource, setExtractorSource] = useState<string>('');
  const [extractorLimit, setExtractorLimit] = useState<number>(2);
  const [retryLimit, setRetryLimit] = useState<number>(5);
  const [repairBatchSize, setRepairBatchSize] = useState<number>(25);
  const [repairAudit, setRepairAudit] = useState<RepairMissingDetailsAudit | null>(null);
  const [repairResult, setRepairResult] = useState<RepairMissingDetailsResult | null>(null);
  const [dryRunComplete, setDryRunComplete] = useState(false);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center">
        <div className="w-10 h-10 border-3 border-[#293417] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#442a22] font-sans">Loading AI Extraction Queue...</p>
        <p className="text-xs text-[#725a39] mt-1 font-body">Aggregating queue statuses across central database and staging tables</p>
      </div>
    );
  }

  const totals = data?.totals;
  const capacity = data?.capacity;
  const errors = data?.errors;
  const sources = data?.sources;

  // Staging sums (excluding unpipelineable sources)
  const stgPending = (sources?.jobinrwanda?.raw?.pending || 0) + (sources?.brightermonday?.raw?.pending || 0) +
                     (sources?.ndangira?.raw?.pending || 0) +
                     (sources?.greatrwandajobs?.raw?.pending || 0);

  const stgFailed = (sources?.jobinrwanda?.raw?.failed || 0) + (sources?.brightermonday?.raw?.failed || 0) +
                    (sources?.ndangira?.raw?.failed || 0) +
                    (sources?.greatrwandajobs?.raw?.failed || 0);

  const totalSkipped = (totals?.skipped || 0) +
                       (sources?.jobinrwanda?.raw?.skipped || 0) +
                       (sources?.brightermonday?.raw?.skipped || 0) +
                       (sources?.ndangira?.raw?.skipped || 0) +
                       (sources?.greatrwandajobs?.raw?.skipped || 0);

  // Staged tenders estimate for BrighterMonday
  const stagedTendersCount = sources?.brightermonday?.raw?.tender || 0;

  // Table breakdown rows
  const queueTableRows = [
    {
      name: 'public.jobs',
      type: 'Central Database',
      pending: totals?.pending || 0,
      processing: totals?.processing || 0,
      failed: totals?.failed || 0,
      atCap: totals?.atCap || 0,
      done: totals?.done || 0,
      skipped: totals?.skipped || 0,
      drainedBy: 'process-job via retry-failed-jobs-drip (5 rows / 2 min, 3-attempt cap)',
      isStaging: false,
    },
    {
      name: 'raw_brightermonday_jobs',
      type: 'BrighterMonday Staging',
      pending: sources?.brightermonday?.raw?.pending || 0,
      processing: null,
      failed: sources?.brightermonday?.raw?.failed || 0,
      atCap: null,
      done: sources?.brightermonday?.raw?.done || 0,
      skipped: sources?.brightermonday?.raw?.skipped || 0,
      drainedBy: 'ai-job-extractor-drip (2 rows/source / 3 min) + retry-failed-staging-rows',
      isStaging: true,
    },
    {
      name: 'raw_ndangira_jobs',
      type: 'Ndangira Staging',
      pending: sources?.ndangira?.raw?.pending || 0,
      processing: null,
      failed: sources?.ndangira?.raw?.failed || 0,
      atCap: null,
      done: sources?.ndangira?.raw?.done || 0,
      skipped: sources?.ndangira?.raw?.skipped || 0,
      drainedBy: 'ai-job-extractor-drip (2 rows/source / 3 min) + retry-failed-staging-rows',
      isStaging: true,
    },
    {
      name: 'jobs_greatrwandajobs',
      type: 'Great Rwanda Jobs Staging',
      pending: sources?.greatrwandajobs?.raw?.pending || 0,
      processing: null,
      failed: sources?.greatrwandajobs?.raw?.failed || 0,
      atCap: null,
      done: sources?.greatrwandajobs?.raw?.done || 0,
      skipped: sources?.greatrwandajobs?.raw?.skipped || 0,
      drainedBy: 'ai-job-extractor-drip (2 rows/source / 3 min) + retry-failed-staging-rows',
      isStaging: true,
    },
    {
      name: 'raw_jobinrwanda_jobs',
      type: 'Job in Rwanda Staging',
      pending: sources?.jobinrwanda?.raw?.pending || 0,
      processing: null,
      failed: sources?.jobinrwanda?.raw?.failed || 0,
      atCap: null,
      done: sources?.jobinrwanda?.raw?.done || 0,
      skipped: sources?.jobinrwanda?.raw?.skipped || 0,
      drainedBy: 'ai-job-extractor + scheduled staging retries',
      isStaging: true,
    },
    {
      name: 'jobs_jobwebrwanda',
      type: 'JobWeb Rwanda Staging',
      pending: 0,
      processing: null,
      failed: 0,
      atCap: null,
      done: 0,
      skipped: 0,
      drainedBy: 'Excluded by request; historical rows are not queued',
      isStaging: true,
      warn: true,
    },
  ];

  // Error category breakdown data
  const totalErrors = (errors?.rate429 || 0) +
                      (errors?.pool || 0) +
                      (errors?.overload503 || 0) +
                      (errors?.short || 0) +
                      (errors?.other || 0);

  const errorCategories = [
    {
      id: 'rate429',
      label: 'Gemini 429 — Rate / Quota Limited',
      count: errors?.rate429 || 0,
      color: 'red',
      kind: 'Transient',
      note: 'Retried automatically while under 3 attempts; after that the retry cron skips the row.',
    },
    {
      id: 'pool',
      label: 'All Keys Exhausted or Cooling Down',
      count: errors?.pool || 0,
      color: 'amber',
      kind: 'Pool Exhausted',
      note: 'No usable key available in the pool. Also raises a critical alert in ops_alert_events.',
    },
    {
      id: 'overload503',
      label: 'Gemini 503 — Model Overloaded',
      count: errors?.overload503 || 0,
      color: 'red',
      kind: 'Transient',
      note: 'Google server-side transient load surge; retried automatically on subsequent cron cycles.',
    },
    {
      id: 'short',
      label: 'Short / Missing Job Description',
      count: errors?.short || 0,
      color: 'gray',
      kind: 'Gated',
      note: 'Gated prior to AI extraction (< 100 chars or missing description body).',
    },
    {
      id: 'other',
      label: 'Other Unclassified Failures',
      count: errors?.other || 0,
      color: 'gray',
      kind: 'Other',
      note: 'Other network, timeout, or schema parsing exceptions.',
    },
  ];

  // ================= ACTION HANDLERS =================

  const handleTriggerExtractor = async () => {
    if (!supabase) return;
    setActionLoading('trigger_extractor');
    setFeedback(null);
    try {
      const payload: Record<string, any> = { limit: Number(extractorLimit) || 2 };
      if (extractorSource) {
        payload.source = extractorSource;
      }

      const { data: res, error } = await supabase.functions.invoke('ai-job-extractor', {
        body: payload,
      });

      if (error) throw error;
      if (res?.error || res?.stopped) throw new Error(res.error || res.stopped);
      const failures = res?.results?.filter((row: any) => row.status === 'failed' || row.status === 'error');
      if (failures?.length) throw new Error(failures.map((row: any) => row.error).join('; '));
      setFeedback({
        type: 'success',
        message: `AI Extractor checked ${res?.processed ?? 0} rows (${extractorSource ? extractorSource : 'all sources'}). Review row statuses for inserted, duplicate, and skipped results.`,
      });
      await refreshAll();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Extractor trigger failed: ${err.message || 'Edge function error'}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryFailedJobs = async () => {
    if (!supabase) return;
    setActionLoading('retry_failed_jobs');
    setFeedback(null);
    try {
      // First attempt RPC if present
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('retry_failed_jobs', {
        p_max_attempts: 3,
        p_limit: Number(retryLimit) || 5,
      });

      if (rpcErr) {
        // Fallback: fetch oldest failed job IDs under 3 attempts, then update
        const { data: failedRows, error: selectErr } = await supabase
          .from('jobs')
          .select('id')
          .eq('extraction_status', 'failed')
          .eq('is_active', true)
          .lt('extraction_attempts', 3)
          .limit(Number(retryLimit) || 5);

        if (selectErr) throw selectErr;

        if (failedRows && failedRows.length > 0) {
          const ids = failedRows.map((r: any) => r.id);
          const { error: patchErr } = await supabase
            .from('jobs')
            .update({
              extraction_attempts: 0,
              extraction_status: 'pending',
              extraction_error: null,
              processing_started_at: null,
            })
            .in('id', ids);

          if (patchErr) throw patchErr;
        }

        setFeedback({
          type: 'success',
          message: `Requeued ${failedRows?.length || 0} failed jobs for retry.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `retry_failed_jobs RPC completed successfully (${rpcRes ?? retryLimit} rows processed).`,
        });
      }
      await refreshAll();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Failed retrying failed jobs: ${err.message}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetCapJobs = async () => {
    if (!supabase) return;
    setActionLoading('reset_cap_jobs');
    setFeedback(null);
    try {
      // First try heal_pipeline RPC
      const { data: healRes, error: healErr } = await supabase.rpc('heal_pipeline', { p_limit: 300 });
      if (!healErr && healRes) {
        setFeedback({
          type: 'success',
          message: `heal_pipeline ran successfully: ${healRes.jobs_reset ?? 0} jobs reset, ${healRes.staging_requeued ?? 0} staging rows requeued.`,
        });
      } else {
        const { error } = await supabase
          .from('jobs')
          .update({
            extraction_attempts: 0,
            extraction_status: 'pending',
            extraction_error: null,
            processing_started_at: null,
          })
          .eq('extraction_status', 'failed')
          .eq('is_active', true)
          .or('extraction_error.ilike.*429*,extraction_error.ilike.*503*,extraction_error.ilike.*quota*,extraction_error.ilike.*rate*,extraction_error.ilike.*overload*,extraction_error.ilike.*timeout*,extraction_error.ilike.*billing*,extraction_error.ilike.*credits*,extraction_error.ilike.*prepayment*');

        if (error) throw error;
        setFeedback({
          type: 'success',
          message: 'Successfully reset retry attempts on jobs with transient errors! Rows requeued.',
        });
      }
      await refreshAll();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Failed resetting jobs retry cap: ${err.message}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetCapStaging = async () => {
    if (!supabase) return;
    setActionLoading('reset_cap_staging');
    setFeedback(null);
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('retry_failed_staging_rows', { p_max_attempts: 3 });
      if (!rpcErr) {
        setFeedback({
          type: 'success',
          message: `Successfully requeued ${rpcRes ?? 0} failed staging rows via retry_failed_staging_rows RPC.`,
        });
      } else {
        const tables = ['raw_brightermonday_jobs', 'raw_ndangira_jobs', 'jobs_greatrwandajobs'];
        for (const table of tables) {
          await supabase
            .from(table)
            .update({
              extraction_attempts: 0,
              extraction_status: 'pending',
              extraction_error: null,
            })
            .eq('extraction_status', 'failed');
        }

        setFeedback({
          type: 'success',
          message: 'Successfully reset failed staging rows back to pending across all staging tables.',
        });
      }
      await refreshAll();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Failed resetting staging tables: ${err.message}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkipTenders = async () => {
    if (!supabase) return;
    setActionLoading('skip_tenders');
    setFeedback(null);
    try {
      const { error } = await supabase
        .from('raw_brightermonday_jobs')
        .update({ extraction_status: 'skipped_tender' })
        .in('content_type', ['tender', 'paid_program'])
        .in('extraction_status', ['pending', 'failed']);

      if (error) throw error;
      setFeedback({
        type: 'success',
        message: 'Marked staged BrighterMonday tenders as skipped_tender to prevent AI call waste.',
      });
      await refreshAll();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Failed marking tenders as skipped: ${err.message}`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRepairAudit = async () => {
    setActionLoading('repair_audit');
    setFeedback(null);
    setRepairResult(null);
    setDryRunComplete(false);
    try {
      const audit = await auditMissingDetailsRepair();
      setRepairAudit(audit);
      setFeedback({ type: 'success', message: `Audit found ${audit.totalAffected.toLocaleString()} jobs with details to repair.` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Repair audit failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRepairRun = async (dryRun: boolean) => {
    if (!repairAudit) return;
    const batchSize = Math.min(100, Math.max(1, Number(repairBatchSize) || 1));
    setRepairBatchSize(batchSize);
    setActionLoading(dryRun ? 'repair_dry_run' : 'repair_run');
    setFeedback(null);
    try {
      const result = await runMissingDetailsRepair({ batchSize, dryRun, auditToken: repairAudit.auditToken });
      setRepairResult(result);
      if (dryRun) setDryRunComplete(true);
      setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
      if (!dryRun && result.success) await refreshAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `${dryRun ? 'Dry run' : 'Repair batch'} failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const callsQuotaRatio = capacity ? (capacity.used / Math.max(capacity.rpd, 1)) : 0;

  return (
    <div className="space-y-6 font-body text-[#442a22]">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">
            Extraction Queue
          </h1>
          <p className="text-xs text-[#725a39] mt-0.5">
            What is waiting for the AI, what failed and why, and the operational controls to push it through.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshAll()}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#fbf9f5] border border-[#e6e2d6] text-[#442a22] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast / Alert */}
      {feedback && (
        <div 
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
            feedback.type === 'success' 
              ? 'bg-[#16813d]/10 border-[#16813d]/30 text-[#16813d]' 
              : feedback.type === 'error'
              ? 'bg-[#ba1a1a]/10 border-[#ba1a1a]/30 text-[#ba1a1a]'
              : 'bg-[#a5690c]/10 border-[#a5690c]/30 text-[#a5690c]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {feedback.type === 'error' && <ShieldAlert className="w-4 h-4 shrink-0" />}
            {feedback.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button 
            onClick={() => setFeedback(null)} 
            className="text-[11px] underline ml-4 cursor-pointer hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Targeted repair: audit and dry-run are mandatory safeguards. */}
      <section className="rounded-lg bg-[#f7f3e9] p-4 md:p-5 shadow-sm space-y-5" aria-labelledby="repair-missing-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-[#293417]" />
              <h2 id="repair-missing-title" className="font-sans text-base font-bold text-[#442a22]">Repair missing job details</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#725a39]">
              Rescrape only incomplete jobs, keep existing good values, then requeue AI extraction when a trusted description is recovered.
            </p>
          </div>
          <span className="self-start rounded-lg bg-[#293417]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#293417]">
            Targeted operation
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-white p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#725a39]">1 · Audit</p>
            <p className="mt-1 text-xs text-[#442a22]">Count affected jobs and missing fields without changing data.</p>
          </div>
          <div className="rounded-lg bg-white p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#725a39]">2 · Dry run</p>
            <p className="mt-1 text-xs text-[#442a22]">Preview the bounded batch and confirm source eligibility.</p>
          </div>
          <div className="rounded-lg bg-white p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#725a39]">3 · Repair</p>
            <p className="mt-1 text-xs text-[#442a22]">Rescrape, validate, update and requeue only the previewed scope.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <button
            type="button"
            onClick={handleRepairAudit}
            disabled={actionLoading !== null}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#442a22] px-5 text-xs font-semibold text-[#fbf9f5] shadow-sm transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SearchCheck className={`h-4 w-4 ${actionLoading === 'repair_audit' ? 'animate-pulse' : ''}`} />
            {actionLoading === 'repair_audit' ? 'Auditing…' : repairAudit ? 'Run audit again' : 'Audit incomplete jobs'}
          </button>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#725a39]">
            Batch size (1–100)
            <input
              type="number"
              min={1}
              max={100}
              value={repairBatchSize}
              onChange={(event) => {
                setRepairBatchSize(Number(event.target.value));
                setDryRunComplete(false);
              }}
              className="h-12 w-full rounded-lg bg-white px-3 font-mono text-sm font-semibold text-[#442a22] outline-none ring-1 ring-[#e6e2d6] focus:ring-2 focus:ring-[#293417] sm:w-32"
            />
          </label>
          <button
            type="button"
            onClick={() => handleRepairRun(true)}
            disabled={!repairAudit || actionLoading !== null || repairAudit.eligibleForRepair === 0}
            className="h-12 rounded-lg bg-white px-5 text-xs font-semibold text-[#442a22] shadow-sm ring-1 ring-[#e6e2d6] transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionLoading === 'repair_dry_run' ? 'Checking batch…' : 'Preview dry run'}
          </button>
          <button
            type="button"
            onClick={() => handleRepairRun(false)}
            disabled={!repairAudit || !dryRunComplete || actionLoading !== null || repairAudit.eligibleForRepair === 0}
            className="h-12 rounded-lg bg-[#293417] px-5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
            title={!dryRunComplete ? 'Complete a dry run for this batch size first' : 'Run the previewed repair batch'}
          >
            {actionLoading === 'repair_run' ? 'Repairing…' : `Repair up to ${Math.min(100, Math.max(1, repairBatchSize || 1))}`}
          </button>
        </div>

        {repairAudit && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-[#442a22]">Affected by source</h3>
                <span className="font-mono text-lg font-bold text-[#442a22]">{repairAudit.totalAffected.toLocaleString()}</span>
              </div>
              <div className="mt-3 space-y-2">
                {repairAudit.bySource.filter((source) => !source.noPipeline).map((source) => (
                  <div key={source.source} className="flex items-center justify-between rounded-lg bg-[#fbf9f5] px-3 py-2 text-xs">
                    <span className="font-medium text-[#442a22]">{source.name}</span>
                    <span className="font-mono font-bold text-[#293417]">{source.count.toLocaleString()}</span>
                  </div>
                ))}
                {repairAudit.bySource.length === 0 && <p className="text-xs text-[#725a39]">No source breakdown was returned.</p>}
              </div>
            </div>

            <div className="rounded-lg bg-white p-4">
              <h3 className="text-xs font-bold text-[#442a22]">Missing fields</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {repairAudit.missingFields.map((item) => (
                  <span key={item.field} className="rounded-lg bg-[#725a39]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#725a39]">
                    {item.field.replaceAll('_', ' ')} · {item.count.toLocaleString()}
                  </span>
                ))}
                {repairAudit.missingFields.length === 0 && <p className="text-xs text-[#725a39]">No field breakdown was returned.</p>}
              </div>
            </div>
          </div>
        )}

        {repairAudit && repairAudit.jobWebNoPipeline > 0 && (
          <div className="flex items-start gap-3 rounded-lg bg-[#a5690c]/10 p-3.5 text-[#725a39]">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-[#a5690c]" />
            <div>
              <p className="text-xs font-bold text-[#442a22]">JobWeb Rwanda is held outside the AI queue</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                {repairAudit.jobWebNoPipeline.toLocaleString()} affected item{repairAudit.jobWebNoPipeline === 1 ? '' : 's'} can be audited and preserved, but will not be sent to AI because this source has no promotion pipeline.
              </p>
            </div>
          </div>
        )}

        {repairResult && (
          <div className="rounded-lg bg-[#442a22] p-4 text-[#fbf9f5]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold">{repairResult.dryRun ? 'Dry-run preview' : 'Latest repair result'}</h3>
              <span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider">{repairResult.status || (repairResult.success ? 'Complete' : 'Needs attention')}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Selected', repairResult.summary.selected],
                ['Rescraped', repairResult.summary.rescraped],
                ['Updated', repairResult.summary.updated],
                ['AI requeued', repairResult.summary.requeued],
                ['Failed', repairResult.summary.failed],
                ['JobWeb held', repairResult.summary.jobWebHeld],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-white/10 p-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#e6e2d6]">{label}</p>
                  <p className="mt-1 font-mono text-lg font-bold">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </div>
            {repairResult.errors.length > 0 && <p className="mt-3 text-[11px] text-[#f7c7bd]">{repairResult.errors.slice(0, 3).join(' · ')}</p>}
          </div>
        )}
      </section>

      {/* 6 Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Jobs Pending */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider block">
            Jobs Pending
          </span>
          <span className="text-2xl font-mono font-bold text-[#442a22] mt-1 block">
            {(totals?.pending || 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-[#725a39] mt-0.5 block truncate" title="waiting for process-job">
            waiting for process-job
          </span>
        </div>

        {/* Card 2: Processing Now */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider block">
            Processing Now
          </span>
          <span className="text-2xl font-mono font-bold text-[#293417] mt-1 block">
            {(totals?.processing || 0).toLocaleString()}
          </span>
          <span className={`text-[11px] mt-0.5 block truncate ${totals?.stuck ? 'text-[#ba1a1a] font-semibold' : 'text-[#725a39]'}`}>
            {totals?.stuck ? `${totals.stuck} stuck > 5 min` : 'none stuck'}
          </span>
        </div>

        {/* Card 3: Jobs Failed */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider block">
            Jobs Failed
          </span>
          <span className={`text-2xl font-mono font-bold mt-1 block ${totals?.failed ? 'text-[#ba1a1a]' : 'text-[#442a22]'}`}>
            {(totals?.failed || 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-[#ba1a1a] mt-0.5 block truncate">
            {(totals?.atCap || 0).toLocaleString()} at retry cap
          </span>
        </div>

        {/* Card 4: Staging Pending */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider block">
            Staging Pending
          </span>
          <span className={`text-2xl font-mono font-bold mt-1 block ${stgPending > 0 ? 'text-[#a5690c]' : 'text-[#442a22]'}`}>
            {stgPending.toLocaleString()}
          </span>
          <span className="text-[11px] text-[#725a39] mt-0.5 block truncate" title="awaiting ai-job-extractor">
            awaiting ai-job-extractor
          </span>
        </div>

        {/* Card 5: Staging Failed */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider block">
            Staging Failed
          </span>
          <span className={`text-2xl font-mono font-bold mt-1 block ${stgFailed > 0 ? 'text-[#ba1a1a]' : 'text-[#442a22]'}`}>
            {stgFailed.toLocaleString()}
          </span>
          <span className="text-[11px] text-[#725a39] mt-0.5 block truncate" title="requeued every 2 min if transient">
            requeued if transient
          </span>
        </div>

        {/* Card 6: Skipped by Gates */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs">
          <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider block">
            Skipped by Gates
          </span>
          <span className="text-2xl font-mono font-bold text-[#725a39] mt-1 block">
            {totalSkipped.toLocaleString()}
          </span>
          <span className="text-[11px] text-[#725a39] mt-0.5 block truncate" title="gated before AI / tender">
            gated before AI / tender
          </span>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Queue by Table + Why Extractions Fail (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section: Queue by Table */}
          <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#e6e2d6] bg-[#fbf9f5]/60 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                  Queue by Table
                </h2>
                <p className="text-[11px] text-[#725a39] mt-0.5">
                  Live status counts across central database and 5 staging tables
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#725a39]">
                {queueTableRows.length} tables
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#e6e2d6] bg-[#fbf9f5] text-[10px] font-bold text-[#725a39] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Table Name</th>
                    <th className="py-2.5 px-2.5 text-right">Pending</th>
                    <th className="py-2.5 px-2.5 text-right">Processing</th>
                    <th className="py-2.5 px-2.5 text-right">Failed</th>
                    <th className="py-2.5 px-2.5 text-right">At Cap</th>
                    <th className="py-2.5 px-2.5 text-right">Done</th>
                    <th className="py-2.5 px-2.5 text-right">Skipped</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Drained By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e2d6]">
                  {queueTableRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#fbf9f5]/80 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-[#442a22] text-[11.5px]">
                          {row.name}
                        </div>
                        <div className="text-[10px] text-[#725a39] mt-0.5">
                          {row.type}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono font-semibold text-[#442a22]">
                        {row.pending.toLocaleString()}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-[#725a39]">
                        {row.processing !== null ? row.processing.toLocaleString() : '—'}
                      </td>
                      <td className={`py-3 px-2.5 text-right font-mono font-semibold ${row.failed > 0 ? 'text-[#ba1a1a]' : 'text-[#725a39]'}`}>
                        {row.failed.toLocaleString()}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-[#ba1a1a]">
                        {row.atCap !== null ? row.atCap.toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-[#16813d]">
                        {row.done.toLocaleString()}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-[#725a39]">
                        {row.skipped.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-[11px] leading-relaxed">
                        {row.warn ? (
                          <span className="text-[#ba1a1a] font-medium block">
                            {row.drainedBy}
                          </span>
                        ) : (
                          <span className="text-[#725a39] block">
                            {row.drainedBy}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Why Extractions Fail */}
          <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                  Why Extractions Fail
                </h2>
                <p className="text-[11px] text-[#725a39] mt-0.5">
                  Failed extractions classified by error reason across all tables ({totalErrors.toLocaleString()} total errors)
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#ba1a1a]/10 text-[#ba1a1a] font-mono text-[11px] font-bold">
                {totalErrors} Failed
              </span>
            </div>

            <div className="space-y-4 pt-1">
              {errorCategories.map((item) => {
                const percentage = totalErrors > 0 ? Math.round((item.count / totalErrors) * 100) : 0;
                return (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span 
                          className={`w-2 h-2 rounded-full ${
                            item.color === 'amber' 
                              ? 'bg-[#a5690c]' 
                              : item.color === 'red' 
                              ? 'bg-[#ba1a1a]' 
                              : 'bg-[#725a39]'
                          }`} 
                        />
                        <span className="font-semibold text-[#442a22]">
                          {item.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#fbf9f5] border border-[#e6e2d6] text-[#725a39] uppercase font-bold">
                          {item.kind}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-[#442a22]">{item.count.toLocaleString()}</span>
                        <span className="text-[11px] text-[#725a39]">({percentage}%)</span>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="w-full h-2 rounded-full bg-[#fbf9f5] border border-[#e6e2d6]/70 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.color === 'amber' 
                            ? 'bg-[#a5690c]' 
                            : item.color === 'red' 
                            ? 'bg-[#ba1a1a]' 
                            : 'bg-[#725a39]'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <p className="text-[10.5px] text-[#725a39] leading-tight">
                      {item.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Operational Controls + Throughput (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Section: Operational Controls */}
          <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs space-y-5">
            <div>
              <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                Queue Controls &amp; Actions
              </h2>
              <p className="text-[11px] text-[#725a39] mt-0.5">
                Trigger extractors, recover capped rows, and avoid wasted AI calls
              </p>
            </div>

            {/* Sub-block 1: Run the Extractor */}
            <div className="p-3.5 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] space-y-2.5">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-[#293417] fill-current" />
                <h3 className="text-xs font-bold text-[#442a22]">
                  Run the AI Extractor
                </h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                Calls <code className="bg-[#e6e2d6]/40 px-1 py-0.5 rounded text-[10.5px] font-mono">ai-job-extractor</code> for pending staging rows. It pauses between rows to avoid rate spikes, so keep limits modest.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <select
                  value={extractorSource}
                  onChange={(e) => setExtractorSource(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-white border border-[#e6e2d6] rounded-lg text-xs text-[#442a22] font-medium outline-none focus:border-[#442a22]"
                >
                  <option value="">All 4 Active Sources</option>
                  <option value="jobinrwanda">Job in Rwanda</option>
                  <option value="brightermonday">BrighterMonday</option>
                  <option value="ndangira">Ndangira</option>
                  <option value="greatrwandajobs">Great Rwanda Jobs</option>
                </select>

                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={extractorLimit}
                    onChange={(e) => setExtractorLimit(Number(e.target.value))}
                    className="w-14 px-2 py-1.5 bg-white border border-[#e6e2d6] rounded-lg text-xs font-mono text-center text-[#442a22] outline-none focus:border-[#442a22]"
                    title="Rows to extract"
                  />
                  <span className="text-[11px] text-[#725a39]">rows</span>
                </div>

                <button
                  onClick={handleTriggerExtractor}
                  disabled={actionLoading !== null}
                  className="px-3.5 py-1.5 bg-[#442a22] hover:bg-[#2e1c17] text-[#fbf9f5] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'trigger_extractor' ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>

            {/* Sub-block 2: Retry Failed Jobs */}
            <div className="p-3.5 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] space-y-2.5">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#a5690c]" />
                <h3 className="text-xs font-bold text-[#442a22]">
                  Retry Failed Jobs Now
                </h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                Sends failed/pending jobs with transient errors (&lt; 3 attempts) to <code className="bg-[#e6e2d6]/40 px-1 py-0.5 rounded text-[10.5px] font-mono">process-job</code> with deliberate backoff.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={retryLimit}
                    onChange={(e) => setRetryLimit(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 bg-white border border-[#e6e2d6] rounded-lg text-xs font-mono text-center text-[#442a22] outline-none focus:border-[#442a22]"
                    title="Number of jobs to retry"
                  />
                  <span className="text-[11px] text-[#725a39]">rows</span>
                </div>

                <button
                  onClick={handleRetryFailedJobs}
                  disabled={actionLoading !== null}
                  className="flex-1 px-3.5 py-1.5 bg-white hover:bg-[#f7f5ef] border border-[#e6e2d6] text-[#442a22] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 text-center"
                >
                  {actionLoading === 'retry_failed_jobs' ? 'Retrying...' : 'Retry Now'}
                </button>
              </div>
            </div>

            {/* Sub-block 3: Unstick Rows at Cap */}
            <div className="p-3.5 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] space-y-2.5">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#ba1a1a]" />
                <h3 className="text-xs font-bold text-[#442a22]">
                  Unstick Rows That Hit the Cap
                </h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                Sets attempts back to 0 on rows that failed with transient 429/503/quota errors so automated crons can pick them up again.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleResetCapJobs}
                  disabled={actionLoading !== null}
                  className="px-2.5 py-1.5 bg-white hover:bg-[#f7f5ef] border border-[#e6e2d6] text-[#442a22] rounded-lg text-[11px] font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 text-center"
                >
                  {actionLoading === 'reset_cap_jobs' ? 'Resetting...' : `Reset Jobs (${totals?.atCap || 0} at cap)`}
                </button>

                <button
                  onClick={handleResetCapStaging}
                  disabled={actionLoading !== null}
                  className="px-2.5 py-1.5 bg-white hover:bg-[#f7f5ef] border border-[#e6e2d6] text-[#442a22] rounded-lg text-[11px] font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 text-center"
                >
                  {actionLoading === 'reset_cap_staging' ? 'Resetting...' : 'Reset Staging Tables'}
                </button>
              </div>
            </div>

            {/* Sub-block 4: Stop Wasting AI Calls */}
            <div className="p-3.5 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] space-y-2.5">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-[#725a39]" />
                <h3 className="text-xs font-bold text-[#442a22]">
                  Stop Wasting AI Calls
                </h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                Marks staged BrighterMonday rows already labelled as <code className="bg-[#e6e2d6]/40 px-1 py-0.5 rounded text-[10.5px] font-mono">tender</code> or <code className="bg-[#e6e2d6]/40 px-1 py-0.5 rounded text-[10.5px] font-mono">paid_program</code> as <code className="bg-[#e6e2d6]/40 px-1 py-0.5 rounded text-[10.5px] font-mono">skipped_tender</code> so quota isn't consumed on non-jobs.
              </p>

              <button
                onClick={handleSkipTenders}
                disabled={actionLoading !== null}
                className="w-full px-3 py-1.5 bg-white hover:bg-[#f7f5ef] border border-[#e6e2d6] text-[#725a39] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 text-center"
              >
                {actionLoading === 'skip_tenders' ? 'Marking...' : `Skip ${stagedTendersCount} Staged Tenders`}
              </button>
            </div>
          </div>

          {/* Section: Throughput & Capacity Projection */}
          <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs space-y-4">
            <div>
              <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                Throughput &amp; Capacity
              </h2>
              <p className="text-[11px] text-[#725a39] mt-0.5">
                AI extraction capacity vs. backlog drain pace projection
              </p>
            </div>

            {/* Daily Quota Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#442a22]">
                  Successful Calls Today
                </span>
                <span className="font-mono font-bold text-[#442a22]">
                  {(capacity?.used || 0).toLocaleString()} / {(capacity?.rpd || 0).toLocaleString()}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#fbf9f5] border border-[#e6e2d6] overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    callsQuotaRatio > 0.8 ? 'bg-[#ba1a1a]' : 'bg-[#16813d]'
                  }`}
                  style={{ width: `${Math.min(callsQuotaRatio * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Key-Value Breakdown */}
            <dl className="grid grid-cols-1 divide-y divide-[#e6e2d6]/60 text-xs pt-1">
              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#725a39]">Daily Capacity</dt>
                <dd className="font-mono font-semibold text-[#442a22]">
                  {(capacity?.rpd || 0).toLocaleString()} calls ({capacity?.g?.length || 0} Gemini keys × 200)
                </dd>
              </div>

              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#725a39]">Total Awaiting AI</dt>
                <dd className="font-mono font-semibold text-[#442a22]">
                  {(capacity?.awaiting || 0).toLocaleString()} rows
                </dd>
              </div>

              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#725a39]">Time to Clear</dt>
                <dd className="font-mono font-semibold text-[#293417]">
                  {capacity?.daysToClear != null ? `≈ ${capacity.daysToClear.toFixed(1)} days at full capacity` : '—'}
                </dd>
              </div>

              <div className="py-2 flex flex-col gap-0.5">
                <dt className="text-[#725a39]">Drip Pace (Crons)</dt>
                <dd className="font-mono text-[11px] text-[#442a22]">
                  extractor ≤ 6 rows / 3 min · retry ≤ 5 rows / 2 min
                </dd>
              </div>
            </dl>

            <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] text-[11px] text-[#725a39] leading-relaxed flex items-start gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 text-[#725a39] mt-0.5" />
              <span>
                Raising throughput requires adding more Google AI Studio keys or enabling paid quota tiers. Code optimizations avoid waste without exceeding rate limits.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
