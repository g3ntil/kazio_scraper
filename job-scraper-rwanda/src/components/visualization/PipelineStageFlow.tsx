import React from 'react';
import { 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Database, 
  Filter,
  Globe,
  Layers
} from 'lucide-react';

export interface PipelineStage {
  id: string;
  label: string;
  count: number;
  sublabel?: string;
  dropCount?: number;
  dropReason?: string;
  color?: string;
  status?: 'nominal' | 'running' | 'warning' | 'error';
}

export interface PipelineStageFlowProps {
  stages: PipelineStage[];
  title?: string;
  subtitle?: string;
  className?: string;
  onStageClick?: (stageId: string) => void;
}

export const PipelineStageFlow: React.FC<PipelineStageFlowProps> = ({
  stages,
  title = 'Ingestion Pipeline Flow',
  subtitle = '5-Stage telemetry: Raw portal crawling to central AI matching',
  className = '',
  onStageClick
}) => {
  const getStageIcon = (id: string) => {
    switch (id) {
      case 'crawl':
      case 'sources':
        return <Globe className="w-4 h-4 text-[#725a39]" />;
      case 'extract':
      case 'staging':
        return <Layers className="w-4 h-4 text-[#725a39]" />;
      case 'gate':
      case 'filter':
        return <Filter className="w-4 h-4 text-[#a5690c]" />;
      case 'ai':
      case 'enrich':
        return <Sparkles className="w-4 h-4 text-[#293417]" />;
      case 'live':
      case 'jobs':
        return <Database className="w-4 h-4 text-[#16813d]" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-[#725a39]" />;
    }
  };

  const firstCount = stages[0]?.count || 1;

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#e6e2d6] shadow-xs ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[#442a22]">
            {title}
          </h3>
          <p className="text-[11px] text-[#725a39] font-body mt-0.5">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#16813d]/10 text-[#16813d] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16813d] animate-pulse" />
            Live Telemetry
          </span>
        </div>
      </div>

      {/* Responsive Horizontal Pipeline Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
        {stages.map((stage, idx) => {
          const conversionRate = Math.round((stage.count / Math.max(firstCount, 1)) * 100);
          const isLast = idx === stages.length - 1;

          return (
            <div key={stage.id} className="relative flex flex-col justify-between">
              {/* Card Container */}
              <div 
                onClick={() => onStageClick && onStageClick(stage.id)}
                className={`p-3.5 bg-[#fbf9f5] rounded-lg border border-[#e6e2d6] hover:border-[#dad3c1] hover:-translate-y-0.5 transition-all duration-120 flex flex-col justify-between h-full ${
                  onStageClick ? 'cursor-pointer' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#725a39] flex items-center gap-1.5">
                      {getStageIcon(stage.id)}
                      {stage.label}
                    </span>
                    <span className="text-[10px] font-mono text-[#725a39] bg-[#e6e2d6]/50 px-1 rounded">
                      #{idx + 1}
                    </span>
                  </div>

                  <div className="text-xl font-mono font-bold text-[#442a22]">
                    {stage.count.toLocaleString()}
                  </div>

                  {stage.sublabel && (
                    <div className="text-[10.5px] text-[#725a39] font-body mt-0.5">
                      {stage.sublabel}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#e6e2d6]/80 flex items-center justify-between text-[10px]">
                  <span className="text-[#725a39]">Yield:</span>
                  <span className="font-mono font-semibold text-[#16813d]">
                    {conversionRate}%
                  </span>
                </div>

                {stage.dropCount !== undefined && stage.dropCount > 0 && (
                  <div className="mt-1.5 px-2 py-0.5 rounded bg-[#ba1a1a]/10 text-[#ba1a1a] text-[9.5px] font-mono flex items-center justify-between">
                    <span>-{stage.dropCount}</span>
                    <span className="truncate max-w-[80px]">{stage.dropReason || 'Dropped'}</span>
                  </div>
                )}
              </div>

              {/* Arrow Connector for Desktop */}
              {!isLast && (
                <div className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-white border border-[#e6e2d6] items-center justify-center shadow-xs">
                  <ArrowRight className="w-2.5 h-2.5 text-[#725a39]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
