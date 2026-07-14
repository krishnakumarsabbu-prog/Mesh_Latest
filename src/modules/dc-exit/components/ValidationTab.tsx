/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * ValidationTab — the "Validation" tab of the Validate step.
 * Renders a cutover checklist, confidence signal breakdown,
 * drift detection, intent-vs-actual alignment, synthetic
 * transaction results, and a before/after confidence comparison
 * chart. Mock data only.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  CircleCheck, CircleAlert, Ban, Clock, ArrowDownRight, ArrowUpRight, Minus,
  FlaskConical, Zap, ShieldCheck, Gauge, GitCompare, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validationChecklist,
  CHECKLIST_STATUS_META,
  type ChecklistItem,
  type ChecklistStatus,
  confidenceSignals,
  VALIDATION_CONFIDENCE,
  confidenceComparison,
  driftItems,
  DRIFT_SEVERITY_META,
  type DriftItem,
  type DriftSeverity,
  alignmentChecks,
  ALIGNMENT_STATUS_META,
  type AlignmentCheck,
  type AlignmentStatus,
  syntheticTransactions,
  SYNTH_TX_STATUS_META,
  type SyntheticTransaction,
  type SynthTxStatus,
} from '@/modules/dc-exit/data/validateMockData';

const CHECKLIST_ICON: Record<ChecklistStatus, typeof CircleCheck> = {
  pass: CircleCheck,
  warn: CircleAlert,
  fail: Ban,
  pending: Clock,
};

function scoreTone(score: number): string {
  if (score >= 85) return '#00B074';
  if (score >= 60) return '#FFB100';
  return '#FF003C';
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Gauge;
  title: string;
  count: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} strokeWidth={2} />
        <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h4>
      </div>
      <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
        {count}
      </span>
    </div>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function ChecklistRow({ item, idx }: { item: ChecklistItem; idx: number }) {
  const meta = CHECKLIST_STATUS_META[item.status];
  const Icon = CHECKLIST_ICON[item.status];
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} strokeWidth={2} />
        <span className="text-[12.5px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {item.label}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
        >
          {item.category}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-secondary)' }}>
        {item.detail}
      </p>
      <span className="text-[10px] font-mono pl-6" style={{ color: 'var(--text-disabled)' }}>
        Verified {item.verifiedAt}
      </span>
    </div>
  );
}

function ChecklistSection() {
  const counts = useMemo(() => {
    const c: Record<ChecklistStatus, number> = { pass: 0, warn: 0, fail: 0, pending: 0 };
    for (const item of validationChecklist) c[item.status]++;
    return c;
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader icon={CircleCheck} title="Cutover Checklist" count={`${validationChecklist.length} checks`} />
      <div className="flex items-center gap-2 flex-wrap">
        {(['pass', 'warn', 'fail', 'pending'] as ChecklistStatus[]).map((s) => {
          const meta = CHECKLIST_STATUS_META[s];
          const Icon = CHECKLIST_ICON[s];
          return (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold select-none"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
            >
              <Icon className="w-3 h-3" strokeWidth={2} />
              {counts[s]} {meta.label}
            </span>
          );
        })}
      </div>
      <div
        className="rounded-[8px] flex flex-col overflow-hidden"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {validationChecklist.map((item, idx) => (
          <ChecklistRow key={item.id} item={item} idx={idx} />
        ))}
      </div>
    </section>
  );
}

// ─── Confidence ──────────────────────────────────────────────────────────────

function ConfidenceSignalRow({ signal, idx }: { signal: typeof confidenceSignals[number]; idx: number }) {
  const Icon = signal.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.05, duration: 0.3 }}
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <span
        className="flex items-center justify-center w-8 h-8 rounded-[6px] flex-shrink-0"
        style={{ background: `rgba(0,108,255,0.06)`, border: '1px solid var(--app-border)' }}
      >
        <Icon className="w-4 h-4" style={{ color: signal.iconColor }} strokeWidth={1.8} />
      </span>
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {signal.source}
        </span>
        <span className="text-[11px] leading-relaxed truncate" style={{ color: 'var(--text-muted)' }}>
          {signal.detail}
        </span>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0" style={{ minWidth: 110 }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>w{signal.weight}%</span>
          <span className="text-[14px] font-bold tabular-nums" style={{ color: scoreTone(signal.score) }}>
            {signal.score}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 90, background: 'var(--app-bg-muted)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: scoreTone(signal.score) }}
            initial={{ width: 0 }}
            animate={{ width: `${signal.score}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.05 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function ConfidenceSection() {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (VALIDATION_CONFIDENCE / 100) * circ;
  const tone = scoreTone(VALIDATION_CONFIDENCE);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader icon={Gauge} title="Confidence Breakdown" count={`${confidenceSignals.length} signals`} />

      <div
        className="rounded-[8px] p-5 flex items-center gap-5 flex-wrap"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="relative flex-shrink-0" style={{ width: 128, height: 128 }}>
          <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--app-bg-muted)" strokeWidth="10" />
            <circle
              cx="64" cy="64" r={radius} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight" style={{ color: tone }}>
              {VALIDATION_CONFIDENCE}
            </span>
            <span className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-disabled)' }}>/ 100</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
            Overall Validation Confidence
          </span>
          <span className="text-[20px] font-bold tracking-tight leading-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {VALIDATION_CONFIDENCE >= 85 ? 'High Confidence' : VALIDATION_CONFIDENCE >= 60 ? 'Moderate Confidence' : 'Low Confidence'}
          </span>
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Weighted aggregate across {confidenceSignals.length} verification signals. Scores below 60 indicate unresolved validation gaps.
          </p>
        </div>
      </div>

      <div
        className="rounded-[8px] flex flex-col overflow-hidden"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {confidenceSignals.map((signal, idx) => (
          <ConfidenceSignalRow key={signal.id} signal={signal} idx={idx} />
        ))}
      </div>
    </section>
  );
}

// ─── Confidence comparison chart ─────────────────────────────────────────────

function ConfidenceComparisonSection() {
  const chartData = useMemo(
    () => confidenceComparison.map((p) => ({
      label: p.label,
      Before: p.before,
      After: p.after,
    })),
    [],
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader icon={GitCompare} title="Confidence Comparison" count="before vs after cutover" />
      <div
        className="rounded-[8px] p-4 flex flex-col gap-3"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: '#8A97A8' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Before Cutover</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'var(--accent)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>After Cutover</span>
          </div>
        </div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--app-surface-raised)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                cursor={{ fill: 'var(--app-bg-subtle)' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, display: 'none' }} />
              <Bar dataKey="Before" fill="#8A97A8" radius={[4, 4, 0, 0]} barSize={14} />
              <Bar dataKey="After" radius={[4, 4, 0, 0]} barSize={14}>
                {chartData.map((entry, i) => (
                  <Cell key={`after-${i}`} fill={scoreTone(entry.After)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

// ─── Drift ───────────────────────────────────────────────────────────────────

function DriftRow({ item, idx }: { item: DriftItem; idx: number }) {
  const meta = DRIFT_SEVERITY_META[item.severity];
  const noDrift = item.expected === item.actual;
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {item.asset}
        </span>
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
        >
          {item.field}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {item.severity}
        </span>
      </div>
      <div className="flex items-center gap-3 pl-1 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <span className="uppercase tracking-wider text-[9px] font-bold" style={{ color: 'var(--text-disabled)' }}>Expected</span>
          <span style={{ color: 'var(--text-secondary)' }}>{item.expected}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <span className="uppercase tracking-wider text-[9px] font-bold" style={{ color: 'var(--text-disabled)' }}>Actual</span>
          <span style={{ color: noDrift ? 'var(--text-secondary)' : meta.color, fontWeight: 600 }}>{item.actual}</span>
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-1" style={{ color: 'var(--text-secondary)' }}>
        {item.detail}
      </p>
    </div>
  );
}

function DriftSection() {
  const driftCount = driftItems.filter((d) => d.expected !== d.actual).length;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader icon={Activity} title="Drift Detection" count={`${driftCount} drifted · ${driftItems.length} checked`} />
      <div
        className="rounded-[8px] flex flex-col overflow-hidden"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {driftItems.map((item, idx) => (
          <DriftRow key={item.id} item={item} idx={idx} />
        ))}
      </div>
    </section>
  );
}

// ─── Alignment ───────────────────────────────────────────────────────────────

function AlignmentRow({ check, idx }: { check: AlignmentCheck; idx: number }) {
  const meta = ALIGNMENT_STATUS_META[check.status];
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
        >
          {check.domain}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex flex-col gap-1 pl-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-disabled)' }}>Intent</span>
          <span className="text-[11.5px] font-medium" style={{ color: 'var(--text-secondary)' }}>{check.intent}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-disabled)' }}>Actual</span>
          <span className="text-[11.5px] font-semibold" style={{ color: check.status === 'aligned' ? 'var(--text-primary)' : meta.color }}>
            {check.actual}
          </span>
        </div>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-1" style={{ color: 'var(--text-muted)' }}>
        {check.detail}
      </p>
    </div>
  );
}

function AlignmentSection() {
  const counts = useMemo(() => {
    const c: Record<AlignmentStatus, number> = { aligned: 0, partial: 0, misaligned: 0 };
    for (const check of alignmentChecks) c[check.status]++;
    return c;
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader icon={ShieldCheck} title="Intent vs Actual Alignment" count={`${alignmentChecks.length} checks`} />
      <div className="flex items-center gap-2 flex-wrap">
        {(['aligned', 'partial', 'misaligned'] as AlignmentStatus[]).map((s) => {
          const meta = ALIGNMENT_STATUS_META[s];
          return (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold select-none"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
            >
              {counts[s]} {meta.label}
            </span>
          );
        })}
      </div>
      <div
        className="rounded-[8px] flex flex-col overflow-hidden"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {alignmentChecks.map((check, idx) => (
          <AlignmentRow key={check.id} check={check} idx={idx} />
        ))}
      </div>
    </section>
  );
}

// ─── Synthetic transactions ──────────────────────────────────────────────────

function latencyDeltaIcon(actual: number, baseline: number): { Icon: typeof ArrowDownRight; color: string } {
  if (actual <= baseline) return { Icon: ArrowDownRight, color: '#00B074' };
  if (actual <= baseline * 1.5) return { Icon: ArrowUpRight, color: '#FFB100' };
  return { Icon: ArrowUpRight, color: '#FF003C' };
}

function SyntheticTxRow({ tx, idx }: { tx: SyntheticTransaction; idx: number }) {
  const meta = SYNTH_TX_STATUS_META[tx.status];
  const { Icon: DeltaIcon, color: deltaColor } = latencyDeltaIcon(tx.responseTimeMs, tx.baselineMs);
  const deltaPct = Math.round(((tx.responseTimeMs - tx.baselineMs) / tx.baselineMs) * 100);

  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} strokeWidth={2} />
        <span className="text-[12.5px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {tx.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex items-center gap-4 pl-6 flex-wrap">
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{tx.endpoint}</span>
      </div>
      <div className="flex items-center gap-4 pl-6 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <Zap className="w-3 h-3" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
          <span className="font-bold tabular-nums">{tx.responseTimeMs}ms</span>
          <span className="inline-flex items-center gap-0.5" style={{ color: deltaColor }}>
            <DeltaIcon className="w-3 h-3" strokeWidth={2} />
            {deltaPct >= 0 ? '+' : ''}{deltaPct}%
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>baseline</span>
          <span className="font-bold">{tx.baselineMs}ms</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>success rate</span>
          <span className="font-bold tabular-nums" style={{ color: tx.successRate === 100 ? '#00B074' : tx.successRate >= 90 ? '#FFB100' : '#FF003C' }}>
            {tx.successRate}%
          </span>
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-muted)' }}>
        {tx.detail}
      </p>
    </div>
  );
}

function SyntheticTransactionSection() {
  const passed = syntheticTransactions.filter((t) => t.status === 'success').length;
  const total = syntheticTransactions.length;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader icon={FlaskConical} title="Synthetic Transactions" count={`${passed}/${total} passing`} />
      <div
        className="rounded-[8px] flex flex-col overflow-hidden"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {syntheticTransactions.map((tx, idx) => (
          <SyntheticTxRow key={tx.id} tx={tx} idx={idx} />
        ))}
      </div>
    </section>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function ValidationTab() {
  return (
    <div className="flex flex-col gap-6">
      <ChecklistSection />
      <ConfidenceSection />
      <ConfidenceComparisonSection />
      <DriftSection />
      <AlignmentSection />
      <SyntheticTransactionSection />
    </div>
  );
}
