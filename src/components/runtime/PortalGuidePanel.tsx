import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, MapPin, Server, Database,
  CircleCheck as CheckCircle, RefreshCw, LayoutList, Siren, Target,
  ShieldCheck, FileText, AlertTriangle, Activity, BookOpen,
} from 'lucide-react';

interface GuideStep {
  id: number;
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  highlight?: string;
  tip?: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 1,
    title: 'Runtime Location Overview',
    description:
      'This portal answers "Where is my application running?" in real-time. Each card represents an application tracked across all your data centers — built from live telemetry ingested from IBM MQ, MongoDB, Oracle OEM, CMDB, SCOM, OCP, and more.',
    icon: MapPin,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    tip: 'Use the Environment and Tech Stack filters at the top to narrow down to what you need quickly.',
  },
  {
    id: 2,
    title: 'Understanding Application Cards',
    description:
      'Each card shows the application name, environment badge (PRODUCTION / UAT / DR), data center distribution bar, primary write authority, confidence level (1–4), and data freshness. The left-side color strip matches the confidence level — green is healthy, amber is cautionary, red needs attention.',
    icon: Server,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    highlight:
      'The "Primary Authority" column tells you which DC currently owns all write operations — this is the critical signal for failover decisions.',
  },
  {
    id: 3,
    title: 'Confidence Scoring (1–4)',
    description:
      'Every data point is scored by how deterministically it was derived:\n• 4 = High — Read directly from the authoritative source control plane (e.g., CMDB, rs_state=PRIMARY)\n• 3 = Moderate — Derived from operational metrics (e.g., OEM, SCOM)\n• 2 = Low — Inferred from hostname patterns or proprietary tools\n• 1 = Unknown — No reliable signal available',
    icon: CheckCircle,
    iconColor: '#FF9F0A',
    iconBg: 'rgba(255,159,10,0.12)',
    tip: 'Trust only confidence 4 data for automated failover decisions. Always manually verify confidence 1–2 assets before taking action.',
  },
  {
    id: 4,
    title: 'Drilling Into an Application',
    description:
      'Click any application card to open the detailed view. You will see:\n• DC Distribution — all assets grouped by data center and component type\n• Data Quality tab — per-source freshness and confidence scores\n• Intent vs Actual tab — compare your intended topology with what is actually running\n• Audit Log tab — full provenance trail of every state change',
    icon: Database,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    highlight:
      'The "2AM Ready" trust banner on the detail page aggregates all signal health. If it shows WARNING or CRITICAL, do not act without manual verification.',
  },
  {
    id: 5,
    title: 'Importing Telemetry Data',
    description:
      'Use "Import CSV" in the top right to upload telemetry files from your monitoring tools. The system auto-detects the source type from the filename. Supported sources: IBM MQ (qmgr_status), MongoDB (mongodb_info), Oracle OEM (oem_db_role), CMDB topology, SCOM SQL replica status, OCP pod info, Kafka broker topology, AVI Load Balancer, Batch jobs, AppDynamics node inventory.',
    icon: FileText,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    tip: 'Use "Bulk Ingest docs/" inside the Import CSV dialog to automatically load all files from the backend/docs/ folder at once.',
  },
  {
    id: 6,
    title: 'Data Freshness & Staleness',
    description:
      'Data freshness is monitored continuously. Each source has a decay timer:\n• Fresh (green): Updated within the last 30 minutes\n• Stale (amber): 30–120 minutes since last update\n• Very Stale (red): Over 2 hours — treat as unreliable\n\nUse the Freshness filter chips below the filter bar to quickly surface stale applications.',
    icon: RefreshCw,
    iconColor: '#FF9F0A',
    iconBg: 'rgba(255,159,10,0.12)',
    highlight:
      'The "Stale Sources" stat card at the top shows the count of applications with at least one stale data source — keep this at zero during production operations.',
  },
  {
    id: 7,
    title: 'Incident Mode — Blast Radius Analysis',
    description:
      'Click "Incident Mode" to run a live blast radius simulation for any data center failure. The panel shows:\n• Applications with NO failover path (critical — will go offline)\n• Applications with a standby site (require manual or automated promotion)\n• Estimated recovery summary from real runtime data\n\nThis is purely a read-only simulation — no changes are applied to any system.',
    icon: Siren,
    iconColor: '#FF453A',
    iconBg: 'rgba(255,69,58,0.12)',
    tip: 'Export the blast radius report as JSON for your incident management tool or runbook documentation.',
  },
  {
    id: 8,
    title: 'Intent vs Actual State Validation',
    description:
      'In the application detail view, use the "Intent vs Actual" tab to define your intended deployment topology and run automated drift detection. The system compares:\n• Active data centers (intended vs actual)\n• Primary write site (intended vs actual)\n• Required tech stacks (present vs missing)\n\nDrift events surface as CRITICAL, HIGH, or MEDIUM severity items.',
    icon: Target,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    highlight:
      'Save your intent once — drift detection runs automatically every time telemetry is refreshed, keeping you proactively informed of topology changes.',
  },
  {
    id: 9,
    title: 'Signal Coverage & Data Sources',
    description:
      'Click "Data Coverage" to view the full signal coverage matrix — a breakdown of every monitored tech stack, what data sources are used, and the confidence level for topology and traffic signals. Gaps and WIP integrations are clearly labelled. Use this panel to identify where your coverage can be improved.',
    icon: LayoutList,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    tip: 'Propose new data sources using the form inside Data Coverage to inform the platform team of new signals that can improve coverage.',
  },
  {
    id: 10,
    title: 'Filters, Views & Live Feed',
    description:
      'The portal offers multiple ways to view your fleet:\n• List view — detailed application cards with full metadata\n• Kanban view — applications grouped by environment (PROD / UAT / DR)\n• Heatmap view — color-coded confidence grid for at-a-glance health\n\nThe Live Feed sidebar shows real-time operational events from WebSocket telemetry — import events, drift detections, and failover triggers.',
    icon: Activity,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    highlight:
      'Filters are additive — combine Environment, Tech Stack, Confidence, Freshness, and Status filters to drill down to exactly the subset of applications you need.',
  },
  {
    id: 11,
    title: 'Audit Trail & Provenance',
    description:
      'Every import, state change, conflict detection, failover execution, and intent update is recorded in the application\'s Audit Log tab. This satisfies the "When did we know this, and from which source?" question for every data point in the system.',
    icon: ShieldCheck,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    tip: 'The audit log is scoped per application. Global import events (bulk ingest, CSV uploads) appear across all associated application audit logs.',
  },
];

interface Props {
  onClose: () => void;
}

export function PortalGuidePanel({ onClose }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = GUIDE_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === GUIDE_STEPS.length - 1;

  function goNext() {
    if (isLast) { onClose(); return; }
    setCurrentStep((s) => s + 1);
  }

  function goPrev() {
    if (isFirst) return;
    setCurrentStep((s) => s - 1);
  }

  function goToStep(i: number) {
    setCurrentStep(i);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentStep]);

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 pointer-events-auto"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Step card */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pointer-events-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div
              className="px-5 pt-4 pb-3 flex items-center justify-between gap-3"
              style={{ borderBottom: '1px solid var(--app-border)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: step.iconBg }}
                >
                  <Icon className="w-4 h-4" style={{ color: step.iconColor }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Step {step.id} of {GUIDE_STEPS.length} — Portal Guide
                  </p>
                  <h3 className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {step.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--app-surface)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                {step.description}
              </p>

              {step.highlight && (
                <div
                  className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5"
                  style={{ background: 'rgba(10,132,255,0.07)', border: '1px solid rgba(10,132,255,0.2)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5" style={{ color: '#0A84FF' }}>
                    Key Point:
                  </span>
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {step.highlight}
                  </p>
                </div>
              )}

              {step.tip && (
                <div
                  className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5"
                  style={{ background: 'rgba(255,159,10,0.07)', border: '1px solid rgba(255,159,10,0.2)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5" style={{ color: '#FF9F0A' }}>
                    Tip:
                  </span>
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {step.tip}
                  </p>
                </div>
              )}
            </div>

            {/* Step dots + nav */}
            <div
              className="px-5 py-3 flex items-center justify-between gap-3"
              style={{ borderTop: '1px solid var(--app-border)' }}
            >
              {/* Step dots */}
              <div className="flex items-center gap-1.5 flex-wrap max-w-[220px]">
                {GUIDE_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToStep(i)}
                    className="rounded-full transition-all"
                    style={{
                      width: i === currentStep ? 20 : 6,
                      height: 6,
                      background: i === currentStep ? 'var(--primary-500)' :
                        i < currentStep ? '#30D158' : 'var(--app-border)',
                    }}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-2">
                {!isFirst && (
                  <button
                    onClick={goPrev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-medium"
                    style={{
                      background: 'var(--app-surface)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                )}
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white"
                  style={{ background: isLast ? '#30D158' : 'var(--primary-500)' }}
                >
                  {isLast ? 'Finish Guide' : 'Next'}
                  {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating step counter (top right) */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
          <span className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Portal Guide
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--primary-500)', color: '#fff' }}>
            {currentStep + 1}/{GUIDE_STEPS.length}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            ← → keys to navigate
          </span>
        </motion.div>
      </div>
    </div>
  );
}
