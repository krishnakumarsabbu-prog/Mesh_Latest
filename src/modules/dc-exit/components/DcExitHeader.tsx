/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DcExitHeader - the module page header. Composes the breadcrumb
 * trail, the page title + subtitle, and the status/score badges
 * for the active phase. Mirrors the global header's fixed top bar
 * height (52px) and theme tokens.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { DcExitBreadcrumb, type DcExitCrumb } from './DcExitBreadcrumb';
import { StatusPill, type DcExitPillStatus } from './StatusPill';
import { ScoreBadge } from './ScoreBadge';

interface DcExitHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: DcExitCrumb[];
  status?: DcExitPillStatus;
  statusLabel?: string;
  score?: number;
  scoreLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function DcExitHeader({
  title,
  subtitle,
  breadcrumbs,
  status,
  statusLabel,
  score,
  scoreLabel,
  actions,
  className,
}: DcExitHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Breadcrumb row */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <DcExitBreadcrumb items={breadcrumbs} />
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2
              className="text-xl font-bold tracking-tight leading-tight"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
            >
              {title}
            </h2>
            {status && <StatusPill status={status} label={statusLabel} pulse={status === 'in-progress'} />}
            {typeof score === 'number' && <ScoreBadge score={score} label={scoreLabel} />}
          </div>
          {subtitle && (
            <p
              className="text-sm mt-1 leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
