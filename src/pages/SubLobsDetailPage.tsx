import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Building2, FolderOpen, Users, ArrowLeft, Pencil, Plus, ChevronRight, LayoutDashboard, Activity, Layers, Heart, Network, Zap, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { useUIStore } from '@/store/uiStore';
import { subLobApi, lobApi, teamApi, componentApi, projectApi } from '@/lib/api';
import { SubLob, Team, Project, Component } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { isSuperAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';

const PRESET_COLORS = [
  '#A259FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

// Dagre layout helper
function layoutGraph(rawNodes: any[], rawEdges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: 150, height: 44 }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rawNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 75, y: pos.y - 22 } };
  });
}

const NODE_ICONS: Record<string, string> = {
  sublob: 'M12 2L2 7l10 5 10-5-10-5zm0 18l-10-5 2-1 8 4 8-4 2 1-10 5z',
  team: 'M5 2a2 2 0 110 4 2 2 0 010-4zM2 8c0-1 1.1-2 3-2s3 1 3 2v.5H2V8zm6-6a2 2 0 110 4 2 2 0 010-4zm1 6c.7.3 1 .8 1 1.5v.5H7.2V9c0-.7.3-1.2.8-1.5z',
  project: 'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  component: 'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
};

// Flow custom node component
function FlowNode({ data }: { data: any }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => {
        if (data.type === 'team') navigate(`/teams/${data.id}`);
        else if (data.type === 'project') navigate(`/projects/${data.id}`);
        else if (data.type === 'component') navigate(`/components/${data.id}`);
      }}
      className="px-3 py-2 rounded-xl flex items-center gap-2 select-none cursor-pointer hover:scale-105 transition-transform duration-200"
      style={{
        background: `${data.color}16`,
        border: `1px solid ${data.color}45`,
        boxShadow: `0 0 12px ${data.color}18`,
        minWidth: 140,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 6, height: 6, border: 'none' }} />
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${data.color}25` }}>
        {data.type === 'sublob' && <Building2 className="w-3.5 h-3.5" style={{ color: data.color }} />}
        {data.type === 'team' && <Users className="w-3.5 h-3.5" style={{ color: data.color }} />}
        {data.type === 'project' && <FolderOpen className="w-3.5 h-3.5" style={{ color: data.color }} />}
        {data.type === 'component' && <Layers className="w-3.5 h-3.5" style={{ color: data.color }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase tracking-widest leading-none" style={{ color: data.color }}>{data.type}</p>
        <p className="text-[10px] font-semibold truncate mt-0.5" style={{ maxWidth: 90, color: 'var(--text-primary)' }} title={data.label}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const FLOW_NODE_TYPES = { flowNode: FlowNode };

// Mini Net Graph
function MiniNetGraph({ team, projects, components, color }: {
  team: Team; projects: Project[]; components: Component[]; color: string;
}) {
  const W = 260; const H = 72;

  const nodes = useMemo(() => {
    const teamProjects = projects.filter((p) => p.team_id === team.id).slice(0, 4);
    const teamComponents = components.filter((c) => c.team_id === team.id).slice(0, 3);

    const synthProjects = teamProjects.length > 0 ? teamProjects :
      Array.from({ length: 2 }, (_, i) => ({ id: `sp-${team.id}-${i}`, name: `P-${i + 1}` }));
    const synthComponents = teamComponents.length > 0 ? teamComponents :
      Array.from({ length: 2 }, (_, i) => ({ id: `sc-${team.id}-${i}`, name: `C-${i + 1}` }));

    const all: any[] = [];
    all.push({ id: 'team', type: 'team', label: team.name, x: 22, y: H / 2 });
    
    const pCount = synthProjects.length;
    synthProjects.forEach((p, i) => {
      const y = pCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(pCount - 1, 1);
      all.push({ id: `p${i}`, type: 'project', label: p.name, x: 120, y });
    });
    
    const cCount = synthComponents.length;
    synthComponents.forEach((c, i) => {
      const y = cCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(cCount - 1, 1);
      all.push({ id: `c${i}`, type: 'component', label: c.name, x: 220, y });
    });
    return all;
  }, [team, projects, components]);

  const edges = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    const teamNode = nodes.find(n => n.id === 'team');
    const projNodes = nodes.filter(n => n.id.startsWith('p'));
    const compNodes = nodes.filter(n => n.id.startsWith('c'));
    
    if (!teamNode) return lines;
    projNodes.forEach((p) => {
      lines.push({ x1: teamNode.x, y1: teamNode.y, x2: p.x, y2: p.y, key: `tp-${p.id}` });
    });
    projNodes.forEach((p, pi) => {
      compNodes.forEach((c, ci) => {
        if (pi === 0 || ci === pi || ci === pi - 1) {
          lines.push({ x1: p.x, y1: p.y, x2: c.x, y2: c.y, key: `pc-${p.id}-${c.id}` });
        }
      });
    });
    return lines;
  }, [nodes]);

  const nodeColor: Record<string, string> = {
    team: color,
    project: '#30D158',
    component: '#FF9F0A',
  };

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`blur-${team.id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
        </filter>
        {nodes.map(n => (
          <radialGradient key={`grad-${n.id}`} id={`grad-${team.id}-${n.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={nodeColor[n.type]} stopOpacity="1.0" />
            <stop offset="100%" stopColor={nodeColor[n.type]} stopOpacity="0.7" />
          </radialGradient>
        ))}
      </defs>
      {edges.map(e => (
        <g key={e.key}>
          <line
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={color} strokeOpacity="0.22" strokeWidth="3"
            filter={`url(#blur-${team.id})`}
          />
          <line
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={color} strokeOpacity="0.65" strokeWidth="1.2"
            strokeDasharray="2 2"
          />
        </g>
      ))}
      {nodes.map(n => {
        const r = n.type === 'team' ? 11 : 8.5;
        const nc = nodeColor[n.type];
        const iconPath = NODE_ICONS[n.type] || NODE_ICONS.component;
        const iconScale = n.type === 'team' ? 0.85 : 0.65;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r + 5} fill={nc} fillOpacity="0.22" filter={`url(#blur-${team.id})`} />
            <circle cx={n.x} cy={n.y} r={r + 1.5} fill="none" stroke={nc} strokeOpacity="0.65" strokeWidth="1" />
            <circle cx={n.x} cy={n.y} r={r} fill="var(--app-surface)" />
            <circle cx={n.x} cy={n.y} r={r} fill={`url(#grad-${team.id}-${n.id})`} />
            <g transform={`translate(${n.x - 6 * iconScale},${n.y - 6 * iconScale}) scale(${iconScale})`}>
              <path d={iconPath} fill="white" opacity="0.95" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// Detail Page Component
// ─────────────────────────────────────────────────────────
export function SubLobsDetailPage() {
  const { subLobId } = useParams<{ subLobId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [sublob, setSublob] = useState<SubLob | null>(null);
  const [parentLob, setParentLob] = useState<any | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'topology' | 'teams'>('dashboard');

  // Modals
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: '',
    description: '',
    color: '#30D158',
  });

  const color = sublob?.color || '#A259FF';

  const loadData = useCallback(async () => {
    if (!subLobId) return;
    setLoading(true);
    try {
      const slRes = await subLobApi.get(subLobId);
      setSublob(slRes.data);

      const [lobRes, tRes, pRes, cRes] = await Promise.all([
        lobApi.get(slRes.data.lob_id),
        teamApi.list(slRes.data.lob_id),
        projectApi.list(slRes.data.lob_id),
        componentApi.list(slRes.data.lob_id),
      ]);

      setParentLob(lobRes.data);
      setTeams(tRes.data.filter((t: any) => t.sub_lob_id === subLobId));
      setProjects(pRes.data.filter((p: any) => tRes.data.some((t: any) => t.sub_lob_id === subLobId && t.id === p.team_id)));
      setComponents(cRes.data.filter((c: any) => tRes.data.some((t: any) => t.sub_lob_id === subLobId && t.id === c.team_id)));
    } catch (err: any) {
      notify.error('Fetch Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [subLobId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (sublob) {
      setPageTitle(sublob.name);
      setBreadcrumbs([
        { label: 'Sub-LOBs' },
        { label: sublob.name },
      ]);
    }
  }, [sublob, setPageTitle, setBreadcrumbs]);

  // Topology network builder
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!sublob) return { nodes: [], edges: [] };

    const rawNodes: any[] = [];
    const rawEdges: any[] = [];

    // Sub-LOB center node
    rawNodes.push({
      id: `sublob-${sublob.id}`,
      type: 'flowNode',
      position: { x: 0, y: 0 },
      data: { label: sublob.name, type: 'sublob', color },
    });

    // Teams
    teams.forEach((t) => {
      const tc = t.color || '#30D158';
      rawNodes.push({
        id: `team-${t.id}`,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        data: { label: t.name, type: 'team', color: tc, id: t.id },
      });
      rawEdges.push({
        id: `e-sublob-${t.id}`,
        source: `sublob-${sublob.id}`,
        target: `team-${t.id}`,
        type: 'smoothstep',
        animated: true,
        style: { stroke: tc, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: tc },
      });

      // Projects under this team
      const teamProjects = projects.filter((p) => p.team_id === t.id);
      teamProjects.forEach((p) => {
        rawNodes.push({
          id: `proj-${p.id}`,
          type: 'flowNode',
          position: { x: 0, y: 0 },
          data: { label: p.name, type: 'project', color: '#64D2FF', id: p.id },
        });
        rawEdges.push({
          id: `e-team-${t.id}-${p.id}`,
          source: `team-${t.id}`,
          target: `proj-${p.id}`,
          type: 'smoothstep',
          style: { stroke: '#64D2FF', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#64D2FF' },
        });

        // Components
        components.filter((c) => c.team_id === t.id).slice(0, 2).forEach((c) => {
          const cid = `comp-${c.id}-${p.id}`;
          rawNodes.push({
            id: cid,
            type: 'flowNode',
            position: { x: 0, y: 0 },
            data: { label: c.name, type: 'component', color: '#FF9F0A', id: c.id },
          });
          rawEdges.push({
            id: `e-proj-${p.id}-${c.id}`,
            source: `proj-${p.id}`,
            target: cid,
            type: 'smoothstep',
            style: { stroke: '#FF9F0A80', strokeWidth: 1 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#FF9F0A' },
          });
        });
      });
    });

    const layouted = layoutGraph(rawNodes, rawEdges);
    return { nodes: layouted, edges: rawEdges };
  }, [sublob, teams, projects, components, color]);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  useEffect(() => {
    if (flowNodes.length > 0) {
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  // Team creation
  const handleTeamNameChange = (nameVal: string) => {
    setTeamForm((tf) => ({
      ...tf,
      name: nameVal,
    }));
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sublob) return;
    try {
      await teamApi.create({
        ...teamForm,
        lob_id: sublob.lob_id,
        sub_lob_id: sublob.id,
        tenant_id: user?.tenant_id || 'default',
      });
      notify.success('Team Created', `Team "${teamForm.name}" registered under ${sublob.name}.`);
      setShowAddTeamModal(false);
      setTeamForm({ name: '', description: '', color: '#30D158' });
      loadData();
    } catch (err: any) {
      notify.error('Create Failed', err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-white/10 rounded-xl w-64" />
        <div className="h-64 bg-white/10 rounded-2xl" />
      </div>
    );
  }

  if (!sublob) {
    return <EmptyState title="Sub-LOB Not Found" description="The requested Sub-LOB does not exist or has been removed." action={<Button onClick={() => navigate('/sublobs')}>Back to Sub-LOBs</Button>} />;
  }

  const healthPct = (sublob as any).total_connectors && (sublob as any).total_connectors > 0
    ? ((sublob as any).healthy_connectors / (sublob as any).total_connectors) * 100
    : 92.5;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-3">
        <Link to="/sublobs" className="flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white transition-all w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sub-LOBs
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
              <Building2 className="w-6 h-6" style={{ color }} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-white leading-none">{sublob.name}</h1>
                <Badge variant="default" className="text-[10px] font-mono tracking-wide text-white/40 border-white/10">{sublob.slug}</Badge>
              </div>
              <p className="text-xs text-white/60 mt-1 max-w-xl">{sublob.description || 'No description provided.'}</p>
              {parentLob && (
                <p className="text-[11px] text-white/40 mt-1">
                  Parent Line of Business: <Link to={`/lobs/${parentLob.id}`} className="font-semibold underline hover:text-white" style={{ color }}>{parentLob.name}</Link>
                </p>
              )}
            </div>
          </div>
          {superAdmin && (
            <Button onClick={() => navigate('/sublobs')} variant="secondary" className="flex items-center gap-1.5 font-bold border-white/10 hover:bg-white/5">
              <Pencil className="w-4 h-4" /> Manage Sub-LOBs
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {[
          { id: 'dashboard', label: 'Dashboard / Telemetry', icon: LayoutDashboard },
          { id: 'topology', label: 'Topology Map', icon: Network },
          { id: 'teams', label: 'Associated Teams', icon: Users },
        ].map((t) => (
          <button
            key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={cn('flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-all', activeTab === t.id ? 'border-violet-500 text-white' : 'border-transparent text-white/50 hover:text-white')}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="space-y-6">
            {/* Top aggregate stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Uptime (24h)', value: '99.98%', icon: Heart, c: '#30D158' },
                { label: 'Active Alerts', value: '0', icon: ShieldAlert, c: '#FF453A' },
                { label: 'Operational Health', value: `${healthPct.toFixed(1)}%`, icon: Zap, c: color },
                { label: 'Total Components', value: components.length, icon: Layers, c: '#FF9F0A' },
              ].map(({ label, value, icon: Icon, c }) => (
                <div key={label} className="p-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03]" style={{ background: `radial-gradient(circle at top right, ${c}, transparent 60%)` }} />
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 mb-2">
                    <Icon className="w-4.5 h-4.5" style={{ color: c }} />
                  </div>
                  <p className="text-xl font-bold text-white">{value}</p>
                  <p className="text-[10px] text-white/50 font-semibold uppercase tracking-wider mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Sub-tier listings summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" /> Active Teams Under Sub-LOB ({teams.length})
                </h3>
                <div className="space-y-3">
                  {teams.slice(0, 4).map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/teams/${t.id}`)}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || '#30D158' }} />
                        <span className="text-xs font-semibold text-white">{t.name}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                    </div>
                  ))}
                  {teams.length === 0 && <p className="text-xs text-white/40 italic">No teams registered under this Sub-LOB tier.</p>}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-sky-400" /> Monitored Projects ({projects.length})
                </h3>
                <div className="space-y-3">
                  {projects.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-xs font-semibold text-white">{p.name}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                    </div>
                  ))}
                  {projects.length === 0 && <p className="text-xs text-white/40 italic">No projects associated with this Sub-LOB tier.</p>}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'topology' && (
          <motion.div key="topology" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="rounded-2xl overflow-hidden border border-white/10 bg-black/20" style={{ height: 480 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={FLOW_NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="rgba(255,255,255,0.03)" gap={20} size={1} />
              <Controls
                style={{ bottom: 12, right: 12, left: 'auto', top: 'auto' }}
                className="[&_button]:bg-white/5 [&_button]:border-white/10 [&_button]:text-white/50 [&_button:hover]:bg-white/10"
              />
            </ReactFlow>
          </motion.div>
        )}

        {activeTab === 'teams' && (
          <motion.div key="teams" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">Registered Teams under {sublob.name}</h3>
              {superAdmin && (
                <Button onClick={() => setShowAddTeamModal(true)} className="flex items-center gap-1.5 font-semibold text-xs py-1.5 px-3">
                  <Plus className="w-4 h-4" /> Add Team
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teams.map((t) => {
                const tc = t.color || '#30D158';
                return (
                  <div
                    key={t.id} className="p-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-violet-500/20 transition-all cursor-pointer flex flex-col justify-between"
                    onClick={() => navigate(`/teams/${t.id}`)}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4.5 h-4.5" style={{ color: tc }} />
                          <span className="text-xs font-bold text-white">{t.name}</span>
                        </div>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: tc }} />
                      </div>
                      <p className="text-[10px] text-white/50 mt-1 max-w-[200px] truncate">{t.description || 'No description provided.'}</p>
                    </div>

                    <div className="h-20 flex items-center justify-center mt-3 bg-white/[0.01] rounded-xl overflow-hidden">
                      <MiniNetGraph team={t} projects={projects} components={components} color={tc} />
                    </div>

                    <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-white/5 text-[9px] text-white/40">
                      <span>Projects: {projects.filter(p => p.team_id === t.id).length}</span>
                      <ChevronRight className="w-3 h-3 text-white/30" />
                    </div>
                  </div>
                );
              })}
              {teams.length === 0 && (
                <div className="col-span-full">
                  <EmptyState title="No associated teams found" description="Register or assign a team to begin tracking telemetry." action={superAdmin ? <Button onClick={() => setShowAddTeamModal(true)}>Add Team</Button> : undefined} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Team Modal */}
      <Modal open={showAddTeamModal} onClose={() => setShowAddTeamModal(false)} title={`Create Team under ${sublob.name}`}>
        <form onSubmit={handleCreateTeam} className="space-y-4 pt-2">
          <Input label="Name" placeholder="e.g. Mortgages Ingestion API" value={teamForm.name} onChange={(e) => handleTeamNameChange(e.target.value)} required />
          <TextArea label="Description" placeholder="Optional details..." value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-wide uppercase text-[var(--text-secondary)]">Team Color</label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c: string) => (
                <button
                  key={c} type="button" onClick={() => setTeamForm({ ...teamForm, color: c })}
                  className={cn('w-7 h-7 rounded-full border-2', teamForm.color === c ? 'border-white scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" onClick={() => setShowAddTeamModal(false)}>Cancel</Button>
            <Button type="submit">Create Team</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
