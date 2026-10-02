import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  AlertTriangle, 
  RefreshCw, 
  Clock, 
  ShieldAlert, 
  Flame, 
  Layers, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Copy, 
  Check, 
  Activity,
  AlertCircle,
  Info,
  Code2
} from 'lucide-react';
import { OpsAlertEvent, AlertBurst } from '../types/dashboard';
import { fetchAlertEvents } from '../services/dataService';

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<OpsAlertEvent[]>([]);
  const [bursts, setBursts] = useState<AlertBurst[]>([]);
  const [metrics, setMetrics] = useState<{
    total: number;
    last24h: number;
    burstsCount: number;
    latestTime: string | null;
    latestSeverity: 'critical' | 'warning' | 'info' | null;
  }>({
    total: 0,
    last24h: 0,
    burstsCount: 0,
    latestTime: null,
    latestSeverity: null
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [codeFilter, setCodeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expand states
  const [expandedBurstId, setExpandedBurstId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | number | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);

  // Active view tab: 'events' or 'bursts'
  const [activeTab, setActiveTab] = useState<'events' | 'bursts'>('events');

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetchAlertEvents(250);
      setAlerts(res.alerts);
      setBursts(res.bursts);
      setMetrics(res.metrics);
    } catch (err) {
      console.error('Failed to load alert events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique codes list for dropdown filter
  const uniqueCodes = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach(a => {
      if (a.code) set.add(a.code);
    });
    return Array.from(set).sort();
  }, [alerts]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      // Severity filter
      if (severityFilter !== 'all' && a.severity !== severityFilter) {
        return false;
      }
      // Code filter
      if (codeFilter !== 'all' && a.code !== codeFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msgMatch = a.message ? a.message.toLowerCase().includes(q) : false;
        const codeMatch = a.code ? a.code.toLowerCase().includes(q) : false;
        const metricsMatch = a.metrics ? JSON.stringify(a.metrics).toLowerCase().includes(q) : false;
        if (!msgMatch && !codeMatch && !metricsMatch) return false;
      }
      return true;
    });
  }, [alerts, severityFilter, codeFilter, searchQuery]);

  // Severity counts for filter chips
  const severityCounts = useMemo(() => {
    const counts = { all: alerts.length, critical: 0, warning: 0, info: 0 };
    alerts.forEach(a => {
      if (a.severity === 'critical') counts.critical++;
      else if (a.severity === 'warning') counts.warning++;
      else if (a.severity === 'info') counts.info++;
    });
    return counts;
  }, [alerts]);

  const handleCopy = (id: string | number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'No events';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return isoString.replace('T', ' ').split('.')[0];
    }
  };

  return (
    <div className="space-y-6 font-body">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">
              Alerts &amp; Incidents Center
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#293417]/10 text-[#293417]">
              Live Stream
            </span>
          </div>
          <p className="text-xs text-[#725a39] mt-1">
            Realtime anomaly tracking, quota exhaustion alerts, cron halts, and 30-minute burst clustering from <code className="font-mono bg-[#f3efe6] px-1.5 py-0.5 rounded text-[11px] text-[#442a22]">ops_alert_events</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="px-3.5 py-2 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-[#fbf9f5] hover:border-[#725a39]/40 transition-all flex items-center gap-2 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#725a39] ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Logs'}
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Alerts */}
        <div className="bg-white rounded-lg border border-[#e6e2d6] p-4 shadow-2xs hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#725a39]">Total Logged Alerts</span>
            <div className="w-8 h-8 rounded-lg bg-[#442a22]/5 flex items-center justify-center text-[#442a22]">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-sans font-bold text-[#442a22] font-mono">
              {loading ? '—' : metrics.total}
            </span>
            <span className="text-[11px] text-[#725a39]">events captured</span>
          </div>
          <p className="text-[11px] text-[#725a39]/80 mt-1">
            {metrics.total > 0 ? 'Across current query limit window' : 'No recorded incidents'}
          </p>
        </div>

        {/* Alerts Last 24h */}
        <div className="bg-white rounded-lg border border-[#e6e2d6] p-4 shadow-2xs hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#725a39]">Alerts in Last 24h</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              metrics.last24h > 0 ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]' : 'bg-[#293417]/10 text-[#293417]'
            }`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-sans font-bold font-mono ${
              metrics.last24h > 0 ? 'text-[#ba1a1a]' : 'text-[#442a22]'
            }`}>
              {loading ? '—' : metrics.last24h}
            </span>
            <span className="text-[11px] text-[#725a39]">past 24 hours</span>
          </div>
          <p className="text-[11px] text-[#725a39]/80 mt-1">
            {metrics.last24h === 0 ? 'Zero active incidents today' : 'Requires monitoring or review'}
          </p>
        </div>

        {/* 30-min Incident Bursts */}
        <div className="bg-white rounded-lg border border-[#e6e2d6] p-4 shadow-2xs hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#725a39]">30-Min Incident Bursts</span>
            <div className="w-8 h-8 rounded-lg bg-[#a5690c]/10 flex items-center justify-center text-[#a5690c]">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-sans font-bold text-[#442a22] font-mono">
              {loading ? '—' : metrics.burstsCount}
            </span>
            <span className="text-[11px] text-[#725a39]">cascading clusters</span>
          </div>
          <p className="text-[11px] text-[#725a39]/80 mt-1">
            {bursts.length > 0 ? `Clustered into ${bursts.length} incident windows` : 'No cascading events'}
          </p>
        </div>

        {/* Latest Incident */}
        <div className="bg-white rounded-lg border border-[#e6e2d6] p-4 shadow-2xs hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#725a39]">Latest Event</span>
            <div className="w-8 h-8 rounded-lg bg-[#293417]/10 flex items-center justify-center text-[#293417]">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-sans font-bold text-[#442a22]">
              {loading ? '—' : formatRelativeTime(metrics.latestTime)}
            </span>
            {metrics.latestSeverity && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                metrics.latestSeverity === 'critical'
                  ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                  : metrics.latestSeverity === 'warning'
                  ? 'bg-[#a5690c]/10 text-[#a5690c]'
                  : 'bg-[#293417]/10 text-[#293417]'
              }`}>
                {metrics.latestSeverity}
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-[#725a39]/80 mt-1 truncate">
            {metrics.latestTime ? formatDateTime(metrics.latestTime) : 'All nominal'}
          </p>
        </div>
      </div>

      {/* Tab Switcher: Operational Events vs Burst Timeline */}
      <div className="flex items-center gap-2 border-b border-[#e6e2d6] pb-3">
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'events'
              ? 'bg-[#442a22] text-white shadow-2xs'
              : 'bg-white text-[#725a39] border border-[#e6e2d6] hover:bg-[#fbf9f5]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          All Operational Events ({filteredAlerts.length})
        </button>

        <button
          onClick={() => setActiveTab('bursts')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'bursts'
              ? 'bg-[#442a22] text-white shadow-2xs'
              : 'bg-white text-[#725a39] border border-[#e6e2d6] hover:bg-[#fbf9f5]'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          30-Minute Burst Clustering ({bursts.length})
        </button>
      </div>

      {/* VIEW 1: OPERATIONAL EVENTS TABLE */}
      {activeTab === 'events' && (
        <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-2xs overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-[#e6e2d6] bg-[#fbf9f5]/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-[#725a39] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by event code, message, or payload..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#e6e2d6] rounded-lg text-[#442a22] placeholder-[#725a39]/60 focus:outline-none focus:border-[#442a22] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#725a39] hover:text-[#442a22]"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Severity Filter Tabs & Code Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white border border-[#e6e2d6] rounded-lg p-0.5">
                <button
                  onClick={() => setSeverityFilter('all')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    severityFilter === 'all'
                      ? 'bg-[#442a22] text-white font-semibold'
                      : 'text-[#725a39] hover:text-[#442a22]'
                  }`}
                >
                  All ({severityCounts.all})
                </button>
                <button
                  onClick={() => setSeverityFilter('critical')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    severityFilter === 'critical'
                      ? 'bg-[#ba1a1a] text-white font-semibold'
                      : 'text-[#ba1a1a] hover:bg-[#ba1a1a]/10'
                  }`}
                >
                  Critical ({severityCounts.critical})
                </button>
                <button
                  onClick={() => setSeverityFilter('warning')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    severityFilter === 'warning'
                      ? 'bg-[#a5690c] text-white font-semibold'
                      : 'text-[#a5690c] hover:bg-[#a5690c]/10'
                  }`}
                >
                  Warning ({severityCounts.warning})
                </button>
                <button
                  onClick={() => setSeverityFilter('info')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    severityFilter === 'info'
                      ? 'bg-[#293417] text-white font-semibold'
                      : 'text-[#293417] hover:bg-[#293417]/10'
                  }`}
                >
                  Info ({severityCounts.info})
                </button>
              </div>

              {/* Code Filter Dropdown */}
              {uniqueCodes.length > 0 && (
                <div className="relative">
                  <select
                    value={codeFilter}
                    onChange={(e) => setCodeFilter(e.target.value)}
                    className="pl-2.5 pr-7 py-1 text-[11px] bg-white border border-[#e6e2d6] rounded-lg text-[#442a22] focus:outline-none focus:border-[#442a22] cursor-pointer"
                  >
                    <option value="all">All Codes</option>
                    {uniqueCodes.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Table Body */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-xs text-[#725a39]">
              <RefreshCw className="w-5 h-5 animate-spin mb-2 text-[#293417]" />
              Querying <code className="font-mono text-[#442a22]">ops_alert_events</code> from Supabase...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="w-10 h-10 rounded-full bg-[#293417]/10 text-[#293417] flex items-center justify-center mx-auto mb-3">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-sans font-bold text-[#442a22]">No Operational Alerts Found</h3>
              <p className="text-xs text-[#725a39] mt-1 max-w-sm mx-auto">
                {searchQuery || severityFilter !== 'all' || codeFilter !== 'all'
                  ? 'No events match your selected search or severity filters. Try resetting the filters above.'
                  : 'The scraper pipeline and extraction engine are operating cleanly with zero recorded incidents.'}
              </p>
              {(searchQuery || severityFilter !== 'all' || codeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSeverityFilter('all');
                    setCodeFilter('all');
                  }}
                  className="mt-3 text-xs font-semibold text-[#442a22] underline cursor-pointer"
                >
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center"></th>
                    <th className="py-3 px-4 whitespace-nowrap">Timestamp</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Event Code</th>
                    <th className="py-3 px-4">Message</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e2d6]">
                  {filteredAlerts.map((a) => {
                    const isExpanded = expandedEventId === a.id;
                    const hasMetrics = a.metrics && Object.keys(a.metrics).length > 0;

                    return (
                      <React.Fragment key={a.id}>
                        <tr 
                          onClick={() => setExpandedEventId(isExpanded ? null : a.id)}
                          className={`hover:bg-[#fbf9f5] transition-colors cursor-pointer ${isExpanded ? 'bg-[#fbf9f5]/80' : ''}`}
                        >
                          <td className="py-3 px-2 text-center text-[#725a39]">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 mx-auto text-[#442a22]" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 mx-auto text-[#725a39]/60" />
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono text-[#442a22] text-[11px] font-medium">
                              {formatDateTime(a.created_at)}
                            </div>
                            <div className="text-[10px] text-[#725a39]">
                              {formatRelativeTime(a.created_at)}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              a.severity === 'critical'
                                ? 'bg-[#ba1a1a]/10 text-[#ba1a1a] border border-[#ba1a1a]/20'
                                : a.severity === 'warning'
                                ? 'bg-[#a5690c]/10 text-[#a5690c] border border-[#a5690c]/20'
                                : 'bg-[#293417]/10 text-[#293417] border border-[#293417]/20'
                            }`}>
                              {a.severity === 'critical' && <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
                              {a.severity === 'warning' && <AlertCircle className="w-2.5 h-2.5 mr-1" />}
                              {a.severity === 'info' && <Info className="w-2.5 h-2.5 mr-1" />}
                              {a.severity}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-[#442a22] bg-[#f3efe6] px-1.5 py-0.5 rounded text-[11px] border border-[#e6e2d6]">
                              {a.code}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#442a22] max-w-md">
                            <p className="line-clamp-2 text-xs leading-relaxed">
                              {a.message}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedEventId(isExpanded ? null : a.id);
                              }}
                              className="text-[11px] font-semibold text-[#725a39] hover:text-[#442a22] underline cursor-pointer"
                            >
                              {isExpanded ? 'Hide Payload' : hasMetrics ? 'View Payload' : 'View Row'}
                            </button>
                          </td>
                        </tr>

                        {/* Expandable JSON / Details Accordion */}
                        {isExpanded && (
                          <tr className="bg-[#fbf9f5]">
                            <td colSpan={6} className="p-4 pl-12 border-b border-[#e6e2d6]">
                              <div className="bg-white rounded-lg border border-[#e6e2d6] p-3 shadow-2xs space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Code2 className="w-3.5 h-3.5 text-[#725a39]" />
                                    <span className="text-[11px] font-sans font-bold text-[#442a22] uppercase tracking-wider">
                                      Event Payload &amp; Diagnostic Metrics (ID: {a.id})
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleCopy(a.id, JSON.stringify(a, null, 2))}
                                    className="px-2 py-1 rounded bg-[#fbf9f5] border border-[#e6e2d6] text-[10px] font-medium text-[#442a22] hover:bg-white flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    {copiedId === a.id ? (
                                      <>
                                        <Check className="w-3 h-3 text-[#293417]" />
                                        Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3 text-[#725a39]" />
                                        Copy JSON
                                      </>
                                    )}
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-[#725a39] uppercase tracking-wider block mb-1">
                                      Full Message
                                    </span>
                                    <p className="p-2.5 rounded bg-[#fbf9f5] border border-[#e6e2d6] text-[#442a22] text-xs font-mono break-words leading-relaxed">
                                      {a.message}
                                    </p>
                                  </div>

                                  <div>
                                    <span className="text-[10px] font-bold text-[#725a39] uppercase tracking-wider block mb-1">
                                      Metrics / Metadata JSON
                                    </span>
                                    <pre className="p-2.5 rounded bg-[#1e1e1e] text-[#d4d4d4] text-[11px] font-mono overflow-x-auto max-h-48 border border-[#e6e2d6]">
                                      {a.metrics ? JSON.stringify(a.metrics, null, 2) : '{\n  "note": "No extra metrics payload attached"\n}'}
                                    </pre>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-[#725a39] pt-2 border-t border-[#e6e2d6]/60">
                                  <span>Logged to <code className="font-mono">ops_alert_events</code></span>
                                  <span className="font-mono">ISO: {a.created_at}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: 30-MINUTE BURST CLUSTERING */}
      {activeTab === 'bursts' && (
        <div className="space-y-4">
          {/* Burst Engine Explainer Card */}
          <div className="bg-[#fbf9f5] border border-[#e6e2d6] rounded-lg p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#a5690c]/10 text-[#a5690c] flex items-center justify-center shrink-0 mt-0.5">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-sans font-bold text-[#442a22] uppercase tracking-wider">
                30-Minute Rolling Burst Clustering Engine
              </h3>
              <p className="text-xs text-[#725a39] mt-0.5 leading-relaxed">
                When rate limits, key outages, or site scraping blockers occur, dozens of alerts often trigger in rapid succession. The burst clustering engine groups all alerts occurring within 30 minutes of each other into single incident storms, revealing duration, dominant severity, and error cascade patterns.
              </p>
            </div>
          </div>

          {/* Burst Cards List */}
          {bursts.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#e6e2d6] p-12 text-center">
              <div className="w-10 h-10 rounded-full bg-[#293417]/10 text-[#293417] flex items-center justify-center mx-auto mb-3">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-sans font-bold text-[#442a22]">Zero Incident Bursts Detected</h3>
              <p className="text-xs text-[#725a39] mt-1 max-w-sm mx-auto">
                No cascading alert bursts recorded within the 30-minute clustering window.
              </p>
            </div>
          ) : (
            bursts.map((burst, idx) => {
              const isExpanded = expandedBurstId === burst.id;

              return (
                <div 
                  key={burst.id} 
                  className="bg-white rounded-lg border border-[#e6e2d6] shadow-2xs overflow-hidden transition-all"
                >
                  {/* Burst Header */}
                  <div 
                    onClick={() => setExpandedBurstId(isExpanded ? null : burst.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#fbf9f5] transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        burst.dominantSeverity === 'critical'
                          ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                          : burst.dominantSeverity === 'warning'
                          ? 'bg-[#a5690c]/10 text-[#a5690c]'
                          : 'bg-[#293417]/10 text-[#293417]'
                      }`}>
                        <Flame className="w-4 h-4" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-sans font-bold text-sm text-[#442a22]">
                            Incident Burst #{bursts.length - idx}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            burst.dominantSeverity === 'critical'
                              ? 'bg-[#ba1a1a]/10 text-[#ba1a1a] border border-[#ba1a1a]/20'
                              : burst.dominantSeverity === 'warning'
                              ? 'bg-[#a5690c]/10 text-[#a5690c] border border-[#a5690c]/20'
                              : 'bg-[#293417]/10 text-[#293417] border border-[#293417]/20'
                          }`}>
                            {burst.dominantSeverity}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#442a22]/5 text-[#442a22]">
                            {burst.count} {burst.count === 1 ? 'alert' : 'alerts'} collapsed
                          </span>
                        </div>

                        <p className="text-xs text-[#725a39] mt-1 line-clamp-1">
                          {burst.summary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-auto">
                      <div className="text-right">
                        <div className="text-[11px] font-mono text-[#442a22] font-semibold">
                          Duration: {burst.durationMinutes} min
                        </div>
                        <div className="text-[10px] text-[#725a39]">
                          {formatDateTime(burst.startTime)} – {formatDateTime(burst.endTime)}
                        </div>
                      </div>

                      <button className="p-1 text-[#725a39] hover:text-[#442a22]">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Codes summary strip */}
                  <div className="px-4 py-2 bg-[#fbf9f5] border-t border-[#e6e2d6] flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-bold text-[#725a39] tracking-wider">
                      Event Codes:
                    </span>
                    {burst.codes.map(code => (
                      <span key={code} className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-white border border-[#e6e2d6] text-[#442a22]">
                        {code}
                      </span>
                    ))}
                  </div>

                  {/* Expanded Burst Events Sub-table */}
                  {isExpanded && (
                    <div className="p-4 border-t border-[#e6e2d6] bg-white space-y-3">
                      <h4 className="text-xs font-sans font-bold text-[#442a22] uppercase tracking-wider">
                        Events Inside This Burst Cluster ({burst.events.length})
                      </h4>

                      <div className="space-y-2">
                        {burst.events.map(ev => (
                          <div 
                            key={ev.id} 
                            className="p-3 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] hover:bg-white transition-colors space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  ev.severity === 'critical'
                                    ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                                    : ev.severity === 'warning'
                                    ? 'bg-[#a5690c]/10 text-[#a5690c]'
                                    : 'bg-[#293417]/10 text-[#293417]'
                                }`}>
                                  {ev.severity}
                                </span>
                                <span className="font-mono font-bold text-[#442a22] text-[11px]">
                                  {ev.code}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-[#725a39]">
                                {formatDateTime(ev.created_at)} ({formatRelativeTime(ev.created_at)})
                              </span>
                            </div>

                            <p className="text-xs text-[#442a22] leading-relaxed">
                              {ev.message}
                            </p>

                            {ev.metrics && Object.keys(ev.metrics).length > 0 && (
                              <details className="mt-1">
                                <summary className="text-[10px] font-semibold text-[#725a39] hover:text-[#442a22] cursor-pointer">
                                  View event metrics payload
                                </summary>
                                <pre className="mt-1 p-2 rounded bg-[#1e1e1e] text-[#d4d4d4] text-[10px] font-mono overflow-x-auto max-h-32">
                                  {JSON.stringify(ev.metrics, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
