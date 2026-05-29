import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { projectApi, lobApi, teamApi, dashboardTemplateApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import { Step1Source, Step1Data } from './steps/Step1Source';
import { Step2Connectors, ConnectorSelection } from './steps/Step2Connectors';
import { Step3Dashboard, Step3Data } from './steps/Step3Dashboard';
import { Step4Confirm } from './steps/Step4Confirm';
import { slugify } from '@/lib/utils';

interface Props {
  onClose: () => void;
  onSuccess: (projectId: string) => void;
  initialLobId?: string;
}

const STEPS = [
  { label: 'Source', description: 'Component & Git' },
  { label: 'Connectors', description: 'Auto-detect' },
  { label: 'Dashboard', description: 'Template' },
  { label: 'Confirm', description: 'Register' },
];

function StepIndicator({ step, current }: { step: typeof STEPS[0] & { index: number }; current: number }) {
  const done = current > step.index;
  const active = current === step.index;

  return (
    <div className="flex flex-col items-center gap-1.5 relative">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
          done
            ? 'bg-emerald-500 text-white'
            : active
            ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
            : 'bg-slate-700 text-slate-400'
        }`}
      >
        {done ? <Check className="w-4 h-4" /> : <span>{step.index + 1}</span>}
      </div>
      <div className="text-center">
        <p className={`text-xs font-semibold ${active ? 'text-sky-300' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
          {step.label}
        </p>
        <p className="text-xs text-slate-600 hidden sm:block">{step.description}</p>
      </div>
    </div>
  );
}

function canAdvance(step: number, step1: Step1Data, connectors: ConnectorSelection[], step3: Step3Data): boolean {
  if (step === 0) {
    return !!(step1.name.trim() && step1.slug.trim() && step1.lob_id);
  }
  if (step === 1) return true;
  if (step === 2) {
    if (step3.choice === 'template') return !!step3.template_id;
    return true;
  }
  return true;
}

export function RegistrationWizard({ onClose, onSuccess, initialLobId }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [step1, setStep1] = useState<Step1Data>({
    name: '',
    slug: '',
    description: '',
    lob_id: initialLobId || '',
    team_id: '',
    component_id: '',
    environment: 'production',
    color: '#30D158',
    import_mode: 'manual',
    repository_url: '',
    branch: 'main',
    access_token: '',
  });
  const [connectors, setConnectors] = useState<ConnectorSelection[]>([]);
  const [step3, setStep3] = useState<Step3Data>({ choice: 'blank', template_id: '' });

  const [lobs, setLobs] = React.useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = React.useState<{ id: string; name: string; lob_id: string }[]>([]);
  const [templates, setTemplates] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    lobApi.list().then((r) => setLobs(r.data));
    teamApi.list().then((r) => setTeams(r.data));
    dashboardTemplateApi.list().then((r) => setTemplates(r.data));
  }, []);

  const lobName = lobs.find((l) => l.id === step1.lob_id)?.name;
  const teamName = teams.find((t) => t.id === step1.team_id)?.name;
  const templateName = templates.find((t) => t.id === step3.template_id)?.name;

  const navigate = (delta: 1 | -1) => {
    setDirection(delta);
    setCurrentStep((s) => s + delta);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        name: step1.name,
        slug: step1.slug,
        description: step1.description || undefined,
        lob_id: step1.lob_id,
        team_id: step1.team_id || undefined,
        component_id: step1.component_id || undefined,
        environment: step1.environment,
        color: step1.color,
        connectors: connectors
          .filter((c) => c.selected)
          .map((c) => ({
            catalog_entry_id: c.catalog_entry_id,
            name: c.name,
            config: Object.keys(c.config).length > 0 ? c.config : undefined,
          })),
        dashboard_template_id: step3.choice === 'template' && step3.template_id ? step3.template_id : undefined,
      };

      const res = await projectApi.register(payload);
      notify.success('Component registered', `"${step1.name}" is ready.`);
      onSuccess(res.data.project_id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Registration failed. Please try again.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const ok = canAdvance(currentStep, step1, connectors, step3);

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-semibold text-slate-100">Register New Component</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-start justify-between relative">
            {/* Connector line */}
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-800" />
            <div
              className="absolute top-4 left-4 h-0.5 bg-sky-500 transition-all duration-500"
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
            {STEPS.map((s, i) => (
              <StepIndicator key={s.label} step={{ ...s, index: i }} current={currentStep} />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {currentStep === 0 && (
                <Step1Source data={step1} onChange={setStep1} />
              )}
              {currentStep === 1 && (
                <Step2Connectors step1={step1} connectors={connectors} onChange={setConnectors} />
              )}
              {currentStep === 2 && (
                <Step3Dashboard data={step3} onChange={setStep3} />
              )}
              {currentStep === 3 && (
                <Step4Confirm
                  step1={step1}
                  connectors={connectors}
                  step3={step3}
                  lobName={lobName}
                  teamName={teamName}
                  templateName={templateName}
                  submitting={submitting}
                  submitError={submitError}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/80">
          <Button
            variant="ghost"
            onClick={currentStep === 0 ? onClose : () => navigate(-1)}
            disabled={submitting}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep ? 'w-5 bg-sky-400' : i < currentStep ? 'w-2 bg-emerald-500' : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>

          {currentStep < STEPS.length - 1 ? (
            <Button onClick={() => navigate(1)} disabled={!ok}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || !ok}>
              {submitting ? 'Registering...' : 'Register Component'}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
