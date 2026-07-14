/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * StatusPill - a compact status indicator with a dot and label.
 * Uses the project's pipeline-status color tokens.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type DcExitPillStatus = 'pending' | 'in-progress' | 'complete' | 'error' | 'info';

const STATUS_STYLES: Record<DcExitPillStatus, { color: string; bg: string; border: string; label: string }> = {
  pending:     { color: '#8A97A8', bg: 'rgba(138,151,168,0.08)',  border: 'rgba(138,151,168,0.18)',  label: 'Pending' },
  'in-progress': { color: '#006CFF', bg: 'rgba(0,108,255,0.08)',   border: 'rgba(0,108,255,0.22)',   label: 'In Progress' },
  complete:    { color: '#00B074', bg: 'rgba(0,176,116,0.08)',     border: 'rgba(0,176,116,0.22)',   label: 'Complete' },
  error:       { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',      border: 'rgba(255,0,60,0.22)',    label: 'Error' },
  info:        { color: '#7800FF', bg: 'rgba(120,0,255,0.08)',     border: 'rgba(120,0,255,0.22)',   label: 'Info' },
};

interface StatusPillProps {
  status: DcExitPillStatus;
  label?: string;
  pulse?: boolean;
  className?: string;
}

export function StatusPill({ status, label, pulse, className }: StatusPillProps) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold select-none',
        className,
      )}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      <span className="relative flex items-center justify-center w-1.5 h-1.5">
        {pulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-60"
            style={{ background: s.color, animationDuration: '2s' }}
          />
        )}
        <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      </span>
      {label ?? s.label}
    </span>
  );
}
