import React from 'react';
import { cn } from '@/lib/utils';
import { AnalyticsTimeRange, AnalyticsGranularity } from '@/types';

const TIME_RANGES: { value: AnalyticsTimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const GRANULARITIES: { value: AnalyticsGranularity; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

interface DateRangeFilterProps {
  timeRange: AnalyticsTimeRange;
  granularity: AnalyticsGranularity;
  onTimeRangeChange: (v: AnalyticsTimeRange) => void;
  onGranularityChange: (v: AnalyticsGranularity) => void;
}

export function DateRangeFilter({ timeRange, granularity, onTimeRangeChange, onGranularityChange }: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        className="flex items-center rounded-xl p-0.5 gap-0.5"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {TIME_RANGES.map(tr => (
          <button
            key={tr.value}
            onClick={() => onTimeRangeChange(tr.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150',
              timeRange === tr.value
                ? 'text-white'
                : 'hover:opacity-80',
            )}
            style={timeRange === tr.value ? {
              background: 'var(--primary-500)',
              color: '#fff',
            } : {
              color: 'var(--text-secondary)',
            }}
          >
            {tr.label}
          </button>
        ))}
      </div>

      <div
        className="flex items-center rounded-xl p-0.5 gap-0.5"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {GRANULARITIES.map(g => (
          <button
            key={g.value}
            onClick={() => onGranularityChange(g.value)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
              granularity === g.value ? 'text-white' : 'hover:opacity-80',
            )}
            style={granularity === g.value ? {
              background: 'var(--app-surface-raised)',
              color: 'var(--text-primary)',
              border: '1px solid var(--app-border)',
            } : {
              color: 'var(--text-muted)',
            }}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
