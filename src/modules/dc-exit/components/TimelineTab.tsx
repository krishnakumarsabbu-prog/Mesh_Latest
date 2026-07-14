/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * TimelineTab — the "Timeline" tab of the Execute step.
 * Renders a horizontal Gantt-style timeline across Hour 0-4
 * with two parallel tracks per hour: Planned (outlined) and
 * Actual (filled, animated). Milestones that are running or
 * verifying pulse live. Mock data only.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  TIMELINE_HOURS,
  timelineActual,
  EXEC_STATUS_META,
  type TimelineActual,
} from '@/modules/dc-exit/data/executeMockData';

const MIN_PER_HOUR = 60;

function pct(min: number): number {
  return (min / MIN_PER_HOUR) * 100;
}

function MilestoneBar({
  ms,
  kind,
  animate,
}: {
  ms: TimelineActual;
  kind: 'planned' | 'actual';
  animate?: boolean;
}) {
  const meta = EXEC_STATUS_META[ms.actualStatus];

  if (kind === 'planned') {
    const left = pct(ms.startMin);
    const width = pct(ms.durationMin);
    return (
      <div
        className="absolute top-0 h-7 rounded-[5px] flex items-center px-2 overflow-hidden"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          background: 'transparent',
          border: `1px dashed var(--app-border-strong)`,
        }}
        title={`Planned: ${ms.label} (${ms.durationMin}min)`}
      >
        <span className="text-[9px] font-semibold truncate" style={{ color: 'var(--text-muted)' }}>
          {ms.label}
        </span>
      </div>
    );
  }

  // actual
  if (ms.actualStartMin === null) {
    return (
      <div
        className="absolute top-0 h-7 rounded-[5px] flex items-center px-2 overflow-hidden"
        style={{
          left: `${pct(ms.startMin)}%`,
          width: `${pct(ms.durationMin)}%`,
          background: 'var(--app-bg-muted)',
          border: '1px dashed var(--app-border)',
          opacity: 0.5,
        }}
        title={`Not started: ${ms.label}`}
      >
        <span className="text-[9px] font-semibold truncate" style={{ color: 'var(--text-disabled)' }}>
          {ms.label}
        </span>
      </div>
    );
  }

  const left = pct(ms.actualStartMin);
  const duration = ms.actualDurationMin ?? ms.durationMin * 0.5;
  const width = pct(duration);
  const isLive = ms.actualStatus === 'running' || ms.actualStatus === 'verifying';

  return (
    <motion.div
      className="absolute top-0 h-7 rounded-[5px] flex items-center px-2 overflow-hidden"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: `${width}%`, opacity: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      title={`Actual: ${ms.label} — ${meta.label}`}
    >
      {isLive && (
        <span
          className="absolute right-0 top-0 bottom-0 w-1 rounded-r-[5px]"
          style={{ background: meta.color }}
        >
          <span
            className="absolute inset-0 rounded-r-[5px] animate-pulse"
            style={{ background: meta.color, opacity: 0.4 }}
          />
        </span>
      )}
      <span className="text-[9px] font-semibold truncate" style={{ color: meta.color }}>
        {ms.label}
      </span>
      {isLive && (
        <span className="ml-auto flex-shrink-0 relative flex items-center justify-center w-1.5 h-1.5">
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-60"
            style={{ background: meta.color, animationDuration: '1.5s' }}
          />
          <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
        </span>
      )}
    </motion.div>
  );
}

function HourColumn({ hour }: { hour: number }) {
  const planned = timelineActual.filter((m) => m.hour === hour);

  return (
    <div className="flex flex-col gap-2">
      {/* Hour label */}
      <div className="flex items-center gap-2 px-1">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--text-secondary)' }}
        >
          Hour {hour}
        </span>
        <span className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
      </div>

      {/* Planned track */}
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-mono flex-shrink-0 text-right"
          style={{ color: 'var(--text-muted)', width: 52 }}
        >
          Planned
        </span>
        <div
          className="relative flex-1 rounded-[6px]"
          style={{ height: 28, background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
        >
          {planned.map((ms) => (
            <MilestoneBar key={`p-${ms.hour}-${ms.label}`} ms={ms} kind="planned" />
          ))}
        </div>
      </div>

      {/* Actual track */}
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-mono flex-shrink-0 text-right"
          style={{ color: 'var(--text-muted)', width: 52 }}
        >
          Actual
        </span>
        <div
          className="relative flex-1 rounded-[6px]"
          style={{ height: 28, background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
        >
          {planned.map((ms) => (
            <MilestoneBar key={`a-${ms.hour}-${ms.label}`} ms={ms} kind="actual" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimelineTab() {
  const completed = timelineActual.filter((m) => m.actualStatus === 'completed').length;
  const inFlight = timelineActual.filter((m) => m.actualStatus === 'running' || m.actualStatus === 'verifying').length;
  const pending = timelineActual.filter((m) => m.actualStatus === 'pending').length;

  return (
    <div className="flex flex-col gap-6">
      {/* === Legend + summary === */}
      <section className="flex flex-col gap-3">
        <div
          className="rounded-[8px] p-4 flex items-center gap-5 flex-wrap"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-3 rounded-[3px]"
              style={{ border: '1px dashed var(--app-border-strong)', background: 'transparent' }}
            />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Planned
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-3 rounded-[3px]"
              style={{ background: EXEC_STATUS_META.completed.bg, border: `1px solid ${EXEC_STATUS_META.completed.border}` }}
            />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Actual
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-bold tabular-nums" style={{ color: EXEC_STATUS_META.completed.color }}>{completed}</span>
              <span style={{ color: 'var(--text-muted)' }}>done</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-bold tabular-nums" style={{ color: EXEC_STATUS_META.running.color }}>{inFlight}</span>
              <span style={{ color: 'var(--text-muted)' }}>in flight</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-bold tabular-nums" style={{ color: EXEC_STATUS_META.pending.color }}>{pending}</span>
              <span style={{ color: 'var(--text-muted)' }}>pending</span>
            </span>
          </div>
        </div>
      </section>

      {/* === Timeline tracks === */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Migration Timeline
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            Hour 0 → Hour 4
          </span>
        </div>

        <div
          className="rounded-[8px] p-4 flex flex-col gap-4"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          {TIMELINE_HOURS.map((hour, i) => (
            <React.Fragment key={hour}>
              <HourColumn hour={hour} />
              {i < TIMELINE_HOURS.length - 1 && (
                <div className="h-px" style={{ background: 'var(--app-border)' }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}
