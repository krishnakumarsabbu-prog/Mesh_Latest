import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FolderOpen, Plug, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  CircleAlert as AlertCircle, ArrowLeft, Activity, LayoutDashboard,
  ChartBar as BarChart2, TrendingUp, TrendingDown, Zap, Clock, Shield,
  RefreshCw, Bell, Settings, Users, ChevronRight, Eye, Circle as XCircle,
  OctagonAlert as AlertOctagon, MoveHorizontal as MoreHorizontal, Filter,
  Search, ArrowUpRight, Info, ChevronDown, History, SlidersHorizontal,
  ChartLine as LineChart, ServerCrash, Loader as Loader2, Network
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  MarkerType, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';

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

// Dagre layout helper
function layoutGraph(rawNodes: any[], rawEdges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: 150, height: 44 }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rawNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 75, y: pos.y - 22 } };
  });
}

// Custom flow node for project and connectors
function FlowNode({ data }: { data: any }) {
  return (
    <div
      className="px-3 py-2 rounded-xl flex items-center gap-2 select-none"
      style={{
        background: `${data.color}15`,
        border: `1px solid ${data.color}45`,
        boxShadow: `0 0 10px ${data.color}15`,
        minWidth: 135,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 6, height: 6, border: 'none' }} />
      <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${data.color}25` }}>
        {data.type === 'project' && <FolderOpen className="w-3 h-3" style={{ color: data.color }} />}
        {data.type === 'connector' && <Plug className="w-3 h-3" style={{ color: data.color }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase tracking-widest leading-none" style={{ color: data.color }}>{data.type}</p>
        <p className="text-[10px] font-semibold truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const FLOW_NODE_TYPES = { flowNode: FlowNode };

// Constants
const TABS = [
  { id: 'overview',        label: 'Overview',       icon: <Eye className="w-3.5 h-3.5" /> },
  { id: 'topology',        label: 'Topology Map',   icon: <Network className="w-3.5 h-3.5" /> },
  { id: 'metrics',         label: 'Metrics',        icon: <LineChart className="w-3.5 h-3.5" /> },
  { id: 'connectors',      label: 'Connectors',     icon: <Plug className="w-3.5 h-3.5" /> },
  { id: 'alerts',          label: 'Alerts',         icon: <Bell className="w-3.5 h-3.5" /> },
  { id: 'configurations',  label: 'Configurations', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  { id: 'activity',        label: 'Activity',       icon: <History className="w-3.5 h-3.5" /> },
] as const;
type TabId = typeof TABS[number]['id'];

function scoreColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return '#8E8E93';
  if (v >= 90) return '#30D158';
  if (v >= 70) return '#FF9F0A';
  return '#FF453A';
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-[var(--app-surface-hover)] rounded-xl border border-[var(--app-border)]', className)} />;
}

// Sparkline
function Spark({
  data, color = '#30D158', height = 32,
}: {
  data: Array<{ timestamp?: string; value: number }>;
  color?: string;
  height?: number;
}) {
  if (!data || !data.length) return <div style={{ height }} />;
  const pts = data.map((d, i) => ({ i, v: d.value }));
  const gradId = `skg-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
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

function TabError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] shadow-sm">
      <ServerCrash className="w-10 h-10 text-red-500/80 mb-3 animate-pulse" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">{message}</p>
    </div>
  );
}

function TabEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] shadow-sm">
      <Info className="w-10 h-10 text-[var(--text-secondary)] mb-3" />
      <p className="text-sm text-[var(--text-secondary)] font-semibold">{message}</p>
    </div>
  );
}

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

  // ReactFlow Topology Map dataset
  const flowData = useMemo(() => {
    if (!project) return { nodes: [], edges: [] };
    const color = project.color || '#30D158';

    const ns: any[] = [];
    const es: any[] = [];

    // Root project node
    ns.push({
      id: 'proj-root',
      type: 'flowNode',
      data: { type: 'project', label: project.name, color },
      position: { x: 0, y: 0 }
    });

    const connectors = summary?.connectors || [];
    connectors.forEach((conn) => {
      const connColor = conn.color || '#0A84FF';
      ns.push({
        id: `conn-${conn.id}`,
        type: 'flowNode',
        data: { id: conn.id, type: 'connector', label: conn.name, color: connColor },
        position: { x: 0, y: 0 }
      });

      es.push({
        id: `e-proj-${conn.id}`,
        source: 'proj-root',
        target: `conn-${conn.id}`,
        animated: conn.health_status === 'healthy',
        style: { stroke: connColor, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: connColor }
      });
    });

    const layouted = layoutGraph(ns, es);
    return { nodes: layouted, edges: es };
  }, [project, summary]);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  useEffect(() => {
    if (activeTab === 'topology' && flowData.nodes.length > 0) {
      setNodes(flowData.nodes);
      setEdges(flowData.edges);
    }
  }, [activeTab, flowData]);

  if (projectLoading) {
    return (
      <div className="space-y-6 min-h-screen bg-transparent p-1 animate-pulse">
        <div className="h-44 bg-[var(--app-surface-hover)] rounded-3xl border border-[var(--app-border)]" />
        <div className="grid grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="h-64 bg-[var(--app-surface-hover)] rounded-3xl border border-[var(--app-border)]" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="flex items-center justify-center h-[60vh] bg-transparent">
        <div className="text-center p-8 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] backdrop-blur-md shadow-xl">
          <FolderOpen className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 animate-bounce" />
          <p className="text-[var(--text-secondary)] font-semibold">Project not found</p>
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
      : 88
  );
  const color = project.color || '#30D158';
  const activeAlertCount = alertsData?.active_count ?? 0;
  const criticalAlertCount = alertsData?.critical_count ?? 0;
  const warningAlertCount = alertsData?.warning_count ?? 0;

  return (
    <div className="space-y-6 min-h-screen pb-12 bg-transparent animate-page-enter">
      {/* Navigation Breadcrumb Back */}
      <button
        onClick={() => navigate('/projects')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Components Catalog
      </button>

      {/* Hero Header Command Deck */}
      <div
        className="relative rounded-3xl overflow-hidden p-8 border"
        style={{
          background: 'linear-gradient(160deg, var(--app-surface) 0%, var(--app-surface-raised) 100%)',
          borderColor: 'var(--app-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div className="absolute inset-0 opacity-[0.09] pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle at 80% 20%, ${color} 0%, transparent 65%)`,
        }} />
        <div className="absolute top-0 left-0 w-48 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl flex-shrink-0 border border-white/10 relative overflow-hidden"
              style={{ background: `${color}15`, boxShadow: `0 8px 32px ${color}20` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <FolderOpen className="w-8 h-8" style={{ color }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">{project.name}</h1>
                {healthPct !== null && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border"
                    style={{ color: scoreColor(healthPct), borderColor: scoreColor(healthPct) + '30', background: scoreColor(healthPct) + '12' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: scoreColor(healthPct) }} />
                    {healthPct}% {healthPct >= 90 ? 'Healthy' : healthPct >= 70 ? 'Degraded' : 'Critical'}
                  </span>
                )}
                <span className="text-[10px] uppercase px-2.5 py-0.5 rounded-md font-bold border tracking-wider"
                  style={{ background: 'var(--app-bg-muted)', borderColor: 'var(--app-border)', color: 'var(--text-secondary)' }}>
                  {project.environment}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-1 uppercase tracking-wider">{project.slug}</p>
              {project.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mt-2.5">{project.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={invalidate}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-md">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => navigate(`/projects/${project.id}/dashboards`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-lg">
              <LayoutDashboard className="w-4 h-4" /> Dashboards
            </button>
            <button onClick={() => navigate(`/projects/${project.id}/health-dashboard`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md"
              style={{ background: 'linear-gradient(135deg, #0A84FF, #0066CC)', boxShadow: '0 4px 16px rgba(10,132,255,0.3)' }}>
              <BarChart2 className="w-4 h-4" /> Run Health Check
            </button>
          </div>
        </div>

        {/* Status indicator bar */}
        <div className="relative flex items-center justify-between text-[11px] text-slate-500 mt-6 pt-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ingestion: Live
            </span>
            {summary?.last_run_at && (
              <span className="font-mono text-slate-500 uppercase tracking-widest text-[9px]">
                Diagnostics tick: {new Date(summary.last_run_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            {lob && <span className="text-slate-400">{lob.name}</span>}
            {project.team_name && (
              <><span className="text-slate-700">·</span><span className="text-slate-400">{project.team_name}</span></>
            )}
          </div>
        </div>
      </div>

      {/* Glassmorphic Tabs */}
      <div className="flex gap-2 border-b border-[var(--app-border)] pb-0 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-all duration-200 outline-none whitespace-nowrap',
              activeTab === tab.id
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
            )}
            style={activeTab === tab.id ? { borderColor: color } : {}}
          >
            <span style={activeTab === tab.id ? { color } : {}}>{tab.icon}</span>
            {tab.label}
            {tab.id === 'alerts' && activeAlertCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-black leading-none border border-red-400/20">
                {activeAlertCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="space-y-6"
        >
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
          {activeTab === 'topology' && (
            <div
              className="rounded-3xl border relative overflow-hidden"
              style={{
                background: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                boxShadow: 'var(--shadow-lg)',
                height: 520,
              }}
            >
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-4 py-2 text-xs font-semibold backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                <span className="text-[var(--text-secondary)]">Project Telemetry Topology</span>
                <span className="text-[var(--text-muted)]">|</span>
                <span className="text-[var(--text-secondary)]">Auto-layout enabled</span>
              </div>

              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={FLOW_NODE_TYPES}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={1.8}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="var(--recharts-grid)" gap={24} size={1} />
                <Controls
                  style={{ bottom: 12, right: 12, left: 'auto', top: 'auto' }}
                  className="[&_button]:bg-[var(--app-surface)] [&_button]:border-[var(--app-border)] [&_button]:text-[var(--text-secondary)] [&_button:hover]:bg-[var(--app-surface-hover)]"
                />
              </ReactFlow>

              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                {[
                  { label: 'Component Node', color },
                  { label: 'Cloud Gateway Connector', color: '#0A84FF' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="text-[var(--text-secondary)]">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Overview Tab Panel ──────────────────────────────────────────────────────
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
  const color = project.color || '#30D158';

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
      color: '#30D158',
      icon: <CheckCircle className="w-4 h-4" />,
      series: kpi?.availability.series ?? [],
      onClick: () => setActiveTab('metrics'),
    },
    {
      label: 'Response Time',
      value: kpi?.avg_response_time_ms.value !== null && kpi?.avg_response_time_ms.value !== undefined
        ? `${Math.round(kpi.avg_response_time_ms.value)}`
        : '—',
      unit: 'ms',
      change: kpi?.avg_response_time_ms.change ?? null,
      positive: false,
      color: '#FF9F0A',
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
      color: '#FF453A',
      icon: <AlertTriangle className="w-4 h-4" />,
      series: kpi?.error_rate.series ?? [],
      onClick: () => setActiveTab('metrics'),
    },
    {
      label: 'Diagnostic Runs',
      value: kpi?.total_runs !== undefined ? `${kpi.total_runs}` : '—',
      unit: '',
      change: null,
      positive: true,
      color: '#64D2FF',
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
      color: (alertsData?.active_count ?? 0) > 0 ? '#FF453A' : '#30D158',
      icon: <Bell className="w-4 h-4" />,
      series: [],
      onClick: () => setActiveTab('alerts'),
    },
  ];

  const healthBreakdown: Record<string, { score: number; max_score: number; weight: number; }> = summary
    ? {
        'App Performance':  { score: Math.round((summary.overall_score ?? 0) * 0.4), max_score: 40, weight: 0.40 },
        'Infrastructure':   { score: Math.round((summary.overall_score ?? 0) * 0.2), max_score: 20, weight: 0.20 },
        'API Performance':  { score: Math.round((summary.overall_score ?? 0) * 0.15), max_score: 15, weight: 0.15 },
        'Dependencies':     { score: Math.round((summary.overall_score ?? 0) * 0.10), max_score: 10, weight: 0.10 },
        'Database':         { score: Math.round((summary.overall_score ?? 0) * 0.10), max_score: 10, weight: 0.10 },
        'Queue/Messaging':  { score: Math.round((summary.overall_score ?? 0) * 0.05), max_score: 5, weight: 0.05 },
      }
    : {};
  const bdColors = ['#30D158', '#0A84FF', '#FF9F0A', '#BF5AF2', '#64D2FF', '#FF453A'];

  const trendChartData = (trends?.overall_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    score: pt.score,
  }));

  const connectorRows = summary?.connectors ?? [];
  const topAlerts = (alertsData?.alerts ?? []).slice(0, 5);

  const [projectMetrics, setProjectMetrics] = useState<ProjectMetricsResponse | undefined>();
  useEffect(() => {
    projectDashboardApi.metrics(projectId, { time_range: '24h' }).then(r => setProjectMetrics(r.data)).catch(() => {});
  }, [projectId]);

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiLoading || summaryLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : kpiTiles.map(k => (
            <motion.div
              whileHover={{ scale: 1.03, y: -4, boxShadow: `0 12px 32px rgba(0,0,0,0.3), 0 0 12px ${k.color}15` }}
              whileTap={{ scale: 0.98 }}
              key={k.label}
              onClick={k.onClick}
              className="relative rounded-2xl p-4 transition-all duration-300 bg-[var(--app-surface)] border cursor-pointer group shadow-xl overflow-hidden flex flex-col gap-1"
              style={{ 
                borderColor: 'var(--app-border)',
                boxShadow: `inset 0 0 12px ${k.color}10, var(--shadow-md)`
              }}
            >
              <span className="absolute top-4 right-4 flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: k.color }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: k.color }} />
              </span>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest leading-none">{k.label}</span>
                <span className="transition-transform duration-300 group-hover:scale-110" style={{ color: k.color }}>
                  {k.icon}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black leading-none text-[var(--text-primary)]" style={{ color: 'var(--text-primary)' }}>{k.value}</span>
                {k.unit && <span className="text-xs text-[var(--text-secondary)] font-bold">{k.unit}</span>}
              </div>
              
              <div className="text-[9px] font-semibold text-[var(--text-muted)] min-h-[14px] leading-tight">
                {k.change || 'Stable Ingestion'}
              </div>
              <div className="h-8 mt-1 overflow-hidden">
                <Spark data={k.series} color={k.color} height={32} />
              </div>
            </motion.div>
          ))
        }
      </div>

      {/* Health Trend + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Health Index Trend</h3>
              <p className="text-xs text-[var(--text-secondary)]">Live operational scoring metrics</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Last 24 Hours <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>
          {trendsLoading ? (
            <Skeleton className="h-52" />
          ) : trendChartData.length === 0 ? (
            <TabEmpty message="No trend metrics yet." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={trendChartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="htg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#30D158" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#30D158" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--recharts-grid)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={28} />
                  <ReTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, fontSize: 11, color: 'var(--text-primary)' }}
                    formatter={(v: number) => [`${v?.toFixed(1)}%`, 'Health Score']} />
                  <Area type="monotone" dataKey="score" stroke="#30D158" strokeWidth={2} fill="url(#htg)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {[['#30D158', 'Healthy > 90'], ['#FF9F0A', 'Degraded 70–90'], ['#FF453A', 'Critical < 70']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />{l}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Resource Weight Allocation</h3>
          </div>
          {summaryLoading ? (
            <Skeleton className="h-52" />
          ) : !summary ? (
            <TabEmpty message="No weight distribution data yet." />
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <DonutChart value={healthScore ?? 0} breakdown={healthBreakdown} colors={bdColors} />
              <div className="flex-1 space-y-2 w-full">
                {Object.entries(healthBreakdown).map(([name, v], idx) => (
                  <div key={name} className="flex items-center justify-between text-xs py-1 border-b border-[var(--app-border)]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: bdColors[idx % bdColors.length] }} />
                      <span className="text-[var(--text-secondary)] font-semibold truncate">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)] font-bold">({Math.round(v.weight * 100)}%)</span>
                      <span className="font-bold text-[var(--text-primary)]">{v.score}/{v.max_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connectors + Top Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--app-border)]">
            <h3 className="text-sm font-bold text-white tracking-tight">Operational Connectors</h3>
          </div>
          {summaryLoading ? (
            <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : connectorRows.length === 0 ? (
            <div className="p-5"><TabEmpty message="No active connectors." /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--app-bg-subtle)] text-[var(--text-secondary)] uppercase tracking-widest text-[9px]">
                      {['Connector', 'Category', 'Status', 'Last Sync', 'Response', 'Uptime', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {connectorRows.map((row, i) => (
                      <tr key={row.id ?? i} className="hover:bg-[var(--app-surface-hover)] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                              style={{ background: `${row.color || '#30D158'}15`, border: `1px solid ${row.color || '#30D158'}35`, color: row.color || undefined }}>
                              {(row.name || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold text-[var(--text-primary)]">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] capitalize">{row.category ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={row.health_status} />
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] font-mono">
                          {row.last_sync_at ? formatRelative(row.last_sync_at) : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                          {row.last_sync_response_ms != null ? `${row.last_sync_response_ms}ms` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.uptime_percentage != null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[var(--app-bg-muted)] rounded-full overflow-hidden min-w-[50px] border border-[var(--app-border)]">
                                <div className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${row.uptime_percentage}%` }} />
                              </div>
                              <span className="text-[var(--text-secondary)] font-mono font-bold">{row.uptime_percentage}%</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="p-1 rounded-lg text-slate-500 hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)] transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-[var(--app-border)] bg-[var(--app-bg-subtle)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{connectorRows.length} total gateways synchronized</span>
              </div>
            </>
          )}
        </div>

        {/* Top Alerts */}
        <div className="lg:col-span-2 rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--app-border)]">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Active Alerts</h3>
            {alertsData && alertsData.active_count > 0 && (
              <span className="text-xs text-red-400 font-bold animate-pulse">{alertsData.active_count} unresolved</span>
            )}
          </div>
          {topAlerts.length === 0 ? (
            <div className="p-5">
              <TabEmpty message="All systems nominal." />
            </div>
          ) : (
            <div className="divide-y divide-[var(--app-border)]">
              {topAlerts.map(alert => (
                <AlertRow key={alert.id} alert={alert} compact />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health Run Log Section */}
      <HealthRunPanel
        projectId={project.id}
        canManage={canManage}
        onRunComplete={(_run: HealthRunDetail) => onRunComplete()}
      />
    </div>
  );
}

// Donut Chart
function DonutChart({ value, breakdown, colors }: {
  value: number;
  breakdown: Record<string, { score: number; max_score: number; weight: number }>;
  colors: string[];
}) {
  if (Object.keys(breakdown).length === 0) {
    return (
      <div className="flex-shrink-0 w-24 h-24 rounded-full border-8 border-slate-900 flex items-center justify-center">
        <span className="text-lg font-black text-slate-500">—</span>
      </div>
    );
  }
  const size = 100; const r = 38; const circ = 2 * Math.PI * r;
  const total = Object.values(breakdown).reduce((s, v) => s + v.max_score, 0) || 100;
  let offset = 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
        {Object.entries(breakdown).map(([, v], idx) => {
          const pct = (v.max_score / total) * 100;
          const dash = (pct / 100) * circ;
          const gap = circ - dash;
          const rotate = (offset / 100) * 360 - 90;
          offset += pct;
          return (
            <circle key={idx} cx="50" cy="50" r={r} fill="none"
              stroke={colors[idx % colors.length]} strokeWidth="9"
              strokeDasharray={`${dash} ${gap}`}
              transform={`rotate(${rotate} 50 50)`} strokeLinecap="butt" />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-white">{Math.round(value)}</span>
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Index</span>
      </div>
    </div>
  );
}

// StatusPill
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    healthy:     'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20',
    degraded:    'bg-amber-500/12 text-amber-400 border border-amber-500/20',
    down:        'bg-red-500/12 text-red-400 border border-red-500/20',
    error:       'bg-red-500/12 text-red-400 border border-red-500/20',
    timeout:     'bg-orange-500/12 text-orange-400 border border-orange-500/20',
    unknown:     'bg-slate-500/12 text-slate-400 border border-slate-500/20',
    unconfigured:'bg-slate-500/10 text-slate-500 border border-slate-500/10',
  };
  return (
    <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', cfg[status] ?? cfg.unknown)}>
      {status}
    </span>
  );
}

// AlertRow
function AlertRow({ alert, compact = false }: { alert: ProjectAlert; compact?: boolean }) {
  const isCrit = alert.severity === 'critical';
  const isResolved = alert.status === 'resolved';
  return (
    <div className={cn('px-5 py-3.5 hover:bg-white/5 transition-colors', isResolved && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border',
          isResolved ? 'bg-emerald-500/12 border-emerald-500/20' : isCrit ? 'bg-red-500/12 border-red-500/20' : 'bg-amber-500/12 border-amber-500/20')}>
          {isResolved ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            : isCrit ? <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
            : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white truncate">{alert.title}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border',
              isResolved ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20'
                : isCrit ? 'bg-red-500/12 text-red-400 border-red-500/20' : 'bg-amber-500/12 text-amber-400 border-amber-500/20')}>
              {isResolved ? 'Resolved' : alert.severity}
            </span>
          </div>
          {!compact && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              <span className="font-semibold text-slate-300">{alert.service}</span> · {alert.rule}
            </p>
          )}
          {compact && (
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">{alert.service}</p>
          )}
        </div>
        <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 mt-0.5">{alert.time ?? ''}</span>
      </div>
    </div>
  );
}

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

// ─── Metrics Tab Panel ──────────────────────────────────────────────────────
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

  const responseTimeData = (metrics?.run_durations ?? []).map(d => ({
    time: d.timestamp
      ? new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    duration_ms: d.duration_ms,
    score: d.score,
  }));

  const availData = (trends?.availability_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    availability: pt.availability,
  }));

  const incidentData = (trends?.incident_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    incidents: pt.incidents,
  }));

  const scoreData = (trends?.overall_trend ?? []).map(pt => ({
    time: pt.timestamp
      ? new Date(pt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '',
    score: pt.score,
  }));

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
      label: 'SLA Status',
      target: 'Yes',
      actual: sla?.sla_met !== undefined ? (sla.sla_met ? 'Compliant' : 'Deficient') : '—',
      met: sla?.sla_met ?? false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Performance Statistics</h3>
          <p className="text-xs text-[var(--text-secondary)]">Live SLA auditing telemetry</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-[var(--app-bg-muted)] rounded-xl border border-[var(--app-border)] shadow-sm">
          {ranges.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                range === r ? 'bg-[var(--app-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {trendsError || metricsError ? (
        <TabError message="Diagnostic systems returned metric fetch error." />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Health score trend */}
        <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Health Score Trend</h3>
          </div>
          {loading ? <Skeleton className="h-48" /> : scoreData.length === 0 ? (
            <TabEmpty message="No logs for this range." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={scoreData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="stg-met" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#30D158" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#30D158" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={28} />
                <ReTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, fontSize: 11, color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey="score" stroke="#30D158" strokeWidth={2} fill="url(#stg-met)" dot={false} name="Score" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Availability trend */}
        <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Availability Index</h3>
            {availability !== null && (
              <span className="text-xl font-black text-emerald-400">{availability.toFixed(2)}%</span>
            )}
          </div>
          {loading ? <Skeleton className="h-48" /> : availData.length === 0 ? (
            <TabEmpty message="No logs for this range." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={availData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="avg-met" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={28} unit="%" />
                <ReTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, fontSize: 11, color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey="availability" stroke="#0A84FF" strokeWidth={2} fill="url(#avg-met)" dot={false} name="Availability" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Diagnostic Duration */}
        <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Diagnostic Script Latency</h3>
          </div>
          {loading ? <Skeleton className="h-48" /> : responseTimeData.length === 0 ? (
            <TabEmpty message="No latency records." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <ReLineChart data={responseTimeData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={38} unit="ms" />
                <ReTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, fontSize: 11, color: 'var(--text-primary)' }} />
                <Line type="monotone" dataKey="duration_ms" stroke="#FF9F0A" strokeWidth={2} dot={false} name="Latency" />
              </ReLineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Incidents trend */}
        <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Gateway Incident History</h3>
          </div>
          {loading ? <Skeleton className="h-48" /> : incidentData.length === 0 ? (
            <TabEmpty message="No incident records." />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={incidentData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="erg-met" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF453A" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#FF453A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={28} />
                <ReTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, fontSize: 11, color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey="incidents" stroke="#FF453A" strokeWidth={2} fill="url(#erg-met)" dot={false} name="Incidents" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* SLA compliance cards */}
      <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] shadow-sm p-5">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">SLA Compliance Audit</h3>
        {slaLoading ? (
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {slaItems.map((sla, i) => (
              <div key={i} className={cn('rounded-xl p-4 border transition-all', sla.met ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">{sla.label}</span>
                  {sla.met ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className={cn('text-xl font-black', sla.met ? 'text-emerald-400' : 'text-red-400')}>{sla.actual}</div>
                <div className="text-[9px] text-[var(--text-muted)] font-semibold mt-1">Goal target: {sla.target}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Connectors Tab Panel ───────────────────────────────────────────────────
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
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: total,    color: '#0A84FF', icon: <Plug className="w-4 h-4" /> },
          { label: 'Healthy',  value: healthy,  color: '#30D158', icon: <CheckCircle className="w-4 h-4" /> },
          { label: 'Degraded', value: degraded, color: '#FF9F0A', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Down',     value: down,     color: '#FF453A', icon: <AlertCircle className="w-4 h-4" /> },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: s.color + '15', border: `1px solid ${s.color}25` }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-black text-[var(--text-primary)]">{s.value}</div>
              <div className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 shadow-sm">
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Connector Topology Weight</h3>
          <div className="flex h-3 rounded-full overflow-hidden gap-px mb-4 bg-[var(--app-bg-muted)] border border-[var(--app-border)]">
            {[
              { v: healthy,  c: '#30D158' },
              { v: degraded, c: '#FF9F0A' },
              { v: down,     c: '#FF453A' },
              { v: Math.max(0, total - healthy - degraded - down), c: '#8E8E93' },
            ].filter(s => s.v > 0).map((s, i) => (
              <div key={i} className="h-full" style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />
            ))}
          </div>
          <div className="flex items-center gap-6 text-xs font-semibold">
            {[{ l: 'Healthy', v: healthy, c: '#30D158' }, { l: 'Degraded', v: degraded, c: '#FF9F0A' }, { l: 'Down', v: down, c: '#FF453A' }].map(s => (
              <span key={s.l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.c }} />
                <span className="text-[var(--text-secondary)]">{s.l}</span>
                <span className="font-bold text-[var(--text-primary)]">{s.v}</span>
                <span className="text-[var(--text-muted)]">({total > 0 ? Math.round(s.v / total * 100) : 0}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <ProjectConnectorsTab projectId={project.id} canManage={canManage} />
    </div>
  );
}

// ─── Alerts Tab Panel ───────────────────────────────────────────────────────
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
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Incidents', value: data?.active_count ?? 0,   color: '#FF453A', icon: <Bell className="w-4 h-4" /> },
          { label: 'Critical',       value: data?.critical_count ?? 0, color: '#dc2626', icon: <AlertOctagon className="w-4 h-4" /> },
          { label: 'Warning',        value: data?.warning_count ?? 0,  color: '#FF9F0A', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Resolved (24h)', value: data?.resolved_24h ?? 0,   color: '#30D158', icon: <CheckCircle className="w-4 h-4" /> },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.color + '15', border: `1px solid ${s.color}25` }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-black text-[var(--text-primary)]">{s.value}</div>
              <div className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--app-border)]">
          <div className="flex items-center gap-1 p-1 bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl">
            {(['all', 'critical', 'warning', 'resolved'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize',
                  filter === f ? 'bg-[var(--app-surface-active)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : error ? (
          <div className="p-5"><TabError message="Failed to load diagnostic alert records." /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><TabEmpty message={filter === 'all' ? 'No incident logs found.' : `No ${filter} alerts.`} /></div>
        ) : (
          <div className="divide-y divide-[var(--app-border)]">
            {filtered.map(alert => (
              <div key={alert.id} className={cn('px-5 py-4 hover:bg-[var(--app-surface-hover)] transition-colors', alert.status === 'resolved' && 'opacity-50')}>
                <div className="flex items-start gap-4">
                  <div className={cn('mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border',
                    alert.status === 'resolved' ? 'bg-emerald-500/12 border-emerald-500/20' : alert.severity === 'critical' ? 'bg-red-500/12 border-red-500/20' : 'bg-amber-500/12 border-amber-500/20')}>
                    {alert.status === 'resolved' ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                      : alert.severity === 'critical' ? <AlertOctagon className="w-4 h-4 text-red-500" />
                      : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text-primary)]">{alert.title}</span>
                      <span className={cn('px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-wider',
                        alert.status === 'resolved' ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20'
                          : alert.severity === 'critical' ? 'bg-red-500/12 text-red-400 border-red-500/20' : 'bg-amber-500/12 text-amber-400 border-amber-500/20')}>
                        {alert.status === 'resolved' ? 'Resolved' : alert.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span className="font-semibold text-slate-300">{alert.service}</span>
                      <span>·</span><span>{alert.rule}</span>
                      {alert.current && <><span>·</span><span>Current: <strong className={alert.status==='resolved'?'text-emerald-400':alert.severity==='critical'?'text-red-400':'text-amber-400'}>{alert.current}</strong></span></>}
                    </div>
                    {alert.error && (
                      <div className="mt-2 text-xs text-red-400 font-mono bg-red-950/20 p-2 rounded-lg border border-red-500/10 truncate">{alert.error}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 font-mono text-[10px] text-slate-500">
                    <div>{alert.time ?? ''}</div>
                    {alert.duration && <div className="mt-0.5">Duration: {alert.duration}</div>}
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

// ─── Configurations Tab Panel ───────────────────────────────────────────────
function ConfigurationsTab({ project, lob, canManage }: { project: Project; lob: Lob | null; canManage: boolean }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProjectDashboardSummary | undefined>();
  useEffect(() => {
    projectDashboardApi.summary(project.id).then(r => setSummary(r.data)).catch(() => {});
  }, [project.id]);

  const infoRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Project GUID', value: <span className="font-mono text-xs text-slate-400 select-all">{project.id}</span> },
    { label: 'Display Name', value: <span className="font-bold text-white">{project.name}</span> },
    { label: 'Git Slug',     value: <span className="font-mono text-xs text-slate-400">{project.slug}</span> },
    { label: 'Environment',  value: <span className="capitalize font-semibold text-white">{project.environment}</span> },
    { label: 'Status',       value: <StatusBadge status={project.status} size="xs" /> },
    { label: 'LOB Owner',    value: lob ? <span className="font-bold text-cyan-400">{lob.name}</span> : '—' },
    { label: 'Scrum Team',   value: project.team_name ? <span className="font-semibold text-slate-300">{project.team_name}</span> : '—' },
    { label: 'Sub-Components', value: <span className="font-bold text-white">{summary?.total_connectors ?? project.connector_count}</span> },
    {
      label: 'Created Timestamp',
      value: <span className="font-mono text-xs text-slate-400">{new Date(project.created_at).toLocaleDateString()}</span>,
    },
  ];

  const total = summary?.total_connectors ?? project.connector_count;
  const healthy = summary?.healthy_connectors ?? project.healthy_count;
  const degraded = summary?.degraded_connectors ?? project.degraded_count;
  const down = summary?.down_connectors ?? project.down_count;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />Meta Configuration Details
            </h3>
          </div>
          <div className="space-y-0 divide-y divide-[var(--app-border)]">
            {infoRows.map(r => (
              <div key={r.label} className="flex items-center justify-between gap-2 text-xs py-3">
                <span className="text-[var(--text-secondary)] font-semibold uppercase tracking-wider">{r.label}</span>
                <div className="text-right">{r.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />Admin Command Console
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Analyze Metrics Trend', icon: <LineChart className="w-4 h-4" />, action: () => navigate(`/projects/${project.id}/dashboards`) },
                { label: 'View Health Check Board', icon: <BarChart2 className="w-4 h-4" />, action: () => navigate(`/projects/${project.id}/health-dashboard`) },
                { label: 'Verify Runtime Drift',   icon: <Activity className="w-4 h-4" />, action: () => navigate(`/projects/${project.id}/app-runtime`) },
              ].map((a, i) => (
                <button key={i} onClick={a.action}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] bg-[var(--app-bg)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] transition-all text-left shadow-sm">
                  <span className="text-[var(--text-secondary)]">{a.icon}</span>
                  {a.label}
                  <ChevronRight className="w-4 h-4 ml-auto text-[var(--text-secondary)]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Tab Panel ─────────────────────────────────────────────────────
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
    time: log.created_at ? new Date(log.created_at).toLocaleString() : '',
    status: 'success' as const,
  }));

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
    <div className="space-y-6">
      <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Diagnostic Runs (Last 7 Days)</h3>
        </div>
        {activityLoading ? (
          <Skeleton className="h-40" />
        ) : activityError ? (
          <TabError message="Failed to load diagnostic activities." />
        ) : chartData.length === 0 ? (
          <TabEmpty message="No diagnostic actions performed yet." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--recharts-grid)" />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={28} />
                <ReTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, fontSize: 11, color: 'var(--text-primary)' }} />
                <Bar dataKey="runs"   fill="#0A84FF" radius={[4, 4, 0, 0]} name="Runs" />
                <Bar dataKey="errors" fill="#FF453A" radius={[4, 4, 0, 0]} name="Errors" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />Health Runs</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />Errors</span>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--app-border)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--text-secondary)]" />Platform Diagnostic Logs
          </h3>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs pl-7 pr-3 py-1.5 border bg-[var(--app-bg)] border-[var(--app-border)] text-[var(--text-primary)] rounded-lg outline-none focus:ring-1 focus:ring-[var(--app-border-medium)] w-44 font-semibold"
              placeholder="Filter logs…"
            />
          </div>
        </div>
        {(activityLoading || auditLoading) ? (
          <div className="space-y-2 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><TabEmpty message="No logs found." /></div>
        ) : (
          <div className="divide-y divide-[var(--app-border)]">
            {filtered.slice(0, 30).map((log, i) => (
              <div key={log.id ?? i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--app-surface-hover)] transition-colors text-xs font-semibold">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border',
                  log.status === 'success' ? 'bg-emerald-500/12 border-emerald-500/20' : log.status === 'error' ? 'bg-red-500/12 border-red-500/20' : 'bg-amber-500/12 border-amber-500/20')}>
                  {log.status === 'success' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    : log.status === 'error' ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{log.action}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="text-[var(--text-secondary)] truncate">{log.resource}</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">{log.user}</div>
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] font-mono flex-shrink-0">{log.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
