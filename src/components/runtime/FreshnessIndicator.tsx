import React from 'react';
import { motion } from 'framer-motion';
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
      <span
        className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', className)}
        style={{ color: '#30D158' }}
        title="Fresh: Data source was refreshed within 30 minutes. Ingested telemetry is active and verified."
      >
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
      <motion.span
        animate={{ opacity: [1, 0.55, 1] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
        className={cn('inline-flex items-center gap-1 text-[11px] font-medium', className)}
        style={{ color: '#FF9F0A' }}
        title={`Stale: Last telemetry import was between 30m and 2h ago (${relTime}). Some configuration details may have drifted.`}
      >
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
        {showRelativeTime && !compact && <span>{relTime} — may be stale</span>}
        {showRelativeTime && compact && <span>{relTime}</span>}
      </motion.span>
    );
  }

  // VERY_STALE
  return (
    <motion.span
      animate={{ opacity: [1, 0.35, 1], scale: [1, 1.03, 1] }}
      transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
      className={cn('inline-flex items-center gap-1 text-[11px] font-medium', className)}
      style={{ color: '#FF453A' }}
      title={`Very Stale: Last telemetry import was over 2h ago (${relTime}). Observability state is unverified and at risk.`}
    >
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      {showRelativeTime && !compact && <span>Stale — {relTime}</span>}
      {showRelativeTime && compact && <span>{relTime}</span>}
    </motion.span>
  );
}
