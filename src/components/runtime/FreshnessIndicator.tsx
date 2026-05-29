import React from 'react';
import { TriangleAlert as AlertTriangle, CircleAlert as AlertCircle, Clock, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFreshnessStatus, formatRelativeTime, FRESHNESS_THRESHOLDS } from '@/lib/runtimeLocationMock';

interface FreshnessIndicatorProps {
  lastUpdated?: string;
  thresholds?: { stale: number; veryStale: number };
  showRelativeTime?: boolean;
  compact?: boolean;
  className?: string;
}

export function FreshnessIndicator({
  lastUpdated,
  showRelativeTime = true,
  compact = false,
  className,
}: FreshnessIndicatorProps) {
  const status = getFreshnessStatus(lastUpdated);
  const relTime = formatRelativeTime(lastUpdated);

  if (status === 'UNKNOWN') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px]', className)} style={{ color: '#8E8E93' }}>
        <Minus className="w-3 h-3" />
        {showRelativeTime && 'Never updated'}
      </span>
    );
  }

  if (status === 'FRESH') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', className)} style={{ color: '#30D158' }}>
        <span className="relative flex w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#30D158' }} />
          <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: '#30D158' }} />
        </span>
        {showRelativeTime && <span>{relTime}</span>}
      </span>
    );
  }

  if (status === 'STALE') {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-[11px] font-medium', className)}
        style={{ color: '#FF9F0A' }}
        title={`Data may be stale — last updated ${relTime}`}
      >
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
        {showRelativeTime && !compact && <span>{relTime} — may be stale</span>}
        {showRelativeTime && compact && <span>{relTime}</span>}
      </span>
    );
  }

  // VERY_STALE
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[11px] font-medium', className)}
      style={{ color: '#FF453A' }}
      title={`Data is stale — last updated ${relTime}`}
    >
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      {showRelativeTime && !compact && <span>Stale — {relTime}</span>}
      {showRelativeTime && compact && <span>{relTime}</span>}
    </span>
  );
}
