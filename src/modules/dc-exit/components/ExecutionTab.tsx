/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * ExecutionTab — the "Execution" tab of the Execute step.
 * Renders an application list grouped by migration status
 * (Pending, Running, Verifying, Completed). A live confidence
 * counter animates upward over time, and each row shows a
 * per-app confidence ring + progress bar. Mock data only.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  execApps,
  EXEC_STATUS_ORDER,
  EXEC_STATUS_META,
  APP_TECH_ICON,
  type ExecApp,
  type ExecStatus,
} from '@/modules/dc-exit/data/executeMockData';

const HOUR_MS = 60 * 60 * 1000;

function statusTone(score: number): string {
  if (score >= 85) return '#00B074';
  if (score >= 60) return '#FFB100';
  return '#FF6B35';
}

function ConfidenceRing({ value, size = 44, stroke = 4 }: { value: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  const color = statusTone(value);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--app-bg-muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s ease, stroke 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
          {Math.round(value)}
        </span>
      </div>
    </div>
  );
}

function AppRow({ app, index }: { app: ExecApp; index: number }) {
  const meta = EXEC_STATUS_META[app.status];
  const Icon = APP_TECH_ICON[app.techIcon];
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28, ease: 'easeOut' }}
      className="rounded-[8px] overflow-hidden"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
      >
        <span className="flex-shrink-0 w-4" style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>

        <span
          className="flex items-center justify-center w-8 h-8 rounded-[6px] flex-shrink-0"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
        >
          <Icon className="w-4 h-4" style={{ color: meta.color }} strokeWidth={1.8} />
        </span>

        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {app.name}
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>{app.tier}</span>
            <span>·</span>
            <span>Wave {app.wave}</span>
            <span>·</span>
            <span>{app.stepsDone}/{app.stepsTotal} steps</span>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0" style={{ minWidth: 120 }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>Conf</span>
            <span className="text-[12px] font-bold tabular-nums" style={{ color: statusTone(app.confidence) }}>
              {app.confidence}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 100, background: 'var(--app-bg-muted)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: statusTone(app.confidence) }}
              initial={{ width: 0 }}
              animate={{ width: `${app.confidence}%` }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: index * 0.04 }}
            />
          </div>
        </div>

        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold flex-shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {app.status === 'running' && (
            <span className="relative flex items-center justify-center w-1.5 h-1.5">
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: meta.color, animationDuration: '1.4s' }}
              />
              <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
            </span>
          )}
          {app.status === 'verifying' && (
            <span className="relative flex items-center justify-center w-1.5 h-1.5">
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: meta.color, animationDuration: '1.8s' }}
              />
              <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
            </span>
          )}
          {meta.label}
        </span>

        <span className="hidden md:flex flex-shrink-0">
          <ConfidenceRing value={app.confidence} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 flex flex-col gap-3" style={{ borderTop: '1px solid var(--app-border)' }}>
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
                  Migration Progress
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
                  {app.owner}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: meta.bar }}
                  initial={{ width: 0 }}
                  animate={{ width: `${app.progress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
              <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {app.detail}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusSection({ status, apps }: { status: ExecStatus; apps: ExecApp[] }) {
  const meta = EXEC_STATUS_META[status];
  const [open, setOpen] = useState(true);

  if (apps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-1 py-1 group"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {apps.length} {apps.length === 1 ? 'app' : 'apps'}
        </span>
        <span className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="flex flex-col gap-2 pl-1"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {apps.map((app, i) => (
              <AppRow key={app.id} app={app} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ExecutionTab() {
  const grouped = useMemo(() => {
    const map: Record<ExecStatus, ExecApp[]> = { pending: [], running: [], verifying: [], completed: [] };
    for (const a of execApps) map[a.status].push(a);
    return map;
  }, []);

  const totalApps = execApps.length;
  const completedApps = grouped.completed.length;

  const [liveConfidence, setLiveConfidence] = useState(0);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const target = 78;
    const duration = 1800;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(eased * target * 10) / 10;
      setLiveConfidence(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setLiveConfidence(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const confColor = statusTone(liveConfidence);

  return (
    <div className="flex flex-col gap-6">
      {/* === Live confidence + summary === */}
      <section className="flex flex-col gap-3">
        <div
          className="rounded-[8px] p-5 flex items-center gap-6 flex-wrap"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="relative flex-shrink-0" style={{ width: 96, height: 96 }}>
            <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="var(--app-bg-muted)" strokeWidth="8" />
              <circle
                cx="48" cy="48" r="40" fill="none" stroke={confColor} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 - (Math.max(liveConfidence, 0.1) / 100) * 2 * Math.PI * 40}
                style={{ transition: 'stroke 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                key={Math.round(liveConfidence)}
                className="text-[26px] font-bold leading-none tabular-nums tracking-tight"
                style={{ color: confColor }}
              >
                {Math.round(liveConfidence)}
              </motion.span>
              <span className="text-[8px] font-mono mt-1" style={{ color: 'var(--text-disabled)' }}>
                / 100
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
              Live Migration Confidence
            </span>
            <span className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {liveConfidence >= 80 ? 'On Track' : liveConfidence >= 60 ? 'Progressing' : 'Early Stage'}
            </span>
            <div className="flex items-center gap-4 flex-wrap mt-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-bold tabular-nums">{completedApps}</span>
                <span style={{ color: 'var(--text-muted)' }}>/ {totalApps} complete</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-bold tabular-nums">{grouped.running.length + grouped.verifying.length}</span>
                <span style={{ color: 'var(--text-muted)' }}>in flight</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-bold tabular-nums">{grouped.pending.length}</span>
                <span style={{ color: 'var(--text-muted)' }}>queued</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* === Application list grouped by status === */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Application List
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {totalApps} applications · 3 waves
          </span>
        </div>

        {EXEC_STATUS_ORDER.map((status) => (
          <StatusSection key={status} status={status} apps={grouped[status]} />
        ))}
      </section>
    </div>
  );
}
