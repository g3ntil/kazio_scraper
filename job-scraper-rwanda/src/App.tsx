import React, { lazy, Suspense } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { JobDrawer } from './components/layout/JobDrawer';
import { OverviewPage } from './pages/OverviewPage';
import { SourcesPage } from './pages/SourcesPage';
import { JobsExplorerPage } from './pages/JobsExplorerPage';
import { QueuePage } from './pages/QueuePage';
import { KeysPage } from './pages/KeysPage';
import { AutomationPage } from './pages/AutomationPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { AlertsPage } from './pages/AlertsPage';
import { StatsPage } from './pages/StatsPage';

const TweetGeneratorPage = lazy(() => import('./pages/TweetGeneratorPage').then(module => ({ default: module.TweetGeneratorPage })));

const DashboardContent: React.FC = () => {
  const { activePage } = useDashboard();

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#fbf9f5] text-[#442a22]">
      {/* Universal Inspo Sidebar */}
      <Sidebar />

      {/* Main Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Header */}
        <TopHeader />

        {/* Dynamic Page Container */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto pb-24">
          {activePage === 'overview' && <OverviewPage />}
          {activePage === 'sources' && <SourcesPage />}
          {activePage === 'jobs' && <JobsExplorerPage />}
          {activePage === 'queue' && <QueuePage />}
          {activePage === 'keys' && <KeysPage />}
          {activePage === 'automation' && <AutomationPage />}
          {activePage === 'quality' && <DataQualityPage />}
          {activePage === 'alerts' && <AlertsPage />}
          {activePage === 'stats' && <StatsPage />}
          {activePage === 'tweet-generator' && (
            <Suspense fallback={<div role="status" className="p-6 rounded-lg bg-[#f3efe6] text-[#725a39]">Opening your tweet generator…</div>}>
              <TweetGeneratorPage />
            </Suspense>
          )}
        </main>
      </div>

      {/* Slide-over Job Details Drawer */}
      {activePage !== 'tweet-generator' && <JobDrawer />}
    </div>
  );
};

export function App() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}

export default App;
