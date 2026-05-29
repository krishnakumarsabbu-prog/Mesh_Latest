import React from 'react';
import { TrendingUp, TrendingDown, Minus, Clock, CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react';
import { ConnectorPerformanceMetrics } from '@/types';
import { cn } from '@/lib/utils';

interface ConnectorLeaderboardProps {
  connectors: ConnectorPerformanceMetrics[];
  onSelect?: (connector: ConnectorPerformanceMetrics) => void;
  selectedName?: string;
}

function SuccessBar({ rate }: { rate: number }) {
  const color = rate >= 95 ? '#30D158' : rate >= 80 ? '#FF9F0A' : '#FF453A';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, rate)}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-10 text-right" style={{ color }}>
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[11px] font-bold" style={{ color: '#FF9F0A' }}>#1</span>;
  if (rank === 2) return <span className="text-[11px] font-bold" style={{ color: '#8E8E93' }}>#2</span>;
  if (rank === 3) return <span className="text-[11px] font-bold" style={{ color: '#CD7F32' }}>#3</span>;
  return <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>#{rank}</span>;
}

export function ConnectorLeaderboard({ connectors, onSelect, selectedName }: ConnectorLeaderboardProps) {
  const sorted = [...connectors].sort((a, b) => b.success_rate - a.success_rate);

  if (!sorted.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No connector data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((c, idx) => {
        const isSelected = selectedName === c.connector_name;
        const scoreColor = (c.avg_health_score || 0) >= 90 ? '#30D158' : (c.avg_health_score || 0) >= 60 ? '#FF9F0A' : '#FF453A';

        return (
          <button
            key={c.connector_name}
            onClick={() => onSelect?.(c)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left',
              isSelected ? 'ring-1' : 'hover:opacity-80',
            )}
            style={{
              background: isSelected ? 'var(--primary-50)' : 'var(--app-surface)',
              border: isSelected ? '1px solid var(--primary-200)' : '1px solid var(--app-border)',
            }}
          >
            <div className="w-6 flex-shrink-0 text-center">
              <RankBadge rank={idx + 1} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {c.connector_name}
                </span>
                {c.connector_category && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
                    style={{ background: 'var(--app-surface-raised)', color: 'var(--text-muted)' }}
                  >
                    {c.connector_category}
                  </span>
                )}
              </div>
              <SuccessBar rate={c.success_rate} />
            </div>

            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              {c.avg_response_time_ms != null && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {c.avg_response_time_ms >= 1000
                      ? `${(c.avg_response_time_ms / 1000).toFixed(1)}s`
                      : `${Math.round(c.avg_response_time_ms)}ms`}
                  </span>
                </div>
              )}
              {c.avg_health_score != null && (
                <span className="text-[10px] font-bold tabular-nums" style={{ color: scoreColor }}>
                  {c.avg_health_score.toFixed(0)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
