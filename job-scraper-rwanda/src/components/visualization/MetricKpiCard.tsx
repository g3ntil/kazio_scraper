import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Sparkline } from './Sparkline';

export interface MetricKpiCardProps {
  title: string;
  value: string | number;
  sublabel?: string;
  delta?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  sparklineData?: number[];
  sparklineColor?: string;
  valueColor?: string;
  className?: string;
  onClick?: () => void;
}

export const MetricKpiCard: React.FC<MetricKpiCardProps> = ({
  title,
  value,
  sublabel,
  delta,
  icon,
  sparklineData,
  sparklineColor,
  valueColor = 'text-[#442a22]',
  className = '',
  onClick
}) => {
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`bg-white p-4.5 rounded-lg border border-[#e6e2d6] shadow-xs flex flex-col justify-between transition-all duration-120 group ${
        isClickable ? 'cursor-pointer hover:border-[#dad3c1] hover:-translate-y-0.5 hover:shadow-sm' : ''
      } ${className}`}
    >
      <div>
        {/* Header row: Title & Icon */}
        <div className="flex items-center justify-between text-xs text-[#725a39] mb-1.5">
          <span className="font-bold uppercase tracking-wider text-[10.5px]">
            {title}
          </span>
          {icon && (
            <div className="text-[#725a39]/70 group-hover:text-[#442a22] transition-colors">
              {icon}
            </div>
          )}
        </div>

        {/* Main Monospace Value */}
        <div className="flex items-baseline justify-between gap-2">
          <div className={`text-2xl font-mono font-bold ${valueColor}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>

          {/* Delta Pill */}
          {delta && (
            <div
              className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                delta.isPositive
                  ? 'bg-[#16813d]/10 text-[#16813d]'
                  : 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
              }`}
            >
              {delta.isPositive ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>{delta.value}</span>
            </div>
          )}
        </div>
      </div>

      {/* Optional Sparkline Slot */}
      {sparklineData && sparklineData.length > 1 && (
        <div className="my-2 pt-1">
          <Sparkline
            data={sparklineData}
            color={sparklineColor || (delta?.isPositive ? '#16813d' : '#293417')}
            height={28}
            showArea
          />
        </div>
      )}

      {/* Sublabel / Footnote */}
      {(sublabel || delta?.label) && (
        <p className="text-[11px] text-[#725a39] mt-2 font-body leading-tight truncate">
          {delta?.label ? `${delta.label} · ` : ''}{sublabel}
        </p>
      )}
    </div>
  );
};
