/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * PrioritizationTab — the "Prioritization" tab of the Decide step.
 * Renders a sortable priority table with columns for application,
 * complexity, tier, dependencies, business criticality, estimated
 * effort, and migration wave. Mock data only.
 */

import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Boxes, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  priorityRows,
  type PriorityRow,
  type ComplexityLevel,
  type AppTier,
} from '@/modules/dc-exit/data/decideMockData';

type SortKey = 'appName' | 'tier' | 'complexity' | 'dependencies' | 'businessCriticality' | 'wave';
type SortDir = 'asc' | 'desc';

const TIER_META: Record<AppTier, { color: string; bg: string; border: string }> = {
  T1: { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',  border: 'rgba(255,0,60,0.22)' },
  T2: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)', border: 'rgba(255,177,0,0.22)' },
  T3: { color: '#006CFF', bg: 'rgba(0,108,255,0.08)', border: 'rgba(0,108,255,0.22)' },
};

const COMPLEXITY_META: Record<ComplexityLevel, { color: string; bg: string; border: string; dots: number }> = {
  low:    { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)',  dots: 1 },
  medium: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)',  dots: 2 },
  high:   { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)',   dots: 3 },
};

const CRIT_META: Record<PriorityRow['businessCriticality'], { color: string; bg: string; border: string }> = {
  critical: { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',  border: 'rgba(255,0,60,0.22)' },
  high:     { color: '#FFB100', bg: 'rgba(255,177,0,0.08)', border: 'rgba(255,177,0,0.22)' },
  medium:   { color: '#006CFF', bg: 'rgba(0,108,255,0.08)', border: 'rgba(0,108,255,0.22)' },
  low:      { color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
};

const CRIT_RANK: Record<PriorityRow['businessCriticality'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const TIER_RANK: Record<AppTier, number> = { T1: 0, T2: 1, T3: 2 };
const COMPLEXITY_RANK: Record<ComplexityLevel, number> = { high: 0, medium: 1, low: 2 };

const COLUMNS: { key: SortKey; label: string; sortable: boolean }[] = [
  { key: 'appName', label: 'Application', sortable: true },
  { key: 'tier', label: 'Tier', sortable: true },
  { key: 'complexity', label: 'Complexity', sortable: true },
  { key: 'dependencies', label: 'Dependencies', sortable: true },
  { key: 'businessCriticality', label: 'Criticality', sortable: true },
  { key: 'wave', label: 'Wave', sortable: true },
];

function ComplexityDots({ level }: { level: ComplexityLevel }) {
  const meta = COMPLEXITY_META[level];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: i < meta.dots ? meta.color : 'var(--app-bg-muted)' }}
          />
        ))}
      </span>
      <span
        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px]"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
      >
        {level}
      </span>
    </span>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors select-none',
      )}
      style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {label}
      <Icon className="w-3 h-3" strokeWidth={2} />
    </button>
  );
}

export function PrioritizationTab() {
  const [sortKey, setSortKey] = useState<SortKey>('tier');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedRows = useMemo(() => {
    const rows = [...priorityRows];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'appName':
          cmp = a.appName.localeCompare(b.appName);
          break;
        case 'tier':
          cmp = TIER_RANK[a.tier] - TIER_RANK[b.tier];
          break;
        case 'complexity':
          cmp = COMPLEXITY_RANK[a.complexity] - COMPLEXITY_RANK[b.complexity];
          break;
        case 'dependencies':
          cmp = a.dependencies - b.dependencies;
          break;
        case 'businessCriticality':
          cmp = CRIT_RANK[a.businessCriticality] - CRIT_RANK[b.businessCriticality];
          break;
        case 'wave':
          cmp = (a.wave ?? 99) - (b.wave ?? 99);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const waveCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    priorityRows.forEach((r) => {
      if (r.wave != null) counts[r.wave] = (counts[r.wave] ?? 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* === Wave summary === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Migration Waves
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {Object.keys(waveCounts).length} waves
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(waveCounts)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([wave, count]) => (
              <div
                key={wave}
                className="rounded-[8px] p-4 flex items-center gap-3 transition-all duration-150"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-[6px] flex-shrink-0"
                  style={{ background: 'rgba(0,108,255,0.08)', border: '1px solid rgba(0,108,255,0.22)' }}
                >
                  <span className="text-[13px] font-extrabold" style={{ color: '#006CFF' }}>
                    W{wave}
                  </span>
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {count} apps
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    Wave {wave}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* === Priority table === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Priority Table
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {priorityRows.length} applications
          </span>
        </div>
        <div
          className="rounded-[8px] overflow-hidden"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          {/* Header row */}
          <div
            className="grid items-center px-4 py-2.5 gap-3 border-b"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--app-bg-subtle)',
              gridTemplateColumns: '1.6fr 0.7fr 1.1fr 1.4fr 1fr 0.6fr',
            }}
          >
            <SortHeader label="Application" active={sortKey === 'appName'} dir={sortDir} onClick={() => toggleSort('appName')} />
            <SortHeader label="Tier" active={sortKey === 'tier'} dir={sortDir} onClick={() => toggleSort('tier')} />
            <SortHeader label="Complexity" active={sortKey === 'complexity'} dir={sortDir} onClick={() => toggleSort('complexity')} />
            <SortHeader label="Dependencies" active={sortKey === 'dependencies'} dir={sortDir} onClick={() => toggleSort('dependencies')} />
            <SortHeader label="Criticality" active={sortKey === 'businessCriticality'} dir={sortDir} onClick={() => toggleSort('businessCriticality')} />
            <SortHeader label="Wave" active={sortKey === 'wave'} dir={sortDir} onClick={() => toggleSort('wave')} />
          </div>

          {/* Body rows */}
          {sortedRows.map((row, idx) => {
            const tier = TIER_META[row.tier];
            const crit = CRIT_META[row.businessCriticality];
            return (
              <div
                key={row.id}
                className="grid items-center px-4 py-3 gap-3 transition-colors"
                style={{
                  borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)',
                  gridTemplateColumns: '1.6fr 0.7fr 1.1fr 1.4fr 1fr 0.6fr',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
              >
                {/* Application */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Boxes className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
                  <span className="text-[12px] font-semibold truncate min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {row.appName}
                  </span>
                </div>

                {/* Tier */}
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] w-fit"
                  style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.border}` }}
                >
                  {row.tier}
                </span>

                {/* Complexity */}
                <ComplexityDots level={row.complexity} />

                {/* Dependencies */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                    <GitBranch className="w-3 h-3" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
                    <span className="font-bold tabular-nums">{row.dependencies}</span>
                    <span className="opacity-70">deps</span>
                  </span>
                  <span className="text-[9.5px] font-mono truncate" style={{ color: 'var(--text-disabled)' }}>
                    {row.dependencyDetail}
                  </span>
                </div>

                {/* Criticality */}
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] w-fit"
                  style={{ background: crit.bg, color: crit.color, border: `1px solid ${crit.border}` }}
                >
                  {row.businessCriticality}
                </span>

                {/* Wave */}
                {row.wave != null ? (
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: '#006CFF' }}>
                    W{row.wave}
                  </span>
                ) : (
                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-disabled)' }}>
                    —
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
