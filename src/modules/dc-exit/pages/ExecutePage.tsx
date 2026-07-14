/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Execute step page. Binds directly to the stateful failover saga orchestrator APIs:
 * - Starts sequential or staged migrations.
 * - Polls progress every 2 seconds.
 * - Handles manual wave gate approvals (Pause, Resume, Rollback).
 * - Displays a live database audit log journal.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Play, Pause, RotateCcw, CheckCircle2, 
  AlertTriangle, Loader2, Activity, FileText, Check, XCircle, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ExecutionTab } from '@/modules/dc-exit/components/ExecutionTab';
import { TimelineTab } from '@/modules/dc-exit/components/TimelineTab';
import { DcExitLoading, DcExitError, DcExitEmpty } from '@/modules/dc-exit/components/DcExitStates';
import { useDcExitSession } from '@/modules/dc-exit/hooks/useDcExitSession';
import { 
  useMigrationStatus, useStartMigration, usePauseMigration, 
  useResumeMigration, useRollbackMigration, useFailoverView 
} from '@/modules/dc-exit/hooks/useDcExitQueries';
import type { ExecApp, ExecStatus, TimelineActual } from '@/modules/dc-exit/data/executeMockData';

const TABS: AnalyzeTabDef[] = [
  { id: 'execution', label: 'Execution Status' },
  { id: 'audit', label: 'Audit Journal' },
  { id: 'timeline', label: 'Timeline Tracker' },
];

export function ExecutePage() {
  const navigate = useNavigate();
  const { sessionId, session } = useDcExitSession();
  const [activeTab, setActiveTab] = useState<string>('execution');
  const [mode, setMode] = useState<'STAGED' | 'EXPRESS'>('STAGED');

  const sourceDc = session?.dataCenterShort ?? '';
  const targetDc = session?.targetDataCenterShort ?? 'SHV';

  // Persist runId in localStorage keyed by sessionId
  const [runId, setRunId] = useState<string | null>(() => {
    if (!sessionId) return null;
    return localStorage.getItem(`dc_exit_run_${sessionId}`);
  });

  // Keep localStorage in sync with runId
  useEffect(() => {
    if (sessionId) {
      if (runId) {
        localStorage.setItem(`dc_exit_run_${sessionId}`, runId);
      } else {
        localStorage.removeItem(`dc_exit_run_${sessionId}`);
      }
    }
  }, [runId, sessionId]);

  // Failover View (Ontology pre-check execution plan)
  const { data: failoverView, isLoading: viewLoading } = useFailoverView(sourceDc, targetDc);

  // Live polling of migration progress (refetch every 2 seconds if runId exists)
  const { data: statusData, isLoading: statusLoading, refetch } = useMigrationStatus(runId || undefined, {
    refetchInterval: runId ? 2000 : false,
  });

  // Mutation endpoints
  const startMutation = useStartMigration();
  const pauseMutation = usePauseMigration();
  const resumeMutation = useResumeMigration();
  const rollbackMutation = useRollbackMigration();

  // Map backend status response to components
  const execApps = useMemo<ExecApp[]>(() => {
    if (!statusData?.apps) return [];
    return statusData.apps.map((app) => {
      const status: ExecStatus = 
        app.status === 'completed' ? 'completed' :
        app.status === 'running' ? 'running' :
        app.status === 'failed' ? 'failed' : 'pending';

      const nameLower = app.app_name.toLowerCase();
      const techIcon: 'oracle' | 'kafka' | 'mq' | 'dns' | 'app' =
        nameLower.includes('oracle') || nameLower.includes('database') ? 'oracle' :
        nameLower.includes('kafka') ? 'kafka' :
        nameLower.includes('mq') ? 'mq' :
        nameLower.includes('dns') || nameLower.includes('gslb') ? 'dns' : 'app';

      const phases = ["NOTIFY", "DATA_PLANE", "MESSAGING_PLANE", "COMPUTE_PLANE", "TRAFFIC_SHIFT", "CONFIG_RIPPLE", "VALIDATE"];
      const stepsTotal = phases.length;
      const currentIdx = phases.indexOf(app.current_phase);
      const stepsDone = app.status === 'completed' ? stepsTotal : Math.max(0, currentIdx);

      // Find wave number from waves list if possible
      const waveItem = statusData.waves.find(w => w.id === app.wave_id);
      const wave = waveItem ? waveItem.wave_number : 1;

      return {
        id: app.app_id,
        name: app.app_name,
        techIcon,
        tier: 'T1',
        wave,
        status,
        progress: app.progress,
        confidence: app.status === 'completed' ? 100 : app.status === 'failed' ? 15 : 82,
        stepsDone,
        stepsTotal,
        owner: 'Saga Failover Engine',
        detail: app.error || `Processing phase: ${app.current_phase}. Progress: ${app.progress}%`,
      };
    });
  }, [statusData]);

  const timeline = useMemo<TimelineActual[]>(() => {
    if (!statusData?.waves) return [];
    return statusData.waves.map((wave, idx) => {
      const isCompleted = wave.status === 'complete';
      const isRunning = wave.status === 'running';

      return {
        hour: idx,
        label: `Wave ${wave.wave_number} Cutover`,
        startMin: idx * 30,
        durationMin: 30,
        actualStartMin: isCompleted || isRunning ? idx * 30 : null,
        actualDurationMin: isCompleted ? 30 : null,
        actualStatus: isCompleted ? 'completed' : isRunning ? 'running' : 'pending',
      };
    });
  }, [statusData]);

  const hours = useMemo(() => {
    if (timeline.length === 0) return [0];
    const maxHour = Math.max(...timeline.map((t) => t.hour));
    return Array.from({ length: Math.max(maxHour + 1, 1) }, (_, i) => i);
  }, [timeline]);

  // Start Migration Handler
  const handleStartMigration = async () => {
    if (!sessionId || !sourceDc || !targetDc) return;
    try {
      const result = await startMutation.mutateAsync({
        session_id: sessionId,
        source_dc: sourceDc,
        target_dc: targetDc,
        mode,
      });
      if (result.run_id) {
        setRunId(result.run_id);
        refetch();
      }
    } catch (err) {
      console.error("Failed to start migration", err);
    }
  };

  const handlePause = async () => {
    if (!runId) return;
    await pauseMutation.mutateAsync(runId);
    refetch();
  };

  const handleResume = async () => {
    if (!runId) return;
    await resumeMutation.mutateAsync(runId);
    refetch();
  };

  const handleRollback = async () => {
    if (!runId) return;
    if (confirm("Are you sure you want to trigger compensating rollback actions? This cannot be undone.")) {
      await rollbackMutation.mutateAsync(runId);
      refetch();
    }
  };

  const handleResetSession = () => {
    setRunId(null);
  };

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/validate`);
  };

  // 1. Initial State: No active run started yet
  if (!runId) {
    const previewApps = failoverView?.layer_1_apps?.resident || [];
    const previewWaves = failoverView?.layer_6_waves?.waves || [];

    return (
      <div className="flex flex-col gap-6 max-w-4xl mx-auto py-4">
        <div 
          className="rounded-[10px] p-6 flex flex-col gap-6"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-[6px]" style={{ background: 'rgba(0,108,255,0.1)', border: '1px solid rgba(0,108,255,0.2)' }}>
              <Settings className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Configure Failover Execution
              </h3>
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Establish parameters and review waves before launching cutover orchestration.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode selection cards */}
            <button
              onClick={() => setMode('STAGED')}
              className={`p-4 rounded-[8px] text-left transition-all border flex flex-col gap-2 ${
                mode === 'STAGED' 
                  ? 'border-[var(--text-primary)] bg-[rgba(255,255,255,0.02)]' 
                  : 'border-[var(--app-border)] bg-transparent hover:bg-[rgba(255,255,255,0.01)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Staged Mode (Recommended)
                </span>
                {mode === 'STAGED' && <Check className="w-4 h-4" style={{ color: '#00B074' }} />}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Automatically halts at wave boundaries. Requires explicit manual operator approvals before advancing compute/network planes.
              </p>
            </button>

            <button
              onClick={() => setMode('EXPRESS')}
              className={`p-4 rounded-[8px] text-left transition-all border flex flex-col gap-2 ${
                mode === 'EXPRESS' 
                  ? 'border-[var(--text-primary)] bg-[rgba(255,255,255,0.02)]' 
                  : 'border-[var(--app-border)] bg-transparent hover:bg-[rgba(255,255,255,0.01)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Express Mode
                </span>
                {mode === 'EXPRESS' && <Check className="w-4 h-4" style={{ color: '#00B074' }} />}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Fully automated pipeline. Sequentially transitions applications through all planes in parallel waves without manual gateways.
              </p>
            </button>
          </div>

          {/* Workload Preview */}
          <div className="flex flex-col gap-3 pt-3 border-t" style={{ borderColor: 'var(--app-border)' }}>
            <h4 className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
              Workloads Queued for Migration ({previewApps.length} Apps)
            </h4>
            {viewLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : previewApps.length === 0 ? (
              <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
                No active production assets found in data center {sourceDc}.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {previewWaves.map((wave: any, wIdx: number) => (
                  <div 
                    key={wIdx} 
                    className="p-3 rounded-[6px] flex flex-col gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--app-border)' }}
                  >
                    <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
                      WAVE {wave.wave} (Effort: {wave.total_effort}h)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {wave.apps.map((app: any, aIdx: number) => (
                        <span 
                          key={aIdx} 
                          className="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold"
                          style={{ background: 'var(--app-bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                        >
                          {app.appName} ({app.tier})
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3">
            <Button
              variant="primary"
              size="lg"
              disabled={startMutation.isPending || previewApps.length === 0}
              onClick={handleStartMigration}
              iconRight={startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            >
              {startMutation.isPending ? "Spawning Saga..." : "Launch Cutover Orchestration"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Run State
  if (statusLoading && !statusData) {
    return <DcExitLoading label="Establishing connection with Failover Engine..." />;
  }

  const runStatus = statusData?.status || 'RUNNING';
  const totalAppsCount = execApps.length;
  const completedAppsCount = execApps.filter(a => a.status === 'completed').length;
  const failedAppsCount = execApps.filter(a => a.status === 'failed').length;
  const overallProgress = totalAppsCount > 0 ? Math.round((completedAppsCount / totalAppsCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* --- Top Dashboard Panel --- */}
      <div 
        className="rounded-[10px] p-5 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider text-[var(--text-disabled)]">RUN ID: {runId.substring(0,8)}...</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-muted)'
                }}>{statusData?.mode}</span>
              </div>
              <h3 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Failover: {sourceDc} → {targetDc}
              </h3>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {runStatus === 'RUNNING' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePause}
                disabled={pauseMutation.isPending}
                icon={<Pause className="w-3.5 h-3.5" />}
              >
                Pause
              </Button>
            )}

            {runStatus === 'PAUSED' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleResume}
                  disabled={resumeMutation.isPending}
                  icon={<Play className="w-3.5 h-3.5" />}
                >
                  Resume Wave
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRollback}
                  disabled={rollbackMutation.isPending}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Rollback
                </Button>
              </>
            )}

            {runStatus === 'FAILED' && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleRollback}
                disabled={rollbackMutation.isPending}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Rollback to Safe
              </Button>
            )}

            {(runStatus === 'COMPLETED' || runStatus === 'ROLLED_BACK') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleResetSession}
              >
                Re-Configure
              </Button>
            )}
          </div>
        </div>

        {/* Progress Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center border-t pt-4" style={{ borderColor: 'var(--app-border)' }}>
          {/* Status Badge */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
              Orchestrator Status
            </span>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                runStatus === 'RUNNING' || runStatus === 'ROLLING_BACK' ? 'animate-pulse bg-[#006CFF]' :
                runStatus === 'PAUSED' ? 'bg-[#FFB100]' :
                runStatus === 'COMPLETED' ? 'bg-[#00B074]' : 'bg-[#FF4D4D]'
              }`} />
              <span className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {runStatus}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex flex-col gap-1 md:col-span-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
              <span>Cutover Progress</span>
              <span className="font-mono">{overallProgress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
              <div 
                className="h-full rounded-full transition-all duration-500" 
                style={{ 
                  width: `${overallProgress}%`,
                  background: runStatus === 'FAILED' ? '#FF4D4D' : '#00B074'
                }} 
              />
            </div>
          </div>

          {/* Summary counters */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
              Workloads Status
            </span>
            <span className="text-[12px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              {completedAppsCount} done / {failedAppsCount > 0 ? `${failedAppsCount} failed / ` : ''}{totalAppsCount} total
            </span>
          </div>
        </div>
      </div>

      {/* --- Tab Control & View --- */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'execution' && (
        <ExecutionTab apps={execApps} />
      )}

      {activeTab === 'audit' && (
        <div 
          className="rounded-[10px] p-5 flex flex-col gap-4"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Infrastructure Call Log Journal
            </h4>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {(statusData?.audit_logs || []).length} audit entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--app-border)' }}>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Timestamp</th>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Component</th>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Adapter</th>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Operation</th>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Target</th>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solid" style={{ borderColor: 'var(--app-border)' }}>
                {(statusData?.audit_logs || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-[12px] italic text-[var(--text-disabled)]">
                      No infrastructure adapter call journal logged yet.
                    </td>
                  </tr>
                ) : (
                  (statusData?.audit_logs || []).map((log) => (
                    <tr key={log.id} className="text-[12px] hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                      <td className="py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 font-semibold text-[var(--text-primary)]">
                        {log.app_id || 'Global'}
                      </td>
                      <td className="py-2.5 text-[var(--text-secondary)]">{log.adapter_name}</td>
                      <td className="py-2.5 font-mono text-[11px] text-[var(--text-muted)]">{log.operation}</td>
                      <td className="py-2.5 font-mono text-[11px] text-[var(--text-muted)]">{log.target || 'N/A'}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.status === 'SUCCESS' ? 'bg-[rgba(0,176,116,0.1)] text-[#00B074]' : 'bg-[rgba(255,77,77,0.1)] text-[#FF4D4D]'
                        }`}>
                          {log.status === 'SUCCESS' ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <TimelineTab timeline={timeline} hours={hours} />
      )}

      {/* --- Bottom Navigation Area --- */}
      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--app-border)' }}>
        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
          {runStatus === 'COMPLETED' ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-[#00B074]" />
              <span className="text-[#00B074] font-semibold">Orchestration finished. Proceed to final verification.</span>
            </>
          ) : runStatus === 'FAILED' ? (
            <>
              <AlertTriangle className="w-4 h-4 text-[#FF4D4D]" />
              <span className="text-[#FF4D4D] font-semibold">Migration failed. Review app-logs and trigger compensating rollbacks.</span>
            </>
          ) : (
            <>
              <Activity className="w-4 h-4 animate-pulse text-[#006CFF]" />
              <span>Stateful failover sequence actively managed by Saga engine.</span>
            </>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={runStatus !== 'COMPLETED'}
          onClick={handleContinue}
          iconRight={<ArrowRight className="w-4 h-4" />}
        >
          Continue to Validate
        </Button>
      </div>
    </div>
  );
}
