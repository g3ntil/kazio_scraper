import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  ExternalLink, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Tag, 
  Building2, 
  MapPin, 
  Layers,
  Sparkles,
  ArrowUpDown,
  RotateCcw
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { fetchJobsExplorer, srcOfUrl } from '../services/dataService';
import { JobRow, SourceId } from '../types/dashboard';

const SOURCE_LABELS: Record<string, { name: string; letter: string; color: string; bg: string }> = {
  jobinrwanda: { name: 'Job in Rwanda', letter: 'J', color: '#16813d', bg: '#16813d15' },
  brightermonday: { name: 'BrighterMonday', letter: 'B', color: '#2954e0', bg: '#2954e015' },
  ndangira: { name: 'Ndangira', letter: 'N', color: '#7c3fd0', bg: '#7c3fd015' },
  greatrwandajobs: { name: 'Great Rwanda Jobs', letter: 'G', color: '#a5690c', bg: '#a5690c15' },
  jobwebrwanda: { name: 'JobWeb Rwanda', letter: 'W', color: '#725a39', bg: '#725a3915' },
  other: { name: 'Manual / Other', letter: 'O', color: '#63636a', bg: '#63636a15' }
};

export const JobsExplorerPage: React.FC = () => {
  const { openJobDrawer } = useDashboard();
  
  // Data state
  const [rows, setRows] = useState<JobRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filter state
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<string>('');
  
  // Jump to page input
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const pageSize = 25;
  const todayStr = new Date().toISOString().split('T')[0];

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load data function
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetchJobsExplorer({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        source: sourceFilter,
        status: statusFilter,
        quickFilter: quickFilter || undefined
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      console.error("Error loading jobs explorer data:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [page, debouncedSearch, sourceFilter, statusFilter, quickFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasActiveFilters = Boolean(
    debouncedSearch || 
    sourceFilter !== 'all' || 
    statusFilter !== 'all' || 
    quickFilter !== ''
  );

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSourceFilter('all');
    setStatusFilter('all');
    setQuickFilter('');
    setPage(1);
  };

  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPage = parseInt(jumpPageInput, 10);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
      setPage(targetPage);
      setJumpPageInput('');
    }
  };

  // Status badge styling helper
  const getStatusBadge = (status: string, attempts: number) => {
    const s = (status || 'pending').toLowerCase();
    if (s === 'done') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#16813d]/10 text-[#16813d]">
          <CheckCircle2 className="w-2.5 h-2.5" />
          DONE
        </span>
      );
    }
    if (s === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#ba1a1a]/10 text-[#ba1a1a]">
          <AlertTriangle className="w-2.5 h-2.5" />
          FAILED {attempts > 0 && <span className="opacity-80">×{attempts}</span>}
        </span>
      );
    }
    if (s === 'processing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#2954e0]/10 text-[#2954e0]">
          <Clock className="w-2.5 h-2.5 animate-spin" />
          PROCESSING
        </span>
      );
    }
    if (s.startsWith('skipped')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#725a39]/15 text-[#725a39]">
          SKIPPED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#a5690c]/10 text-[#a5690c]">
        PENDING
      </span>
    );
  };

  // Source attribution helper
  const getSourceMeta = (url: string | null) => {
    const srcKey = srcOfUrl(url);
    return SOURCE_LABELS[srcKey] || SOURCE_LABELS.other;
  };

  return (
    <div className="space-y-6 font-body text-[#442a22]">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">
              Jobs Explorer &amp; Deep Database
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-[#293417]/10 text-[#293417] text-xs font-mono font-bold">
              {total.toLocaleString()} listings
            </span>
          </div>
          <p className="text-xs text-[#725a39] mt-1">
            Real-time inspection engine querying central <code className="font-mono bg-[#ede9de] px-1.5 py-0.5 rounded text-[#442a22]">public.jobs</code> table with full extraction payloads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#ba1a1a] bg-[#ba1a1a]/10 hover:bg-[#ba1a1a]/15 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}

          <button
            onClick={() => loadData(true)}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-[#fbf9f5] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh jobs table"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#293417] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#725a39]/60" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by job title or company name..."
              className="w-full pl-9 pr-8 py-2 bg-[#fbf9f5] border border-[#e6e2d6] rounded-lg text-xs text-[#442a22] placeholder-[#725a39]/50 focus:outline-none focus:ring-1 focus:ring-[#293417] focus:border-[#293417] transition-all"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-2.5 text-[#725a39] hover:text-[#442a22] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Source Dropdown */}
          <div className="min-w-[160px]">
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-[#fbf9f5] border border-[#e6e2d6] rounded-lg text-xs text-[#442a22] focus:outline-none focus:ring-1 focus:ring-[#293417] cursor-pointer"
            >
              <option value="all">All Sources (5 Portals)</option>
              <option value="jobinrwanda">Job in Rwanda</option>
              <option value="brightermonday">BrighterMonday</option>
              <option value="ndangira">Ndangira</option>
              <option value="greatrwandajobs">Great Rwanda Jobs</option>
              <option value="jobwebrwanda">JobWeb Rwanda</option>
              <option value="other">Manual / Other</option>
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="min-w-[150px]">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-[#fbf9f5] border border-[#e6e2d6] rounded-lg text-xs text-[#442a22] focus:outline-none focus:ring-1 focus:ring-[#293417] cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="done">Done / Enriched</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>

          {/* Quick Filter Dropdown */}
          <div className="min-w-[190px]">
            <select
              value={quickFilter}
              onChange={(e) => { setQuickFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-[#fbf9f5] border border-[#e6e2d6] rounded-lg text-xs text-[#442a22] focus:outline-none focus:ring-1 focus:ring-[#293417] cursor-pointer font-medium"
            >
              <option value="">Quick Filter: None</option>
              <option value="active">Active Only (is_active = true)</option>
              <option value="unenriched">Active &amp; Not Enriched</option>
              <option value="at_cap">At Retry Cap (&gt;= 3 attempts)</option>
              <option value="no_deadline">Missing Deadline</option>
              <option value="expired">Expired Deadline</option>
              <option value="duplicate">Flagged Duplicate</option>
            </select>
          </div>
        </div>

        {/* Filter Summary Tags */}
        {hasActiveFilters && (
          <div className="pt-2 border-t border-[#e6e2d6]/60 flex items-center gap-2 text-[11px] text-[#725a39] flex-wrap">
            <span className="font-semibold text-[#442a22]">Active Filters:</span>
            {debouncedSearch && (
              <span className="px-2 py-0.5 rounded-md bg-[#ede9de] text-[#442a22] font-mono">
                q: "{debouncedSearch}"
              </span>
            )}
            {sourceFilter !== 'all' && (
              <span className="px-2 py-0.5 rounded-md bg-[#ede9de] text-[#442a22]">
                source: {SOURCE_LABELS[sourceFilter]?.name || sourceFilter}
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="px-2 py-0.5 rounded-md bg-[#ede9de] text-[#442a22]">
                status: {statusFilter}
              </span>
            )}
            {quickFilter && (
              <span className="px-2 py-0.5 rounded-md bg-[#293417]/10 text-[#293417] font-medium">
                quick: {quickFilter.replace('_', ' ')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-xs text-[#725a39] space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#293417]" />
            <p className="font-medium">Fetching job listings from Supabase...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4 space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#fbf9f5] border border-[#e6e2d6] flex items-center justify-center text-[#725a39]">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#442a22]">No jobs match your filter criteria</p>
              <p className="text-xs text-[#725a39] mt-0.5 max-w-sm">
                Try clearing search terms or relaxing your source and status constraints.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-3 py-1.5 rounded-lg bg-[#293417] text-white text-xs font-semibold hover:bg-[#3d4d23] transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-16">ID</th>
                  <th className="py-3 px-4 min-w-[240px]">Job Title &amp; Company</th>
                  <th className="py-3 px-4 w-36">Source</th>
                  <th className="py-3 px-4 w-28">Status</th>
                  <th className="py-3 px-4 min-w-[200px]">AI Enrichment Tags</th>
                  <th className="py-3 px-4 w-32">Deadline</th>
                  <th className="py-3 px-4 text-right w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e2d6]">
                {rows.map((r) => {
                  const srcMeta = getSourceMeta(r.job_url);
                  const isExpired = r.deadline ? r.deadline < todayStr : false;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => openJobDrawer(r.id)}
                      className="hover:bg-[#fbf9f5] transition-colors cursor-pointer group"
                    >
                      {/* ID */}
                      <td className="py-3 px-4 font-mono text-[#725a39] text-[11px] whitespace-nowrap">
                        #{r.id}
                      </td>

                      {/* Title & Company */}
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-semibold text-[#442a22] group-hover:text-[#293417] transition-colors line-clamp-1 leading-snug">
                          {r.title || 'Untitled Job Posting'}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-[#725a39] flex-wrap">
                          {r.company && (
                            <span className="flex items-center gap-1 font-medium text-[#442a22]">
                              <Building2 className="w-3 h-3 opacity-60" />
                              {r.company}
                            </span>
                          )}
                          {r.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 opacity-60" />
                              {r.location}
                            </span>
                          )}
                          {!r.is_active && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#725a39]/15 text-[#725a39]">
                              INACTIVE
                            </span>
                          )}
                          {r.duplicate_of_job_id && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#7c3fd0]/15 text-[#7c3fd0]">
                              DUPLICATE
                            </span>
                          )}
                          {r.content_type && r.content_type !== 'job' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#a5690c]/15 text-[#a5690c] capitalize">
                              {r.content_type}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Source */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span 
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium"
                          style={{ backgroundColor: srcMeta.bg, color: srcMeta.color }}
                        >
                          <span className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] bg-white/70">
                            {srcMeta.letter}
                          </span>
                          {srcMeta.name}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(r.extraction_status, r.extraction_attempts)}
                      </td>

                      {/* AI Enrichment */}
                      <td className="py-3 px-4 text-[11px]">
                        {r.industry ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-[#293417]/10 text-[#293417] font-semibold text-[10px] truncate max-w-[160px]">
                                {r.industry.replace(/_/g, ' ')}
                              </span>
                              {r.skills_t1 && r.skills_t1.length > 0 && (
                                <span className="text-[10px] text-[#725a39] font-mono">
                                  {r.skills_t1.length} skills
                                </span>
                              )}
                            </div>
                            {r.job_function && (
                              <div className="text-[#725a39] text-[10px] truncate max-w-[180px]">
                                {r.job_function.replace(/_/g, ' ')}
                              </div>
                            )}
                          </div>
                        ) : r.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[#a5690c] font-medium italic text-[11px]">
                            <Sparkles className="w-3 h-3" />
                            live · not enriched
                          </span>
                        ) : (
                          <span className="text-[#725a39]/50">—</span>
                        )}
                      </td>

                      {/* Deadline */}
                      <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                        {r.deadline ? (
                          <span className={isExpired ? 'text-[#ba1a1a] font-semibold flex items-center gap-1' : 'text-[#725a39]'}>
                            {r.deadline}
                            {isExpired && <span className="text-[9px] uppercase">✕ Exp</span>}
                          </span>
                        ) : (
                          <span className="text-[#725a39]/50 italic text-[10px]">None</span>
                        )}
                      </td>

                      {/* External Link */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <a
                          href={r.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md text-[#725a39] hover:text-[#293417] hover:bg-[#ede9de] transition-colors inline-flex items-center gap-1 font-semibold"
                          title="Open original posting"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[#e6e2d6] bg-[#fbf9f5] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#725a39]">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-[#442a22] font-mono">{total > 0 ? (page - 1) * pageSize + 1 : 0}</strong> – <strong className="text-[#442a22] font-mono">{Math.min(page * pageSize, total)}</strong> of <strong className="text-[#442a22] font-mono">{total.toLocaleString()}</strong> listings
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Jump to page */}
            <form onSubmit={handleJumpPage} className="flex items-center gap-1">
              <span className="text-[11px]">Jump to:</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder={String(page)}
                className="w-12 px-1.5 py-1 bg-white border border-[#e6e2d6] rounded-md text-xs text-center font-mono text-[#442a22] focus:outline-none focus:ring-1 focus:ring-[#293417]"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded-md bg-[#ede9de] hover:bg-[#e0dbc9] text-[11px] font-semibold text-[#442a22] transition-colors cursor-pointer"
              >
                Go
              </button>
            </form>

            <span className="text-[#e6e2d6]">|</span>

            {/* Prev / Next buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] font-semibold text-[#442a22] hover:bg-[#ede9de] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs inline-flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-2 font-mono font-bold text-[#442a22] text-xs">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages || loading}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] font-semibold text-[#442a22] hover:bg-[#ede9de] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs inline-flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobsExplorerPage;
