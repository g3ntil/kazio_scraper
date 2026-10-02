import React, { useEffect, useState } from 'react';
import { 
  X, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Building2, 
  MapPin, 
  Calendar, 
  Layers, 
  Sparkles, 
  Copy, 
  Check, 
  Briefcase, 
  GraduationCap, 
  DollarSign, 
  Mail, 
  Globe, 
  FileText, 
  Code, 
  AlertTriangle,
  Send,
  Power
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { fetchJobDetail, srcOfUrl } from '../../services/dataService';
import { JobDetail } from '../../types/dashboard';
import { supabase } from '../../lib/supabase';

const SOURCE_NAMES: Record<string, { name: string; letter: string; color: string; bg: string }> = {
  jobinrwanda: { name: 'Job in Rwanda', letter: 'J', color: '#16813d', bg: '#16813d15' },
  brightermonday: { name: 'BrighterMonday', letter: 'B', color: '#2954e0', bg: '#2954e015' },
  ndangira: { name: 'Ndangira', letter: 'N', color: '#7c3fd0', bg: '#7c3fd015' },
  greatrwandajobs: { name: 'Great Rwanda Jobs', letter: 'G', color: '#a5690c', bg: '#a5690c15' },
  jobwebrwanda: { name: 'JobWeb Rwanda', letter: 'W', color: '#725a39', bg: '#725a3915' },
  other: { name: 'Manual / Other', letter: 'O', color: '#63636a', bg: '#63636a15' }
};

export const JobDrawer: React.FC = () => {
  const { selectedJobId, isDrawerOpen, closeJobDrawer, refreshAll } = useDashboard();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'fields' | 'description' | 'json'>('fields');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        closeJobDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, closeJobDrawer]);

  useEffect(() => {
    if (selectedJobId && isDrawerOpen) {
      setLoading(true);
      setActionFeedback(null);
      fetchJobDetail(selectedJobId)
        .then((res) => setJob(res))
        .catch((err) => console.error("Error fetching job drawer detail:", err))
        .finally(() => setLoading(false));
    } else {
      setJob(null);
      setActionFeedback(null);
    }
  }, [selectedJobId, isDrawerOpen]);

  if (!isDrawerOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRequeue = async () => {
    if (!job || !supabase) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          extraction_status: 'pending',
          extraction_error: null,
          extraction_attempts: 0,
          processing_started_at: null
        })
        .eq('id', job.id);
      
      if (error) throw error;

      const updated = await fetchJobDetail(job.id);
      setJob(updated);
      refreshAll();
      setActionFeedback({ type: 'success', message: 'Job requeued to pending status successfully.' });
    } catch (err: any) {
      console.error("Requeue error:", err);
      setActionFeedback({ type: 'error', message: `Failed to requeue: ${err.message || 'Unknown error'}` });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!job || !supabase) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const nextActive = !job.is_active;
      const { error } = await supabase
        .from('jobs')
        .update({ is_active: nextActive })
        .eq('id', job.id);
      
      if (error) throw error;

      setJob({ ...job, is_active: nextActive });
      refreshAll();
      setActionFeedback({
        type: 'success', 
        message: nextActive ? 'Job activated on Kazio platform.' : 'Job deactivated.' 
      });
    } catch (err: any) {
      console.error("Toggle active error:", err);
      setActionFeedback({ type: 'error', message: `Failed to toggle active state: ${err.message || 'Unknown error'}` });
    } finally {
      setActionLoading(false);
    }
  };

  const srcKey = srcOfUrl(job?.job_url || null);
  const srcMeta = SOURCE_NAMES[srcKey] || SOURCE_NAMES.other;

  const formatSalary = (min: number | null, max: number | null, estimated: boolean | null) => {
    if (min === null && max === null) return 'Not Stated';
    const estTag = estimated ? ' (est.)' : '';
    if (min !== null && max !== null) {
      return `${min.toLocaleString()} – ${max.toLocaleString()} RWF / mo${estTag}`;
    }
    if (min !== null) return `From ${min.toLocaleString()} RWF / mo${estTag}`;
    return `Up to ${max?.toLocaleString()} RWF / mo${estTag}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end font-body">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#442a22]/35 backdrop-blur-xs transition-opacity duration-200 cursor-pointer"
        onClick={closeJobDrawer}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col z-10 border-l border-[#e6e2d6] animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-[#e6e2d6] bg-[#fbf9f5] flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#ede9de] text-[#442a22]">
                Job #{job?.id || selectedJobId}
              </span>

              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                style={{ backgroundColor: srcMeta.bg, color: srcMeta.color }}
              >
                <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[8px] bg-white/80">
                  {srcMeta.letter}
                </span>
                {srcMeta.name}
              </span>

              {job?.duplicate_of_job_id && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#7c3fd0]/10 text-[#7c3fd0]">
                  Duplicate of #{job.duplicate_of_job_id}
                </span>
              )}
            </div>

            <h2 className="text-xl font-sans font-bold text-[#442a22] leading-snug break-words">
              {loading ? 'Loading job record...' : (job?.title || 'Untitled Job')}
            </h2>

            <div className="flex items-center gap-4 mt-2.5 text-xs text-[#725a39] flex-wrap">
              {job?.company && (
                <span className="flex items-center gap-1.5 font-medium text-[#442a22]">
                  <Building2 className="w-3.5 h-3.5 opacity-70" />
                  {job.company}
                </span>
              )}
              {job?.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 opacity-70" />
                  {job.location}
                </span>
              )}
              {job?.deadline && (
                <span className="flex items-center gap-1.5 font-mono">
                  <Calendar className="w-3.5 h-3.5 opacity-70" />
                  {job.deadline}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={closeJobDrawer}
              className="p-2 rounded-lg text-[#725a39] hover:bg-[#ede9de] hover:text-[#442a22] transition-colors cursor-pointer"
              title="Close drawer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#e6e2d6] px-6 bg-white gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('fields')}
            className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'fields'
                ? 'border-[#293417] text-[#293417]'
                : 'border-transparent text-[#725a39] hover:text-[#442a22]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Enriched Fields</span>
          </button>
          <button
            onClick={() => setActiveTab('description')}
            className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'description'
                ? 'border-[#293417] text-[#293417]'
                : 'border-transparent text-[#725a39] hover:text-[#442a22]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Description Text</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'json'
                ? 'border-[#293417] text-[#293417]'
                : 'border-transparent text-[#725a39] hover:text-[#442a22]'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Raw JSON Record</span>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Action notification feedback */}
          {actionFeedback && (
            <div className={`p-3 rounded-lg text-xs flex items-center justify-between ${
              actionFeedback.type === 'success' 
                ? 'bg-[#16813d]/10 text-[#16813d] border border-[#16813d]/20' 
                : 'bg-[#ba1a1a]/10 text-[#ba1a1a] border border-[#ba1a1a]/20'
            }`}>
              <span>{actionFeedback.message}</span>
              <button onClick={() => setActionFeedback(null)} className="cursor-pointer opacity-70 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-xs text-[#725a39] space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#293417]" />
              <p className="font-medium">Fetching complete extraction payload from Supabase...</p>
            </div>
          ) : job ? (
            activeTab === 'fields' ? (
              <div className="space-y-5">
                {/* Status & Live Card */}
                <div className="p-4 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#725a39] font-bold uppercase tracking-wider block">
                      Pipeline Status
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-sm font-bold uppercase text-[#442a22]">
                        {job.extraction_status}
                      </span>
                      {job.extraction_attempts > 0 && (
                        <span className="text-xs font-mono text-[#725a39]">
                          ({job.extraction_attempts} attempts)
                        </span>
                      )}
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase ${
                    job.is_active ? 'bg-[#16813d]/10 text-[#16813d]' : 'bg-[#725a39]/15 text-[#725a39]'
                  }`}>
                    {job.is_active ? '● Live on Kazio' : '○ Inactive'}
                  </span>
                </div>

                {/* Extraction Error alert */}
                {job.extraction_error && (
                  <div className="p-4 rounded-lg bg-[#ba1a1a]/5 border border-[#ba1a1a]/20 text-xs text-[#ba1a1a] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[#ba1a1a]" />
                        Extraction Pipeline Error:
                      </div>
                      <button
                        onClick={() => handleCopy(job.extraction_error || '', 'error')}
                        className="text-[11px] hover:underline font-semibold cursor-pointer"
                      >
                        {copiedField === 'error' ? 'Copied' : 'Copy Error'}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] bg-white p-2.5 rounded border border-[#ba1a1a]/20 whitespace-pre-wrap">
                      {job.extraction_error}
                    </div>
                  </div>
                )}

                {/* AI Summary */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-[#725a39] uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#293417]" />
                      AI Companion Summary (Kio)
                    </label>
                    {job.ai_summary && (
                      <button
                        onClick={() => handleCopy(job.ai_summary || '', 'summary')}
                        className="text-[10px] text-[#725a39] hover:text-[#442a22] font-semibold cursor-pointer"
                      >
                        {copiedField === 'summary' ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-[#442a22] leading-relaxed bg-[#fbf9f5] p-3.5 rounded-lg border border-[#e6e2d6]">
                    {job.ai_summary || (
                      <span className="text-[#725a39] italic">
                        No AI summary generated yet. The AI extraction pipeline enriches job summaries automatically.
                      </span>
                    )}
                  </div>
                </div>

                {/* Key metadata grid */}
                <div>
                  <label className="text-[10px] font-bold text-[#725a39] uppercase tracking-wider block mb-2">
                    Structured Classification
                  </label>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Industry</span>
                      <span className="font-semibold text-[#442a22] capitalize">
                        {job.industry ? job.industry.replace(/_/g, ' ') : '—'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Job Function</span>
                      <span className="font-semibold text-[#442a22] capitalize">
                        {job.job_function ? job.job_function.replace(/_/g, ' ') : '—'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Experience Level</span>
                      <span className="font-medium text-[#442a22] capitalize">
                        {job.experience_level_new ? job.experience_level_new.replace(/_/g, ' ') : '—'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Job Type</span>
                      <span className="font-medium text-[#442a22] capitalize">
                        {job.job_type_new ? job.job_type_new.replace(/_/g, ' ') : '—'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Minimum Degree</span>
                      <span className="font-medium text-[#442a22] capitalize">
                        {job.min_degree ? job.min_degree.replace(/_/g, ' ') : '—'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Monthly Salary</span>
                      <span className="font-medium text-[#442a22]">
                        {formatSalary(job.salary_min, job.salary_max, job.salary_is_estimated)}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Deadline Origin</span>
                      <span className="font-medium text-[#442a22] capitalize font-mono text-[11px]">
                        {job.deadline_source ? job.deadline_source.replace(/_/g, ' ') : 'None'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      <span className="text-[#725a39] block text-[10px] uppercase font-semibold">Content Type</span>
                      <span className="font-medium text-[#442a22] capitalize">
                        {job.content_type || 'job'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Skills Tier 1 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-[#725a39] uppercase tracking-wider block">
                      Skills (Tier 1 — Core Requirements)
                    </label>
                    <span className="text-[10px] font-mono text-[#725a39]">
                      {job.skills_t1?.length || 0} skills
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70 min-h-[44px]">
                    {job.skills_t1 && job.skills_t1.length > 0 ? (
                      job.skills_t1.map((skill, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-[#293417]/10 text-[#293417] text-xs font-medium">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#725a39] italic">No Tier 1 skills identified</span>
                    )}
                  </div>
                </div>

                {/* Skills Tier 2 & 3 if present */}
                {((job.skills_t2 && job.skills_t2.length > 0) || (job.skills_t3 && job.skills_t3.length > 0)) && (
                  <div>
                    <label className="text-[10px] font-bold text-[#725a39] uppercase tracking-wider block mb-1.5">
                      Skills (Preferred &amp; Implied)
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                      {job.skills_t2?.map((skill, i) => (
                        <span key={`t2-${i}`} className="px-2 py-0.5 rounded-md bg-[#ede9de] text-[#442a22] text-xs">
                          {skill} (preferred)
                        </span>
                      ))}
                      {job.skills_t3?.map((skill, i) => (
                        <span key={`t3-${i}`} className="px-2 py-0.5 rounded-md bg-[#ede9de] text-[#725a39] text-xs">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Languages & Contact */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                    <span className="text-[#725a39] block text-[10px] uppercase font-semibold mb-1">
                      Languages Required
                    </span>
                    {job.languages_required && job.languages_required.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {job.languages_required.map((lang, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-white border border-[#e6e2d6] text-[11px] font-medium text-[#442a22]">
                            {lang}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#725a39] italic">Not specified</span>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-[#fbf9f5] border border-[#e6e2d6]/70">
                    <span className="text-[#725a39] block text-[10px] uppercase font-semibold mb-1">
                      Application Contact
                    </span>
                    {job.contact_emails && job.contact_emails.length > 0 ? (
                      <div className="text-[11px] font-mono text-[#293417] truncate">
                        {job.contact_emails.join(', ')}
                      </div>
                    ) : job.apply_contact ? (
                      <div className="text-[11px] text-[#442a22] truncate">
                        {job.apply_contact}
                      </div>
                    ) : (
                      <span className="text-[#725a39] italic">Direct portal apply</span>
                    )}
                  </div>
                </div>

                {/* Source link */}
                <div className="pt-2 flex items-center justify-between">
                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#293417] hover:underline"
                  >
                    <span>View original listing on {srcMeta.name}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => handleCopy(job.job_url, 'url')}
                    className="text-xs text-[#725a39] hover:text-[#442a22] font-medium cursor-pointer inline-flex items-center gap-1"
                  >
                    {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-[#16813d]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'url' ? 'Link Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>
            ) : activeTab === 'description' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#725a39]">
                  <span>
                    Length: <strong className="font-mono text-[#442a22]">{job.description?.length || 0}</strong> characters
                  </span>
                  <button
                    onClick={() => handleCopy(job.description || '', 'desc')}
                    className="px-2.5 py-1 rounded-md bg-[#ede9de] hover:bg-[#e0dbc9] text-[#442a22] font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {copiedField === 'desc' ? <Check className="w-3.5 h-3.5 text-[#16813d]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'desc' ? 'Copied to Clipboard!' : 'Copy Description'}</span>
                  </button>
                </div>

                <div className="prose prose-sm max-w-none text-xs text-[#442a22] bg-[#fbf9f5] p-4 rounded-lg border border-[#e6e2d6] whitespace-pre-wrap leading-relaxed font-sans select-text max-h-[600px] overflow-y-auto">
                  {job.description || 'No raw job description text recorded in database.'}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#725a39]">
                  <span className="font-mono">JSON Document</span>
                  <button
                    onClick={() => handleCopy(JSON.stringify(job, null, 2), 'json')}
                    className="px-2.5 py-1 rounded-md bg-[#ede9de] hover:bg-[#e0dbc9] text-[#442a22] font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {copiedField === 'json' ? <Check className="w-3.5 h-3.5 text-[#16813d]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'json' ? 'JSON Copied!' : 'Copy JSON'}</span>
                  </button>
                </div>

                <pre className="bg-[#18181a] text-[#f4f4f5] p-4 rounded-lg text-[11px] font-mono overflow-x-auto leading-normal select-text max-h-[600px]">
                  {JSON.stringify(job, null, 2)}
                </pre>
              </div>
            )
          ) : (
            <div className="text-xs text-[#725a39] italic py-16 text-center">
              Job record could not be found or was deleted.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#e6e2d6] bg-[#fbf9f5] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequeue}
              disabled={actionLoading || !job}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#442a22] hover:bg-[#ede9de] transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              title="Reset attempts to 0 and status to pending"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#293417] ${actionLoading ? 'animate-spin' : ''}`} />
              <span>Requeue Extraction</span>
            </button>

            <button
              onClick={() => job && handleCopy(String(job.id), 'id')}
              className="px-3 py-2 rounded-lg bg-white border border-[#e6e2d6] text-xs font-semibold text-[#725a39] hover:bg-[#ede9de] hover:text-[#442a22] transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedField === 'id' ? 'ID Copied!' : 'Copy ID'}</span>
            </button>
          </div>

          <button
            onClick={handleToggleActive}
            disabled={actionLoading || !job}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs ${
              job?.is_active 
                ? 'bg-[#ba1a1a]/10 hover:bg-[#ba1a1a]/20 text-[#ba1a1a] border border-[#ba1a1a]/20'
                : 'bg-[#16813d]/10 hover:bg-[#16813d]/20 text-[#16813d] border border-[#16813d]/20'
            }`}
          >
            {job?.is_active ? <Power className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
            <span>{job?.is_active ? 'Deactivate Job' : 'Activate Job'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobDrawer;
