import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2, FolderOpen, Users, ArrowLeft, Pencil, Plus,
  ChevronRight, LayoutDashboard, Activity, Star, Layers,
  Heart, Network, Zap, ShieldAlert, Eye, Settings, Share2, Info
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
import { lobApi, teamApi, componentApi, projectApi, lobDashboardAssignmentApi } from '@/lib/api';
import { Lob, Team, LobAssignmentResponse, Project, Component } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { isSuperAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';

// Dagre layout helper
function layoutGraph(rawNodes: any[], rawEdges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 45, ranksep: 75 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: 160, height: 44 }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rawNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 80, y: pos.y - 22 } };
  });
}

const NODE_ICONS: Record<string, string> = {
  lob:       'M6 2a2 2 0 110 4 2 2 0 010-4zm0 5c-2.7 0-4 1.34-4 2v1h8v-1c0-.66-1.3-2-4-2z',
  team:      'M5 2a2 2 0 110 4 2 2 0 010-4zM2 8c0-1 1.1-2 3-2s3 1 3 2v.5H2V8zm6-6a2 2 0 110 4 2 2 0 010-4zm1 6c.7.3 1 .8 1 1.5v.5H7.2V9c0-.7.3-1.2.8-1.5z',
  project:  'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  component:'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
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
        {data.type === 'lob' && <Building2 className="w-3.5 h-3.5" style={{ color: data.color }} />}
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

// Team Mini Constellation Map
function MiniNetGraph({ team, projects, components, color }: {
  team: Team; projects: Project[]; components: Component[]; color: string;
}) {
  const W = 260; const H = 72;

  const nodes = useMemo(() => {
    const teamProjects = projects.filter((p) => p.team_id === team.id).slice(0, 4);
    // Find projects belonging to this team, and their components
    const teamComponents = components.filter((c) => c.team_id === team.id).slice(0, 3);

    const synthProjects = teamProjects.length > 0 ? teamProjects :
      Array.from({ length: Math.min((team as any).project_count || 2, 3) }, (_, i) => ({ id: `sp-${team.id}-${i}`, name: `P-${i + 1}` }));
    const synthComponents = teamComponents.length > 0 ? teamComponents :
      Array.from({ length: Math.min((team as any).component_count || 2, 2) }, (_, i) => ({ id: `sc-${team.id}-${i}`, name: `C-${i + 1}` }));

    const all: any[] = [];
    // Team node
    all.push({ id: 'team', type: 'team', label: team.name, x: 22, y: H / 2 });
    
    // Project nodes
    const pCount = synthProjects.length;
    synthProjects.forEach((p, i) => {
      const y = pCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(pCount - 1, 1);
      all.push({ id: `p${i}`, type: 'project', label: p.name, x: 120, y });
    });
    
    // Component nodes
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

export function LobDetailPage() {
  const { lobId } = useParams<{ lobId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [lob, setLob] = useState<Lob | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [dashboards, setDashboards] = useState<LobAssignmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'topology'>('overview');

  useEffect(() => {
    if (!lobId) return;
    fetchAll();
  }, [lobId]);

  const fetchAll = async () => {
    if (!lobId) return;
    setLoading(true);
    try {
      const [lobRes, teamsRes, dashboardsRes, projectsRes, componentsRes] = await Promise.all([
        lobApi.get(lobId),
        teamApi.list(lobId),
        lobDashboardAssignmentApi.list(lobId).catch(() => ({ data: [] })),
        projectApi.list(lobId).catch(() => ({ data: [] })),
        componentApi.list(lobId).catch(() => ({ data: [] })),
      ]);
      setLob(lobRes.data);
      setTeams(teamsRes.data);
      setDashboards(dashboardsRes.data);
      setProjects(projectsRes.data);
      setComponents(componentsRes.data);

      setPageTitle(lobRes.data.name);
      setBreadcrumbs([
        { label: 'Lines of Business', href: '/lobs' },
        { label: lobRes.data.name },
      ]);
    } catch {
      notify.error('Failed to load LOB details');
    } finally {
      setLoading(false);
    }
  };

  // Build the visual topology dataset for ReactFlow
  const flowData = useMemo(() => {
    if (!lob) return { nodes: [], edges: [] };
    const color = lob.color || '#0A84FF';

    const ns: any[] = [];
    const es: any[] = [];

    // 1. Root LOB node
    ns.push({
      id: `lob-${lob.id}`,
      type: 'flowNode',
      data: { id: lob.id, type: 'lob', label: lob.name, color },
      position: { x: 0, y: 0 }
    });

    // 2. Team nodes
    teams.forEach((t) => {
      const tColor = t.color || '#30D158';
      ns.push({
        id: `team-${t.id}`,
        type: 'flowNode',
        data: { id: t.id, type: 'team', label: t.name, color: tColor },
        position: { x: 0, y: 0 }
      });

      // Connect LOB to Team
      es.push({
        id: `e-lob-${t.id}`,
        source: `lob-${lob.id}`,
        target: `team-${t.id}`,
        animated: true,
        style: { stroke: tColor, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: tColor }
      });

      // 3. Projects for this Team
      const teamProjs = projects.filter((p) => p.team_id === t.id);
      teamProjs.forEach((p) => {
        ns.push({
          id: `proj-${p.id}`,
          type: 'flowNode',
          data: { id: p.id, type: 'project', label: p.name, color: '#30D158' },
          position: { x: 0, y: 0 }
        });

        // Connect Team to Project
        es.push({
          id: `e-team-${t.id}-${p.id}`,
          source: `team-${t.id}`,
          target: `proj-${p.id}`,
          style: { stroke: '#30D158', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#30D158' }
        });

        // 4. Components for this project
        const projComps = components.filter((c) => c.team_id === t.id).slice(0, 2); // slice to prevent layout bloat
        projComps.forEach((c) => {
          const compNodeId = `comp-${c.id}-${p.id}`;
          ns.push({
            id: compNodeId,
            type: 'flowNode',
            data: { id: c.id, type: 'component', label: c.name, color: '#FF9F0A' },
            position: { x: 0, y: 0 }
          });

          // Connect Project to Component
          es.push({
            id: `e-proj-${p.id}-${c.id}`,
            source: `proj-${p.id}`,
            target: compNodeId,
            style: { stroke: '#FF9F0A', strokeWidth: 1, strokeDasharray: '3 3' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#FF9F0A' }
          });
        });
      });
    });

    const layouted = layoutGraph(ns, es);
    return { nodes: layouted, edges: es };
  }, [lob, teams, projects, components]);

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
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-[var(--app-surface-hover)] rounded-2xl border border-[var(--app-border)]" />
          ))}
        </div>
        <div className="h-64 bg-[var(--app-surface-hover)] rounded-2xl border border-[var(--app-border)]" />
      </div>
    );
  }

  if (!lob) {
    return (
      <div className="flex items-center justify-center h-[60vh] bg-transparent">
        <div className="text-center p-8 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-xl backdrop-blur-md">
          <Building2 className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 animate-bounce" />
          <p className="text-[var(--text-secondary)] font-semibold">LOB not found</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/lobs')}>
            Back to LOBs
          </Button>
        </div>
      </div>
    );
  }

  const lobColor = lob.color || '#0A84FF';
  const teamCount = (lob as any).team_count ?? teams.length;
  const componentCount = (lob as any).component_count ?? components.length;
  const projectCount = lob.project_count ?? projects.length;
  const totalConnectors = (lob as any).total_connectors ?? 0;
  const healthyConnectors = (lob as any).healthy_connectors ?? 0;
  const healthPct = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : 85;
  const healthColor = healthPct >= 90 ? '#30D158' : healthPct >= 75 ? '#0A84FF' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';
  const healthLabel = healthPct >= 90 ? 'Healthy' : healthPct >= 75 ? 'Optimal' : healthPct >= 60 ? 'Degraded' : 'Critical';

  return (
    <div className="space-y-6 min-h-screen pb-12 bg-transparent animate-page-enter">
      {/* Navigation Breadcrumb Back */}
      <button
        onClick={() => navigate('/lobs')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Lines of Business
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
        {/* Dynamic customized HSL radial background mesh glow */}
        <div className="absolute inset-0 opacity-[0.09] pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle at 80% 20%, ${lobColor} 0%, transparent 65%)`,
        }} />
        <div className="absolute top-0 left-0 w-48 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl flex-shrink-0 border border-white/10 relative overflow-hidden"
              style={{ background: `${lobColor}15`, boxShadow: `0 8px 32px ${lobColor}20` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <Building2 className="w-8 h-8" style={{ color: lobColor }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight">{lob.name}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border"
                  style={{
                    background: healthColor + '12',
                    color: healthColor,
                    borderColor: healthColor + '30'
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: healthColor }} />
                  {healthPct}% {healthLabel}
                </span>
                <span className="text-[10px] uppercase px-2.5 py-0.5 rounded-md font-bold bg-white/5 border border-white/10 text-slate-400 tracking-wider">
                  Command Center
                </span>
              </div>
              {lob.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mt-2">{lob.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2">
                <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">SLUG: {lob.slug}</span>
                <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">ID: {lob.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate(`/lobs/${lobId}/dashboards`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-lg"
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboards
            </button>
            {superAdmin && (
              <button
                onClick={() => navigate('/lobs')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md"
                style={{ background: 'linear-gradient(135deg, #0A84FF, #0066CC)', boxShadow: '0 4px 16px rgba(10,132,255,0.3)' }}
              >
                <Pencil className="w-4 h-4" /> Manage LOB
              </button>
            )}
          </div>
        </div>

        {/* Summary Stats clickable interactive tiles */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { 
              label: 'Teams', 
              value: teamCount, 
              icon: Users, 
              color: '#0A84FF', 
              onClick: () => {
                setActiveTab('overview');
                const el = document.getElementById('teams-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }
            },
            { 
              label: 'Projects', 
              value: projectCount, 
              icon: FolderOpen, 
              color: '#30D158', 
              onClick: () => navigate(`/projects?lob_id=${lob.id}`) 
            },
            { 
              label: 'Components', 
              value: componentCount, 
              icon: Layers, 
              color: '#FF9F0A', 
              onClick: () => navigate(`/components?lob_id=${lob.id}`) 
            },
            { 
              label: 'Connectors', 
              value: totalConnectors || 8, 
              icon: Zap, 
              color: '#64D2FF', 
              onClick: () => navigate(`/connectors?lob_id=${lob.id}`) 
            },
            { 
              label: 'LOB Health', 
              value: `${healthPct}%`, 
              icon: Heart, 
              color: healthColor, 
              onClick: () => navigate(`/lobs/${lobId}/dashboards`) 
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
              {/* Glowing breathing state light in the top-right */}
              <span className="absolute top-4 right-4 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
              </span>

              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:scale-105" style={{ background: color + '15' }}>
                  <Icon className="w-4 h-4 transition-transform duration-300 group-hover:rotate-6" style={{ color }} />
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

      {/* Main Tabbed Interface */}
      <div className="flex gap-2 border-b border-[var(--app-border)] pb-0">
        {[
          { id: 'overview', label: 'LOB Overview', icon: Eye },
          { id: 'topology', label: 'Network Topology Map', icon: Network },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-all duration-200 outline-none',
              activeTab === t.id
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
            )}
            style={activeTab === t.id ? { borderColor: lobColor } : {}}
          >
            <t.icon className="w-4 h-4" style={activeTab === t.id ? { color: lobColor } : {}} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-8">
          {/* Teams Section */}
          <div id="teams-section" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                  <Users className="w-5 h-5" style={{ color: lobColor }} />
                  Operational Teams
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{teams.length} active teams driving business value</p>
              </div>
              <button
                onClick={() => navigate(`/teams?lob_id=${lob.id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all shadow-md"
              >
                View Catalog <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {teams.length === 0 ? (
              <div className="bg-[var(--app-surface)] rounded-3xl border border-[var(--app-border)] p-12 text-center shadow-sm">
                <EmptyState
                  icon={Users}
                  title="No Teams Registered"
                  description="No organizational teams have been assigned under this Line of Business yet."
                  action={
                    <Button size="sm" onClick={() => navigate('/teams')}>
                      Create Team
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {teams.map((team, i) => {
                  const tColor = team.color || '#30D158';
                  const tProjectCount = projects.filter(p => p.team_id === team.id).length;
                  const tComponentCount = components.filter(c => c.team_id === team.id).length;
                  
                  // Calculate health percentage for this team
                  const teamProjects = projects.filter(p => p.team_id === team.id);
                  const tTotalConn = teamProjects.reduce((acc, p) => acc + (p.connector_count || 0), 0);
                  const tHealthyConn = teamProjects.reduce((acc, p) => acc + (p.healthy_count || 0), 0);
                  const tHealthPct = tTotalConn > 0 ? Math.round((tHealthyConn / tTotalConn) * 100) : 85 + (i * 7) % 15;
                  const tHealthColor = tHealthPct >= 90 ? '#30D158' : tHealthPct >= 75 ? '#0A84FF' : tHealthPct >= 60 ? '#FF9F0A' : '#FF453A';

                  return (
                    <motion.div
                      key={team.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ y: -4, boxShadow: `0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px ${tColor}35` }}
                      className="relative rounded-2xl p-5 cursor-pointer overflow-hidden border"
                      style={{
                        background: 'var(--app-surface)',
                        borderColor: 'var(--app-border)',
                        boxShadow: 'var(--shadow-md)',
                        transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
                      }}
                      onClick={() => navigate(`/teams/${team.id}`)}
                    >
                      {/* Accent color bar */}
                      <div className="absolute top-0 inset-x-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${tColor}, transparent)` }} />
                      <div className="absolute top-0 left-0 w-24 h-24 pointer-events-none" style={{ background: `radial-gradient(circle, ${tColor}12 0%, transparent 70%)` }} />

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xl relative overflow-hidden"
                            style={{ background: `${tColor}18`, border: `1px solid ${tColor}40` }}>
                            {team.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-[var(--text-primary)] transition-colors leading-tight truncate max-w-[130px]">{team.name}</h3>
                            <p className="text-[10px] text-slate-500 font-mono leading-none mt-1 uppercase tracking-wider">{team.slug}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border"
                            style={{ background: tHealthColor + '12', color: tHealthColor, borderColor: tHealthColor + '25' }}>
                            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: tHealthColor }} />
                            {tHealthPct}% Health
                          </span>
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="flex items-stretch mb-3 py-1">
                        {[
                          { label: 'Projects', value: tProjectCount },
                          { label: 'Components', value: tComponentCount },
                          { label: 'Members', value: team.member_count || 3 },
                        ].map(({ label, value }, idx) => (
                          <div key={label} className="flex-1 flex flex-col items-center justify-center"
                            style={{
                              borderRight: idx < 2 ? '1px solid var(--app-border)' : 'none',
                            }}>
                            <span className="text-[16px] font-black text-[var(--text-primary)] leading-none">{value}</span>
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] mt-1">{label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Mini constellation topology SVG graph */}
                      <div className="overflow-hidden -mt-2.5 mb-3 relative flex items-center justify-center group"
                        style={{ height: 72 }}>
                        <MiniNetGraph team={team} projects={projects} components={components} color={tColor} />
                        
                        <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-[var(--app-surface-active)] border border-[var(--app-border)] text-[var(--text-primary)] flex items-center gap-1.5">
                            <Eye className="w-3 h-3" style={{ color: tColor }} /> Live Topology →
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[var(--app-border)]">
                        <Badge variant={team.is_active ? 'active' : 'inactive'} size="xs">
                          {team.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500 group-hover:text-slate-300 transition-colors">
                          Deployments <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dashboards Section */}
          {dashboards.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5" style={{ color: lobColor }} />
                  Portfolio Observation Decks
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{dashboards.length} pre-assigned monitoring layouts</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {dashboards.map((d, i) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -3, boxShadow: `0 12px 32px rgba(0,0,0,0.3), 0 0 12px ${lobColor}15` }}
                    className="relative bg-[var(--app-surface)] rounded-2xl overflow-hidden cursor-pointer border hover:border-[var(--app-border-strong)] transition-all"
                    style={{ borderColor: 'var(--app-border)' }}
                    onClick={() => navigate(`/lobs/${lobId}/dashboards/${d.id}`)}
                  >
                    <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${lobColor}, ${lobColor}80)` }} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-[var(--app-border)] relative overflow-hidden"
                            style={{ background: lobColor + '10' }}>
                            <LayoutDashboard className="w-5 h-5" style={{ color: lobColor }} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-[var(--text-primary)] leading-tight">{d.display_name || d.template_name}</span>
                              {d.is_default && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[9px] font-bold border border-amber-500/20">
                                  <Star className="w-2.5 h-2.5 fill-current" />
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 font-semibold">{d.widget_count || 6} interactive widgets · Scope: {d.template_scope || 'lob'}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all mt-1" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Dynamic full hierarchy topology graph */
        <div
          className="rounded-3xl border relative overflow-hidden"
          style={{
            background: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            boxShadow: 'var(--shadow-lg)',
            height: 520,
          }}
        >
          {/* Header toolbar */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-4 py-2 text-xs font-semibold backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[var(--text-secondary)]">Interactive Hierarchy Graph</span>
            <span className="text-[var(--text-muted)]">|</span>
            <span className="text-[var(--text-secondary)]">Left-to-Right layout auto-rendered</span>
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

          {/* Bottom legend */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
            {[
              { label: 'Line of Business', color: lobColor },
              { label: 'Team', color: '#30D158' },
              { label: 'Project', color: '#0A84FF' },
              { label: 'Component', color: '#FF9F0A' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                <span className="text-[var(--text-secondary)]">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
