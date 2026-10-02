import React, { useState } from 'react';
import { SourceId } from '../../types/dashboard';

export interface SourceSlice {
  id: SourceId;
  name: string;
  count: number;
  color: string;
}

export interface SourceDistributionDonutProps {
  sources: SourceSlice[];
  totalJobs: number;
  height?: number;
  className?: string;
  onSelectSource?: (id: SourceId) => void;
}

export const SourceDistributionDonut: React.FC<SourceDistributionDonutProps> = ({
  sources,
  totalJobs,
  height = 240,
  className = '',
  onSelectSource
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const size = 180;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const validTotal = Math.max(totalJobs, 1);

  // Compute angles and stroke offsets
  let accumulatedAngle = 0;
  const slices = sources.map((s, idx) => {
    const pct = s.count / validTotal;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedAngle * circumference;
    accumulatedAngle += pct;
    return {
      ...s,
      pct: Math.round(pct * 100),
      strokeDasharray,
      strokeDashoffset,
      idx
    };
  });

  const activeSlice = hoveredIndex !== null ? slices[hoveredIndex] : null;

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
            Source Share &amp; Volume Split
          </h3>
          <p className="text-[11px] text-[#725a39] font-body">
            Contribution percentage per Rwandan portal
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded">
          {sources.length} Portals
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2">
        {/* SVG Donut */}
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#f3efe6"
              strokeWidth={strokeWidth}
            />

            {/* Slices */}
            {slices.map((slice) => {
              const isHovered = hoveredIndex === slice.idx;
              return (
                <circle
                  key={slice.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={slice.strokeDasharray}
                  strokeDashoffset={slice.strokeDashoffset}
                  strokeLinecap="butt"
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(slice.idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onSelectSource && onSelectSource(slice.id)}
                />
              );
            })}
          </svg>

          {/* Center Text HUD */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
            <span className="text-[10px] text-[#725a39] uppercase tracking-wider font-semibold font-mono">
              {activeSlice ? activeSlice.name : 'Total Central'}
            </span>
            <span className="text-xl font-mono font-extrabold text-[#442a22] leading-tight">
              {activeSlice ? activeSlice.count.toLocaleString() : totalJobs.toLocaleString()}
            </span>
            <span className="text-[10.5px] font-mono font-bold text-[#16813d]">
              {activeSlice ? `${activeSlice.pct}% share` : '100% aggregated'}
            </span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex-1 w-full space-y-2">
          {slices.map((slice) => {
            const isHovered = hoveredIndex === slice.idx;
            return (
              <div
                key={slice.id}
                onMouseEnter={() => setHoveredIndex(slice.idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onSelectSource && onSelectSource(slice.id)}
                className={`p-2 rounded-md transition-all duration-120 cursor-pointer flex items-center justify-between text-xs ${
                  isHovered ? 'bg-[#fbf9f5] border border-[#dad3c1] shadow-2xs' : 'hover:bg-[#fbf9f5]/60'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="font-medium text-[#442a22] truncate">
                    {slice.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono flex-shrink-0">
                  <span className="text-[#725a39]">
                    {slice.count.toLocaleString()}
                  </span>
                  <span className="font-bold text-[#442a22] min-w-[32px] text-right">
                    {slice.pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
