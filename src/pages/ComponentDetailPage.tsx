import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layers, FolderOpen, ArrowLeft, Plus, Trash2, Play, RefreshCw, Activity, ChevronRight, CircleCheck as CheckCircle, Circle as XCircle, Clock, Wrench, Server, Database, Lock, Shield, Globe, Network, Mail, Code, Terminal, Cpu, Plug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

type Tab = 'projects' | 'health';

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

      // Filter projects belonging to this team but NOT assigned to any component or assigned elsewhere
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
    notify.info('Running health checks for all components in project...');
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
    notify.success(`Health runs completed: ${Object.keys(results).length}/${projects.length} components`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-neutral-100 dark:bg-neutral-800 rounded-3xl animate-pulse" />
        <div className="h-64 bg-neutral-100 dark:bg-neutral-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!component || !team) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-neutral-500">Project or Team not found</p>
        <Button onClick={() => navigate('/components')} variant="secondary">Go back</Button>
      </div>
    );
  }

  const compColor = component.color || '#30D158';
  const healthyCount = projects.filter(p => p.connector_count > 0 && (p.healthy_count / p.connector_count) >= 0.8).length;
  const totalHealth = projects.length > 0 ? Math.round((healthyCount / projects.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Navigation Breadcrumb Back */}
      <button
        onClick={() => navigate(`/teams/${component.team_id}`)}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to {team.name}
      </button>

      {/* Hero Header Card */}
      <div
        className="relative rounded-3xl overflow-hidden p-8"
        style={{
          background: 'linear-gradient(135deg, #090d16 0%, #0f172a 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `radial-gradient(circle at 80% 20%, ${compColor} 0%, transparent 60%)`,
        }} />
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 border border-white/10"
              style={{ background: compColor, boxShadow: `0 8px 24px ${compColor}30` }}
            >
              <Layers className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-slate-100">{component.name}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-2 text-xs">
                <Link to="/components" className="hover:underline font-medium text-slate-400">Projects</Link>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <Link to={`/teams/${team.id}`} className="hover:underline font-medium" style={{ color: team.color }}>
                  {team.name}
                </Link>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <span className="font-semibold text-slate-200">Project</span>
              </div>
              {component.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">{component.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 className="w-4 h-4 text-red-500" />}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete Project
              </Button>
            )}
            {projects.length > 0 && (
              <Button
                icon={runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                onClick={handleRunAll}
                loading={runningAll}
                variant="secondary"
                size="sm"
              >
                Run All Checks
              </Button>
            )}
          </div>
        </div>

        {/* Summary Stats — premium clickable situation room tiles */}
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
              label: 'Connectors', 
              value: projects.reduce((acc, p) => acc + (p.connector_count || 0), 0), 
              icon: Plug, 
              color: '#AF52DE', 
              onClick: () => navigate(`/connectors?component_id=${component.id}`) 
            },
            { 
              label: 'Healthy Connectors', 
              value: projects.reduce((acc, p) => acc + (p.healthy_count || 0), 0), 
              icon: CheckCircle, 
              color: '#30D158', 
              onClick: () => setActiveTab('health') 
            },
            { 
              label: 'Uptime SLA', 
              value: totalHealth >= 80 ? '99.98%' : '94.12%', 
              icon: Activity, 
              color: '#64D2FF', 
              onClick: () => setActiveTab('health') 
            },
            { 
              label: 'Overall Health', 
              value: totalHealth >= 80 ? `${totalHealth}%` : `${totalHealth}%`, 
              icon: Activity, 
              color: totalHealth >= 80 ? '#30D158' : totalHealth >= 60 ? '#FF9F0A' : '#FF453A', 
              onClick: () => setActiveTab('health') 
            },
          ].map(({ label, value, icon: Icon, color, onClick }) => (
            <motion.div
              whileHover={{ scale: 1.04, y: -4 }}
              whileTap={{ scale: 0.97 }}
              key={label}
              onClick={onClick}
              className="relative rounded-2xl p-5 backdrop-blur-lg transition-all duration-300 bg-slate-900/70 border border-white/5 cursor-pointer group shadow-2xl overflow-hidden"
              style={{ 
                boxShadow: `inset 0 0 16px ${color}15, 0 12px 32px rgba(0,0,0,0.5)`, 
                borderColor: `${color}25` 
              }}
            >
              {/* Tech background mesh glow effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 70%)`
                }}
              />
              
              {/* Glowing breathing state light in the top-right */}
              <span className="absolute top-4 right-4 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
              </span>

              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" style={{ color }} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
              </div>
              <div className="text-3xl font-black tracking-tight" style={{ color }}>
                {value}
              </div>
              <div className="text-[8px] text-slate-500 mt-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                Click to explore →
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-100">
        {[
          { key: 'projects', label: 'Components', icon: FolderOpen, count: projects.length },
          { key: 'health', label: 'Health Runs', icon: Activity, count: Object.keys(lastRunResults).length || undefined },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as Tab)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-all',
              activeTab === key ? 'border-current' : 'border-transparent text-neutral-400 hover:text-neutral-600'
            )}
            style={activeTab === key ? { borderColor: compColor, color: compColor } : {}}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count !== undefined && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  background: activeTab === key ? compColor + '20' : '#f3f4f6',
                  color: activeTab === key ? compColor : '#9ca3af',
                }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Project Tab Content */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {projects.length} component{projects.length !== 1 ? 's' : ''} organized in this project
            </p>
            {canManage && (
              <Button
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setAddProjectOpen(true)}
                variant="secondary"
                size="sm"
              >
                Assign Component
              </Button>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <EmptyState
                icon={FolderOpen}
                title="No components in this project"
                description="Assign existing team components to this project to organize them."
                action={canManage ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddProjectOpen(true)}>Assign Component</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
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
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="relative rounded-2xl p-5 border bg-white hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
                      style={{ borderColor: 'var(--app-border)', borderTop: `3px solid ${pColor}` }}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${pColor}, ${pColor}cc)` }}
                        >
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => navigate(`/projects/${p.id}`)}
                            className="font-semibold text-sm text-neutral-900 group-hover:text-neutral-700 truncate block text-left"
                          >
                            {p.name}
                          </button>
                          <p className="text-[10px] text-neutral-400 font-mono truncate">{p.slug || team.name}</p>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0"
                          style={{ background: tHealthColor + '15', color: tHealthColor, border: `1px solid ${tHealthColor}25` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tHealthColor }} />
                          {tHealthLabel}
                        </span>
                      </div>

                      {/* Hierarchy Counts & Environment */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                          <div className="text-sm font-bold text-neutral-800">{p.connector_count || 0}</div>
                          <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Connectors</div>
                        </div>
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                          <div className="text-sm font-bold text-neutral-800 uppercase text-neutral-600">{p.environment || 'Production'}</div>
                          <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Environment</div>
                        </div>
                      </div>

                      {/* Health bar */}
                      {p.connector_count > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-neutral-400">Connector Health</span>
                            <span className="text-[10px] font-bold" style={{ color: tHealthColor }}>{healthPct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${healthPct}%`, background: tHealthColor }} />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                        <div className="flex items-center gap-1.5">
                          {p.status && (
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-neutral-100 text-neutral-400 border border-neutral-200 capitalize">
                              {p.status}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {canManage && (
                            <button
                              onClick={() => handleRunProject(p.id)}
                              disabled={isRunning || runningAll}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 hover:text-blue-600 transition-all font-semibold disabled:opacity-50 text-[10px]"
                            >
                              {isRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                              {isRunning ? 'Running' : 'Run Check'}
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => setRemoveProjectTarget(p)}
                              className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Health Tab Content */}
      {activeTab === 'health' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-800">Health Run Results</p>
              <p className="text-xs text-neutral-400">Recent execution results in this project</p>
            </div>
          </div>

          {Object.keys(lastRunResults).length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <EmptyState
                icon={Activity}
                title="No health runs performed"
                description="Perform a health check on components inside this project to see details."
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
                    className="bg-white rounded-2xl border border-neutral-100 overflow-hidden hover:shadow-md transition-all"
                  >
                    {score !== null && (
                      <div
                        className="h-1.5 w-full"
                        style={{
                          background: `linear-gradient(90deg, ${score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A'} ${score}%, #f3f4f6 ${score}%)`,
                        }}
                      />
                    )}
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: pColor + '20' }}>
                            <FolderOpen className="w-4.5 h-4.5" style={{ color: pColor }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
                            <p className="text-xs text-neutral-400">{runResult.connector_count} connectors</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {runResult.overall_health_status && (
                            <HealthStatusBadge status={runResult.overall_health_status} />
                          )}
                          {score !== null && (
                            <span
                              className="text-xl font-bold"
                              style={{ color: score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A' }}
                            >
                              {score}%
                            </span>
                          )}
                        </div>
                      </div>

                      {runResult.connector_results && runResult.connector_results.length > 0 && (
                        <div className="space-y-1.5">
                          {runResult.connector_results.slice(0, 5).map(cr => (
                            <div
                              key={cr.id}
                              className="flex items-center justify-between text-xs px-3 py-2 rounded-xl"
                              style={{ background: '#f9fafb' }}
                            >
                              <div className="flex items-center gap-2">
                                {cr.outcome === 'success'
                                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  : <XCircle className="w-3.5 h-3.5 text-red-500" />
                                }
                                <span className="text-neutral-600 font-medium">{cr.connector_name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-neutral-400">
                                {cr.response_time_ms !== undefined && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {cr.response_time_ms}ms
                                  </span>
                                )}
                                <span
                                  className="capitalize font-semibold"
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

      {/* Assign Component Modal */}
      <Modal
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        title="Assign Component"
        subtitle={`Select a component from team "${team.name}" to assign to project "${component.name}"`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddProjectOpen(false)}>Cancel</Button>
            <Button type="submit" form="assign-project-form" loading={saving}>Assign</Button>
          </>
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
            <p className="text-xs text-neutral-400">No unassigned components found in team "{team.name}".</p>
          )}
        </form>
      </Modal>

      {/* Remove Component Confirm */}
      <ConfirmModal
        open={!!removeProjectTarget}
        onClose={() => setRemoveProjectTarget(null)}
        onConfirm={handleRemoveProject}
        title="Remove Component"
        message={
          <>
            Are you sure you want to remove component <strong className="text-neutral-900">"{removeProjectTarget?.name}"</strong> from this project? The component will remain under the team but won't be grouped in this project.
          </>
        }
        confirmLabel="Remove"
        loading={saving}
      />

      {/* Delete Project Confirm */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteComponent}
        title="Delete Project"
        message={
          <>
            Are you sure you want to delete project <strong className="text-neutral-900">"{component.name}"</strong>? Any components belonging to this project will be unassigned but NOT deleted.
          </>
        }
        confirmLabel="Delete Project"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
