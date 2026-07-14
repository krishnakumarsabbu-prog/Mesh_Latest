/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * ScoreBadge - displays a numeric score (0-100) with a color band
 * matched to severity thresholds. Enterprise, minimal style.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type ScoreTone = 'success' | 'warning' | 'danger' | 'neutral';

function toneForScore(score: number): ScoreTone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  if (score > 0) return 'danger';
  return 'neutral';
}

const TONE_STYLES: Record<ScoreTone, { color: string; bg: string; border: string }> = {
  success: { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  warning: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  danger:  { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
  neutral: { color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
};

interface ScoreBadgeProps {
  score: number;
  label?: string;
  tone?: ScoreTone;
  size?: 'sm' | 'md';
  className?: string;
}

export function ScoreBadge({ score, label, tone, size = 'sm', className }: ScoreBadgeProps) {
  const t = TONE_STYLES[tone ?? toneForScore(score)];
  const sizes = {
    sm: 'px-2 py-0.5 text-[11px] gap-1.5',
    md: 'px-2.5 py-1 text-[12px] gap-2',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-[4px] font-mono select-none',
        sizes[size],
        className,
      )}
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      <span className="font-bold tabular-nums">{Math.round(score)}</span>
      {label && <span className="opacity-70 font-normal">{label}</span>}
    </span>
  );
}
