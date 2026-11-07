import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw, 
  Search, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Info, 
  Database, 
  Zap, 
  Layers, 
  FileText,
  Sliders,
  Award,
  Calendar,
  Building2,
  Briefcase,
  Trash2,
  Eye,
  X,
  ArrowRight,
  Clock,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Split,
  Tag,
  CheckCheck,
  Bot
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { 
  fetchNearDuplicates, 
  fetchSkillVocabulary, 
  approveSkillVocabularyTerm, 
  fetchDownstreamReadiness,
  fetchJobsMissingDeadline,
  updateJobDeadline,
  deactivateJob,
  deleteJob,
  fetchJobPairDetails,
  resolveDuplicatePair,
  NoDeadlineJobRow,
  fetchJobsExplorer,
  reviewDuplicateWithAi
} from '../services/dataService';
import { AiDuplicateReview, NearDuplicatePair, SkillVocabularyItem, DownstreamReadiness, JobDetail, JobRow } from '../types/dashboard';

export const DataQualityPage: React.FC = () => {
  const { data, loading: globalLoading, refreshAll, openJobDrawer, setActivePage } = useDashboard();
  const fill = data?.fill;
  const totals = data?.totals;

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'audit' | 'deadlines' | 'duplicates' | 'active' | 'vocabulary'>('audit');

  // Notification Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ================= 1. NEAR-DUPLICATES STATE =================
  const [dupThreshold, setDupThreshold] = useState<number>(0.7);
  const [dupPairs, setDupPairs] = useState<NearDuplicatePair[]>([]);
  const [dupLoading, setDupLoading] = useState<boolean>(false);
  const [dupRpcAvailable, setDupRpcAvailable] = useState<boolean>(true);
  const [activeComparison, setActiveComparison] = useState<{
    pair: NearDuplicatePair;
    jobA: JobDetail | null;
    jobB: JobDetail | null;
  } | null>(null);
  const [comparingLoading, setComparingLoading] = useState<boolean>(false);
  const [dupActionLoading, setDupActionLoading] = useState<string | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState<boolean>(false);
  const [aiReview, setAiReview] = useState<AiDuplicateReview | null>(null);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState<boolean>(false);
  const [bulkReviewRunning, setBulkReviewRunning] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{
    reviewed: number;
    deleted: number;
    kept: number;
    uncertain: number;
    failed: number;
  } | null>(null);

  const loadDuplicates = useCallback(async (threshold: number) => {
    setDupLoading(true);
    try {
      const res = await fetchNearDuplicates(threshold);
      setDupPairs(res.pairs);
      setDupRpcAvailable(res.isRpcAvailable);
    } catch (err) {
      console.error('Error fetching near duplicates:', err);
      setDupRpcAvailable(false);
    } finally {
      setDupLoading(false);
    }
  }, []);

  const handleOpenComparison = async (pair: NearDuplicatePair) => {
    setAiReview(null);
    setAiReviewError(null);
    setComparingLoading(true);
    try {
      const details = await fetchJobPairDetails(pair.idA, pair.idB);
      setActiveComparison({
        pair,
        jobA: details.jobA,
        jobB: details.jobB
      });
    } catch (err: any) {
      showToast(err.message || 'Could not load job comparison details', 'error');
    } finally {
      setComparingLoading(false);
    }
  };

  const handleAiReview = async () => {
    if (!activeComparison) return;
    setAiReviewLoading(true);
    setAiReviewError(null);
    try {
      const review = await reviewDuplicateWithAi(activeComparison.pair.idA, activeComparison.pair.idB);
      setAiReview(review);
    } catch (err: any) {
      setAiReview(null);
      setAiReviewError(err.message || 'Kio could not review this pair. Please try again.');
    } finally {
      setAiReviewLoading(false);
    }
  };

  const handleBulkDuplicateReview = async () => {
    const pairs = [...dupPairs];
    if (pairs.length === 0 || bulkReviewRunning) return;

    setBulkConfirmOpen(false);
    setBulkReviewRunning(true);
    setBulkSummary(null);
    setBulkProgress({ current: 0, total: pairs.length });

    const deletedJobIds = new Set<string>();
    const canonicalJobIds = new Set<string>();
    const pairsNeedingReview: NearDuplicatePair[] = [];
    let reviewed = 0;
    let deleted = 0;
    let kept = 0;
    let uncertain = 0;
    let failed = 0;

    type ReviewOutcome = {
      pair: NearDuplicatePair;
      review?: Awaited<ReturnType<typeof reviewDuplicateWithAi>>;
      error?: unknown;
    };
    const outcomes = new Array<ReviewOutcome>(pairs.length);
    let nextPairIndex = 0;
    let completedReviews = 0;
    // Ten concurrent decisions was the best stable local/OpenRouter benchmark:
    // it completed ten reviews in ~2.8s without rate-limit responses.
    const workerCount = Math.min(10, pairs.length);

    // Jev decisions are read-only, so a small worker pool safely overlaps the
    // network wait. Database mutations remain sequential below.
    const reviewWorker = async () => {
      while (nextPairIndex < pairs.length) {
        const index = nextPairIndex;
        nextPairIndex += 1;
        const pair = pairs[index];
        try {
          outcomes[index] = {
            pair,
            review: await reviewDuplicateWithAi(pair.idA, pair.idB)
          };
        } catch (error) {
          outcomes[index] = { pair, error };
        } finally {
          completedReviews += 1;
          setBulkProgress({ current: completedReviews, total: pairs.length });
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => reviewWorker()));

    for (const outcome of outcomes) {
      const { pair, review, error } = outcome;
      if (error || !review) {
        console.error('Bulk duplicate review failed for pair:', pair.idA, pair.idB, error);
        failed += 1;
        pairsNeedingReview.push(pair);
        continue;
      }

      reviewed += 1;

      // A prior decision may already have removed one member of an overlapping pair.
      if (deletedJobIds.has(String(pair.idA)) || deletedJobIds.has(String(pair.idB))) {
        continue;
      }

      try {

        if (review.decision === 'not_duplicate' && review.confidence >= 0.8) {
          // Keeping both intentionally performs no database write.
          kept += 1;
          continue;
        }

        if (review.decision === 'duplicate' && review.confidence >= 0.95 && review.canonicalJob) {
          const keptId = review.canonicalJob === 'A' ? pair.idA : pair.idB;
          const deletedId = review.canonicalJob === 'A' ? pair.idB : pair.idA;

          // Never delete a record that an earlier decision selected as canonical.
          if (deletedJobIds.has(String(keptId)) || canonicalJobIds.has(String(deletedId))) {
            uncertain += 1;
            pairsNeedingReview.push(pair);
            continue;
          }

          const result = await resolveDuplicatePair({
            pairIdA: pair.idA,
            pairIdB: pair.idB,
            action: review.canonicalJob === 'A' ? 'delete_b' : 'delete_a'
          });
          if (!result.success) throw new Error(result.message);

          deletedJobIds.add(String(deletedId));
          canonicalJobIds.add(String(keptId));
          deleted += 1;
          continue;
        }

        uncertain += 1;
        pairsNeedingReview.push(pair);
      } catch (error) {
        console.error('Bulk duplicate resolution failed for pair:', pair.idA, pair.idB, error);
        failed += 1;
        pairsNeedingReview.push(pair);
      }
    }

    setDupPairs(pairsNeedingReview.filter(pair =>
      !deletedJobIds.has(String(pair.idA)) && !deletedJobIds.has(String(pair.idB))
    ));
    setBulkSummary({ reviewed, deleted, kept, uncertain, failed });
    setBulkReviewRunning(false);
    setBulkProgress(null);
    await refreshAll();
    showToast(
      `Kio reviewed ${reviewed} pairs: ${deleted} duplicates removed, ${kept} pairs kept, ${uncertain + failed} need review.`,
      failed > 0 ? 'info' : 'success'
    );
  };

  const handleResolvePair = async (
    pair: NearDuplicatePair, 
    action: 'keep_a_deactivate_b' | 'keep_b_deactivate_a' | 'delete_a' | 'delete_b' | 'dismiss'
  ) => {
    if (action === 'dismiss') {
      setDupPairs(prev => prev.filter(p => !(p.idA === pair.idA && p.idB === pair.idB)));
      if (activeComparison?.pair.idA === pair.idA && activeComparison?.pair.idB === pair.idB) {
        setActiveComparison(null);
      }
      showToast('Dismissed duplicate pair from review', 'info');
      return;
    }

    setDupActionLoading(`${pair.idA}_${pair.idB}_${action}`);
    try {
      const res = await resolveDuplicatePair({
        pairIdA: pair.idA,
        pairIdB: pair.idB,
        action
      });

      if (res.success) {
        showToast(res.message, 'success');
        setDupPairs(prev => prev.filter(p => !(p.idA === pair.idA && p.idB === pair.idB)));
        if (activeComparison?.pair.idA === pair.idA && activeComparison?.pair.idB === pair.idB) {
          setActiveComparison(null);
        }
        await refreshAll();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setDupActionLoading(null);
    }
  };

  // ================= 2. DEADLINE REVIEW QUEUE STATE =================
  const [noDeadlineRows, setNoDeadlineRows] = useState<NoDeadlineJobRow[]>([]);
  const [noDeadlineTotal, setNoDeadlineTotal] = useState<number>(0);
  const [noDeadlineLoading, setNoDeadlineLoading] = useState<boolean>(false);
  const [noDeadlinePage, setNoDeadlinePage] = useState<number>(1);
  const [noDeadlineSearch, setNoDeadlineSearch] = useState<string>('');
  const [deadlineInputs, setDeadlineInputs] = useState<Record<string | number, string>>({});
  const [deadlineActionLoading, setDeadlineActionLoading] = useState<string | null>(null);

  const loadMissingDeadlines = useCallback(async (page: number, search: string) => {
    setNoDeadlineLoading(true);
    try {
      const res = await fetchJobsMissingDeadline({ page, pageSize: 15, search });
      setNoDeadlineRows(res.rows);
      setNoDeadlineTotal(res.total);
    } catch (err) {
      console.error('Error loading jobs missing deadline:', err);
    } finally {
      setNoDeadlineLoading(false);
    }
  }, []);

  const handleSaveDeadline = async (jobId: string | number) => {
    const val = deadlineInputs[jobId];
    if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      showToast('Please select or enter a valid date (YYYY-MM-DD)', 'error');
      return;
    }

    setDeadlineActionLoading(`deadline_${jobId}`);
    try {
      const res = await updateJobDeadline(jobId, val);
      if (res.success) {
        showToast(res.message, 'success');
        setNoDeadlineRows(prev => prev.filter(r => r.id !== jobId));
        setNoDeadlineTotal(prev => Math.max(0, prev - 1));
        await refreshAll();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update deadline', 'error');
    } finally {
      setDeadlineActionLoading(null);
    }
  };

  const handleSetPresetDeadline = (jobId: string | number, days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toISOString().split('T')[0];
    setDeadlineInputs(prev => ({ ...prev, [jobId]: dateStr }));
  };

  const handleDeactivate = async (jobId: string | number, title: string) => {
    if (!window.confirm(`Are you sure you want to deactivate "${title}"? It will no longer be visible to candidates.`)) return;

    setDeadlineActionLoading(`deactivate_${jobId}`);
    try {
      const res = await deactivateJob(jobId);
      if (res.success) {
        showToast(res.message, 'success');
        setNoDeadlineRows(prev => prev.filter(r => r.id !== jobId));
        setNoDeadlineTotal(prev => Math.max(0, prev - 1));
        await refreshAll();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to deactivate job', 'error');
    } finally {
      setDeadlineActionLoading(null);
    }
  };

  const handleDelete = async (jobId: string | number, title: string) => {
    if (!window.confirm(`Permanently delete "${title}" from the database? This cannot be undone.`)) return;

    setDeadlineActionLoading(`delete_${jobId}`);
    try {
      const res = await deleteJob(jobId);
      if (res.success) {
        showToast(res.message, 'success');
        setNoDeadlineRows(prev => prev.filter(r => r.id !== jobId));
        setNoDeadlineTotal(prev => Math.max(0, prev - 1));
        await refreshAll();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete job', 'error');
    } finally {
      setDeadlineActionLoading(null);
    }
  };

  // ================= 3. ACTIVE & COMPLETE JOBS DIRECTORY STATE =================
  const [activeJobsRows, setActiveJobsRows] = useState<JobRow[]>([]);
  const [activeJobsTotal, setActiveJobsTotal] = useState<number>(0);
  const [activeJobsLoading, setActiveJobsLoading] = useState<boolean>(false);
  const [activeJobsSearch, setActiveJobsSearch] = useState<string>('');
  const [activeJobsPage, setActiveJobsPage] = useState<number>(1);

  const loadActiveCompleteJobs = useCallback(async (page: number, search: string) => {
    setActiveJobsLoading(true);
    try {
      const res = await fetchJobsExplorer({
        page,
        pageSize: 15,
        search,
        status: 'done',
        quickFilter: 'active'
      });
      // Filter out expired client-side to ensure strictly non-expired complete jobs
      const today = new Date().toISOString().split('T')[0];
      const strictlyActive = res.rows.filter(r => !r.deadline || r.deadline >= today);
      setActiveJobsRows(strictlyActive);
      setActiveJobsTotal(res.total);
    } catch (err) {
      console.error('Error loading active complete jobs:', err);
    } finally {
      setActiveJobsLoading(false);
    }
  }, []);

  // ================= 4. VOCABULARY & READINESS STATE =================
  const [vocabData, setVocabData] = useState<{ total: number; approved: number; unapprovedTerms: SkillVocabularyItem[] }>({
    total: 0,
    approved: 0,
    unapprovedTerms: []
  });
  const [vocabLoading, setVocabLoading] = useState<boolean>(false);
  const [vocabSearch, setVocabSearch] = useState<string>('');
  const [approvingTerm, setApprovingTerm] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<DownstreamReadiness>({
    users: 0,
    matchScores: 0,
    generatedCvs: 0,
    benchmarks: 0
  });
  const [readinessLoading, setReadinessLoading] = useState<boolean>(false);

  const loadVocabulary = useCallback(async () => {
    setVocabLoading(true);
    try {
      const res = await fetchSkillVocabulary();
      setVocabData(res);
    } catch (err) {
      console.error('Error fetching skill vocabulary:', err);
    } finally {
      setVocabLoading(false);
    }
  }, []);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const res = await fetchDownstreamReadiness();
      setReadiness(res);
    } catch (err) {
      console.error('Error fetching readiness:', err);
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const handleApproveTerm = async (term: string) => {
    setApprovingTerm(term);
    try {
      const res = await approveSkillVocabularyTerm(term);
      if (res.success) {
        showToast(`Approved "${term}"`, 'success');
        setVocabData(prev => ({
          ...prev,
          approved: prev.approved + 1,
          unapprovedTerms: prev.unapprovedTerms.filter(t => t.skill !== term)
        }));
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Approval failed', 'error');
    } finally {
      setApprovingTerm(null);
    }
  };

  // Initial tab loading effects
  useEffect(() => {
    loadDuplicates(dupThreshold);
    loadVocabulary();
    loadReadiness();
  }, [loadDuplicates, loadVocabulary, loadReadiness, dupThreshold]);

  useEffect(() => {
    if (activeTab === 'deadlines') {
      loadMissingDeadlines(noDeadlinePage, noDeadlineSearch);
    }
  }, [activeTab, noDeadlinePage, noDeadlineSearch, loadMissingDeadlines]);

  useEffect(() => {
    if (activeTab === 'active') {
      loadActiveCompleteJobs(activeJobsPage, activeJobsSearch);
    }
  }, [activeTab, activeJobsPage, activeJobsSearch, loadActiveCompleteJobs]);

  const fieldList: { key: keyof typeof fill; label: string; desc: string }[] = [
    { key: 'deadline', label: 'Application Deadline', desc: 'Expiration timestamp' },
    { key: 'industry', label: 'Industry Classification', desc: 'Standardized taxonomy' },
    { key: 'job_function', label: 'Job Function / Role', desc: 'Role specialization' },
    { key: 'experience', label: 'Experience Level', desc: 'Junior / Mid / Senior' },
    { key: 'job_type', label: 'Job Type', desc: 'Full-time, Contract, etc.' },
    { key: 'min_degree', label: 'Minimum Degree', desc: 'Bachelor, Master, None' },
    { key: 'skills_t1', label: 'Tier-1 Must-Have Skills', desc: 'High priority skills list' },
    { key: 'languages', label: 'Languages Required', desc: 'English, French, Kinyarwanda' },
    { key: 'local_company', label: 'Local Company Flag', desc: 'Domestic employer verification' },
    { key: 'ai_summary', label: 'AI Companion Summary', desc: 'Kio condensed role summary' },
    { key: 'salary', label: 'Salary Information', desc: 'Stated or benchmark estimate' },
    { key: 'company_description', label: 'Company Description', desc: 'Employer background' },
    { key: 'company_logo', label: 'Company Logo URL', desc: 'Brand avatar asset' },
    { key: 'contact_emails', label: 'Contact Emails', desc: 'Application email addresses' },
    { key: 'apply_contact', label: 'Application Contact / URL', desc: 'Direct portal destination' }
  ];

  const activeCount = totals?.active || 0;
  const enrichedCount = totals?.enrichedActive || 0;
  const enrichedPct = activeCount > 0 ? Math.round((enrichedCount / activeCount) * 100) : 0;
  const noDeadlineCount = data?.deadlineDist?.none ?? (totals?.noDeadlineActive || 0);

  return (
    <div className="space-y-6 font-body pb-12">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 text-xs font-medium border transition-all duration-300 animate-slide-up ${
            toast.type === 'success' 
              ? 'bg-[#e9f6ee] text-[#16813d] border-[#16813d]/30' 
              : toast.type === 'error'
              ? 'bg-[#fcedeb] text-[#ba1a1a] border-[#ba1a1a]/30'
              : 'bg-[#fdf3e1] text-[#a5690c] border-[#a5690c]/30'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">Data Quality &amp; Curation Studio</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#293417]/10 text-[#293417] border border-[#293417]/20">
              Live Audits
            </span>
          </div>
          <p className="text-xs text-[#725a39] mt-0.5">
            Audit field completeness, resolve near-duplicate listings, cure missing deadlines, and approve skills.
          </p>
        </div>

        <button 
          onClick={() => {
            refreshAll();
            loadDuplicates(dupThreshold);
            loadVocabulary();
            loadReadiness();
            if (activeTab === 'deadlines') loadMissingDeadlines(noDeadlinePage, noDeadlineSearch);
            if (activeTab === 'active') loadActiveCompleteJobs(activeJobsPage, activeJobsSearch);
          }}
          disabled={globalLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-[#e6e2d6] hover:bg-[#fbf9f5] text-xs font-semibold text-[#442a22] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${globalLoading ? 'animate-spin text-[#293417]' : 'text-[#725a39]'}`} />
          <span>Refresh All Audits</span>
        </button>
      </div>

      {/* Interactive Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[#e6e2d6] overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-[#293417] text-[#293417] font-bold bg-[#293417]/5 rounded-t-lg'
              : 'border-transparent text-[#725a39] hover:text-[#442a22] hover:border-[#e6e2d6]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Completeness &amp; Audits</span>
        </button>

        <button
          onClick={() => setActiveTab('deadlines')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'deadlines'
              ? 'border-[#293417] text-[#293417] font-bold bg-[#293417]/5 rounded-t-lg'
              : 'border-transparent text-[#725a39] hover:text-[#442a22] hover:border-[#e6e2d6]'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Deadline Review Queue</span>
          {noDeadlineCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ba1a1a]/15 text-[#ba1a1a]">
              {noDeadlineCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('duplicates')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'duplicates'
              ? 'border-[#293417] text-[#293417] font-bold bg-[#293417]/5 rounded-t-lg'
              : 'border-transparent text-[#725a39] hover:text-[#442a22] hover:border-[#e6e2d6]'
          }`}
        >
          <Split className="w-3.5 h-3.5" />
          <span>Near-Duplicates Studio</span>
          {dupPairs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#a5690c]/15 text-[#a5690c]">
              {dupPairs.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'active'
              ? 'border-[#293417] text-[#293417] font-bold bg-[#293417]/5 rounded-t-lg'
              : 'border-transparent text-[#725a39] hover:text-[#442a22] hover:border-[#e6e2d6]'
          }`}
        >
          <CheckCheck className="w-3.5 h-3.5 text-[#16813d]" />
          <span>Active &amp; Complete Listings</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#16813d]/15 text-[#16813d]">
            {enrichedCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('vocabulary')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'vocabulary'
              ? 'border-[#293417] text-[#293417] font-bold bg-[#293417]/5 rounded-t-lg'
              : 'border-transparent text-[#725a39] hover:text-[#442a22] hover:border-[#e6e2d6]'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Skill Vocabulary</span>
        </button>
      </div>

      {/* ================= TAB 1: AUDIT & COMPLETENESS ================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Top Health & Enrichment Banner */}
          <div className={`p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            enrichedPct >= 80 
              ? 'bg-[#e9f6ee] border-[#16813d]/25 text-[#16813d]' 
              : enrichedPct >= 40 
              ? 'bg-[#fdf3e1] border-[#a5690c]/25 text-[#a5690c]' 
              : 'bg-[#fcedeb] border-[#ba1a1a]/25 text-[#ba1a1a]'
          }`}>
            <div className="flex items-start md:items-center gap-3">
              <div className="p-2 rounded-lg bg-white/70 shadow-xs shrink-0">
                <ShieldCheck className="w-5 h-5 text-[#16813d]" />
              </div>
              <div>
                <div className="font-sans font-bold text-sm text-[#442a22]">
                  {enrichedCount.toLocaleString()} of {activeCount.toLocaleString()} live jobs ({enrichedPct}%) have completed extraction. Field presence does not verify accuracy.
                </div>
                <div className="text-xs text-[#725a39] mt-0.5">
                  All metrics below are computed in real time across active, unexpired listings (<code className="font-mono bg-white/50 px-1 py-0.2 rounded text-[11px]">is_active = true</code>).
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                onClick={() => setActiveTab('active')}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-[#fbf9f5] shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Browse Active Listings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="w-36 shrink-0 hidden sm:block">
                <div className="flex justify-between text-[11px] font-mono font-bold text-[#442a22] mb-1">
                  <span>Enrichment</span>
                  <span>{enrichedPct}%</span>
                </div>
                <div className="w-full bg-white/60 h-2 rounded-full overflow-hidden border border-black/5">
                  <div 
                    style={{ width: `${enrichedPct}%` }}
                    className={`h-full transition-all duration-500 ${
                      enrichedPct >= 80 ? 'bg-[#16813d]' : enrichedPct >= 40 ? 'bg-[#293417]' : 'bg-[#a5690c]'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Grid: 15 Field Completeness & Provenance */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: 15 Field Completeness Bars (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#293417]" />
                    Field Completeness Breakdown (15 Attributes)
                  </h3>
                  <span className="text-[11px] font-mono text-[#725a39]">
                    Denom: {activeCount} live jobs
                  </span>
                </div>
                <p className="text-xs text-[#725a39] mb-5">
                  Percentage of active postings with structured extracted values present in the database.
                </p>

                <div className="space-y-3.5">
                  {fieldList.map((f) => {
                    const val = fill ? fill[f.key as keyof typeof fill] : 0;
                    const count = Math.round((val / 100) * activeCount);
                    return (
                      <div key={f.key} className="group">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#442a22]">{f.label}</span>
                            <span className="text-[10.5px] text-[#725a39] hidden sm:inline">· {f.desc}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-[11px] text-[#725a39]">{count}/{activeCount}</span>
                            <span className={`text-xs font-bold w-10 text-right ${
                              val >= 80 ? 'text-[#16813d]' : val >= 40 ? 'text-[#293417]' : 'text-[#a5690c]'
                            }`}>
                              {val}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-[#f3efe6] h-2 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${val}%` }}
                            className={`h-full transition-all duration-300 ${
                              val >= 80 ? 'bg-[#16813d]' : val >= 40 ? 'bg-[#293417]' : 'bg-[#a5690c]'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#e6e2d6] flex items-center justify-between text-[11px] text-[#725a39]">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#16813d]"></span> &ge; 80% Complete</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#293417]"></span> 40% – 79% Complete</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#a5690c]"></span> &lt; 40% (Gap)</span>
                </div>
              </div>
            </div>

            {/* Right Column: Provenance & Downstream Readiness (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Deadline Provenance Cards */}
              <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#293417]" />
                    Deadline Provenance Distribution
                  </h3>
                  <button
                    onClick={() => setActiveTab('deadlines')}
                    className="text-[11px] font-semibold text-[#293417] hover:underline cursor-pointer"
                  >
                    Review Missing ({noDeadlineCount}) &rarr;
                  </button>
                </div>
                <p className="text-xs text-[#725a39] mb-4">
                  Breakdown of how deadline dates were resolved across active listings.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-[#e9f6ee]/60 border border-[#16813d]/20">
                    <span className="text-[10px] uppercase font-bold text-[#16813d] block">Source HTML</span>
                    <span className="text-xl font-mono font-bold text-[#16813d] mt-1 block">
                      {data?.deadlineDist.source_field || 0}
                    </span>
                    <span className="text-[10.5px] text-[#725a39] mt-0.5 block">Direct from portal</span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-[#f3efe6]/80 border border-[#293417]/20">
                    <span className="text-[10px] uppercase font-bold text-[#293417] block">AI Inferred</span>
                    <span className="text-xl font-mono font-bold text-[#293417] mt-1 block">
                      {data?.deadlineDist.ai || 0}
                    </span>
                    <span className="text-[10.5px] text-[#725a39] mt-0.5 block">Gemini NLP parser</span>
                  </div>

                  <div 
                    onClick={() => setActiveTab('deadlines')}
                    className="p-3.5 rounded-lg bg-[#fcedeb]/60 border border-[#ba1a1a]/20 cursor-pointer hover:border-[#ba1a1a]/40 transition-colors"
                  >
                    <span className="text-[10px] uppercase font-bold text-[#ba1a1a] block">Missing (Review)</span>
                    <span className="text-xl font-mono font-bold text-[#ba1a1a] mt-1 block">
                      {noDeadlineCount}
                    </span>
                    <span className="text-[10.5px] text-[#ba1a1a] mt-0.5 block font-medium">Needs manual date &rarr;</span>
                  </div>
                </div>
              </div>

              {/* Downstream Readiness */}
              <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs">
                <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2 mb-2">
                  <Database className="w-3.5 h-3.5 text-[#293417]" />
                  Downstream Application Readiness
                </h3>
                <p className="text-xs text-[#725a39] mb-4">
                  Live state of match tables and companion engines referencing extracted jobs.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]">
                    <span className="text-[10px] uppercase font-bold text-[#725a39] block">Registered Candidates</span>
                    <span className="text-lg font-mono font-bold text-[#442a22] mt-1 block">{readiness.users}</span>
                    <span className="text-[10px] text-[#725a39]">public.users</span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]">
                    <span className="text-[10px] uppercase font-bold text-[#725a39] block">Match Scores Computed</span>
                    <span className="text-lg font-mono font-bold text-[#442a22] mt-1 block">{readiness.matchScores}</span>
                    <span className="text-[10px] text-[#725a39]">match_scores</span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]">
                    <span className="text-[10px] uppercase font-bold text-[#725a39] block">AI Generated CVs</span>
                    <span className="text-lg font-mono font-bold text-[#442a22] mt-1 block">{readiness.generatedCvs}</span>
                    <span className="text-[10px] text-[#725a39]">generated_cvs</span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]">
                    <span className="text-[10px] uppercase font-bold text-[#725a39] block">Salary Benchmarks</span>
                    <span className="text-lg font-mono font-bold text-[#442a22] mt-1 block">{readiness.benchmarks}</span>
                    <span className="text-[10px] text-[#725a39]">salary_benchmarks</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: DEADLINE REVIEW QUEUE ================= */}
      {activeTab === 'deadlines' && (
        <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#ba1a1a]" />
                  Jobs Missing Application Deadlines ({noDeadlineTotal})
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#ba1a1a]/10 text-[#ba1a1a]">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-[#725a39] mt-0.5">
                These active jobs have no application deadline specified. Assign a verified expiration date or deactivate/remove the listing.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#725a39]" />
                <input
                  type="text"
                  placeholder="Filter by title or employer..."
                  value={noDeadlineSearch}
                  onChange={(e) => {
                    setNoDeadlineSearch(e.target.value);
                    setNoDeadlinePage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] text-xs text-[#442a22] placeholder:text-[#725a39] focus:outline-none focus:border-[#293417]"
                />
              </div>

              <button
                onClick={() => loadMissingDeadlines(noDeadlinePage, noDeadlineSearch)}
                disabled={noDeadlineLoading}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] hover:bg-[#fbf9f5] text-xs font-semibold text-[#442a22] flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${noDeadlineLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {noDeadlineLoading ? (
            <div className="py-16 text-center">
              <div className="w-7 h-7 border-2 border-[#293417] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#725a39]">Loading listings missing application deadlines...</p>
            </div>
          ) : noDeadlineRows.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-[#e6e2d6] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[11px] font-sans font-bold text-[#725a39] uppercase">
                      <th className="py-3 px-3.5">Job Listing &amp; Employer</th>
                      <th className="py-3 px-3">Role &amp; Details</th>
                      <th className="py-3 px-3 min-w-[280px]">Set Application Deadline</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e6e2d6]">
                    {noDeadlineRows.map((job) => {
                      const isActing = deadlineActionLoading?.includes(String(job.id));
                      const inputVal = deadlineInputs[job.id] || '';

                      return (
                        <tr key={job.id} className="hover:bg-[#fbf9f5]/70 transition-colors">
                          <td className="py-3.5 px-3.5 max-w-xs">
                            <div className="font-bold text-[#442a22] text-xs leading-snug line-clamp-2">
                              {job.title}
                            </div>
                            <div className="text-[11px] text-[#725a39] mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{job.company || 'Unknown Employer'}</span>
                              <span>·</span>
                              <span>{job.location || 'Rwanda'}</span>
                            </div>
                            {job.ai_summary && (
                              <p className="text-[10.5px] text-[#725a39]/90 mt-1 line-clamp-1 italic">
                                "{job.ai_summary}"
                              </p>
                            )}
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="flex flex-col gap-1 text-[11px]">
                              <span className="px-2 py-0.5 rounded bg-[#f3efe6] text-[#442a22] font-medium w-fit">
                                {job.industry?.replace(/_/g, ' ') || 'technology it'}
                              </span>
                              <span className="text-[#725a39] text-[10.5px]">
                                Scraped: {job.scraped_at ? new Date(job.scraped_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={inputVal}
                                  onChange={(e) => setDeadlineInputs(prev => ({ ...prev, [job.id]: e.target.value }))}
                                  className="px-2.5 py-1.5 bg-white border border-[#e6e2d6] rounded-lg text-xs font-mono text-[#442a22] outline-none focus:border-[#293417]"
                                />
                                <button
                                  onClick={() => handleSaveDeadline(job.id)}
                                  disabled={isActing || !inputVal}
                                  className="px-3 py-1.5 bg-[#293417] hover:bg-[#1f2711] text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-40 transition-all"
                                >
                                  {deadlineActionLoading === `deadline_${job.id}` ? 'Saving...' : 'Set Deadline'}
                                </button>
                              </div>

                              {/* Quick Presets */}
                              <div className="flex items-center gap-1 text-[10.5px] text-[#725a39]">
                                <span>Quick:</span>
                                <button
                                  onClick={() => handleSetPresetDeadline(job.id, 7)}
                                  className="px-1.5 py-0.5 rounded hover:bg-[#e6e2d6]/60 text-[#442a22] font-mono cursor-pointer"
                                >
                                  +7d
                                </button>
                                <button
                                  onClick={() => handleSetPresetDeadline(job.id, 14)}
                                  className="px-1.5 py-0.5 rounded hover:bg-[#e6e2d6]/60 text-[#442a22] font-mono cursor-pointer"
                                >
                                  +14d
                                </button>
                                <button
                                  onClick={() => handleSetPresetDeadline(job.id, 30)}
                                  className="px-1.5 py-0.5 rounded hover:bg-[#e6e2d6]/60 text-[#442a22] font-mono cursor-pointer font-bold"
                                >
                                  +30d
                                </button>
                                <button
                                  onClick={() => handleSetPresetDeadline(job.id, 60)}
                                  className="px-1.5 py-0.5 rounded hover:bg-[#e6e2d6]/60 text-[#442a22] font-mono cursor-pointer"
                                >
                                  +60d
                                </button>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openJobDrawer(job.id)}
                                className="p-1.5 rounded-lg border border-[#e6e2d6] bg-white hover:bg-[#fbf9f5] text-[#725a39] hover:text-[#442a22] cursor-pointer"
                                title="Inspect Full Job Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeactivate(job.id, job.title)}
                                disabled={isActing}
                                className="px-2 py-1.5 rounded-lg border border-[#e6e2d6] bg-white hover:bg-[#fdf3e1] text-[#a5690c] text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                                title="Deactivate (hide from candidates)"
                              >
                                Deactivate
                              </button>

                              <button
                                onClick={() => handleDelete(job.id, job.title)}
                                disabled={isActing}
                                className="p-1.5 rounded-lg border border-[#ba1a1a]/20 bg-white hover:bg-[#fcedeb] text-[#ba1a1a] cursor-pointer disabled:opacity-40"
                                title="Delete Completely"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-[#725a39] pt-2">
                <span>
                  Showing {((noDeadlinePage - 1) * 15) + 1} – {Math.min(noDeadlinePage * 15, noDeadlineTotal)} of {noDeadlineTotal} listings
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNoDeadlinePage(prev => Math.max(1, prev - 1))}
                    disabled={noDeadlinePage <= 1}
                    className="px-3 py-1 rounded-lg border border-[#e6e2d6] bg-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-xs font-bold text-[#442a22] px-1">
                    {noDeadlinePage}
                  </span>
                  <button
                    onClick={() => setNoDeadlinePage(prev => prev + 1)}
                    disabled={noDeadlinePage * 15 >= noDeadlineTotal}
                    className="px-3 py-1 rounded-lg border border-[#e6e2d6] bg-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-lg bg-[#e9f6ee]/40 border border-[#16813d]/20">
              <CheckCircle2 className="w-8 h-8 text-[#16813d] mx-auto mb-2" />
              <div className="text-xs font-bold text-[#442a22]">All Active Listings Have Valid Application Deadlines!</div>
              <p className="text-[11px] text-[#725a39] mt-0.5">
                No active jobs currently lack deadline timestamps.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: NEAR-DUPLICATES STUDIO ================= */}
      {activeTab === 'duplicates' && (
        <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
                  <Split className="w-4 h-4 text-[#a5690c]" />
                  Near-Duplicates Studio &amp; Resolution Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#a5690c]/10 text-[#a5690c]">
                  {dupPairs.length} Candidate Pairs
                </span>
              </div>
              <p className="text-xs text-[#725a39] mt-0.5">
                Trigram fuzzy similarity across active titles and employers. Review pairs side-by-side and keep the authoritative listing.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-[#fbf9f5] p-1 rounded-lg border border-[#e6e2d6] text-xs">
                <span className="text-[#725a39] px-2 font-medium">Threshold:</span>
                {[0.7, 0.8, 0.9].map((t) => (
                  <button
                    key={t}
                    onClick={() => setDupThreshold(t)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors cursor-pointer ${
                      dupThreshold === t 
                        ? 'bg-[#293417] text-white' 
                        : 'text-[#442a22] hover:bg-[#e6e2d6]/50'
                    }`}
                  >
                    {Math.round(t * 100)}%
                  </button>
                ))}
              </div>

              <button
                onClick={() => loadDuplicates(dupThreshold)}
                disabled={dupLoading || bulkReviewRunning}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f3efe6] px-5 text-xs font-semibold text-[#442a22] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#e9e4da] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <RefreshCw className={`w-4 h-4 ${dupLoading ? 'animate-spin' : ''}`} />
                <span>Re-Scan</span>
              </button>

              <button
                type="button"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={dupLoading || bulkReviewRunning || dupPairs.length === 0}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#442a22] px-6 font-body text-xs font-semibold text-[#fbf9f5] shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#352019] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {bulkReviewRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                {bulkReviewRunning ? 'Kio is reviewing all…' : 'Review All with Kio'}
              </button>
            </div>
          </div>

          {(bulkReviewRunning || bulkSummary) && (
            <section className="rounded-lg bg-[#f3efe6] p-4 md:p-6" aria-live="polite">
              {bulkReviewRunning && bulkProgress ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-sans text-sm font-bold text-[#442a22]">Kio is reviewing every candidate</p>
                      <p className="mt-1 text-xs text-[#725a39]">Confirmed duplicates are removed one at a time. Uncertain decisions stay in this queue.</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-bold text-[#442a22]">{bulkProgress.current} / {bulkProgress.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-lg bg-[#e0d8ca]">
                    <div
                      className="h-full rounded-lg bg-[#293417] transition-all duration-300"
                      style={{ width: `${Math.round((bulkProgress.current / Math.max(bulkProgress.total, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : bulkSummary ? (
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-sans text-sm font-bold text-[#442a22]">Bulk review complete</p>
                      <p className="mt-1 text-xs text-[#725a39]">Only uncertain or failed pairs remain below for manual review.</p>
                    </div>
                    <button type="button" onClick={() => setBulkSummary(null)} className="h-12 rounded-lg bg-[#e9e4da] px-5 text-xs font-semibold text-[#442a22]">Dismiss summary</button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {[
                      ['Reviewed', bulkSummary.reviewed],
                      ['Deleted', bulkSummary.deleted],
                      ['Kept both', bulkSummary.kept],
                      ['Uncertain', bulkSummary.uncertain],
                      ['Failed', bulkSummary.failed]
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-[#fbf9f5] p-3">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[#725a39]">{label}</span>
                        <span className="mt-1 block font-mono text-lg font-bold text-[#442a22]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {dupLoading ? (
            <div className="py-16 text-center">
              <div className="w-7 h-7 border-2 border-[#293417] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#725a39]">Running pg_trgm similarity scan across live listings...</p>
            </div>
          ) : dupPairs.length > 0 ? (
            <div className="overflow-x-auto border border-[#e6e2d6] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e6e2d6] bg-[#fbf9f5] text-[11px] font-sans font-bold text-[#725a39] uppercase">
                    <th className="py-3 px-3.5">Similarity</th>
                    <th className="py-3 px-3">Job Listing A (Primary)</th>
                    <th className="py-3 px-3">Job Listing B (Candidate Duplicate)</th>
                    <th className="py-3 px-3">Employer</th>
                    <th className="py-3 px-3 text-right min-w-[220px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e2d6]">
                  {dupPairs.map((pair, idx) => {
                    const actingKey = `${pair.idA}_${pair.idB}`;
                    const isActing = dupActionLoading?.startsWith(actingKey);

                    return (
                      <tr key={idx} className="hover:bg-[#fbf9f5]/70 transition-colors">
                        <td className="py-3.5 px-3.5">
                          <span className="inline-block px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-[#fdf3e1] text-[#a5690c] border border-[#a5690c]/20">
                            {Math.round(pair.similarity * 100)}% match
                          </span>
                        </td>

                        <td className="py-3.5 px-3 max-w-[220px]">
                          <div className="font-bold text-[#442a22] line-clamp-1">{pair.titleA}</div>
                          <div className="text-[10.5px] font-mono text-[#725a39]">ID: #{String(pair.idA).slice(0, 8)}...</div>
                        </td>

                        <td className="py-3.5 px-3 max-w-[220px]">
                          <div className="font-bold text-[#442a22] line-clamp-1">{pair.titleB}</div>
                          <div className="text-[10.5px] font-mono text-[#725a39]">ID: #{String(pair.idB).slice(0, 8)}...</div>
                        </td>

                        <td className="py-3.5 px-3 text-[#725a39]">
                          {pair.companyA || pair.companyB || '—'}
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenComparison(pair)}
                              disabled={comparingLoading}
                              className="px-2.5 py-1.5 rounded-lg bg-[#293417] hover:bg-[#1f2711] text-white text-[11px] font-semibold shadow-xs cursor-pointer flex items-center gap-1"
                            >
                              <Split className="w-3 h-3" />
                              <span>Compare &amp; Resolve</span>
                            </button>

                            <button
                              onClick={() => handleResolvePair(pair, 'keep_a_deactivate_b')}
                              disabled={isActing}
                              className="px-2 py-1.5 rounded-lg border border-[#e6e2d6] bg-white hover:bg-[#fbf9f5] text-[#16813d] text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                              title="Keep Job A and deactivate Job B"
                            >
                              Keep A
                            </button>

                            <button
                              onClick={() => handleResolvePair(pair, 'delete_b')}
                              disabled={isActing}
                              className="p-1.5 rounded-lg border border-[#ba1a1a]/20 bg-white hover:bg-[#fcedeb] text-[#ba1a1a] cursor-pointer disabled:opacity-40"
                              title="Delete Job B"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center rounded-lg bg-[#fbf9f5] border border-dashed border-[#e6e2d6]">
              <CheckCircle2 className="w-8 h-8 text-[#16813d] mx-auto mb-2 opacity-80" />
              <div className="text-xs font-bold text-[#442a22]">Zero Near-Duplicates Flagged at &ge; {Math.round(dupThreshold * 100)}% Similarity</div>
              <p className="text-[11px] text-[#725a39] mt-0.5">
                No active listings exceed the selected similarity threshold.
              </p>
            </div>
          )}

          {/* Side-by-Side Comparison Modal */}
          {activeComparison && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-[#fbf9f5] rounded-lg border border-[#e6e2d6] shadow-xl w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden animate-scale-in">
                {/* Modal Header */}
                <div className="p-4 border-b border-[#e6e2d6] flex items-center justify-between bg-[#fbf9f5]">
                  <div className="flex items-center gap-2.5">
                    <Split className="w-4 h-4 text-[#293417]" />
                    <h3 className="text-sm font-sans font-bold text-[#442a22]">
                      Extensive Duplicate Comparison ({Math.round(activeComparison.pair.similarity * 100)}% Match)
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveComparison(null)}
                    className="p-1 rounded-lg text-[#725a39] hover:text-[#442a22] hover:bg-[#e6e2d6]/50 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body: 2 Columns Side-by-Side */}
                <div className="p-4 md:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 divide-y lg:divide-y-0 lg:divide-x divide-[#e6e2d6]">
                  {/* Left Column: Job A */}
                  <div className="space-y-4 pr-0 lg:pr-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-[#293417]/10 text-[#293417] text-[11px] font-bold uppercase">
                        Listing A (Primary)
                      </span>
                      <span className="font-mono text-[11px] text-[#725a39]">ID: #{activeComparison.pair.idA}</span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-[#442a22]">{activeComparison.jobA?.title || activeComparison.pair.titleA}</h4>
                      <p className="text-xs font-semibold text-[#725a39] mt-0.5">{activeComparison.jobA?.company || activeComparison.pair.companyA}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded bg-[#fbf9f5] border border-[#e6e2d6]">
                        <span className="text-[10px] text-[#725a39] uppercase block font-bold">Deadline</span>
                        <span className="font-mono font-semibold text-[#442a22]">{activeComparison.jobA?.deadline || 'No deadline'}</span>
                      </div>
                      <div className="p-2.5 rounded bg-[#fbf9f5] border border-[#e6e2d6]">
                        <span className="text-[10px] text-[#725a39] uppercase block font-bold">Location</span>
                        <span className="font-medium text-[#442a22]">{activeComparison.jobA?.location || 'Rwanda'}</span>
                      </div>
                    </div>

                    {activeComparison.jobA?.job_url && (
                      <a 
                        href={activeComparison.jobA.job_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[11px] text-[#293417] hover:underline flex items-center gap-1 font-mono truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{activeComparison.jobA.job_url}</span>
                      </a>
                    )}

                    <div>
                      <span className="text-[10px] text-[#725a39] uppercase font-bold block mb-1">Extracted Must-Have Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {(activeComparison.jobA?.skills_t1 || []).map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-[#293417]/10 text-[#293417] text-[10.5px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#725a39] uppercase font-bold block mb-2">Full Job Description</span>
                      <div className="p-4 rounded-lg bg-[#f3efe6] text-xs text-[#442a22] min-h-64 max-h-[32rem] overflow-y-auto leading-6 whitespace-pre-wrap">
                        {activeComparison.jobA?.description || 'No description available'}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Job B */}
                  <div className="space-y-4 pt-4 lg:pt-0 pl-0 lg:pl-6">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-[#a5690c]/10 text-[#a5690c] text-[11px] font-bold uppercase">
                        Listing B (Candidate)
                      </span>
                      <span className="font-mono text-[11px] text-[#725a39]">ID: #{activeComparison.pair.idB}</span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-[#442a22]">{activeComparison.jobB?.title || activeComparison.pair.titleB}</h4>
                      <p className="text-xs font-semibold text-[#725a39] mt-0.5">{activeComparison.jobB?.company || activeComparison.pair.companyB}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded bg-[#fbf9f5] border border-[#e6e2d6]">
                        <span className="text-[10px] text-[#725a39] uppercase block font-bold">Deadline</span>
                        <span className="font-mono font-semibold text-[#442a22]">{activeComparison.jobB?.deadline || 'No deadline'}</span>
                      </div>
                      <div className="p-2.5 rounded bg-[#fbf9f5] border border-[#e6e2d6]">
                        <span className="text-[10px] text-[#725a39] uppercase block font-bold">Location</span>
                        <span className="font-medium text-[#442a22]">{activeComparison.jobB?.location || 'Rwanda'}</span>
                      </div>
                    </div>

                    {activeComparison.jobB?.job_url && (
                      <a 
                        href={activeComparison.jobB.job_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[11px] text-[#293417] hover:underline flex items-center gap-1 font-mono truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{activeComparison.jobB.job_url}</span>
                      </a>
                    )}

                    <div>
                      <span className="text-[10px] text-[#725a39] uppercase font-bold block mb-1">Extracted Must-Have Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {(activeComparison.jobB?.skills_t1 || []).map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-[#293417]/10 text-[#293417] text-[10.5px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#725a39] uppercase font-bold block mb-2">Full Job Description</span>
                      <div className="p-4 rounded-lg bg-[#f3efe6] text-xs text-[#442a22] min-h-64 max-h-[32rem] overflow-y-auto leading-6 whitespace-pre-wrap">
                        {activeComparison.jobB?.description || 'No description available'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kio provides decision support only; resolution remains an explicit user action. */}
                <section className="mx-4 mb-4 md:mx-6 md:mb-6 rounded-lg bg-[#f3efe6] p-4 md:p-6" aria-labelledby="kio-review-title">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#293417] text-[#fbf9f5]">
                        <Bot className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h4 id="kio-review-title" className="font-sans text-sm font-bold text-[#442a22]">Ask Kio for a second opinion</h4>
                        <p className="mt-1 max-w-xl font-body text-xs leading-relaxed text-[#725a39]">
                          Kio compares both listings with the Jev decision model. It will never deactivate or delete a listing for you.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAiReview}
                      disabled={aiReviewLoading}
                      className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#442a22] px-6 font-body text-xs font-semibold text-[#fbf9f5] shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#352019] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      {aiReviewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {aiReviewLoading ? 'Kio is reviewing…' : aiReview ? 'Review again' : 'Review with Kio'}
                    </button>
                  </div>

                  {aiReviewError && (
                    <div className="mt-4 rounded-lg bg-[#fcedeb] p-4 text-[#ba1a1a]" role="alert">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="text-xs font-bold">Kio review is unavailable</p>
                          <p className="mt-1 text-xs leading-relaxed">{aiReviewError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {aiReview && (
                    <div className="mt-4 rounded-lg bg-[#fbf9f5] p-4 md:p-6" aria-live="polite">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#725a39]">Kio's recommendation</span>
                          <p className={`mt-1 font-sans text-lg font-bold ${
                            aiReview.decision === 'duplicate' ? 'text-[#a5690c]' :
                            aiReview.decision === 'not_duplicate' ? 'text-[#293417]' : 'text-[#725a39]'
                          }`}>
                            {aiReview.decision === 'duplicate' ? 'Likely a duplicate' :
                              aiReview.decision === 'not_duplicate' ? 'Likely separate listings' : 'Not enough certainty'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-[#e9e4da] px-4 py-3 text-left sm:text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[#725a39]">Confidence</span>
                          <span className="font-mono text-lg font-bold text-[#442a22]">{Math.round(aiReview.confidence * 100)}%</span>
                        </div>
                      </div>

                      {aiReview.canonicalJob && aiReview.decision === 'duplicate' && (
                        <p className="mt-3 text-xs font-semibold text-[#442a22]">Suggested listing to keep: Job {aiReview.canonicalJob}</p>
                      )}
                      {aiReview.explanation && <p className="mt-3 text-xs leading-relaxed text-[#725a39]">{aiReview.explanation}</p>}
                      {aiReview.reasonCodes && aiReview.reasonCodes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {aiReview.reasonCodes.map((reason) => (
                            <span key={reason} className="rounded-lg bg-[#293417]/10 px-3 py-2 text-[10px] font-semibold text-[#293417]">
                              {reason.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {aiReview.probabilities && (
                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {Object.entries(aiReview.probabilities).map(([label, probability]) => (
                            <div key={label} className="rounded-lg bg-[#f3efe6] px-3 py-2">
                              <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-[#725a39]">{label.replace(/_/g, ' ')}</span>
                              <span className="font-mono text-xs font-bold text-[#442a22]">{Math.round(Number(probability ?? 0) * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-4 text-[10px] text-[#725a39]">Decision support from {aiReview.model}. Choose an action below only after checking the listings.</p>
                    </div>
                  )}
                </section>

                {/* Modal Footer Actions */}
                <div className="p-4 border-t border-[#e6e2d6] bg-[#fbf9f5] flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => handleResolvePair(activeComparison.pair, 'dismiss')}
                    className="px-3 py-2 rounded-lg border border-[#e6e2d6] bg-white text-xs font-semibold text-[#725a39] hover:text-[#442a22] cursor-pointer"
                  >
                    Keep Both (False Positive)
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleResolvePair(activeComparison.pair, 'keep_b_deactivate_a')}
                      className="px-3.5 py-2 rounded-lg border border-[#e6e2d6] bg-white hover:bg-[#fbf9f5] text-xs font-semibold text-[#442a22] cursor-pointer"
                    >
                      Keep B &amp; Deactivate A
                    </button>

                    <button
                      onClick={() => handleResolvePair(activeComparison.pair, 'keep_a_deactivate_b')}
                      className="px-4 py-2 rounded-lg bg-[#293417] hover:bg-[#1f2711] text-white text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Keep A &amp; Deactivate B
                    </button>

                    <button
                      onClick={() => handleResolvePair(activeComparison.pair, 'delete_b')}
                      className="px-3 py-2 rounded-lg bg-[#ba1a1a] hover:bg-[#961515] text-white text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Delete B Completely
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {bulkConfirmOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
              <div className="w-full max-w-[560px] rounded-lg bg-[#fbf9f5] p-6 shadow-xl md:p-8" role="dialog" aria-modal="true" aria-labelledby="bulk-review-title">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#ba1a1a]/10 text-[#ba1a1a]">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <h3 id="bulk-review-title" className="mt-4 font-sans text-xl font-bold text-[#442a22]">Review all {dupPairs.length} candidate pairs?</h3>
                <p className="mt-3 font-body text-sm leading-6 text-[#725a39]">
                  Kio will ask Jev about each pair. When Jev is at least 95% confident that two records are duplicates and identifies the canonical listing, the other record will be permanently deleted.
                </p>
                <div className="mt-4 rounded-lg bg-[#f3efe6] p-4 text-xs leading-5 text-[#442a22]">
                  <p><strong>Separate listings:</strong> both jobs remain unchanged.</p>
                  <p className="mt-2"><strong>Uncertain or conflicting decisions:</strong> both jobs remain and return to your manual-review queue.</p>
                  <p className="mt-2"><strong>Important:</strong> deleted duplicate records cannot be restored from this screen.</p>
                </div>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setBulkConfirmOpen(false)}
                    className="h-12 rounded-lg bg-[#e9e4da] px-6 text-xs font-semibold text-[#442a22] transition-all duration-150 hover:-translate-y-0.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDuplicateReview}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#ba1a1a] px-6 text-xs font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#961515]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Review and delete confirmed duplicates
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 4: ACTIVE & COMPLETE LISTINGS ================= */}
      {activeTab === 'active' && (
        <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-[#16813d]" />
                  Active &amp; Fully Enriched Listings ({activeJobsTotal})
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#16813d]/10 text-[#16813d]">
                  Live &amp; Match Ready
                </span>
              </div>
              <p className="text-xs text-[#725a39] mt-0.5">
                Postings that are active, unexpired, and enriched with structured taxonomy ready for search and AI recommendations.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#725a39]" />
                <input
                  type="text"
                  placeholder="Search live jobs..."
                  value={activeJobsSearch}
                  onChange={(e) => {
                    setActiveJobsSearch(e.target.value);
                    setActiveJobsPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] text-xs text-[#442a22] placeholder:text-[#725a39] focus:outline-none focus:border-[#293417]"
                />
              </div>

              <button
                onClick={() => loadActiveCompleteJobs(activeJobsPage, activeJobsSearch)}
                disabled={activeJobsLoading}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] hover:bg-[#fbf9f5] text-xs font-semibold text-[#442a22] flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${activeJobsLoading ? 'animate-spin' : ''}`} />
                <span>Reload</span>
              </button>
            </div>
          </div>

          {activeJobsLoading ? (
            <div className="py-16 text-center">
              <div className="w-7 h-7 border-2 border-[#293417] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#725a39]">Loading active complete listings...</p>
            </div>
          ) : activeJobsRows.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-[#e6e2d6] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[11px] font-sans font-bold text-[#725a39] uppercase">
                      <th className="py-3 px-3.5">Title &amp; Employer</th>
                      <th className="py-3 px-3">Industry &amp; Role</th>
                      <th className="py-3 px-3">Application Deadline</th>
                      <th className="py-3 px-3">Skills (T1)</th>
                      <th className="py-3 px-3 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e6e2d6]">
                    {activeJobsRows.map((job) => (
                      <tr key={job.id} className="hover:bg-[#fbf9f5]/70 transition-colors">
                        <td className="py-3.5 px-3.5 max-w-xs">
                          <div className="font-bold text-[#442a22] text-xs line-clamp-1">{job.title}</div>
                          <div className="text-[11px] text-[#725a39] font-medium">{job.company || '—'}</div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="text-[#442a22] font-semibold">{job.industry?.replace(/_/g, ' ') || 'technology it'}</div>
                          <div className="text-[10.5px] text-[#725a39]">{job.job_function?.replace(/_/g, ' ') || 'operations admin'}</div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="font-mono text-xs font-semibold text-[#16813d] flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{job.deadline || 'No deadline'}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(job.skills_t1 || []).slice(0, 3).map((s, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-[#f3efe6] text-[#442a22] text-[10px]">
                                {s}
                              </span>
                            ))}
                            {(job.skills_t1 || []).length > 3 && (
                              <span className="text-[10px] text-[#725a39] font-mono">
                                +{(job.skills_t1 || []).length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => openJobDrawer(job.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#293417] hover:underline cursor-pointer"
                          >
                            <span>Drawer</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-[#725a39] pt-2">
                <span>
                  Showing {((activeJobsPage - 1) * 15) + 1} – {Math.min(activeJobsPage * 15, activeJobsTotal)} of {activeJobsTotal} listings
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveJobsPage(prev => Math.max(1, prev - 1))}
                    disabled={activeJobsPage <= 1}
                    className="px-3 py-1 rounded-lg border border-[#e6e2d6] bg-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-xs font-bold text-[#442a22] px-1">
                    {activeJobsPage}
                  </span>
                  <button
                    onClick={() => setActiveJobsPage(prev => prev + 1)}
                    disabled={activeJobsPage * 15 >= activeJobsTotal}
                    className="px-3 py-1 rounded-lg border border-[#e6e2d6] bg-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-lg bg-[#fbf9f5] border border-dashed border-[#e6e2d6]">
              <Info className="w-8 h-8 text-[#725a39] mx-auto mb-2 opacity-60" />
              <div className="text-xs font-bold text-[#442a22]">No Active Listings Found</div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 5: SKILL VOCABULARY STUDIO ================= */}
      {activeTab === 'vocabulary' && (
        <div className="bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22] flex items-center gap-2">
                  <Award className="w-3.5 h-3.5 text-[#293417]" />
                  Skill Vocabulary Studio (<code className="font-mono text-[#293417]">skill_vocabulary</code>)
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#e9f6ee] text-[#16813d]">
                  {vocabData.approved.toLocaleString()} Approved / {vocabData.total.toLocaleString()} Total
                </span>
              </div>
              <p className="text-xs text-[#725a39] mt-0.5">
                The curated dictionary Gemini references during extraction. Approving terms enables them across prompt templates.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#725a39]" />
                <input
                  type="text"
                  placeholder="Search unapproved terms..."
                  value={vocabSearch}
                  onChange={(e) => setVocabSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] text-xs text-[#442a22] placeholder:text-[#725a39] focus:outline-none focus:border-[#293417]"
                />
              </div>

              <button
                onClick={loadVocabulary}
                disabled={vocabLoading}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e6e2d6] hover:bg-[#fbf9f5] text-xs font-semibold text-[#442a22] flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${vocabLoading ? 'animate-spin' : ''}`} />
                <span>Reload</span>
              </button>
            </div>
          </div>

          {/* Unapproved Terms Grid */}
          <div>
            <h4 className="text-xs font-bold text-[#442a22] mb-3">
              Pending Unapproved Skill Terms (Discovered In Postings)
            </h4>

            {vocabLoading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-[#293417] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-[#725a39]">Loading vocabulary terms...</p>
              </div>
            ) : vocabData.unapprovedTerms.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {vocabData.unapprovedTerms
                  .filter(t => !vocabSearch || t.skill.toLowerCase().includes(vocabSearch.toLowerCase()))
                  .map((term, i) => (
                    <div 
                      key={i}
                      className="p-3 rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] flex items-center justify-between gap-3 hover:border-[#293417]/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#442a22] truncate">{term.skill}</div>
                        <div className="text-[10.5px] text-[#725a39] font-mono mt-0.5">Used in {term.usage_count} listings</div>
                      </div>

                      <button
                        onClick={() => handleApproveTerm(term.skill)}
                        disabled={approvingTerm === term.skill}
                        className="px-2.5 py-1 rounded bg-[#293417] hover:bg-[#1f2711] text-white text-xs font-semibold shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {approvingTerm === term.skill ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-8 text-center rounded-lg bg-[#fbf9f5] border border-dashed border-[#e6e2d6]">
                <CheckCircle2 className="w-6 h-6 text-[#16813d] mx-auto mb-1 opacity-80" />
                <p className="text-xs font-semibold text-[#442a22]">All Discovered Skill Terms Are Approved</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
