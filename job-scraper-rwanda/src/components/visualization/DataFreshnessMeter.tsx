import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export interface DataFreshnessMeterProps {
  sourceName: string;
  lastScrapedAt?: string | null;
  slaHours?: number;
  className?: string;
}

export const DataFreshnessMeter: React.FC<DataFreshnessMeterProps> = ({
  sourceName,
  lastScrapedAt,
  slaHours = 12,
  className = ''
}) => {
  if (!lastScrapedAt) {
    return (
      <div className={`p-3 bg-[#fbf9f5] rounded-lg border border-[#e6e2d6] text-xs text-[#725a39] flex items-center justify-between ${className}`}>
        <span className="font-semibold text-[#442a22]">{sourceName}</span>
        <span className="text-[10px] font-mono text-[#ba1a1a] bg-[#ba1a1a]/10 px-1.5 py-0.5 rounded">
          Never Synced
        </span>
      </div>
    );
  }

  const lastDate = new Date(lastScrapedAt);
  const diffHours = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
  const cappedDiffHours = Math.max(diffHours, 0);

  // SLA percentage (0% to 100% of the SLA budget used)
  const slaUsedPct = Math.min(Math.round((cappedDiffHours / slaHours) * 100), 100);

  let status: 'fresh' | 'warning' | 'stale' = 'fresh';
  let badgeClass = 'bg-[#16813d]/10 text-[#16813d] border-[#16813d]/20';
  let barColor = 'bg-[#16813d]';
  let Icon = CheckCircle2;

  if (cappedDiffHours > slaHours) {
    status = 'stale';
    badgeClass = 'bg-[#ba1a1a]/10 text-[#ba1a1a] border-[#ba1a1a]/20';
    barColor = 'bg-[#ba1a1a]';
    Icon = AlertCircle;
  } else if (cappedDiffHours > slaHours * 0.7) {
    status = 'warning';
    badgeClass = 'bg-[#a5690c]/10 text-[#a5690c] border-[#a5690c]/20';
    barColor = 'bg-[#a5690c]';
    Icon = AlertTriangle;
  }

  const formatElapsed = (hrs: number) => {
    if (hrs < 1) {
      const mins = Math.max(Math.round(hrs * 60), 1);
      return `${mins}m ago`;
    }
    return `${hrs.toFixed(1)}h ago`;
  };

  return (
    <div className={`p-3 bg-white rounded-lg border border-[#e6e2d6] shadow-xs ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-sans font-bold text-[#442a22] truncate">
          {sourceName}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}`}>
          <Icon className="w-3 h-3" />
          <span className="uppercase">{status}</span>
        </span>
      </div>

      {/* Progress track against SLA */}
      <div className="w-full bg-[#f3efe6] h-1.5 rounded-full overflow-hidden mb-2">
        <div 
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${slaUsedPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-[#725a39] font-body">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-[#725a39]/70" />
          <span>Last sync: {formatElapsed(cappedDiffHours)}</span>
        </span>
        <span className="font-mono text-[10px]">
          SLA {slaHours}h
        </span>
      </div>
    </div>
  );
};
