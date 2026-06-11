import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, TriangleAlert as AlertTriangle, CircleHelp as HelpCircle, CircleCheck as CheckCircle2, Circle as XCircle, Zap, ChevronDown, ChevronRight, Database, MessageSquare, Server, Network, Clock, Activity, GitBranch, Eye, Layers, TrendingUp, Search, ArrowRight, Info, CircleAlert as AlertCircle, RefreshCw, Cpu, Target, BookOpen, ChartBar as BarChart2, Radio, CloudOff, FlaskConical, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAllVerdicts, getRuntimeVerdict, getTimeline,
  GLOBAL_DISCOVERED_SIGNALS,
  type RuntimeVerdict, type ComponentAuthority, type AuthoritySignal,
  type ScenarioResult, type DiscoveredSignal, type TimelineEvent,
  type ConfidenceBreakdown,
} from '@/lib/runtimeTruthMock';
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
  if (outcome === 'SAFE') return { bg: 'var(--success-subtle)', border: 'var(--success)', color: 'var(--success)' };
  if (outcome === 'DEGRADED') return { bg: 'var(--warning-subtle)', border: 'var(--warning)', color: 'var(--warning)' };
  if (outcome === 'PARTIAL') return { bg: 'rgba(255,159,10,0.12)', border: '#FF9F0A', color: '#FF9F0A' };
  return { bg: 'var(--danger-subtle)', border: 'var(--danger)', color: 'var(--danger)' };
}

function signalIcon(type: AuthoritySignal['type']) {
  if (type === 'deterministic') return <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} />;
  if (type === 'inferred') return <GitBranch className="w-3 h-3" style={{ color: 'var(--warning)' }} />;
  if (type === 'conflicting') return <CircleAlert className="w-3 h-3" style={{ color: 'var(--danger)' }} />;
  if (type === 'missing') return <HelpCircle className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />;
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
  if (impact === 'INFO') return 'var(--accent)';
  if (impact === 'WARNING') return 'var(--warning)';
  return 'var(--danger)';
}

// ─── Mini Confidence Gauge ────────────────────────────────────────────────────

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
        style={{ transition: 'stroke-dashoffset 1s ease-in-out', filter: `drop-shadow(0 0 4px ${color}40)` }} />
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
  const isUnknown = verdict.authoritativeSite === 'UNKNOWN';
  const isHealthy = verdict.canServeTransactions;

  const bannerColor = isConflict || isUnknown ? 'var(--danger)' :
    verdict.risk === 'LOW' ? 'var(--success)' :
    verdict.risk === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)';

  const bannerBg = isConflict || isUnknown ? 'var(--danger-subtle)' :
    verdict.risk === 'LOW' ? 'var(--success-subtle)' :
    verdict.risk === 'MEDIUM' ? 'var(--warning-subtle)' : 'var(--danger-subtle)';

  const Icon = isConflict ? CircleAlert : isUnknown ? HelpCircle :
    isHealthy ? ShieldCheck : AlertTriangle;

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
              {verdict.canServeTransactions
                ? `Authoritative Site: ${verdict.authoritativeSiteLabel}`
                : isConflict ? 'CONFLICT — Manual Verification Required'
                : 'UNKNOWN — Telemetry Insufficient'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <ConfidenceGauge score={verdict.confidence} size="lg" />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">State Owner</span>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {verdict.stateOwner}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Traffic Owner</span>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {verdict.trafficOwner}
              </span>
            </div>
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
          style={{
            background: `${riskColor(verdict.risk)}15`,
            color: riskColor(verdict.risk),
            borderColor: riskColor(verdict.risk),
          }}>
          Risk: {verdict.risk}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {verdict.riskReason}
        </span>
      </div>
    </div>
  );
}

// ─── Confidence Breakdown ─────────────────────────────────────────────────────

function ConfidenceBreakdownPanel({ breakdown }: { breakdown: ConfidenceBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const metrics = [
    { label: 'Freshness', value: breakdown.freshness, max: 25, color: '#0A84FF' },
    { label: 'Determinism', value: breakdown.determinism, max: 25, color: '#30D158' },
    { label: 'Agreement', value: breakdown.agreement, max: 25, color: '#FF9F0A' },
    { label: 'Coverage', value: breakdown.coverage, max: 25, color: '#BF5AF2' },
  ];

  const radarData = metrics.map(m => ({ subject: m.label, value: (m.value / m.max) * 100, fullMark: 100 }));

  return (
    <div className="rounded-2xl border flex flex-col gap-0 overflow-hidden"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <button
        className="flex items-center justify-between p-4 w-full text-left hover:bg-[var(--app-surface-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Confidence Engine Breakdown
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${confidenceColor(breakdown.total)}20`, color: confidenceColor(breakdown.total) }}>
            {breakdown.total}/100
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 flex flex-col gap-4 border-t" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex flex-col md:flex-row gap-6 items-center">
                {/* Radar chart */}
                <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--app-border)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                      <Radar name="Confidence" dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar breakdown */}
                <div className="flex-1 flex flex-col gap-2.5">
                  {metrics.map(m => (
                    <div key={m.label} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{m.label}</span>
                        <span className="text-[11px] font-extrabold font-mono" style={{ color: m.color }}>
                          {m.value}/{m.max}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--app-bg-muted)] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(m.value / m.max) * 100}%` }}
                          transition={{ duration: 0.8, delay: 0.1 }}
                          className="h-full rounded-full"
                          style={{ background: m.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Formula Explanation</p>
                {breakdown.explanation.map((exp, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-[var(--text-secondary)] border-l-2 pl-3 leading-relaxed"
                    style={{ borderColor: metrics[i]?.color ?? 'var(--accent)' }}>
                    {exp}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Authority Matrix table ───────────────────────────────────────────────────

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
            {['Component', 'Technology', 'DC1 Role', 'DC2 Role', 'Write Authority', 'Failover', 'Explain'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map(comp => {
            const isExpanded = expandedId === comp.id;
            const hasConflict = comp.authoritative.startsWith('⚠');
            return (
              <React.Fragment key={comp.id}>
                <tr
                  className="cursor-pointer hover:bg-[var(--app-surface-hover)] transition-colors"
                  style={{
                    borderBottom: '1px solid var(--app-border)',
                    background: hasConflict ? 'var(--danger-subtle)' : 'transparent',
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {componentIcon(comp.type)}
                      <span className="text-[12px] font-semibold text-[var(--text-primary)]">{comp.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[11px] text-[var(--text-muted)]">{comp.technology}</span>
                  </td>
                  <td className="px-3 py-3">
                    <RoleChip role={comp.dc1Role} dc={comp.dc1Site} />
                  </td>
                  <td className="px-3 py-3">
                    {comp.dc2Site !== '—' ? <RoleChip role={comp.dc2Role} dc={comp.dc2Site} /> :
                      <span className="text-[11px] text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('text-[11px] font-semibold', hasConflict ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]')}>
                      {comp.authoritative}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <FailoverBadge type={comp.failoverType} />
                  </td>
                  <td className="px-3 py-3">
                    <button className="flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] hover:underline">
                      <Eye className="w-3 h-3" />
                      {isExpanded ? 'Hide' : 'Show'}
                    </button>
                  </td>
                </tr>

                <AnimatePresence>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="px-0 py-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
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
  const config = {
    AUTOMATIC: { label: 'Auto', color: 'var(--success)', bg: 'var(--success-subtle)' },
    MANUAL: { label: 'Manual', color: 'var(--warning)', bg: 'var(--warning-subtle)' },
    NONE: { label: 'None', color: 'var(--danger)', bg: 'var(--danger-subtle)' },
  }[type];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ background: config.bg, color: config.color, borderColor: config.color }}>
      {config.label}
    </span>
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
      'git-branch': GitBranch, 'alert-circle': AlertCircle,
      'help-circle': HelpCircle,
    };
    const I = icons[icon] ?? FlaskConical;
    return <I className="w-4 h-4" />;
  };

  return (
    <div className="rounded-2xl border flex flex-col gap-0 overflow-hidden"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">What-If Failover Simulator</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-1">— Can DC2 take over right now?</span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Scenario selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {scenarios.map(s => {
            const { color, border } = outcomeBg(s.outcome);
            const isActive = activeScenario === s.id;
            return (
              <button key={s.id}
                onClick={() => setActiveScenario(isActive ? null : s.id)}
                className="rounded-xl p-3 flex flex-col gap-2 items-start text-left transition-all border"
                style={{
                  background: isActive ? outcomeBg(s.outcome).bg : 'var(--app-surface-raised)',
                  borderColor: isActive ? outcomeBg(s.outcome).border : 'var(--app-border)',
                  boxShadow: isActive ? `0 0 0 2px ${outcomeBg(s.outcome).border}40` : 'none',
                }}>
                <div className="flex items-center justify-between w-full">
                  <span style={{ color: outcomeBg(s.outcome).color }}>
                    <ScenarioIcon icon={s.icon} />
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                    style={{ background: outcomeBg(s.outcome).bg, color: outcomeBg(s.outcome).color, borderColor: outcomeBg(s.outcome).border }}>
                    {s.outcome}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">{s.name}</p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-[var(--text-muted)]">Expected confidence:</span>
                  <span className="text-[10px] font-bold" style={{ color: confidenceColor(s.expectedConfidence) }}>
                    {s.expectedConfidence}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Scenario detail */}
        <AnimatePresence>
          {scenario && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4 border-t pt-4"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[14px] font-bold text-[var(--text-primary)]">{scenario.name}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{scenario.description}</p>
                </div>
                <ConfidenceGauge score={scenario.expectedConfidence} size="md" />
              </div>

              {/* Component impact table */}
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
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-medium text-[var(--text-primary)]">{c.name}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('text-[11px]', c.dc1.includes('OFFLINE') ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-secondary)]')}>
                            {c.dc1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] text-[var(--text-secondary)]">{c.dc2}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] font-bold" style={{
                            color: c.risk === 'Critical' ? 'var(--danger)' :
                              c.risk === 'High' ? '#FF9F0A' :
                              c.risk === 'Medium' ? 'var(--warning)' :
                              c.risk === 'None' ? 'var(--success)' : 'var(--text-muted)',
                          }}>{c.risk}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {scenario.blockers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--danger)]">Blockers</p>
                  {scenario.blockers.map((b, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                      <XCircle className="w-3.5 h-3.5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
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

// ─── Operational Timeline ─────────────────────────────────────────────────────

function OperationalTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="rounded-2xl border flex flex-col gap-0 overflow-hidden"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Operational Timeline</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-1">— Authority change history</span>
      </div>

      <div className="p-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-[var(--app-border)]" />

          <div className="flex flex-col gap-0">
            {events.map((event, i) => {
              const impactColor = timelineImpactColor(event.impact);
              return (
                <div key={event.id} className="flex gap-4 pb-5 relative">
                  {/* Dot */}
                  <div className="relative z-10 flex-shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center border-2"
                      style={{
                        background: event.impact === 'INFO' ? 'var(--app-surface)' : `${impactColor}20`,
                        borderColor: impactColor,
                      }}>
                      {event.impact === 'CRITICAL' ? <AlertCircle className="w-3 h-3" style={{ color: impactColor }} /> :
                       event.impact === 'WARNING' ? <AlertTriangle className="w-3 h-3" style={{ color: impactColor }} /> :
                       <CheckCircle2 className="w-3 h-3" style={{ color: impactColor }} />}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-[var(--text-primary)]">{event.title}</span>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                        style={{
                          background: `${impactColor}15`,
                          color: impactColor,
                          borderColor: `${impactColor}40`,
                        }}>
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
    if (cat === 'TRAFFIC_FLOW') return '#0A84FF';
    if (cat === 'REPLICATION') return '#FF9F0A';
    return '#BF5AF2';
  };

  const techColors: Record<string, string> = {
    Oracle: '#FF6B35', MongoDB: '#4DB33D', 'IBM MQ': '#1F70C1',
    OCP: '#EE0000', APM: '#5AC8FA', Network: '#30D158', Storage: '#BF5AF2',
    Kafka: '#231F20', Log: '#FF9F0A', Windows: '#0078D4',
  };

  return (
    <div className="rounded-2xl border flex flex-col gap-0 overflow-hidden"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b"
        style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Data Discovery Marketplace</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[rgba(10,132,255,0.1)] text-[var(--accent)] border border-[rgba(10,132,255,0.2)]">
            {signals.length} signals discovered
          </span>
        </div>
        <div className="flex items-center gap-1">
          {categories.map(c => (
            <button key={c}
              onClick={() => setFilter(c)}
              className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all"
              style={filter === c ? {
                background: c === 'ALL' ? 'var(--accent)' : categoryColor(c),
                color: '#fff',
              } : { color: 'var(--text-muted)', background: 'transparent' }}>
              {c === 'ALL' ? 'All' : c.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(sig => (
          <motion.div key={sig.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl p-4 flex flex-col gap-3 border"
            style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: `${techColors[sig.technology] ?? 'var(--accent)'}20`, color: techColors[sig.technology] ?? 'var(--accent)' }}>
                    {sig.technology}
                  </span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border"
                    style={{
                      background: `${categoryColor(sig.category)}15`,
                      color: categoryColor(sig.category),
                      borderColor: `${categoryColor(sig.category)}40`,
                    }}>
                    {sig.category.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[12px] font-bold text-[var(--text-primary)] mt-1">{sig.displayName}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {sig.deterministic ? (
                  <span title="Deterministic — verified source">
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
                  </span>
                ) : (
                  <span title="Inferred — not deterministic">
                    <GitBranch className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Signal Name</p>
                <p className="text-[11px] font-mono text-[var(--text-primary)]">{sig.signalName}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">API Source</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate" title={sig.apiSource}>{sig.apiSource}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Sample Value</p>
                <p className="text-[10px] font-mono bg-[var(--app-bg-muted)] rounded px-2 py-1 text-[var(--text-secondary)] mt-0.5 truncate">
                  {sig.sampleValue}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed border-t pt-2"
              style={{ borderColor: 'var(--app-border)' }}>
              {sig.description}
            </p>

            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-4 h-1.5 rounded-full"
                    style={{ background: i <= sig.confidence ? (sig.deterministic ? 'var(--success)' : 'var(--warning)') : 'var(--app-bg-muted)' }} />
                ))}
                <span className="text-[10px] ml-1 text-[var(--text-muted)]">conf.</span>
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

// ─── Runtime DNA Graph ────────────────────────────────────────────────────────

function RuntimeDNAGraph({ verdict }: { verdict: RuntimeVerdict }) {
  const isConflict = verdict.authoritativeSite === 'CONFLICT';
  const isUnknown = verdict.authoritativeSite === 'UNKNOWN';

  const nodes = [
    { id: 'app', label: verdict.appName, sub: 'Application', color: 'var(--accent)', level: 0 },
    { id: 'state', label: verdict.stateOwner, sub: 'State Owner', color: isConflict || isUnknown ? 'var(--danger)' : 'var(--success)', level: 1 },
    { id: 'traffic', label: verdict.trafficOwner, sub: 'Traffic Owner', color: isUnknown ? 'var(--text-muted)' : 'var(--accent)', level: 1 },
    { id: 'write', label: verdict.canServeTransactions ? 'Write Authority: ' + verdict.authoritativeSite : 'Write Authority: UNKNOWN', sub: 'Data Flow', color: isConflict || isUnknown ? 'var(--danger)' : 'var(--success)', level: 2 },
    { id: 'authority', label: `Confidence: ${verdict.confidence}%`, sub: 'Authority Chain', color: confidenceColor(verdict.confidence), level: 3 },
  ];

  return (
    <div className="rounded-2xl border flex flex-col gap-0 overflow-hidden"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <Network className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Runtime DNA — Authority Chain</span>
      </div>

      <div className="p-6 flex flex-col items-center gap-0">
        {nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl px-5 py-3 flex flex-col items-center gap-1 w-64 border"
              style={{
                background: `${node.color}12`,
                borderColor: `${node.color}50`,
                boxShadow: `0 0 12px ${node.color}20`,
              }}>
              <span className="text-[13px] font-extrabold text-center leading-tight" style={{ color: node.color }}>
                {node.label}
              </span>
              <span className="text-[9px] uppercase tracking-widest font-bold text-[var(--text-muted)]">{node.sub}</span>
            </motion.div>

            {i < nodes.length - 1 && (
              <div className="flex flex-col items-center gap-0 py-1">
                <div className="w-px h-4 bg-[var(--app-border)]" />
                <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                <div className="w-px h-4 bg-[var(--app-border)]" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── App selector pills ───────────────────────────────────────────────────────

const APP_RISK_CONFIG = {
  LOW: { color: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success)' },
  MEDIUM: { color: 'var(--warning)', bg: 'var(--warning-subtle)', border: 'var(--warning)' },
  HIGH: { color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)', border: '#FF9F0A' },
  CRITICAL: { color: 'var(--danger)', bg: 'var(--danger-subtle)', border: 'var(--danger)' },
};

// ─── Overview Cards Grid ──────────────────────────────────────────────────────

function OverviewGrid({ verdicts, onSelect }: { verdicts: RuntimeVerdict[]; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {verdicts.map(v => {
        const cfg = APP_RISK_CONFIG[v.risk];
        const isConflict = v.authoritativeSite === 'CONFLICT';
        const isUnknown = v.authoritativeSite === 'UNKNOWN';
        return (
          <motion.button
            key={v.appId}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSelect(v.appId)}
            className="rounded-2xl p-4 flex flex-col gap-3 border text-left transition-all"
            style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}30` }}>
                  {v.canServeTransactions ? <ShieldCheck className="w-4 h-4" style={{ color: cfg.color }} /> :
                    isConflict ? <CircleAlert className="w-4 h-4" style={{ color: cfg.color }} /> :
                    <HelpCircle className="w-4 h-4" style={{ color: cfg.color }} />}
                </div>
                <div>
                  <p className="text-[12px] font-extrabold text-[var(--text-primary)]">{v.appName}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{v.environment}</p>
                </div>
              </div>
              <ConfidenceGauge score={v.confidence} size="sm" />
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Authoritative Site</p>
              <p className="text-[12px] font-bold mt-0.5" style={{
                color: isConflict || isUnknown ? 'var(--danger)' : 'var(--text-primary)',
              }}>
                {v.authoritativeSiteLabel}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                Risk: {v.risk}
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

type SubTab = 'verdict' | 'matrix' | 'whatif' | 'timeline' | 'discovery' | 'dna';

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'verdict',   label: 'Verdict',     icon: ShieldCheck },
  { id: 'matrix',    label: 'Authority Matrix', icon: Target },
  { id: 'whatif',    label: 'What-If Sim', icon: FlaskConical },
  { id: 'timeline',  label: 'Timeline',    icon: Activity },
  { id: 'discovery', label: 'Discovery',   icon: Radio },
  { id: 'dna',       label: 'DNA Graph',   icon: Network },
];

export function RuntimeTruthPage() {
  const navigate = useNavigate();
  const verdicts = getAllVerdicts();
  const [selectedApp, setSelectedApp] = useState<string>(verdicts[0]?.appId ?? 'PCA');
  const [subTab, setSubTab] = useState<SubTab>('verdict');

  const verdict = useMemo(() => getRuntimeVerdict(selectedApp), [selectedApp]);
  const timeline = useMemo(() => getTimeline(selectedApp), [selectedApp]);

  const globalDiscovery = GLOBAL_DISCOVERED_SIGNALS;

  // Summary stats
  const totalApps = verdicts.length;
  const trustedApps = verdicts.filter(v => v.canServeTransactions).length;
  const conflictApps = verdicts.filter(v => v.authoritativeSite === 'CONFLICT').length;
  const avgConfidence = Math.round(verdicts.reduce((a, v) => a + v.confidence, 0) / verdicts.length);

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="rounded-3xl p-6 border relative overflow-hidden"
        style={{
          background: 'var(--map-container-bg)',
          borderColor: 'var(--app-border)',
          boxShadow: 'var(--shadow-md)',
        }}>
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
              Authoritative runtime state · Confidence scoring · Explainability · What-If simulation
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
            {[
              { label: 'Applications', value: totalApps, color: 'var(--accent)' },
              { label: 'Trusted', value: trustedApps, color: 'var(--success)' },
              { label: 'Conflicts', value: conflictApps, color: 'var(--danger)' },
              { label: 'Avg Confidence', value: `${avgConfidence}%`, color: confidenceColor(avgConfidence) },
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

      {/* Application Overview Grid */}
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3">
          Select Application to Drill In
        </p>
        <OverviewGrid verdicts={verdicts} onSelect={(id) => { setSelectedApp(id); setSubTab('verdict'); }} />
      </div>

      {/* Selected App — Sub-tabs + content */}
      {verdict && (
        <div className="flex flex-col gap-4">
          {/* Sub-tab bar */}
          <div className="flex items-center gap-1 p-1 rounded-2xl w-fit overflow-x-auto max-w-full"
            style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
            {SUB_TABS.map(({ id, label, icon: Icon }) => (
              <button key={id}
                onClick={() => setSubTab(id)}
                className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-extrabold transition-all flex-shrink-0 uppercase tracking-wider')}
                style={subTab === id ? {
                  background: 'var(--app-surface-hover)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--app-border)',
                } : {
                  color: 'var(--text-muted)',
                  border: '1px solid transparent',
                }}>
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={subTab + selectedApp}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-5"
            >
              {subTab === 'verdict' && (
                <>
                  <VerdictBanner verdict={verdict} />
                  <ConfidenceBreakdownPanel breakdown={verdict.confidenceBreakdown} />
                </>
              )}

              {subTab === 'matrix' && (
                <AuthorityMatrix components={verdict.components} />
              )}

              {subTab === 'whatif' && (
                <WhatIfSimulator scenarios={verdict.scenarios} />
              )}

              {subTab === 'timeline' && (
                <OperationalTimeline events={timeline} />
              )}

              {subTab === 'discovery' && (
                <DataDiscoveryMarketplace
                  signals={verdict.discoveredSignals.length > 0 ? verdict.discoveredSignals : globalDiscovery}
                />
              )}

              {subTab === 'dna' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <RuntimeDNAGraph verdict={verdict} />
                  <div className="rounded-2xl border p-5 flex flex-col gap-4"
                    style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                      <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Signal Confidence Chart
                      </span>
                    </div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={verdict.signals.map(s => ({
                            name: s.source.length > 12 ? s.source.slice(0, 12) + '…' : s.source,
                            confidence: s.confidence * 25,
                            fill: s.type === 'deterministic' ? '#30D158' :
                              s.type === 'conflicting' ? '#FF453A' :
                              s.type === 'missing' ? '#636366' : '#FF9F0A',
                          }))}
                          margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--app-surface-raised)',
                              border: '1px solid var(--app-border)',
                              borderRadius: 8,
                              fontSize: 11,
                            }}
                          />
                          <Bar dataKey="confidence" radius={[4, 4, 0, 0]}>
                            {verdict.signals.map((s, i) => (
                              <Cell key={i} fill={
                                s.type === 'deterministic' ? '#30D158' :
                                s.type === 'conflicting' ? '#FF453A' :
                                s.type === 'missing' ? '#636366' : '#FF9F0A'
                              } />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      {[
                        { label: 'Deterministic', color: '#30D158' },
                        { label: 'Inferred', color: '#FF9F0A' },
                        { label: 'Conflicting', color: '#FF453A' },
                        { label: 'Missing', color: '#636366' },
                      ].map(l => (
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
        </div>
      )}

      {/* Global Discovery Marketplace */}
      {subTab !== 'discovery' && (
        <DataDiscoveryMarketplace signals={globalDiscovery} />
      )}
    </div>
  );
}
