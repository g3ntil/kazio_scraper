import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Globe, 
  Search, 
  ListTree, 
  Key, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle, 
  BarChart3,
  Server,
  ChevronDown,
  Feather
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { PageId } from '../../types/dashboard';

interface NavItemDef {
  id: PageId;
  label: string;
  icon: React.ElementType;
  count?: number | string;
  badge?: string;
  badgeType?: 'error' | 'warn' | 'neutral';
}

export const Sidebar: React.FC = () => {
  const { activePage, setActivePage, data, loading } = useDashboard();
  const [expanded, setExpanded] = useState({ scrape: true, x: true });
  const [mobileOpen, setMobileOpen] = useState(false);

  const totalJobs = data?.totals.jobs ?? 0;
  const failedCount = data?.totals.failed ?? 0;
  const usableKeys = data?.capacity.usable ?? 0;
  const criticalAlerts = data?.issues.filter(i => i.severity === 'critical').length ?? 0;
  
  // Count bad/warn sources
  const badSources = data ? Object.values(data.sources).filter(s => s.health.lvl !== 'ok').length : 0;

  const navItems: NavItemDef[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'sources', label: 'Sources', icon: Globe, count: 5 },
    { id: 'jobs', label: 'Jobs Explorer', icon: Search, count: loading ? '...' : totalJobs },
    { 
      id: 'queue', 
      label: 'Extraction Queue', 
      icon: ListTree, 
      badge: failedCount > 0 ? `${failedCount}` : undefined,
      badgeType: 'error'
    },
    { 
      id: 'keys', 
      label: 'AI Keys & Capacity', 
      icon: Key,
      badge: data && usableKeys === 0 ? '0 usable' : undefined,
      badgeType: 'error'
    },
    { id: 'automation', label: 'Automation & Crons', icon: Cpu },
    { id: 'quality', label: 'Data Quality', icon: CheckCircle2 },
    { 
      id: 'alerts', 
      label: 'Alerts & Events', 
      icon: AlertTriangle,
      badge: criticalAlerts > 0 ? `${criticalAlerts}` : undefined,
      badgeType: 'error'
    },
    { 
      id: 'stats', 
      label: 'Stats & Health', 
      icon: BarChart3,
      badge: badSources > 0 ? `${badSources} alerts` : undefined,
      badgeType: 'warn'
    }
  ];

  const renderItem = (item: NavItemDef) => {
    const Icon = item.icon;
    const isActive = activePage === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => { setActivePage(item.id); setMobileOpen(false); }}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full min-h-12 flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-[#725a39] ${
          isActive ? 'bg-[#eae4d6] text-[#442a22] font-semibold' : 'text-[#5a4437] hover:bg-[#ede9de] font-medium'
        }`}
      >
        <Icon aria-hidden="true" className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#293417]' : 'opacity-70'}`} />
        <span className="truncate">{item.label}</span>
        {item.count !== undefined && <span className="ml-auto text-[11px] font-mono text-[#725a39]/80">{item.count}</span>}
        {item.badge && <span className={`ml-auto text-[10px] font-bold px-2 py-1 rounded-lg leading-none ${item.badgeType === 'error' ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]' : 'bg-[#a5690c]/10 text-[#a5690c]'}`}>{item.badge}</span>}
      </button>
    );
  };

  return (
    <aside className="w-full md:w-64 flex-shrink-0 bg-[#f7f5ef] p-4 flex flex-col md:sticky md:top-0 md:h-screen select-none font-body">
      <div className="px-2 md:pb-4 flex items-center justify-between gap-3">
        <div>
          <KazioBrandLogo />
          <div className="text-xs text-[#725a39] mt-2">Your working space</div>
        </div>
        <button type="button" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={() => setMobileOpen(open => !open)} className="md:hidden min-h-12 px-4 rounded-lg bg-[#eae4d6] text-sm font-semibold">Menu</button>
      </div>
      <nav id="workspace-navigation" aria-label="Main navigation" className={`${mobileOpen ? 'flex' : 'hidden'} md:flex flex-col gap-4 overflow-y-auto py-2`}>
        <section>
          <button type="button" aria-expanded={expanded.scrape} aria-controls="scrape-navigation" onClick={() => setExpanded(previous => ({ ...previous, scrape: !previous.scrape }))} className="w-full min-h-12 px-3 flex items-center justify-between rounded-lg text-xs font-bold uppercase tracking-wider text-[#725a39] hover:bg-[#ede9de] focus-visible:outline-2 focus-visible:outline-[#725a39]">
            <span>Scrape</span><ChevronDown aria-hidden="true" className={`w-4 h-4 transition-transform ${expanded.scrape ? '' : '-rotate-90'}`} />
          </button>
          <div id="scrape-navigation" hidden={!expanded.scrape}>
            <div className="flex flex-col gap-1">{navItems.map(renderItem)}</div>
          </div>
        </section>
        <section>
          <button type="button" aria-expanded={expanded.x} aria-controls="x-engine-navigation" onClick={() => setExpanded(previous => ({ ...previous, x: !previous.x }))} className="w-full min-h-12 px-3 flex items-center justify-between rounded-lg text-xs font-bold uppercase tracking-wider text-[#725a39] hover:bg-[#ede9de] focus-visible:outline-2 focus-visible:outline-[#725a39]">
            <span>X Engine</span><ChevronDown aria-hidden="true" className={`w-4 h-4 transition-transform ${expanded.x ? '' : '-rotate-90'}`} />
          </button>
          <div id="x-engine-navigation" hidden={!expanded.x}>
            {renderItem({ id: 'tweet-generator', label: 'Tweet Generator', icon: Feather })}
          </div>
        </section>
      </nav>
      <div className="hidden md:block mt-auto pt-4">
        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-[#ede9de] text-xs text-[#442a22]">
          <Server aria-hidden="true" className="w-4 h-4 text-[#725a39]" />
          <span>{loading && !data ? 'Checking scraper health…' : !data ? 'Scraper health unavailable' : badSources === 0 ? 'All 5 Sources Healthy' : `${badSources} Source Warnings`}</span>
        </div>
      </div>
    </aside>
  );
};

const KazioBrandLogo = () => (
  <div className="h-10 flex items-center gap-3 text-[#442a22]" aria-label="Kazio Admin">
    <svg viewBox="0 0 40 40" className="h-10 w-10" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="8" fill="#442a22" />
      <path d="M12 10v20m16-20L17 20l11 10M20 10l-8 10 8 10" stroke="#fbf9f5" strokeWidth="2" strokeLinejoin="round" />
    </svg>
    <span className="font-sans font-bold text-xl tracking-tight">Kazio <span className="font-normal text-sm">Admin</span></span>
  </div>
);
