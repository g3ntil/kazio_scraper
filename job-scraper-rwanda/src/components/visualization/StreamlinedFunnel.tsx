import React, { useState } from 'react';
import { 
  Globe, 
  Layers, 
  Filter, 
  Sparkles, 
  CheckCircle2, 
  ExternalLink,
  ChevronRight,
  TrendingDown,
  ArrowUpRight
} from 'lucide-react';

export interface FunnelStageData {
  id: string;
  name: string;
  count: number;
  sublabel: string;
  dropCount?: number;
  dropReason?: string;
  badge?: string;
  actionLabel?: string;
}

export interface StreamlinedFunnelProps {
  stages: FunnelStageData[];
  title?: string;
  subtitle?: string;
  className?: string;
  onStageSelect?: (stageId: string) => void;
}

export const StreamlinedFunnel: React.FC<StreamlinedFunnelProps> = ({
  stages,
  title = 'Job Progression Funnel',
  subtitle = 'Continuous pipeline telemetry: Crawled raw buffer → Staging tables → Gatekeeper → AI Enrichment → Central DB',
  className = '',
  onStageSelect
}) => {
  // Default active stage to Gate Cleaned (#3) or AI Enriched (#4) to mirror Image 2
  const [activeStageId, setActiveStageId] = useState<string>(stages[2]?.id || stages[0]?.id || '');

  const baseCount = Math.max(stages[0]?.count || 1, 1);

  // SVG dimensions for the tapered ribbon bridges
  const svgHeight = 110;
  const colWidth = 100; // normalized unit per column
  const totalStages = stages.length;

  return (
    <div className={`bg-white p-6 rounded-lg border border-[#e6e2d6] shadow-xs ${className}`}>
      {/* Header matching Image 2 Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-sans font-bold text-[#442a22]">
              {title}
            </h3>
            <span className="text-[10px] font-mono text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded font-bold">
              Image 2 Benchmark
            </span>
          </div>
          <p className="text-xs text-[#725a39] font-body mt-0.5">
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#725a39]">Overall Pipeline Retention:</span>
          <span className="text-xs font-mono font-bold text-[#16813d] bg-[#16813d]/10 px-2 py-0.5 rounded">
            {Math.round(((stages[stages.length - 1]?.count || 0) / baseCount) * 100)}%
          </span>
        </div>
      </div>

      {/* Stage Cards Row (Matching Image 2 Layout) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
        {stages.map((stage, idx) => {
          const isSelected = activeStageId === stage.id;
          const pct = Math.round((stage.count / baseCount) * 100);

          return (
            <div
              key={stage.id}
              onClick={() => {
                setActiveStageId(stage.id);
                if (onStageSelect) onStageSelect(stage.id);
              }}
              className={`p-4 rounded-lg transition-all duration-150 cursor-pointer flex flex-col justify-between border relative ${
                isSelected
                  ? 'bg-[#293417] text-[#fbf9f5] border-[#293417] shadow-md -translate-y-1'
                  : 'bg-[#fcfbfa] text-[#442a22] border-[#e6e2d6] hover:border-[#dad3c1] hover:bg-white hover:-translate-y-0.5'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                    isSelected ? 'text-[#dad3c1]' : 'text-[#725a39]'
                  }`}>
                    {stage.name}
                  </span>
                  <span className={`text-[10.5px] font-mono font-bold ${
                    isSelected ? 'text-[#3FCB7A]' : 'text-[#16813d]'
                  }`}>
                    {pct}%
                  </span>
                </div>

                <div className={`text-2xl sm:text-3xl font-mono font-bold ${
                  isSelected ? 'text-white' : 'text-[#442a22]'
                }`}>
                  {stage.count.toLocaleString()}
                </div>

                <div className={`text-[11px] font-body mt-1 truncate ${
                  isSelected ? 'text-[#dad3c1]' : 'text-[#725a39]'
                }`}>
                  {stage.sublabel}
                </div>
              </div>

              {/* Action / Explore Tag matching Image 2 */}
              <div className="mt-3 pt-2.5 border-t border-current/15 flex items-center justify-between text-xs">
                {stage.dropCount !== undefined && stage.dropCount > 0 ? (
                  <span className={`font-mono text-[10px] flex items-center gap-1 ${
                    isSelected ? 'text-amber-300' : 'text-[#a5690c]'
                  }`}>
                    <TrendingDown className="w-3 h-3" />
                    <span>-{stage.dropCount} {stage.dropReason || 'drop'}</span>
                  </span>
                ) : (
                  <span className={`text-[10px] font-medium ${isSelected ? 'text-emerald-300' : 'text-[#16813d]'}`}>
                    Full yield
                  </span>
                )}

                {stage.actionLabel && (
                  <span className={`font-semibold text-[11px] flex items-center gap-0.5 ${
                    isSelected ? 'text-white underline' : 'text-[#293417] hover:underline'
                  }`}>
                    <span>{stage.actionLabel}</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Horizontal Tapered Ribbon Flow (Matching Image 2 Visual Graphic) */}
      <div className="relative w-full overflow-hidden pt-2 pb-1">
        <svg
          viewBox={`0 0 ${totalStages * colWidth} ${svgHeight}`}
          className="w-full h-24 overflow-visible"
          preserveAspectRatio="none"
        >
          {stages.map((stage, idx) => {
            if (idx === stages.length - 1) return null;

            const nextStage = stages[idx + 1];
            const currentPct = Math.max(stage.count / baseCount, 0.18);
            const nextPct = Math.max(nextStage.count / baseCount, 0.12);

            // Compute heights of ribbon at start and end
            const startRibbonHeight = currentPct * (svgHeight - 20);
            const endRibbonHeight = nextPct * (svgHeight - 20);

            const startYTop = (svgHeight - startRibbonHeight) / 2;
            const startYBottom = startYTop + startRibbonHeight;

            const endYTop = (svgHeight - endRibbonHeight) / 2;
            const endYBottom = endYTop + endRibbonHeight;

            const startX = idx * colWidth + colWidth * 0.85;
            const endX = (idx + 1) * colWidth + colWidth * 0.15;
            const midX = (startX + endX) / 2;

            // Smooth cubic bezier ribbon path
            const ribbonPath = `
              M ${startX},${startYTop}
              C ${midX},${startYTop} ${midX},${endYTop} ${endX},${endYTop}
              L ${endX},${endYBottom}
              C ${midX},${endYBottom} ${midX},${startYBottom} ${startX},${startYBottom}
              Z
            `;

            // Block for current stage
            const blockX = idx * colWidth + colWidth * 0.15;
            const blockWidth = colWidth * 0.7;

            // Color gradient across stages (Warm Clay → Sage → Emerald)
            const colors = [
              '#968168', // Stage 1
              '#725a39', // Stage 2
              '#442a22', // Stage 3
              '#293417', // Stage 4
              '#16813d'  // Stage 5
            ];

            const currentColor = colors[idx % colors.length];
            const nextColor = colors[(idx + 1) % colors.length];
            const isCurrentSelected = activeStageId === stage.id;

            const gradId = `funnel-grad-${idx}`;

            return (
              <g key={stage.id}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={currentColor} stopOpacity={isCurrentSelected ? 0.9 : 0.45} />
                    <stop offset="100%" stopColor={nextColor} stopOpacity={activeStageId === nextStage.id ? 0.9 : 0.55} />
                  </linearGradient>
                </defs>

                {/* Stage Solid Block */}
                <rect
                  x={blockX}
                  y={startYTop}
                  width={blockWidth}
                  height={startRibbonHeight}
                  fill={currentColor}
                  opacity={isCurrentSelected ? 0.85 : 0.5}
                  rx={4}
                  className="transition-all duration-200"
                />

                {/* Tapered Connecting Ribbon */}
                <path
                  d={ribbonPath}
                  fill={`url(#${gradId})`}
                  className="transition-all duration-300"
                />

                {/* Step Transition Retention Percentage */}
                <text
                  x={midX}
                  y={endYTop - 6}
                  textAnchor="middle"
                  className="text-[9.5px] font-mono fill-[#725a39] font-bold"
                >
                  {Math.round((nextStage.count / Math.max(stage.count, 1)) * 100)}%
                </text>
              </g>
            );
          })}

          {/* Final Stage Terminal Block */}
          {(() => {
            const lastStage = stages[stages.length - 1];
            const lastIdx = stages.length - 1;
            const lastPct = Math.max(lastStage.count / baseCount, 0.12);
            const ribbonHeight = lastPct * (svgHeight - 20);
            const yTop = (svgHeight - ribbonHeight) / 2;
            const blockX = lastIdx * colWidth + colWidth * 0.15;
            const blockWidth = colWidth * 0.7;

            return (
              <rect
                x={blockX}
                y={yTop}
                width={blockWidth}
                height={ribbonHeight}
                fill="#16813d"
                opacity={activeStageId === lastStage.id ? 0.95 : 0.75}
                rx={4}
              />
            );
          })()}
        </svg>
      </div>

      {/* Footer Summary note */}
      <div className="pt-3 border-t border-[#e6e2d6]/70 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#725a39] gap-2 mt-1">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#16813d]" />
          <span>Real-time aggregation across staging tables and live public.jobs</span>
        </span>
        <span className="font-mono text-[11px]">
          Target Conversion: &gt;65% raw to live
        </span>
      </div>
    </div>
  );
};
