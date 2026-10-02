import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Database, 
  Sparkles, 
  ExternalLink, 
  ShieldAlert, 
  Layers, 
  ArrowUpRight, 
  Play, 
  Filter, 
  Check, 
  Zap,
  Info,
  Server,
  AlertCircle
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { SourceId } from '../types/dashboard';

export const StatsPage: React.FC = () => {
  const { 
    data, 
    loading, 
    refreshAll, 
    setActivePage, 
    setActiveSourceTab,
    isScraping,
    scrapeStatus,
    triggerScrapeAll,
    triggerSingleScrape
  } = useDashboard();

  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);
  const [triggeringSource, setTriggeringSource] = useState<SourceId | null>(null);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center font-body">
        <div className="w-10 h-10 border-3 border-[#293417] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#442a22] font-sans">Calculating Ingestion Stats &amp; Health Matrix...</p>
        <p className="text-xs text-[#725a39] mt-1 font-body">Reading live Rwandan job portal telemetry and extraction failure diagnostics</p>
      </div>
    );
  }

  const totals = data?.totals || {
    jobs: 0,
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
    other: 0
  };

  const sources = data?.sources ? Object.values(data.sources) : [];
  const errors = data?.errors || { pool: 0, rate429: 0, overload503: 0, short: 0, other: 0, total: 0 };
  const industryDist = data?.industryDist || [];
  const jobFunctionDist = data?.jobFunctionDist || [];
  const trends = data?.trends || [];

  // Calculation helpers
  const totalProcessed = totals.done + totals.failed;
  const overallErrorRate = totalProcessed > 0 ? (totals.failed / totalProcessed) * 100 : 0;
  const healthySourcesCount = sources.filter(s => s.health.lvl === 'ok').length;
  const totalFailedErrors = errors.total || (errors.rate429 + errors.pool + errors.overload503 + errors.short + errors.other);
  const maxErrorCount = Math.max(1, errors.rate429, errors.pool, errors.overload503, errors.short, errors.other);

  // Rwandan Industry max
  const maxIndustryCount = industryDist.length > 0 ? Math.max(...industryDist.map(i => i.count)) : 1;
  const maxJobFunctionCount = jobFunctionDist.length > 0 ? Math.max(...jobFunctionDist.map(f => f.count)) : 1;
  const maxTrendCount = trends.length > 0 ? Math.max(...trends.map(t => t.count), 5) : 5;
  const total7DayVolume = trends.reduce((sum, t) => sum + t.count, 0);
  const dailyAverage = Math.round(total7DayVolume / Math.max(trends.length, 1));

  // Time ago formatter
  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return 'Unknown';
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return isoString.split('T')[0] || 'Unknown';
    }
  };

  const prettyName = (rawName: string) => {
    return rawName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleSourceRowClick = (id: SourceId) => {
    setActiveSourceTab(id);
    setActivePage('sources');
  };

  const handleSingleScrape = async (e: React.MouseEvent, id: SourceId) => {
    e.stopPropagation();
    try {
      setTriggeringSource(id);
      await triggerSingleScrape(id);
    } finally {
      setTriggeringSource(null);
    }
  };

  // Error breakdown categories list matching reference spec
  const errorCategories = [
    {
      id: 'rate429',
      reason: 'Gemini 429 — rate / quota limited',
      count: errors.rate429,
      kind: 'transient',
      color: 'bg-[#a5690c]',
      badgeColor: 'bg-[#a5690c]/10 text-[#a5690c]',
      note: 'Retried automatically while under 3 attempts; after that the retry cron skips the row. Resettable in Queue.'
    },
    {
      id: 'pool',
      reason: 'All keys exhausted or cooling down',
      count: errors.pool,
      kind: 'pool',
      color: 'bg-[#ba1a1a]',
      badgeColor: 'bg-[#ba1a1a]/10 text-[#ba1a1a]',
      note: 'No usable key in rotation at that moment. Triggers critical incident alerts.'
    },
    {
      id: 'overload503',
      reason: 'Gemini 503 — model overloaded',
      count: errors.overload503,
      kind: 'transient',
      color: 'bg-[#a5690c]',
      badgeColor: 'bg-[#a5690c]/10 text-[#a5690c]',
      note: 'Upstream Google high-demand transient error; retried automatically by drip cron.'
    },
    {
      id: 'short',
      reason: 'Description missing or too short',
      count: errors.short,
      kind: 'content',
      color: 'bg-[#725a39]',
      badgeColor: 'bg-[#725a39]/10 text-[#725a39]',
      note: 'Scraped body failed minimum character threshold. Non-retryable without scraper parser update.'
    },
    {
      id: 'other',
      reason: 'Other / unclassified',
      count: errors.other,
      kind: 'other',
      color: 'bg-[#442a22]',
      badgeColor: 'bg-[#442a22]/10 text-[#442a22]',
      note: 'General parsing exceptions or edge function network anomalies.'
    }
  ];

  return (
    <div className="space-y-6 font-body">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">Stats &amp; Health Matrix</h1>
          <p className="text-xs text-[#725a39] mt-0.5">
            Macro telemetry across Rwandan industries, job functions, extraction failure root-causes, and source freshness.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] text-xs font-mono text-[#725a39] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#16813d] animate-pulse" />
            <span>{data?.asOf || 'Live'}</span>
          </div>

          <button
            onClick={() => refreshAll()}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-[#fbf9f5] hover:-translate-y-0.5 transition-all duration-120 cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            title="Refresh metrics from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#725a39] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setActivePage('queue')}
            className="px-3.5 py-2 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-[#fbf9f5] hover:-translate-y-0.5 transition-all duration-120 cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#293417]" />
            <span>AI Queue</span>
          </button>

          <button
            onClick={() => triggerScrapeAll()}
            disabled={isScraping}
            className="px-4 py-2 rounded-lg bg-[#442a22] hover:bg-[#2e1c17] text-[#fbf9f5] text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all duration-120 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isScraping ? 'animate-spin' : ''}`} />
            <span>{isScraping ? 'Scraping...' : 'Scrape All'}</span>
          </button>
        </div>
      </div>

      {/* 4 Macro KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ingestion Volume */}
        <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-120 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#725a39] font-medium mb-2">
              <span>Total Ingested Volume</span>
              <Database className="w-4 h-4 text-[#725a39]/70" />
            </div>
            <div className="text-2xl font-mono font-bold text-[#442a22] tracking-tight">
              {totals.jobs.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#e6e2d6]/60 flex items-center justify-between text-xs text-[#725a39]">
            <span>{totals.active.toLocaleString()} active listings</span>
            <span className="font-mono text-[#293417] font-semibold">+{totals.newToday} today</span>
          </div>
        </div>

        {/* Extraction Error Rate */}
        <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-120 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#725a39] font-medium mb-2">
              <span>System Extraction Error Rate</span>
              <AlertTriangle className={`w-4 h-4 ${overallErrorRate > 10 ? 'text-[#ba1a1a]' : 'text-[#a5690c]'}`} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-mono font-bold tracking-tight ${
                overallErrorRate > 30 ? 'text-[#ba1a1a]' : overallErrorRate > 10 ? 'text-[#a5690c]' : 'text-[#16813d]'
              }`}>
                {overallErrorRate.toFixed(1)}%
              </span>
              <span className="text-xs text-[#725a39] font-mono">({totals.failed} failed)</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#e6e2d6]/60 flex items-center justify-between text-xs text-[#725a39]">
            <span>{totals.atCap} stuck at retry cap</span>
            <button 
              onClick={() => setActivePage('queue')}
              className="text-[#293417] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              <span>Reset</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Source Freshness & Health */}
        <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-120 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#725a39] font-medium mb-2">
              <span>Portals Health Status</span>
              <Server className="w-4 h-4 text-[#725a39]/70" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-[#442a22] tracking-tight">
                {healthySourcesCount} of {sources.length}
              </span>
              <span className="text-xs text-[#16813d] font-semibold uppercase tracking-wider">Healthy</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#e6e2d6]/60 flex items-center justify-between text-xs text-[#725a39]">
            <span>{sources.length - healthySourcesCount} need attention</span>
            <button 
              onClick={() => setActivePage('sources')}
              className="text-[#293417] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              <span>Sources Hub</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Top Dominant Rwandan Sector */}
        <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-120 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#725a39] font-medium mb-2">
              <span>Leading Rwandan Sector</span>
              <TrendingUp className="w-4 h-4 text-[#293417]" />
            </div>
            <div className="text-lg font-sans font-bold text-[#442a22] truncate" title={prettyName(industryDist[0]?.name || 'N/A')}>
              {industryDist.length > 0 ? prettyName(industryDist[0].name) : 'Awaiting data'}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#e6e2d6]/60 flex items-center justify-between text-xs text-[#725a39]">
            <span className="font-mono">{industryDist[0]?.count || 0} active listings</span>
            <span className="font-mono text-[#293417] font-semibold">
              {totals.enrichedActive > 0 ? Math.round(((industryDist[0]?.count || 0) / totals.enrichedActive) * 100) : 0}% share
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Error Breakdown & Source Reliability Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Failed Extractions Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-sans font-bold text-[#442a22] uppercase tracking-wider">
                Failed Extractions — <span className="font-mono font-bold text-[#ba1a1a]">{totalFailedErrors}</span> Total
              </h2>
              <p className="text-xs text-[#725a39] mt-0.5">
                Classified root-cause distribution across all pipeline ingestion failures.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#ba1a1a]/10 text-[#ba1a1a]">
              Live Root Causes
            </span>
          </div>

          <div className="space-y-4">
            {errorCategories.map(cat => {
              const pctOfTotal = totalFailedErrors > 0 ? (cat.count / totalFailedErrors) * 100 : 0;
              const barWidth = maxErrorCount > 0 ? (cat.count / maxErrorCount) * 100 : 0;

              return (
                <div key={cat.id} className="group">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-[#442a22] flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                      {cat.reason}
                    </span>
                    <span className="font-mono font-bold text-[#442a22]">
                      {cat.count.toLocaleString()} <span className="text-[#725a39] font-normal text-[11px]">({pctOfTotal.toFixed(0)}%)</span>
                    </span>
                  </div>

                  {/* Progress track */}
                  <div className="w-full bg-[#f3efe6] h-2 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${barWidth}%` }} 
                      className={`h-full ${cat.color} rounded-full transition-all duration-300`} 
                    />
                  </div>

                  <p className="text-[11px] text-[#725a39] mt-1 line-clamp-2 leading-relaxed">
                    {cat.note}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#e6e2d6] flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={() => setActivePage('queue')}
              className="px-3 py-1.5 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-white hover:border-[#442a22] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-[#a5690c]" />
              <span>Reset Transient Errors</span>
            </button>

            <button
              onClick={() => setActivePage('jobs')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#293417] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Inspect Failed in Explorer</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Source Reliability & Freshness Matrix (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-[#e6e2d6] flex items-center justify-between bg-[#fbf9f5]/50">
              <div>
                <h2 className="text-sm font-sans font-bold text-[#442a22] uppercase tracking-wider">
                  Source Reliability &amp; Freshness Matrix
                </h2>
                <p className="text-xs text-[#725a39] mt-0.5">
                  Freshness, central database absorption, and extraction health per portal.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-[#725a39]">
                5 Rwandan Portals
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">Portal</th>
                    <th className="py-3 px-3">Last Scrape</th>
                    <th className="py-3 px-3">In Jobs</th>
                    <th className="py-3 px-3">In Staging</th>
                    <th className="py-3 px-3">Error Rate</th>
                    <th className="py-3 px-3 text-right">Status</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e2d6]">
                  {sources.map(s => {
                    const totalProcessed = s.jobs.enriched + s.jobs.failed;
                    const errPct = totalProcessed > 0 ? (s.jobs.failed / totalProcessed) * 100 : 0;
                    const lastTime = s.raw.lastSeen || s.jobs.lastScraped;

                    return (
                      <tr 
                        key={s.id} 
                        onClick={() => handleSourceRowClick(s.id)}
                        className="hover:bg-[#fbf9f5] transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#442a22] group-hover:text-[#293417] flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              s.health.lvl === 'ok' ? 'bg-[#16813d]' : s.health.lvl === 'warn' ? 'bg-[#a5690c]' : 'bg-[#ba1a1a]'
                            }`} />
                            <span>{s.name}</span>
                          </div>
                          <div className="text-[10px] text-[#725a39] font-mono">{s.domain}</div>
                        </td>

                        <td className="py-3 px-3 font-mono text-[#725a39] text-[11px] whitespace-nowrap">
                          {formatTimeAgo(lastTime)}
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-[#442a22]">
                          {s.jobs.total.toLocaleString()}
                          <span className="block text-[10px] text-[#725a39] font-normal">
                            {s.jobs.active} active
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono text-[#725a39]">
                          {s.raw.total.toLocaleString()}
                          {s.raw.pending > 0 && (
                            <span className="block text-[10px] text-[#a5690c] font-semibold">
                              {s.raw.pending} pending
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-mono">
                          {s.noPipeline ? (
                            <span className="text-[#725a39] text-[11px]">—</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${
                                errPct > 30 ? 'text-[#ba1a1a]' : errPct > 10 ? 'text-[#a5690c]' : 'text-[#16813d]'
                              }`}>
                                {errPct.toFixed(0)}%
                              </span>
                              <span className="text-[10px] text-[#725a39]">({s.jobs.failed})</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${
                            s.health.lvl === 'ok' 
                              ? 'bg-[#16813d]/10 text-[#16813d]' 
                              : s.health.lvl === 'warn' 
                              ? 'bg-[#a5690c]/10 text-[#a5690c]' 
                              : 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                          }`}>
                            {s.health.label}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={(e) => handleSingleScrape(e, s.id)}
                            disabled={isScraping || triggeringSource === s.id}
                            className="px-2.5 py-1 rounded bg-[#fbf9f5] hover:bg-white border border-[#e6e2d6] text-[11px] font-semibold text-[#442a22] shadow-2xs hover:border-[#442a22] transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title={`Run scraper for ${s.name}`}
                          >
                            <Play className={`w-2.5 h-2.5 ${triggeringSource === s.id ? 'animate-spin' : ''}`} />
                            <span>Scrape</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 bg-[#fbf9f5] border-t border-[#e6e2d6] flex items-center justify-between text-xs text-[#725a39]">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#725a39]" />
              Click any source row to view detailed staging rows &amp; pipeline diagnostics.
            </span>
            <button 
              onClick={() => setActivePage('sources')}
              className="text-[#293417] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Explore Sources</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Rwandan Market Distributions: Top 10 Industries & Top 8 Job Functions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Industry Distribution */}
        <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22]">
                Top 10 Industries in Rwanda
              </h3>
              <p className="text-xs text-[#725a39] mt-0.5">
                Distribution across active AI-enriched Rwandan job listings.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#293417] bg-[#293417]/10 px-2 py-0.5 rounded">
              {industryDist.length} Sectors
            </span>
          </div>

          <div className="space-y-3">
            {industryDist.map((item, idx) => {
              const pctOfMax = Math.round((item.count / maxIndustryCount) * 100);
              const pctOfEnriched = totals.enrichedActive > 0 ? Math.round((item.count / totals.enrichedActive) * 100) : 0;

              return (
                <div key={item.name} className="text-xs group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-[#442a22] flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#725a39] w-4">{idx + 1}.</span>
                      <span className="group-hover:text-[#293417] transition-colors">{prettyName(item.name)}</span>
                    </span>
                    <div className="font-mono text-right flex items-center gap-2">
                      <span className="font-bold text-[#442a22]">{item.count} jobs</span>
                      <span className="text-[11px] text-[#725a39] w-9 text-right">({pctOfEnriched}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-[#f3efe6] h-2 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${pctOfMax}%` }} 
                      className="bg-[#293417] h-full rounded-full transition-all duration-300 group-hover:brightness-110" 
                    />
                  </div>
                </div>
              );
            })}

            {industryDist.length === 0 && (
              <div className="py-8 text-center text-xs text-[#725a39]">
                No enriched industry distribution data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Job Function Distribution */}
        <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22]">
                Top 8 Job Functions in Rwanda
              </h3>
              <p className="text-xs text-[#725a39] mt-0.5">
                Core roles and functional specialties demanded across Rwanda.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#442a22] bg-[#442a22]/10 px-2 py-0.5 rounded">
              {jobFunctionDist.length} Functions
            </span>
          </div>

          <div className="space-y-3">
            {jobFunctionDist.map((item, idx) => {
              const pctOfMax = Math.round((item.count / maxJobFunctionCount) * 100);
              const pctOfEnriched = totals.enrichedActive > 0 ? Math.round((item.count / totals.enrichedActive) * 100) : 0;

              return (
                <div key={item.name} className="text-xs group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-[#442a22] flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#725a39] w-4">{idx + 1}.</span>
                      <span className="group-hover:text-[#442a22] transition-colors">{prettyName(item.name)}</span>
                    </span>
                    <div className="font-mono text-right flex items-center gap-2">
                      <span className="font-bold text-[#442a22]">{item.count} jobs</span>
                      <span className="text-[11px] text-[#725a39] w-9 text-right">({pctOfEnriched}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-[#f3efe6] h-2 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${pctOfMax}%` }} 
                      className="bg-[#442a22] h-full rounded-full transition-all duration-300 group-hover:brightness-110" 
                    />
                  </div>
                </div>
              );
            })}

            {jobFunctionDist.length === 0 && (
              <div className="py-8 text-center text-xs text-[#725a39]">
                No enriched job function distribution data available yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 7-Day Ingestion Trend Chart Card */}
      <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22]">
              Rows Added to Jobs, Last 7 Days
            </h3>
            <p className="text-xs text-[#725a39] mt-0.5">
              Daily volume of new job listings ingested into the central database.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-[#725a39]">7-Day Total: <b className="text-[#442a22]">{total7DayVolume}</b></span>
            <span className="text-[#725a39]">Daily Avg: <b className="text-[#293417]">{dailyAverage}</b></span>
          </div>
        </div>

        {/* Trend Bar Chart */}
        <div className="pt-4 pb-2">
          <div className="h-44 flex items-end justify-between gap-3 sm:gap-6 border-b border-[#e6e2d6] px-2 relative">
            {/* Horizontal Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
              <div className="border-b border-[#725a39] w-full" />
              <div className="border-b border-[#725a39] w-full" />
              <div className="border-b border-[#725a39] w-full" />
              <div className="border-b border-[#725a39] w-full" />
            </div>

            {trends.map((t, idx) => {
              const heightPct = Math.max(8, Math.round((t.count / maxTrendCount) * 100));
              const isToday = idx === trends.length - 1;
              const isHovered = hoveredTrendIndex === idx;

              // Format day label
              let dayLabel = t.day;
              try {
                const dateObj = new Date(t.day);
                dayLabel = isToday ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
              } catch {
                dayLabel = t.day;
              }

              return (
                <div 
                  key={t.day}
                  onMouseEnter={() => setHoveredTrendIndex(idx)}
                  onMouseLeave={() => setHoveredTrendIndex(null)}
                  className="flex-1 flex flex-col items-center h-full justify-end relative group cursor-pointer z-10"
                >
                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute -top-10 bg-[#442a22] text-[#fbf9f5] px-2.5 py-1 rounded text-[11px] font-mono whitespace-nowrap shadow-md z-20 animate-fade-in">
                      <b>{t.count} jobs</b> on {t.day}
                    </div>
                  )}

                  {/* Top value badge */}
                  <span className={`text-[10px] font-mono font-semibold mb-1 transition-colors ${
                    isToday ? 'text-[#293417]' : 'text-[#725a39]'
                  }`}>
                    {t.count}
                  </span>

                  {/* Bar */}
                  <div 
                    style={{ height: `${heightPct}%` }}
                    className={`w-full max-w-[48px] rounded-t-sm transition-all duration-200 ${
                      isToday 
                        ? 'bg-[#293417] group-hover:brightness-110 shadow-xs' 
                        : isHovered 
                        ? 'bg-[#442a22]' 
                        : 'bg-[#725a39]/70 group-hover:bg-[#725a39]'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between gap-3 sm:gap-6 px-2 mt-2">
            {trends.map((t, idx) => {
              const isToday = idx === trends.length - 1;
              let dayLabel = t.day;
              try {
                const dateObj = new Date(t.day);
                dayLabel = isToday ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
              } catch {
                dayLabel = t.day;
              }

              return (
                <div key={t.day} className="flex-1 text-center">
                  <span className={`text-[11px] font-mono ${
                    isToday ? 'font-bold text-[#293417]' : 'text-[#725a39]'
                  }`}>
                    {dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
