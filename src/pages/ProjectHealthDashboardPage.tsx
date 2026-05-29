import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, RefreshCw, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, CircleAlert as AlertCircle, Clock, Shield, Zap, TrendingUp, ChartBar as BarChart3, ChevronRight, ExternalLink, Plug, Timer, Wifi, ChartBar as BarChart2 } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { projectDashboardApi } from '@/lib/api';
import {
  ProjectDashboardSummary, ProjectDashboardTrends, ProjectDashboardMetrics,
  ProjectDashboardConnectorSummary,
} from '@/types';
import { MetricCard } from '@/components/ui/MetricCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChartSkeleton, StatsSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { ScoreTrendChart } from '@/components/charts/ScoreTrendChart';
import { AvailabilityChart } from '@/components/charts/AvailabilityChart';
import { ResponseTimeChart } from '@/components/charts/ResponseTimeChart';
import { ConnectorTrendChart } from '@/components/charts/ConnectorTrendChart';
import { ScoreDistributionChart } from '@/components/charts/ScoreDistributionChart';
import { ConnectorDrilldownPanel } from '@/components/dashboard/ConnectorDrilldownPanel';
import { formatMs, formatRelativeTime, getStatusColor, cn } from '@/lib/utils';

const TIME_RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function HealthScoreRing({ score, size = 96 }: { score?: number; size?: number }) {
  const s = score ?? 0;
  const color = s >= 90 ? '#30D158' : s >= 60 ? '#FF9F0A' : '#FF453A';
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const fill = (s / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--app-border)" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{s.toFixed(0)}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>Score</span>
      </div>
    </div>
  );
}

function ConnectorCard({
  connector,
  onClick,
}: {
  connector: ProjectDashboardConnectorSummary;
  onClick: () => void;
}) {
  const statusColor = getStatusColor(connector.health_status || 'unknown');
  const accentColor = connector.color || statusColor;

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg overflow-hidden"
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl transition-all duration-200" style={{ background: accentColor }} />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accentColor + '18' }}>
          <Plug className="w-4 h-4" style={{ color: accentColor }} />
        </div>
        <div className="flex items-center gap-1.5">
          {!connector.is_enabled && (
            <Badge variant="inactive" size="xs">Off</Badge>
          )}
          <StatusBadge status={connector.health_status || 'unknown'} size="xs" />
        </div>
      </div>

      <h3 className="text-sm font-semibold leading-snug truncate mb-1" style={{ color: 'var(--text-primary)' }}>
        {connector.name}
      </h3>

      {connector.category && (
        <p className="text-[10px] font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          {connector.category}
        </p>
      )}

      <div className="space-y-1.5">
        {connector.uptime_percentage != null && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Uptime</span>
            <span className="font-semibold tabular-nums" style={{
              color: connector.uptime_percentage >= 90 ? '#30D158' : connector.uptime_percentage >= 70 ? '#FF9F0A' : '#FF453A',
            }}>{connector.uptime_percentage}%</span>
          </div>
        )}
        {connector.last_sync_response_ms != null && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Response</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatMs(connector.last_sync_response_ms)}</span>
          </div>
        )}
        {connector.consecutive_failures > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <AlertCircle className="w-3 h-3" style={{ color: '#FF453A' }} />
            <span className="text-[10px]" style={{ color: '#FF453A' }}>{connector.consecutive_failures} consecutive failures</span>
          </div>
        )}
      </div>

      {connector.last_sync_at && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Synced {formatRelativeTime(connector.last_sync_at)}
        </p>
      )}

      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      </div>
    </div>
  );
}

function TimeRangeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--app-bg-muted)' }}>
      {TIME_RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150',
            value === r.value
              ? 'text-white shadow-sm'
              : 'hover:opacity-75'
          )}
          style={value === r.value
            ? { background: 'var(--accent)', color: '#fff' }
            : { color: 'var(--text-muted)' }
          }
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function AlertBanner({ message, type = 'warning' }: { message: string; type?: 'warning' | 'error' | 'info' }) {
  const colors = {
    warning: { bg: 'rgba(255,159,10,0.08)', border: 'rgba(255,159,10,0.2)', text: '#FF9F0A' },
    error: { bg: 'rgba(255,69,58,0.08)', border: 'rgba(255,69,58,0.2)', text: '#FF453A' },
    info: { bg: 'rgba(10,132,255,0.08)', border: 'rgba(10,132,255,0.2)', text: '#0A84FF' },
  };
  const c = colors[type];
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: c.text }} />
      <p className="text-sm font-medium" style={{ color: c.text }}>{message}</p>
    </div>
  );
}

export function ProjectHealthDashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();

  const [timeRange, setTimeRange] = useState('24h');
  const [summary, setSummary] = useState<ProjectDashboardSummary | null>(null);
  const [trends, setTrends] = useState<ProjectDashboardTrends | null>(null);
  const [metrics, setMetrics] = useState<ProjectDashboardMetrics | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [selectedConnector, setSelectedConnector] = useState<ProjectDashboardConnectorSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const projectName = summary?.project_name || 'Project';

  useEffect(() => {
    setPageTitle('Health Dashboard');
    setBreadcrumbs([
      { label: 'Projects', href: '/projects' },
      { label: projectName, href: projectId ? `/projects/${projectId}` : undefined },
      { label: 'Health Dashboard' },
    ]);
  }, [projectName, projectId]);

  const loadSummary = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await projectDashboardApi.summary(projectId);
      setSummary(res.data);
    } finally {
      setLoadingSummary(false);
    }
  }, [projectId]);

  const loadTrends = useCallback(async () => {
    if (!projectId) return;
    setLoadingTrends(true);
    try {
      const res = await projectDashboardApi.trends(projectId, { time_range: timeRange });
      setTrends(res.data);
    } finally {
      setLoadingTrends(false);
    }
  }, [projectId, timeRange]);

  const loadMetrics = useCallback(async () => {
    if (!projectId) return;
    setLoadingMetrics(true);
    try {
      const res = await projectDashboardApi.metrics(projectId, { time_range: timeRange });
      setMetrics(res.data);
    } finally {
      setLoadingMetrics(false);
    }
  }, [projectId, timeRange]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadTrends(); loadMetrics(); }, [loadTrends, loadMetrics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadTrends(), loadMetrics()]);
    setRefreshing(false);
  };

  const overallStatus = summary?.overall_health_status;
  const statusAlerts = useMemo(() => {
    if (!summary) return [];
    const alerts: Array<{ message: string; type: 'warning' | 'error' | 'info' }> = [];
    if (summary.down_connectors > 0) {
      alerts.push({ message: `${summary.down_connectors} connector${summary.down_connectors > 1 ? 's' : ''} are currently down`, type: 'error' });
    }
    if (summary.degraded_connectors > 0) {
      alerts.push({ message: `${summary.degraded_connectors} connector${summary.degraded_connectors > 1 ? 's' : ''} are degraded`, type: 'warning' });
    }
    if (summary.availability_percentage < 90) {
      alerts.push({ message: `Availability is below threshold at ${summary.availability_percentage}%`, type: 'warning' });
    }
    return alerts;
  }, [summary]);

  const connectors = summary?.connectors ?? [];
  const sortedConnectors = useMemo(() =>
    [...connectors].sort((a, b) => {
      const order: Record<string, number> = { down: 0, error: 1, timeout: 2, degraded: 3, unknown: 4, healthy: 5 };
      return (order[a.health_status] ?? 6) - (order[b.health_status] ?? 6);
    }),
    [connectors]
  );

  const connectorTrendData = trends?.connector_trends ?? {};
  const hasConnectorTrends = Object.keys(connectorTrendData).length > 0;
  const hasTrends = (trends?.overall_trend?.length ?? 0) > 0;
  const hasMetrics = (metrics?.connector_response_times?.length ?? 0) > 0;

  return (
    <div className="space-y-6 animate-page-enter">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')}
          className="p-2 rounded-xl border transition-all hover:bg-neutral-50"
          style={{ borderColor: 'var(--app-border)', color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {loadingSummary ? (
            <Skeleton height={22} width={200} />
          ) : (
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {projectName}
              </h1>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>/ Health Dashboard</span>
              {overallStatus && <StatusBadge status={overallStatus} size="xs" />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <button
            onClick={() => navigate(`/projects/${projectId}/analytics`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all"
            style={{ borderColor: 'var(--app-border)', color: 'var(--text-secondary)', background: 'var(--app-bg-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            title="View analytics"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Analytics
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl border transition-all hover:bg-neutral-50"
            style={{ borderColor: 'var(--app-border)', color: 'var(--text-muted)' }}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {statusAlerts.map((alert, i) => (
        <AlertBanner key={i} message={alert.message} type={alert.type} />
      ))}

      {loadingSummary ? (
        <StatsSkeleton />
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div className="col-span-2 lg:col-span-1">
            <div className="glass-card p-5 rounded-2xl flex flex-col items-center gap-3 h-full justify-center">
              <HealthScoreRing score={summary.overall_score} size={100} />
              {summary.last_run_at && (
                <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                  Last run {formatRelativeTime(summary.last_run_at)}
                </p>
              )}
            </div>
          </div>
          <MetricCard
            title="Availability"
            value={summary.availability_percentage + '%'}
            subtitle="Across all connectors"
            icon={Wifi}
            accent="#0A84FF"
            iconColor="#0A84FF"
          />
          <MetricCard
            title="SLA"
            value={summary.sla_percentage + '%'}
            subtitle="Service level agreement"
            icon={Shield}
            accent="#30D158"
            iconColor="#30D158"
          />
          <MetricCard
            title="Incidents"
            value={summary.incident_count}
            subtitle="Total connector failures"
            icon={AlertCircle}
            accent={summary.incident_count > 0 ? '#FF453A' : '#30D158'}
            iconColor={summary.incident_count > 0 ? '#FF453A' : '#30D158'}
          />
          <MetricCard
            title="Connectors"
            value={`${summary.healthy_connectors}/${summary.total_connectors}`}
            subtitle={`${summary.enabled_connectors} enabled`}
            icon={Plug}
            accent="#FF9F0A"
            iconColor="#FF9F0A"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Healthy', value: summary?.healthy_connectors ?? 0, color: '#30D158', bg: 'rgba(48,209,88,0.08)', border: 'rgba(48,209,88,0.15)' },
          { label: 'Degraded', value: summary?.degraded_connectors ?? 0, color: '#FF9F0A', bg: 'rgba(255,159,10,0.08)', border: 'rgba(255,159,10,0.15)' },
          { label: 'Down', value: summary?.down_connectors ?? 0, color: '#FF453A', bg: 'rgba(255,69,58,0.08)', border: 'rgba(255,69,58,0.15)' },
          { label: 'Unknown', value: summary?.unknown_connectors ?? 0, color: '#8E8E93', bg: 'rgba(142,142,147,0.08)', border: 'rgba(142,142,147,0.15)' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl px-4 py-3.5" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: item.color }}>{item.label}</p>
            <p className="text-[26px] font-bold tracking-tight tabular-nums leading-none" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="md">
          <CardHeader title="Health Score Trend" subtitle={`Last ${timeRange}`} />
          {loadingTrends ? (
            <ChartSkeleton height={200} />
          ) : hasTrends ? (
            <ScoreTrendChart data={trends!.overall_trend} height={200} />
          ) : (
            <EmptyChartState message="No runs in this time range" />
          )}
        </Card>

        <Card padding="md">
          <CardHeader title="Availability Trend" subtitle={`Last ${timeRange}`} />
          {loadingTrends ? (
            <ChartSkeleton height={140} />
          ) : hasTrends ? (
            <AvailabilityChart data={trends!.availability_trend} height={160} />
          ) : (
            <EmptyChartState message="No runs in this time range" />
          )}
        </Card>
      </div>

      {hasConnectorTrends && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card padding="md">
            <CardHeader title="Connector Response Times" subtitle={`Last ${timeRange} — comparison`} />
            {loadingTrends ? (
              <ChartSkeleton height={220} />
            ) : (
              <ConnectorTrendChart data={connectorTrendData} height={220} metric="response_time_ms" />
            )}
          </Card>
          <Card padding="md">
            <CardHeader title="Connector Health Scores" subtitle={`Last ${timeRange} — comparison`} />
            {loadingTrends ? (
              <ChartSkeleton height={220} />
            ) : (
              <ConnectorTrendChart data={connectorTrendData} height={220} metric="score" />
            )}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {hasMetrics && (
          <Card padding="md">
            <CardHeader title="Response Times" subtitle="Avg per connector" />
            {loadingMetrics ? (
              <ChartSkeleton height={200} />
            ) : (
              <ResponseTimeChart data={metrics!.connector_response_times} height={Math.max(160, metrics!.connector_response_times.length * 36)} />
            )}
          </Card>
        )}

        {metrics && metrics.score_distribution && (
          <Card padding="md">
            <CardHeader title="Run Quality" subtitle={`${metrics.total_runs} runs scored`} />
            {loadingMetrics ? (
              <ChartSkeleton height={160} />
            ) : (
              <ScoreDistributionChart distribution={metrics.score_distribution} height={160} />
            )}
          </Card>
        )}

        {summary && (
          <Card padding="md">
            <CardHeader title="Summary Stats" />
            <div className="space-y-3">
              <SummaryRow icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#30D158' }} />} label="Last Run Status" value={summary.last_run_status || '—'} />
              <SummaryRow icon={<Clock className="w-4 h-4" style={{ color: '#0A84FF' }} />} label="Last Run" value={summary.last_run_at ? formatRelativeTime(summary.last_run_at) : 'Never'} />
              <SummaryRow icon={<Plug className="w-4 h-4" style={{ color: '#FF9F0A' }} />} label="Enabled Connectors" value={`${summary.enabled_connectors} / ${summary.total_connectors}`} />
              <SummaryRow icon={<Activity className="w-4 h-4" style={{ color: '#0A84FF' }} />} label="Overall Score" value={summary.overall_score != null ? summary.overall_score.toFixed(1) + '%' : 'N/A'} />
              <SummaryRow icon={<Shield className="w-4 h-4" style={{ color: '#30D158' }} />} label="Availability" value={summary.availability_percentage + '%'} />
              <SummaryRow icon={<Timer className="w-4 h-4" style={{ color: '#FF9F0A' }} />} label="SLA Compliance" value={summary.sla_percentage + '%'} />
            </div>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Connector Health</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {sortedConnectors.length} connector{sortedConnectors.length !== 1 ? 's' : ''} — click for details
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')}
            icon={<ExternalLink className="w-3.5 h-3.5" />}
          >
            Manage
          </Button>
        </div>

        {loadingSummary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={160} rounded="rounded-2xl" />)}
          </div>
        ) : sortedConnectors.length === 0 ? (
          <Card padding="lg">
            <div className="flex flex-col items-center py-8 gap-3">
              <Plug className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No connectors configured</p>
              <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                Add connectors to this project to start monitoring health.
              </p>
              <Button variant="primary" size="sm" onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')}>
                Configure Connectors
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedConnectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                onClick={() => setSelectedConnector(connector)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedConnector && projectId && (
        <ConnectorDrilldownPanel
          projectId={projectId}
          connector={selectedConnector}
          timeRange={timeRange}
          onClose={() => setSelectedConnector(null)}
        />
      )}
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <BarChart3 className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Run a health check to populate this chart</p>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--app-border)' }}>
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
