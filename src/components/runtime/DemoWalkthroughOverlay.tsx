import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, MapPin, Server, Database,
  CircleCheck as CheckCircle, RefreshCw, Zap, LayoutList, Siren, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoStep {
  id: number;
  title: string;
  narration: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  highlight?: string;
  tip?: string;
}

const STEPS: DemoStep[] = [
  {
    id: 1,
    title: 'Runtime Location Overview',
    narration: 'Welcome to Runtime Location — the single pane of glass that answers "Where is my app running?" Each card represents an application tracked across your infrastructure.',
    icon: MapPin,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    tip: 'Applications are loaded from IBM MQ, MongoDB, Oracle OEM, and CMDB topology data.',
  },
  {
    id: 2,
    title: 'Data Center Badges',
    narration: 'Each application card shows which data centers it runs in. The green badge with a checkmark is the primary write site — where writes are accepted. Other badges are read-only or standby sites.',
    icon: Server,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    highlight: 'Look for the green checkmark badge — that DC owns write authority.',
  },
  {
    id: 3,
    title: 'Confidence Levels (1–4)',
    narration: 'Every data point carries a confidence level: 4 = High (CMDB topology), 3 = Moderate (Prometheus/OEM), 2 = Low (proprietary tool only), 1 = Unknown. This tells you how much to trust the displayed location.',
    icon: CheckCircle,
    iconColor: '#FF9F0A',
    iconBg: 'rgba(255,159,10,0.12)',
    tip: 'An app showing confidence 2 means one of its sources is proprietary-only. Check the Data Quality tab.',
  },
  {
    id: 4,
    title: 'Drilling Into PCA Application',
    narration: 'Click any application card to see a detailed breakdown. The DC Distribution tab shows exactly which assets run in which data center — organized by component (Messaging, Database, Compute).',
    icon: Database,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    highlight: 'PCA runs across IBB1 (PRIMARY) and SHV (STANDBY) — Oracle has PRIMARY in IBB1 and PHYSICAL STANDBY in SHV.',
  },
  {
    id: 5,
    title: 'Data Quality Tab',
    narration: 'The Data Quality tab shows the freshness and confidence of each data source. CMDB data is over 2 hours old — a staleness warning appears. IBM MQ and Oracle OEM are fresh (under 30 minutes).',
    icon: RefreshCw,
    iconColor: '#FF9F0A',
    iconBg: 'rgba(255,159,10,0.12)',
    tip: 'Freshness thresholds: Fresh < 30min, Stale 30-120min, Very Stale > 120min.',
  },
  {
    id: 6,
    title: 'Deterministic vs Inferred',
    narration: 'Each asset carries a verification flag. A green checkmark means the role was read directly from the source control plane (deterministic). An orange branch icon means it was inferred from hostname patterns — verify manually.',
    icon: CheckCircle,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    highlight: 'MongoDB replica state = PRIMARY is deterministic. IBM MQ hostname-derived DC assignment is inferred.',
  },
  {
    id: 7,
    title: 'Incident Mode — DC Failover',
    narration: 'Click "Incident Mode" to simulate taking a data center offline. The panel shows exactly which applications are impacted, which have failover sites, and which will be completely offline.',
    icon: Siren,
    iconColor: '#FF453A',
    iconBg: 'rgba(255,69,58,0.12)',
    highlight: 'IBB1 offline: CLAIMS has NO failover — it will be offline. PCA has STANDBY in SHV (manual promotion required).',
  },
  {
    id: 8,
    title: 'Data Discovery Panel',
    narration: 'Click "Data Coverage" to see the full tech stack coverage matrix. Gaps are highlighted: Kafka has no topology or traffic source. Use "Propose New Data Source" to share discoveries with the team.',
    icon: LayoutList,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    tip: 'This panel directly supports the hackathon\'s collaborative data discovery requirement.',
  },
  {
    id: 9,
    title: 'Intent vs Actual State',
    narration: 'Open any application card and click the "Intent vs Actual" tab. Define your intended topology — active DCs, primary write site, replication model, required stacks — then run drift detection to see where reality diverges from design.',
    icon: Target,
    iconColor: '#30D158',
    iconBg: 'rgba(48,209,88,0.12)',
    highlight: 'Drift items surface CRITICAL issues: e.g., an app intends to be PRIMARY in IBB1 but is actually PRIMARY in SHV after an unrecorded failover.',
  },
  {
    id: 10,
    title: 'Staleness Time Simulation',
    narration: 'Use the time slider to fast-forward the simulated clock. Freshness indicators aging from FRESH → STALE → VERY STALE show exactly how your team would detect data degradation during an extended incident.',
    icon: RefreshCw,
    iconColor: '#FF9F0A',
    iconBg: 'rgba(255,159,10,0.12)',
    tip: 'The slider is in the Filters bar on the main Runtime Location page. Drag it to +3 hours to see stale warnings appear across all applications.',
  },
  {
    id: 11,
    title: 'Audit Trail',
    narration: 'Every import, state change, conflict detection, and intent update is recorded in the per-application Audit Log tab. This satisfies the provenance requirement: you can always answer "when did we know this, and from which source?"',
    icon: Siren,
    iconColor: '#0A84FF',
    iconBg: 'rgba(10,132,255,0.12)',
    tip: 'The audit log is scoped to the application. Global events (imports, seeds) appear across all apps.',
  },
];

interface Props {
  onClose: () => void;
  onNavigateTo?: (step: number) => void;
}

export function DemoWalkthroughOverlay({ onClose, onNavigateTo }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  function goNext() {
    if (isLast) { onClose(); return; }
    setCurrentStep((s) => s + 1);
    onNavigateTo?.(currentStep + 1);
  }

  function goPrev() {
    if (isFirst) return;
    setCurrentStep((s) => s - 1);
    onNavigateTo?.(currentStep - 1);
  }

  function goToStep(i: number) {
    setCurrentStep(i);
    onNavigateTo?.(i);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goPrev();
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
                    Step {step.id} of {STEPS.length} — Hackathon Demo
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
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {step.narration}
              </p>

              {step.highlight && (
                <div
                  className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5"
                  style={{ background: 'rgba(10,132,255,0.07)', border: '1px solid rgba(10,132,255,0.2)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5" style={{ color: '#0A84FF' }}>
                    Look:
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
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
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
                  {isLast ? 'Finish Demo' : 'Next'}
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
          <Zap className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
          <span className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Demo Mode
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--primary-500)', color: '#fff' }}>
            {currentStep + 1}/{STEPS.length}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Use ← → keys to navigate
          </span>
        </motion.div>
      </div>
    </div>
  );
}
