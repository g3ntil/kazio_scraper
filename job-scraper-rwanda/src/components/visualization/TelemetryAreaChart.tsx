import React, { useState } from 'react';

export interface TelemetrySeries {
  name: string;
  data: number[];
  color: string;
}

export interface TelemetryAreaChartProps {
  series: TelemetrySeries[];
  categories: string[];
  height?: number;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const TelemetryAreaChart: React.FC<TelemetryAreaChartProps> = ({
  series,
  categories,
  height = 200,
  title,
  subtitle,
  className = ''
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!series || series.length === 0 || !categories || categories.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-[#725a39]">
        No telemetry time series data available
      </div>
    );
  }

  // Calculate global max
  const allValues = series.flatMap(s => s.data);
  const max = Math.max(...allValues, 10);
  const min = 0;
  const range = max - min;

  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 28;

  const viewBoxWidth = 600;
  const viewBoxHeight = height;

  const graphWidth = viewBoxWidth - paddingLeft - paddingRight;
  const graphHeight = viewBoxHeight - paddingTop - paddingBottom;

  const numPoints = categories.length;

  const getCoordinates = (val: number, idx: number) => {
    const x = paddingLeft + (idx / Math.max(numPoints - 1, 1)) * graphWidth;
    const y = paddingTop + graphHeight - ((val - min) / range) * graphHeight;
    return { x, y };
  };

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs ${className}`}>
      {(title || subtitle) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            {title && (
              <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-[#725a39] font-body mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3">
            {series.map(s => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs text-[#725a39]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SVG Container */}
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-full overflow-visible"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingTop + graphHeight * ratio;
            const labelVal = Math.round(max * (1 - ratio));
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={viewBoxWidth - paddingRight}
                  y2={y}
                  stroke="#e6e2d6"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-[#725a39] font-mono"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Series Paths */}
          {series.map((s, sIdx) => {
            const points = s.data.map((val, idx) => getCoordinates(val, idx));
            const pathD = points.reduce((acc, pt, idx) => {
              return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
            }, '');
            const areaD = `${pathD} L ${points[points.length - 1].x},${paddingTop + graphHeight} L ${points[0].x},${paddingTop + graphHeight} Z`;
            const gradId = `area-grad-${sIdx}`;

            return (
              <g key={s.name}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <path d={areaD} fill={`url(#${gradId})`} />
                <path
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {points.map((pt, pIdx) => (
                  <circle
                    key={pIdx}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoverIndex === pIdx ? 4 : 2}
                    fill={s.color}
                    className="transition-all duration-120"
                  />
                ))}
              </g>
            );
          })}

          {/* Category Axis Labels */}
          {categories.map((cat, idx) => {
            const x = paddingLeft + (idx / Math.max(numPoints - 1, 1)) * graphWidth;
            return (
              <text
                key={cat}
                x={x}
                y={viewBoxHeight - 6}
                textAnchor="middle"
                className={`text-[9.5px] font-mono ${
                  hoverIndex === idx ? 'fill-[#442a22] font-bold' : 'fill-[#725a39]'
                }`}
              >
                {cat}
              </text>
            );
          })}

          {/* Interactive Scrubbing Columns */}
          {categories.map((_, idx) => {
            const x = paddingLeft + (idx / Math.max(numPoints - 1, 1)) * graphWidth;
            const colWidth = graphWidth / Math.max(numPoints - 1, 1);
            return (
              <rect
                key={idx}
                x={x - colWidth / 2}
                y={paddingTop}
                width={colWidth}
                height={graphHeight}
                fill="transparent"
                className="cursor-pointer hover:fill-[#293417]/5 transition-colors"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoverIndex !== null && (
          <div 
            className="absolute top-2 right-4 bg-[#141416] text-[#fbf9f5] px-2.5 py-1.5 rounded-md text-[11px] font-mono shadow-md z-20 pointer-events-none"
          >
            <div className="font-bold text-zinc-300 pb-0.5 border-b border-white/10 mb-1">
              {categories[hoverIndex]}
            </div>
            {series.map(s => (
              <div key={s.name} className="flex items-center justify-between gap-3 text-[10px]">
                <span style={{ color: s.color }}>{s.name}:</span>
                <span className="font-bold text-white">{s.data[hoverIndex]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
