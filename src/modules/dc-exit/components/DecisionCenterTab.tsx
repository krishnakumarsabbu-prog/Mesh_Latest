/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DecisionCenterTab — the "Decision Center" tab of the Decide step.
 * Renders a large verdict banner (SAFE / CONDITIONAL / DO NOT
 * SHUTDOWN), a reasoning timeline, an evidence panel, a business
 * impact panel, and a Proceed button that advances to Execute.
 * Mock data only.
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck, TriangleAlert as AlertTriangle, Ban, Scale, FileText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  decisionVerdict,
  reasoningTimeline,
  decisionEvidence,
  decisionBusinessImpact,
  type Verdict,
  type ReasoningStep,
  type DecisionEvidence,
  type DecisionBusinessImpact,
} from '@/modules/dc-exit/data/decideMockData';

const VERDICT_META: Record<
  Verdict,
  { color: string; bg: string; border: string; label: string; sublabel: string; Icon: typeof ShieldCheck }
> = {
  SAFE: {
    color: '#00B074',
    bg: 'rgba(0,176,116,0.08)',
    border: 'rgba(0,176,116,0.28)',
    label: 'SAFE',
    sublabel: 'Clear to proceed',
    Icon: ShieldCheck,
  },
  CONDITIONAL: {
    color: '#FFB100',
    bg: 'rgba(255,177,0,0.08)',
    border: 'rgba(255,177,0,0.28)',
    label: 'CONDITIONAL',
    sublabel: 'Proceed after blockers cleared',
    Icon: AlertTriangle,
  },
  DO_NOT_SHUTDOWN: {
    color: '#FF003C',
    bg: 'rgba(255,0,60,0.08)',
    border: 'rgba(255,0,60,0.28)',
    label: 'DO NOT SHUTDOWN',
    sublabel: 'Source must remain active',
    Icon: Ban,
  },
};

const TONE_DOT: Record<ReasoningStep['tone'], string> = {
  positive: '#00B074',
  neutral: '#006CFF',
  warning: '#FFB100',
  negative: '#FF003C',
};

const WEIGHT_META: Record<DecisionEvidence['weight'], { color: string; bg: string; border: string }> = {
  high:   { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',  border: 'rgba(255,0,60,0.22)' },
  medium: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)', border: 'rgba(255,177,0,0.22)' },
  low:    { color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
};

const RISK_META: Record<DecisionBusinessImpact['risk'], { color: string; bg: string; border: string }> = {
  low:    { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  medium: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  high:   { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
};

function LargeVerdictBanner() {
  const v = decisionVerdict;
  const meta = VERDICT_META[v.verdict];
  const Icon = meta.Icon;
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (v.confidence / 100) * circ;

  return (
    <div
      className="rounded-[8px] p-5 flex items-center gap-5 flex-wrap transition-all duration-150"
      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      <span
        className="flex items-center justify-center w-14 h-14 rounded-[10px] flex-shrink-0"
        style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
      >
        <Icon className="w-7 h-7" style={{ color: meta.color }} strokeWidth={1.8} />
      </span>

      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <span
          className="text-[28px] font-extrabold tracking-tight leading-none"
          style={{ color: meta.color, letterSpacing: '-0.02em' }}
        >
          {meta.label}
        </span>
        <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          {v.headline}
        </span>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {v.summary}
        </p>
      </div>

      {/* Confidence ring */}
      <div className="relative flex-shrink-0" style={{ width: 96, height: 96 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--app-bg-muted)" strokeWidth="7" />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={meta.color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[20px] font-bold leading-none tabular-nums" style={{ color: meta.color }}>
            {v.confidence}
          </span>
          <span className="text-[8px] font-mono mt-0.5" style={{ color: 'var(--text-disabled)' }}>
            confidence
          </span>
        </div>
      </div>
    </div>
  );
}

function ReasoningTimelineItem({ step, idx, isLast }: { step: ReasoningStep; idx: number; isLast: boolean }) {
  const dot = TONE_DOT[step.tone];
  return (
    <div className="flex gap-3 min-w-0">
      {/* Rail */}
      <div className="flex flex-col items-center flex-shrink-0">
        <span
          className="w-2.5 h-2.5 rounded-full mt-1"
          style={{ background: dot, border: '2px solid var(--app-surface)', boxShadow: `0 0 0 1px ${dot}` }}
        />
        {!isLast && <span className="flex-1 w-px my-1" style={{ background: 'var(--app-border)' }} />}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col gap-1.5 min-w-0', isLast ? 'pb-0' : 'pb-4')}>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[4px]"
            style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >
            {step.phase}
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {step.timestamp}
          </span>
        </div>
        <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          {step.title}
        </span>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {step.detail}
        </p>
      </div>
    </div>
  );
}

function EvidenceRow({ evidence, idx }: { evidence: DecisionEvidence; idx: number }) {
  const w = WEIGHT_META[evidence.weight];
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
        <span className="text-[11.5px] font-mono font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
          {evidence.source}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: w.bg, color: w.color, border: `1px solid ${w.border}` }}
        >
          {evidence.weight}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-primary)' }}>
        {evidence.finding}
      </p>
    </div>
  );
}

function BusinessImpactRow({ impact, idx }: { impact: DecisionBusinessImpact; idx: number }) {
  const risk = RISK_META[impact.risk];
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
        <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {impact.capability}
        </span>
        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {impact.customersAffected} customers
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.border}` }}
        >
          {impact.risk} risk
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-secondary)' }}>
        {impact.mitigation}
      </p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Scale;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[8px] flex flex-col overflow-hidden"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} strokeWidth={2} />
        <h4 className="text-[12.5px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h4>
        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
          {count}
        </span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function DecisionCenterTab() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const handleProceed = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/execute`);
  };

  const v = decisionVerdict;
  const meta = VERDICT_META[v.verdict];

  return (
    <div className="flex flex-col gap-6">
      {/* === Large verdict === */}
      <section className="flex flex-col gap-3">
        <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Verdict
        </h4>
        <LargeVerdictBanner />
      </section>

      {/* === Reasoning timeline + Evidence === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Reasoning timeline */}
        <div
          className="rounded-[8px] p-4 flex flex-col gap-1"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center gap-2 pb-3 mb-1 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <Scale className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} strokeWidth={2} />
            <h4 className="text-[12.5px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Reasoning Timeline
            </h4>
            <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
              {reasoningTimeline.length} steps
            </span>
          </div>
          <div className="flex flex-col pt-1">
            {reasoningTimeline.map((step, idx) => (
              <ReasoningTimelineItem
                key={step.id}
                step={step}
                idx={idx}
                isLast={idx === reasoningTimeline.length - 1}
              />
            ))}
          </div>
        </div>

        {/* Evidence */}
        <Panel icon={FileText} title="Evidence" count={decisionEvidence.length}>
          {decisionEvidence.map((e, idx) => (
            <EvidenceRow key={e.id} evidence={e} idx={idx} />
          ))}
        </Panel>
      </section>

      {/* === Business impact === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Business Impact
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {decisionBusinessImpact.length} capabilities
          </span>
        </div>
        <div
          className="rounded-[8px] flex flex-col overflow-hidden"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          {decisionBusinessImpact.map((impact, idx) => (
            <BusinessImpactRow key={impact.capability} impact={impact} idx={idx} />
          ))}
        </div>
      </section>

      {/* === Proceed === */}
      <div
        className="rounded-[8px] p-4 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-bold select-none flex-shrink-0"
            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
          >
            {meta.label}
          </span>
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            {meta.sublabel}
          </span>
        </div>
        <Button
          variant={v.verdict === 'DO_NOT_SHUTDOWN' ? 'danger' : 'primary'}
          size="lg"
          onClick={handleProceed}
          iconRight={<ArrowRight className="w-4 h-4" />}
        >
          Proceed to Execute
        </Button>
      </div>
    </div>
  );
}
