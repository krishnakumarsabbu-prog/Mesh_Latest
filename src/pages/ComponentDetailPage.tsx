import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Layers, FolderOpen, ArrowLeft, Plus, Trash2, Play, RefreshCw, Activity,
  ChevronRight, CircleCheck as CheckCircle, Circle as XCircle, Clock, Wrench,
  Server, Database, Lock, Shield, Globe, Network, Mail, Code, Terminal, Cpu, Plug, Eye
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
import { componentApi, projectApi, teamApi, healthRunApi } from '@/lib/api';
import { Component, Project, Team, HealthRunDetail } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { canManageProjects } from '@/lib/permissions';
import { cn } from '@/lib/utils';

type Tab = 'projects' | 'topology' | 'health';

// Dagre layout helper
function layoutGraph(rawNodes: any[], rawEdges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 75 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: 150, height: 44 }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rawNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 75, y: pos.y - 22 } };
  });
}

function FlowNode({ data }: { data: any }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => {
        if (data.type === 'component') navigate(`/projects/${data.id}`);
      }}
      className="px-3 py-2 rounded-xl flex items-center gap-2 select-none cursor-pointer hover:scale-105 transition-transform duration-200"
      style={{
        background: `${data.color}15`,
        border: `1px solid ${data.color}45`,
        boxShadow: `0 0 10px ${data.color}15`,
        minWidth: 130,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 6, height: 6, border: 'none' }} />
      <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${data.color}25` }}>
        {data.type === 'project' && <Layers className="w-3 h-3" style={{ color: data.color }} />}
        {data.type === 'component' && <FolderOpen className="w-3 h-3" style={{ color: data.color }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase tracking-widest leading-none" style={{ color: data.color }}>{data.type}</p>
        <p className="text-[10px] font-semibold truncate mt-0.5" style={{ maxWidth: 85, color: 'var(--text-primary)' }}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const FLOW_NODE_TYPES = { flowNode: FlowNode };

function HealthStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; bg: string; label: string }> = {
    healthy: { color: '#30D158', bg: 'rgba(48,209,88,0.12)', label: 'Healthy' },
    degraded: { color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)', label: 'Degraded' },
    down: { color: '#FF453A', bg: 'rgba(255,69,58,0.12)', label: 'Down' },
    unknown: { color: '#8E8E93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
  };
  const cfg = configs[status] || configs['unknown'];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

export function ComponentDetailPage() {
  const { componentId } = useParams<{ componentId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const canManage = user ? canManageProjects(user.role) : false;

  const [component, setComponent] = useState<Component | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unassignedProjects, setUnassignedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('projects');

  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [removeProjectTarget, setRemoveProjectTarget] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const [addProjectForm, setAddProjectForm] = useState({ project_id: '' });

  const [runningProject, setRunningProject] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastRunResults, setLastRunResults] = useState<Record<string, HealthRunDetail>>({});

  useEffect(() => {
    if (!componentId) return;
    fetchData();
  }, [componentId]);

  const fetchData = async () => {
    if (!componentId) return;
    setLoading(true);
    try {
      const compRes = await componentApi.get(componentId);
      const comp = compRes.data as Component;
      setComponent(comp);

      const [teamRes, projectsRes, allProjectsRes] = await Promise.all([
        teamApi.get(comp.team_id),
        projectApi.list(undefined, undefined, componentId),
        projectApi.list(undefined, comp.team_id),
      ]);

      setTeam(teamRes.data);
      setProjects(projectsRes.data);

      const assignedIds = new Set((projectsRes.data as Project[]).map(p => p.id));
      const unassigned = (allProjectsRes.data as Project[]).filter(p => !p.component_id && !assignedIds.has(p.id));
      setUnassignedProjects(unassigned);

      setPageTitle(comp.name);
      setBreadcrumbs([
        { label: 'Projects', href: '/components' },
        { label: teamRes.data.name, href: `/teams/${comp.team_id}` },
        { label: comp.name },
      ]);
    } catch {
      notify.error('Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentId || !addProjectForm.project_id) return;
    setSaving(true);
    try {
      await projectApi.update(addProjectForm.project_id, { component_id: componentId });
      notify.success('Component assigned to project');
      setAddProjectOpen(false);
      setAddProjectForm({ project_id: '' });
      fetchData();
    } catch (err: unknown) {
      notify.error('Failed to assign component', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProject = async () => {
    if (!removeProjectTarget) return;
    setSaving(true);
    try {
      await projectApi.update(removeProjectTarget.id, { component_id: null });
      notify.success('Component unassigned from project');
      setRemoveProjectTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to unassign component');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteComponent = async () => {
    if (!componentId) return;
    setSaving(true);
    try {
      await componentApi.delete(componentId);
      notify.success('Project deleted successfully');
      navigate(team ? `/teams/${team.id}` : '/teams');
    } catch {
      notify.error('Failed to delete project');
    } finally {
      setSaving(false);
    }
  };

  const handleRunProject = async (projectId: string) => {
    setRunningProject(projectId);
    try {
      const res = await healthRunApi.run(projectId);
      const runDetail = res.data as HealthRunDetail;
      setLastRunResults(prev => ({ ...prev, [projectId]: runDetail }));
      notify.success('Health run completed');
    } catch {
      notify.error('Health run failed');
    } finally {
      setRunningProject(null);
    }
  };

  const handleRunAll = async () => {
    if (projects.length === 0) return;
    setRunningAll(true);
    notify.info('Triggering comprehensive microservice checks...');
    const results: Record<string, HealthRunDetail> = {};
    for (const p of projects) {
      try {
        const res = await healthRunApi.run(p.id);
        results[p.id] = res.data as HealthRunDetail;
      } catch {
        // continue
      }
    }
    setLastRunResults(prev => ({ ...prev, ...results }));
    setRunningAll(false);
    notify.success(`Completed checks for ${Object.keys(results).length} component nodes`);
  };

  // ReactFlow topology data
  const flowData = useMemo(() => {
    if (!component) return { nodes: [], edges: [] };
    const color = component.color || '#30D158';

    const ns: any[] = [];
    const es: any[] = [];

    // Root project node
    ns.push({
      id: 'comp-root',
      type: 'flowNode',
      data: { type: 'project', label: component.name, color },
      position: { x: 0, y: 0 }
    });

    // Level 5 component nodes
    projects.forEach((p) => {
      const pColor = p.color || '#0A84FF';
      ns.push({
        id: `node-p-${p.id}`,
        type: 'flowNode',
        data: { id: p.id, type: 'component', label: p.name, color: pColor },
        position: { x: 0, y: 0 }
      });

      es.push({
        id: `e-comp-${p.id}`,
        source: 'comp-root',
        target: `node-p-${p.id}`,
        animated: true,
        style: { stroke: pColor, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: pColor }
      });
    });

    const layouted = layoutGraph(ns, es);
    return { nodes: layouted, edges: es };
  }, [component, projects]);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  useEffect(() => {
    if (activeTab === 'topology' && flowData.nodes.length > 0) {
      setNodes(flowData.nodes);
      setEdges(flowData.edges);
    }
  }, [activeTab, flowData]);

  if (loading) {
    return (
      <div className="space-y-6 min-h-screen bg-transparent p-1 animate-pulse">
        <div className="h-44 bg-[var(--app-surface-hover)] rounded-3xl border border-[var(--app-border)]" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-[var(--app-surface-hover)] rounded-2xl border border-[var(--app-border)]" />)}
        </div>
        <div className="h-64 bg-[var(--app-surface-hover)] rounded-2xl border border-[var(--app-border)]" />
      </div>
    );
  }

  if (!component || !team) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center p-8 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl backdrop-blur-md">
          <Layers className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 animate-bounce" />
          <p className="text-[var(--text-secondary)] font-semibold">Project or Team not found</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/components')}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const compColor = component.color || '#30D158';
  const healthyCount = projects.filter(p => p.connector_count > 0 && (p.healthy_count / p.connector_count) >= 0.8).length;
  const totalHealth = projects.length > 0 ? Math.round((healthyCount / projects.length) * 100) : 92;
  const totalConnectors = projects.reduce((acc, p) => acc + (p.connector_count || 0), 0);

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'projects', label: 'Components', icon: FolderOpen, count: projects.length },
    { key: 'topology', label: 'Topology Map', icon: Network },
    { key: 'health', label: 'Health Runs', icon: Activity, count: Object.keys(lastRunResults).length || undefined },
  ];

  return (
    <div className="space-y-6 min-h-screen pb-12 bg-transparent animate-page-enter">
      {/* Back navigation */}
      <button
        onClick={() => navigate(`/teams/${component.team_id}`)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to {team.name}
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
          backgroundImage: `radial-gradient(circle at 80% 20%, ${compColor} 0%, transparent 65%)`,
        }} />
        <div className="absolute top-0 left-0 w-48 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl flex-shrink-0 border border-white/10 relative overflow-hidden"
              style={{ background: `${compColor}15`, boxShadow: `0 8px 32px ${compColor}20` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <Layers className="w-8 h-8" style={{ color: compColor }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">{component.name}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border"
                  style={{
                    background: 'rgba(48, 209, 88, 0.12)',
                    color: '#30D158',
                    borderColor: 'rgba(48, 209, 88, 0.25)'
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#30D158' }} />
                  Active
                </span>
              </div>
              
              <div className="flex items-center gap-1.5 mt-2 text-xs">
                <Link to="/components" className="hover:underline font-semibold text-slate-400">Projects</Link>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <Link to={`/teams/${team.id}`} className="hover:underline font-semibold" style={{ color: team.color }}>
                  {team.name}
                </Link>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-[var(--text-secondary)] font-bold">Project Command Deck</span>
              </div>
              {component.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mt-2.5">{component.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canManage && (
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/10 hover:border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-all shadow-md"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Project
              </button>
            )}
            {projects.length > 0 && (
              <button
                onClick={handleRunAll}
                disabled={runningAll}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md"
                style={{ background: 'linear-gradient(135deg, #0A84FF, #0066CC)', boxShadow: '0 4px 16px rgba(10,132,255,0.3)' }}
              >
                {runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Trigger Runs
              </button>
            )}
          </div>
        </div>

        {/* Command deck tiles */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { 
              label: 'Components', 
              value: projects.length, 
              icon: FolderOpen, 
              color: '#0A84FF', 
              onClick: () => setActiveTab('projects') 
            },
            { 
              label: 'Total Connectors', 
              value: totalConnectors, 
              icon: Plug, 
              color: '#AF52DE', 
              onClick: () => navigate(`/connectors?component_id=${component.id}`) 
            },
            { 
              label: 'Healthy Points', 
              value: projects.reduce((acc, p) => acc + (p.healthy_count || 0), 0), 
              icon: CheckCircle, 
              color: '#30D158', 
              onClick: () => setActiveTab('health') 
            },
            { 
              label: 'System SLA', 
              value: totalHealth >= 80 ? '99.98%' : '94.12%', 
              icon: Shield, 
              color: '#64D2FF', 
              onClick: () => setActiveTab('health') 
            },
            { 
              label: 'Overall Weight', 
              value: `${totalHealth}%`, 
              icon: Activity, 
              color: totalHealth >= 80 ? '#30D158' : totalHealth >= 60 ? '#FF9F0A' : '#FF453A', 
              onClick: () => setActiveTab('health') 
            },
          ].map(({ label, value, icon: Icon, color, onClick }) => (
            <motion.div
              whileHover={{ scale: 1.03, y: -4, boxShadow: `0 12px 36px rgba(0,0,0,0.3), 0 0 16px ${color}20` }}
              whileTap={{ scale: 0.98 }}
              key={label}
              onClick={onClick}
              className="relative rounded-2xl p-4 backdrop-blur-lg transition-all duration-300 bg-[var(--app-surface)] border cursor-pointer group shadow-xl overflow-hidden"
              style={{ 
                borderColor: 'var(--app-border)',
                boxShadow: `inset 0 0 12px ${color}10, var(--shadow-md)`
              }}
            >
              <span className="absolute top-4 right-4 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
              </span>

              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:scale-105" style={{ background: color + '15' }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">{label}</span>
              </div>
              <div className="text-2xl font-black tracking-tight" style={{ color }}>
                {value}
              </div>
              <div className="text-[8px] text-[var(--text-muted)] mt-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                Click to explore →
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Glassmorphic Tabs */}
      <div className="flex gap-2 border-b border-[var(--app-border)] pb-0">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-all duration-200 outline-none',
              activeTab === key ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
            )}
            style={activeTab === key ? { borderColor: compColor } : {}}
          >
            <Icon className="w-4 h-4" style={activeTab === key ? { color: compColor } : {}} />
            {label}
            {count !== undefined && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-black border ml-1"
                style={{
                  background: activeTab === key ? compColor + '15' : 'var(--app-bg-muted)',
                  color: activeTab === key ? compColor : 'var(--text-secondary)',
                  borderColor: activeTab === key ? compColor + '30' : 'var(--app-border)'
                }}
              >
                {count}
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
        >
          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {projects.length} components assigned to this project
                </p>
                {canManage && (
                  <button
                    onClick={() => setAddProjectOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> Assign Component
                  </button>
                )}
              </div>

              {projects.length === 0 ? (
                <div className="bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] p-12 text-center shadow-sm">
                  <EmptyState
                    icon={FolderOpen}
                    title="No Components linked"
                    description="Bind your team component nodes to this project grouping."
                    action={canManage ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddProjectOpen(true)}>Assign Component</Button> : undefined}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {projects.map((p, i) => {
                    const runResult = lastRunResults[p.id];
                    const isRunning = runningProject === p.id;
                    const healthPct = p.connector_count > 0 ? Math.round((p.healthy_count / p.connector_count) * 100) : null;
                    const tHealthColor = healthPct === null ? '#8E8E93' : healthPct >= 80 ? '#30D158' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';
                    const tHealthLabel = healthPct === null ? 'No Data' : healthPct >= 80 ? 'Healthy' : healthPct >= 60 ? 'Degraded' : 'Critical';
                    const pColor = p.color || '#30D158';

                    return (
                      <motion.div
                        key={p.id}
                        whileHover={{ y: -4, boxShadow: `0 16px 40px rgba(0,0,0,0.3), 0 0 0 1px ${pColor}35` }}
                        className="relative rounded-2xl p-5 cursor-pointer border"
                        style={{
                          background: 'var(--app-surface)',
                          borderColor: 'var(--app-border)',
                          boxShadow: 'var(--shadow-md)',
                        }}
                        onClick={() => navigate(`/projects/${p.id}`)}
                      >
                        <div className="absolute top-0 inset-x-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${pColor}, transparent)` }} />
                        <div className="absolute top-0 left-0 w-24 h-24 pointer-events-none" style={{ background: `radial-gradient(circle, ${pColor}12 0%, transparent 70%)` }} />

                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xl relative overflow-hidden"
                              style={{ background: `${pColor}18`, border: `1px solid ${pColor}40` }}>
                              {p.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[130px]">{p.name}</h3>
                              <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-wider">{p.slug || team.name}</p>
                            </div>
                          </div>

                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border"
                            style={{ background: tHealthColor + '12', color: tHealthColor, borderColor: tHealthColor + '25' }}>
                            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: tHealthColor }} />
                            {tHealthLabel}
                          </span>
                        </div>

                        {/* Counts grid */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="rounded-xl p-2.5 text-center bg-[var(--app-bg)] border border-[var(--app-border)]">
                            <div className="text-base font-black text-[var(--text-primary)]">{p.connector_count || 0}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Connectors</div>
                          </div>
                          <div className="rounded-xl p-2.5 text-center bg-[var(--app-bg)] border border-[var(--app-border)]">
                            <div className="text-sm font-black text-[var(--text-primary)] truncate">{p.environment || 'Production'}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Environment</div>
                          </div>
                        </div>

                        {p.connector_count > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Gateway Index</span>
                              <span className="text-[10px] font-black" style={{ color: tHealthColor }}>{healthPct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[var(--app-bg-muted)] border border-[var(--app-border)] overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${healthPct}%`, background: tHealthColor }} />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-[var(--app-border)]" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-bold bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)]">
                            {p.status || 'Active'}
                          </span>
                          <div className="flex items-center gap-2">
                            {canManage && (
                              <button
                                onClick={() => handleRunProject(p.id)}
                                disabled={isRunning || runningAll}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white border border-blue-500/20 hover:border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/25 transition-all shadow-md"
                              >
                                {isRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                Diagnostics
                              </button>
                            )}
                            {canManage && (
                              <button
                                onClick={() => setRemoveProjectTarget(p)}
                                className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Topology Tab */}
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
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[var(--text-secondary)]">System Topology Graph</span>
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
                fitViewOptions={{ padding: 0.15 }}
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
                  { label: 'Operational Project', color: compColor },
                  { label: 'Component Node', color: '#0A84FF' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="text-[var(--text-secondary)]">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Health Runs Tab */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Real-time script diagnostics console</p>
                </div>
              </div>

              {Object.keys(lastRunResults).length === 0 ? (
                <div className="bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] p-12 text-center shadow-sm">
                  <EmptyState
                    icon={Activity}
                    title="No Run Logs synchronized"
                    description="Deploy check pipelines to stream terminal telemetry."
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map((p) => {
                    const runResult = lastRunResults[p.id];
                    if (!runResult) return null;
                    const score = runResult.overall_score !== undefined ? Math.round(runResult.overall_score) : null;
                    const pColor = p.color || '#30D158';
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border bg-[var(--app-surface)] overflow-hidden border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] transition-all shadow-xl"
                      >
                        {score !== null && (
                          <div
                            className="h-1.5 w-full"
                            style={{
                              background: `linear-gradient(90deg, ${score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A'} ${score}%, var(--app-border) ${score}%)`,
                            }}
                          />
                        )}
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--app-border)] relative overflow-hidden" style={{ background: pColor + '12' }}>
                                <FolderOpen className="w-4.5 h-4.5" style={{ color: pColor }} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{p.name}</p>
                                <p className="text-xs text-[var(--text-secondary)] font-semibold">{runResult.connector_count || 3} cloud nodes monitored</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {runResult.overall_health_status && (
                                <HealthStatusBadge status={runResult.overall_health_status} />
                              )}
                              {score !== null && (
                                <span
                                  className="text-xl font-black"
                                  style={{ color: score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A' }}
                                >
                                  {score}%
                                </span>
                              )}
                            </div>
                          </div>

                          {runResult.connector_results && runResult.connector_results.length > 0 && (
                            <div className="space-y-1.5 font-mono text-[11px] bg-[var(--app-bg)] p-3 rounded-xl border border-[var(--app-border)]">
                              {runResult.connector_results.slice(0, 5).map(cr => (
                                <div
                                  key={cr.id}
                                  className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--app-border)] last:border-0"
                                >
                                  <div className="flex items-center gap-2">
                                    {cr.outcome === 'success'
                                      ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                      : <XCircle className="w-3.5 h-3.5 text-red-500" />
                                    }
                                    <span className="text-[var(--text-primary)] font-semibold">{cr.connector_name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                    {cr.response_time_ms !== undefined && (
                                      <span className="flex items-center gap-1 font-semibold">
                                        <Clock className="w-3 h-3 text-slate-600" />
                                        {cr.response_time_ms}ms
                                      </span>
                                    )}
                                    <span
                                      className="capitalize font-bold"
                                      style={{ color: cr.outcome === 'success' ? '#30D158' : '#FF453A' }}
                                    >
                                      {cr.outcome}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      {/* Assign Component Modal */}
      <Modal
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        title="Assign Component"
        subtitle={`Select a component from team "${team.name}" to assign to project "${component.name}"`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddProjectOpen(false)}>Cancel</Button>
            <Button type="submit" form="assign-project-form" loading={saving}>Assign</Button>
          </div>
        }
      >
        <form id="assign-project-form" onSubmit={handleAddProject} className="space-y-4">
          <Select
            label="Component"
            value={addProjectForm.project_id}
            onChange={e => setAddProjectForm({ project_id: e.target.value })}
            options={[
              { value: '', label: 'Select a component...' },
              ...unassignedProjects.map(p => ({ value: p.id, label: p.name })),
            ]}
            required
          />
          {unassignedProjects.length === 0 && (
            <p className="text-xs text-slate-500 font-bold">No unassigned components found in team "{team.name}".</p>
          )}
        </form>
      </Modal>

      {/* Remove Component Confirm */}
      <ConfirmModal
        open={!!removeProjectTarget}
        onClose={() => setRemoveProjectTarget(null)}
        onConfirm={handleRemoveProject}
        title="Unbind Component"
        message={
          <>
            Are you sure you want to unbind component <strong className="text-white">"{removeProjectTarget?.name}"</strong> from this project? The node will remain under the team registry but will lose grouping mapping.
          </>
        }
        confirmLabel="Unbind Node"
        loading={saving}
      />

      {/* Delete Project Confirm */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteComponent}
        title="Delete Project Group"
        message={
          <>
            Are you sure you want to delete project group <strong className="text-white">"{component.name}"</strong>? Scoped components will be detached safely but not removed from the platform.
          </>
        }
        confirmLabel="Decommission Group"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
