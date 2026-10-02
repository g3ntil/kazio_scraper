import React from 'react';

export interface SparklineProps {
  data: number[];
  color?: string;
  fillColor?: string;
  height?: number;
  width?: number | string;
  strokeWidth?: number;
  showArea?: boolean;
  showPoints?: boolean;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#293417',
  fillColor,
  height = 36,
  width = '100%',
  strokeWidth = 2,
  showArea = true,
  showPoints = false,
  className = ''
}) => {
  if (!data || data.length < 2) {
    return (
      <div 
        style={{ height }} 
        className={`flex items-center justify-center text-[10px] text-[#725a39]/50 font-mono ${className}`}
      >
        —
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const paddingY = 4;
  const graphHeight = Math.max(height - paddingY * 2, 8);
  const graphWidth = 100; // normalized viewBox coordinates

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * graphWidth;
    const y = graphHeight - ((val - min) / range) * graphHeight + paddingY;
    return { x, y, val };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${graphWidth},${height} L 0,${height} Z`;

  const gradientId = React.useId();
  const actualFill = fillColor || `${color}15`;

  const lastPoint = points[points.length - 1];

  return (
    <div style={{ height }} className={`relative overflow-hidden ${className}`}>
      <svg
        viewBox={`0 0 ${graphWidth} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {showArea && (
          <path
            d={areaD}
            fill={`url(#${gradientId})`}
            style={{ fill: actualFill }}
          />
        )}

        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {showPoints && points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={1.5}
            fill={color}
          />
        ))}

        {/* Highlight latest point */}
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2.5}
          fill={color}
          className="animate-pulse"
        />
      </svg>
    </div>
  );
};
