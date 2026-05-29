import React, { useState, useEffect, useCallback } from 'react';
import { Target, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Circle as XCircle, CircleHelp as HelpCircle, Zap, Info, ChevronRight, CreditCard as Edit3, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { IntentDefinitionPanel } from './IntentDefinitionPanel';
import type {
  ApplicationLocationDetail, IntentDrift, DriftSeverity,
} from '@/types';

interface Props {
  detail: ApplicationLocationDetail;
}

const SEVERITY_CONFIG: Record<DriftSeverity, { color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { color: '#FF453A', bg: 'rgba(255,69,58,0.1)',  border: 'rgba(255,69,58,0.3)',  label: 'Critical' },
  HIGH:     { color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)', border: 'rgba(255,159,10,0.3)', label: 'High' },
  MEDIUM:   { color: '#0A84FF', bg: 'rgba(10,132,255,0.1)', border: 'rgba(10,132,255,0.3)', label: 'Medium' },
  LOW:      { color: '#8E8E93', bg: 'rgba(142,142,147,0.1)', border: 'rgba(142,142,147,0.2)', label: 'Low' },
};

const DRIFT_TYPE_LABELS: Record<string, string> = {
  MISSING_DC:        'Missing Data Center',
  WRONG_PRIMARY:     'Wrong Primary DC',
  MISSING_COMPONENT: 'Missing Component',
  EXTRA_DC:          'Unexpected DC',
  ROLE_MISMATCH:     'Role Mismatch',
  STALE_DATA:        'Stale Data',
};

function DriftCard({ drift }: { drift: IntentDrift }) {
  const cfg = SEVERITY_CONFIG[drift.severity];
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-start gap-3"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: cfg.border, color: cfg.color }}
          >
            {cfg.label}
          </span>
          <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>
            {DRIFT_TYPE_LABELS[drift.drift_type] ?? drift.drift_type}
          </span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{drift.description}</p>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Intended: <span style={{ color: 'var(--text-secondary)' }}>{drift.intended}</span>
          </span>
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Actual: <span style={{ color: cfg.color }}>{drift.actual}</span>
          </span>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Detected: {new Date(drift.detected_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function IntentRow({
  label, intended, actual, match,
}: { label: string; intended: string; actual: string; match: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--app-border)' }}>
      <td className="px-3 py-3">
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-[12px]" style={{ color: '#0A84FF' }}>{intended || '—'}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-[12px]" style={{ color: match ? '#30D158' : '#FF453A' }}>{actual || '—'}</span>
      </td>
      <td className="px-3 py-3">
        {match
          ? <CheckCircle className="w-4 h-4" style={{ color: '#30D158' }} />
          : <XCircle className="w-4 h-4" style={{ color: '#FF453A' }} />
        }
      </td>
    </tr>
  );
}

function AlignmentBadge({ status }: { status?: string }) {
  if (status === 'ALIGNED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(48,209,88,0.12)', color: '#30D158' }}>
        <CheckCircle className="w-2.5 h-2.5" />
        Aligned
      </span>
    );
  }
  if (status === 'DRIFTED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(255,69,58,0.12)', color: '#FF453A' }}>
        <AlertTriangle className="w-2.5 h-2.5" />
        Drifted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: 'rgba(142,142,147,0.12)', color: '#8E8E93' }}>
      <HelpCircle className="w-2.5 h-2.5" />
      Unknown
    </span>
  );
}

export function IntentVsActualTab({ detail }: Props) {
  const { intents, drifts, loadDriftFromBackend } = useRuntimeLocationStore();
  const intent = intents.find((i) => i.application_id === detail.application_id);
  const appDrifts = drifts.filter(
    (d) => d.application_id === detail.application_id && d.environment === detail.environment,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Run drift detection from backend on mount if intent exists
  useEffect(() => {
    if (intent && loadDriftFromBackend) {
      loadDriftFromBackend(detail.application_id, detail.environment);
    }
  }, [intent?.application_id, detail.environment]);

  const handleRunDrift = useCallback(async () => {
    if (!loadDriftFromBackend) return;
    setIsRunning(true);
    try {
      await loadDriftFromBackend(detail.application_id, detail.environment);
    } finally {
      setIsRunning(false);
    }
  }, [detail.application_id, detail.environment, loadDriftFromBackend]);

  // Derive actual state from detail
  const allAssets = detail.components.flatMap((c) => c.assets);
  const actualDCs = [...new Set(allAssets.map((a) => a.data_center?.short_name).filter(Boolean))];
  const actualStacks = [...new Set(detail.components.map((c) => c.tech_stack))];
  const primaryAsset = allAssets.find((a) => a.write_authority && a.latest_operational_state === 'ACTIVE');
  const actualPrimary = primaryAsset?.data_center?.short_name ?? 'Unknown';

  const hasIntent = !!intent;
  const noConflict = hasIntent && appDrifts.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: '#0A84FF' }} />
          <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Intent vs Actual State
          </h3>
          {hasIntent && <AlignmentBadge status={intent?.alignment_status} />}
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
          style={{ background: '#0A84FF', color: '#fff' }}
        >
          <Edit3 className="w-3 h-3" />
          {hasIntent ? 'Edit Intent' : 'Define Intent'}
        </button>
      </div>

      {/* Explanation */}
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-2.5"
        style={{ background: 'rgba(10,132,255,0.07)', border: '1px solid rgba(10,132,255,0.2)' }}
      >
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#0A84FF' }} />
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          This view separates <strong>design intent</strong> (where the app is supposed to run) from
          <strong> actual runtime state</strong> (where it is actually running). Drift items highlight when
          reality diverges from the intended topology. CRITICAL drifts are automatically persisted to the audit log.
        </p>
      </div>

      {!hasIntent ? (
        <div
          className="rounded-2xl flex flex-col items-center gap-4 py-12"
          style={{ background: 'var(--app-surface)', border: '1px dashed var(--app-border)' }}
        >
          <Target className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <div className="text-center">
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              No intent defined for this application
            </p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Define the intended topology to enable drift detection
            </p>
          </div>
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold"
            style={{ background: '#0A84FF', color: '#fff' }}
          >
            <Zap className="w-3.5 h-3.5" />
            Define Application Intent
          </button>
        </div>
      ) : (
        <>
          {/* Drift summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as DriftSeverity[]).map((sev) => {
              const count = appDrifts.filter((d) => d.severity === sev).length;
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <div
                  key={sev}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: count > 0 ? cfg.bg : 'var(--app-surface)', border: `1px solid ${count > 0 ? cfg.border : 'var(--app-border)'}` }}
                >
                  <p className="text-[20px] font-bold leading-none" style={{ color: count > 0 ? cfg.color : 'var(--text-muted)' }}>{count}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: count > 0 ? cfg.color : 'var(--text-muted)' }}>{cfg.label} Drift</p>
                </div>
              );
            })}
          </div>

          {noConflict && (
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-2.5"
              style={{ background: 'rgba(48,209,88,0.07)', border: '1px solid rgba(48,209,88,0.25)' }}
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#30D158' }} />
              <p className="text-[12px] font-semibold" style={{ color: '#30D158' }}>
                No drift detected — actual state matches intent
              </p>
            </div>
          )}

          {/* Side-by-side table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--app-surface)' }}>
                  {['Dimension', 'Intended', 'Actual', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <IntentRow
                  label="Active DCs"
                  intended={intent.intended_active_dcs.join(', ')}
                  actual={actualDCs.join(', ')}
                  match={
                    intent.intended_active_dcs.every((dc) => actualDCs.includes(dc)) &&
                    actualDCs.every((dc) => intent.intended_active_dcs.includes(dc ?? ''))
                  }
                />
                <IntentRow
                  label="Primary Write DC"
                  intended={intent.intended_primary_dc || '—'}
                  actual={actualPrimary}
                  match={!intent.intended_primary_dc || actualPrimary === intent.intended_primary_dc}
                />
                <IntentRow
                  label="Failover Type"
                  intended={intent.failover_type}
                  actual="(as configured)"
                  match={true}
                />
                <IntentRow
                  label="Replication Model"
                  intended={intent.replication_model.replace('_', ' ')}
                  actual="(inferred from roles)"
                  match={true}
                />
                <IntentRow
                  label="Required Stacks"
                  intended={intent.required_tech_stacks.join(', ')}
                  actual={actualStacks.join(', ')}
                  match={intent.required_tech_stacks.every((s) => actualStacks.includes(s))}
                />
              </tbody>
            </table>
          </div>

          {/* Drift list */}
          {appDrifts.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Drift Items ({appDrifts.length})
              </p>
              {appDrifts.map((d) => <DriftCard key={d.id} drift={d} />)}
            </div>
          )}

          {/* Re-run drift detection (live from backend) */}
          <button
            onClick={handleRunDrift}
            disabled={isRunning}
            className="self-start flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw className={cn('w-3 h-3', isRunning && 'animate-spin')} />
            {isRunning ? 'Running...' : 'Re-run Drift Detection'}
          </button>
        </>
      )}

      <IntentDefinitionPanel
        appId={detail.application_id}
        appName={detail.application_name}
        environment={detail.environment}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
}
