/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * ReadinessTab — the "Readiness" tab of the Decide step.
 * Renders a large migration-readiness score, a grid of category
 * checks (Database, Kafka, MQ, DNS, Firewall, Certificates,
 * Storage, Secrets, Replication, Monitoring), and a blocker list.
 * Mock data only.
 */

import React from 'react';
import { TriangleAlert as AlertTriangle, CircleCheck, CircleAlert, Ban, CalendarClock, CircleUser as UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ReadinessCategory,
  type ReadinessStatus,
  type ReadinessBlocker,
} from '@/modules/dc-exit/data/decideMockData';

const STATUS_META: Record<
  ReadinessStatus,
  { color: string; bg: string; border: string; label: string; Icon: typeof CircleCheck }
> = {
  pass: { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)',  label: 'Pass', Icon: CircleCheck },
  warn: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)',  label: 'Warn', Icon: CircleAlert },
  fail: { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)',   label: 'Fail', Icon: Ban },
};

function scoreTone(score: number): { color: string; bg: string; border: string } {
  if (score >= 80) return { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' };
  if (score >= 50) return { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' };
  return { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',  border: 'rgba(255,0,60,0.22)' };
}

function LargeScoreCard({ score, label, categories }: { score: number; label: string; categories: ReadinessCategory[] }) {
  const tone = scoreTone(score);
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;

  return (
    <div
      className="rounded-[8px] p-5 flex items-center gap-5 flex-wrap"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="relative flex-shrink-0" style={{ width: 128, height: 128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--app-bg-muted)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={tone.color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight" style={{ color: tone.color }}>
            {score}
          </span>
          <span className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-disabled)' }}>
            / 100
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span
          className="text-[20px] font-bold tracking-tight leading-tight"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          {score >= 80 ? 'Ready to Proceed' : score >= 50 ? 'Conditional — Resolve Blockers' : 'Not Ready'}
        </span>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {(['pass', 'warn', 'fail'] as ReadinessStatus[]).map((s) => {
            const count = categories.filter((c) => c.status === s).length;
            const meta = STATUS_META[s];
            return (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold select-none"
                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
              >
                <meta.Icon className="w-3 h-3" strokeWidth={2} />
                {count} {meta.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryCheckCard({ category }: { category: ReadinessCategory }) {
  const Icon = category.icon;
  const meta = STATUS_META[category.status];
  const pct = Math.round((category.score / (category.total || 1)) * 100);

  return (
    <div
      className="group rounded-[8px] p-4 flex flex-col gap-3 transition-all duration-150"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--app-border-strong)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--app-border)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-[6px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
        >
          <Icon className="w-4 h-4" style={{ color: meta.color }} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11.5px] font-bold uppercase tracking-[0.06em] truncate flex-1 min-w-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {category.label}
        </span>
        <meta.Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} strokeWidth={2} />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[22px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {category.score}
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          / {category.total}
        </span>
        <span
          className="ml-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px]"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>

      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: meta.color }}
        />
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {category.detail}
      </p>
    </div>
  );
}

const SEVERITY_META: Record<ReadinessBlocker['severity'], { color: string; bg: string; border: string }> = {
  critical: { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',  border: 'rgba(255,0,60,0.22)' },
  high:     { color: '#FFB100', bg: 'rgba(255,177,0,0.08)', border: 'rgba(255,177,0,0.22)' },
  medium:   { color: '#006CFF', bg: 'rgba(0,108,255,0.08)', border: 'rgba(0,108,255,0.22)' },
};

function BlockerRow({ blocker, idx }: { blocker: ReadinessBlocker; idx: number }) {
  const sev = SEVERITY_META[blocker.severity];
  return (
    <div
      className={cn('flex flex-col gap-2 px-4 py-3 transition-colors')}
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sev.color }} strokeWidth={2} />
        <span className="text-[12.5px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {blocker.title}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}
        >
          {blocker.severity}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-secondary)' }}>
        {blocker.detail}
      </p>
      <div className="flex items-center gap-4 pl-6 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            {blocker.category}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <UserCircle2 className="w-3 h-3" strokeWidth={1.8} />
          {blocker.owner}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <CalendarClock className="w-3 h-3" strokeWidth={1.8} />
          {blocker.dueDate}
        </span>
      </div>
    </div>
  );
}

export interface ReadinessTabProps {
  score: number;
  scoreLabel: string;
  categories: ReadinessCategory[];
  blockers: ReadinessBlocker[];
}

export function ReadinessTab({ score, scoreLabel, categories, blockers }: ReadinessTabProps) {

  return (
    <div className="flex flex-col gap-6">
      {/* === Large score === */}
      <section className="flex flex-col gap-3">
        <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Readiness Score
        </h4>
        <LargeScoreCard score={score} label={scoreLabel} categories={categories} />
      </section>

      {/* === Category checks === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Category Checks
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {categories.length} categories
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {categories.map((category) => (
            <CategoryCheckCard key={category.id} category={category} />
          ))}
        </div>
      </section>

      {/* === Blockers === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Blockers
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {blockers.length} open
          </span>
        </div>
        <div
          className="rounded-[8px] flex flex-col overflow-hidden"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          {blockers.map((blocker, idx) => (
            <BlockerRow key={blocker.id} blocker={blocker} idx={idx} />
          ))}
        </div>
      </section>
    </div>
  );
}
