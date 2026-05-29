import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Activity, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Circle as XCircle, RefreshCw, Server, Database, Cpu, HardDrive, Zap, ChartBar as BarChart2, TrendingUp, Clock, Shield, ArrowLeft, ChevronDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar, PolarAngleAxis
} from 'recharts';
import { applicationRuntimeApi, connectorAgentApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/store/notificationStore';
import { cn } from '@/lib/utils';

interface RuntimeMetric {
  id: string;
  application_name: string;
  environment: string;
  service_name: string;
  namespace: string;
  metric_category: string;
  metric_key: string;
  metric_name: string;
  metric_scope: string;
  metric_value: number;
  metric_unit: string;
  severity: string;
  health_score: number | null;
  collected_at: string;
}

interface HealthSnapshot {
  application_name: string;
  environment: string;
  overall_health_score: number;
  runtime_health_score: number;
  infrastructure_health_score: number;
  api_health_score: number;
  database_health_score: number;
  mq_health_score: number;
  active_alerts: number;
  critical_alerts: number;
  total_requests: number | null;
  failed_requests: number | null;
  avg_response_time: number | null;
  p95_response_time: number | null;
  p99_response_time: number | null;
  snapshot_timestamp: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  healthy: '#30D158',
  warning: '#FF9F0A',
  critical: '#FF453A',
};

const SCORE_COLOR = (score: number) => {
  if (score >= 90) return '#30D158';
  if (score >= 70) return '#FF9F0A';
  if (score >= 40) return '#FF6B35';
  return '#FF453A';
};

const SCORE_LABEL = (score: number) => {
  if (score >= 90) return 'Healthy';
  if (score >= 70) return 'Degraded';
  if (score >= 40) return 'Critical';
  return 'Down';
};

const SCOPE_ICON: Record<string, React.ReactNode> = {
  api: <Zap className="w-4 h-4" />,
  jvm: <Cpu className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  mq: <Activity className="w-4 h-4" />,
  kubernetes: <Server className="w-4 h-4" />,
  application: <Shield className="w-4 h-4" />,
};

const SCOPE_LABEL: Record<string, string> = {
  api: 'API',
  jvm: 'JVM',
  database: 'Database',
  mq: 'Messaging',
  kubernetes: 'Kubernetes',
  application: 'Application',
};

function HealthGauge({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const color = SCORE_COLOR(score);
  const data = [{ value: score, fill: color }];
  return (
    <div className="flex flex-col items-center gap-1">
      <RadialBarChart
        width={size}
        height={size}
        cx={size / 2}
        cy={size / 2}
        innerRadius={size * 0.35}
        outerRadius={size * 0.48}
        barSize={size * 0.1}
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar dataKey="value" cornerRadius={size * 0.05} background={{ fill: 'rgba(255,255,255,0.06)' }} />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: size * 0.22, fontWeight: 700, fill: color }}
        >
          {Math.round(score)}
        </text>
      </RadialBarChart>
      <span className="text-xs text-white/60 font-medium">{label}</span>
    </div>
  );
}

function MetricRow({ m }: { m: RuntimeMetric }) {
  const sevColor = SEVERITY_COLORS[m.severity] || '#8E8E93';
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sevColor }} />
        <div className="min-w-0">
          <p className="text-sm text-white/80 font-medium truncate">{m.metric_key.replace(/_/g, ' ')}</p>
          <p className="text-xs text-white/40 truncate">{m.metric_scope} · {m.metric_category}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-sm font-mono font-semibold text-white">
          {typeof m.metric_value === 'number' ? m.metric_value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
          <span className="text-white/40 text-xs ml-1">{m.metric_unit}</span>
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-medium capitalize"
          style={{ color: sevColor, background: `${sevColor}18` }}
        >
          {m.severity}
        </span>
      </div>
    </div>
  );
}

export function ApplicationRuntimeMetricsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [selectedEnv, setSelectedEnv] = useState<string>('');
  const [activeScope, setActiveScope] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);

  const [appList, setAppList] = useState<string[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [metrics, setMetrics] = useState<RuntimeMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setAppsLoading(true);
    applicationRuntimeApi.listApplications(projectId).then(r => {
      const list: string[] = r.data;
      setAppList(list);
      if (list.length > 0 && !selectedApp) setSelectedApp(list[0]);
    }).catch(() => {}).finally(() => setAppsLoading(false));
    const interval = setInterval(() => {
      applicationRuntimeApi.listApplications(projectId).then(r => {
        const list: string[] = r.data;
        setAppList(list);
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const refetchMetrics = () => {
    if (!selectedApp) return;
    setMetricsLoading(true);
    applicationRuntimeApi.getMetrics(selectedApp, { environment: selectedEnv || undefined, limit: 200 })
      .then(r => setMetrics(r.data)).catch(() => {}).finally(() => setMetricsLoading(false));
  };

  useEffect(() => {
    if (!selectedApp) return;
    setMetricsLoading(true);
    applicationRuntimeApi.getMetrics(selectedApp, { environment: selectedEnv || undefined, limit: 200 })
      .then(r => setMetrics(r.data)).catch(() => {}).finally(() => setMetricsLoading(false));
    setSnapLoading(true);
    applicationRuntimeApi.getSnapshot(selectedApp, { environment: selectedEnv || undefined })
      .then(r => setSnapshot(r.data)).catch(() => {}).finally(() => setSnapLoading(false));
    const interval = setInterval(() => {
      applicationRuntimeApi.getMetrics(selectedApp, { environment: selectedEnv || undefined, limit: 200 })
        .then(r => setMetrics(r.data)).catch(() => {});
      applicationRuntimeApi.getSnapshot(selectedApp, { environment: selectedEnv || undefined })
        .then(r => setSnapshot(r.data)).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedApp, selectedEnv]);

  const scopes = ['all', ...Array.from(new Set(metrics.map(m => m.metric_scope).filter(Boolean)))];
  const filteredMetrics = activeScope === 'all'
    ? metrics
    : metrics.filter(m => m.metric_scope === activeScope);

  const groupedMetrics: Record<string, RuntimeMetric[]> = {};
  for (const m of filteredMetrics) {
    const key = m.metric_scope || 'other';
    if (!groupedMetrics[key]) groupedMetrics[key] = [];
    groupedMetrics[key].push(m);
  }

  const alertMetrics = metrics.filter(m => m.severity === 'critical' || m.severity === 'warning');

  const handleRefresh = () => {
    refetchMetrics();
  };

  if (appsLoading) {
    return (
      <div className="p-6">
        <div className="h-8 bg-white/10 rounded-xl w-64 animate-pulse mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-white/10 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Application Runtime Metrics</h1>
            <p className="text-sm text-white/50 mt-0.5">
              Real-time observability from Splunk & AppDynamics — project-level telemetry
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white/70 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={selectedApp}
            onChange={e => setSelectedApp(e.target.value)}
            className="appearance-none px-3 py-1.5 pr-8 text-sm rounded-xl bg-white/[0.08] border border-white/[0.12] text-white focus:outline-none focus:border-[#0A84FF]/60"
          >
            {appList.length === 0 && <option value="">No applications tracked yet</option>}
            {appList.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-white/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={selectedEnv}
            onChange={e => setSelectedEnv(e.target.value)}
            className="appearance-none px-3 py-1.5 pr-8 text-sm rounded-xl bg-white/[0.08] border border-white/[0.12] text-white focus:outline-none focus:border-[#0A84FF]/60"
          >
            <option value="">All Environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-white/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {snapshot && (
          <span className="text-xs text-white/40 ml-2">
            Last synced: {new Date(snapshot.snapshot_timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {appList.length === 0 ? (
        <div className="text-center py-24">
          <Activity className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 font-medium">No application metrics yet</p>
          <p className="text-white/40 text-sm mt-1">
            Configure Splunk or AppDynamics connectors with an <code className="text-white/60">application_name</code>, then run a sync to collect runtime telemetry.
          </p>
        </div>
      ) : (
        <>
          {/* Health Gauges */}
          {snapshot && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">{snapshot.application_name}</h2>
                  <p className="text-xs text-white/40 mt-0.5 capitalize">{snapshot.environment}</p>
                </div>
                <div className="flex items-center gap-2">
                  {snapshot.critical_alerts > 0 && (
                    <span className="flex items-center gap-1 text-xs text-[#FF453A] bg-[#FF453A]/10 px-2 py-1 rounded-full">
                      <XCircle className="w-3 h-3" />
                      {snapshot.critical_alerts} critical
                    </span>
                  )}
                  {snapshot.active_alerts > snapshot.critical_alerts && (
                    <span className="flex items-center gap-1 text-xs text-[#FF9F0A] bg-[#FF9F0A]/10 px-2 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" />
                      {snapshot.active_alerts - snapshot.critical_alerts} warnings
                    </span>
                  )}
                  {snapshot.active_alerts === 0 && (
                    <span className="flex items-center gap-1 text-xs text-[#30D158] bg-[#30D158]/10 px-2 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3" />
                      All healthy
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-around flex-wrap gap-4">
                <HealthGauge score={snapshot.overall_health_score ?? 100} label="Overall" size={90} />
                <HealthGauge score={snapshot.api_health_score ?? 100} label="API" size={80} />
                <HealthGauge score={snapshot.runtime_health_score ?? 100} label="Runtime" size={80} />
                <HealthGauge score={snapshot.database_health_score ?? 100} label="Database" size={80} />
                <HealthGauge score={snapshot.mq_health_score ?? 100} label="Messaging" size={80} />
                <HealthGauge score={snapshot.infrastructure_health_score ?? 100} label="Infra" size={80} />
              </div>

              {/* Key stats row */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/[0.06]">
                {snapshot.avg_response_time != null && (
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <p className="text-xs text-white/40">Avg Response Time</p>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {snapshot.avg_response_time.toFixed(0)}<span className="text-xs text-white/40 ml-1">ms</span>
                    </p>
                  </div>
                )}
                {snapshot.p95_response_time != null && (
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <p className="text-xs text-white/40">P95 Response Time</p>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {snapshot.p95_response_time.toFixed(0)}<span className="text-xs text-white/40 ml-1">ms</span>
                    </p>
                  </div>
                )}
                {snapshot.total_requests != null && (
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <p className="text-xs text-white/40">Total Requests</p>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {snapshot.total_requests.toLocaleString()}
                    </p>
                  </div>
                )}
                {snapshot.failed_requests != null && snapshot.total_requests != null && (
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <p className="text-xs text-white/40">Error Rate</p>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {snapshot.total_requests > 0
                        ? ((snapshot.failed_requests / snapshot.total_requests) * 100).toFixed(1)
                        : '0.0'
                      }<span className="text-xs text-white/40 ml-1">%</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scope filter tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {scopes.map(scope => (
              <button
                key={scope}
                onClick={() => setActiveScope(scope)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all',
                  activeScope === scope
                    ? 'bg-[#0A84FF] text-white'
                    : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80'
                )}
              >
                {scope !== 'all' && SCOPE_ICON[scope]}
                {scope === 'all' ? 'All Metrics' : SCOPE_LABEL[scope] || scope}
                <span className="ml-1 opacity-60 text-[10px]">
                  {scope === 'all' ? metrics.length : metrics.filter(m => m.metric_scope === scope).length}
                </span>
              </button>
            ))}
          </div>

          {/* Alerts banner */}
          {alertMetrics.length > 0 && (
            <div className="rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/[0.06] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-[#FF9F0A]" />
                <span className="text-sm font-semibold text-[#FF9F0A]">
                  {alertMetrics.filter(m => m.severity === 'critical').length} critical,{' '}
                  {alertMetrics.filter(m => m.severity === 'warning').length} warning alerts
                </span>
              </div>
              <div className="space-y-1">
                {alertMetrics.slice(0, 5).map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="text-white/70">{m.metric_key.replace(/_/g, ' ')}</span>
                    <span
                      className="font-mono font-semibold"
                      style={{ color: SEVERITY_COLORS[m.severity] }}
                    >
                      {m.metric_value?.toFixed(2)} {m.metric_unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metric groups */}
          {metricsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-white/[0.04] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : Object.keys(groupedMetrics).length === 0 ? (
            <div className="text-center py-16">
              <BarChart2 className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-sm">No metrics for this scope</p>
              <p className="text-white/40 text-xs mt-1">
                Metrics appear after a connector sync completes with <code className="text-white/60">application_name</code> configured.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(groupedMetrics).map(([scope, scopeMetrics]) => (
                <div
                  key={scope}
                  className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-white/50">{SCOPE_ICON[scope]}</span>
                    <h3 className="text-sm font-semibold text-white">
                      {SCOPE_LABEL[scope] || scope}
                    </h3>
                    <span className="ml-auto text-xs text-white/30">{scopeMetrics.length} metrics</span>
                  </div>
                  <div className="space-y-0">
                    {scopeMetrics.map(m => <MetricRow key={m.id} m={m} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
