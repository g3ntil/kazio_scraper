import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { FieldCompleteness } from '../../types/dashboard';

export interface DataQualityRadarMatrixProps {
  fill: FieldCompleteness;
  totalActive: number;
  className?: string;
  onOpenQualityStudio?: () => void;
}

export const DataQualityRadarMatrix: React.FC<DataQualityRadarMatrixProps> = ({
  fill,
  totalActive,
  className = '',
  onOpenQualityStudio
}) => {
  const denom = Math.max(totalActive, 1);

  const fields = [
    { key: 'deadline', label: 'Deadline Parsed', count: fill.deadline, target: 90 },
    { key: 'ai_summary', label: 'AI Summary Generated', count: fill.ai_summary, target: 85 },
    { key: 'industry', label: 'Industry Classified', count: fill.industry, target: 80 },
    { key: 'job_function', label: 'Function Mapped', count: fill.job_function, target: 80 },
    { key: 'experience', label: 'Experience Tier', count: fill.experience, target: 75 },
    { key: 'skills_t1', label: 'Skills Extracted', count: fill.skills_t1, target: 70 },
    { key: 'salary', label: 'Salary Range Disclosed', count: fill.salary, target: 40 },
    { key: 'company_logo', label: 'Company Logo URL', count: fill.company_logo, target: 50 },
  ];

  const overallHealth = Math.round(
    fields.reduce((acc, f) => acc + (f.count / denom) * 100, 0) / fields.length
  );

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
              Data Quality &amp; Schema Completeness
            </h3>
            <span className="text-[10px] font-mono text-[#16813d] bg-[#16813d]/10 px-1.5 py-0.5 rounded font-bold">
              {overallHealth}% Index
            </span>
          </div>
          <p className="text-[11px] text-[#725a39] font-body mt-0.5">
            Extraction coverage across 8 career matching attributes
          </p>
        </div>

        {onOpenQualityStudio && (
          <button
            onClick={onOpenQualityStudio}
            className="text-xs font-semibold text-[#293417] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Quality Studio</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Field Completeness Bars Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 my-2">
        {fields.map((f) => {
          const pct = Math.min(Math.round((f.count / denom) * 100), 100);
          const meetsTarget = pct >= f.target;

          return (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#442a22] font-medium truncate flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      meetsTarget ? 'bg-[#16813d]' : 'bg-[#a5690c]'
                    }`}
                  />
                  <span className="truncate">{f.label}</span>
                </span>
                <span className="font-mono text-[11px] font-bold text-[#442a22]">
                  {pct}%{' '}
                  <span className="font-normal text-[10px] text-[#725a39]">
                    ({f.count.toLocaleString()})
                  </span>
                </span>
              </div>

              {/* Progress bar with target notch */}
              <div className="relative w-full bg-[#f3efe6] h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    meetsTarget ? 'bg-[#16813d]' : pct > 40 ? 'bg-[#a5690c]' : 'bg-[#ba1a1a]'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-3 mt-2 border-t border-[#e6e2d6]/70 flex items-center justify-between text-xs text-[#725a39]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#16813d]" />
          <span>High-confidence attributes verified for Kio semantic search</span>
        </span>
        <span className="font-mono text-[11px] font-semibold text-[#16813d]">
          {fields.filter(f => (f.count / denom) * 100 >= f.target).length} / {fields.length} Passed SLA
        </span>
      </div>
    </div>
  );
};
