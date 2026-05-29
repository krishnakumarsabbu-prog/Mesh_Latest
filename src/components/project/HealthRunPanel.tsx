import React, { useState, useEffect, useCallback } from 'react';
import { Play, Clock, CircleCheck as CheckCircle2, Circle as XCircle, TriangleAlert as AlertTriangle, Activity, RefreshCw, ChevronDown, ChevronUp, Info, Zap, History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { healthRunApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import { HealthRunDetail, HealthRunSummary, RunHealthStatus, HealthRunConnectorResult } from '@/types';
import { cn } from '@/lib/utils';

interface HealthRunPanelProps {
  projectId: string;
  canManage: boolean;
  onRunComplete?: (run: HealthRunDetail) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  healthy: { label: 'Healthy', color: '#30D158', bg: 'rgba(48,209,88,0.1)', icon: <CheckCircle2 className="w-4 h-4" /> },
  degraded: { label: 'Degraded', color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)', icon: <AlertTriangle className="w-4 h-4" /> },
  down: { label: 'Down', color: '#FF453A', bg: 'rgba(255,69,58,0.1)', icon: <XCircle className="w-4 h-4" /> },
  timeout: { label: 'Timeout', color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)', icon: <Clock className="w-4 h-4" /> },
  error: { label: 'Error', color: '#FF453A', bg: 'rgba(255,69,58,0.1)', icon: <XCircle className="w-4 h-4" /> },
  unknown: { label: 'Unknown', color: '#8E8E93', bg: 'rgba(142,142,147,0.1)', icon: <Info className="w-4 h-4" /> },
  skipped: { label: 'Skipped', color: '#8E8E93', bg: 'rgba(142,142,147,0.1)', icon: <Info className="w-4 h-4" /> },
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  success: { label: 'Success', color: '#30D158' },
  failure: { label: 'Failure', color: '#FF453A' },
  timeout: { label: 'Timeout', color: '#FF9F0A' },
  skipped: { label: 'Skipped', color: '#8E8E93' },
  error: { label: 'Error', color: '#FF453A' },
  auth_error: { label: 'Auth Error', color: '#FF453A' },
  config_error: { label: 'Config Error', color: '#FF9F0A' },
};

function ScoreBadge({ score, status }: { score: number; status?: string }) {
  const cfg = status ? STATUS_CONFIG[status] : STATUS_CONFIG['unknown'];
  const color = cfg?.color || '#8E8E93';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r="26" fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={`${(score / 100) * 163.4} 163.4`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{Math.round(score)}</span>
        </div>
      </div>
      <span className="text-xs mt-1 font-medium" style={{ color }}>{cfg?.label || 'Unknown'}</span>
    </div>
  );
}

interface ConnectorEntry {
  id?: string;
  project_connector_id: string;
  connector_name: string;
  health_status: string;
  outcome: string;
  response_time_ms?: number;
  duration_ms?: number;
  message?: string;
  error_message?: string;
  error?: string;
  is_enabled?: boolean;
  priority?: number;
}

function ConnectorResultRow({ result, index }: { result: ConnectorEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const healthStatus = result.health_status;
  const outcome = result.outcome;
  const errorMsg = result.error_message ?? result.error;
  const message = result.message;
  const responseMs = result.response_time_ms;
  const durationMs = result.duration_ms;

  const statusCfg = STATUS_CONFIG[healthStatus] || STATUS_CONFIG['unknown'];
  const outcomeCfg = OUTCOME_CONFIG[outcome] || { label: outcome, color: '#8E8E93' };
  const hasDetails = !!(errorMsg || message);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--app-surface-raised)',
        border: '1px solid var(--app-border)',
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          hasDetails && 'cursor-pointer hover:bg-white/[0.02] transition-colors'
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          {statusCfg.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {result.connector_name}
          </p>
          {message && !expanded && (
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{message}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: outcomeCfg.color, background: `${outcomeCfg.color}15` }}>
            {outcomeCfg.label}
          </span>

          {responseMs != null && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {responseMs}ms
            </span>
          )}

          {durationMs != null && durationMs !== responseMs && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ~{durationMs}ms
            </span>
          )}

          {hasDetails && (
            <span style={{ color: 'var(--text-muted)' }}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="px-4 pb-3 space-y-2" style={{ borderTop: '1px solid var(--app-border)' }}>
          {message && (
            <div className="pt-3">
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Message</p>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{message}</p>
            </div>
          )}
          {errorMsg && (
            <div className={message ? '' : 'pt-3'}>
              <p className="text-xs font-medium mb-1" style={{ color: '#FF453A' }}>Error</p>
              <p className="text-xs font-mono break-all" style={{ color: '#FF453A' }}>{errorMsg}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryRunRow({ run, onView }: { run: HealthRunSummary; onView: (run: HealthRunSummary) => void }) {
  const statusCfg = STATUS_CONFIG[run.overall_health_status || 'unknown'];

  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--app-border-strong)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--app-border)')}
      onClick={() => onView(run)}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: statusCfg?.bg || 'rgba(142,142,147,0.1)', color: statusCfg?.color || '#8E8E93' }}
      >
        {statusCfg?.icon || <Info className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold" style={{ color: statusCfg?.color || '#8E8E93' }}>
            {run.overall_score != null ? `${Math.round(run.overall_score)}/100` : 'N/A'}
          </p>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {run.success_count}✓ {run.failure_count > 0 ? `${run.failure_count}✗` : ''}
          </p>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {new Date(run.started_at).toLocaleString()}
          {run.total_duration_ms != null && ` · ${run.total_duration_ms}ms`}
        </p>
      </div>

      <span
        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style={{
          background: run.status === 'completed' ? 'rgba(48,209,88,0.1)' : run.status === 'failed' ? 'rgba(255,69,58,0.1)' : 'rgba(255,159,10,0.1)',
          color: run.status === 'completed' ? '#30D158' : run.status === 'failed' ? '#FF453A' : '#FF9F0A',
        }}
      >
        {run.status}
      </span>
    </button>
  );
}

export function HealthRunPanel({ projectId, canManage, onRunComplete }: HealthRunPanelProps) {
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<HealthRunDetail | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HealthRunSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRun, setSelectedRun] = useState<HealthRunDetail | null>(null);
  const [expandedConnectors, setExpandedConnectors] = useState(false);

  const fetchLatest = useCallback(async () => {
    setLoadingLatest(true);
    try {
      const res = await healthRunApi.latest(projectId);
      setLatestRun(res.data);
    } catch {
      setLatestRun(null);
    } finally {
      setLoadingLatest(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const handleRunHealth = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await healthRunApi.run(projectId);
      const runData = res.data as HealthRunDetail;
      setLatestRun(runData);
      onRunComplete?.(runData);

      const score = runData.overall_score ?? 0;
      const status = runData.overall_health_status || 'unknown';
      if (status === 'healthy') {
        notify.success('Health run complete', `Score: ${Math.round(score)}/100 — All systems healthy`);
      } else if (status === 'degraded') {
        notify.warning('Health run complete', `Score: ${Math.round(score)}/100 — Some degradation detected`);
      } else {
        notify.error('Health run complete', `Score: ${Math.round(score)}/100 — Issues detected`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notify.error('Health run failed', msg || 'Failed to execute health run');
    } finally {
      setRunning(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await healthRunApi.history(projectId, { limit: 20 });
      setHistory(res.data.runs || []);
    } catch {
      notify.error('Failed to load run history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setHistoryOpen(true);
    fetchHistory();
  };

  const handleViewRun = async (run: HealthRunSummary) => {
    try {
      const res = await healthRunApi.getRun(run.run_id);
      setSelectedRun(res.data);
    } catch {
      notify.error('Failed to load run details');
    }
  };

  const connectors = latestRun?.connector_results?.length
    ? latestRun.connector_results
    : latestRun?.connectors || [];

  const displayConnectors = expandedConnectors ? connectors : connectors.slice(0, 4);

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(0,229,153,0.1)' }}
            >
              <Activity className="w-4 h-4" style={{ color: '#00E599' }} />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Health Execution</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Run all connectors in parallel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenHistory}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-muted)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = '';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              }}
              title="View run history"
            >
              <History className="w-4 h-4" />
            </button>

            {canManage && (
              <Button
                size="sm"
                onClick={handleRunHealth}
                loading={running}
                icon={running ? undefined : <Zap className="w-3.5 h-3.5" />}
              >
                {running ? 'Running...' : 'Run Health'}
              </Button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          {running && (
            <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(0,229,153,0.06)', border: '1px solid rgba(0,229,153,0.2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#00E599] animate-pulse" />
                <span className="text-xs font-semibold" style={{ color: '#00E599' }}>Executing health run...</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,229,153,0.1)' }}>
                <div
                  className="h-full rounded-full animate-pulse"
                  style={{
                    background: 'linear-gradient(90deg, #00E599, #00C97F)',
                    width: '60%',
                    animation: 'progress-indeterminate 1.5s ease-in-out infinite',
                  }}
                />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Running all connectors in parallel...
              </p>
            </div>
          )}

          {loadingLatest && !running && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--app-bg-muted)' }} />
              ))}
            </div>
          )}

          {!loadingLatest && (!latestRun || (latestRun as unknown as { status?: string }).status === 'no_runs') && !running && (
            <div className="text-center py-6">
              <Activity className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No health runs yet</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {canManage ? 'Click "Run Health" to execute a health check' : 'No health runs have been executed'}
              </p>
            </div>
          )}

          {!loadingLatest && latestRun && (latestRun as unknown as { status?: string }).status !== 'no_runs' && !running && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <ScoreBadge
                  score={latestRun.overall_score ?? 0}
                  status={latestRun.overall_health_status}
                />

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-xl text-center" style={{ background: 'rgba(48,209,88,0.07)', border: '1px solid rgba(48,209,88,0.1)' }}>
                      <p className="text-base font-bold" style={{ color: '#30D158' }}>{latestRun.success_count}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Passed</p>
                    </div>
                    <div className="p-2 rounded-xl text-center" style={{ background: 'rgba(255,69,58,0.07)', border: '1px solid rgba(255,69,58,0.1)' }}>
                      <p className="text-base font-bold" style={{ color: '#FF453A' }}>{latestRun.failure_count}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Failed</p>
                    </div>
                    <div className="p-2 rounded-xl text-center" style={{ background: 'rgba(142,142,147,0.07)', border: '1px solid rgba(142,142,147,0.1)' }}>
                      <p className="text-base font-bold" style={{ color: 'var(--text-secondary)' }}>{latestRun.skipped_count}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skipped</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {latestRun.total_duration_ms != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {latestRun.total_duration_ms}ms
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {new Date(latestRun.started_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>

              {latestRun.contributing_factors?.length > 0 && (
                <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}>
                  {latestRun.contributing_factors.slice(0, 3).map((factor, i) => (
                    <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {factor}
                    </p>
                  ))}
                </div>
              )}

              {connectors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Connector Results
                  </p>
                  {displayConnectors.map((r, i) => (
                    <ConnectorResultRow key={'id' in r ? (r as ConnectorEntry).id ?? r.project_connector_id : r.project_connector_id} result={r as ConnectorEntry} index={i} />
                  ))}
                  {connectors.length > 4 && (
                    <button
                      className="w-full text-xs py-2 rounded-xl transition-all"
                      style={{ color: 'var(--text-muted)', background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
                      onClick={() => setExpandedConnectors(!expandedConnectors)}
                    >
                      {expandedConnectors ? 'Show less' : `Show ${connectors.length - 4} more`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={historyOpen}
        onClose={() => { setHistoryOpen(false); setSelectedRun(null); }}
        title={selectedRun ? 'Run Details' : 'Health Run History'}
        subtitle={selectedRun ? selectedRun.execution_id : `Past health runs for this project`}
        size="lg"
        footer={
          selectedRun ? (
            <Button variant="secondary" size="sm" onClick={() => setSelectedRun(null)}>
              Back to History
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          )
        }
      >
        {selectedRun ? (
          <RunDetailView run={selectedRun} />
        ) : (
          <div className="space-y-2">
            {loadingHistory && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--app-bg-muted)' }} />
                ))}
              </div>
            )}
            {!loadingHistory && history.length === 0 && (
              <div className="text-center py-8">
                <History className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No run history</p>
              </div>
            )}
            {!loadingHistory && history.map(run => (
              <HistoryRunRow key={run.run_id} run={run} onView={handleViewRun} />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function RunDetailView({ run }: { run: HealthRunDetail }) {
  const statusCfg = STATUS_CONFIG[run.overall_health_status || 'unknown'];
  const connectors = run.connector_results?.length ? run.connector_results : (run.connectors || []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}>
        <ScoreBadge score={run.overall_score ?? 0} status={run.overall_health_status} />
        <div className="flex-1 space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: '#30D158' }}>{run.success_count}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Passed</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: '#FF453A' }}>{run.failure_count}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Failed</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>{run.skipped_count}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skipped</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {run.total_duration_ms != null && <span><Clock className="w-3 h-3 inline mr-1" />{run.total_duration_ms}ms</span>}
            <span>{new Date(run.started_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {run.contributing_factors?.length > 0 && (
        <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Analysis
          </p>
          {run.contributing_factors.map((f, i) => (
            <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>• {f}</p>
          ))}
        </div>
      )}

      {connectors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Connector Results ({connectors.length})
          </p>
          {connectors.map((r, i) => (
            <ConnectorResultRow key={(r as ConnectorEntry).id ?? r.project_connector_id} result={r as ConnectorEntry} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
