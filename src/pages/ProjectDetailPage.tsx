import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FolderOpen, Plug, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, CircleAlert as AlertCircle, ArrowLeft, Activity, LayoutDashboard, ChartBar as BarChart2, TrendingUp, TrendingDown, Zap, Clock, Shield, RefreshCw, Bell, Settings, Users, ChevronRight, Eye, Circle as XCircle, OctagonAlert as AlertOctagon, MoveHorizontal as MoreHorizontal, Filter, Search, ArrowUpRight, Info, ChevronDown, History, SlidersHorizontal, ChartLine as LineChart, ServerCrash, Loader as Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import {
  projectApi, lobApi, projectDashboardApi, analyticsApi, auditApi,
  projectOverviewApi,
} from '@/lib/api';
import { Project, Lob } from '@/types';
import {
  ProjectDashboardSummary, ProjectTrendsResponse, ProjectMetricsResponse,
  ProjectAlertsResponse, ProjectKpiMetricsResponse, ActivitySummaryResponse,
  SlaMetricsResponse, AuditLogsResponse, ProjectAlert,
} from '@/types/overview';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { canManageProjects } from '@/lib/permissions';
import { ProjectConnectorsTab } from '@/components/project/ProjectConnectorsTab';
import { HealthRunPanel } from '@/components/project/HealthRunPanel';
import { HealthRunDetail } from '@/types';
import { cn } from '@/lib/utils';
import {
  LineChart as ReLineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';

// ─── constants ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',        label: 'Overview',       icon: <Eye className="w-3.5 h-3.5" /> },
  { id: 'metrics',         label: 'Metrics',        icon: <LineChart className="w-3.5 h-3.5" /> },
  { id: 'connectors',      label: 'Connectors',     icon: <Plug className="w-3.5 h-3.5" /> },
  { id: 'alerts',          label: 'Alerts',         icon: <Bell className="w-3.5 h-3.5" /> },
  { id: 'configurations',  label: 'Configurations', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  { id: 'activity',        label: 'Activity',       icon: <History className="w-3.5 h-3.5" /> },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── colour helpers ───────────────────────────────────────────────────────────
function scoreColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return '#94a3b8';
  if (v >= 90) return '#22c55e';
  if (v >= 70) return '#f59e0b';
  return '#ef4444';
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-neutral-100 rounded-xl', className)} />;
}

// ─── mini sparkline ───────────────────────────────────────────────────────────
function Spark({
  data, color = '#22c55e', height = 32,
}: {
  data: Array<{ timestamp?: string; value: number }>;
  color?: string;
  height?: number;
}) {
  if (!data.length) return <div style={{ height }} />;
  const pts = data.map((d, i) => ({ i, v: d.value }));
  const gradId = `skg${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#${gradId})`} dot={false} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────
function TabError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ServerCrash className="w-10 h-10 text-neutral-300 mb-3" />
      <p className="text-sm font-medium text-neutral-600">{message}</p>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function TabEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Info className="w-10 h-10 text-neutral-200 mb-3" />
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const canManage = user ? canManageProjects(user.role) : false;

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [project, setProject] = useState<Project | undefined>();
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<Error | null>(null);
  const [lob, setLob] = useState<Lob | undefined>();
  const [summary, setSummary] = useState<ProjectDashboardSummary | undefined>();
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [alertsData, setAlertsData] = useState<ProjectAlertsResponse | undefined>();

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    setProjectLoading(true);
    try {
      const res = await projectApi.get(projectId);
      const p: Project = res.data;
      setProject(p);
      setPageTitle(p.name);

      if (p.lob_id) {
        lobApi.get(p.lob_id).then(r => setLob(r.data)).catch(() => {});
      }
    } catch (e) {
      setProjectError(e as Error);
    } finally {
      setProjectLoading(false);
    }
  }, [projectId, setPageTitle]);

  useEffect(() => {
    if (!project) return;
    const crumbs = [];
    if (lob) {
      crumbs.push({ label: lob.name, href: `/lobs/${lob.id}` });
    } else if (project.lob_id) {
      crumbs.push({ label: 'LOB', href: `/lobs/${project.lob_id}` });
    }
    if (project.team_id && project.team_name) {
      crumbs.push({ label: project.team_name, href: `/teams/${project.team_id}` });
    }
    if (project.component_id && project.component_name) {
      crumbs.push({ label: project.component_name, href: `/components/${project.component_id}` });
    }
    crumbs.push({ label: project.name });
    setBreadcrumbs(crumbs);
  }, [project, lob, setBreadcrumbs]);

  const fetchSummary = useCallback(async () => {
    if (!projectId) return;
    setSummaryLoading(true);
    try {
      const res = await projectDashboardApi.summary(projectId);
      setSummary(res.data);
    } catch {
      // ignore
    } finally {
      setSummaryLoading(false);
    }
  }, [projectId]);

  const fetchAlerts = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await projectOverviewApi.alerts(projectId, { limit: 100, include_resolved: false });
      setAlertsData(res.data);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const invalidate = useCallback(() => {
    fetchProject();
    fetchSummary();
    fetchAlerts();
  }, [fetchProject, fetchSummary, fetchAlerts]);

  // ─── loading/error guards ───────────────────────────────────────────────────
  if (projectLoading) {
    return (
      <div className="space-y-0 animate-fade-in">
        <div className="h-28 bg-neutral-900 rounded-b-2xl animate-pulse mb-6" />
        <div className="px-1 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FolderOpen className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
          <p className="text-neutral-500">Project not found</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/projects')}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const healthPct = summary?.overall_score ?? (
    project.connector_count > 0
      ? Math.round((project.healthy_count / project.connector_count) * 100)
      : null
  );
  const color = project.color || '#22c55e';
  const activeAlertCount = alertsData?.active_count ?? 0;
  const criticalAlertCount = alertsData?.critical_count ?? 0;
  const warningAlertCount = alertsData?.warning_count ?? 0;

  return (
    <div className="space-y-0 -mx-6 -mt-6 animate-fade-in">
      {/* ═══ DARK HEADER ══════════════════════════════════════════════════════ */}
      <div
        className="relative px-6 pt-5 pb-0 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 20% 50%, ${color} 0%, transparent 60%)` }}
        />

        {/* breadcrumb */}
        <div className="relative flex items-center gap-2 mb-4">
          <button onClick={() => navigate('/projects')}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />Components
          </button>
          <span className="text-slate-600">/</span>
          {lob && <>
            <button onClick={() => navigate(`/lobs/${project.lob_id}`)}
              className="text-xs text-slate-400 hover:text-white transition-colors">
              {lob.name}
            </button>
            <span className="text-slate-600">/</span>
          </>}
          <span className="text-xs text-slate-200">{project.name}</span>
        </div>

        {/* title row */}
        <div className="relative flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border border-white/10"
            style={{ background: color + '25' }}>
            <FolderOpen className="w-6 h-6" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">{project.name}</h1>
              {healthPct !== null && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                  style={{ color: scoreColor(healthPct), borderColor: scoreColor(healthPct) + '50', background: scoreColor(healthPct) + '15' }}>
                  {healthPct >= 90 ? 'Healthy' : healthPct >= 70 ? 'Degraded' : 'Critical'}
                </span>
              )}
              <StatusBadge status={project.status} size="xs" />
              <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-slate-300 capitalize border border-white/10">
                {project.environment}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5 font-mono">{project.slug}</p>
            {project.description && (
              <p className="text-sm text-slate-300 mt-1 max-w-2xl">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={invalidate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all">
              <RefreshCw className="w-3 h-3" />Refresh
            </button>
            <button onClick={() => navigate(`/projects/${project.id}/dashboards`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all">
              <LayoutDashboard className="w-3.5 h-3.5" />Dashboards
            </button>
            <button onClick={() => navigate(`/projects/${project.id}/health-dashboard`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white border border-blue-500/40 bg-blue-600/20 hover:bg-blue-600/35 transition-all">
              <BarChart2 className="w-3.5 h-3.5" />Run Health Check
            </button>
          </div>
        </div>

        {/* status bar */}
        <div className="relative flex items-center justify-between text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Auto refresh: 30s
            </span>
            {summary?.last_run_at && (
              <span>
                Last run: {new Date(summary.last_run_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lob && <span className="text-slate-400">{lob.name}</span>}
            {project.team_name && (
              <><span className="text-slate-600">·</span><span className="text-slate-400">{project.team_name}</span></>
            )}
          </div>
        </div>

        {/* tab bar */}
        <div className="relative flex items-end gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'text-white border-blue-400 bg-white/5'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
              )}>
              {tab.icon}{tab.label}
              {tab.id === 'alerts' && activeAlertCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-xs bg-red-500 text-white font-bold leading-none">
                  {activeAlertCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ TAB CONTENT ══════════════════════════════════════════════════════ */}
      <div className="px-6 pt-6 pb-10 space-y-5">
        {activeTab === 'overview' && (
          <OverviewTab
            project={project}
            summary={summary}
            summaryLoading={summaryLoading}
            canManage={canManage}
            onRunComplete={invalidate}
            alertsData={alertsData}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'metrics' && (
          <MetricsTab projectId={project.id} color={color} />
        )}
        {activeTab === 'connectors' && (
          <ConnectorsTab project={project} canManage={canManage} />
        )}
        {activeTab === 'alerts' && (
          <AlertsTab
            projectId={project.id}
            criticalCount={criticalAlertCount}
            warningCount={warningAlertCount}
          />
        )}
        {activeTab === 'configurations' && (
          <ConfigurationsTab project={project} lob={lob ?? null} canManage={canManage} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab projectId={project.id} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({
  project, summary, summaryLoading, canManage, onRunComplete, alertsData, setActiveTab,
}: {
  project: Project;
  summary: ProjectDashboardSummary | undefined;
  summaryLoading: boolean;
  canManage: boolean;
  onRunComplete: () => void;
  alertsData: ProjectAlertsResponse | undefined;
  setActiveTab: (tab: any) => void;
}) {
  const projectId = project.id;

  const [kpi, setKpi] = useState<ProjectKpiMetricsResponse | undefined>();
  const [kpiLoading, setKpiLoading] = useState(true);
  const [trends, setTrends] = useState<ProjectTrendsResponse | undefined>();
  const [trendsLoading, setTrendsLoading] = useState(true);

  useEffect(() => {
    setKpiLoading(true);
    projectOverviewApi.kpiMetrics(projectId, { time_range: '1h' }).then(r => setKpi(r.data)).catch(() => {}).finally(() => setKpiLoading(false));
  }, [projectId]);

  useEffect(() => {
    setTrendsLoading(true);
    projectDashboardApi.trends(projectId, { time_range: '24h' }).then(r => setTrends(r.data)).catch(() => {}).finally(() => setTrendsLoading(false));
  }, [projectId]);

  const healthScore = kpi?.health_score.value ?? summary?.overall_score ?? null;
  const color = project.color || '#22c55e';

  // Build KPI tiles from real data
  const kpiTiles = [
    {
      label: 'Health Score',
      value: healthScore !== null ? `${Math.round(healthScore)}` : '—',
      unit: '/100',
      change: kpi?.health_score.change ?? null,
      positive: kpi?.health_score.positive ?? true,
      color: scoreColor(healthScore),
      icon: <Shield className="w-4 h-4" />,
      series: kpi?.health_score.series ?? [],
      onClick: () => setActiveTab('metrics'),
    },
    {
      label: 'Availability',
      value: kpi?.availability.value !== null && kpi?.availability.value !== undefined
        ? `${kpi.availability.value.toFixed(2)}`
        : summary?.availability_percentage !== undefined
          ? `${summary.availability_percentage.toFixed(2)}`
          : '—',
      unit: '%',
      change: kpi?.availability.change ?? null,
      positive: kpi?.availability.positive ?? true,
      color: '#22c55e',
      icon: <CheckCircle className="w-4 h-4" />,
      series: kpi?.availability.series ?? [],
      onClick: () => setActiveTab('metrics'),
    },
    {
      label: 'Avg Response Time',
      value: kpi?.avg_response_time_ms.value !== null && kpi?.avg_response_time_ms.value !== undefined
        ? `${Math.round(kpi.avg_response_time_ms.value)}`
        : '—',
      unit: 'ms',
      change: kpi?.avg_response_time_ms.change ?? null,
      positive: false,
      color: '#f59e0b',
      icon: <Clock className="w-4 h-4" />,
      series: kpi?.avg_response_time_ms.series ?? [],
      onClick: () => setActiveTab('metrics'),
    },
    {
      label: 'Error Rate',
      value: kpi?.error_rate.value !== null && kpi?.error_rate.value !== undefined
        ? `${kpi.error_rate.value.toFixed(2)}`
        : '—',
      unit: '%',
      change: kpi?.error_rate.change ?? null,
      positive: kpi?.error_rate.positive ?? true,
      color: '#ef4444',
      icon: <AlertTriangle className="w-4 h-4" />,
      series: kpi?.error_rate.series ?? [],
      onClick: () => setActiveTab('metrics'),
    },
    {
      label: 'Total Runs',
      value: kpi?.total_runs !== undefined ? `${kpi.total_runs}` : '—',
      unit: '',
      change: null,
      positive: true,
      color: '#3b82f6',
      icon: <Zap className="w-4 h-4" />,
      series: [],
      onClick: () => setActiveTab('activity'),
    },
    {
      label: 'Active Alerts',
      value: `${alertsData?.active_count ?? 0}`,
      unit: '',
      change: alertsData
        ? `${alertsData.critical_count} Crit · ${alertsData.warning_count} Warn`
        : null,
      positive: (alertsData?.active_count ?? 0) === 0,
      color: (alertsData?.active_count ?? 0) > 0 ? '#ef4444' : '#22c55e',
      icon: <Bell className="w-4 h-4" />,
      series: [],
      onClick: () => setActiveTab('alerts'),
    },
  ];

  // Health breakdown from summary
  const healthBreakdown: Record<string, { score: number; max_score: number; weight: number }> = summary
    ? {
        'App Performance':  { score: Math.round((summary.overall_score ?? 0) * 0.4), max_score: 40, weight: 0.40 },
        'Infrastructure':   { score: Math.round((summary.overall_score ?? 0) * 0.2), max_score: 20, weight: 0.20 },
        'API Performance':  { score: Math.round((summary.overall_score ?? 0) * 0.15), max_score: 15, weight: 0.15 },
        'Dependencies':     { score: Math.round((summary.overall_score ?? 0) * 0.10), max_score: 10, weight: 0.10 },
        'Database':         { score: Math.round((summary.overall_score ?? 0) * 0.10), max_score: 10, weight: 0.10 },
        'Queue/Messaging':  { score: Math.round((summary.overall_score ?? 0) * 0.05), max_score: 5, weight: 0.05 },
      }
    : {};
  const bdColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];

  // Trend chart data from real API
  const trendChartData = (trends?.overall_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    score: pt.score,
  }));

  // Connector rows from summary
  const connectorRows = summary?.connectors ?? [];

  // Alerts from alertsData
  const topAlerts = (alertsData?.alerts ?? []).slice(0, 5);

  const [projectMetrics, setProjectMetrics] = useState<ProjectMetricsResponse | undefined>();
  useEffect(() => {
    projectDashboardApi.metrics(projectId, { time_range: '24h' }).then(r => setProjectMetrics(r.data)).catch(() => {});
  }, [projectId]);

  return (
    <div className="space-y-5">
      {/* KPI tiles — premium clickable situation room panels */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiLoading || summaryLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : kpiTiles.map(k => (
            <motion.div
              whileHover={{ scale: 1.04, y: -4 }}
              whileTap={{ scale: 0.97 }}
              key={k.label}
              onClick={k.onClick}
              className="relative rounded-2xl p-4 backdrop-blur-lg transition-all duration-300 bg-slate-900/70 border border-white/5 cursor-pointer group shadow-2xl overflow-hidden flex flex-col gap-1.5"
              style={{ 
                boxShadow: `inset 0 0 16px ${k.color}15, 0 12px 32px rgba(0,0,0,0.5)`, 
                borderColor: `${k.color}25` 
              }}
            >
              {/* Tech background mesh glow effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 50% 50%, ${k.color} 0%, transparent 70%)`
                }}
              />
              
              {/* Glowing breathing state light in the top-right */}
              <span className="absolute top-4 right-4 flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: k.color }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: k.color }} />
              </span>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{k.label}</span>
                <span className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" style={{ color: k.color }}>
                  {k.icon}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black leading-none" style={{ color: k.color }}>{k.value}</span>
                {k.unit && <span className="text-xs text-slate-400 font-semibold">{k.unit}</span>}
              </div>
              <div className="flex items-center gap-1 flex-wrap min-h-[16px]">
                {k.change && (
                  <>
                    {k.positive ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                    <span className={cn('text-xs font-semibold', k.positive ? 'text-green-400' : 'text-red-400')}>
                      {k.change}
                    </span>
                  </>
                )}
              </div>
              <div className="h-8 mt-1">
                <Spark data={k.series} color={k.color} height={32} />
              </div>
            </motion.div>
          ))
        }
      </div>

      {/* health trend + breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">Health Score Trend</h3>
            <div className="flex items-center gap-1 text-xs text-neutral-500">
              Last 24 Hours <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>
          {trendsLoading ? (
            <Skeleton className="h-52" />
          ) : trendChartData.length === 0 ? (
            <TabEmpty message="No trend data available yet. Run a health check to generate data." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendChartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="htg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={5} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={28} />
                  <ReTooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }}
                    formatter={(v: number) => [`${v?.toFixed(1)}`, 'Health Score']} />
                  <Area type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} fill="url(#htg)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 text-xs text-neutral-500">
                {[['#22c55e', 'Healthy > 90'], ['#f59e0b', 'Degraded 70–90'], ['#f97316', 'Critical 40–70'], ['#ef4444', 'Down < 40']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded-full inline-block" style={{ background: c }} />{l}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">Health Score Breakdown</h3>
          </div>
          {summaryLoading ? (
            <Skeleton className="h-52" />
          ) : !summary ? (
            <TabEmpty message="No data yet." />
          ) : (
            <div className="flex items-center gap-4">
              <DonutChart value={healthScore ?? 0} breakdown={healthBreakdown} colors={bdColors} />
              <div className="flex-1 space-y-1.5 min-w-0">
                {Object.entries(healthBreakdown).map(([name, v], idx) => (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: bdColors[idx % bdColors.length] }} />
                    <span className="text-neutral-600 flex-1 truncate">{name}</span>
                    <span className="text-neutral-400">{Math.round(v.weight * 100)}%</span>
                    <span className="font-semibold text-neutral-700">{v.score}/{v.max_score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* connector status + top alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Connector table */}
        <div className="lg:col-span-3 rounded-2xl border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">Connector Status</h3>
          </div>
          {summaryLoading ? (
            <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : connectorRows.length === 0 ? (
            <div className="p-5"><TabEmpty message="No connectors configured for this project." /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-50/60 text-neutral-400 uppercase tracking-wider">
                      {['Connector', 'Category', 'Status', 'Last Sync', 'Response', 'Uptime', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {connectorRows.map((row, i) => (
                      <tr key={row.id ?? i} className="border-t border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                              style={{ background: row.color || '#64748b' }}>
                              {(row.name || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-neutral-800">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-500 capitalize">{row.category ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={row.health_status} />
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {row.last_sync_at ? formatRelative(row.last_sync_at) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-neutral-700">
                          {row.last_sync_response_ms != null ? `${row.last_sync_response_ms}ms` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.uptime_percentage != null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden min-w-[50px]">
                                <div className="h-full rounded-full bg-green-400"
                                  style={{ width: `${row.uptime_percentage}%` }} />
                              </div>
                              <span className="text-neutral-600 font-medium">{row.uptime_percentage}%</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="p-1 rounded-lg text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-neutral-100">
                <span className="text-xs text-neutral-400">{connectorRows.length} connector{connectorRows.length !== 1 ? 's' : ''} total</span>
              </div>
            </>
          )}
        </div>

        {/* Top Alerts */}
        <div className="lg:col-span-2 rounded-2xl border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">Top Alerts</h3>
            {alertsData && alertsData.active_count > 0 && (
              <span className="text-xs text-red-500 font-semibold">{alertsData.active_count} active</span>
            )}
          </div>
          {topAlerts.length === 0 ? (
            <div className="p-5">
              <TabEmpty message="No active alerts — all systems healthy." />
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {topAlerts.map(alert => (
                <AlertRow key={alert.id} alert={alert} compact />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Key metrics overview from connector response times */}
      {projectMetrics && projectMetrics.connector_response_times.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">
              Connector Response Times <span className="text-neutral-400 font-normal">(Last 24h)</span>
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-neutral-100">
            {projectMetrics.connector_response_times.slice(0, 6).map((ct, i) => (
              <div key={i} className="p-4 hover:bg-neutral-50/50 transition-colors">
                <div className="text-xs text-neutral-500 truncate" title={ct.connector}>{ct.connector}</div>
                <div className="text-xs text-neutral-400 mb-1.5">Response Time</div>
                <div className="text-2xl font-black text-neutral-900">{ct.avg_ms}ms</div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  min: {ct.min_ms}ms · max: {ct.max_ms}ms
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score distribution */}
      {projectMetrics && projectMetrics.total_runs > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Score Distribution</h3>
          <div className="grid grid-cols-4 gap-3">
            {(
              [
                { label: 'Excellent', key: 'excellent', color: '#22c55e', range: '≥ 90' },
                { label: 'Good',      key: 'good',      color: '#3b82f6', range: '70–89' },
                { label: 'Fair',      key: 'fair',      color: '#f59e0b', range: '50–69' },
                { label: 'Poor',      key: 'poor',      color: '#ef4444', range: '< 50' },
              ] as const
            ).map(s => (
              <div key={s.key} className="rounded-xl p-4 text-center" style={{ background: s.color + '10' }}>
                <div className="text-2xl font-black" style={{ color: s.color }}>
                  {projectMetrics.score_distribution[s.key]}
                </div>
                <div className="text-xs text-neutral-600 mt-0.5">{s.label}</div>
                <div className="text-xs text-neutral-400">{s.range}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-neutral-400 text-right">{projectMetrics.total_runs} runs analysed</div>
        </div>
      )}

      {/* Health Run Panel */}
      <HealthRunPanel
        projectId={project.id}
        canManage={canManage}
        onRunComplete={(_run: HealthRunDetail) => onRunComplete()}
      />
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
function DonutChart({ value, breakdown, colors }: {
  value: number;
  breakdown: Record<string, { score: number; max_score: number; weight: number }>;
  colors: string[];
}) {
  if (Object.keys(breakdown).length === 0) {
    return (
      <div className="flex-shrink-0 w-24 h-24 rounded-full border-8 border-neutral-100 flex items-center justify-center">
        <span className="text-lg font-black text-neutral-400">—</span>
      </div>
    );
  }
  const size = 100; const r = 38; const circ = 2 * Math.PI * r;
  const total = Object.values(breakdown).reduce((s, v) => s + v.max_score, 0) || 100;
  let offset = 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        {Object.entries(breakdown).map(([, v], idx) => {
          const pct = (v.max_score / total) * 100;
          const dash = (pct / 100) * circ;
          const gap = circ - dash;
          const rotate = (offset / 100) * 360 - 90;
          offset += pct;
          return (
            <circle key={idx} cx="50" cy="50" r={r} fill="none"
              stroke={colors[idx % colors.length]} strokeWidth="11"
              strokeDasharray={`${dash} ${gap}`}
              transform={`rotate(${rotate} 50 50)`} strokeLinecap="butt" />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-neutral-900">{Math.round(value)}</span>
        <span className="text-xs text-neutral-400">/100</span>
      </div>
    </div>
  );
}

// ─── StatusPill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    healthy:     'bg-green-100 text-green-700',
    degraded:    'bg-amber-100 text-amber-700',
    down:        'bg-red-100 text-red-700',
    error:       'bg-red-100 text-red-700',
    timeout:     'bg-orange-100 text-orange-700',
    unknown:     'bg-neutral-100 text-neutral-600',
    unconfigured:'bg-neutral-100 text-neutral-500',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', cfg[status] ?? cfg.unknown)}>
      {status}
    </span>
  );
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────
function AlertRow({ alert, compact = false }: { alert: ProjectAlert; compact?: boolean }) {
  const isCrit = alert.severity === 'critical';
  const isResolved = alert.status === 'resolved';
  return (
    <div className={cn('px-5 py-4 hover:bg-neutral-50/60 transition-colors', isResolved && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
          isResolved ? 'bg-green-100' : isCrit ? 'bg-red-100' : 'bg-amber-100')}>
          {isResolved ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            : isCrit ? <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
            : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-800 truncate">{alert.title}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0',
              isResolved ? 'bg-green-100 text-green-700'
                : isCrit ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
              {isResolved ? 'Resolved' : alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
            </span>
          </div>
          {!compact && (
            <p className="text-xs text-neutral-500 mt-0.5">
              <span className="font-medium text-neutral-700">{alert.service}</span> · {alert.rule}
            </p>
          )}
          {compact && (
            <p className="text-xs text-neutral-500 mt-0.5 truncate">{alert.service}</p>
          )}
        </div>
        <span className="text-xs text-neutral-400 flex-shrink-0 mt-0.5">{alert.time ?? ''}</span>
      </div>
    </div>
  );
}

// ─── formatRelative ───────────────────────────────────────────────────────────
function formatRelative(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return isoStr; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function MetricsTab({ projectId, color }: { projectId: string; color: string }) {
  const [range, setRange] = useState('24h');
  const ranges = ['24h', '7d', '30d'];

  const [trends, setTrends] = useState<ProjectTrendsResponse | undefined>();
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState<Error | null>(null);
  const [metrics, setMetrics] = useState<ProjectMetricsResponse | undefined>();
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<Error | null>(null);
  const [sla, setSla] = useState<SlaMetricsResponse | undefined>();
  const [slaLoading, setSlaLoading] = useState(true);

  useEffect(() => {
    setTrendsLoading(true); setTrendsError(null);
    projectDashboardApi.trends(projectId, { time_range: range }).then(r => setTrends(r.data)).catch(e => setTrendsError(e)).finally(() => setTrendsLoading(false));
    setMetricsLoading(true); setMetricsError(null);
    projectDashboardApi.metrics(projectId, { time_range: range }).then(r => setMetrics(r.data)).catch(e => setMetricsError(e)).finally(() => setMetricsLoading(false));
    setSlaLoading(true);
    analyticsApi.slaMetrics(projectId, { time_range: range }).then(r => setSla(r.data)).catch(() => {}).finally(() => setSlaLoading(false));
  }, [projectId, range]);

  const loading = trendsLoading || metricsLoading;

  // Chart data: response time per connector
  const responseTimeData = (metrics?.run_durations ?? []).map(d => ({
    time: d.timestamp
      ? new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    duration_ms: d.duration_ms,
    score: d.score,
  }));

  // Availability trend
  const availData = (trends?.availability_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    availability: pt.availability,
  }));

  // Incident trend
  const incidentData = (trends?.incident_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    incidents: pt.incidents,
  }));

  // Score trend
  const scoreData = (trends?.overall_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    score: pt.score,
  }));

  // SLA items
  const availability = sla?.availability_percentage ?? sla?.uptime_percentage ?? null;
  const avgResponseMs = metrics?.connector_response_times[0]?.avg_ms ?? null;
  const errorRate = sla ? (1 - (sla.sla_percentage as number ?? 100) / 100) * 100 : null;

  const slaItems = [
    {
      label: 'Availability SLA', target: '99.9%',
      actual: availability !== null ? `${availability.toFixed(2)}%` : '—',
      met: availability !== null ? availability >= 99.9 : false,
    },
    {
      label: 'Response Time SLA', target: '< 500ms',
      actual: avgResponseMs !== null ? `${avgResponseMs}ms` : '—',
      met: avgResponseMs !== null ? avgResponseMs < 500 : false,
    },
    {
      label: 'Error Rate SLA', target: '< 1%',
      actual: errorRate !== null ? `${errorRate.toFixed(2)}%` : '—',
      met: errorRate !== null ? errorRate < 1 : false,
    },
    {
      label: 'SLA Met',
      target: 'Yes',
      actual: sla?.sla_met !== undefined ? (sla.sla_met ? 'Yes' : 'No') : '—',
      met: sla?.sla_met ?? false,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-900">Performance Metrics</h2>
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl">
          {ranges.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                range === r ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700')}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {trendsError || metricsError ? (
        <TabError message="Failed to load metrics data." />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Health Score Trend */}
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Health Score Trend</h3>
              <p className="text-xs text-neutral-400">Overall project health over time</p>
            </div>
          </div>
          {loading ? <Skeleton className="h-48" /> : scoreData.length === 0 ? (
            <TabEmpty message="No health run data for this range." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={scoreData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="stg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={28} />
                <ReTooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} fill="url(#stg)" dot={false} name="Score" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Availability Trend */}
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Availability</h3>
              <p className="text-xs text-neutral-400">Connector success rate per run</p>
            </div>
            {availability !== null && (
              <div className="text-right">
                <div className="text-2xl font-black text-green-500">{availability.toFixed(2)}%</div>
                <div className="text-xs text-neutral-400">avg availability</div>
              </div>
            )}
          </div>
          {loading ? <Skeleton className="h-48" /> : availData.length === 0 ? (
            <TabEmpty message="No availability data for this range." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={availData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="avg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={28} unit="%" />
                <ReTooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="availability" stroke="#3b82f6" strokeWidth={2} fill="url(#avg)" dot={false} name="Availability" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Run Duration */}
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Health Run Duration</h3>
              <p className="text-xs text-neutral-400">Time taken per health run</p>
            </div>
          </div>
          {loading ? <Skeleton className="h-48" /> : responseTimeData.length === 0 ? (
            <TabEmpty message="No run duration data for this range." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <ReLineChart data={responseTimeData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={38} unit="ms" />
                <ReTooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                <Line type="monotone" dataKey="duration_ms" stroke="#f59e0b" strokeWidth={2} dot={false} name="Duration (ms)" />
              </ReLineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Incident Trend */}
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Incident Count</h3>
              <p className="text-xs text-neutral-400">Connector failures per run</p>
            </div>
          </div>
          {loading ? <Skeleton className="h-48" /> : incidentData.length === 0 ? (
            <TabEmpty message="No incident data for this range." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={incidentData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="erg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={28} />
                <ReTooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="incidents" stroke="#ef4444" strokeWidth={2} fill="url(#erg)" dot={false} name="Incidents" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Connector response times table */}
      {metrics && metrics.connector_response_times.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">Connector Response Times</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50/60 text-neutral-400 uppercase tracking-wider">
                  {['Connector', 'Avg', 'Min', 'Max', 'Samples'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.connector_response_times.map((ct, i) => (
                  <tr key={i} className="border-t border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-neutral-800">{ct.connector}</td>
                    <td className="px-5 py-3 text-amber-600 font-semibold">{ct.avg_ms}ms</td>
                    <td className="px-5 py-3 text-green-600">{ct.min_ms}ms</td>
                    <td className="px-5 py-3 text-red-500">{ct.max_ms}ms</td>
                    <td className="px-5 py-3 text-neutral-500">{ct.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SLA */}
      <div className="rounded-2xl border bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">SLA Performance</h3>
        {slaLoading ? (
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {slaItems.map((sla, i) => (
              <div key={i} className={cn('rounded-xl p-4 border', sla.met ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-500 font-medium">{sla.label}</span>
                  {sla.met ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className={cn('text-xl font-black', sla.met ? 'text-green-700' : 'text-red-600')}>{sla.actual}</div>
                <div className="text-xs text-neutral-400 mt-0.5">Target: {sla.target}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTORS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ConnectorsTab({ project, canManage }: { project: Project; canManage: boolean }) {
  const [summary, setSummary] = useState<ProjectDashboardSummary | undefined>();
  useEffect(() => {
    projectDashboardApi.summary(project.id).then(r => setSummary(r.data)).catch(() => {});
  }, [project.id]);

  const healthy  = summary?.healthy_connectors  ?? project.healthy_count;
  const degraded = summary?.degraded_connectors ?? project.degraded_count;
  const down     = summary?.down_connectors     ?? project.down_count;
  const total    = summary?.total_connectors    ?? project.connector_count;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: total,    color: '#3b82f6', icon: <Plug className="w-4 h-4" /> },
          { label: 'Healthy',  value: healthy,  color: '#22c55e', icon: <CheckCircle className="w-4 h-4" /> },
          { label: 'Degraded', value: degraded, color: '#f59e0b', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Down',     value: down,     color: '#ef4444', icon: <AlertCircle className="w-4 h-4" /> },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color + '15' }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-black text-neutral-900">{s.value}</div>
              <div className="text-xs text-neutral-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">Health Distribution</h3>
          <div className="flex h-3 rounded-full overflow-hidden gap-px mb-3">
            {[
              { v: healthy,  c: '#22c55e' },
              { v: degraded, c: '#f59e0b' },
              { v: down,     c: '#ef4444' },
              { v: Math.max(0, total - healthy - degraded - down), c: '#94a3b8' },
            ].filter(s => s.v > 0).map((s, i) => (
              <div key={i} className="h-full" style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />
            ))}
          </div>
          <div className="flex items-center gap-6 text-xs">
            {[{ l: 'Healthy', v: healthy, c: '#22c55e' }, { l: 'Degraded', v: degraded, c: '#f59e0b' }, { l: 'Down', v: down, c: '#ef4444' }].map(s => (
              <span key={s.l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.c }} />
                <span className="text-neutral-600">{s.l}</span>
                <span className="font-bold text-neutral-800">{s.v}</span>
                <span className="text-neutral-400">({total > 0 ? Math.round(s.v / total * 100) : 0}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <ProjectConnectorsTab projectId={project.id} canManage={canManage} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AlertsTab({ projectId, criticalCount, warningCount }: {
  projectId: string; criticalCount: number; warningCount: number;
}) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'resolved'>('all');
  const [data, setData] = useState<ProjectAlertsResponse | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    projectOverviewApi.alerts(projectId, { limit: 200, include_resolved: true }).then(r => { setData(r.data); setError(null); }).catch(e => setError(e)).finally(() => setIsLoading(false));
  }, [projectId]);

  const allAlerts = data?.alerts ?? [];
  const filtered = filter === 'all' ? allAlerts
    : filter === 'resolved' ? allAlerts.filter(a => a.status === 'resolved')
    : allAlerts.filter(a => a.severity === filter && a.status === 'active');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Active',   value: data?.active_count ?? 0,       color: '#ef4444', icon: <Bell className="w-4 h-4" /> },
          { label: 'Critical',       value: data?.critical_count ?? 0,     color: '#dc2626', icon: <AlertOctagon className="w-4 h-4" /> },
          { label: 'Warning',        value: data?.warning_count ?? 0,      color: '#f59e0b', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Resolved (all)', value: data?.resolved_24h ?? 0,       color: '#22c55e', icon: <CheckCircle className="w-4 h-4" /> },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.color + '15' }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-black" style={{ color: s.value > 0 && i < 3 ? s.color : '#0f172a' }}>{s.value}</div>
              <div className="text-xs text-neutral-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl">
            {(['all', 'critical', 'warning', 'resolved'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize',
                  filter === f ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700')}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : error ? (
          <div className="p-5"><TabError message="Failed to load alerts." /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><TabEmpty message={filter === 'all' ? 'No alerts found.' : `No ${filter} alerts.`} /></div>
        ) : (
          <div className="divide-y divide-neutral-50">
            {filtered.map(alert => (
              <div key={alert.id} className={cn('px-5 py-4 hover:bg-neutral-50/50 transition-colors', alert.status === 'resolved' && 'opacity-60')}>
                <div className="flex items-start gap-4">
                  <div className={cn('mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center',
                    alert.status === 'resolved' ? 'bg-green-100' : alert.severity === 'critical' ? 'bg-red-100' : 'bg-amber-100')}>
                    {alert.status === 'resolved' ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : alert.severity === 'critical' ? <AlertOctagon className="w-4 h-4 text-red-500" />
                      : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-semibold text-neutral-800">{alert.title}</span>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-bold',
                        alert.status === 'resolved' ? 'bg-green-100 text-green-700'
                          : alert.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
                        {alert.status === 'resolved' ? 'Resolved' : alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500 flex-wrap">
                      <span className="font-medium text-neutral-700">{alert.service}</span>
                      <span>·</span><span>{alert.rule}</span>
                      {alert.current && <><span>·</span><span>Current: <strong className={alert.status==='resolved'?'text-green-600':alert.severity==='critical'?'text-red-600':'text-amber-600'}>{alert.current}</strong></span></>}
                      {alert.threshold && <span>Threshold: <strong>{alert.threshold}</strong></span>}
                    </div>
                    {alert.error && (
                      <div className="mt-1 text-xs text-red-500 font-mono truncate">{alert.error}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-neutral-400">{alert.time ?? ''}</div>
                    {alert.duration && <div className="text-xs text-neutral-400 mt-0.5">Duration: {alert.duration}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ConfigurationsTab({ project, lob, canManage }: { project: Project; lob: Lob | null; canManage: boolean }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProjectDashboardSummary | undefined>();
  useEffect(() => {
    projectDashboardApi.summary(project.id).then(r => setSummary(r.data)).catch(() => {});
  }, [project.id]);

  const infoRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Project ID',   value: <span className="font-mono text-xs text-neutral-500 select-all">{project.id}</span> },
    { label: 'Name',         value: <span className="font-medium">{project.name}</span> },
    { label: 'Slug',         value: <span className="font-mono text-xs text-neutral-500">{project.slug}</span> },
    { label: 'Environment',  value: <span className="capitalize font-medium">{project.environment}</span> },
    { label: 'Status',       value: <StatusBadge status={project.status} size="xs" /> },
    { label: 'LOB',          value: lob ? <span className="font-medium text-blue-600">{lob.name}</span> : '—' },
    { label: 'Team',         value: project.team_name ? <span className="font-medium">{project.team_name}</span> : '—' },
    { label: 'Members',      value: <span className="font-medium">{project.member_count ?? 0}</span> },
    {
      label: 'Total Connectors',
      value: <span className="font-medium">{summary?.total_connectors ?? project.connector_count}</span>,
    },
    {
      label: 'Last Health Run',
      value: summary?.last_run_at
        ? <span className="text-neutral-600">{new Date(summary.last_run_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        : <span className="text-neutral-400">Never</span>,
    },
    {
      label: 'Created',
      value: <span>{new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>,
    },
    {
      label: 'Updated',
      value: <span>{new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>,
    },
  ];

  if (project.tags) {
    infoRows.push({
      label: 'Tags',
      value: (
        <div className="flex flex-wrap gap-1 justify-end">
          {project.tags.split(',').filter(Boolean).map(t => (
            <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-600">{t.trim()}</span>
          ))}
        </div>
      ),
    });
  }

  const healthSettings = [
    { label: 'Auto Health Run',      value: 'Enabled',              on: true },
    { label: 'Check Interval',       value: 'On-demand / Manual' },
    { label: 'Availability Target',  value: `${summary?.sla_percentage?.toFixed(2) ?? 99}%` },
    { label: 'Incident Count',       value: `${summary?.incident_count ?? 0}` },
  ];

  const total = summary?.total_connectors ?? project.connector_count;
  const healthy = summary?.healthy_connectors ?? project.healthy_count;
  const degraded = summary?.degraded_connectors ?? project.degraded_count;
  const down = summary?.down_connectors ?? project.down_count;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />Project Details
            </h3>
            {canManage && (
              <button className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 border border-blue-200 px-2.5 py-1 rounded-lg">
                <Settings className="w-3 h-3" />Edit
              </button>
            )}
          </div>
          <div className="space-y-0 divide-y divide-neutral-50">
            {infoRows.map(r => (
              <div key={r.label} className="flex items-center justify-between gap-2 text-sm py-2.5">
                <span className="text-neutral-400 flex-shrink-0">{r.label}</span>
                <div className="text-right">{r.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />Health Check Settings
              </h3>
              {canManage && (
                <button className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                  <Settings className="w-3 h-3" />Configure
                </button>
              )}
            </div>
            <div className="divide-y divide-neutral-50">
              {healthSettings.map(s => (
                <div key={s.label} className="flex items-center justify-between text-sm py-2.5">
                  <span className="text-neutral-500">{s.label}</span>
                  <div className="flex items-center gap-2">
                    {'on' in s && <span className={cn('w-2 h-2 rounded-full', s.on ? 'bg-green-400' : 'bg-neutral-300')} />}
                    <span className="font-medium text-neutral-700">{s.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />Quick Actions
            </h3>
            <div className="space-y-2">
              {[
                { label: 'View Dashboards',      icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate(`/projects/${project.id}/dashboards`) },
                { label: 'Health Dashboard',     icon: <BarChart2 className="w-4 h-4" />,       action: () => navigate(`/projects/${project.id}/health-dashboard`) },
                { label: 'App Runtime Metrics',  icon: <Activity className="w-4 h-4" />,        action: () => navigate(`/projects/${project.id}/app-runtime`) },
                { label: 'Manage Members',       icon: <Users className="w-4 h-4" />,           action: () => {} },
              ].map((a, i) => (
                <button key={i} onClick={a.action}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-100 hover:border-neutral-200 transition-all text-left">
                  <span className="text-neutral-400">{a.icon}</span>
                  {a.label}
                  <ChevronRight className="w-4 h-4 ml-auto text-neutral-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Connector breakdown */}
      <div className="rounded-2xl border bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <Plug className="w-4 h-4 text-blue-500" />Connector Health Breakdown
        </h3>
        {total === 0 ? (
          <TabEmpty message="No connectors assigned" />
        ) : (
          <>
            <div className="flex h-3 rounded-full overflow-hidden gap-px mb-4">
              {[
                { v: healthy,  c: '#22c55e' },
                { v: degraded, c: '#f59e0b' },
                { v: down,     c: '#ef4444' },
                { v: Math.max(0, total - healthy - degraded - down), c: '#94a3b8' },
              ].filter(s => s.v > 0).map((s, i) => (
                <div key={i} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { l: 'Total',    v: total,    c: '#3b82f6' },
                { l: 'Healthy',  v: healthy,  c: '#22c55e' },
                { l: 'Degraded', v: degraded, c: '#f59e0b' },
                { l: 'Down',     v: down,     c: '#ef4444' },
              ].map(s => (
                <div key={s.l} className="text-center p-3 rounded-xl" style={{ background: s.c + '10' }}>
                  <div className="text-2xl font-black" style={{ color: s.c }}>{s.v}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ActivityTab({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<ActivitySummaryResponse | undefined>();
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<Error | null>(null);
  const [auditData, setAuditData] = useState<AuditLogsResponse | undefined>();
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    setActivityLoading(true);
    projectOverviewApi.activitySummary(projectId, { days: 7 }).then(r => { setActivity(r.data); setActivityError(null); }).catch(e => setActivityError(e)).finally(() => setActivityLoading(false));
    setAuditLoading(true);
    auditApi.getLogs({ resource_type: 'project', limit: 30 }).then(r => setAuditData(r.data)).catch(() => {}).finally(() => setAuditLoading(false));
  }, [projectId]);

  const chartData = activity?.activity ?? [];

  const runLog = activity?.recent_run_log ?? [];
  const auditItems = (auditData?.items ?? []).map(log => ({
    id: log.id,
    action: log.action,
    user: log.user_id ?? 'System',
    resource: log.resource_type,
    time: log.created_at ? new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
    status: 'success' as const,
  }));

  // Merge run log + audit items, sorted by time
  const allActivity = [
    ...runLog.map(r => ({
      id: r.id,
      action: r.action,
      user: r.triggered_by,
      resource: r.resource,
      time: r.time ?? '',
      status: r.status,
    })),
    ...auditItems,
  ];

  const filtered = search
    ? allActivity.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.resource.toLowerCase().includes(search.toLowerCase()) ||
        l.user.toLowerCase().includes(search.toLowerCase())
      )
    : allActivity;

  return (
    <div className="space-y-5">
      {/* Activity chart */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-neutral-900">Health Run Activity (Last 7 Days)</h3>
          {activity && (
            <div className="text-xs text-neutral-500">
              {activity.total_runs} runs · {activity.total_errors} errors · avg {activity.avg_runs_per_day}/day
            </div>
          )}
        </div>
        {activityLoading ? (
          <Skeleton className="h-40" />
        ) : activityError ? (
          <TabError message="Failed to load activity data." />
        ) : chartData.length === 0 ? (
          <TabEmpty message="No activity in the last 7 days." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={28} />
                <ReTooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                <Bar dataKey="runs"   fill="#3b82f6" radius={[4, 4, 0, 0]} name="Runs" />
                <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} name="Errors" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />Health Runs</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-400 inline-block" />Errors</span>
            </div>
          </>
        )}
      </div>

      {/* Audit/activity log */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <History className="w-4 h-4 text-neutral-400" />Activity Log
          </h3>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs pl-7 pr-3 py-1.5 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 bg-neutral-50 w-40"
              placeholder="Search logs…"
            />
          </div>
        </div>
        {(activityLoading || auditLoading) ? (
          <div className="space-y-2 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><TabEmpty message="No activity found." /></div>
        ) : (
          <div className="divide-y divide-neutral-50">
            {filtered.slice(0, 30).map((log, i) => (
              <div key={log.id ?? i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-50/50 transition-colors">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                  log.status === 'success' ? 'bg-green-100' : log.status === 'error' ? 'bg-red-100' : 'bg-amber-100')}>
                  {log.status === 'success' ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    : log.status === 'error' ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-neutral-800">{log.action}</span>
                    <span className="text-neutral-400">·</span>
                    <span className="text-neutral-500 truncate">{log.resource}</span>
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{log.user}</div>
                </div>
                <span className="text-xs text-neutral-400 flex-shrink-0">{log.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
