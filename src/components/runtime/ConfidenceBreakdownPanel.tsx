import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, TriangleAlert as AlertTriangle, CircleHelp as HelpCircle,
  ChevronDown, ChevronRight, Info, Zap, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationLocationDetail, RuntimeAsset, DataSourceName } from '@/types';

// ─── Signal strength classification per FAQ #16 ───────────────────────────────

type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'WIP';

interface SignalRule {
  strength: SignalStrength;
  base_score: number;
  description: string;
  examples: string[];
}

const SIGNAL_RULES: Record<SignalStrength, SignalRule> = {
  STRONG: {
    strength: 'STRONG',
    base_score: 90,
    description: 'Deterministic control-plane source or load balancer configuration state',
    examples: ['IBM MQ CMDSERVER status', 'MongoDB rs_state=1 (PRIMARY)', 'AVI LB active pool'],
  },
  MODERATE: {
    strength: 'MODERATE',
    base_score: 65,
    description: 'Traffic flow indicators or APM traces — available but not fully standardised',
    examples: ['AppDynamics node inventory', 'OCP pod placement', 'CMDB topology'],
  },
  WEAK: {
    strength: 'WEAK',
    base_score: 40,
    description: 'Supporting only — CPU/memory utilisation; must not govern source of truth',
    examples: ['CPU utilisation', 'Memory pressure', 'Disk I/O'],
  },
  WIP: {
    strength: 'WIP',
    base_score: 50,
    description: 'Signal exists but is in a proprietary tool — confidence capped at MEDIUM',
    examples: ['Oracle OEM (proprietary API)', 'AVI Controller (WIP integration)'],
  },
};

const FRESHNESS_PENALTIES: { label: string; window: string; penalty: number; color: string }[] = [
  { label: 'FRESH',      window: '0 – 5 min',   penalty: 0,   color: '#30D158' },
  { label: 'FRESH',      window: '5 – 30 min',  penalty: 10,  color: '#30D158' },
  { label: 'STALE',      window: '30 min – 2 h', penalty: 25, color: '#FF9F0A' },
  { label: 'VERY STALE', window: '2 h – 24 h',  penalty: 50,  color: '#FF453A' },
  { label: 'DROPPED',    window: '> 24 h',       penalty: 100, color: '#8E8E93' },
];

const SOURCE_STRENGTH_MAP: Partial<Record<DataSourceName, SignalStrength>> = {
  ibm_mq:           'STRONG',
  mongodb:          'STRONG',
  oracle_oem:       'WIP',
  avi_loadbalancer: 'WIP',
  cmdb:             'MODERATE',
  scom:             'MODERATE',
  ocp:              'MODERATE',
  appdynamics:      'MODERATE',
  batch:            'MODERATE',
  kafka:            'MODERATE',
  mssql:            'MODERATE',
};

const STRENGTH_CONFIG: Record<SignalStrength, { color: string; bg: string; border: string; Icon: React.ElementType }> = {
  STRONG:   { color: '#30D158', bg: 'rgba(48,209,88,0.1)',    border: 'rgba(48,209,88,0.25)',   Icon: ShieldCheck },
  MODERATE: { color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)',   border: 'rgba(255,159,10,0.25)',  Icon: Activity },
  WEAK:     { color: '#FF453A', bg: 'rgba(255,69,58,0.1)',    border: 'rgba(255,69,58,0.25)',   Icon: AlertTriangle },
  WIP:      { color: '#8E8E93', bg: 'rgba(142,142,147,0.1)', border: 'rgba(142,142,147,0.25)', Icon: HelpCircle },
};

function getAgeMinutes(lastSeen: string | undefined): number {
  if (!lastSeen) return 9999;
  return (Date.now() - new Date(lastSeen).getTime()) / 60_000;
}

function getFreshnessRow(ageMin: number) {
  if (ageMin <= 5) return FRESHNESS_PENALTIES[0];
  if (ageMin <= 30) return FRESHNESS_PENALTIES[1];
  if (ageMin <= 120) return FRESHNESS_PENALTIES[2];
  if (ageMin <= 1440) return FRESHNESS_PENALTIES[3];
  return FRESHNESS_PENALTIES[4];
}

interface AssetSignal {
  assetName: string;
  dataSource: DataSourceName;
  strength: SignalStrength;
  baseScore: number;
  freshnessLabel: string;
  freshnessWindow: string;
  freshnessColor: string;
  penalty: number;
  netScore: number;
  conclusion: string;
  isDeterministic: boolean;
}

function buildSignals(detail: ApplicationLocationDetail): AssetSignal[] {
  const assets = detail.components.flatMap((c) => c.assets);
  return assets.map((asset): AssetSignal => {
    const src = (asset.data_source ?? 'cmdb') as DataSourceName;
    const strength = SOURCE_STRENGTH_MAP[src] ?? 'MODERATE';
    const rule = SIGNAL_RULES[strength];
    const ageMin = getAgeMinutes(asset.last_seen_at);
    const freshRow = getFreshnessRow(ageMin);
    const netScore = Math.max(0, rule.base_score - freshRow.penalty);

    const role = asset.latest_replication_role !== 'NONE' && asset.latest_replication_role
      ? asset.latest_replication_role
      : asset.latest_operational_state ?? 'UNKNOWN';
    const dc = asset.data_center?.short_name ?? '?';

    return {
      assetName: asset.name,
      dataSource: src,
      strength,
      baseScore: rule.base_score,
      freshnessLabel: freshRow.label,
      freshnessWindow: freshRow.window,
      freshnessColor: freshRow.color,
      penalty: freshRow.penalty,
      netScore,
      conclusion: `${role}@${dc}`,
      isDeterministic: asset.is_deterministic ?? false,
    };
  });
}

function getOverallScore(signals: AssetSignal[]): { score: number; label: string; color: string; reason: string } {
  if (signals.length === 0) return { score: 0, label: 'UNKNOWN', color: '#8E8E93', reason: 'No signals available' };

  const conclusions = new Set(signals.map((s) => s.conclusion));
  const activeSignals = signals.filter((s) => s.netScore > 0);

  if (activeSignals.length === 0) return { score: 0, label: 'UNKNOWN', color: '#8E8E93', reason: 'All signals dropped (>24h stale)' };

  // Detect conflict: multiple strong assertions about primary write DC disagree
  const writeSignals = signals.filter((s) => s.conclusion.includes('PRIMARY') || s.conclusion.includes('ACTIVE'));
  const writeDCs = new Set(writeSignals.map((s) => s.conclusion.split('@')[1]));
  if (writeDCs.size > 1) {
    return { score: 30, label: 'CONFLICT', color: '#FF453A', reason: `${writeDCs.size} sources disagree on primary write DC: ${[...writeDCs].join(' vs ')}` };
  }

  const best = activeSignals.reduce((a, b) => a.netScore > b.netScore ? a : b);
  const score = best.netScore;

  if (score >= 80) return { score, label: 'HIGH',    color: '#30D158', reason: `Best signal: ${best.dataSource} (${best.strength}, ${best.freshnessLabel})` };
  if (score >= 60) return { score, label: 'MEDIUM',  color: '#FF9F0A', reason: `Best signal: ${best.dataSource} (${best.strength}, ${best.freshnessLabel})` };
  if (score >= 40) return { score, label: 'LOW',     color: '#FF453A', reason: `Best signal: ${best.dataSource} (${best.strength}, ${best.freshnessLabel})` };
  return { score, label: 'UNKNOWN', color: '#8E8E93', reason: `All signals below threshold (best: ${score}/100)` };
}

// ─── Per-DC breakdown ─────────────────────────────────────────────────────────

interface DCBreakdown {
  dc: string;
  signals: AssetSignal[];
  score: number;
  label: string;
  color: string;
  primaryRole?: string;
  writeAuthority: boolean;
}

function buildDCBreakdowns(signals: AssetSignal[], detail: ApplicationLocationDetail): DCBreakdown[] {
  const allAssets = detail.components.flatMap((c) => c.assets);
  const dcMap = new Map<string, AssetSignal[]>();
  signals.forEach((sig) => {
    const dc = sig.conclusion.split('@')[1] ?? 'UNKNOWN';
    if (!dcMap.has(dc)) dcMap.set(dc, []);
    dcMap.get(dc)!.push(sig);
  });

  return [...dcMap.entries()].map(([dc, dcSignals]) => {
    const best = dcSignals.filter((s) => s.netScore > 0).reduce<AssetSignal | null>(
      (a, b) => !a || b.netScore > a.netScore ? b : a, null,
    );
    const score = best?.netScore ?? 0;
    const label = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : score >= 40 ? 'LOW' : 'UNKNOWN';
    const color = score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : score >= 40 ? '#FF453A' : '#8E8E93';

    const dcAssets = allAssets.filter((a) => a.data_center?.short_name === dc);
    const primaryAsset = dcAssets.find((a) => a.write_authority && a.latest_operational_state === 'ACTIVE');
    const primaryRole = primaryAsset
      ? (primaryAsset.latest_replication_role !== 'NONE' ? primaryAsset.latest_replication_role : 'ACTIVE')
      : dcSignals.find((s) => s.conclusion.includes('PRIMARY'))?.conclusion.split('@')[0];
    const writeAuthority = dcAssets.some((a) => a.write_authority);

    return { dc, signals: dcSignals, score, label, color, primaryRole, writeAuthority };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  detail: ApplicationLocationDetail;
  defaultExpanded?: boolean;
}

export function ConfidenceBreakdownPanel({ detail, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeSection, setActiveSection] = useState<'scoring' | 'signals' | 'freshness' | 'dc'>('scoring');

  const signals = buildSignals(detail);
  const overall = getOverallScore(signals);
  const dcBreakdowns = buildDCBreakdowns(signals, detail);

  const strongCount   = signals.filter((s) => s.strength === 'STRONG').length;
  const moderateCount = signals.filter((s) => s.strength === 'MODERATE').length;
  const warnCount     = signals.filter((s) => s.penalty >= 50).length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-all"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${overall.color}18` }}
          >
            <ShieldCheck className="w-4 h-4" style={{ color: overall.color }} />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Confidence Score Breakdown
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {overall.label} ({overall.score}/100) · {signals.length} signals · {strongCount} strong, {moderateCount} moderate
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: `${overall.color}18`, color: overall.color }}
          >
            {overall.label} — {overall.score}
          </span>
          {expanded
            ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          }
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--app-border)' }}>

              {/* Overall score banner */}
              <div
                className="mt-4 rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: `${overall.color}0a`, border: `1px solid ${overall.color}30` }}
              >
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: overall.color }} />
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: overall.color }}>
                    Overall: {overall.label} ({overall.score}/100)
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {overall.reason}
                  </p>
                </div>
              </div>

              {/* Section tabs */}
              <div className="flex gap-1">
                {(['scoring', 'signals', 'dc', 'freshness'] as const).map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setActiveSection(sec)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                      activeSection === sec ? 'text-white' : 'text-white/40 hover:text-white/70',
                    )}
                    style={{
                      background: activeSection === sec ? 'rgba(10,132,255,0.15)' : 'transparent',
                      border: activeSection === sec ? '1px solid rgba(10,132,255,0.3)' : '1px solid transparent',
                    }}
                  >
                    {sec === 'scoring' ? 'Scoring Model' : sec === 'signals' ? 'Signal Ledger' : sec === 'dc' ? 'Per-DC' : 'Freshness Rules'}
                  </button>
                ))}
              </div>

              {/* SECTION: Scoring model */}
              {activeSection === 'scoring' && (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Confidence is computed as: <code className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(255,255,255,0.08)', color: '#0A84FF' }}>
                      net_score = base_score(source_type) − freshness_penalty(age)
                    </code>
                  </p>

                  {/* Signal strength tiers per FAQ #16 */}
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <div className="px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--app-border)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Signal Strength Tiers (per FAQ §16)
                      </span>
                    </div>
                    {(['STRONG', 'MODERATE', 'WEAK', 'WIP'] as SignalStrength[]).map((tier) => {
                      const rule = SIGNAL_RULES[tier];
                      const cfg = STRENGTH_CONFIG[tier];
                      const Icon = cfg.Icon;
                      return (
                        <div
                          key={tier}
                          className="px-3 py-2.5 flex items-start gap-3"
                          style={{ borderBottom: '1px solid var(--app-border)' }}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                            <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold" style={{ color: cfg.color }}>{tier}</span>
                              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>base={rule.base_score}</span>
                            </div>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{rule.description}</p>
                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              e.g. {rule.examples.join(' · ')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Scoring formula reminder */}
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{ background: 'rgba(10,132,255,0.05)', border: '1px solid rgba(10,132,255,0.15)' }}
                  >
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#0A84FF' }}>Final Confidence Mapping</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'HIGH', range: '≥ 80', color: '#30D158' },
                        { label: 'MEDIUM', range: '≥ 60', color: '#FF9F0A' },
                        { label: 'LOW', range: '≥ 40', color: '#FF453A' },
                        { label: 'UNKNOWN', range: '< 40', color: '#8E8E93' },
                      ].map((m) => (
                        <div key={m.label} className="rounded-lg px-2 py-1.5" style={{ background: `${m.color}10`, border: `1px solid ${m.color}30` }}>
                          <p className="text-[10px] font-bold" style={{ color: m.color }}>{m.label}</p>
                          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.range}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: Signal ledger */}
              {activeSection === 'signals' && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--app-border)' }}>
                        {['Asset', 'Source', 'Type', 'Base', 'Freshness', 'Penalty', 'Net', 'Conclusion'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {signals.map((sig, i) => {
                        const cfg = STRENGTH_CONFIG[sig.strength];
                        const penaltyColor = sig.penalty === 0 ? '#30D158' : sig.penalty <= 10 ? '#30D158' : sig.penalty <= 25 ? '#FF9F0A' : '#FF453A';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--app-border)' }}>
                            <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-primary)' }}>
                              {sig.assetName}
                            </td>
                            <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                              {sig.dataSource}
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                                {sig.strength}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold" style={{ color: cfg.color }}>
                              {sig.baseScore}
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-semibold" style={{ color: sig.freshnessColor }}>{sig.freshnessLabel}</span>
                              <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>({sig.freshnessWindow})</span>
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold" style={{ color: penaltyColor }}>
                              -{sig.penalty}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold" style={{ color: sig.netScore >= 80 ? '#30D158' : sig.netScore >= 60 ? '#FF9F0A' : '#FF453A' }}>
                              {sig.netScore}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                              {sig.conclusion}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SECTION: Per-DC breakdown */}
              {activeSection === 'dc' && (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Per data-center signal confidence — a DC with LOW confidence may be blind to state changes there.
                  </p>
                  {dcBreakdowns.map((dc) => {
                    const cfg = STRENGTH_CONFIG[dc.score >= 80 ? 'STRONG' : dc.score >= 60 ? 'MODERATE' : 'WEAK'];
                    return (
                      <div
                        key={dc.dc}
                        className="rounded-xl px-4 py-3 flex items-center gap-4"
                        style={{ background: `${dc.color}0a`, border: `1px solid ${dc.color}30` }}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[14px] font-black"
                          style={{ background: `${dc.color}18`, color: dc.color }}
                        >
                          {dc.dc.slice(0, 3)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{dc.dc}</span>
                            {dc.writeAuthority && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(10,132,255,0.15)', color: '#0A84FF' }}>
                                WRITE AUTHORITY
                              </span>
                            )}
                            {dc.primaryRole && (
                              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{dc.primaryRole}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {dc.signals.length} signal{dc.signals.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {dc.signals.filter((s) => s.strength === 'STRONG').length} strong
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[18px] font-black font-mono" style={{ color: dc.color }}>{dc.score}</p>
                          <p className="text-[10px] font-bold" style={{ color: dc.color }}>{dc.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SECTION: Freshness rules */}
              {activeSection === 'freshness' && (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Each signal is penalised for age. Signals older than 24 h are dropped entirely (treated as UNKNOWN).
                  </p>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--app-border)' }}>
                          {['Age Window', 'Status', 'Penalty', 'Effect on 90-pt signal'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {FRESHNESS_PENALTIES.map((row) => {
                          const net = Math.max(0, 90 - row.penalty);
                          const netColor = net >= 80 ? '#30D158' : net >= 60 ? '#FF9F0A' : net >= 40 ? '#FF453A' : '#8E8E93';
                          return (
                            <tr key={row.window} style={{ borderBottom: '1px solid var(--app-border)' }}>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{row.window}</td>
                              <td className="px-3 py-2">
                                <span className="font-semibold" style={{ color: row.color }}>{row.label}</span>
                              </td>
                              <td className="px-3 py-2 font-mono font-bold" style={{ color: row.penalty > 0 ? '#FF9F0A' : '#30D158' }}>
                                -{row.penalty}
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold" style={{ color: netColor }}>
                                {row.penalty === 100 ? 'DROPPED' : `90 − ${row.penalty} = ${net}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {warnCount > 0 && (
                    <div
                      className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                      style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)' }}
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF9F0A' }} />
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-semibold" style={{ color: '#FF9F0A' }}>{warnCount} signal{warnCount !== 1 ? 's' : ''}</span> currently incurring heavy freshness penalties (≥ 50 pts). Consider refreshing data imports.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
