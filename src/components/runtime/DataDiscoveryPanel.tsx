import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  CircleHelp as HelpCircle, Database, Plus, Send,
  ChevronDown, Share2, Info, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TECH_STACK_COVERAGE, CONFIDENCE_LABELS, type TechStackCoverage } from '@/lib/runtimeLocationMock';
import { TechStackIcon } from './TechStackIcon';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import type { TechStack, SourceProposal, ProposalStatus } from '@/types';

// ─── Integrated Source Signals Reference ─────────────────────────────────────

interface TeamDiscovery {
  id: string;
  title: string;
  sourceType: string;
  techStack: string;
  signal: string;
  valueProposition: string;
  isDeterministic: boolean;
  sharedAt: string;
  sharedToChannel: boolean;
}

const TEAM_DISCOVERIES: TeamDiscovery[] = [
  {
    id: 'disc-1',
    title: 'AVI Load Balancer Pool JSON',
    sourceType: 'avi_loadbalancer',
    techStack: 'vm',
    signal: 'pool_member_status, traffic_weight, active_connections per DC',
    valueProposition: 'Provides active/standby pool member status and traffic-weighted distribution across DCs — fills the traffic confidence gap for VM and OCP workloads.',
    isDeterministic: false,
    sharedAt: '2026-06-05T09:00:00Z',
    sharedToChannel: true,
  },
  {
    id: 'disc-2',
    title: 'AutoSys Batch Job CSV',
    sourceType: 'batch',
    techStack: 'vm',
    signal: 'RUN_MACHINE FQDN → DC prefix derivation (ibb1*, shv*, az3*)',
    valueProposition: 'RUN_MACHINE FQDN field lets us derive which data center executed each batch job. Maps execution location per job, filling topology gaps for batch workloads.',
    isDeterministic: false,
    sharedAt: '2026-06-05T10:30:00Z',
    sharedToChannel: true,
  },
  {
    id: 'disc-3',
    title: 'IBM MQ QMgr Command Server Status',
    sourceType: 'ibm_mq',
    techStack: 'ibm_mq',
    signal: 'CMDSERVER=RUNNING identifies live vs passive queue managers',
    valueProposition: 'Identifies which queue managers are actively accepting commands (live vs passive). CMDSERVER=RUNNING is a reliable active-instance indicator independent of replication state.',
    isDeterministic: true,
    sharedAt: '2026-06-05T11:15:00Z',
    sharedToChannel: true,
  },
  {
    id: 'disc-4',
    title: 'MongoDB Replica State Field',
    sourceType: 'mongodb',
    techStack: 'mongodb',
    signal: 'rs_state=1 (PRIMARY), rs_state=2 (SECONDARY) from Ops Manager API',
    valueProposition: 'rs_state is the single most deterministic write-authority indicator in the dataset. A value of 1 means this node owns all writes — no ambiguity, no inference.',
    isDeterministic: true,
    sharedAt: '2026-06-05T12:00:00Z',
    sharedToChannel: true,
  },
];

interface Props {
  onClose: () => void;
}

// ─── Confidence cell ─────────────────────────────────────────────────────────

function ConfCell({ level, source }: { level: number; source: string | null }) {
  const colors: Record<number, string> = {
    1: '#8E8E93',
    2: '#FF453A',
    3: '#FF9F0A',
    4: '#30D158',
  };
  const color = colors[level] ?? '#8E8E93';
  const label = CONFIDENCE_LABELS[level] ?? 'Unknown';
  const Icon = level === 4 ? CheckCircle : level <= 1 ? HelpCircle : AlertTriangle;

  return (
    <td className="px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <Icon className="w-3 h-3 flex-shrink-0" style={{ color }} />
          <span className="text-[11px] font-semibold" style={{ color }}>
            {label}
          </span>
        </div>
        {source ? (
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {source}
          </span>
        ) : (
          <span className="text-[9px] italic" style={{ color: 'var(--text-muted)' }}>
            — TBD —
          </span>
        )}
      </div>
    </td>
  );
}

// ─── Sample badge ─────────────────────────────────────────────────────────────

function SampleBadge({ value }: { value: 'Yes' | 'No' | 'Partial' }) {
  const map = {
    Yes:     { bg: 'rgba(48,209,88,0.1)',  color: '#30D158',  border: 'rgba(48,209,88,0.25)' },
    Partial: { bg: 'rgba(255,159,10,0.1)', color: '#FF9F0A',  border: 'rgba(255,159,10,0.25)' },
    No:      { bg: 'rgba(255,69,58,0.1)',  color: '#FF453A',  border: 'rgba(255,69,58,0.25)' },
  };
  const s = map[value];
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {value}
    </span>
  );
}

// ─── Submit Discovery Banner ──────────────────────────────────────────────────

// (SubmitDiscoveryBanner removed — replaced by ProposeModal inline button in main panel)

// ─── Team Discovery Card ──────────────────────────────────────────────────────

function TeamDiscoveryCard({ discovery }: { discovery: TeamDiscovery }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3 text-left"
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: discovery.isDeterministic ? 'rgba(48,209,88,0.12)' : 'rgba(255,159,10,0.1)' }}
        >
          {discovery.isDeterministic
            ? <CheckCircle className="w-3.5 h-3.5" style={{ color: '#30D158' }} />
            : <Activity className="w-3.5 h-3.5" style={{ color: '#FF9F0A' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{discovery.title}</span>
            {discovery.sharedToChannel && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(48,209,88,0.1)', color: '#30D158', border: '1px solid rgba(48,209,88,0.2)' }}>
                ✓ SHARED
              </span>
            )}
            {discovery.isDeterministic && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(10,132,255,0.1)', color: '#0A84FF', border: '1px solid rgba(10,132,255,0.2)' }}>
                DETERMINISTIC
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{discovery.signal}</p>
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 mt-1 transition-transform"
          style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
              <p className="text-[11px] pt-2" style={{ color: 'var(--text-secondary)' }}>{discovery.valueProposition}</p>
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span>Source: <span className="font-mono">{discovery.sourceType}</span></span>
                <span>·</span>
                <span>Tech: {discovery.techStack}</span>
                <span>·</span>
                <span>Shared: {new Date(discovery.sharedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Propose Source Modal ────────────────────────────────────────────────────

interface ProposalData {
  tech_stack: string;
  dimension: string;
  proposed_source: string;
  confidence_level: number;
  sample_available: boolean;
  contact: string;
  notes: string;
}

function ProposeModal({ onClose }: { onClose: () => void }) {
  const { submitProposal } = useRuntimeLocationStore();
  const [form, setForm] = useState<ProposalData>({
    tech_stack: 'kafka',
    dimension: 'topology',
    proposed_source: '',
    confidence_level: 3,
    sample_available: false,
    contact: '',
    notes: '',
  });
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof ProposalData>(key: K, value: ProposalData[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function handleSubmit() {
    submitProposal({
      source_name: form.proposed_source,
      system: form.notes.split('\n')[0] || form.proposed_source,
      signal_type: form.dimension,
      tech_stack: form.tech_stack,
      rationale: form.notes,
      is_deterministic_claim: form.confidence_level >= 4,
      proposed_by: form.contact || 'Team',
    });
    setSubmitted(true);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative rounded-2xl w-full max-w-lg flex flex-col gap-5 p-6"
        style={{
          background: 'var(--app-surface-raised)',
          border: '1px solid var(--app-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {!submitted ? (
          <>
            <div>
              <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Propose New Data Source
              </h3>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Share a newly discovered data source with the team. This helps fill coverage gaps.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Tech Stack
                  </label>
                  <div className="relative">
                    <select
                      value={form.tech_stack}
                      onChange={(e) => set('tech_stack', e.target.value)}
                      className="w-full appearance-none rounded-xl pl-3 pr-7 py-2 text-[12px]"
                      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      {TECH_STACK_COVERAGE.map((t) => (
                        <option key={t.techStack} value={t.techStack}>{t.displayName}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Dimension
                  </label>
                  <div className="relative">
                    <select
                      value={form.dimension}
                      onChange={(e) => set('dimension', e.target.value)}
                      className="w-full appearance-none rounded-xl pl-3 pr-7 py-2 text-[12px]"
                      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="topology">Topology</option>
                      <option value="traffic">Traffic</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Proposed Source Name
                </label>
                <input
                  value={form.proposed_source}
                  onChange={(e) => set('proposed_source', e.target.value)}
                  placeholder="e.g., kafka_jmx_exporter"
                  className="rounded-xl px-3 py-2 text-[12px] outline-none"
                  style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Estimated Confidence
                  </label>
                  <div className="relative">
                    <select
                      value={form.confidence_level}
                      onChange={(e) => set('confidence_level', Number(e.target.value))}
                      className="w-full appearance-none rounded-xl pl-3 pr-7 py-2 text-[12px]"
                      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value={4}>4 — High</option>
                      <option value={3}>3 — Moderate</option>
                      <option value={2}>2 — Low</option>
                      <option value={1}>1 — Unknown</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Sample Available?
                  </label>
                  <div className="flex items-center gap-3 h-[38px]">
                    {(['Yes', 'No'] as const).map((v) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={form.sample_available === (v === 'Yes')}
                          onChange={() => set('sample_available', v === 'Yes')}
                          className="w-3.5 h-3.5 accent-blue-500"
                        />
                        <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Contact (email)
                </label>
                <input
                  value={form.contact}
                  onChange={(e) => set('contact', e.target.value)}
                  placeholder="your@company.com"
                  className="rounded-xl px-3 py-2 text-[12px] outline-none"
                  style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Describe the source, how to access it, and what data it provides…"
                  rows={3}
                  className="rounded-xl px-3 py-2 text-[12px] outline-none resize-none"
                  style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-[13px] font-medium"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.proposed_source.trim()}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--primary-500)' }}
              >
                <Send className="w-3.5 h-3.5" />
                Submit Proposal
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(48,209,88,0.12)' }}
            >
              <CheckCircle className="w-7 h-7" style={{ color: '#30D158' }} />
            </div>
            <div>
              <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Proposal Submitted
              </h3>
              <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Your data source proposal for <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{form.proposed_source}</span>{' '}
                ({form.tech_stack} / {form.dimension}) has been recorded.
              </p>
              <div
                className="mt-4 rounded-xl p-3 text-left"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
              >
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--text-muted)' }}>
                  {JSON.stringify({
                    tech_stack: form.tech_stack,
                    dimension: form.dimension,
                    proposed_source: form.proposed_source,
                    confidence_level: form.confidence_level,
                    sample_available: form.sample_available,
                    contact: form.contact || '(not provided)',
                    notes: form.notes || '(none)',
                  }, null, 2)}
                </pre>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: 'var(--primary-500)' }}
            >
              Close
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Proposal card ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProposalStatus, { bg: string; color: string; border: string }> = {
  PENDING:  { bg: 'rgba(255,159,10,0.1)',  color: '#FF9F0A', border: 'rgba(255,159,10,0.3)' },
  ACCEPTED: { bg: 'rgba(48,209,88,0.1)',   color: '#30D158', border: 'rgba(48,209,88,0.3)'  },
  REJECTED: { bg: 'rgba(255,69,58,0.1)',   color: '#FF453A', border: 'rgba(255,69,58,0.3)'  },
};

function ProposalCard({ proposal, onAccept, onReject }: {
  proposal: SourceProposal;
  onAccept: () => void;
  onReject: () => void;
}) {
  const cfg = STATUS_COLORS[proposal.status];
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {proposal.source_name}
            </span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
            >
              {proposal.status}
            </span>
            {proposal.is_deterministic_claim && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(48,209,88,0.1)', color: '#30D158', border: '1px solid rgba(48,209,88,0.25)' }}
              >
                DETERMINISTIC
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{proposal.system}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>•</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{proposal.tech_stack}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{proposal.rationale}</p>
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          by {proposal.proposed_by} · {new Date(proposal.proposed_at).toLocaleDateString()}
        </span>
        {proposal.status === 'PENDING' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onAccept}
              className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(48,209,88,0.12)', color: '#30D158' }}
            >
              Accept
            </button>
            <button
              onClick={onReject}
              className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(255,69,58,0.12)', color: '#FF453A' }}
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function DataDiscoveryPanel({ onClose }: Props) {
  const [showPropose, setShowPropose] = useState(false);
  const { proposals, updateProposalStatus } = useRuntimeLocationStore();

  const gaps = TECH_STACK_COVERAGE.filter(
    (t) => t.topologyConfidence <= 1 || t.trafficConfidence <= 1 || t.sampleAvailable === 'No' || !t.topologySource,
  );
  const acceptedCount = proposals.filter((p) => p.status === 'ACCEPTED').length;
  const pendingCount  = proposals.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative flex flex-col w-full max-w-[680px] h-full overflow-hidden"
        style={{
          background: 'var(--app-bg)',
          borderLeft: '1px solid var(--app-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(10,132,255,0.1)' }}
            >
              <Database className="w-4.5 h-4.5" style={{ color: 'var(--primary-500)' }} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Signal Coverage & Data Sources
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Track telemetry source coverage, identify gaps, and propose new data sources for the platform team
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--app-surface)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Confidence legend */}
        <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Confidence Levels
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { level: 4, label: 'High',     color: '#30D158', desc: 'Available & standardized' },
              { level: 3, label: 'Moderate', color: '#FF9F0A', desc: 'Available, not standardized' },
              { level: 2, label: 'Low',      color: '#FF453A', desc: 'Proprietary tool only' },
              { level: 1, label: 'Unknown',  color: '#8E8E93', desc: 'No data available' },
            ].map(({ level, label, color, desc }) => (
              <div key={level} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="text-[10px] font-semibold" style={{ color }}>
                  {level} — {label}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  ({desc})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Signal Coverage Summary Banner */}
        <div className="mx-5 mt-4 rounded-2xl p-4 border flex gap-3 items-start"
             style={{ background: 'rgba(10,132,255,0.05)', borderColor: 'rgba(10,132,255,0.2)' }}>
          <Database className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#0A84FF' }} />
          <div className="flex-1">
            <h4 className="text-[12px] font-bold" style={{ color: '#0A84FF' }}>About Signal Coverage</h4>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              This matrix maps every monitored tech stack to its active data sources and confidence levels. Stacks rated 1–2 represent integration gaps. Use the "Propose New Data Source" button to notify the platform team of newly discovered telemetry endpoints that can improve coverage.
            </p>
          </div>
        </div>

        {/* Coverage matrix */}
        <div className="flex-1 overflow-y-auto">
          {/* Integrated Source Signals */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4" style={{ color: '#30D158' }} />
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Integrated Source Signals
              </p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: 'rgba(48,209,88,0.1)', color: '#30D158' }}>
                {TEAM_DISCOVERIES.filter(d => d.sharedToChannel).length} active
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {TEAM_DISCOVERIES.map((disc) => (
                <TeamDiscoveryCard
                  key={disc.id}
                  discovery={disc}
                />
              ))}
            </div>
          </div>

          <div className="px-5 pt-2 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Tech Stack Coverage Matrix
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--app-surface)' }}>
                    {['Tech Stack', 'Topology Source', 'Topology Conf', 'Traffic Source', 'Traffic Conf', 'Sample'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                        style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TECH_STACK_COVERAGE.map((row) => (
                    <tr
                      key={row.techStack}
                      style={{
                        borderBottom: '1px solid var(--app-border)',
                        background: row.topologyConfidence <= 1 ? 'rgba(255,69,58,0.03)' : 'transparent',
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <TechStackIcon techStack={row.techStack as TechStack} size={14} />
                          <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {row.displayName}
                          </span>
                        </div>
                      </td>
                      <ConfCell level={row.topologyConfidence} source={row.topologySource} />
                      <td className="px-3 py-2.5">
                        <span
                          className="text-[11px] font-bold"
                          style={{
                            color: row.topologyConfidence >= 4 ? '#30D158' :
                              row.topologyConfidence >= 3 ? '#FF9F0A' :
                              row.topologyConfidence >= 2 ? '#FF453A' : '#8E8E93',
                          }}
                        >
                          {CONFIDENCE_LABELS[row.topologyConfidence]}
                        </span>
                      </td>
                      <ConfCell level={row.trafficConfidence} source={row.trafficSource} />
                      <td className="px-3 py-2.5">
                        <span
                          className="text-[11px] font-bold"
                          style={{
                            color: row.trafficConfidence >= 4 ? '#30D158' :
                              row.trafficConfidence >= 3 ? '#FF9F0A' :
                              row.trafficConfidence >= 2 ? '#FF453A' : '#8E8E93',
                          }}
                        >
                          {CONFIDENCE_LABELS[row.trafficConfidence]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <SampleBadge value={row.sampleAvailable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Problem Statement Alignment — Signal Gap Analysis */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4" style={{ color: '#0A84FF' }} />
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Full Stack Signal Coverage Analysis
              </p>
            </div>
            <div
              className="rounded-xl p-3 mb-3"
              style={{ background: 'rgba(10,132,255,0.05)', border: '1px solid rgba(10,132,255,0.2)' }}
            >
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                The table below maps every monitored tech stack to its current signal availability. Stacks rated 1–2 represent active gaps where deterministic data is missing or integration is in progress.
              </p>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
                    {['Tech Stack', 'Topology', 'Traffic', 'Our Signal', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { stack: 'vm',      display: 'VM',           topoConf: 4, trafConf: 3, ourSignal: 'CMDB + AppDynamics',    status: 'INTEGRATED' },
                    { stack: 'ocp',     display: 'OCP',          topoConf: 3, trafConf: 4, ourSignal: 'OCP pod info CSV',       status: 'INTEGRATED' },
                    { stack: 'mongodb', display: 'MongoDB',      topoConf: 3, trafConf: 3, ourSignal: 'MongoDB Ops Manager CSV', status: 'INTEGRATED' },
                    { stack: 'oracle',  display: 'Oracle',       topoConf: 3, trafConf: 2, ourSignal: 'OEM CSV (WIP — capped)',  status: 'WIP' },
                    { stack: 'mssql',   display: 'MS SQL',       topoConf: 3, trafConf: 3, ourSignal: 'SCOM replica status CSV', status: 'INTEGRATED' },
                    { stack: 'kafka',   display: 'Kafka',        topoConf: 3, trafConf: 3, ourSignal: 'Broker topology CSV',     status: 'INTEGRATED' },
                    { stack: 'ibm_mq',  display: 'IBM MQ',       topoConf: 3, trafConf: 3, ourSignal: 'QMgr status CSV (det.)', status: 'INTEGRATED' },
                    { stack: 'vm',      display: 'Object Store',  topoConf: 3, trafConf: 2, ourSignal: '— Not yet integrated',   status: 'GAP' },
                    { stack: 'vm',      display: 'File Store',    topoConf: 3, trafConf: 2, ourSignal: '— Not yet integrated',   status: 'GAP' },
                    { stack: 'vm',      display: 'Batch/AutoSys', topoConf: 2, trafConf: 2, ourSignal: 'Batch job CSV (DC prefix)', status: 'INTEGRATED' },
                    { stack: 'vm',      display: 'AVI LB',       topoConf: 3, trafConf: 2, ourSignal: 'Pool member JSON (WIP)', status: 'WIP' },
                  ].map((row, i) => {
                    const topoColor = row.topoConf >= 4 ? '#30D158' : row.topoConf >= 3 ? '#FF9F0A' : '#FF453A';
                    const trafColor = row.trafConf >= 4 ? '#30D158' : row.trafConf >= 3 ? '#FF9F0A' : '#FF453A';
                    const statusConfig = {
                      INTEGRATED: { color: '#30D158', bg: 'rgba(48,209,88,0.1)',   border: 'rgba(48,209,88,0.25)',   label: 'Integrated' },
                      WIP:        { color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)',  border: 'rgba(255,159,10,0.25)',  label: 'WIP' },
                      GAP:        { color: '#FF453A', bg: 'rgba(255,69,58,0.1)',   border: 'rgba(255,69,58,0.25)',   label: 'Gap' },
                    }[row.status] ?? { color: '#8E8E93', bg: 'rgba(142,142,147,0.1)', border: 'rgba(142,142,147,0.2)', label: row.status };
                    return (
                      <tr
                        key={`${row.display}-${i}`}
                        style={{
                          borderBottom: '1px solid var(--app-border)',
                          background: row.status === 'GAP' ? 'rgba(255,69,58,0.02)' : 'transparent',
                        }}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <TechStackIcon techStack={row.stack as any} size={12} />
                            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{row.display}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-bold" style={{ color: topoColor }}>{row.topoConf}/4</td>
                        <td className="px-3 py-2.5 font-bold" style={{ color: trafColor }}>{row.trafConf}/4</td>
                        <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>{row.ourSignal}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: statusConfig.bg, color: statusConfig.color, border: `1px solid ${statusConfig.border}` }}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gaps identified */}
          {gaps.length > 0 && (
            <div className="px-5 py-4">
              <div
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{ background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.2)' }}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" style={{ color: '#FF9F0A' }} />
                  <p className="text-[13px] font-bold" style={{ color: '#FF9F0A' }}>
                    {gaps.length} Gap{gaps.length !== 1 ? 's' : ''} Identified
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gaps.map((g) => (
                    <span
                      key={g.techStack}
                      className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                      style={{ background: 'rgba(255,159,10,0.1)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,0.25)' }}
                    >
                      <TechStackIcon techStack={g.techStack as TechStack} size={11} />
                      {g.displayName}
                      {!g.topologySource && ' topology'}
                      {g.topologySource && !g.trafficSource && ' traffic'}
                    </span>
                  ))}
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  These tech stacks have missing or low-confidence data sources. Use the proposal form to share newly discovered sources with your team.
                </p>
              </div>
            </div>
          )}
        </div>

          {/* Source Proposals */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Source Proposals
                </p>
                {pendingCount > 0 && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,159,10,0.1)', color: '#FF9F0A' }}
                  >
                    {pendingCount} pending
                  </span>
                )}
              </div>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {acceptedCount} accepted
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {proposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  onAccept={() => updateProposalStatus(p.id, 'ACCEPTED')}
                  onReject={() => updateProposalStatus(p.id, 'REJECTED')}
                />
              ))}
            </div>
          </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--app-border)' }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {TECH_STACK_COVERAGE.filter((t) => t.topologySource).length} of {TECH_STACK_COVERAGE.length} tech stacks have topology sources
          </p>
          <button
            onClick={() => setShowPropose(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: 'var(--primary-500)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Propose New Data Source
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showPropose && <ProposeModal onClose={() => setShowPropose(false)} />}
      </AnimatePresence>
    </div>
  );
}
