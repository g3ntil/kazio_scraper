import React from 'react';
import { ErrorClassification } from '../../types/dashboard';
import { ShieldAlert, CheckCircle2, RotateCw } from 'lucide-react';

export interface HttpStatusWaterfallProps {
  errors: ErrorClassification;
  totalRequests: number;
  className?: string;
  onOpenAlerts?: () => void;
}

export const HttpStatusWaterfall: React.FC<HttpStatusWaterfallProps> = ({
  errors,
  totalRequests,
  className = '',
  onOpenAlerts
}) => {
  const safeTotal = Math.max(totalRequests, errors.total + 100, 1);
  const successCount = Math.max(safeTotal - errors.total, 0);

  const statuses = [
    { code: 'HTTP 200', name: 'Success / Extracted', count: successCount, color: '#16813d', bg: 'bg-[#16813d]' },
    { code: 'HTTP 429', name: 'Gemini Quota Exceeded', count: errors.rate429, color: '#a5690c', bg: 'bg-[#a5690c]' },
    { code: 'HTTP 503', name: 'Model Overloaded', count: errors.overload503, color: '#725a39', bg: 'bg-[#725a39]' },
    { code: 'POOL', name: 'Key Blocked / Cooling', count: errors.pool, color: '#ba1a1a', bg: 'bg-[#ba1a1a]' },
    { code: 'SHORT', name: 'Payload < 120 Chars', count: errors.short, color: '#9b8465', bg: 'bg-[#9b8465]' },
    { code: 'OTHER', name: 'Parse / Network Failure', count: errors.other, color: '#442a22', bg: 'bg-[#442a22]' },
  ];

  const successRate = ((successCount / safeTotal) * 100).toFixed(1);

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
              HTTP Status &amp; Error Budget Waterfall
            </h3>
            <span className="text-[10px] font-mono text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded font-bold">
              {successRate}% Success SLA
            </span>
          </div>
          <p className="text-[11px] text-[#725a39] font-body mt-0.5">
            Network and AI extraction status breakdown
          </p>
        </div>

        {onOpenAlerts && (
          <button
            onClick={onOpenAlerts}
            className="text-xs font-semibold text-[#ba1a1a] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Alerts Log ({errors.total})</span>
          </button>
        )}
      </div>

      {/* Stacked Waterfall Bar */}
      <div className="my-3">
        <div className="w-full h-3 rounded-full bg-[#f3efe6] flex overflow-hidden">
          {statuses.map((s) => {
            const widthPct = (s.count / safeTotal) * 100;
            if (widthPct <= 0) return null;
            return (
              <div
                key={s.code}
                style={{ width: `${Math.max(widthPct, 1)}%` }}
                className={`${s.bg} transition-all duration-300 hover:opacity-85`}
                title={`${s.code} ${s.name}: ${s.count.toLocaleString()} (${widthPct.toFixed(1)}%)`}
              />
            );
          })}
        </div>

        <div className="flex justify-between items-center text-[10px] text-[#725a39] font-mono mt-1.5">
          <span>0 requests</span>
          <span>{safeTotal.toLocaleString()} total pipeline calls</span>
        </div>
      </div>

      {/* Status Matrix Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
        {statuses.map((s) => {
          const pct = ((s.count / safeTotal) * 100).toFixed(1);
          return (
            <div key={s.code} className="p-2 rounded bg-[#fbf9f5] border border-[#e6e2d6] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="font-mono font-bold" style={{ color: s.color }}>
                  {s.code}
                </span>
                <span className="font-mono text-[#725a39] font-medium">
                  {pct}%
                </span>
              </div>
              <div className="font-mono font-bold text-sm text-[#442a22]">
                {s.count.toLocaleString()}
              </div>
              <div className="text-[9.5px] text-[#725a39] truncate mt-0.5">
                {s.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
