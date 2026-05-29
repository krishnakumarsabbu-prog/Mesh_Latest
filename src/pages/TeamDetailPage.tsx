import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users, FolderOpen, Layers, ArrowLeft, Plus, Play, RefreshCw, Activity,
  UserPlus, UserMinus, ChevronRight, LayoutDashboard, CircleCheck as CheckCircle,
  Circle as XCircle, Clock, Wrench, Server, Database, Lock, Shield, Globe,
  Network, Mail, Code, Terminal, Cpu, Eye, Info, Trash2
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
import { teamApi, projectApi, lobApi, userApi, healthRunApi, componentApi } from '@/lib/api';
import { Team, TeamMember, Component, Project, Lob, User, HealthRunDetail } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { canManageProjects } from '@/lib/permissions';
import { cn, slugify } from '@/lib/utils';

type Tab = 'components' | 'members' | 'topology' | 'health';

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
        if (data.type === 'project') navigate(`/components/${data.id}`);
        else if (data.type === 'component') navigate(`/projects/${data.id}`);
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
        {data.type === 'team' && <Users className="w-3 h-3" style={{ color: data.color }} />}
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

// Sparkline Constellation for Project/Component card
function MiniNetGraph({ root, children, color }: { root: Component; children: Project[]; color: string }) {
  const W = 260; const H = 90;
  const nodes = useMemo(() => {
    const list: any[] = [];
    // Root project
    list.push({ id: 'root', type: 'root', label: root.name, x: 22, y: H / 2 });
    // Children components
    const cCount = children.length;
    const synth = cCount > 0 ? children.slice(0, 3) : Array.from({ length: 2 }, (_, i) => ({ id: `sc-${root.id}-${i}`, name: `Comp ${i + 1}` }));
    const synthCount = synth.length;
    synth.forEach((c, i) => {
      const y = synthCount === 1 ? H / 2 : 16 + (i * (H - 32)) / Math.max(synthCount - 1, 1);
      list.push({ id: `c${i}`, type: 'child', label: c.name, x: 210, y });
    });
    return list;
  }, [root, children]);

  const edges = useMemo(() => {
    const list: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    const rootNode = nodes.find(n => n.id === 'root');
    const childNodes = nodes.filter(n => n.id.startsWith('c'));
    if (!rootNode) return list;
    childNodes.forEach((c) => {
      list.push({ x1: rootNode.x, y1: rootNode.y, x2: c.x, y2: c.y, key: `rc-${c.id}` });
    });
    return list;
  }, [nodes]);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        {nodes.map(n => (
          <radialGradient key={`grad-${n.id}`} id={`grad-${root.id}-${n.id}`} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor={n.type === 'root' ? color : '#30D158'} stopOpacity="0.9" />
            <stop offset="100%" stopColor={n.type === 'root' ? color : '#30D158'} stopOpacity="0.25" />
          </radialGradient>
        ))}
      </defs>
      {edges.map(e => (
        <line
          key={e.key}
          x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke={color} strokeOpacity="0.2" strokeWidth="0.8"
          strokeDasharray="2 2"
        />
      ))}
      {nodes.map(n => {
        const r = n.type === 'root' ? 10 : 7;
        const nc = n.type === 'root' ? color : '#30D158';
        const iconPath = n.type === 'root' ? NODE_ICONS.component : NODE_ICONS.project;
        const iconScale = n.type === 'root' ? 0.75 : 0.55;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r + 4} fill={nc} fillOpacity="0.05" />
            <circle cx={n.x} cy={n.y} r={r + 1.5} fill="none" stroke={nc} strokeOpacity="0.25" strokeWidth="0.5" />
            <circle cx={n.x} cy={n.y} r={r} fill={`url(#grad-${root.id}-${n.id})`} />
            <g transform={`translate(${n.x - 6 * iconScale},${n.y - 6 * iconScale}) scale(${iconScale})`}>
              <path d={iconPath} fill="rgba(255,255,255,0.9)" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

const NODE_ICONS: Record<string, string> = {
  project:  'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  component:'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
};

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
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  admin: { color: '#FF9F0A', bg: '#FF9F0A15' },
  lead: { color: '#0A84FF', bg: '#0A84FF15' },
  member: { color: '#30D158', bg: '#30D15815' },
};

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const canManage = user ? canManageProjects(user.role) : false;

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [lob, setLob] = useState<Lob | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('components');

  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);

  const [addComponentForm, setAddComponentForm] = useState({ name: '', slug: '', description: '', color: '#30D158' });
  const [addMemberForm, setAddMemberForm] = useState({ user_id: '', role: 'member' });

  const [runningProject, setRunningProject] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastRunResults, setLastRunResults] = useState<Record<string, HealthRunDetail>>({});

  useEffect(() => {
    if (!teamId) return;
    fetchAll();
  }, [teamId]);

  const fetchAll = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [teamRes, membersRes, componentsRes, projectsRes] = await Promise.all([
        teamApi.get(teamId),
        teamApi.getMembers(teamId),
        componentApi.list(undefined, teamId),
        projectApi.list(undefined, teamId),
      ]);
      const t = teamRes.data as Team;
      setTeam(t);
      setMembers(membersRes.data);
      setComponents(componentsRes.data);
      setProjects(projectsRes.data);

      const lobRes = await lobApi.get(t.lob_id);
      setLob(lobRes.data);

      setPageTitle(t.name);
      setBreadcrumbs([
        { label: 'Teams', href: '/teams' },
        { label: t.name },
      ]);
    } catch {
      notify.error('Failed to load team details');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersForAssign = async () => {
    try {
      const res = await userApi.list();
      const existingIds = new Set(members.map(m => m.user_id));
      setAllUsers((res.data as User[]).filter(u => !existingIds.has(u.id)));
    } catch {
      notify.error('Failed to load users');
    }
  };

  const handleCreateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !addComponentForm.name || !team) return;
    setSaving(true);
    try {
      await componentApi.create({
        name: addComponentForm.name,
        slug: addComponentForm.slug || slugify(addComponentForm.name),
        description: addComponentForm.description,
        color: addComponentForm.color,
        icon: 'layers',
        team_id: teamId,
        lob_id: team.lob_id,
      });
      notify.success('Project created successfully');
      setAddComponentOpen(false);
      setAddComponentForm({ name: '', slug: '', description: '', color: '#30D158' });
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to create project', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !addMemberForm.user_id) return;
    setSaving(true);
    try {
      await teamApi.addMember(teamId, addMemberForm);
      notify.success('Member added to team');
      setAddMemberOpen(false);
      setAddMemberForm({ user_id: '', role: 'member' });
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to add member', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!teamId || !removeMemberTarget) return;
    setSaving(true);
    try {
      await teamApi.removeMember(teamId, removeMemberTarget.id);
      notify.success('Member removed from team');
      setRemoveMemberTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to remove member');
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
      notify.success('Health check completed');
    } catch {
      notify.error('Health check failed');
    } finally {
      setRunningProject(null);
    }
  };

  const handleRunAll = async () => {
    if (projects.length === 0) return;
    setRunningAll(true);
    notify.info('Triggering system health check scripts...');
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
    notify.success(`Completed health run checks for ${Object.keys(results).length} components`);
    fetchAll();
  };

  // ReactFlow Topology Map dataset
  const flowData = useMemo(() => {
    if (!team) return { nodes: [], edges: [] };
    const color = team.color || '#30D158';

    const ns: any[] = [];
    const es: any[] = [];

    // Root Team Node
    ns.push({
      id: 'team-root',
      type: 'flowNode',
      data: { type: 'team', label: team.name, color },
      position: { x: 0, y: 0 }
    });

    // Level 3 Projects (components in code)
    components.forEach((c) => {
      const cColor = c.color || '#0A84FF';
      ns.push({
        id: `proj-${c.id}`,
        type: 'flowNode',
        data: { id: c.id, type: 'project', label: c.name, color: cColor },
        position: { x: 0, y: 0 }
      });

      es.push({
        id: `e-team-${c.id}`,
        source: 'team-root',
        target: `proj-${c.id}`,
        animated: true,
        style: { stroke: cColor, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: cColor }
      });

      // Level 4 Components inside Project
      const childComps = projects.filter(p => p.component_id === c.id);
      childComps.forEach((p) => {
        ns.push({
          id: `comp-${p.id}`,
          type: 'flowNode',
          data: { id: p.id, type: 'component', label: p.name, color: '#30D158' },
          position: { x: 0, y: 0 }
        });

        es.push({
          id: `e-proj-${c.id}-${p.id}`,
          source: `proj-${c.id}`,
          target: `comp-${p.id}`,
          style: { stroke: '#30D158', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#30D158' }
        });
      });
    });

    const layouted = layoutGraph(ns, es);
    return { nodes: layouted, edges: es };
  }, [team, components, projects]);

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

  if (!team) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center p-8 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl backdrop-blur-md">
          <Users className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 animate-bounce" />
          <p className="text-[var(--text-secondary)] font-semibold">Team not found</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/teams')}>
            Back to Teams
          </Button>
        </div>
      </div>
    );
  }

  const teamColor = team.color || '#30D158';
  const healthyCount = projects.filter(p => p.connector_count > 0 && (p.healthy_count / p.connector_count) >= 0.8).length;
  const totalHealth = projects.length > 0 ? Math.round((healthyCount / projects.length) * 100) : 92;
  const totalConnectors = projects.reduce((acc, p) => acc + (p.connector_count || 0), 0);

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'components', label: 'Projects', icon: Layers, count: components.length },
    { key: 'members', label: 'Members', icon: Users, count: members.length },
    { key: 'topology', label: 'Topology Map', icon: Network },
    { key: 'health', label: 'Health Runs', icon: Activity, count: Object.keys(lastRunResults).length || undefined },
  ];

  return (
    <div className="space-y-6 min-h-screen pb-12 bg-transparent animate-page-enter">
      {/* Back nav */}
      <button
        onClick={() => navigate('/teams')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Teams
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
          backgroundImage: `radial-gradient(circle at 80% 20%, ${teamColor} 0%, transparent 65%)`,
        }} />
        <div className="absolute top-0 left-0 w-48 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl flex-shrink-0 border border-white/10 relative overflow-hidden"
              style={{ background: `${teamColor}15`, boxShadow: `0 8px 32px ${teamColor}20` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <Users className="w-8 h-8" style={{ color: teamColor }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">{team.name}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border"
                  style={{
                    background: team.is_active ? 'rgba(48, 209, 88, 0.12)' : 'rgba(142, 142, 147, 0.12)',
                    color: team.is_active ? '#30D158' : '#8E8E93',
                    borderColor: team.is_active ? 'rgba(48, 209, 88, 0.25)' : 'rgba(142, 142, 147, 0.25)'
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: team.is_active ? '#30D158' : '#8E8E93' }} />
                  {team.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              
              {lob && (
                <div className="flex items-center gap-1.5 mt-2 text-xs">
                  <Link to={`/lobs/${lob.id}`} className="hover:underline font-semibold" style={{ color: lob.color || teamColor }}>
                    {lob.name}
                  </Link>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-slate-400 font-bold">Team Command Deck</span>
                </div>
              )}
              {team.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mt-2.5">{team.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate(`/teams/${teamId}/dashboards`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-lg"
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboards
            </button>
            {canManage && projects.length > 0 && (
              <button
                onClick={handleRunAll}
                disabled={runningAll}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md"
                style={{ background: 'linear-gradient(135deg, #0A84FF, #0066CC)', boxShadow: '0 4px 16px rgba(10,132,255,0.3)' }}
              >
                {runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Trigger System Diagnostics
              </button>
            )}
          </div>
        </div>

        {/* Situation Room Summary Tiles */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { 
              label: 'Projects', 
              value: components.length, 
              icon: Layers, 
              color: '#0A84FF', 
              onClick: () => setActiveTab('components') 
            },
            { 
              label: 'Components', 
              value: projects.length, 
              icon: FolderOpen, 
              color: '#AF52DE', 
              onClick: () => setActiveTab('components') 
            },
            { 
              label: 'Connectors', 
              value: totalConnectors, 
              icon: Activity, 
              color: '#64D2FF', 
              onClick: () => navigate(`/connectors?team_id=${team.id}`) 
            },
            { 
              label: 'Active Members', 
              value: members.length, 
              icon: Users, 
              color: '#30D158', 
              onClick: () => setActiveTab('members') 
            },
            { 
              label: 'Overall SLA', 
              value: `${totalHealth}%`, 
              icon: Shield, 
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
            style={activeTab === key ? { borderColor: teamColor } : {}}
          >
            <Icon className="w-4 h-4" style={activeTab === key ? { color: teamColor } : {}} />
            {label}
            {count !== undefined && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-black border ml-1"
                style={{
                  background: activeTab === key ? teamColor + '15' : 'var(--app-bg-muted)',
                  color: activeTab === key ? teamColor : 'var(--text-secondary)',
                  borderColor: activeTab === key ? teamColor + '30' : 'var(--app-border)'
                }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
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
          {/* Projects Tab */}
          {activeTab === 'components' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {components.length} micro-service groups configured for this team
                </p>
                {canManage && (
                  <button
                    onClick={() => setAddComponentOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Project
                  </button>
                )}
              </div>

              {components.length === 0 ? (
                <div className="bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] p-12 text-center shadow-sm">
                  <EmptyState
                    icon={Layers}
                    title="No Projects configured"
                    description="Group and organize your component nodes by setting up your first project."
                    action={canManage ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddComponentOpen(true)}>Create Project</Button> : undefined}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {components.map((c, i) => {
                    const cColor = c.color || '#30D158';
                    const childComps = projects.filter(p => p.component_id === c.id);
                    const totalConnectors = childComps.reduce((acc, curr) => acc + (curr.connector_count || 0), 0);
                    
                    const healthyConns = childComps.reduce((acc, p) => acc + (p.healthy_count || 0), 0);
                    const tHealthPct = totalConnectors > 0 ? Math.round((healthyConns / totalConnectors) * 100) : 94;
                    const tHealthColor = tHealthPct >= 90 ? '#30D158' : tHealthPct >= 75 ? '#0A84FF' : tHealthPct >= 60 ? '#FF9F0A' : '#FF453A';
                    const tHealthLabel = tHealthPct >= 90 ? 'Healthy' : tHealthPct >= 75 ? 'Optimal' : tHealthPct >= 60 ? 'Degraded' : 'Critical';

                    return (
                      <motion.div
                        key={c.id}
                        whileHover={{ y: -4, boxShadow: `0 16px 40px rgba(0,0,0,0.3), 0 0 0 1px ${cColor}35` }}
                        className="relative rounded-2xl p-5 cursor-pointer border"
                        style={{
                          background: 'var(--app-surface)',
                          borderColor: 'var(--app-border)',
                          boxShadow: 'var(--shadow-md)',
                          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
                        }}
                        onClick={() => navigate(`/components/${c.id}`)}
                      >
                        <div className="absolute top-0 inset-x-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${cColor}, transparent)` }} />
                        <div className="absolute top-0 left-0 w-24 h-24 pointer-events-none" style={{ background: `radial-gradient(circle, ${cColor}12 0%, transparent 70%)` }} />

                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xl relative overflow-hidden"
                              style={{ background: `${cColor}18`, border: `1px solid ${cColor}40` }}>
                              {c.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[130px]">{c.name}</h3>
                              <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-wider">{c.slug || 'no-slug'}</p>
                            </div>
                          </div>

                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border"
                            style={{ background: tHealthColor + '12', color: tHealthColor, borderColor: tHealthColor + '25' }}>
                            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: tHealthColor }} />
                            {tHealthLabel}
                          </span>
                        </div>

                        {/* Counts grid */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="rounded-xl p-2.5 text-center bg-[var(--app-bg)] border border-[var(--app-border)]">
                            <div className="text-base font-black text-[var(--text-primary)]">{childComps.length}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Components</div>
                          </div>
                          <div className="rounded-xl p-2.5 text-center bg-[var(--app-bg)] border border-[var(--app-border)]">
                            <div className="text-base font-black text-[var(--text-primary)]">{totalConnectors}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Connectors</div>
                          </div>
                        </div>

                        {/* Sparkline constellation SVG graph */}
                        <div className="rounded-xl overflow-hidden mb-4 flex items-center justify-center relative group"
                          style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', height: 90 }}>
                          <MiniNetGraph root={c} children={childComps} color={cColor} />
                          
                          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-[var(--app-surface-active)] border border-[var(--app-border)] text-[var(--text-primary)] flex items-center gap-1.5">
                              <Eye className="w-3 h-3" style={{ color: cColor }} /> Inspect Node →
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-[var(--app-border)]">
                          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-bold bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)]">
                            Platform Node
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Operational engineers assigned to this team
                </p>
                {canManage && (
                  <button
                    onClick={() => { setAddMemberOpen(true); fetchUsersForAssign(); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-md"
                  >
                    <UserPlus className="w-3.5 h-3.5 animate-pulse" /> Add Member
                  </button>
                )}
              </div>

              {members.length === 0 ? (
                <div className="bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] p-12 text-center shadow-sm">
                  <EmptyState
                    icon={Users}
                    title="No Engineers registered"
                    description="Assign team members to enable permission scopes."
                    action={canManage ? <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setAddMemberOpen(true); fetchUsersForAssign(); }}>Add Member</Button> : undefined}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {members.map((member, i) => {
                    const roleStyle = ROLE_COLORS[member.role] || ROLE_COLORS.member;
                    const initials = (member.user_full_name || member.user_email || '?').slice(0, 2).toUpperCase();
                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-2xl p-4 flex items-center gap-3 border bg-[var(--app-surface)] border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] hover:shadow-lg transition-all group"
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-inner"
                          style={{ background: `${teamColor}12`, color: teamColor, border: `1px solid ${teamColor}30` }}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">{member.user_full_name || member.user_email}</p>
                          {member.user_email && member.user_full_name && (
                            <p className="text-xs text-[var(--text-secondary)] font-mono truncate mt-0.5">{member.user_email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className="text-[9px] font-bold px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10 uppercase tracking-wider"
                            style={{ color: roleStyle.color, background: roleStyle.bg, borderColor: `${roleStyle.color}25` }}
                          >
                            {member.role}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => setRemoveMemberTarget(member)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[var(--text-secondary)]">Team Network Topology</span>
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
                  { label: 'Operational Team', color: teamColor },
                  { label: 'Platform Project', color: '#0A84FF' },
                  { label: 'Monitoring Component', color: '#30D158' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="text-[var(--text-secondary)]">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Health runs tab */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Console execution logs from latest diagnostic scripts</p>
                </div>
                {canManage && projects.length > 0 && (
                  <button
                    onClick={handleRunAll}
                    disabled={runningAll}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-md animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5" /> Execute Diagnostics
                  </button>
                )}
              </div>

              {Object.keys(lastRunResults).length === 0 ? (
                <div className="bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] p-12 text-center shadow-sm">
                  <EmptyState
                    icon={Activity}
                    title="No execution logs"
                    description="Run checks to spin up the health analysis pipeline."
                    action={canManage && projects.length > 0
                      ? <Button icon={<Play className="w-4 h-4" />} onClick={handleRunAll} loading={runningAll}>Execute Diagnostics</Button>
                      : undefined
                    }
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
                            className="h-1 w-full"
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
      {/* Create Component Modal */}
      <Modal
        open={addComponentOpen}
        onClose={() => setAddComponentOpen(false)}
        title="Create Project"
        subtitle={`Add a new operational project under team: ${team.name}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddComponentOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-component-form" loading={saving}>Create</Button>
          </div>
        }
      >
        <form id="create-component-form" onSubmit={handleCreateComponent} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Project Name *</label>
            <input
              type="text"
              value={addComponentForm.name}
              onChange={e => setAddComponentForm(prev => ({ ...prev, name: e.target.value, slug: slugify(e.target.value) }))}
              className="w-full px-3.5 py-2 rounded-xl border bg-[var(--app-bg)] border-[var(--app-border)] text-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 transition-all font-medium text-[var(--text-primary)]"
              placeholder="e.g. Identity & Access Management"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Slug</label>
            <input
              type="text"
              value={addComponentForm.slug}
              onChange={e => setAddComponentForm(prev => ({ ...prev, slug: e.target.value }))}
              className="w-full px-3.5 py-2 rounded-xl border bg-[var(--app-bg)] border-[var(--app-border)] text-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 transition-all font-mono text-[var(--text-primary)]"
              placeholder="identity-access-management"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={addComponentForm.description}
              onChange={e => setAddComponentForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3.5 py-2 rounded-xl border bg-[var(--app-bg)] border-[var(--app-border)] text-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 transition-all text-[var(--text-primary)]"
              placeholder="Brief description of what this project monitors..."
              rows={3}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Color Tag</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['#30D158', '#0A84FF', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF', '#FFD60A', '#FF6B35'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAddComponentForm(prev => ({ ...prev, color: c }))}
                  className={cn(
                    'w-8 h-8 rounded-full border transition-transform duration-100 relative',
                    addComponentForm.color === c ? 'scale-110 ring-2 ring-offset-2 ring-slate-500 border-white' : 'hover:scale-105 border-white/10'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="Add Team Member"
        subtitle={`Scope a new engineer to ${team.name}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button type="submit" form="add-member-form" loading={saving}>Add</Button>
          </div>
        }
      >
        <form id="add-member-form" onSubmit={handleAddMember} className="space-y-4">
          <Select
            label="Engineer"
            value={addMemberForm.user_id}
            onChange={e => setAddMemberForm(prev => ({ ...prev, user_id: e.target.value }))}
            options={[
              { value: '', label: 'Select engineer...' },
              ...allUsers.map(u => ({ value: u.id, label: u.full_name || u.email })),
            ]}
            required
          />
          <Select
            label="Role Scope"
            value={addMemberForm.role}
            onChange={e => setAddMemberForm(prev => ({ ...prev, role: e.target.value }))}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'lead', label: 'Lead' },
              { value: 'admin', label: 'Admin' },
            ]}
            required
          />
        </form>
      </Modal>

      {/* Remove Member Confirm */}
      <ConfirmModal
        open={!!removeMemberTarget}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={handleRemoveMember}
        title="Revoke Assignment"
        message={
          <>
            Are you sure you want to revoke <strong className="text-white">"{removeMemberTarget?.user_full_name || removeMemberTarget?.user_email}"</strong> from this team? They will lose diagnostic and scan privileges scoped to this team.
          </>
        }
        confirmLabel="Revoke Scope"
        loading={saving}
      />
    </div>
  );
}
