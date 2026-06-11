import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Server, ChevronDown, FileDown, Zap, RefreshCw, Loader as Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { runtimeApi } from '@/lib/api';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';

interface AppImpact {
  application_id: string;
  application_name: string;
  environment: string;
  primary_dc: string | null;
  has_failover: boolean;
  failover_target: string | null;
  promotion_required: boolean;
  critical_reason: string | null;
  affected_tech_stacks: string[];
  standby_dc: string | null;
}

interface SimulationResult {
  dc: string;
  dc_full_name: string;
  simulated_at: string;
  total_apps_impacted: number;
  critical_count: number;
  warning_count: number;
  estimated_recovery_summary: string;
  failover_targets: Record<string, string | null>;
  critical_apps: AppImpact[];
  warning_apps: AppImpact[];
}

interface Props {
  onClose: () => void;
}

function ImpactRow({ impact }: { impact: AppImpact }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: impact.has_failover
          ? '1px solid rgba(255,159,10,0.3)'
          : '1px solid rgba(255,69,58,0.4)',
        background: impact.has_failover
          ? 'rgba(255,159,10,0.04)'
          : 'rgba(255,69,58,0.05)',
      }}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          {impact.has_failover ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FF9F0A' }} />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FF453A' }} />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {impact.application_name}
              </span>
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{
                  background: impact.environment === 'PRODUCTION' ? 'rgba(10,132,255,0.12)' : 'rgba(255,159,10,0.12)',
                  color: impact.environment === 'PRODUCTION' ? '#0A84FF' : '#FF9F0A',
                }}
              >
                {impact.environment}
              </span>
              {impact.affected_tech_stacks.length > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {impact.affected_tech_stacks.slice(0, 2).join(', ')}
                </span>
              )}
            </div>
            {!impact.has_failover && (
              <p className="text-[11px] font-semibold mt-0.5" style={{ color: '#FF453A' }}>
                NO FAILOVER AVAILABLE — application will be OFFLINE
              </p>
            )}
            {impact.has_failover && (
              <p className="text-[11px] mt-0.5" style={{ color: '#FF9F0A' }}>
                Standby available in {impact.standby_dc || impact.failover_target}
              </p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn('w-4 h-4 flex-shrink-0 mt-0.5 transition-transform', open && 'rotate-180')}
          style={{ color: 'var(--text-muted)' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-3 flex flex-col gap-2"
              style={{ borderTop: '1px solid var(--app-border)' }}
            >
              {impact.has_failover && impact.failover_target && (
                <div className="flex items-start gap-2 mt-2">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#30D158' }} />
                  <div>
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Failover target
                    </p>
                    <p className="text-[12px] font-mono" style={{ color: 'var(--text-primary)' }}>
                      {impact.failover_target}
                    </p>
                  </div>
                </div>
              )}
              {impact.promotion_required && (
                <div
                  className="rounded-lg px-3 py-2 flex items-start gap-2"
                  style={{ background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.2)' }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#FF9F0A' }} />
                  <p className="text-[11px]" style={{ color: '#FF9F0A' }}>
                    Manual promotion required — DBA action needed to promote standby to primary
                  </p>
                </div>
              )}
              {!impact.has_failover && (
                <div
                  className="rounded-lg px-3 py-2 flex items-start gap-2"
                  style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#FF453A' }} />
                  <p className="text-[11px]" style={{ color: '#FF453A' }}>
                    {impact.critical_reason || 'No failover path available'}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function IncidentModePanel({ onClose }: Props) {
  const { dataCenters } = useRuntimeLocationStore();

  const allDCs = useMemo(() => {
    const parsed = dataCenters.map((d) => d.short_name ?? d.name).filter(Boolean) as string[];
    // Default fallbacks if no real DCs loaded yet
    const defaults = ['IBB1', 'SHV', 'GA-PRD', 'MA-PRD', 'GA-UAT', 'MA-UAT'];
    return parsed.length > 0 ? parsed : defaults;
  }, [dataCenters]);

  const [selectedDc, setSelectedDc] = useState<string>(allDCs[0] || 'IBB1');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLiveData, setHasLiveData] = useState(false);

  // Update selectedDc when allDCs changes (after dataCenters load)
  useEffect(() => {
    if (allDCs.length > 0 && !allDCs.includes(selectedDc)) {
      setSelectedDc(allDCs[0]);
    }
  }, [allDCs]);

  // Automatically run simulation when DC changes
  useEffect(() => {
    runSimulation(selectedDc);
  }, [selectedDc]);

  async function runSimulation(dc: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await runtimeApi.simulateFailover(dc);
      setResult(res.data);
      setHasLiveData(true);
    } catch {
      setError('No runtime data available for this DC. Import CSV data first to get real simulation results.');
      setResult(null);
      setHasLiveData(false);
    } finally {
      setLoading(false);
    }
  }

  const impacts = result ? [...result.critical_apps, ...result.warning_apps] : [];
  const criticalCount = result?.critical_count ?? 0;
  const warningCount = result?.warning_count ?? 0;

  function exportReport() {
    const report = {
      simulation_time: result?.simulated_at ?? new Date().toISOString(),
      dc_taken_offline: selectedDc,
      dc_full_name: result?.dc_full_name ?? selectedDc,
      impacted_applications: impacts.length,
      critical_no_failover: criticalCount,
      warning_has_failover: warningCount,
      estimated_recovery: result?.estimated_recovery_summary ?? 'Per RTO SLA',
      impacts,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-report-${selectedDc}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative flex flex-col w-full max-w-[520px] h-full overflow-hidden"
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
              style={{ background: 'rgba(255,69,58,0.12)' }}
            >
              <Zap className="w-4 h-4" style={{ color: '#FF453A' }} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Incident Mode
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Blast Radius Simulation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasLiveData && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(48,209,88,0.12)', color: '#30D158' }}
              >
                LIVE DATA
              </span>
            )}
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
        </div>

        {/* DC selector */}
        <div className="px-5 py-4 flex flex-col gap-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Select DC to take offline:
            </p>
            <button
              onClick={() => runSimulation(selectedDc)}
              disabled={loading}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-muted)',
              }}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh
            </button>
          </div>
          <div className="relative">
            <select
              value={selectedDc}
              onChange={(e) => setSelectedDc(e.target.value)}
              className="w-full appearance-none rounded-xl pl-3 pr-8 py-2.5 text-[13px] font-medium"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              {allDCs.map((dc) => (
                <option key={dc} value={dc}>{dc}</option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
          </div>

          {/* Impact summary */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF453A' }} />
              <div>
                <p className="text-[18px] font-bold leading-none" style={{ color: '#FF453A' }}>
                  {loading ? '—' : criticalCount}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#FF453A' }}>
                  Critical — no failover
                </p>
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.2)' }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF9F0A' }} />
              <div>
                <p className="text-[18px] font-bold leading-none" style={{ color: '#FF9F0A' }}>
                  {loading ? '—' : warningCount}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#FF9F0A' }}>
                  Warning — failover available
                </p>
              </div>
            </div>
          </div>

          {result?.estimated_recovery_summary && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {result.estimated_recovery_summary}
            </p>
          )}
        </div>

        {/* Impact list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                Calculating blast radius for {selectedDc}...
              </p>
            </div>
          ) : error ? (
            <div
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.2)' }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF9F0A' }} />
                <p className="text-[12px] font-semibold" style={{ color: '#FF9F0A' }}>No Data Available</p>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{error}</p>
            </div>
          ) : impacts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Server className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                No applications are hosted in {selectedDc}
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Blast Radius — {impacts.length} application{impacts.length !== 1 ? 's' : ''} affected
              </p>
              {/* Critical apps first */}
              {result?.critical_apps.map((impact) => (
                <ImpactRow key={`${impact.application_id}-${impact.environment}-c`} impact={impact} />
              ))}
              {/* Warning apps */}
              {result?.warning_apps.map((impact) => (
                <ImpactRow key={`${impact.application_id}-${impact.environment}-w`} impact={impact} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--app-border)' }}
        >
          <div className="flex flex-col">
            <p className="text-[10px] font-bold text-[var(--text-muted)]">
              Simulation only — no changes are made.
            </p>
            <p className="text-[9px] text-[var(--text-disabled)] mt-0.5 leading-normal max-w-[280px]">
              Production runs in a decoupled, transaction-isolated sandbox memory layer (no database mutations).
            </p>
          </div>
          <button
            onClick={exportReport}
            disabled={impacts.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold disabled:opacity-40 flex-shrink-0"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-secondary)',
            }}
          >
            <FileDown className="w-3.5 h-3.5" />
            Export Report JSON
          </button>
        </div>
      </motion.div>
    </div>
  );
}
