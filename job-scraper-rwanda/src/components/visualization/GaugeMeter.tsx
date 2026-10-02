import React from 'react';

export interface GaugeMeterProps {
  value: number;
  max?: number;
  label?: string;
  subLabel?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  unit?: string;
  className?: string;
}

export const GaugeMeter: React.FC<GaugeMeterProps> = ({
  value,
  max = 100,
  label,
  subLabel,
  size = 120,
  strokeWidth = 10,
  color,
  trackColor = '#f3efe6',
  unit = '%',
  className = ''
}) => {
  const percentage = Math.min(Math.max(Math.round((value / max) * 100), 0), 100);
  
  // Semantic color fallback based on percentage
  const resolvedColor = color || (
    percentage > 85 ? '#ba1a1a' : percentage > 65 ? '#a5690c' : '#16813d'
  );

  const radius = (size - strokeWidth) / 2;
  // Use a 240 degree arc for gauge look
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Progress Indicator */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={resolvedColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Central Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-mono font-bold text-[#442a22] leading-none">
            {value.toLocaleString()}
            {unit && <span className="text-xs font-normal text-[#725a39] ml-0.5">{unit}</span>}
          </span>
          {subLabel && (
            <span className="text-[10px] text-[#725a39] font-body mt-0.5 max-w-[80px] truncate">
              {subLabel}
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className="text-xs font-sans font-semibold text-[#442a22] mt-2 text-center">
          {label}
        </span>
      )}
    </div>
  );
};
