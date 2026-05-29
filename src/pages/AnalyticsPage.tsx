import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useParams, useNavigate } from 'react-router-dom';
import { ChartBar as BarChart2, TrendingUp, TrendingDown, Minus, RefreshCw, Download, ChevronLeft, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Shield, Activity, Clock, Zap, Target, CircleAlert as AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { DateRangeFilter } from '@/components/analytics/DateRangeFilter';
import { HealthScoreTrendChart, AvailabilityTrendChart, SlaTrendChart } from '@/components/analytics/AnalyticsTrendChart';
import { ProjectBarComparison, ProjectScoreTrendComparison } from '@/components/analytics/ProjectComparisonChart';
import { ConnectorLeaderboard } from '@/components/analytics/ConnectorLeaderboard';
import { ConnectorResponseTimeChart, ConnectorSuccessRateChart, ConnectorTrendMiniChart } from '@/components/analytics/ConnectorPerformanceChart';
import { SlaGauge, SlaStatusBadge } from '@/components/analytics/SlaGauge';
import { analyticsApi } from '@/lib/api';
import {
  AnalyticsTimeRange, AnalyticsGranularity,
  AnalyticsProjectTrends, AnalyticsProjectComparison,
  AnalyticsConnectorHistory, AnalyticsSlaMetrics,
  ConnectorPerformanceMetrics,
} from '@/types';
import { cn } from '@/lib/utils';

type TabId = 'trends' | 'comparison' | 'connectors' | 'sla';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'trends', label: 'Health Trends', icon: TrendingUp },
  { id: 'comparison', label: 'Comparison', icon: BarChart2 },
  { id: 'connectors', label: 'Connectors', icon: Activity },
  { id: 'sla', label: 'SLA & Uptime', icon: Shield },
];

function KpiCard({ label, value, sub, trend, color, icon: Icon }: {
  label: string;
  value: string | number | null;
  sub?: string;
  trend?: number | null;
  color?: string;
  icon?: React.ElementType;
}) {
  const displayColor = color || 'var(--primary-500)';
  const trendColor = trend == null ? undefined : trend > 0 ? '#30D158' : trend < 0 ? '#FF453A' : '#8E8E93';
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-2"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        {Icon && (
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: `${displayColor}15` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: displayColor }} strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span
          className="text-[26px] font-bold leading-none tabular-nums"
          style={{ color: value == null ? 'var(--text-muted)' : displayColor }}
        >
          {value ?? '—'}
        </span>
        {TrendIcon && trend != null && (
          <div className="flex items-center gap-1 mb-0.5">
            <TrendIcon className="w-3.5 h-3.5" style={{ color: trendColor }} />
            <span className="text-[11px] font-semibold" style={{ color: trendColor }}>
              {Math.abs(trend).toFixed(1)}
            </span>
          </div>
        )}
      </div>
      {sub && (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      )}
    </div>
  );
}

function EmptyAnalytics({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
      >
        <BarChart2 className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {message || 'No analytics data available for this period'}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Run health checks to generate historical data
      </p>
    </div>
  );
}

export function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>('trends');
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('7d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('daily');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [trends, setTrends] = useState<AnalyticsProjectTrends | null>(null);
  const [comparison, setComparison] = useState<AnalyticsProjectComparison | null>(null);
  const [connectorHistory, setConnectorHistory] = useState<AnalyticsConnectorHistory | null>(null);
  const [slaMetrics, setSlaMetrics] = useState<AnalyticsSlaMetrics | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorPerformanceMetrics | null>(null);

  const pid = projectId || '';

  const fetchAll = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const params = { time_range: timeRange, granularity };
      const [t, comp, ch, sla] = await Promise.allSettled([
        analyticsApi.projectTrends(pid, params),
        analyticsApi.projectComparison(pid, { time_range: timeRange }),
        analyticsApi.connectorHistory(pid, params),
        analyticsApi.slaMetrics(pid, { time_range: timeRange }),
      ]);
      if (t.status === 'fulfilled') setTrends(t.value.data);
      if (comp.status === 'fulfilled') setComparison(comp.value.data);
      if (ch.status === 'fulfilled') {
        setConnectorHistory(ch.value.data);
        if (ch.value.data?.connectors?.length && !selectedConnector) {
          setSelectedConnector(ch.value.data.connectors[0]);
        }
      }
      if (sla.status === 'fulfilled') setSlaMetrics(sla.value.data);
    } finally {
      setLoading(false);
    }
  }, [pid, timeRange, granularity]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleExport(format: 'json' | 'csv') {
    if (!pid) return;
    setExporting(true);
    try {
      const res = await analyticsApi.export(pid, { format, time_range: timeRange });
      if (format === 'csv') {
        const blob = new Blob([res.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${pid}_${timeRange}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${pid}_${timeRange}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }

  const hasTrends = trends && (trends.health_trend.length > 0 || trends.total_runs > 0);
  const hasComparison = comparison && comparison.projects.length > 0;
  const hasConnectors = connectorHistory && connectorHistory.connectors.length > 0;
  const hasSla = slaMetrics && slaMetrics.total_runs > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {pid && (
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl transition-all hover:opacity-80"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-100)' }}
              >
                <BarChart2 className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
              </div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Historical Analytics
              </h1>
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {pid ? 'Project health trends & performance analysis' : 'System-wide analytics & trends'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter
            timeRange={timeRange}
            granularity={granularity}
            onTimeRangeChange={(v) => { setTimeRange(v); }}
            onGranularityChange={(v) => { setGranularity(v); }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAll}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          {pid && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExport('csv')}
                loading={exporting}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExport('json')}
                loading={exporting}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                JSON
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Row */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Avg Health Score"
            value={trends?.health_trend.length
              ? `${Math.round((trends.health_trend.reduce((s, d) => s + (d.score ?? 0), 0) / trends.health_trend.length) * 10) / 10}`
              : null}
            sub={`${trends?.total_runs ?? 0} runs in range`}
            trend={trends?.score_delta}
            color="var(--primary-500)"
            icon={Activity}
          />
          <KpiCard
            label="Availability"
            value={slaMetrics?.uptime_pct != null ? `${slaMetrics.uptime_pct.toFixed(2)}%` : null}
            sub="Overall uptime"
            color="#30D158"
            icon={CheckCircle}
          />
          <KpiCard
            label="SLA"
            value={slaMetrics?.sla_pct != null ? `${slaMetrics.sla_pct.toFixed(2)}%` : null}
            sub={slaMetrics ? `${slaMetrics.breach_count} breaches` : '—'}
            color={slaMetrics?.sla_pct != null && slaMetrics.sla_pct < 99 ? '#FF9F0A' : '#30D158'}
            icon={Shield}
          />
          <KpiCard
            label="Incidents"
            value={slaMetrics?.breach_count ?? null}
            sub={slaMetrics?.mttr_minutes != null ? `MTTR: ${slaMetrics.mttr_minutes.toFixed(0)}min` : 'SLA breaches'}
            color="#FF9F0A"
            icon={AlertCircle}
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div
        className="flex items-center rounded-2xl p-1 gap-1"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150',
                activeTab === tab.id ? 'text-white shadow-sm' : 'hover:opacity-80',
              )}
              style={activeTab === tab.id ? {
                background: 'var(--primary-500)',
                color: '#fff',
              } : {
                color: 'var(--text-secondary)',
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
              <span className="hidden sm:block">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'trends' && (
            <TrendsTab trends={trends} loading={loading} granularity={granularity} hasTrends={hasTrends ?? false} />
          )}
          {activeTab === 'comparison' && (
            <ComparisonTab comparison={comparison} loading={loading} hasComparison={hasComparison ?? false} />
          )}
          {activeTab === 'connectors' && (
            <ConnectorsTab
              connectorHistory={connectorHistory}
              loading={loading}
              hasConnectors={hasConnectors ?? false}
              selectedConnector={selectedConnector}
              onSelectConnector={setSelectedConnector}
              granularity={granularity}
            />
          )}
          {activeTab === 'sla' && (
            <SlaTab slaMetrics={slaMetrics} loading={loading} hasSla={hasSla ?? false} granularity={granularity} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Trends Tab ──────────────────────────────────────────────────────────────

function TrendsTab({ trends, loading, granularity, hasTrends }: {
  trends: AnalyticsProjectTrends | null;
  loading: boolean;
  granularity: AnalyticsGranularity;
  hasTrends: boolean;
}) {
  if (loading) return <AnalyticsSkeleton />;
  if (!hasTrends) return <EmptyAnalytics />;

  const connectorNames = Object.keys(trends?.connector_trends || {});

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="md">
          <CardHeader
            title="Health Score Trend"
            subtitle={`${trends?.total_runs ?? 0} runs · ${granularity} buckets`}
            action={
              trends?.score_delta != null ? (
                <div className="flex items-center gap-1">
                  {trends.score_delta > 0
                    ? <TrendingUp className="w-3.5 h-3.5" style={{ color: '#30D158' }} />
                    : trends.score_delta < 0
                    ? <TrendingDown className="w-3.5 h-3.5" style={{ color: '#FF453A' }} />
                    : <Minus className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
                  }
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: trends.score_delta > 0 ? '#30D158' : trends.score_delta < 0 ? '#FF453A' : '#8E8E93' }}
                  >
                    {trends.score_delta > 0 ? '+' : ''}{trends.score_delta.toFixed(1)}
                  </span>
                </div>
              ) : null
            }
          />
          <HealthScoreTrendChart data={trends?.health_trend || []} granularity={granularity} height={240} />
        </Card>

        <Card padding="md">
          <CardHeader title="Availability Trend" subtitle="Success rate over time" />
          <AvailabilityTrendChart data={trends?.availability_trend || []} granularity={granularity} height={240} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="md">
          <CardHeader title="SLA Trend" subtitle="Service level trend over time" />
          <SlaTrendChart data={trends?.sla_trend || []} granularity={granularity} height={220} />
        </Card>

        <Card padding="md">
          <CardHeader
            title="Incident Frequency"
            subtitle="Failures per bucket"
          />
          <IncidentBarChart data={trends?.incident_trend || []} granularity={granularity} height={220} />
        </Card>
      </div>

      {connectorNames.length > 0 && (
        <Card padding="md">
          <CardHeader
            title="Connector Health Trends"
            subtitle={`${connectorNames.length} connectors tracked`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectorNames.map(name => {
              const pts = (trends?.connector_trends || {})[name] || [];
              const latest = pts[pts.length - 1];
              const first = pts[0];
              const delta = latest?.success_rate != null && first?.success_rate != null
                ? latest.success_rate - first.success_rate
                : null;
              const sr = latest?.success_rate;
              const color = sr == null ? 'var(--text-muted)' : sr >= 95 ? '#30D158' : sr >= 80 ? '#FF9F0A' : '#FF453A';

              return (
                <div
                  key={name}
                  className="rounded-xl p-3"
                  style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
                    <span className="text-[12px] font-bold tabular-nums ml-2 flex-shrink-0" style={{ color }}>
                      {sr != null ? `${sr.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <ConnectorTrendMiniChart
                    data={pts}
                    metric="success_rate"
                    color={color}
                    height={60}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function IncidentBarChart({ data, granularity, height = 220 }: {
  data: Array<{ timestamp: string; incidents: number }>;
  granularity: string;
  height?: number;
}) {
  const formatted = data.map(d => ({
    ...d,
    label: formatLabel(d.timestamp, granularity),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barCategoryGap="40%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          content={(props) => {
            if (!props.active || !props.payload?.length) return null;
            return (
              <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
                <p className="font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{props.label}</p>
                <p className="font-bold" style={{ color: '#FF9F0A' }}>{props.payload[0].value} incidents</p>
              </div>
            );
          }}
          cursor={{ fill: 'var(--app-border)', fillOpacity: 0.2 }}
        />
        <Bar dataKey="incidents" fill="#FF9F0A" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatLabel(ts: string, granularity: string): string {
  try {
    const d = new Date(ts);
    if (granularity === 'hourly') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (granularity === 'monthly') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ts; }
}

// ─── Comparison Tab ───────────────────────────────────────────────────────────

function ComparisonTab({ comparison, loading, hasComparison }: {
  comparison: AnalyticsProjectComparison | null;
  loading: boolean;
  hasComparison: boolean;
}) {
  const [metric, setMetric] = useState<'avg_health_score' | 'availability_pct' | 'sla_pct' | 'incident_count'>('avg_health_score');

  if (loading) return <AnalyticsSkeleton />;
  if (!hasComparison) return <EmptyAnalytics message="No project data available for comparison" />;

  const projects = comparison?.projects || [];
  const metricLabels: Record<string, string> = {
    avg_health_score: 'Health Score',
    availability_pct: 'Availability %',
    sla_pct: 'SLA %',
    incident_count: 'Incidents',
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card padding="md">
            <CardHeader
              title="Project Score Trends"
              subtitle="Comparative health score over time"
            />
            <ProjectScoreTrendComparison projects={projects} height={260} />
          </Card>
        </div>

        <Card padding="md">
          <CardHeader title="Leaderboard" subtitle="Ranked by health score" />
          <div className="space-y-2">
            {projects.map((proj, i) => {
              const color = proj.project_color || '#0A84FF';
              const score = proj.avg_health_score;
              const scoreColor = score == null ? 'var(--text-muted)' : score >= 90 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A';
              return (
                <div
                  key={proj.project_id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
                >
                  <span className="text-[11px] font-bold w-5 text-center" style={{ color: 'var(--text-muted)' }}>
                    {i + 1}
                  </span>
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                    {proj.project_name}
                  </span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: scoreColor }}>
                    {score != null ? score.toFixed(1) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Project Comparison</h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Side-by-side metric comparison</p>
          </div>
          <div
            className="flex items-center gap-1 rounded-xl p-0.5"
            style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
          >
            {(Object.entries(metricLabels) as [typeof metric, string][]).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setMetric(k)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                  metric === k ? 'text-white' : 'hover:opacity-70',
                )}
                style={metric === k ? {
                  background: 'var(--primary-500)',
                  color: '#fff',
                } : { color: 'var(--text-muted)' }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <ProjectBarComparison projects={projects} metric={metric} height={240} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(proj => {
          const score = proj.avg_health_score;
          const scoreColor = score == null ? 'var(--text-muted)' : score >= 90 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A';
          return (
            <div
              key={proj.project_id}
              className="rounded-2xl p-4"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: proj.project_color || '#0A84FF' }}
                />
                <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {proj.project_name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Health</p>
                  <p className="text-[16px] font-bold tabular-nums" style={{ color: scoreColor }}>
                    {score != null ? score.toFixed(1) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Availability</p>
                  <p className="text-[16px] font-bold tabular-nums" style={{ color: '#30D158' }}>
                    {proj.availability_pct != null ? `${proj.availability_pct.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>SLA</p>
                  <p className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {proj.sla_pct != null ? `${proj.sla_pct.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Incidents</p>
                  <p className="text-[14px] font-bold tabular-nums" style={{ color: '#FF9F0A' }}>
                    {proj.incident_count}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Connectors Tab ───────────────────────────────────────────────────────────

function ConnectorsTab({ connectorHistory, loading, hasConnectors, selectedConnector, onSelectConnector, granularity }: {
  connectorHistory: AnalyticsConnectorHistory | null;
  loading: boolean;
  hasConnectors: boolean;
  selectedConnector: ConnectorPerformanceMetrics | null;
  onSelectConnector: (c: ConnectorPerformanceMetrics) => void;
  granularity: AnalyticsGranularity;
}) {
  if (loading) return <AnalyticsSkeleton />;
  if (!hasConnectors) return <EmptyAnalytics message="No connector execution history found" />;

  const connectors = connectorHistory?.connectors || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card padding="md" className="lg:col-span-1">
          <CardHeader
            title="Connector Leaderboard"
            subtitle={`${connectors.length} connectors`}
          />
          <ConnectorLeaderboard
            connectors={connectors}
            onSelect={onSelectConnector}
            selectedName={selectedConnector?.connector_name}
          />
        </Card>

        <div className="lg:col-span-2 space-y-5">
          {selectedConnector && (
            <ConnectorDetailPanel connector={selectedConnector} granularity={granularity} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="md">
          <CardHeader title="Response Times" subtitle="Avg & P95 comparison" />
          <ConnectorResponseTimeChart connectors={connectors} height={240} />
        </Card>

        <Card padding="md">
          <CardHeader title="Success Rates" subtitle="Per connector reliability" />
          <ConnectorSuccessRateChart connectors={connectors} height={240} />
        </Card>
      </div>
    </div>
  );
}

function ConnectorDetailPanel({ connector, granularity }: { connector: ConnectorPerformanceMetrics; granularity: string }) {
  const successColor = connector.success_rate >= 95 ? '#30D158' : connector.success_rate >= 80 ? '#FF9F0A' : '#FF453A';

  return (
    <Card padding="md">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{connector.connector_name}</h3>
          {connector.connector_category && (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{connector.connector_category}</span>
          )}
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[12px] font-bold tabular-nums"
          style={{ background: `${successColor}15`, color: successColor }}
        >
          {connector.success_rate.toFixed(1)}% success
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Runs', value: connector.total_executions },
          { label: 'Successes', value: connector.success_count, color: '#30D158' },
          { label: 'Failures', value: connector.failure_count, color: '#FF453A' },
          { label: 'Avg Score', value: connector.avg_health_score != null ? connector.avg_health_score.toFixed(1) : '—' },
        ].map(item => (
          <div
            key={item.label}
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
          >
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
            <p className="text-[16px] font-bold" style={{ color: item.color || 'var(--text-primary)' }}>{item.value}</p>
          </div>
        ))}
      </div>

      {connector.avg_response_time_ms != null && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Avg RT</p>
            <p className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{Math.round(connector.avg_response_time_ms)}ms</p>
          </div>
          <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Min RT</p>
            <p className="text-[14px] font-bold tabular-nums" style={{ color: '#30D158' }}>{connector.min_response_time_ms ?? '—'}ms</p>
          </div>
          <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>P95 RT</p>
            <p className="text-[14px] font-bold tabular-nums" style={{ color: '#FF9F0A' }}>{connector.p95_response_time_ms ?? '—'}ms</p>
          </div>
        </div>
      )}

      {connector.trend.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Success Rate Trend</p>
          <ConnectorTrendMiniChart data={connector.trend} metric="success_rate" color={successColor} height={80} />
        </div>
      )}

      {connector.top_errors.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Top Errors</p>
          <div className="space-y-1.5">
            {connector.top_errors.map((e, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)' }}
              >
                <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: '#FF453A' }} />
                <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{e.message}</span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,69,58,0.15)', color: '#FF453A' }}
                >
                  ×{e.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── SLA Tab ──────────────────────────────────────────────────────────────────

function SlaTab({ slaMetrics, loading, hasSla, granularity }: {
  slaMetrics: AnalyticsSlaMetrics | null;
  loading: boolean;
  hasSla: boolean;
  granularity: AnalyticsGranularity;
}) {
  if (loading) return <AnalyticsSkeleton />;
  if (!hasSla) return <EmptyAnalytics message="No run history for SLA computation" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card padding="md">
          <CardHeader title="SLA Overview" subtitle={`Target: ${slaMetrics?.sla_threshold ?? 99}%`} />
          <div className="flex items-center justify-center gap-8 py-2">
            <SlaGauge
              value={slaMetrics?.sla_pct ?? null}
              threshold={slaMetrics?.sla_threshold ?? 99}
              label="SLA"
              size="lg"
            />
            <SlaGauge
              value={slaMetrics?.uptime_pct ?? null}
              threshold={slaMetrics?.sla_threshold ?? 99}
              label="Uptime"
              size="lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Breaches</p>
              <p className="text-[18px] font-bold" style={{ color: slaMetrics?.breach_count ? '#FF453A' : '#30D158' }}>
                {slaMetrics?.breach_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Total Runs</p>
              <p className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {slaMetrics?.total_runs ?? 0}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="md" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>MTTR</p>
              <p className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {slaMetrics?.mttr_minutes != null ? `${slaMetrics.mttr_minutes.toFixed(0)}min` : '—'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Mean time to recovery</p>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>MTBF</p>
              <p className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {slaMetrics?.mtbf_minutes != null ? `${slaMetrics.mtbf_minutes.toFixed(0)}min` : '—'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Mean time between failures</p>
            </div>
          </div>

          <CardHeader title="Daily SLA Trend" subtitle="SLA % over time" />
          <SlaTrendChart data={slaMetrics?.sla_trend || []} granularity="daily" threshold={slaMetrics?.sla_threshold ?? 99} height={180} />
        </Card>
      </div>

      {(slaMetrics?.connector_sla || []).length > 0 && (
        <Card padding="md">
          <CardHeader
            title="Per-Connector SLA"
            subtitle={`${slaMetrics?.connector_sla.length ?? 0} connectors`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--app-border)' }}>
                  {['Connector', 'Uptime', 'SLA', 'Executions', 'Failures', 'Status'].map(h => (
                    <th key={h} className="text-left py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaMetrics?.connector_sla.map((c, i) => (
                  <tr
                    key={c.connector_name}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--app-border)', background: i % 2 === 0 ? 'transparent' : 'var(--app-surface-raised)' }}
                  >
                    <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{c.connector_name}</td>
                    <td className="py-3 px-3 tabular-nums font-semibold" style={{ color: (c.uptime_pct ?? 0) >= 99 ? '#30D158' : '#FF9F0A' }}>
                      {c.uptime_pct != null ? `${c.uptime_pct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-3 px-3 tabular-nums font-semibold" style={{ color: (c.sla_pct ?? 0) >= (slaMetrics?.sla_threshold ?? 99) ? '#30D158' : '#FF453A' }}>
                      {c.sla_pct != null ? `${c.sla_pct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-3 px-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c.total_executions}</td>
                    <td className="py-3 px-3 tabular-nums" style={{ color: c.failure_count > 0 ? '#FF453A' : 'var(--text-muted)' }}>
                      {c.failure_count}
                    </td>
                    <td className="py-3 px-3">
                      <SlaStatusBadge value={c.sla_pct} threshold={slaMetrics?.sla_threshold ?? 99} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(slaMetrics?.downtime_periods || []).length > 0 && (
        <Card padding="md">
          <CardHeader
            title="SLA Breach Events"
            subtitle={`${slaMetrics?.downtime_periods.length ?? 0} recent events`}
          />
          <div className="space-y-2">
            {slaMetrics?.downtime_periods.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF453A' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    SLA {p.sla_pct.toFixed(1)}% — {p.failure_count} failure{p.failure_count !== 1 ? 's' : ''}
                  </p>
                  {p.timestamp && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {new Date(p.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
                {p.duration_ms != null && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{(p.duration_ms / 1000).toFixed(1)}s</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Loading State ────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}
