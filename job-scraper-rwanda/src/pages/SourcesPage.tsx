import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Globe, 
  RefreshCw, 
  Play, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Database, 
  Search, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Sparkles, 
  RotateCcw, 
  Info, 
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
  FileCode,
  Tag,
  ArrowRight
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { SourceId, JobRow } from '../types/dashboard';
import { 
  fetchJobsExplorer, 
  fetchStagingRows, 
  StagingRowNormalized, 
  triggerSourceExtraction, 
  requeueFailedSourceRows 
} from '../services/dataService';

export const SourcesPage: React.FC = () => {
  const { 
    data, 
    activeSourceTab, 
    setActiveSourceTab, 
    triggerSingleScrape, 
    isScraping, 
    scrapeStatus, 
    scrapeResults,
    openJobDrawer,
    refreshAll,
    localScrapedJobs,
    syncLocal,
    compareLocal,
    lastSyncResult
  } = useDashboard();

  // Sub-navigation view: 'local' | 'staging' | 'jobs'
  const [viewTab, setViewTab] = useState<'local' | 'staging' | 'jobs'>('staging');
  
  // Table state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  // Local comparison and filter state
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState<boolean>(false);
  const [localFilter, setLocalFilter] = useState<'all' | 'new' | 'staged'>('all');

  // Data rows state
  const [jobsRows, setJobsRows] = useState<JobRow[]>([]);
  const [stagingRows, setStagingRows] = useState<StagingRowNormalized[]>([]);
  const [localDisplayRows, setLocalDisplayRows] = useState<any[]>([]);
  const [totalRowCount, setTotalRowCount] = useState<number>(0);
  const [loadingRows, setLoadingRows] = useState<boolean>(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Operational actions state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset pagination on tab change
  const handleTabChange = (sourceId: SourceId) => {
    setActiveSourceTab(sourceId);
    setCurrentPage(1);
    setSearchQuery('');
    setStatusFilter('all');
    setLocalFilter('all');
    setActionMessage(null);
  };

  const handleViewTabChange = (tab: 'local' | 'staging' | 'jobs') => {
    setViewTab(tab);
    setCurrentPage(1);
    setStatusFilter('all');
    setLocalFilter('all');
  };

  const currentSource = data?.sources[activeSourceTab];
  const currentLocalItems = (localScrapedJobs && localScrapedJobs[activeSourceTab]) || [];
  const currentLocalCount = currentLocalItems.length;

  const handleSyncLocal = async () => {
    if (!currentSource) return;
    setActionLoading('sync-local');
    setActionMessage(null);
    try {
      const res = await syncLocal(activeSourceTab);
      setActionMessage({
        type: 'success',
        text: `✓ Successfully synced ${res.syncedCount} items into ${currentSource.stagingTable} (${res.newlyAdded} newly added, ${res.alreadyExisting} existing updated).`
      });
      setViewTab('staging');
      await refreshAll();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Sync failed: ${err.message}`
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch rows for active source and view mode
  const loadTableData = useCallback(async () => {
    if (!currentSource) return;
    setLoadingRows(true);
    setTableError(null);

    try {
      if (viewTab === 'local') {
        let itemsToUse: any[] = [];
        try {
          setComparisonLoading(true);
          const comp = await compareLocal(activeSourceTab);
          setComparisonData(comp);
          itemsToUse = comp.items;
        } catch {
          itemsToUse = (localScrapedJobs[activeSourceTab] || []).map((it: any) => ({ ...it, isNewToStaging: false }));
        } finally {
          setComparisonLoading(false);
        }

        let filtered = itemsToUse;
        if (localFilter === 'new') {
          filtered = filtered.filter((i: any) => i.isNewToStaging);
        } else if (localFilter === 'staged') {
          filtered = filtered.filter((i: any) => !i.isNewToStaging);
        }

        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          filtered = filtered.filter((item: any) => 
            (item.title && item.title.toLowerCase().includes(q)) ||
            (item.company && item.company.toLowerCase().includes(q))
          );
        }

        const startIdx = (currentPage - 1) * pageSize;
        setLocalDisplayRows(filtered.slice(startIdx, startIdx + pageSize));
        setTotalRowCount(filtered.length);
        setLoadingRows(false);
        return;
      } else if (viewTab === 'jobs') {
        const res = await fetchJobsExplorer({
          page: currentPage,
          pageSize,
          search: debouncedSearch || undefined,
          source: activeSourceTab,
          status: statusFilter !== 'all' ? statusFilter : undefined
        });
        setJobsRows(res.rows);
        setTotalRowCount(res.total);
      } else {
        const res = await fetchStagingRows({
          source: activeSourceTab,
          page: currentPage,
          pageSize,
          search: debouncedSearch || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined
        });
        setStagingRows(res.rows);
        setTotalRowCount(res.total);
      }
    } catch (err: any) {
      console.error('Error fetching table rows:', err);
      setTableError(err.message || 'Failed to load records from Supabase');
    } finally {
      setLoadingRows(false);
    }
  }, [activeSourceTab, viewTab, currentPage, debouncedSearch, statusFilter, currentSource, localScrapedJobs]);

  useEffect(() => {
    loadTableData();
  }, [loadTableData]);

  // Actions handlers
  const handleExtractPending = async () => {
    if (!currentSource) return;
    setActionLoading('extract');
    setActionMessage(null);
    try {
      const res = await triggerSourceExtraction(activeSourceTab, 10);
      if (res.success) {
        setActionMessage({ type: 'success', text: `Extraction batch dispatched for ${currentSource.name}. Refreshing data...` });
        await refreshAll();
        await loadTableData();
      } else {
        setActionMessage({ type: 'error', text: `Extraction failed: ${res.message}` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Extraction failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequeueFailed = async () => {
    if (!currentSource) return;
    setActionLoading('requeue');
    setActionMessage(null);
    try {
      const res = await requeueFailedSourceRows(activeSourceTab);
      if (res.success) {
        setActionMessage({ type: 'success', text: `Failed records requeued for ${currentSource.name}.` });
        await refreshAll();
        await loadTableData();
      } else {
        setActionMessage({ type: 'error', text: `Requeue failed: ${res.message}` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Requeue failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const sourcesList: { id: SourceId; name: string; letter: string }[] = [
    { id: 'jobinrwanda', name: 'Job in Rwanda', letter: 'J' },
    { id: 'brightermonday', name: 'BrighterMonday', letter: 'B' },
    { id: 'ndangira', name: 'Ndangira', letter: 'N' },
    { id: 'greatrwandajobs', name: 'Great Rwanda Jobs', letter: 'G' },
    { id: 'jobwebrwanda', name: 'JobWeb Rwanda', letter: 'W' }
  ];

  // Helper formatting functions
  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never / No timestamp';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffDays > 0) relative = `${diffDays}d ${diffHours % 24}h ago`;
    else if (diffHours > 0) relative = `${diffHours}h ${diffMins % 60}m ago`;
    else relative = `${Math.max(diffMins, 1)}m ago`;

    const formattedDate = date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    return `${relative} (${formattedDate})`;
  };

  const totalPages = Math.ceil(totalRowCount / pageSize) || 1;

  // Calculate enrichment percentage safely
  const enrichmentPct = useMemo(() => {
    if (!currentSource || currentSource.jobs.active === 0) return 0;
    return Math.min(100, Math.round((currentSource.jobs.enriched / currentSource.jobs.active) * 100));
  }, [currentSource]);

  const lastScrapeTime = currentSource?.raw.lastSeen || currentSource?.jobs.lastScraped;

  return (
    <div className="space-y-6 font-body">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">Job Portals &amp; Staging Hub</h1>
          <p className="text-xs text-[#725a39] mt-0.5">
            Individual source diagnostics, ingestion pipelines, and live database explorer.
          </p>
        </div>

        {/* Global / Source Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerSingleScrape(activeSourceTab)}
            disabled={isScraping}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#442a22] hover:bg-[#2e1c17] text-[#fbf9f5] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all duration-150 cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isScraping ? 'animate-spin' : ''}`} />
            <span>{isScraping ? scrapeStatus : `Scrape ${currentSource?.name || 'Portal'} Now`}</span>
          </button>
        </div>
      </div>

      {/* 5 Source Tabs */}
      <div className="flex border-b border-[#e6e2d6] gap-2 overflow-x-auto pb-px">
        {sourcesList.map((s) => {
          const isActive = activeSourceTab === s.id;
          const srcData = data?.sources[s.id];
          const healthLvl = srcData?.health.lvl || 'ok';
          
          return (
            <button
              key={s.id}
              onClick={() => handleTabChange(s.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'border-[#293417] text-[#442a22] bg-white rounded-t-lg shadow-xs'
                  : 'border-transparent text-[#725a39] hover:text-[#442a22] hover:bg-[#f3efe6]/50'
              }`}
            >
              {/* Health status dot */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                healthLvl === 'ok' ? 'bg-[#16813d]' : healthLvl === 'warn' ? 'bg-[#a5690c]' : 'bg-[#ba1a1a]'
              }`} />
              
              <span>{s.name}</span>
              
              {srcData && (
                <span className="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-[#f3efe6] text-[#725a39]">
                  {srcData.jobs.total.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action Toast Feedback */}
      {actionMessage && (
        <div className={`p-3.5 rounded-lg text-xs font-semibold flex items-center justify-between border ${
          actionMessage.type === 'success'
            ? 'bg-[#16813d]/10 border-[#16813d]/20 text-[#16813d]'
            : actionMessage.type === 'error'
            ? 'bg-[#ba1a1a]/10 border-[#ba1a1a]/20 text-[#ba1a1a]'
            : 'bg-[#725a39]/10 border-[#725a39]/20 text-[#725a39]'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {actionMessage.type === 'error' && <AlertTriangle className="w-4 h-4" />}
            {actionMessage.type === 'info' && <Info className="w-4 h-4" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-[11px] underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {currentSource && (
        <div className="space-y-6">
          {/* Source Header Banner with Quick Actions */}
          <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#442a22] text-[#fbf9f5] flex items-center justify-center font-sans font-bold text-lg shadow-xs flex-shrink-0">
                {currentSource.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-sans font-bold text-[#442a22] tracking-tight">{currentSource.name}</h2>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${
                    currentSource.health.lvl === 'ok'
                      ? 'bg-[#16813d]/10 text-[#16813d]'
                      : currentSource.health.lvl === 'warn'
                      ? 'bg-[#a5690c]/10 text-[#a5690c]'
                      : 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                  }`}>
                    {currentSource.health.label}
                  </span>
                </div>
                <a 
                  href={`https://${currentSource.domain}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-[#725a39] hover:text-[#442a22] inline-flex items-center gap-1 mt-0.5"
                >
                  <span>{currentSource.domain}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {!currentSource.noPipeline && currentSource.raw.pending > 0 && (
                <button
                  onClick={handleExtractPending}
                  disabled={actionLoading === 'extract'}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#293417] hover:bg-[#1f2812] text-[#fbf9f5] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all duration-150 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Extract Pending ({currentSource.raw.pending.toLocaleString()})</span>
                </button>
              )}

              {currentSource.jobs.failed > 0 && (
                <button
                  onClick={handleRequeueFailed}
                  disabled={actionLoading === 'requeue'}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#f7f5ef] hover:bg-[#ede9de] text-[#442a22] border border-[#e6e2d6] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all duration-150 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#725a39]" />
                  <span>Requeue Failed</span>
                </button>
              )}

              <a
                href={`https://${currentSource.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-[#f7f5ef] hover:bg-[#ede9de] text-[#725a39] hover:text-[#442a22] border border-[#e6e2d6] rounded-lg text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all duration-150"
              >
                <span>Open Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Dynamic Warning Banners */}
          {currentSource.noPipeline && (
            <div className="p-4 rounded-lg bg-[#ba1a1a]/5 border border-[#ba1a1a]/25 text-[#ba1a1a] flex items-start sm:items-center gap-3">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="text-xs">
                <strong>Pipeline Gap Notice:</strong> This source has <strong>{currentSource.raw.total.toLocaleString()} rows</strong> in staging ({currentSource.stagingTable}), but the automated AI extraction and promotion pipeline is paused. Staging records accumulate without consuming AI quota.
              </div>
            </div>
          )}

          {activeSourceTab === 'brightermonday' && currentSource.raw.tender > 0 && (
            <div className="p-4 rounded-lg bg-[#a5690c]/10 border border-[#a5690c]/25 text-[#a5690c] flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="text-xs">
                <strong>Staged Tenders Warning:</strong> {currentSource.raw.tender.toLocaleString()} BrighterMonday staging rows are labelled tender / paid program. Ensure these are skipped so AI calls are not spent on non-standard job postings.
              </div>
            </div>
          )}

          {/* Enrichment & Last Scraped Gauge Card */}
          <div className="bg-white p-4.5 rounded-lg border border-[#e6e2d6] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#442a22] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#725a39]" />
                <span>Last scrape activity {formatTimeAgo(lastScrapeTime)}</span>
              </span>
              <span className="font-mono font-bold text-[#293417]">
                {enrichmentPct}% Enriched
              </span>
            </div>

            {/* Visual Track */}
            <div className="h-2 w-full bg-[#f3efe6] rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  enrichmentPct === 100 ? 'bg-[#16813d]' : 'bg-[#293417]'
                }`}
                style={{ width: `${enrichmentPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#725a39]">
              <span>Share of live jobs that are AI-enriched</span>
              <span className="font-mono">{currentSource.ingestionPath}</span>
            </div>
          </div>

          {/* Sync & Ingestion Delta Banner */}
          <div className="bg-[#f7f5ef] p-4 rounded-lg border border-[#e6e2d6] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#725a39] block">Latest Sync Yield</span>
              <span className="text-base font-mono font-bold text-[#442a22] mt-0.5 block">
                {scrapeResults && scrapeResults[activeSourceTab] 
                  ? `${scrapeResults[activeSourceTab].jobsFound} jobs found` 
                  : `${currentSource.jobs.total} in DB`}
              </span>
              <span className="text-[10px] text-[#725a39]">
                {scrapeResults && scrapeResults[activeSourceTab] 
                  ? `in ${(scrapeResults[activeSourceTab].durationMs / 1000).toFixed(1)}s` 
                  : 'Ready to scrape'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-[#725a39] block">Unpromoted In Staging</span>
              <span className="text-base font-mono font-bold text-[#a5690c] mt-0.5 block">
                {Math.max(0, currentSource.raw.total - currentSource.raw.promoted).toLocaleString()} rows
              </span>
              <span className="text-[10px] text-[#725a39]">
                {currentSource.noPipeline ? 'Pipeline disconnected' : 'Awaiting promotion/AI'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-[#725a39] block">Promoted to Jobs</span>
              <span className="text-base font-mono font-bold text-[#16813d] mt-0.5 block">
                {(currentSource.raw.promoted || currentSource.jobs.total).toLocaleString()} rows
              </span>
              <span className="text-[10px] text-[#725a39]">In central database</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-[#725a39] block">New Jobs Today</span>
              <span className="text-base font-mono font-bold text-[#293417] mt-0.5 block">
                {currentSource.newToday || 0} today
              </span>
              <span className="text-[10px] text-[#725a39]">Since 00:00 UTC</span>
            </div>
          </div>

          {/* 10 Diagnostics & Metrics Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* 1. In Staging */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">In Staging</span>
              <span className="text-xl font-mono font-bold text-[#442a22] mt-1 block">
                {currentSource.raw.total.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] font-mono mt-0.5 block truncate" title={currentSource.stagingTable}>
                {Math.max(0, currentSource.raw.total - currentSource.raw.promoted)} unpromoted
              </span>
            </div>

            {/* 2. In Jobs */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">In Jobs DB</span>
              <span className="text-xl font-mono font-bold text-[#442a22] mt-1 block">
                {currentSource.jobs.total.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">Attributed via URL</span>
            </div>

            {/* 3. Live Listings */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">Live Listings</span>
              <span className="text-xl font-mono font-bold text-[#16813d] mt-1 block">
                {currentSource.jobs.active.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block font-mono">is_active = true</span>
            </div>

            {/* 4. Enriched */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">AI Enriched</span>
              <span className="text-xl font-mono font-bold text-[#293417] mt-1 block">
                {currentSource.jobs.enriched.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">
                of {currentSource.jobs.active.toLocaleString()} live ({enrichmentPct}%)
              </span>
            </div>

            {/* 5. Pending */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">Pending</span>
              <span className="text-xl font-mono font-bold text-[#a5690c] mt-1 block">
                {(currentSource.jobs.pending + currentSource.raw.pending).toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">
                staging: {currentSource.raw.pending.toLocaleString()}
              </span>
            </div>

            {/* 6. Failed */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">Extraction Failed</span>
              <span className="text-xl font-mono font-bold text-[#ba1a1a] mt-1 block">
                {currentSource.jobs.failed.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">
                staging: {currentSource.raw.failed.toLocaleString()}
              </span>
            </div>

            {/* 7. At Retry Cap */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">At Retry Cap</span>
              <span className="text-xl font-mono font-bold text-[#ba1a1a] mt-1 block">
                {currentSource.jobs.atCap.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">&gt;= 3 attempts</span>
            </div>

            {/* 8. Skipped */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">Skipped / Filtered</span>
              <span className="text-xl font-mono font-bold text-[#725a39] mt-1 block">
                {(currentSource.jobs.skipped + currentSource.raw.skipped).toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">expired / tender</span>
            </div>

            {/* 9. Duplicates */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">Duplicates Flagged</span>
              <span className="text-xl font-mono font-bold text-[#725a39] mt-1 block">
                {currentSource.jobs.dups.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">duplicate_of_job_id</span>
            </div>

            {/* 10. Past Deadline */}
            <div className="bg-white p-3.5 rounded-lg border border-[#e6e2d6] shadow-xs hover:-translate-y-0.5 transition-all duration-150">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#725a39] block">Past Deadline</span>
              <span className="text-xl font-mono font-bold text-[#725a39] mt-1 block">
                {currentSource.jobs.expired.toLocaleString()}
              </span>
              <span className="text-[10px] text-[#725a39] mt-0.5 block">in jobs table</span>
            </div>
          </div>

          {/* "What We Know About This Source" Notes Box */}
          <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#293417]" />
              <h3 className="text-xs font-sans font-bold text-[#442a22] uppercase tracking-wider">
                What We Know About This Source
              </h3>
            </div>
            <ul className="space-y-1.5 text-xs text-[#725a39]">
              {currentSource.notes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#293417] mt-1.5 flex-shrink-0" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual 3-Stage Ingestion Funnel Card */}
          <div className="bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e6e2d6]/70">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#293417]" />
                <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                  3-Stage Ingestion Funnel · {currentSource.name}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#725a39]">
                Staged &rarr; Live: <b className="text-[#16813d]">{currentSource.funnel.stagedToLivePct}% conversion</b>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Stage 1: Local */}
              <div 
                onClick={() => handleViewTabChange('local')}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  viewTab === 'local' ? 'border-[#293417] bg-[#293417]/5 shadow-xs' : 'border-[#e6e2d6] bg-[#fbf9f5] hover:border-[#dad3c1]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#725a39]">Stage 1 · Local Scraped</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#a5690c]/10 text-[#a5690c]">
                    Pre-Sync
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold text-[#442a22]">
                  {currentLocalCount}
                </div>
                <p className="text-[11px] text-[#725a39] mt-1 font-body">
                  Raw in-memory feed output not yet committed to DB.
                </p>
                {currentLocalCount > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSyncLocal(); }}
                    disabled={actionLoading === 'sync-local'}
                    className="mt-3 w-full py-1.5 px-3 rounded-lg bg-[#293417] text-[#fbf9f5] text-xs font-semibold hover:bg-[#1f2812] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{actionLoading === 'sync-local' ? 'Syncing...' : 'Sync to Staging Table'}</span>
                  </button>
                )}
              </div>

              {/* Stage 2: Staged */}
              <div 
                onClick={() => handleViewTabChange('staging')}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  viewTab === 'staging' ? 'border-[#293417] bg-[#293417]/5 shadow-xs' : 'border-[#e6e2d6] bg-[#fbf9f5] hover:border-[#dad3c1]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#725a39]">Stage 2 · Staged in Raw DB</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#725a39]/10 text-[#725a39]">
                    Staging Table
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold text-[#442a22]">
                  {currentSource.raw.total.toLocaleString()}
                </div>
                <p className="text-[11px] text-[#725a39] mt-1 font-body truncate" title={currentSource.stagingTable}>
                  {currentSource.stagingTable}
                </p>
                <div className="mt-3 pt-2 border-t border-[#e6e2d6]/70 flex justify-between text-[11px] text-[#725a39]">
                  <span>Pending AI: <b>{currentSource.raw.pending}</b></span>
                  <span>Failed: <b className="text-[#ba1a1a]">{currentSource.raw.failed}</b></span>
                </div>
              </div>

              {/* Stage 3: Live */}
              <div 
                onClick={() => handleViewTabChange('jobs')}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  viewTab === 'jobs' ? 'border-[#293417] bg-[#293417]/5 shadow-xs' : 'border-[#e6e2d6] bg-[#fbf9f5] hover:border-[#dad3c1]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#725a39]">Stage 3 · Live in Jobs DB</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#16813d]/10 text-[#16813d]">
                    Central DB
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold text-[#16813d]">
                  {currentSource.jobs.total.toLocaleString()}
                </div>
                <p className="text-[11px] text-[#725a39] mt-1 font-body">
                  {currentSource.jobs.active.toLocaleString()} active listings in Kazio user app.
                </p>
                <div className="mt-3 pt-2 border-t border-[#e6e2d6]/70 flex justify-between text-[11px] text-[#725a39]">
                  <span>Enriched: <b>{currentSource.jobs.enriched}</b></span>
                  <span>Conversion: <b className="text-[#16813d]">{currentSource.funnel.stagedToLivePct}%</b></span>
                </div>
              </div>
            </div>
          </div>

          {/* 3-View Explorer: "Local Scraped" vs "Staging Table" vs "In Jobs Table" */}
          <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden">
            {/* Table Toolbar */}
            <div className="p-4 border-b border-[#e6e2d6] flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#fbf9f5]">
              {/* Segmented control */}
              <div className="flex items-center gap-1.5 bg-[#ede9de] p-1 rounded-lg">
                <button
                  onClick={() => handleViewTabChange('local')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                    viewTab === 'local'
                      ? 'bg-white text-[#442a22] shadow-xs'
                      : 'text-[#725a39] hover:text-[#442a22]'
                  }`}
                >
                  <span>Local Scraped</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#a5690c]/15 text-[#a5690c] font-mono">
                    {currentLocalCount}
                  </span>
                </button>
                <button
                  onClick={() => handleViewTabChange('staging')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    viewTab === 'staging'
                      ? 'bg-white text-[#442a22] shadow-xs'
                      : 'text-[#725a39] hover:text-[#442a22]'
                  }`}
                >
                  Staging Table ({currentSource.stagingTable})
                </button>
                <button
                  onClick={() => handleViewTabChange('jobs')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    viewTab === 'jobs'
                      ? 'bg-white text-[#442a22] shadow-xs'
                      : 'text-[#725a39] hover:text-[#442a22]'
                  }`}
                >
                  In Jobs Table ({currentSource.jobs.total.toLocaleString()})
                </button>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#725a39] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title or company..."
                    className="pl-8 pr-7 py-1.5 text-xs bg-white border border-[#e6e2d6] rounded-lg text-[#442a22] focus:outline-none focus:border-[#293417] w-48 sm:w-56"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#725a39] hover:text-[#442a22]"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Dropdown Filter */}
                {viewTab !== 'local' && (
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 text-xs bg-white border border-[#e6e2d6] rounded-lg text-[#442a22] focus:outline-none focus:border-[#293417] cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="done">Done / Extracted</option>
                    <option value="failed">Failed</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="skipped">Skipped</option>
                  </select>
                )}

                {/* Refresh Button */}
                <button
                  onClick={loadTableData}
                  disabled={loadingRows}
                  className="p-2 text-[#725a39] hover:text-[#442a22] hover:bg-white rounded-lg border border-transparent hover:border-[#e6e2d6] transition-all cursor-pointer disabled:opacity-50"
                  title="Refresh table"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRows ? 'animate-spin text-[#293417]' : ''}`} />
                </button>

                <span className="text-xs font-mono text-[#725a39] pl-1">
                  {totalRowCount.toLocaleString()} total
                </span>
              </div>
            </div>

            {/* Error Message */}
            {tableError && (
              <div className="p-4 text-xs text-[#ba1a1a] bg-[#ba1a1a]/5 border-b border-[#ba1a1a]/20">
                {tableError}
              </div>
            )}

            {/* Table Content */}
            {loadingRows ? (
              <div className="py-16 flex flex-col items-center justify-center text-xs text-[#725a39] gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#293417]" />
                <span>Loading records...</span>
              </div>
            ) : viewTab === 'local' ? (
              /* LOCAL PRE-SYNC SCRAPED VIEW */
              currentLocalCount === 0 ? (
                <div className="py-16 text-center text-xs text-[#725a39]">
                  <p className="font-semibold text-sm text-[#442a22]">No pre-sync scraped jobs in local memory</p>
                  <p className="mt-1 text-xs text-[#725a39]">Run the scraper for {currentSource.name} to pull fresh jobs directly from the portal feed into local memory.</p>
                  <button
                    onClick={() => triggerSingleScrape(activeSourceTab)}
                    disabled={isScraping}
                    className="mt-4 px-4 py-2 bg-[#293417] text-[#fbf9f5] rounded-lg text-xs font-semibold shadow-xs hover:bg-[#1f2812] transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Scrape {currentSource.name} Now</span>
                  </button>
                </div>
              ) : (
                <div>
                  {/* Local Comparison & Sync Notice Banner */}
                  <div className="p-3.5 bg-[#fbf9f5] border-b border-[#e6e2d6] flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <div className="flex items-center gap-1.5 font-medium text-[#442a22]">
                        <span className="w-2 h-2 rounded-full bg-[#a5690c] animate-pulse" />
                        <span><b>{currentLocalCount}</b> cached in memory</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-[#293417]/10 text-[#293417] font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          <span>{comparisonLoading ? 'Comparing...' : `${comparisonData?.newlyAdded || 0} New to Staging`}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#725a39]/10 text-[#725a39] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{comparisonLoading ? '...' : `${comparisonData?.alreadyExisting || 0} Already Staged`}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Comparison Filter Toggles */}
                      <div className="flex bg-[#ede9de] p-0.5 rounded-lg text-[11px] font-medium">
                        <button
                          onClick={() => { setLocalFilter('all'); setCurrentPage(1); }}
                          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                            localFilter === 'all' ? 'bg-white text-[#442a22] font-bold shadow-xs' : 'text-[#725a39] hover:text-[#442a22]'
                          }`}
                        >
                          All ({comparisonData?.totalLocal || currentLocalCount})
                        </button>
                        <button
                          onClick={() => { setLocalFilter('new'); setCurrentPage(1); }}
                          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                            localFilter === 'new' ? 'bg-[#293417] text-[#fbf9f5] font-bold shadow-xs' : 'text-[#725a39] hover:text-[#442a22]'
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>New Only ({comparisonData?.newlyAdded || 0})</span>
                        </button>
                        <button
                          onClick={() => { setLocalFilter('staged'); setCurrentPage(1); }}
                          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                            localFilter === 'staged' ? 'bg-white text-[#442a22] font-bold shadow-xs' : 'text-[#725a39] hover:text-[#442a22]'
                          }`}
                        >
                          Staged ({comparisonData?.alreadyExisting || 0})
                        </button>
                      </div>

                      <button
                        onClick={handleSyncLocal}
                        disabled={actionLoading === 'sync-local'}
                        className="px-3.5 py-1.5 bg-[#293417] hover:bg-[#1f2812] text-[#fbf9f5] rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>
                          {actionLoading === 'sync-local' 
                            ? 'Syncing to DB...' 
                            : `Sync ${currentLocalCount} to DB ${comparisonData?.newlyAdded ? `(+${comparisonData.newlyAdded} New)` : ''}`}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Title / Role</th>
                          <th className="py-3 px-4">Company</th>
                          <th className="py-3 px-4">Location</th>
                          <th className="py-3 px-4">Deadline</th>
                          <th className="py-3 px-4">Raw Comparison</th>
                          <th className="py-3 px-4 text-right">Source Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e6e2d6]">
                        {localDisplayRows.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[#fbf9f5] transition-colors">
                            <td className="py-3 px-4 font-medium text-[#442a22] max-w-xs">
                              <div className="font-semibold truncate">
                                {item.title || 'Untitled Job'}
                              </div>
                              <span className="text-[10px] font-mono text-[#725a39]">
                                {item.job_type || 'Job'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[#725a39] max-w-[160px] truncate">
                              {item.company || 'Unknown'}
                            </td>
                            <td className="py-3 px-4 text-[#725a39] max-w-[140px] truncate">
                              {item.location || 'Rwanda'}
                            </td>
                            <td className="py-3 px-4 font-mono text-[#725a39] whitespace-nowrap">
                              {item.deadline || '—'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {item.isNewToStaging ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold tracking-wider bg-[#293417]/15 text-[#293417] inline-flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-[#293417]" />
                                  <span>New (Unstaged)</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold tracking-wider bg-[#725a39]/10 text-[#725a39] inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-[#725a39]" />
                                  <span>In Staging DB</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              {item.job_url && (
                                <a
                                  href={item.job_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#725a39] hover:text-[#293417] p-1 hover:bg-[#ede9de] rounded transition-colors inline-block"
                                  title="Open portal link"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : viewTab === 'jobs' ? (
              /* IN JOBS TABLE VIEW */
              jobsRows.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#725a39]">
                  No jobs found matching your filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Title / Role</th>
                        <th className="py-3 px-4">Company</th>
                        <th className="py-3 px-4">Location</th>
                        <th className="py-3 px-4">Deadline</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Enrichment Tags</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e2d6]">
                      {jobsRows.map((r) => {
                        const isEnriched = !!r.industry;
                        const isLive = r.is_active;
                        
                        return (
                          <tr
                            key={r.id}
                            onClick={() => openJobDrawer(r.id)}
                            className="hover:bg-[#fbf9f5] transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-4 font-medium text-[#442a22] max-w-xs">
                              <div className="font-semibold truncate group-hover:text-[#293417] transition-colors">
                                {r.title || 'Untitled Job'}
                              </div>
                              <span className="text-[10px] font-mono text-[#725a39]">ID: {r.id}</span>
                            </td>
                            <td className="py-3 px-4 text-[#725a39] max-w-[160px] truncate">
                              {r.company || '—'}
                            </td>
                            <td className="py-3 px-4 text-[#725a39] max-w-[140px] truncate">
                              {r.location || 'Rwanda'}
                            </td>
                            <td className="py-3 px-4 font-mono text-[#725a39] whitespace-nowrap">
                              {r.deadline || '—'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold tracking-wider ${
                                r.extraction_status === 'done'
                                  ? 'bg-[#16813d]/10 text-[#16813d]'
                                  : r.extraction_status === 'failed'
                                  ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                                  : r.extraction_status === 'processing'
                                  ? 'bg-[#a5690c]/10 text-[#a5690c]'
                                  : 'bg-[#725a39]/15 text-[#725a39]'
                              }`}>
                                {r.extraction_status || 'staged'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {isEnriched ? (
                                <div className="flex flex-wrap gap-1">
                                  <span className="px-1.5 py-0.5 bg-[#293417]/10 text-[#293417] rounded text-[10px] font-medium">
                                    {r.industry}
                                  </span>
                                  {r.job_function && (
                                    <span className="px-1.5 py-0.5 bg-[#725a39]/10 text-[#725a39] rounded text-[10px] font-medium">
                                      {r.job_function}
                                    </span>
                                  )}
                                </div>
                              ) : isLive ? (
                                <span className="text-[10px] font-mono text-[#a5690c] italic">
                                  live · not enriched
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#725a39]">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                {r.job_url && (
                                  <a
                                    href={r.job_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[#725a39] hover:text-[#293417] p-1 hover:bg-[#ede9de] rounded transition-colors"
                                    title="Open job posting"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* STAGING TABLE VIEW */
              stagingRows.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#725a39]">
                  No staging records found in {currentSource.stagingTable}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Staging ID / Title</th>
                        <th className="py-3 px-4">Company</th>
                        <th className="py-3 px-4">Deadline</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Attempts / Errors</th>
                        <th className="py-3 px-4">Last Scraped</th>
                        <th className="py-3 px-4 text-right">Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e2d6]">
                      {stagingRows.map((r, idx) => (
                        <tr
                          key={r.id || idx}
                          className="hover:bg-[#fbf9f5] transition-colors"
                        >
                          <td className="py-3 px-4 font-medium text-[#442a22] max-w-xs">
                            <div className="font-semibold truncate">
                              {r.title || 'Untitled Staged Record'}
                            </div>
                            <span className="text-[10px] font-mono text-[#725a39]">
                              ID: {String(r.id)} {r.promotedId ? `→ Promoted #${r.promotedId}` : ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#725a39] max-w-[160px] truncate">
                            {r.company || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#725a39] whitespace-nowrap">
                            {r.deadline || '—'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold tracking-wider ${
                              r.status === 'done'
                                ? 'bg-[#16813d]/10 text-[#16813d]'
                                : r.status === 'failed'
                                ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                                : r.status === 'pending'
                                ? 'bg-[#a5690c]/10 text-[#a5690c]'
                                : 'bg-[#725a39]/15 text-[#725a39]'
                            }`}>
                              {r.status || 'staged'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#725a39] max-w-xs truncate font-mono text-[11px]">
                            {r.error ? (
                              <span className="text-[#ba1a1a]" title={r.error}>
                                {r.error.slice(0, 45)}...
                              </span>
                            ) : r.attempts ? (
                              <span>Attempts: {r.attempts}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#725a39] whitespace-nowrap text-[11px]">
                            {r.scrapedAt ? r.scrapedAt.slice(0, 10) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#725a39] hover:text-[#293417] p-1 inline-flex items-center gap-1 hover:underline font-medium"
                              >
                                <span>Site</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-[#725a39]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Pagination Controls */}
            <div className="p-4 border-t border-[#e6e2d6] flex items-center justify-between bg-[#fbf9f5] text-xs">
              <span className="text-[#725a39] font-mono">
                Showing {Math.min((currentPage - 1) * pageSize + 1, totalRowCount)}–
                {Math.min(currentPage * pageSize, totalRowCount)} of {totalRowCount.toLocaleString()} rows
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage <= 1 || loadingRows}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-white text-[#442a22] hover:bg-[#f7f5ef] disabled:opacity-40 cursor-pointer font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <span className="px-2 font-mono text-xs font-semibold text-[#442a22]">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages || loadingRows}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-white text-[#442a22] hover:bg-[#f7f5ef] disabled:opacity-40 cursor-pointer font-medium"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
