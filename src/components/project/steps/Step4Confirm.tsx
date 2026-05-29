import React from 'react';
import { Building2, Users, Globe, GitBranch, Plug, LayoutDashboard, CircleCheck as CheckCircle2, Loader as Loader2, CircleAlert as AlertCircle, Network, Radio, Cpu, Clock, Database, Terminal, Server, Layers, Activity } from 'lucide-react';
import { Step1Data } from './Step1Source';
import { ConnectorSelection } from './Step2Connectors';
import { Step3Data } from './Step3Dashboard';

interface Props {
  step1: Step1Data;
  connectors: ConnectorSelection[];
  step3: Step3Data;
  lobName?: string;
  teamName?: string;
  templateName?: string;
  submitting: boolean;
  submitError?: string;
}

function SummaryRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-800 last:border-0">
      <div className="flex-shrink-0 text-slate-400 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <div className="text-sm text-slate-200 mt-0.5">{value}</div>
      </div>
    </div>
  );
}

const ENV_COLORS: Record<string, string> = {
  production: 'text-red-400',
  staging: 'text-amber-400',
  development: 'text-blue-400',
  testing: 'text-slate-400',
};

function getConnectorIconConfirm(iconName: string | undefined, slug: string | undefined) {
  const name = (iconName || '').toLowerCase().trim();
  const slugClean = (slug || '').toLowerCase().trim();

  if (name === 'network') return <Network className="w-3.5 h-3.5 text-white" />;
  if (name === 'radio') return <Radio className="w-3.5 h-3.5 text-white" />;
  if (name === 'cpu') return <Cpu className="w-3.5 h-3.5 text-white" />;
  if (name === 'clock') return <Clock className="w-3.5 h-3.5 text-white" />;
  if (name === 'database' || name === 'mongodb') return <Database className="w-3.5 h-3.5 text-white" />;
  if (name === 'terminal') return <Terminal className="w-3.5 h-3.5 text-white" />;
  if (name === 'server' || name === 'openshift') return <Server className="w-3.5 h-3.5 text-white" />;
  if (name === 'globe') return <Globe className="w-3.5 h-3.5 text-white" />;
  if (name === 'layers') return <Layers className="w-3.5 h-3.5 text-white" />;
  if (name === 'activity' || name === 'splunk') return <Activity className="w-3.5 h-3.5 text-white" />;
  if (name === 'plug') return <Plug className="w-3.5 h-3.5 text-white" />;

  // Fallbacks by slug
  if (slugClean.includes('loadbalancer') || slugClean.includes('balancer') || slugClean.includes('alb')) {
    return <Network className="w-3.5 h-3.5 text-white" />;
  }
  if (slugClean.includes('kafka')) return <Radio className="w-3.5 h-3.5 text-white" />;
  if (slugClean.includes('appdynamics')) return <Cpu className="w-3.5 h-3.5 text-white" />;
  if (slugClean.includes('autosys')) return <Clock className="w-3.5 h-3.5 text-white" />;
  if (slugClean.includes('scom') || slugClean.includes('oem')) return <Server className="w-3.5 h-3.5 text-white" />;
  if (slugClean.includes('splunk') || slugClean.includes('traffic')) return <Activity className="w-3.5 h-3.5 text-white" />;
  if (slugClean.includes('mongodb') || slugClean.includes('db')) return <Database className="w-3.5 h-3.5 text-white" />;
  if (slugClean.includes('mq') || slugClean.includes('ibm')) return <Layers className="w-3.5 h-3.5 text-white" />;

  const fallbackChar = (slugClean[0] || '?').toUpperCase();
  return <span className="font-bold text-xs text-white">{fallbackChar}</span>;
}

export function Step4Confirm({ step1, connectors, step3, lobName, teamName, templateName, submitting, submitError }: Props) {
  const selectedConnectors = connectors.filter((c) => c.selected);

  const dashboardSummary = () => {
    if (step3.choice === 'blank') return 'No dashboard (add later)';
    if (step3.choice === 'custom') return 'Custom — open Dashboard Builder after registration';
    if (step3.choice === 'template' && templateName) return `Template: ${templateName}`;
    if (step3.choice === 'template' && !step3.template_id) return 'No template selected';
    return 'Template selected';
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Review & Confirm</h3>

        {/* Component card */}
        <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 space-y-0">
          <SummaryRow
            icon={<div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: step1.color }} />}
            label="Component"
            value={
              <div className="flex items-center gap-2">
                <span className="font-semibold">{step1.name}</span>
                <span className="text-xs text-slate-500 font-mono">/{step1.slug}</span>
              </div>
            }
          />
          {step1.description && (
            <SummaryRow
              icon={<span className="w-3.5 h-3.5" />}
              label="Description"
              value={<span className="text-slate-400 text-xs">{step1.description}</span>}
            />
          )}
          <SummaryRow
            icon={<Building2 className="w-3.5 h-3.5" />}
            label="Line of Business"
            value={lobName || step1.lob_id}
          />
          {teamName && (
            <SummaryRow
              icon={<Users className="w-3.5 h-3.5" />}
              label="Team"
              value={teamName}
            />
          )}
          <SummaryRow
            icon={<Globe className="w-3.5 h-3.5" />}
            label="Environment"
            value={
              <span className={`capitalize font-medium ${ENV_COLORS[step1.environment] || 'text-slate-300'}`}>
                {step1.environment}
              </span>
            }
          />
          {step1.import_mode === 'git' && step1.repository_url && (
            <SummaryRow
              icon={<GitBranch className="w-3.5 h-3.5" />}
              label="Repository"
              value={
                <span className="font-mono text-xs text-slate-300">
                  {step1.repository_url} ({step1.branch || 'main'})
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* Connectors */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Plug className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-300">
            Connectors ({selectedConnectors.length})
          </h3>
        </div>
        {selectedConnectors.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">No connectors selected. You can add them after registration.</p>
        ) : (
          <div className="space-y-1.5">
            {selectedConnectors.map((c) => (
              <div
                key={c.catalog_entry_id}
                className="flex items-center gap-2.5 px-3 py-2 bg-slate-800/60 rounded-lg border border-slate-700"
              >
                <div
                  className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: c.catalogColor || '#334155' }}
                >
                  {getConnectorIconConfirm(c.catalogIcon, c.catalogSlug)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-200">{c.name}</span>
                  {c.catalogSlug && c.catalogSlug !== c.name && (
                    <span className="ml-2 text-xs text-slate-500 font-mono">{c.catalogSlug}</span>
                  )}
                </div>
                {c.testStatus === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dashboard */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-300">Dashboard</h3>
        </div>
        <div className="px-3 py-2 bg-slate-800/60 rounded-lg border border-slate-700">
          <p className="text-sm text-slate-300">{dashboardSummary()}</p>
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{submitError}</p>
        </div>
      )}

      {/* Submit state */}
      {submitting && (
        <div className="flex items-center gap-3 p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg">
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" />
          <p className="text-sm text-sky-300">Registering component and assigning connectors...</p>
        </div>
      )}
    </div>
  );
}
