import React from 'react';

export interface StatusPulseBadgeProps {
  status: 'nominal' | 'running' | 'warning' | 'critical' | 'offline';
  label?: string;
  className?: string;
}

export const StatusPulseBadge: React.FC<StatusPulseBadgeProps> = ({
  status,
  label,
  className = ''
}) => {
  let dotColor = 'bg-[#16813d]';
  let pulseRingColor = 'bg-[#16813d]/30';
  let badgeBg = 'bg-[#16813d]/10 text-[#16813d] border-[#16813d]/20';
  let defaultLabel = 'Nominal';

  switch (status) {
    case 'running':
      dotColor = 'bg-[#293417]';
      pulseRingColor = 'bg-[#293417]/30';
      badgeBg = 'bg-[#293417]/10 text-[#293417] border-[#293417]/20';
      defaultLabel = 'Scraping';
      break;
    case 'warning':
      dotColor = 'bg-[#a5690c]';
      pulseRingColor = 'bg-[#a5690c]/30';
      badgeBg = 'bg-[#a5690c]/10 text-[#a5690c] border-[#a5690c]/20';
      defaultLabel = 'Degraded';
      break;
    case 'critical':
      dotColor = 'bg-[#ba1a1a]';
      pulseRingColor = 'bg-[#ba1a1a]/30';
      badgeBg = 'bg-[#ba1a1a]/10 text-[#ba1a1a] border-[#ba1a1a]/20';
      defaultLabel = 'Critical';
      break;
    case 'offline':
      dotColor = 'bg-[#725a39]';
      pulseRingColor = 'bg-[#725a39]/20';
      badgeBg = 'bg-[#725a39]/10 text-[#725a39] border-[#725a39]/20';
      defaultLabel = 'Offline';
      break;
    case 'nominal':
    default:
      dotColor = 'bg-[#16813d]';
      pulseRingColor = 'bg-[#16813d]/30';
      badgeBg = 'bg-[#16813d]/10 text-[#16813d] border-[#16813d]/20';
      defaultLabel = 'Nominal';
  }

  const text = label || defaultLabel;

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeBg} ${className}`}
    >
      <span className="relative flex h-2 w-2">
        {(status === 'running' || status === 'critical') && (
          <span 
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseRingColor}`} 
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      <span>{text}</span>
    </span>
  );
};
