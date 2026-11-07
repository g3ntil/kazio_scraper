import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AggregateDashboardData, PageId, SourceId, ActivityLogEntry, SyncResult, CompareResult } from '../types/dashboard';
import { aggregateLive, fetchLocalScraped, syncLocalToStaging, compareLocalWithStaging } from '../services/dataService';
import { scrapeSource, ScrapeResult } from '../services/scraperService';

interface DashboardContextType {
  data: AggregateDashboardData | null;
  loading: boolean;
  error: string | null;
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  activeSourceTab: SourceId;
  setActiveSourceTab: (source: SourceId) => void;
  selectedJobId: string | number | null;
  isDrawerOpen: boolean;
  openJobDrawer: (id: string | number) => void;
  closeJobDrawer: () => void;
  refreshAll: () => Promise<void>;
  isScraping: boolean;
  scrapeStatus: string;
  scrapeProgress: number;
  activeScrapeSource: SourceId | 'system' | null;
  scrapeResults: Record<SourceId, ScrapeResult> | null;
  triggerScrapeAll: () => Promise<void>;
  triggerSingleScrape: (source: SourceId) => Promise<void>;
  logs: ActivityLogEntry[];
  addLog: (type: ActivityLogEntry['type'], message: string, source?: SourceId | 'system', details?: any) => void;
  localScrapedJobs: Record<SourceId, any[]>;
  syncLocal: (source: SourceId) => Promise<SyncResult>;
  lastSyncResult: SyncResult | null;
  compareLocal: (source: SourceId) => Promise<CompareResult>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AggregateDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [activeSourceTab, setActiveSourceTab] = useState<SourceId>('jobinrwanda');
  
  // Drawer state
  const [selectedJobId, setSelectedJobId] = useState<string | number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Scraper execution state
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scrapeStatus, setScrapeStatus] = useState<string>('idle');
  const [scrapeProgress, setScrapeProgress] = useState<number>(100);
  const [activeScrapeSource, setActiveScrapeSource] = useState<SourceId | 'system' | null>(null);
  const [scrapeResults, setScrapeResults] = useState<Record<SourceId, ScrapeResult> | null>(null);

  // Real-time Activity Logs State
  const [logs, setLogs] = useState<ActivityLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toISOString(),
      type: 'INFO',
      message: 'Kazio Scraper Engine & Ingestion Monitor initialized',
      source: 'system'
    },
    {
      id: 'init-2',
      timestamp: new Date().toISOString(),
      type: 'CRON',
      message: 'AI drip cron pipeline active on schedule (*/2 * * * *)',
      source: 'system'
    }
  ]);

  // Local Pre-Sync Scraper Buffer (Stage 1 of Funnel)
  const [localScrapedJobs, setLocalScrapedJobs] = useState<Record<SourceId, any[]>>({
    jobinrwanda: [],
    brightermonday: [],
    ndangira: [],
    greatrwandajobs: [],
    jobwebrwanda: []
  });

  const addLog = useCallback((type: ActivityLogEntry['type'], message: string, source: SourceId | 'system' = 'system', details?: any) => {
    const entry: ActivityLogEntry = {
      id: `client-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
      source,
      details
    };
    setLogs(prev => [entry, ...prev].slice(0, 500));
  }, []);

  // Connect to SSE log stream on mount
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/logs/stream');
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'BACKLOG' && Array.isArray(payload.logs)) {
            setLogs(payload.logs);
          } else if (payload.id && payload.message) {
            setLogs(prev => [payload, ...prev.filter(l => l.id !== payload.id)].slice(0, 500));
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch (err) {
      console.warn('SSE log stream connection error:', err);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  const refreshLocalStore = useCallback(async () => {
    try {
      const store = await fetchLocalScraped();
      setLocalScrapedJobs(store);
    } catch (err) {
      console.warn('Could not refresh local store:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [agg, localStore] = await Promise.all([
        aggregateLive(),
        fetchLocalScraped()
      ]);
      setData(agg);
      setLocalScrapedJobs(localStore);
    } catch (err: any) {
      console.error("Failed to load aggregate dashboard data:", err);
      setError(err.message || 'Failed to connect to Supabase');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const openJobDrawer = (id: string | number) => {
    setSelectedJobId(id);
    setIsDrawerOpen(true);
  };

  const closeJobDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedJobId(null);
  };

  const triggerScrapeAll = async () => { setActivePage('pipeline'); };

  const triggerSingleScrape = async (source: SourceId) => {
    setIsScraping(true);
    setScrapeProgress(25);
    setActiveScrapeSource(source);
    setScrapeStatus(`Scraping ${source}...`);
    addLog('SCRAPE', `Initiated manual scrape for ${source}`, source);

    try {
      const res = await scrapeSource(source);
      setScrapeResults(prev => ({ ...(prev || {} as any), [source]: res }));
      setScrapeProgress(85);
      setScrapeStatus(`Scraped ${res.jobsFound} jobs from ${source}. Refreshing local cache...`);
      await Promise.all([refreshAll(), refreshLocalStore()]);
      setScrapeProgress(100);
      setScrapeStatus('Idle');
      addLog('SCRAPE', `Scraped ${res.jobsFound} jobs from ${source} into local memory`, source);
    } catch (err: any) {
      setScrapeStatus(`Failed scraping ${source}: ${err.message}`);
      addLog('ERROR', `Failed scraping ${source}: ${err.message}`, source);
    } finally {
      setIsScraping(false);
      setActiveScrapeSource(null);
    }
  };

  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  const compareLocal = useCallback(async (source: SourceId): Promise<CompareResult> => {
    return await compareLocalWithStaging(source);
  }, []);

  const syncLocal = async (source: SourceId): Promise<SyncResult> => {
    addLog('STAGING', `Initiating manual sync of local items to staging (${source})`, source);
    try {
      const result = await syncLocalToStaging(source, localScrapedJobs[source]);
      setLastSyncResult(result);
      addLog('STAGING', `✓ Staging sync complete for ${source}: ${result.newlyAdded} newly added, ${result.alreadyExisting} already present`, source);
      await Promise.all([refreshAll(), refreshLocalStore()]);
      return result;
    } catch (err: any) {
      addLog('ERROR', `Staging sync failed for ${source}: ${err.message}`, source);
      throw err;
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        data,
        loading,
        error,
        activePage,
        setActivePage,
        activeSourceTab,
        setActiveSourceTab,
        selectedJobId,
        isDrawerOpen,
        openJobDrawer,
        closeJobDrawer,
        refreshAll,
        isScraping,
        scrapeStatus,
        scrapeProgress,
        activeScrapeSource,
        scrapeResults,
        triggerScrapeAll,
        triggerSingleScrape,
        logs,
        addLog,
        localScrapedJobs,
        syncLocal,
        lastSyncResult,
        compareLocal
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
