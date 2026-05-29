import React, { useEffect, useState } from 'react';
import { X, Activity, Clock, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, TrendingUp, TrendingDown, Wifi, WifiOff, Timer, ChartBar as BarChart3, RefreshCw } from 'lucide-react';
import { projectDashboardApi } from '@/lib/api';
import { ConnectorDrilldown, ProjectDashboardConnectorSummary } from '@/types';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScoreTrendChart } from '@/components/charts/ScoreTrendChart';
import { formatMs, cn } from '@/lib/utils';

interface ConnectorDrilldownPanelProps {
  projectId: string;
  connector: ProjectDashboardConnectorSummary;
  timeRange: string;
  onClose: () => void;
}

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-3 rounded-xl" style={{ background: 'var(--app-bg-muted)' }}>
      <span className="text-[18px] font-bold tabular-nums leading-none mb-0.5" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function OutcomeDot({ outcome }: { outcome?: string }) {
  const map: Record<string, string> = {
    success: '#30D158',
    failure: '#FF453A',
    timeout: '#FF9F0A',
    error: '#FF453A',
    auth_error: '#FF453A',
    config_error: '#FF9F0A',
    skipped: '#8E8E93',
  };
  const color = outcome ? (map[outcome] || '#8E8E93') : '#8E8E93';
  return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />;
}

export function ConnectorDrilldownPanel({ projectId, connector, timeRange, onClose }: ConnectorDrilldownPanelProps) {
  const [data, setData] = useState<ConnectorDrilldown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await projectDashboardApi.connectorDrilldown(projectId, connector.id, { time_range: timeRange });
        setData(res.data);
      } catch {
        setError('Failed to load connector details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, connector.id, timeRange]);

  const healthColor = (s: string) => {
    const map: Record<string, string> = { healthy: '#30D158', degraded: '#FF9F0A', down: '#FF453A', error: '#FF453A', timeout: '#FF9F0A', unknown: '#8E8E93' };
    return map[s] || '#8E8E93';
  };

  const statusColor = connector.health_status ? healthColor(connector.health_status) : '#8E8E93';

  const scoreTrend = data?.run_history
    .filter((r) => r.health_score != null)
    .map((r) => ({
      timestamp: r.started_at || '',
      score: r.health_score,
    })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full overflow-y-auto animate-slide-up"
        style={{ background: 'var(--app-bg)', borderLeft: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-6 py-4 flex items-start gap-3" style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: (connector.color || statusColor) + '20' }}>
            <Activity className="w-5 h-5" style={{ color: connector.color || statusColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>{connector.name}</h2>
              <StatusBadge status={connector.health_status || 'unknown'} size="xs" />
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {connector.slug && <span className="font-mono">{connector.slug}</span>}
              {connector.category && <span> · {connector.category}</span>}
              {connector.is_enabled ? null : <span className="text-warning ml-1">· Disabled</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-all hover:bg-neutral-100"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={72} rounded="rounded-xl" />)}
              </div>
              <Skeleton height={180} rounded="rounded-xl" />
              <Skeleton height={120} rounded="rounded-xl" />
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF453A' }} />
              <p className="text-sm" style={{ color: '#FF453A' }}>{error}</p>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatPill
                  label="Uptime"
                  value={data.uptime_percentage != null ? data.uptime_percentage + '%' : 'N/A'}
                  color={data.uptime_percentage != null ? (data.uptime_percentage >= 90 ? '#30D158' : data.uptime_percentage >= 70 ? '#FF9F0A' : '#FF453A') : undefined}
                />
                <StatPill label="Runs" value={data.total_executions} />
                <StatPill label="Failures" value={data.total_failures} color={data.total_failures > 0 ? '#FF453A' : undefined} />
                <StatPill
                  label="Avg Response"
                  value={data.run_history.length > 0
                    ? formatMs(Math.round(data.run_history.filter(r => r.response_time_ms != null).reduce((s, r) => s + (r.response_time_ms || 0), 0) / Math.max(1, data.run_history.filter(r => r.response_time_ms != null).length)))
                    : 'N/A'}
                />
              </div>

              {data.consecutive_failures > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,69,58,0.07)', border: '1px solid rgba(255,69,58,0.15)' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF453A' }} />
                  <p className="text-sm font-medium" style={{ color: '#FF453A' }}>
                    {data.consecutive_failures} consecutive failure{data.consecutive_failures > 1 ? 's' : ''}
                  </p>
                  {data.last_error && (
                    <p className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>{data.last_error}</p>
                  )}
                </div>
              )}

              {scoreTrend.length > 1 && (
                <Card padding="md">
                  <CardHeader title="Health Score Trend" subtitle={`Last ${data.hours}h`} />
                  <ScoreTrendChart data={scoreTrend} height={160} />
                </Card>
              )}

              <Card padding="md">
                <CardHeader title="Run History" subtitle={`${data.run_history.length} runs in range`} />
                {data.run_history.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <Activity className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No runs in this time range</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {[...data.run_history].reverse().map((run, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl group hover:bg-opacity-50 transition-all"
                        style={{ background: 'var(--app-bg-muted)' }}>
                        <OutcomeDot outcome={run.outcome} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={run.health_status || 'unknown'} size="xs" />
                            {run.health_score != null && (
                              <span className="text-xs font-bold tabular-nums" style={{ color: run.health_score >= 90 ? '#30D158' : run.health_score >= 60 ? '#FF9F0A' : '#FF453A' }}>
                                {run.health_score.toFixed(0)}%
                              </span>
                            )}
                          </div>
                          {run.error_message && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: '#FF453A' }}>{run.error_message}</p>
                          )}
                          {run.message && !run.error_message && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{run.message}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 space-y-0.5">
                          {run.response_time_ms != null && (
                            <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{run.response_time_ms}ms</p>
                          )}
                          {run.started_at && (
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {new Date(run.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {Object.keys(data.metrics_by_name).length > 0 && (
                <Card padding="md">
                  <CardHeader title="Metrics" subtitle="Latest captured values" />
                  <div className="space-y-3">
                    {Object.entries(data.metrics_by_name).slice(0, 8).map(([name, pts]) => {
                      const latest = pts[pts.length - 1];
                      return (
                        <div key={name} className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                          style={{ borderColor: 'var(--app-border)' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                            <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                              {latest ? latest.value.toFixed(2) : '–'}
                            </span>
                            {latest?.unit && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{latest.unit}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {data.recent_errors.length > 0 && (
                <Card padding="md">
                  <CardHeader title="Recent Errors" subtitle={`${data.recent_errors.length} recorded`} />
                  <div className="space-y-2">
                    {data.recent_errors.slice(-5).reverse().map((e, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl"
                        style={{ background: 'rgba(255,69,58,0.05)', border: '1px solid rgba(255,69,58,0.12)' }}>
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#FF453A' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs" style={{ color: '#FF453A' }}>{e.error || 'Unknown error'}</p>
                          {e.timestamp && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {new Date(e.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
