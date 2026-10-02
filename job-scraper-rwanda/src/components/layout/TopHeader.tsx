import React from 'react';
import { Search, RefreshCw, Play, Bell } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const TopHeader: React.FC = () => {
  const { 
    activePage, 
    loading, 
    refreshAll, 
    isScraping, 
    triggerScrapeAll,
    data,
    setActivePage
  } = useDashboard();

  const pageTitles: Record<string, string> = {
    overview: 'System Overview & Monitor',
    sources: 'Job Portals & Staging Hub',
    jobs: 'Jobs Explorer & Database',
    queue: 'AI Extraction Queue',
    keys: 'Gemini AI Keys & Quota Pool',
    automation: 'Crons & Automation Pipelines',
    quality: 'Data Quality & Field Completeness',
    alerts: 'System Alerts & Incidents',
    stats: 'Ingestion Stats & Source Health',
    'tweet-generator': 'Tweet Generator'
  };

  const criticalAlerts = data?.issues.filter(i => i.severity === 'critical').length ?? 0;

  return (
    <header className="min-h-16 py-2 gap-4 flex-wrap flex-shrink-0 bg-[#fbf9f5] border-b border-[#e6e2d6]/60 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20 font-body">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#725a39]">
        <span>{activePage === 'tweet-generator' ? 'X Engine' : 'Scrape'}</span>
        <span>/</span>
        <span className="font-semibold text-[#442a22] capitalize">{pageTitles[activePage] || activePage}</span>
      </div>

      {/* Right-side actions */}
      {activePage !== 'tweet-generator' && <div className="flex items-center gap-3">
        {/* Quick Search Input */}
        <div className="relative hidden xl:flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-[#725a39]/70" />
          <input
            type="text"
            placeholder="Search jobs, companies, skills..."
            aria-label="Search jobs, companies, skills"
            className="w-64 pl-8 pr-12 min-h-12 py-2 bg-[#f3efe6] border border-[#e6e2d6] rounded-lg text-xs text-[#442a22] focus:outline-none focus:ring-1 focus:ring-[#293417] transition-all"
          />
          <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-[#725a39] bg-[#f7f5ef] border border-[#e6e2d6] rounded-lg">
            ⌘K
          </kbd>
        </div>

        {/* Reload / Refresh Button */}
        <button
          onClick={() => refreshAll()}
          disabled={loading}
          title="Refresh Live Data"
          aria-label="Refresh live data"
          className="min-h-12 min-w-12 p-3 flex items-center justify-center rounded-lg bg-[#f3efe6] border border-[#e6e2d6] text-[#442a22] hover:bg-[#f7f5ef] transition-all duration-120 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#293417]' : ''}`} />
        </button>

        {/* Scrape All Trigger */}
        <button
          onClick={() => triggerScrapeAll()}
          disabled={isScraping}
          className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-lg bg-[#442a22] hover:bg-[#2e1c17] text-[#fbf9f5] text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all duration-120 cursor-pointer disabled:opacity-50"
        >
          <Play className={`w-3 h-3 ${isScraping ? 'animate-spin' : 'fill-current'}`} />
          <span>{isScraping ? 'Scraping All...' : 'Run Scrape All'}</span>
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setActivePage('alerts')}
            aria-label="Alerts and issues"
            className="min-h-12 min-w-12 p-3 flex items-center justify-center rounded-lg bg-[#f3efe6] border border-[#e6e2d6] text-[#5a4437] hover:bg-[#f7f5ef] transition-all duration-120 cursor-pointer"
            title="Alerts & Issues"
          >
            <Bell className="w-3.5 h-3.5" />
            {criticalAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ba1a1a] ring-2 ring-[#fbf9f5]" />
            )}
          </button>
        </div>
      </div>}
    </header>
  );
};

