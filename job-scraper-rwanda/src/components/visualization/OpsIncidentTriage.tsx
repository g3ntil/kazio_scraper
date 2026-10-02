import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2, 
  ExternalLink,
  Sliders,
  Sparkles,
  ArrowRight,
  Filter
} from 'lucide-react';
import { IssueCard, PageId } from '../../types/dashboard';

export interface OpsIncidentTriageProps {
  issues: IssueCard[];
  className?: string;
  onNavigatePage: (page: PageId) => void;
}

export const OpsIncidentTriage: React.FC<OpsIncidentTriageProps> = ({
  issues,
  className = '',
  onNavigatePage
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const critCount = issues.filter(i => i.severity === 'critical').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const filteredIssues = issues.filter(issue => {
    if (filterSeverity === 'all') return true;
    return issue.severity === filterSeverity;
  });

  if (issues.length === 0) {
    return (
      <div className={`p-4 rounded-lg bg-[#16813d]/5 border border-[#16813d]/20 flex items-center justify-between text-xs text-[#16813d] ${className}`}>
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#16813d]" />
          <span className="font-semibold">All Systems Nominal: 0 active pipeline alerts or blocked keys.</span>
        </div>
        <span className="text-[10.5px] font-mono text-[#725a39]">pg_cron &amp; Gemini pool nominal</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-[#e6e2d6] shadow-xs overflow-hidden transition-all duration-200 ${className}`}>
      {/* Triage Banner Header */}
      <div className="p-4 bg-[#fcfbfa] border-b border-[#e6e2d6]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            critCount > 0 
              ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]' 
              : warnCount > 0 
              ? 'bg-[#a5690c]/10 text-[#a5690c]' 
              : 'bg-[#293417]/10 text-[#293417]'
          }`}>
            <ShieldAlert className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                Pipeline Triage &amp; Alert Center
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                critCount > 0 ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]' : 'bg-[#a5690c]/10 text-[#a5690c]'
              }`}>
                {critCount > 0 ? `${critCount} Critical` : `${warnCount} Warnings`}
              </span>
            </div>
            <p className="text-[11px] text-[#725a39] font-body mt-0.5">
              Automated diagnostics from pg_cron crawlers, Gemini rotation pool, and schema gates
            </p>
          </div>
        </div>

        {/* Severity Filter Tabs & Collapse Button */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <div className="inline-flex rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] p-0.5 text-xs">
            <button
              onClick={() => setFilterSeverity('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                filterSeverity === 'all' 
                  ? 'bg-white text-[#442a22] shadow-2xs font-bold' 
                  : 'text-[#725a39] hover:text-[#442a22]'
              }`}
            >
              All ({issues.length})
            </button>

            {critCount > 0 && (
              <button
                onClick={() => setFilterSeverity('critical')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  filterSeverity === 'critical' 
                    ? 'bg-[#ba1a1a] text-white shadow-2xs' 
                    : 'text-[#ba1a1a] hover:bg-[#ba1a1a]/10'
                }`}
              >
                <span>Critical</span>
                <span className="font-mono text-[10px] font-bold">({critCount})</span>
              </button>
            )}

            {warnCount > 0 && (
              <button
                onClick={() => setFilterSeverity('warning')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  filterSeverity === 'warning' 
                    ? 'bg-[#a5690c] text-white shadow-2xs' 
                    : 'text-[#a5690c] hover:bg-[#a5690c]/10'
                }`}
              >
                <span>Warnings</span>
                <span className="font-mono text-[10px] font-bold">({warnCount})</span>
              </button>
            )}

            {infoCount > 0 && (
              <button
                onClick={() => setFilterSeverity('info')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  filterSeverity === 'info' 
                    ? 'bg-[#293417] text-white shadow-2xs' 
                    : 'text-[#725a39] hover:bg-[#293417]/10'
                }`}
              >
                <span>Notes</span>
                <span className="font-mono text-[10px]">({infoCount})</span>
              </button>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg border border-[#e6e2d6] bg-white text-[#725a39] hover:text-[#442a22] hover:bg-[#fbf9f5] cursor-pointer transition-colors shadow-2xs"
            title={isExpanded ? 'Collapse triage center' : 'Expand triage center'}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Issue Cards Grid */}
      {isExpanded && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-[#fdfcfb]">
          {filteredIssues.map((issue) => {
            const isCrit = issue.severity === 'critical';
            const isWarn = issue.severity === 'warning';

            return (
              <div
                key={issue.id}
                className={`p-3.5 rounded-lg border transition-all duration-120 flex flex-col justify-between ${
                  isCrit
                    ? 'bg-white border-[#ba1a1a]/30 shadow-2xs hover:border-[#ba1a1a]/60'
                    : isWarn
                    ? 'bg-white border-[#a5690c]/30 shadow-2xs hover:border-[#a5690c]/60'
                    : 'bg-white border-[#e6e2d6] shadow-2xs hover:border-[#dad3c1]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider font-mono ${
                      isCrit
                        ? 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                        : isWarn
                        ? 'bg-[#a5690c]/10 text-[#a5690c]'
                        : 'bg-[#293417]/10 text-[#293417]'
                    }`}>
                      {isCrit ? <ShieldAlert className="w-2.5 h-2.5" /> : isWarn ? <AlertTriangle className="w-2.5 h-2.5" /> : <Info className="w-2.5 h-2.5" />}
                      <span>{issue.severity}</span>
                    </span>

                    <span className="text-[10px] font-mono text-[#725a39]">
                      #{issue.id.slice(0, 12)}
                    </span>
                  </div>

                  <h4 className="text-xs font-sans font-bold text-[#442a22] leading-snug">
                    {issue.title}
                  </h4>

                  <p className="text-[11px] text-[#725a39] font-body mt-1.5 leading-relaxed line-clamp-2">
                    {issue.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#e6e2d6]/70 flex items-center justify-between">
                  <span className="text-[10px] text-[#725a39] font-mono">
                    Impact: Pipeline
                  </span>

                  {issue.targetPage && (
                    <button
                      onClick={() => onNavigatePage(issue.targetPage!)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all duration-120 cursor-pointer ${
                        isCrit
                          ? 'bg-[#ba1a1a] hover:bg-[#961515] text-white shadow-2xs'
                          : isWarn
                          ? 'bg-[#a5690c] hover:bg-[#85540a] text-white shadow-2xs'
                          : 'bg-[#293417] hover:bg-[#1f2711] text-white shadow-2xs'
                      }`}
                    >
                      <span>{issue.actionLabel || 'Resolve'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
