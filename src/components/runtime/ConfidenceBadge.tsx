import React from 'react';
import { CircleHelp as HelpCircle, TriangleAlert as AlertTriangle, Activity, CircleCheck as CheckCircle, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfidenceLevel } from '@/types';

// Legacy numeric levels (1-4) still supported
interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  /** Optional engine-computed label: HIGH | MEDIUM | LOW | CONFLICT | UNKNOWN */
  label?: string;
  /** Optional raw score 0-100 */
  score?: number;
  showLabel?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

// Map legacy numeric levels to labels
const NUMERIC_TO_LABEL: Record<number, string> = {
  1: 'UNKNOWN',
  2: 'LOW',
  3: 'MEDIUM',
  4: 'HIGH',
};

const LABEL_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: LucideIcon }> = {
  HIGH:     { label: 'High',     color: '#30D158', bg: 'rgba(48,209,88,0.12)',    Icon: CheckCircle },
  MEDIUM:   { label: 'Moderate', color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)',   Icon: Activity },
  LOW:      { label: 'Low',      color: '#FF453A', bg: 'rgba(255,69,58,0.12)',    Icon: AlertTriangle },
  CONFLICT: { label: 'Conflict', color: '#FF453A', bg: 'rgba(255,69,58,0.12)',    Icon: Zap },
  UNKNOWN:  { label: 'Unknown',  color: '#8E8E93', bg: 'rgba(142,142,147,0.12)', Icon: HelpCircle },
};

const TOOLTIP_EXPLANATIONS: Record<string, string> = {
  HIGH: "High confidence: Cluster primary assertion confirmed by multiple independent active telemetry sources (Ops Manager + Prometheus). Data is fresh.",
  MEDIUM: "Moderate confidence: Core signals (e.g. AppDynamics) verify traffic load, but secondary sources are missing or CMDB mapping is outdated.",
  LOW: "Low confidence: Telemetry sources are outdated, or only static CMDB entries are currently available without traffic validation.",
  CONFLICT: "Conflict detected: AppDynamics traffic and CMDB registry report mismatching operational states!",
  UNKNOWN: "Unknown: No operational or configuration signal has been received for this asset.",
};

export function ConfidenceBadge({
  level,
  label,
  score,
  showLabel = true,
  showIcon = true,
  size = 'sm',
  className,
}: ConfidenceBadgeProps) {
  // Resolve the display label: prefer explicit label, fall back to numeric mapping
  const resolvedLabel = label ?? NUMERIC_TO_LABEL[level] ?? 'UNKNOWN';
  const cfg = LABEL_CONFIG[resolvedLabel] ?? LABEL_CONFIG['UNKNOWN'];
  const { color, bg, Icon } = cfg;

  const displayLabel = score !== undefined
    ? `${cfg.label} (${score})`
    : cfg.label;

  const title = TOOLTIP_EXPLANATIONS[resolvedLabel] ?? (score !== undefined
    ? `Confidence: ${cfg.label} — score ${score}/100`
    : `Confidence Level ${level}: ${cfg.label}`);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        className,
      )}
      style={{ background: bg, color }}
      title={title}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} strokeWidth={2.5} />}
      {showLabel && displayLabel}
    </span>
  );
}

export function confidenceLevelLabel(level: ConfidenceLevel, label?: string): string {
  if (label) return LABEL_CONFIG[label]?.label ?? label;
  return LABEL_CONFIG[NUMERIC_TO_LABEL[level] ?? 'UNKNOWN']?.label ?? 'Unknown';
}

export function confidenceLevelColor(level: ConfidenceLevel, label?: string): string {
  const key = label ?? NUMERIC_TO_LABEL[level] ?? 'UNKNOWN';
  return LABEL_CONFIG[key]?.color ?? '#8E8E93';
}
