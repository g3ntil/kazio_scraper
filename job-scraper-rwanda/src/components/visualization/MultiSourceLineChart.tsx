import React, { useState } from 'react';
import { TrendDay, SourceId } from '../../types/dashboard';
import { TrendingUp, Calendar, Zap, Layers, Sparkles } from 'lucide-react';

export interface SourceLineConfig {
  id: SourceId;
  name: string;
  color: string;
  data: TrendDay[];
}

export interface MultiSourceLineChartProps {
  sourcesData: SourceLineConfig[];
  height?: number;
  className?: string;
  onSourceClick?: (id: SourceId) => void;
}

export const MultiSourceLineChart: React.FC<MultiSourceLineChartProps> = ({
  sourcesData,
  height = 260,
  className = '',
  onSourceClick
}) => {
  // Active enabled lines
  const [activeSources, setActiveSources] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sourcesData.forEach(s => { initial[s.id] = true; });
    return initial;
  });

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [curveType, setCurveType] = useState<'smooth' | 'linear'>('smooth');
  const [timeRange, setTimeRange] = useState<'7d' | '14d'>('7d');

  const toggleSource = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSources(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const isolateSource = (id: SourceId) => {
    setActiveSources(() => {
      const updated: Record<string, boolean> = {};
      sourcesData.forEach(s => { updated[s.id] = s.id === id; });
      return updated;
    });
    if (onSourceClick) onSourceClick(id);
  };

  const showAllSources = () => {
    const updated: Record<string, boolean> = {};
    sourcesData.forEach(s => { updated[s.id] = true; });
    setActiveSources(updated);
  };

  // Find all distinct days across sources
  const allDays: string[] = [];
  sourcesData.forEach(s => {
    s.data.forEach(d => {
      if (!allDays.includes(d.day)) allDays.push(d.day);
    });
  });
  allDays.sort();

  // If 7d is selected, take the last 7 days; otherwise all days
  const days = timeRange === '7d' ? allDays.slice(-7) : allDays;

  if (days.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-[#725a39]">
        No daily ingestion trend data available
      </div>
    );
  }

  // Filter sources that are enabled
  const visibleSources = sourcesData.filter(s => activeSources[s.id]);

  // Find max value across all visible sources
  let maxCount = 5;
  let totalVolume = 0;
  let peakDay = { day: days[0], count: 0 };

  days.forEach(day => {
    let dayTotal = 0;
    visibleSources.forEach(s => {
      const point = s.data.find(d => d.day === day);
      const val = point ? point.count : 0;
      dayTotal += val;
      if (val > maxCount) maxCount = val;
    });
    totalVolume += dayTotal;
    if (dayTotal > peakDay.count) {
      peakDay = { day, count: dayTotal };
    }
  });

  const dailyAverage = Math.round(totalVolume / Math.max(days.length, 1));

  // Round max count up to a readable grid unit
  const yTicksCount = 4;
  const roundedMax = Math.ceil(maxCount / 5) * 5 || 5;

  const paddingLeft = 38;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 34;

  const viewBoxWidth = 660;
  const viewBoxHeight = height;

  const graphWidth = viewBoxWidth - paddingLeft - paddingRight;
  const graphHeight = viewBoxHeight - paddingTop - paddingBottom;

  const getCoordinates = (dayIndex: number, count: number) => {
    const x = paddingLeft + (dayIndex / Math.max(days.length - 1, 1)) * graphWidth;
    const y = paddingTop + graphHeight - (count / roundedMax) * graphHeight;
    return { x, y };
  };

  const formatDayLabel = (isoDate: string) => {
    try {
      const parts = isoDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      }
    } catch {
      // fallback
    }
    return isoDate.slice(5);
  };

  // Spline builder (Catmull-Rom or cubic Bezier)
  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return '';
    if (curveType === 'linear' || pts.length === 2) {
      return pts.reduce((acc, pt, idx) => (idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`), '');
    }

    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs ${className}`}>
      {/* Header with Title and Mode Switchers */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
              Multi-Source Daily Ingestion Rhythm
            </h3>
            <span className="text-[10px] font-mono text-[#16813d] bg-[#16813d]/10 px-1.5 py-0.5 rounded font-bold">
              Image 1 Benchmark
            </span>
            <span className="text-[10px] font-mono text-[#725a39] bg-[#f3efe6] px-1.5 py-0.5 rounded">
              Avg {dailyAverage}/day
            </span>
          </div>
          <p className="text-[11px] text-[#725a39] font-body mt-0.5">
            Compare harvesting velocity and spikes across 5 Rwandan job portals
          </p>
        </div>

        {/* Controls: 7D/14D Switcher + Smooth/Linear */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] p-0.5 text-xs">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                timeRange === '7d' ? 'bg-white text-[#442a22] shadow-2xs font-bold' : 'text-[#725a39]'
              }`}
            >
              Last 7D
            </button>
            <button
              onClick={() => setTimeRange('14d')}
              className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                timeRange === '14d' ? 'bg-white text-[#442a22] shadow-2xs font-bold' : 'text-[#725a39]'
              }`}
            >
              All Window
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-[#e6e2d6] bg-[#fbf9f5] p-0.5 text-xs">
            <button
              onClick={() => setCurveType('smooth')}
              className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                curveType === 'smooth' ? 'bg-white text-[#442a22] shadow-2xs font-bold' : 'text-[#725a39]'
              }`}
            >
              Spline
            </button>
            <button
              onClick={() => setCurveType('linear')}
              className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                curveType === 'linear' ? 'bg-white text-[#442a22] shadow-2xs font-bold' : 'text-[#725a39]'
              }`}
            >
              Linear
            </button>
          </div>
        </div>
      </div>

      {/* Source Toggle Pills */}
      <div className="flex items-center gap-1.5 flex-wrap pb-3 mb-2 border-b border-[#e6e2d6]/60">
        <span className="text-[11px] font-bold text-[#725a39] uppercase tracking-wider mr-1">
          Portals:
        </span>
        {sourcesData.map(source => {
          const isEnabled = activeSources[source.id];
          return (
            <button
              key={source.id}
              onClick={(e) => toggleSource(source.id, e)}
              onDoubleClick={() => isolateSource(source.id)}
              title="Click to toggle, double-click to isolate"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all duration-120 cursor-pointer ${
                isEnabled
                  ? 'bg-[#fbf9f5] border-[#dad3c1] text-[#442a22] shadow-2xs font-semibold'
                  : 'bg-transparent border-transparent text-[#725a39]/40 line-through'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full transition-opacity"
                style={{
                  backgroundColor: source.color,
                  opacity: isEnabled ? 1 : 0.25
                }}
              />
              <span className="truncate">{source.name}</span>
            </button>
          );
        })}

        <button
          onClick={showAllSources}
          className="text-[10px] text-[#725a39] hover:text-[#442a22] underline font-mono ml-auto cursor-pointer"
        >
          Reset All
        </button>
      </div>

      {/* SVG Canvas */}
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-full overflow-visible"
        >
          {/* Subtle Grid lines and Y-Axis Ticks */}
          {Array.from({ length: yTicksCount + 1 }).map((_, i) => {
            const ratio = i / yTicksCount;
            const y = paddingTop + graphHeight * ratio;
            const value = Math.round(roundedMax * (1 - ratio));

            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={viewBoxWidth - paddingRight}
                  y2={y}
                  stroke="#e6e2d6"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] fill-[#725a39] font-mono"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {/* Active Vertical Scrubber Bar on Hover */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={paddingLeft + (hoverIndex / Math.max(days.length - 1, 1)) * graphWidth}
                y1={paddingTop}
                x2={paddingLeft + (hoverIndex / Math.max(days.length - 1, 1)) * graphWidth}
                y2={paddingTop + graphHeight}
                stroke="#293417"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                className="transition-all duration-75"
              />
            </g>
          )}

          {/* Render Multi-Lines */}
          {visibleSources.map((source) => {
            const dataMap: Record<string, number> = {};
            source.data.forEach(d => { dataMap[d.day] = d.count; });

            const points = days.map((day, idx) => {
              const count = dataMap[day] || 0;
              return getCoordinates(idx, count);
            });

            const pathD = buildSmoothPath(points);

            return (
              <g key={source.id} className="transition-opacity duration-150">
                {/* Glow backdrop path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={source.color}
                  strokeWidth={5}
                  strokeOpacity={0.12}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Main line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={source.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Point Circles */}
                {points.map((pt, pIdx) => {
                  const isHovered = hoverIndex === pIdx;
                  return (
                    <circle
                      key={pIdx}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5.5 : 3.5}
                      fill={isHovered ? '#ffffff' : source.color}
                      stroke={source.color}
                      strokeWidth={isHovered ? 3 : 1.5}
                      className="transition-all duration-120 cursor-pointer"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* X-Axis Category Labels */}
          {days.map((day, idx) => {
            const x = paddingLeft + (idx / Math.max(days.length - 1, 1)) * graphWidth;
            const isHovered = hoverIndex === idx;

            return (
              <text
                key={day}
                x={x}
                y={viewBoxHeight - 8}
                textAnchor="middle"
                className={`text-[9.5px] font-mono transition-colors ${
                  isHovered ? 'fill-[#442a22] font-bold text-[10.5px]' : 'fill-[#725a39]'
                }`}
              >
                {formatDayLabel(day)}
              </text>
            );
          })}

          {/* Invisible Overlay Columns for Easy Hover Scrubbing */}
          {days.map((_, idx) => {
            const x = paddingLeft + (idx / Math.max(days.length - 1, 1)) * graphWidth;
            const colWidth = graphWidth / Math.max(days.length - 1, 1);

            return (
              <rect
                key={idx}
                x={x - colWidth / 2}
                y={paddingTop}
                width={colWidth}
                height={graphHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>

        {/* Floating Tooltip HUD Card */}
        {hoverIndex !== null && (
          <div
            className="absolute top-2 right-4 bg-[#141416] text-[#fbf9f5] p-3.5 rounded-lg border border-[#2A2A2E] text-xs font-mono shadow-2xl z-20 pointer-events-none min-w-[210px]"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-2">
              <span className="font-bold text-zinc-300">
                {formatDayLabel(days[hoverIndex])}
              </span>
              <span className="text-[10px] text-zinc-500">
                {days[hoverIndex]}
              </span>
            </div>

            <div className="space-y-1.5">
              {visibleSources.map(s => {
                const dayCount = s.data.find(d => d.day === days[hoverIndex])?.count || 0;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5 truncate text-zinc-300">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="font-bold font-mono text-white">
                      +{dayCount}
                    </span>
                  </div>
                );
              })}

              <div className="pt-2 mt-2 border-t border-white/10 flex justify-between text-[11.5px] font-bold">
                <span className="text-zinc-400">Total Inflow:</span>
                <span className="text-[#3FCB7A]">
                  +{visibleSources.reduce((sum, s) => {
                    const c = s.data.find(d => d.day === days[hoverIndex])?.count || 0;
                    return sum + c;
                  }, 0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
