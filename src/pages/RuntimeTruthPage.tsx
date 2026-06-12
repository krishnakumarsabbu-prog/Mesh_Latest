import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, TriangleAlert as AlertTriangle, CircleHelp as HelpCircle,
  CircleCheck as CheckCircle2, Zap, ChevronDown, ChevronRight,
  Database, MessageSquare, Server, Network, Clock, Activity, GitBranch,
  Eye, Layers, ArrowRight, CircleAlert as AlertCircle, Target,
  BookOpen, ChartBar as BarChart2, Radio, CloudOff, FlaskConical,
  CircleAlert, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  computeVerdict, computeSummaryVerdict, buildTimeline, buildDiscoveredSignals, buildServiceTopology,
  type RuntimeVerdict, type ComponentAuthority, type AuthoritySignal,
  type ScenarioResult, type DiscoveredSignal, type TimelineEvent, type ConfidenceBreakdown,
} from '@/lib/runtimeTruthEngine';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { ServiceTopologyMap } from '@/components/runtime/ServiceTopologyMap';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from 'recharts';

// ─── Utility helpers ──────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 85) return 'var(--success)';
  if (score >= 65) return 'var(--warning)';
  if (score >= 35) return '#FF9F0A';
  return 'var(--danger)';
}

function riskColor(risk: string): string {
  if (risk === 'LOW') return 'var(--success)';
  if (risk === 'MEDIUM') return 'var(--warning)';
  if (risk === 'HIGH') return '#FF9F0A';
  return 'var(--danger)';
}

function outcomeBg(outcome: ScenarioResult['outcome']) {
  if (outcome === 'SAFE')     return { bg: 'var(--success-subtle)', border: 'var(--success)', color: 'var(--success)' };
  if (outcome === 'DEGRADED') return { bg: 'var(--warning-subtle)', border: 'var(--warning)', color: 'var(--warning)' };
  if (outcome === 'PARTIAL')  return { bg: 'rgba(255,159,10,0.12)', border: '#FF9F0A',         color: '#FF9F0A' };
  return { bg: 'var(--danger-subtle)', border: 'var(--danger)', color: 'var(--danger)' };
}

function signalIcon(type: AuthoritySignal['type']) {
  if (type === 'deterministic') return <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} />;
  if (type === 'inferred')      return <GitBranch    className="w-3 h-3" style={{ color: 'var(--warning)' }} />;
  if (type === 'conflicting')   return <CircleAlert  className="w-3 h-3" style={{ color: 'var(--danger)'  }} />;
  if (type === 'missing')       return <HelpCircle   className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />;
  return <Clock className="w-3 h-3" style={{ color: 'var(--warning)' }} />;
}

function componentIcon(type: ComponentAuthority['type']) {
  const icons: Record<string, React.ElementType> = {
    DATABASE: Database, MESSAGING: MessageSquare, COMPUTE: Server,
    STORAGE: Layers, LOAD_BALANCER: Network,
  };
  const Icon = icons[type] ?? Server;
  return <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />;
}

function timelineImpactColor(impact: TimelineEvent['impact']) {
  if (impact === 'INFO')    return 'var(--accent)';
  if (impact === 'WARNING') return 'var(--warning)';
  return 'var(--danger)';
}

// ─── Confidence Gauge ─────────────────────────────────────────────────────────

function ConfidenceGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = confidenceColor(score);
  const radius = size === 'lg' ? 48 : size === 'md' ? 36 : 26;
  const strokeWidth = size === 'lg' ? 7 : size === 'md' ? 6 : 4;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const svgSize = (radius + strokeWidth) * 2;

  return (
    <svg width={svgSize} height={svgSize} className="rotate-[-90deg]">
      <circle cx={radius + strokeWidth} cy={radius + strokeWidth} r={radius}
        fill="none" stroke="var(--app-bg-muted)" strokeWidth={strokeWidth} />
      <circle cx={radius + strokeWidth} cy={radius + strokeWidth} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 4px ${color}40)` }} />
      <text x={radius + strokeWidth} y={radius + strokeWidth}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={size === 'lg' ? 16 : size === 'md' ? 12 : 9}
        fontWeight="bold" fill={color}
        style={{ transform: 'rotate(90deg)', transformOrigin: `${radius + strokeWidth}px ${radius + strokeWidth}px` }}>
        {score}%
      </text>
    </svg>
  );
}

// ─── Verdict Banner ───────────────────────────────────────────────────────────

function VerdictBanner({ verdict }: { verdict: RuntimeVerdict }) {
  const isConflict = verdict.authoritativeSite === 'CONFLICT';
  const isUnknown  = verdict.authoritativeSite === 'UNKNOWN';

  const bannerColor = isConflict || isUnknown ? 'var(--danger)'
    : verdict.risk === 'LOW' ? 'var(--success)' : verdict.risk === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)';
  const bannerBg = isConflict || isUnknown ? 'var(--danger-subtle)'
    : verdict.risk === 'LOW' ? 'var(--success-subtle)' : verdict.risk === 'MEDIUM' ? 'var(--warning-subtle)' : 'var(--danger-subtle)';

  const Icon = isConflict ? CircleAlert : isUnknown ? HelpCircle
    : verdict.canServeTransactions ? ShieldCheck : AlertTriangle;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 border"
      style={{ background: bannerBg, borderColor: bannerColor }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${bannerColor}20`, border: `1px solid ${bannerColor}40` }}>
            <Icon className="w-5 h-5" style={{ color: bannerColor }} />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: bannerColor }}>
              Runtime Verdict — {verdict.appName} / {verdict.environment}
            </p>
            <h2 className="text-[20px] font-extrabold text-[var(--text-primary)] leading-tight mt-0.5">
              {verdict.canServeTransactions ? `Authoritative Site: ${verdict.authoritativeSiteLabel}`
                : isConflict ? 'CONFLICT — Manual Verification Required'
                : 'UNKNOWN — Telemetry Insufficient'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <ConfidenceGauge score={verdict.confidence} size="lg" />
          <div className="flex flex-col gap-2">
            {[
              { label: 'State Owner',     value: verdict.stateOwner },
              { label: 'Traffic Owner',   value: verdict.trafficOwner },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{row.label}</span>
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">{row.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">DC2 Readiness</span>
              <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 rounded-full bg-[var(--app-bg-muted)] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${verdict.dc2ReadinessPercent}%`, background: confidenceColor(verdict.dc2ReadinessPercent) }} />
                </div>
                <span className="text-[11px] font-bold" style={{ color: confidenceColor(verdict.dc2ReadinessPercent) }}>
                  {verdict.dc2ReadinessPercent}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl text-[12px] leading-relaxed border"
        style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)', color: 'var(--text-secondary)' }}>
        <span className="font-semibold" style={{ color: bannerColor }}>Verdict: </span>
        {verdict.verdictSummary}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border uppercase tracking-wider"
          style={{ background: `${riskColor(verdict.risk)}15`, color: riskColor(verdict.risk), borderColor: riskColor(verdict.risk) }}>
          Risk: {verdict.risk}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">{verdict.riskReason}</span>
      </div>
    </div>
  );
}

// ─── Confidence Breakdown Panel ───────────────────────────────────────────────

function ConfidenceBreakdownPanel({ breakdown }: { breakdown: ConfidenceBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const metrics = [
    { label: 'Freshness',    value: breakdown.freshness,    max: 25, color: '#0A84FF' },
    { label: 'Determinism',  value: breakdown.determinism,  max: 25, color: '#30D158' },
    { label: 'Agreement',    value: breakdown.agreement,    max: 25, color: '#FF9F0A' },
    { label: 'Coverage',     value: breakdown.coverage,     max: 25, color: '#BF5AF2' },
  ];
  const radarData = metrics.map(m => ({ subject: m.label, value: (m.value / m.max) * 100, fullMark: 100 }));

  return (
    <div className="rounded-2xl border flex flex-col overflow-hidden"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <button className="flex items-center justify-between p-4 w-full text-left hover:bg-[var(--app-surface-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Confidence Engine Breakdown</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${confidenceColor(breakdown.total)}20`, color: confidenceColor(breakdown.total) }}>
            {breakdown.total}/100
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 flex flex-col gap-4 border-t" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--app-border)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                      <Radar name="Confidence" dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 flex flex-col gap-2.5">
                  {metrics.map(m => (
                    <div key={m.label} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{m.label}</span>
                        <span className="text-[11px] font-extrabold font-mono" style={{ color: m.color }}>{m.value}/{m.max}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--app-bg-muted)] overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(m.value / m.max) * 100}%` }}
                          transition={{ duration: 0.8, delay: 0.1 }}
                          className="h-full rounded-full" style={{ background: m.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Formula</p>
                {breakdown.explanation.map((exp, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-[var(--text-secondary)] border-l-2 pl-3 leading-relaxed"
                    style={{ borderColor: metrics[i]?.color ?? 'var(--accent)' }}>{exp}</div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Authority Matrix ─────────────────────────────────────────────────────────

function RoleChip({ role, dc }: { role: string; dc: string }) {
  const isPrimary = role.toLowerCase().includes('primary') || role.toLowerCase().includes('active') || role.toLowerCase().includes('leader') || role.toLowerCase().includes('writer');
  const isConflict = role.toLowerCase().includes('conflict');
  const color = isConflict ? 'var(--danger)' : isPrimary ? 'var(--success)' : 'var(--text-muted)';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold" style={{ color }}>{role}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{dc}</span>
    </div>
  );
}

function FailoverBadge({ type }: { type: ComponentAuthority['failoverType'] }) {
  const cfg = {
    AUTOMATIC: { label: 'Auto',   color: 'var(--success)', bg: 'var(--success-subtle)' },
    MANUAL:    { label: 'Manual', color: 'var(--warning)', bg: 'var(--warning-subtle)' },
    NONE:      { label: 'None',   color: 'var(--danger)',  bg: 'var(--danger-subtle)'  },
  }[type];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.color }}>{cfg.label}</span>
  );
}

function AuthorityMatrix({ components }: { components: ComponentAuthority[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <Target className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Component Authority Matrix</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-1">— Who owns state right now?</span>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ background: 'var(--app-surface)' }}>
            {['Component', 'Technology', 'DC1 Role', 'DC2 Role', 'Write Authority', 'Failover', 'Evidence'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map(comp => {
            const isExpanded = expandedId === comp.id;
            const hasConflict = comp.authoritative.startsWith('⚠');
            return (
              <React.Fragment key={comp.id}>
                <tr className="cursor-pointer hover:bg-[var(--app-surface-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--app-border)', background: hasConflict ? 'var(--danger-subtle)' : 'transparent' }}
                  onClick={() => setExpandedId(isExpanded ? null : comp.id)}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {componentIcon(comp.type)}
                      <span className="text-[12px] font-semibold text-[var(--text-primary)]">{comp.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className="text-[11px] text-[var(--text-muted)]">{comp.technology}</span></td>
                  <td className="px-3 py-3"><RoleChip role={comp.dc1Role} dc={comp.dc1Site} /></td>
                  <td className="px-3 py-3">
                    {comp.dc2Site !== '—' ? <RoleChip role={comp.dc2Role} dc={comp.dc2Site} /> :
                      <span className="text-[11px] text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('text-[11px] font-semibold', hasConflict ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]')}>
                      {comp.authoritative}
                    </span>
                  </td>
                  <td className="px-3 py-3"><FailoverBadge type={comp.failoverType} /></td>
                  <td className="px-3 py-3">
                    <button className="flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] hover:underline">
                      <Eye className="w-3 h-3" />{isExpanded ? 'Hide' : 'Show'}
                    </button>
                  </td>
                </tr>

                <AnimatePresence>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="px-0 py-0">
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="p-4 flex flex-col gap-3 border-t" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-subtle)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                              Evidence Signals — {comp.signals.length} source{comp.signals.length !== 1 ? 's' : ''}
                            </p>
                            <div className="flex flex-col gap-2">
                              {comp.signals.map((sig, i) => (
                                <div key={i} className="flex gap-3 items-start p-3 rounded-xl border"
                                  style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                                  <div className="mt-0.5 flex-shrink-0">{signalIcon(sig.type)}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-bold text-[var(--text-primary)]">{sig.source}</span>
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-[var(--text-muted)] bg-[var(--app-bg-muted)]">{sig.signal}={sig.value}</span>
                                      <span className="text-[10px]" style={{ color: sig.freshness === 'FRESH' ? 'var(--success)' : sig.freshness === 'MISSING' ? 'var(--text-muted)' : 'var(--warning)' }}>
                                        {sig.freshness}
                                      </span>
                                      <span className="text-[10px] text-[var(--text-muted)]">DC: {sig.dc}</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{sig.detail}</p>
                                  </div>
                                  <ConfidenceGauge score={sig.confidence * 25} size="sm" />
                                </div>
                              ))}
                            </div>
                            {comp.failoverRisk && (
                              <div className="flex items-start gap-2 p-2.5 rounded-lg border text-[11px]"
                                style={{ background: 'var(--warning-subtle)', borderColor: 'var(--warning)', color: 'var(--warning)' }}>
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>Failover Risk: {comp.failoverRisk}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── What-If Simulator ────────────────────────────────────────────────────────

function WhatIfSimulator({ scenarios }: { scenarios: ScenarioResult[] }) {
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const scenario = scenarios.find(s => s.id === activeScenario);

  const ScenarioIcon = ({ icon }: { icon: string }) => {
    const icons: Record<string, React.ElementType> = {
      zap: Zap, 'alert-triangle': AlertTriangle, clock: Clock,
      'check-circle': CheckCircle2, 'cloud-off': CloudOff,
      'git-branch': GitBranch, 'alert-circle': AlertCircle, 'help-circle': HelpCircle,
    };
    const I = icons[icon] ?? FlaskConical;
    return <I className="w-4 h-4" />;
  };

  return (
    <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">What-If Failover Simulator</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-1">— Can DC2 take over right now?</span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {scenarios.map(s => {
            const isActive = activeScenario === s.id;
            return (
              <button key={s.id}
                onClick={() => setActiveScenario(isActive ? null : s.id)}
                className="rounded-xl p-3 flex flex-col gap-2 items-start text-left transition-all border"
                style={{
                  background: isActive ? outcomeBg(s.outcome).bg : 'var(--app-surface-raised)',
                  borderColor: isActive ? outcomeBg(s.outcome).border : 'var(--app-border)',
                }}>
                <div className="flex items-center justify-between w-full">
                  <span style={{ color: outcomeBg(s.outcome).color }}><ScenarioIcon icon={s.icon} /></span>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                    style={{ background: outcomeBg(s.outcome).bg, color: outcomeBg(s.outcome).color, borderColor: outcomeBg(s.outcome).border }}>
                    {s.outcome}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">{s.name}</p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-[var(--text-muted)]">Conf:</span>
                  <span className="text-[10px] font-bold" style={{ color: confidenceColor(s.expectedConfidence) }}>{s.expectedConfidence}%</span>
                </div>
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {scenario && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4 border-t pt-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[14px] font-bold text-[var(--text-primary)]">{scenario.name}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{scenario.description}</p>
                </div>
                <ConfidenceGauge score={scenario.expectedConfidence} size="md" />
              </div>

              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--app-border)' }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--app-surface)' }}>
                      {['Component', 'DC1 After', 'DC2 After', 'Risk'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.components.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--app-border)' }}>
                        <td className="px-3 py-2.5"><span className="text-[12px] font-medium text-[var(--text-primary)]">{c.name}</span></td>
                        <td className="px-3 py-2.5">
                          <span className={cn('text-[11px]', c.dc1.includes('OFFLINE') ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-secondary)]')}>{c.dc1}</span>
                        </td>
                        <td className="px-3 py-2.5"><span className="text-[11px] text-[var(--text-secondary)]">{c.dc2}</span></td>
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] font-bold" style={{ color: c.risk === 'Critical' ? 'var(--danger)' : c.risk === 'High' ? '#FF9F0A' : c.risk === 'Medium' ? 'var(--warning)' : c.risk === 'None' ? 'var(--success)' : 'var(--text-muted)' }}>
                            {c.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {scenario.blockers.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--danger)]">Blockers</p>
                  {scenario.blockers.map((b, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                      <AlertCircle className="w-3.5 h-3.5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                      {b}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] leading-relaxed px-3 py-2 rounded-lg border text-[var(--text-muted)]"
                style={{ background: 'var(--app-bg-muted)', borderColor: 'var(--app-border)' }}>
                <span className="font-semibold text-[var(--text-secondary)]">Analysis: </span>{scenario.notes}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function OperationalTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Activity className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">No timeline events available</p>
        <p className="text-[11px] text-[var(--text-muted)]">Timeline is built from conflicts, drifts, stale sources, and snapshot transitions</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Operational Timeline</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-1">— Authority change history</span>
      </div>
      <div className="p-4">
        <div className="relative">
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-[var(--app-border)]" />
          <div className="flex flex-col gap-0">
            {events.map(event => {
              const color = timelineImpactColor(event.impact);
              return (
                <div key={event.id} className="flex gap-4 pb-5 relative">
                  <div className="relative z-10 flex-shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center border-2"
                      style={{ background: event.impact === 'INFO' ? 'var(--app-surface)' : `${color}20`, borderColor: color }}>
                      {event.impact === 'CRITICAL' ? <AlertCircle className="w-3 h-3" style={{ color }} />
                        : event.impact === 'WARNING' ? <AlertTriangle className="w-3 h-3" style={{ color }} />
                        : <CheckCircle2 className="w-3 h-3" style={{ color }} />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-[var(--text-primary)]">{event.title}</span>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                        style={{ background: `${color}15`, color, borderColor: `${color}40` }}>
                        {event.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{event.relativeTime}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">· {event.dc}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{event.detail}</p>
                    {event.authorityChange && (
                      <div className="flex items-center gap-2 mt-1.5 px-2.5 py-1 rounded-lg border w-fit text-[10px]"
                        style={{ background: 'var(--danger-subtle)', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                        <span className="font-bold">Authority Shift:</span>
                        <span>{event.authorityChange.from}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-bold">{event.authorityChange.to}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Data Discovery Marketplace ───────────────────────────────────────────────

function DataDiscoveryMarketplace({ signals }: { signals: DiscoveredSignal[] }) {
  const [filter, setFilter] = useState<string>('ALL');
  const categories = ['ALL', 'STATE_OWNERSHIP', 'TRAFFIC_FLOW', 'REPLICATION', 'HEALTH'];
  const filtered = filter === 'ALL' ? signals : signals.filter(s => s.category === filter);

  const categoryColor = (cat: string) => {
    if (cat === 'STATE_OWNERSHIP') return '#30D158';
    if (cat === 'TRAFFIC_FLOW')    return '#0A84FF';
    if (cat === 'REPLICATION')     return '#FF9F0A';
    return '#BF5AF2';
  };
  const techColors: Record<string, string> = { Oracle: '#FF6B35', MongoDB: '#4DB33D', 'IBM MQ': '#1F70C1', OpenShift: '#EE0000', APM: '#5AC8FA', Network: '#30D158', Storage: '#BF5AF2', Kafka: '#231F20', MSSQL: '#0078D4', VM: '#607D8B' };

  return (
    <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Data Discovery Marketplace</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[rgba(10,132,255,0.1)] text-[var(--accent)] border border-[rgba(10,132,255,0.2)]">
            {signals.length} signals
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all"
              style={filter === c ? { background: c === 'ALL' ? 'var(--accent)' : categoryColor(c), color: '#fff' } : { color: 'var(--text-muted)', background: 'transparent' }}>
              {c === 'ALL' ? 'All' : c.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(sig => (
          <motion.div key={sig.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl p-4 flex flex-col gap-3 border" style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: `${techColors[sig.technology] ?? 'var(--accent)'}20`, color: techColors[sig.technology] ?? 'var(--accent)' }}>
                    {sig.technology}
                  </span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border"
                    style={{ background: `${categoryColor(sig.category)}15`, color: categoryColor(sig.category), borderColor: `${categoryColor(sig.category)}40` }}>
                    {sig.category.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[12px] font-bold text-[var(--text-primary)] mt-1">{sig.displayName}</p>
              </div>
              {sig.deterministic
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} aria-label="Deterministic" />
                : <GitBranch    className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} aria-label="Inferred" />}
            </div>
            <div className="flex flex-col gap-1.5">
              <div><p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Signal</p>
                <p className="text-[11px] font-mono text-[var(--text-primary)]">{sig.signalName}</p></div>
              <div><p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">API Source</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">{sig.apiSource}</p></div>
              <p className="text-[10px] font-mono bg-[var(--app-bg-muted)] rounded px-2 py-1 text-[var(--text-secondary)] truncate">{sig.sampleValue}</p>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed border-t pt-2" style={{ borderColor: 'var(--app-border)' }}>
              {sig.description}
            </p>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-4 h-1.5 rounded-full"
                    style={{ background: i <= sig.confidence ? (sig.deterministic ? 'var(--success)' : 'var(--warning)') : 'var(--app-bg-muted)' }} />
                ))}
              </div>
              <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                sig.shared ? 'bg-[rgba(48,209,88,0.1)] text-[var(--success)]' : 'bg-[var(--app-bg-muted)] text-[var(--text-muted)]')}>
                {sig.shared ? 'SHARED' : 'LOCAL'}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Runtime DNA Graph ─────────────────────────────────────────────────────────

function VerticalDNAHelix({ confidence, isConflict }: { confidence: number; isConflict: boolean }) {
  const steps = 24;
  const height = 320;
  const width = 80;
  const amplitude = 18;
  const center = width / 2;
  const points: { y: number; x1: number; x2: number }[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * height;
    const angle = (i / steps) * Math.PI * 4; // 2 full turns
    const x1 = center + amplitude * Math.sin(angle);
    const x2 = center - amplitude * Math.sin(angle);
    points.push({ y, x1, x2 });
  }

  const pathA = `M ${points[0].x1} ${points[0].y} ` + points.map(p => `L ${p.x1} ${p.y}`).join(' ');
  const pathB = `M ${points[0].x2} ${points[0].y} ` + points.map(p => `L ${p.x2} ${p.y}`).join(' ');

  const color = isConflict ? '#FF453A' : confidence > 70 ? '#30D158' : confidence > 45 ? '#FF9F0A' : '#EF4444';

  return (
    <svg width={width} height={height} className="overflow-visible select-none">
      <defs>
        <linearGradient id="dnaGlow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.8} />
          <stop offset="50%" stopColor={color} stopOpacity={0.8} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.8} />
        </linearGradient>
      </defs>
      
      {/* Base pairs (connecting lines) */}
      {points.filter((_, idx) => idx % 2 === 0).map((p, idx) => (
        <line
          key={idx}
          x1={p.x1}
          y1={p.y}
          x2={p.x2}
          y2={p.y}
          stroke="var(--app-border-medium)"
          strokeWidth={1}
          strokeOpacity={0.4}
        />
      ))}
      
      {/* Helix strands */}
      <path d={pathA} fill="none" stroke="url(#dnaGlow)" strokeWidth={2.5} strokeLinecap="round" />
      <path d={pathB} fill="none" stroke="url(#dnaGlow)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="3 2" />
      
      {/* Base pair connection nodes */}
      {points.filter((_, idx) => idx % 3 === 0).map((p, idx) => (
        <React.Fragment key={idx}>
          <circle cx={p.x1} cy={p.y} r={3} fill="var(--accent)" className="animate-pulse" />
          <circle cx={p.x2} cy={p.y} r={3} fill={color} />
        </React.Fragment>
      ))}
    </svg>
  );
}

function RuntimeDNAGraph({ verdict }: { verdict: RuntimeVerdict }) {
  const isConflict = verdict.authoritativeSite === 'CONFLICT';
  const isUnknown  = verdict.authoritativeSite === 'UNKNOWN';

  const nodes = [
    { id: 'app',       label: verdict.appName,            sub: 'Application',     color: 'var(--accent)' },
    { id: 'state',     label: verdict.stateOwner,         sub: 'State Owner',     color: isConflict || isUnknown ? 'var(--danger)' : 'var(--success)' },
    { id: 'traffic',   label: verdict.trafficOwner,       sub: 'Traffic Owner',   color: isUnknown ? 'var(--text-muted)' : 'var(--accent)' },
    { id: 'write',     label: `Write Authority: ${verdict.authoritativeSite}`, sub: 'Data Flow', color: isConflict || isUnknown ? 'var(--danger)' : 'var(--success)' },
    { id: 'authority', label: `Confidence: ${verdict.confidence}%`,           sub: 'Authority Chain', color: confidenceColor(verdict.confidence) },
  ];

  return (
    <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <Network className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Runtime DNA — Authority Chain</span>
      </div>
      <div className="p-6 flex items-center justify-center gap-8 md:gap-12">
        <div className="flex-shrink-0">
          <VerticalDNAHelix confidence={verdict.confidence} isConflict={isConflict} />
        </div>
        <div className="flex flex-col items-center gap-0">
          {nodes.map((node, i) => (
            <React.Fragment key={node.id}>
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="rounded-2xl px-5 py-3 flex flex-col items-center gap-1 w-64 border"
                style={{ background: `${node.color}12`, borderColor: `${node.color}50`, boxShadow: `0 0 12px ${node.color}20` }}>
                <span className="text-[12px] font-extrabold text-center leading-tight truncate max-w-full" style={{ color: node.color }}>{node.label}</span>
                <span className="text-[9px] uppercase tracking-widest font-bold text-[var(--text-muted)]">{node.sub}</span>
              </motion.div>
              {i < nodes.length - 1 && (
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-3 bg-[var(--app-border)]" />
                  <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                  <div className="w-px h-3 bg-[var(--app-border)]" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Grid ─────────────────────────────────────────────────────────────

function OverviewGrid({ onSelect, selectedApp }: {
  onSelect: (id: string) => void;
  selectedApp: string;
}) {
  const applications = useRuntimeLocationStore(s => s.applications);
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return applications.filter(a => {
      if (seen.has(a.application_id)) return false;
      seen.add(a.application_id);
      return true;
    });
  }, [applications]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {unique.map(app => {
        const sv = computeSummaryVerdict(app);
        const cfg: Record<string, { color: string; bg: string; border: string }> = {
          LOW:      { color: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success)' },
          MEDIUM:   { color: 'var(--warning)', bg: 'var(--warning-subtle)', border: 'var(--warning)' },
          HIGH:     { color: '#FF9F0A',         bg: 'rgba(255,159,10,0.12)', border: '#FF9F0A' },
          CRITICAL: { color: 'var(--danger)',  bg: 'var(--danger-subtle)',  border: 'var(--danger)' },
        };
        const c = cfg[sv.risk] ?? cfg.MEDIUM;
        const isActive = selectedApp === app.application_id;

        return (
          <motion.button key={app.application_id}
            whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.99 }}
            onClick={() => onSelect(app.application_id)}
            className="rounded-2xl p-4 flex flex-col gap-3 border text-left transition-all"
            style={{
              background: isActive ? c.bg : 'var(--app-surface)',
              borderColor: isActive ? c.border : 'var(--app-border)',
              boxShadow: isActive ? `0 0 0 2px ${c.color}30` : 'none',
            }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${c.color}20`, border: `1px solid ${c.color}30` }}>
                  {sv.canServeTransactions ? <ShieldCheck className="w-4 h-4" style={{ color: c.color }} /> :
                    sv.authoritativeSite === 'CONFLICT' ? <CircleAlert className="w-4 h-4" style={{ color: c.color }} /> :
                    <HelpCircle className="w-4 h-4" style={{ color: c.color }} />}
                </div>
                <div>
                  <p className="text-[12px] font-extrabold text-[var(--text-primary)]">{app.application_name}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{app.environment}</p>
                </div>
              </div>
              <ConfidenceGauge score={sv.confidence} size="sm" />
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Authority Site</p>
              <p className="text-[12px] font-bold mt-0.5" style={{ color: sv.authoritativeSite === 'UNKNOWN' ? 'var(--danger)' : 'var(--text-primary)' }}>
                {sv.authoritativeSite}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: c.bg, color: c.color, borderColor: c.border }}>
                Risk: {sv.risk}
              </span>
              <span className="text-[10px] text-[var(--accent)] font-semibold flex items-center gap-1">
                Drill in <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SubTab = 'verdict' | 'matrix' | 'topology' | 'whatif' | 'timeline' | 'discovery' | 'dna';

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'verdict',   label: 'Verdict',     icon: ShieldCheck   },
  { id: 'matrix',    label: 'Authority Matrix', icon: Target   },
  { id: 'topology',  label: 'Service Map', icon: Network       },
  { id: 'whatif',    label: 'What-If Sim', icon: FlaskConical  },
  { id: 'timeline',  label: 'Timeline',    icon: Activity      },
  { id: 'discovery', label: 'Discovery',   icon: Radio         },
  { id: 'dna',       label: 'DNA Graph',   icon: Network       },
];

export function RuntimeTruthPage() {
  const { applications, loadApplications, loadDetail, loadSnapshots, selectedDetail, snapshots, drifts, isLoadingApplications } = useRuntimeLocationStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const uniqueApps = useMemo(() => {
    const seen = new Set<string>();
    return applications.filter(a => {
      if (seen.has(a.application_id)) return false;
      seen.add(a.application_id);
      return true;
    });
  }, [applications]);

  const [selectedApp, setSelectedApp] = useState<string>('');
  const [subTab, setSubTab] = useState<SubTab>('verdict');

  // Load apps on mount
  useEffect(() => {
    loadApplications();
  }, []);

  // Set default selection once apps load — honour ?appId= from URL
  useEffect(() => {
    if (uniqueApps.length > 0 && !selectedApp) {
      const urlAppId = searchParams.get('appId');
      const match = urlAppId ? uniqueApps.find(a => a.application_id === urlAppId) : null;
      setSelectedApp(match ? match.application_id : uniqueApps[0].application_id);
    }
  }, [uniqueApps]);

  // Load detail when selection changes
  useEffect(() => {
    if (selectedApp) {
      const urlEnv = searchParams.get('env') ?? 'PRODUCTION';
      const app = uniqueApps.find(a => a.application_id === selectedApp);
      const env = app?.environment ?? urlEnv;
      loadDetail(selectedApp, env);
      loadSnapshots(selectedApp, env);
    }
  }, [selectedApp]);

  // Compute verdict from real store data
  const verdict = useMemo(() => {
    if (!selectedDetail) return null;
    return computeVerdict(selectedDetail, drifts, snapshots);
  }, [selectedDetail, drifts, snapshots]);

  const timeline = useMemo(() => {
    if (!selectedDetail) return [];
    return buildTimeline(selectedDetail, snapshots, drifts);
  }, [selectedDetail, snapshots, drifts]);

  const discoveredSignals = useMemo(() => {
    if (!selectedDetail) return [];
    return buildDiscoveredSignals(selectedDetail);
  }, [selectedDetail]);

  const topology = useMemo(() => {
    if (!selectedDetail) return null;
    return buildServiceTopology(selectedDetail);
  }, [selectedDetail]);

  // Summary stats from all apps
  const totalApps     = uniqueApps.length;
  const trustedApps   = uniqueApps.filter(a => computeSummaryVerdict(a).canServeTransactions).length;
  const conflictApps  = uniqueApps.filter(a => (a.missing_source_count ?? 0) > 1 || computeSummaryVerdict(a).confidence < 30).length;
  const avgConfidence = uniqueApps.length > 0 ? Math.round(uniqueApps.reduce((s, a) => s + computeSummaryVerdict(a).confidence, 0) / uniqueApps.length) : 0;

  if (isLoadingApplications && applications.length === 0) {
    return (
      <div className="px-6 py-8 flex flex-col gap-4 max-w-[1400px] mx-auto">
        {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--app-surface)' }} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="rounded-3xl p-6 border relative overflow-hidden"
        style={{ background: 'var(--map-container-bg)', borderColor: 'var(--app-border)', boxShadow: 'var(--shadow-md)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                Runtime Truth & Decision Intelligence
              </span>
            </div>
            <h1 className="text-[28px] font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
              Can this app process transactions <span style={{ color: 'var(--accent)' }}>RIGHT NOW?</span>
            </h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-2">
              Authoritative runtime state · Confidence scoring · Explainability · What-If simulation · Live from in-memory store
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
            {[
              { label: 'Applications', value: totalApps,    color: 'var(--accent)'  },
              { label: 'Trusted',      value: trustedApps,  color: 'var(--success)' },
              { label: 'At Risk',      value: conflictApps, color: 'var(--danger)'  },
              { label: 'Avg Conf.',    value: `${avgConfidence}%`, color: confidenceColor(avgConfidence) },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl p-3 flex flex-col items-center justify-center border"
                style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <span className="text-[22px] font-extrabold" style={{ color: stat.color }}>{stat.value}</span>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* App Overview Grid */}
      {uniqueApps.length > 0 ? (
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3">Select Application</p>
          <OverviewGrid onSelect={id => { setSelectedApp(id); setSubTab('verdict'); }} selectedApp={selectedApp} />
        </div>
      ) : (
        <div className="rounded-2xl border p-8 flex flex-col items-center gap-3 text-center"
          style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
          <RefreshCw className="w-8 h-8 text-[var(--text-muted)]" />
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">No applications loaded</p>
          <button onClick={() => loadApplications()}
            className="text-[12px] font-semibold text-[var(--accent)] hover:underline">
            Load Sample Data
          </button>
        </div>
      )}

      {/* Detail section */}
      {selectedApp && (
        <div className="flex flex-col gap-4">
          {/* Sub-tab bar */}
          <div className="flex items-center gap-1 p-1 rounded-2xl w-fit overflow-x-auto max-w-full"
            style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
            {SUB_TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSubTab(id)}
                className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-extrabold transition-all flex-shrink-0 uppercase tracking-wider')}
                style={subTab === id ? { background: 'var(--app-surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }
                  : { color: 'var(--text-muted)', border: '1px solid transparent' }}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {!verdict && selectedApp && (
            <div className="flex flex-col gap-3">
              {[1,2].map(i => <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--app-surface)' }} />)}
            </div>
          )}

          {/* Tab content */}
          {verdict && (
            <AnimatePresence mode="wait">
              <motion.div key={subTab + selectedApp}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }} className="flex flex-col gap-5">

                {subTab === 'verdict' && (
                  <>
                    <VerdictBanner verdict={verdict} />
                    <ConfidenceBreakdownPanel breakdown={verdict.confidenceBreakdown} />
                  </>
                )}

                {subTab === 'matrix' && <AuthorityMatrix components={verdict.components} />}

                {subTab === 'topology' && topology && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-[var(--accent)]" />
                      <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Service Dependency Map</span>
                      <span className="text-[10px] text-[var(--text-muted)]">— Color-coded by health · Click nodes/edges for details</span>
                    </div>
                    <ServiceTopologyMap topology={topology} />
                  </div>
                )}

                {subTab === 'whatif' && <WhatIfSimulator scenarios={verdict.scenarios} />}
                {subTab === 'timeline' && <OperationalTimeline events={timeline} />}
                {subTab === 'discovery' && <DataDiscoveryMarketplace signals={discoveredSignals} />}

                {subTab === 'dna' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <RuntimeDNAGraph verdict={verdict} />
                    <div className="rounded-2xl border p-5 flex flex-col gap-4"
                      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Signal Confidence</span>
                      </div>
                      {verdict.signals.length > 0 ? (
                        <div style={{ height: 200 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={verdict.signals.map(s => ({
                              name: s.source.length > 12 ? s.source.slice(0, 12) + '…' : s.source,
                              confidence: s.confidence * 25,
                              type: s.type,
                            }))} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                              <Tooltip contentStyle={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', borderRadius: 8, fontSize: 11 }} />
                              <Bar dataKey="confidence" radius={[4, 4, 0, 0]}>
                                {verdict.signals.map((s, i) => (
                                  <Cell key={i} fill={s.type === 'deterministic' ? '#30D158' : s.type === 'conflicting' ? '#FF453A' : s.type === 'missing' ? '#636366' : '#FF9F0A'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="text-[12px] text-[var(--text-muted)]">No signals available for this application.</p>
                      )}
                      <div className="flex items-center gap-4 flex-wrap">
                        {[{ label: 'Deterministic', color: '#30D158' }, { label: 'Inferred', color: '#FF9F0A' }, { label: 'Conflicting', color: '#FF453A' }, { label: 'Missing', color: '#636366' }].map(l => (
                          <div key={l.label} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                            <span className="text-[10px] text-[var(--text-muted)]">{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}
