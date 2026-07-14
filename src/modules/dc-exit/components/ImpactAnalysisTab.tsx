/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * ImpactAnalysisTab — the "Impact Analysis" tab of the Analyze step.
 * Renders top-line impact metric cards (Tier 1 apps, customers
 * affected, applications in scope) followed by a dependency
 * breakdown grid covering MQ, Kafka, Oracle, Mongo, VIP and DNS.
 * Mock data only.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEPENDENCY_TYPE_META,
  type ImpactMetric,
  type DependencyBreakdown,
  type HealthState,
} from '@/modules/dc-exit/data/analyzeMockData';

const HEALTH_DOT: Record<HealthState, string> = {
  healthy: '#00B074',
  degraded: '#FFB100',
  down: '#FF003C',
};

function TrendPill({ delta, deltaLabel }: { delta: number; deltaLabel: string }) {
  const flat = delta === 0;
  const positive = delta > 0;
  const color = flat ? '#8A97A8' : positive ? '#FF003C' : '#00B074';
  const bg = flat ? 'rgba(138,151,168,0.08)' : positive ? 'rgba(255,0,60,0.08)' : 'rgba(0,176,116,0.08)';
  const border = flat ? 'rgba(138,151,168,0.18)' : positive ? 'rgba(255,0,60,0.22)' : 'rgba(0,176,116,0.22)';
  const Icon = flat ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-semibold select-none"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      <Icon className="w-3 h-3" strokeWidth={2} />
      <span className="tabular-nums">{Math.abs(delta)}</span>
      <span className="font-normal opacity-80 hidden sm:inline">{deltaLabel}</span>
    </span>
  );
}

function ImpactMetricCard({ metric }: { metric: ImpactMetric }) {
  const Icon = metric.icon;
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
          style={{ background: metric.iconBg, border: `1px solid ${metric.iconColor}26` }}
        >
          <Icon className="w-4 h-4" style={{ color: metric.iconColor }} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-[0.06em] truncate flex-1 min-w-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {metric.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {metric.value}
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {metric.unit}
        </span>
        <span className="ml-auto">
          <TrendPill delta={metric.delta} deltaLabel={metric.deltaLabel} />
        </span>
      </div>
    </div>
  );
}

function DependencyBreakdownCard({ row }: { row: DependencyBreakdown }) {
  const meta = DEPENDENCY_TYPE_META[row.type];
  const Icon = meta.icon;
  const total = row.total || 1;
  const hPct = (row.healthy / total) * 100;
  const dPct = (row.degraded / total) * 100;
  const downPct = (row.down / total) * 100;

  return (
    <div
      className="group rounded-[8px] p-3.5 flex flex-col gap-3 transition-all duration-150"
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
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.06em] truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            {meta.label}
          </span>
          <span className="text-[9.5px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {row.atRisk} at risk
          </span>
        </div>
        <span
          className="text-[22px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {row.total}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
          <div style={{ width: `${hPct}%`, background: '#00B074' }} />
          <div style={{ width: `${dPct}%`, background: '#FFB100' }} />
          <div style={{ width: `${downPct}%`, background: '#FF003C' }} />
        </div>
        <div className="flex items-center gap-3 text-[9.5px] font-mono">
          <span className="flex items-center gap-1" style={{ color: '#00B074' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00B074' }} />
            {row.healthy}
          </span>
          <span className="flex items-center gap-1" style={{ color: '#FFB100' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FFB100' }} />
            {row.degraded}
          </span>
          <span className="flex items-center gap-1" style={{ color: '#FF003C' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FF003C' }} />
            {row.down}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ImpactAnalysisTabProps {
  metrics: ImpactMetric[];
  dependencyBreakdown: DependencyBreakdown[];
}

export function ImpactAnalysisTab({ metrics, dependencyBreakdown }: ImpactAnalysisTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* === Impact metrics === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Impact
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {metrics.length} metrics
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <ImpactMetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      </section>

      {/* === Dependency breakdown === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Dependencies
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {dependencyBreakdown.length} types
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {dependencyBreakdown.map((row) => (
            <DependencyBreakdownCard key={row.type} row={row} />
          ))}
        </div>
      </section>
    </div>
  );
}
