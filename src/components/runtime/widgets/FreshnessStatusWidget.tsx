import React from 'react';
import { RefreshCw, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, CircleAlert as AlertCircle } from 'lucide-react';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import type { LiveWidgetData } from '@/types';

interface Props {
  widget: LiveWidgetData;
}

const STATUS_STYLES = {
  FRESH:      { color: '#30D158', bg: 'rgba(48,209,88,0.08)',  label: 'Fresh',       Icon: CheckCircle },
  STALE:      { color: '#FF9F0A', bg: 'rgba(255,159,10,0.08)', label: 'Stale',       Icon: AlertTriangle },
  VERY_STALE: { color: '#FF453A', bg: 'rgba(255,69,58,0.08)',  label: 'Very Stale',  Icon: AlertCircle },
};

export function FreshnessStatusWidget({ widget }: Props) {
  const { applications } = useRuntimeLocationStore();

  const freshCount     = applications.filter((a) => a.stale_source_count === 0).length;
  const staleCount     = applications.filter((a) => a.stale_source_count > 0).length;

  const totalApps = applications.length;

  if (totalApps === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-neutral-700 truncate">{widget.title}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-6 h-6 text-neutral-300 mx-auto mb-1" strokeWidth={1.5} />
            <p className="text-xs text-neutral-400">No runtime data</p>
          </div>
        </div>
      </div>
    );
  }

  const rows = [
    { key: 'FRESH' as const,      count: freshCount, pct: Math.round((freshCount / totalApps) * 100) },
    { key: 'STALE' as const,      count: staleCount, pct: Math.round((staleCount / totalApps) * 100) },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs font-semibold text-neutral-700 truncate">{widget.title}</p>
        {widget.subtitle && <p className="text-xs text-neutral-400 mt-0.5 truncate">{widget.subtitle}</p>}
      </div>
      <div className="flex-1 flex flex-col justify-center gap-3 px-4 pb-3">
        {rows.map(({ key, count, pct }) => {
          const { color, bg, label, Icon } = STATUS_STYLES[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: bg }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-neutral-700">{label}</span>
                  <span className="text-xs font-bold" style={{ color }}>{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-neutral-400 text-center">
          {totalApps} application{totalApps !== 1 ? 's' : ''} tracked
        </p>
      </div>
    </div>
  );
}
