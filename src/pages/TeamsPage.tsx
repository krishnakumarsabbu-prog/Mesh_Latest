import React, {
  useEffect, useState, useMemo, useCallback,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Users, Trash2, Pencil, Search, X, RefreshCw,
  Eye, FolderOpen, Activity, ChevronRight, MoveVertical as MoreVertical,
  Building2, Layers, Network, Zap, TrendingUp,
  LayoutGrid, List, Table as TableIcon, ArrowUpDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip,
  XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  MarkerType, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { useUIStore } from '@/store/uiStore';
import { teamApi, lobApi, subLobApi, projectApi, componentApi, healthApi } from '@/lib/api';
import { Team, Lob, Project, Component } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { isLobAdmin } from '@/lib/permissions';

const PRESET_COLORS = [
  '#0A84FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

type ViewMode = 'card' | 'list' | 'table';
type SortField = 'name' | 'status' | 'project_count' | 'member_count';

const NODE_ICONS: Record<string, string> = {
  team: 'M5 2a2 2 0 110 4 2 2 0 010-4zM2 8c0-1 1.1-2 3-2s3 1 3 2v.5H2V8zm6-6a2 2 0 110 4 2 2 0 010-4zm1 6c.7.3 1 .8 1 1.5v.5H7.2V9c0-.7.3-1.2.8-1.5z',
  project: 'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  component: 'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
};

function layoutGraph(rawNodes: any[], rawEdges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 70 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: 160, height: 44 }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rawNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 80, y: pos.y - 22 } };
  });
}

function MiniNetGraph({ team, projects, components, color }: {
  team: Team; projects: Project[]; components: Component[]; color: string;
}) {
  const W = 260; const H = 72;

  const nodes = useMemo(() => {
    const teamProjects = projects.filter((p) => p.team_id === team.id).slice(0, 4);
    const teamComponents = components.filter((c) => c.team_id === team.id).slice(0, 4);

    const synthProjects = teamProjects.length > 0 ? teamProjects :
      Array.from({ length: Math.min(team.project_count || 2, 4) }, (_, i) => ({ id: `sp${i}`, name: `P${i + 1}` }));
    const synthComponents = teamComponents.length > 0 ? teamComponents :
      Array.from({ length: Math.min(2, 4) }, (_, i) => ({ id: `sc${i}`, name: `C${i + 1}` }));

    const all: any[] = [];
    // Team node
    all.push({ id: 'team', type: 'team', label: team.name.slice(0, 8), x: 22, y: H / 2 });
    // Project nodes
    const pCount = synthProjects.length;
    synthProjects.forEach((p, i) => {
      const y = pCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(pCount - 1, 1);
      all.push({ id: `p${i}`, type: 'project', label: (p.name as string).slice(0, 8), x: 120, y });
    });
    // Component nodes
    const cCount = synthComponents.length;
    synthComponents.forEach((c, i) => {
      const y = cCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(cCount - 1, 1);
      all.push({ id: `c${i}`, type: 'component', label: (c.name as string).slice(0, 8), x: 222, y });
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
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`blur-${team.id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
        </filter>
        {nodes.map(n => (
          <radialGradient key={`grad-${n.id}`} id={`grad-${n.id}`} cx="50%" cy="50%" r="50%">
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
            strokeDasharray="3 3"
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
            <circle cx={n.x} cy={n.y} r={r} fill={`url(#grad-${n.id})`} />
            <g transform={`translate(${n.x - 6 * iconScale},${n.y - 6 * iconScale}) scale(${iconScale})`}>
              <path d={iconPath} fill="white" opacity="0.95" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function FlowTeamNode({ data }: { data: any }) {
  const COLORS: Record<string, string> = {
    team: '#0A84FF', project: '#30D158', component: '#FF9F0A',
  };
  const c = COLORS[data.type] || '#64D2FF';
  const Icon = data.type === 'team' ? Users : data.type === 'project' ? FolderOpen : Layers;
  return (
    <div className="px-3 py-2 rounded-xl flex items-center gap-2 select-none"
      style={{
        background: `${c}18`, border: `1px solid ${c}50`,
        boxShadow: `0 0 10px ${c}20`, minWidth: 120,
      }}>
      <Handle type="target" position={Position.Left} style={{ background: c, width: 6, height: 6, border: 'none' }} />
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c}30` }}>
        <Icon className="w-3.5 h-3.5" style={{ color: c }} />
      </div>
      <div>
        <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: c }}>{data.type}</p>
        <p className="text-[10px] font-semibold text-white leading-tight">{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: c, width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const nodeTypes = { teamNode: FlowTeamNode };

function TeamGraphPopup({ team, projects, components, lob, onClose }: {
  team: Team; projects: Project[]; components: Component[]; lob: Lob | undefined; onClose: () => void;
}) {
  const teamProjects = projects.filter(p => p.team_id === team.id);
  const teamComponents = components.filter(c => c.team_id === team.id);

  const rawNodes = useMemo(() => {
    const ns: any[] = [];
    ns.push({ id: 'team', type: 'teamNode', data: { type: 'team', label: team.name, color: team.color } });
    teamProjects.forEach((p, i) => {
      ns.push({ id: `proj-${p.id}`, type: 'teamNode', data: { type: 'project', label: p.name, color: '#30D158' }, position: { x: 0, y: 0 } });
    });
    teamComponents.forEach((c, i) => {
      ns.push({ id: `comp-${c.id}`, type: 'teamNode', data: { type: 'component', label: c.name, color: '#FF9F0A' }, position: { x: 0, y: 0 } });
    });
    return ns;
  }, [team, teamProjects, teamComponents]);

  const rawEdges = useMemo(() => {
    const es: any[] = [];
    teamProjects.forEach(p => {
      es.push({ id: `e-team-${p.id}`, source: 'team', target: `proj-${p.id}`, animated: true, style: { stroke: '#30D158', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#30D158' } });
    });
    teamComponents.forEach(c => {
      const parentProj = teamProjects.find(p => p.id === c.team_id);
      const source = parentProj ? `proj-${parentProj.id}` : (teamProjects.length > 0 ? `proj-${teamProjects[0].id}` : 'team');
      es.push({ id: `e-proj-${c.id}`, source, target: `comp-${c.id}`, animated: true, style: { stroke: '#FF9F0A', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#FF9F0A' } });
    });
    return es;
  }, [team, teamProjects, teamComponents]);

  const [nodes, , onNodesChange] = useNodesState(layoutGraph(rawNodes, rawEdges));
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="relative rounded-2xl overflow-hidden w-[90vw] max-w-4xl"
          style={{
            background: 'rgba(8,14,28,0.98)', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: `0 0 80px ${team.color}30, 0 40px 80px rgba(0,0,0,0.8)`,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: team.color + '20', border: `1px solid ${team.color}40` }}>
                <Users className="w-5 h-5" style={{ color: team.color }} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white">{team.name}</p>
                <p className="text-[11px]" style={{ color: '#566F8A' }}>{lob?.name || 'Unknown LOB'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-4">
                {[
                  { label: 'Projects', val: teamProjects.length || team.project_count, color: '#30D158' },
                  { label: 'Components', val: teamComponents.length, color: '#FF9F0A' },
                  { label: 'Members', val: team.member_count, color: '#64D2FF' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <p className="text-[18px] font-bold" style={{ color }}>{val}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#566F8A' }}>{label}</p>
                  </div>
                ))}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all" style={{ background: 'rgba(255,255,255,0.07)', color: '#566F8A' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div style={{ height: 420 }}>
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes} fitView
              style={{ background: 'transparent' }}
            >
              <Background color="rgba(255,255,255,0.03)" gap={24} />
              <Controls style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </ReactFlow>
          </div>

          <div className="px-6 py-3 flex items-center gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { color: team.color, label: 'Team' },
              { color: '#30D158', label: 'Projects' },
              { color: '#FF9F0A', label: 'Components' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[11px] font-medium" style={{ color: '#566F8A' }}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function TeamCard({ team, lob, subLob, projects, components, canCreate, onEdit, onDelete, onView }: {
  team: Team; lob: Lob | undefined; subLob?: any;
  projects: Project[]; components: Component[];
  canCreate: boolean;
  onEdit: (t: Team) => void;
  onDelete: (t: Team) => void;
  onView: (t: Team) => void;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const projectCount = projects.filter(p => p.team_id === team.id).length || team.project_count || 0;
  const componentCount = components.filter(c => c.team_id === team.id).length || 0;
  const memberCount = team.member_count || 0;
  const color = team.color || '#0A84FF';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="relative rounded-2xl cursor-pointer group overflow-hidden shadow-sm"
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        boxShadow: `var(--shadow-sm), 0 0 0 0 ${color}00`,
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 48px rgba(0,0,0,0.08), 0 0 24px ${color}18`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}35`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `var(--shadow-sm)`;
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
      }}
      onClick={() => navigate(`/teams/${team.id}`)}
    >
      {/* Top glow */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 rounded-full pointer-events-none" style={{ background: `radial-gradient(ellipse, ${color}12 0%, transparent 70%)` }} />

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color + '15', border: `1px solid ${color}25` }}>
              <Users className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-[var(--text-primary)] leading-tight truncate max-w-[130px]">{team.name}</p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                {lob?.name || 'Unknown LOB'}{subLob ? ` · ${subLob.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onView(team); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = color + '25'; (e.currentTarget as HTMLElement).style.color = color; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--app-bg-muted)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            {canCreate && (
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--app-bg-muted)'; }}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-8 z-30 rounded-xl overflow-hidden w-36 shadow-lg"
                      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-sm)' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button onClick={() => { setMenuOpen(false); onEdit(team); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--app-surface-hover)]">
                        <Pencil className="w-3.5 h-3.5" style={{ color: '#64D2FF' }} /> Edit Team
                      </button>
                      <button onClick={() => { setMenuOpen(false); onDelete(team); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] transition-colors hover:bg-[var(--app-surface-hover)]"
                        style={{ color: '#FF453A' }}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete Team
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex items-stretch mb-3 py-2 px-1 rounded-xl bg-black/[0.02]" style={{ border: '1px solid var(--app-border)' }}>
          {[
            { label: 'Projects', value: projectCount },
            { label: 'Components', value: componentCount },
            { label: 'Members', value: memberCount },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex-1 flex flex-col items-center justify-center"
              style={{
                borderRight: i < 2 ? '1px solid var(--app-border)' : 'none',
              }}>
              <span className="text-sm font-black text-[var(--text-primary)] leading-none">{value}</span>
              <span className="text-[8.5px] font-bold uppercase mt-1 text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Mini network graph */}
        <div className="overflow-hidden -mt-1.5 mb-2 relative flex items-center justify-center"
          style={{ height: 72 }}>
          <MiniNetGraph team={team} projects={projects} components={components} color={color} />
        </div>

        {/* Status & active */}
        <div className="flex items-center justify-between pt-2.5" style={{ borderTop: '1px solid var(--app-border)' }}>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{
              background: team.is_active ? 'rgba(48,209,88,0.1)' : 'var(--app-bg-muted)',
              border: `1px solid ${team.is_active ? 'rgba(48,209,88,0.2)' : 'var(--app-border)'}`,
            }}>
            <div className="w-1.2 h-1.2 rounded-full" style={{ background: team.is_active ? '#30D158' : 'var(--text-muted)' }} />
            <span className="text-[9.5px] font-bold" style={{ color: team.is_active ? '#30D158' : 'var(--text-muted)' }}>
              {team.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
        </div>
      </div>
    </motion.div>
  );
}

function TeamListRow({ team, lob, subLob, projects, components, canCreate, onEdit, onDelete, onView }: {
  team: Team; lob: Lob | undefined; subLob?: any; projects: Project[]; components: Component[]; canCreate: boolean;
  onEdit: (t: Team) => void; onDelete: (t: Team) => void; onView: (t: Team) => void;
}) {
  const color = team.color || '#0A84FF';
  const teamProjects = projects.filter(p => p.team_id === team.id);
  const teamComponents = components.filter(c => c.team_id === team.id);
  const totalConnectors = teamProjects.reduce((s, p) => s + p.connector_count, 0);
  const totalHealthy = teamProjects.reduce((s, p) => s + p.healthy_count, 0);
  const pct = totalConnectors > 0 ? Math.round((totalHealthy / totalConnectors) * 100) : 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all cursor-pointer group shadow-sm"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      onClick={() => onView(team)}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}35`; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${color}12`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)'; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18', border: `1px solid ${color}30` }}>
        <Users className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{team.name}</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize flex-shrink-0"
            style={{
              background: team.is_active ? 'rgba(48,209,88,0.1)' : 'var(--app-bg-muted)',
              color: team.is_active ? '#30D158' : 'var(--text-muted)',
              border: `1px solid ${team.is_active ? 'rgba(48,209,88,0.2)' : 'var(--app-border)'}`,
            }}>
            {team.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {lob?.name || 'N/A'}{subLob ? ` · ${subLob.name}` : ''} · {team.slug}
        </p>
      </div>
      
      <div className="hidden md:flex items-center gap-2 w-32 flex-shrink-0">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }} />
        </div>
        <span className="text-[11px] w-8 text-right font-bold flex-shrink-0" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
      </div>
      
      <div className="hidden md:flex items-center gap-3 text-[11px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1 font-semibold"><FolderOpen className="w-3.5 h-3.5" />{teamProjects.length}</span>
        <span className="flex items-center gap-1 font-semibold"><Layers className="w-3.5 h-3.5" />{teamComponents.length}</span>
        <span className="flex items-center gap-1 font-semibold"><Users className="w-3.5 h-3.5" />{team.member_count}</span>
      </div>
      
      {canCreate && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(team)}
            className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#64D2FF'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = ''; }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(team)}
            className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = ''; }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
    </motion.div>
  );
}

export function TeamsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const lobIdFilter = searchParams.get('lob_id');
  const canCreate = user ? isLobAdmin(user.role) : false;

  const [teams, setTeams] = useState<Team[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [sublobs, setSublobs] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [healthTrends, setHealthTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [graphTeam, setGraphTeam] = useState<Team | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const search = searchParams.get('search') || '';
  const lobFilter = searchParams.get('lob') || lobIdFilter || '';
  const statusFilter = searchParams.get('status') || '';

  const setSearch = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('search', value); else next.delete('search');
      return next;
    }, { replace: true });
  };

  const setLobFilter = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('lob', value); else next.delete('lob');
      return next;
    }, { replace: true });
  };

  const setStatusFilter = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('status', value); else next.delete('status');
      return next;
    }, { replace: true });
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', slug: '', description: '', lob_id: lobIdFilter || '', sub_lob_id: '', color: '#0A84FF' });
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#0A84FF', is_active: true, lob_id: '', sub_lob_id: '' });

  useEffect(() => {
    setPageTitle('Teams');
    setBreadcrumbs([{ label: 'Teams' }]);
    fetchAll();
  }, [lobIdFilter]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, lobRes, subLobRes, projRes, compRes, statsRes, trendRes] = await Promise.all([
        teamApi.list(lobIdFilter || undefined),
        lobApi.list(),
        subLobApi.list(),
        projectApi.list(),
        componentApi.list(),
        healthApi.stats(),
        healthApi.trends(24),
      ]);
      setTeams(teamRes.data);
      setLobs(lobRes.data);
      setSublobs(subLobRes.data);
      setProjects(projRes.data);
      setComponents(compRes.data);
      setHealthStats(statsRes.data);
      setHealthTrends(trendRes.data || []);
    } catch {
      notify.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [lobIdFilter]);

  const filtered = useMemo(() => {
    let result = [...teams];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    if (lobFilter) result = result.filter(t => t.lob_id === lobFilter);
    if (statusFilter) {
      const wantActive = statusFilter === 'active';
      result = result.filter(t => t.is_active === wantActive);
    }

    result.sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      if (sortField === 'name') { av = a.name; bv = b.name; }
      else if (sortField === 'status') { av = a.is_active ? 1 : 0; bv = b.is_active ? 1 : 0; }
      else if (sortField === 'project_count') { av = a.project_count || 0; bv = b.project_count || 0; }
      else if (sortField === 'member_count') { av = a.member_count || 0; bv = b.member_count || 0; }

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [teams, search, lobFilter, statusFilter, sortField, sortDir]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await teamApi.create(form);
      notify.success('Team created');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', lob_id: lobIdFilter || '', sub_lob_id: '', color: '#0A84FF' });
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to create team', (err as any)?.response?.data?.detail);
    } finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await teamApi.update(editTarget.id, editForm);
      notify.success('Team updated');
      setEditTarget(null);
      fetchAll();
    } catch { notify.error('Failed to update team'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await teamApi.delete(deleteTarget.id);
      notify.success('Team deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch { notify.error('Failed to delete team'); }
    finally { setSaving(false); }
  };

  const openEdit = (team: Team) => {
    setEditTarget(team);
    setEditForm({
      name: team.name,
      description: team.description || '',
      color: team.color,
      is_active: team.is_active,
      lob_id: team.lob_id,
      sub_lob_id: (team as any).sub_lob_id || ''
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const getLobById = (id: string) => lobs.find(l => l.id === id);
  const getSubLobById = (id: string) => sublobs.find(sl => sl.id === id);

  // Stats
  const totalProjects = useMemo(() => teams.reduce((s, t) => s + (t.project_count || 0), 0), [teams]);
  const totalMembers = useMemo(() => teams.reduce((s, t) => s + (t.member_count || 0), 0), [teams]);
  const activeTeams = teams.filter(t => t.is_active).length;

  // Chart data
  const trendData = useMemo(() => {
    if (healthTrends.length > 0) return healthTrends.slice(-12).map((t: any) => ({ time: t.hour || '', score: t.score || t.avg_score || 80 }));
    return Array.from({ length: 12 }, (_, i) => ({ time: `${i * 2}h`, score: 75 + Math.random() * 20 }));
  }, [healthTrends]);

  const lobDistribution = useMemo(() => {
    const counts: Record<string, { name: string; count: number; color: string }> = {};
    teams.forEach(t => {
      const lob = getLobById(t.lob_id);
      if (!counts[t.lob_id]) counts[t.lob_id] = { name: lob?.name || 'Unknown', count: 0, color: lob?.color || '#0A84FF' };
      counts[t.lob_id].count++;
    });
    return Object.values(counts);
  }, [teams, lobs]);

  const statCards = [
    { label: 'Total Teams', value: teams.length, color: '#0A84FF', icon: Users, sub: `${activeTeams} active` },
    { label: 'Total LOBs', value: lobs.length, color: '#30D158', icon: Building2, sub: 'Lines of business' },
    { label: 'Total Projects', value: totalProjects, color: '#FF9F0A', icon: FolderOpen, sub: 'Across all teams' },
    { label: 'Team Members', value: totalMembers, color: '#64D2FF', icon: Activity, sub: 'Total members' },
    { label: 'Health Score', value: healthStats ? `${Math.round(healthStats.avg_health_score || 0)}%` : '--', color: '#FF453A', icon: Zap, sub: 'System health' },
  ];

  return (
    <div className="min-h-screen animate-page-enter" style={{ background: 'transparent' }}>
      {/* Page Title */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight">Teams</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {teams.length} team{teams.length !== 1 ? 's' : ''} across {lobs.length} lines of business
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAll}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
              style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--app-surface-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-muted)'; }}
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {canCreate && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #0A84FF, #0066CC)', boxShadow: '0 4px 16px rgba(10,132,255,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(10,132,255,0.5)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(10,132,255,0.3)'; }}
              >
                <Plus className="w-4 h-4" /> New Team
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {statCards.map(({ label, value, color, icon: Icon, sub }, idx) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.07 }}
            className="relative rounded-2xl p-3.5 overflow-hidden shadow-sm hover:scale-[1.02] transition-transform duration-200"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${color}10 0%, transparent 70%)`, transform: 'translate(20%, -20%)' }} />
            
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: color + '15', border: `1px solid ${color}25` }}>
                <Icon className="w-4.5 h-4.5" style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-black text-[var(--text-primary)] leading-none">{value}</p>
                <p className="text-[10.5px] font-extrabold uppercase mt-1 tracking-wider leading-none" style={{ color }}>{label}</p>
                <p className="text-[9.5px] mt-1 leading-none truncate" style={{ color: 'var(--text-muted)' }}>{sub}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-8 py-2 text-[13px] rounded-xl outline-none transition-all w-56"
            style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#0A84FF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(10,132,255,0.15)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.boxShadow = ''; }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={lobFilter}
          onChange={e => setLobFilter(e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: lobFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          <option value="">All LOBs</option>
          {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: statusFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {(search || lobFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setLobFilter(''); setStatusFilter(''); }}
            className="text-[12px] flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FF453A'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-xl p-1"
          style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg-muted)' }}>
          {(['card', 'list', 'table'] as ViewMode[]).map((m) => {
            const Icon = m === 'card' ? LayoutGrid : m === 'list' ? List : TableIcon;
            return (
              <button key={m} onClick={() => setViewMode(m)}
                className="p-1.5 rounded-lg transition-all"
                style={viewMode === m ? { background: '#0A84FF', color: '#fff' } : { color: 'var(--text-secondary)' }}>
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid / List / Table views */}
      {loading ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl h-72 shimmer-bg" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl shimmer-bg" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}>
          <EmptyState
            icon={Users}
            title={search || lobFilter || statusFilter ? 'No teams match your filters' : 'No teams yet'}
            description={search || lobFilter || statusFilter ? 'Try adjusting your search or filters.' : 'Create your first team to organize projects.'}
            action={canCreate && !search && !lobFilter && !statusFilter ? (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #0A84FF, #0066CC)' }}
              >
                <Plus className="w-4 h-4" /> New Team
              </button>
            ) : undefined}
          />
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {filtered.map(team => (
              <TeamCard
                key={team.id}
                team={team}
                lob={getLobById(team.lob_id)}
                subLob={getSubLobById((team as any).sub_lob_id)}
                projects={projects}
                components={components}
                canCreate={canCreate}
                onEdit={openEdit}
                onDelete={t => setDeleteTarget(t)}
                onView={t => setGraphTeam(t)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-2">
          {filtered.map(team => (
            <TeamListRow
              key={team.id}
              team={team}
              lob={getLobById(team.lob_id)}
              subLob={getSubLobById((team as any).sub_lob_id)}
              projects={projects}
              components={components}
              canCreate={canCreate}
              onEdit={openEdit}
              onDelete={t => setDeleteTarget(t)}
              onView={t => setGraphTeam(t)}
            />
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--app-border)', background: 'var(--app-bg-muted)' }}>
                  {(['name', 'LOB', 'status', 'projects', 'components', 'health', 'members'] as any[]).map((col, i) => (
                    <th key={i} className="text-left px-4 py-3">
                      {['name', 'status', 'projects', 'members'].includes(col) ? (
                        <button onClick={() => handleSort(col === 'status' ? 'status' : col === 'projects' ? 'project_count' : col === 'members' ? 'member_count' : 'name')}
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors select-none"
                          style={{ color: (sortField === 'name' && col === 'name') || (sortField === 'status' && col === 'status') || (sortField === 'project_count' && col === 'projects') || (sortField === 'member_count' && col === 'members') ? '#0A84FF' : 'var(--text-secondary)' }}>
                          {col === 'projects' ? 'Projects' : col === 'members' ? 'Members' : col.charAt(0).toUpperCase() + col.slice(1)}
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{col}</span>
                      )}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((team, idx) => {
                  const teamProjects = projects.filter(p => p.team_id === team.id);
                  const teamComponents = components.filter(c => c.team_id === team.id);
                  const totalConnectors = teamProjects.reduce((s, p) => s + p.connector_count, 0);
                  const totalHealthy = teamProjects.reduce((s, p) => s + p.healthy_count, 0);
                  const pct = totalConnectors > 0 ? Math.round((totalHealthy / totalConnectors) * 100) : 100;
                  const color = team.color || '#0A84FF';
                  return (
                    <tr key={team.id}
                      className={cn('cursor-pointer transition-all group', idx !== filtered.length - 1 && 'border-b')}
                      style={{ borderColor: 'var(--app-border)' }}
                      onClick={() => setGraphTeam(team)}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--app-surface-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
                            <Users className="w-3.5 h-3.5" style={{ color }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{team.name}</p>
                            <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{team.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--text-primary)]">
                          {getLobById(team.lob_id)?.name || 'N/A'}
                          {(team as any).sub_lob_id && getSubLobById((team as any).sub_lob_id) ? ` · ${getSubLobById((team as any).sub_lob_id)?.name}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full capitalize"
                          style={{
                            background: team.is_active ? 'rgba(48,209,88,0.1)' : 'var(--app-bg-muted)',
                            color: team.is_active ? '#30D158' : 'var(--text-muted)',
                            border: `1px solid ${team.is_active ? 'rgba(48,209,88,0.2)' : 'var(--app-border)'}`,
                          }}>
                          {team.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--text-primary)]">{teamProjects.length}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--text-primary)]">{teamComponents.length}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }} />
                          </div>
                          <span className="text-[11px] w-8 text-right font-bold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--text-primary)]">{team.member_count}</span></td>
                      <td className="px-4 py-3 text-right">
                        {canCreate && (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEdit(team)}
                              className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#64D2FF'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = ''; }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(team)}
                              className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = ''; }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
        {/* Trend chart */}
        {/* Trend chart */}
        <div className="md:col-span-2 rounded-2xl p-5 shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-sm)' }}>
          <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Health Trend</p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>System health score over last 24h</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A84FF" stopOpacity="0.35" />
                  <stop offset="95%" stopColor="#0A84FF" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <RechartTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#0A84FF" strokeWidth={2} fill="url(#trendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* LOB distribution */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-sm)' }}>
          <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">LOB Distribution</p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>Teams per line of business</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={lobDistribution} dataKey="count" innerRadius={30} outerRadius={55} paddingAngle={3}>
                {lobDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={0.9} />
                ))}
              </Pie>
              <RechartTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }}
                formatter={(v: any, n: any, p: any) => [v, p.payload.name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {lobDistribution.slice(0, 4).map(({ name, count, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[11px] truncate max-w-[110px]" style={{ color: 'var(--text-secondary)' }}>{name}</span>
                </div>
                <span className="text-[11px] font-bold text-[var(--text-primary)]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graph popup */}
      {graphTeam && (
        <TeamGraphPopup
          team={graphTeam}
          projects={projects}
          components={components}
          lob={getLobById(graphTeam.lob_id)}
          onClose={() => setGraphTeam(null)}
        />
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Team"
        subtitle="Organize projects under a team within a LOB"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-team-form" loading={saving}>Create Team</Button>
          </>
        }
      >
        <form id="create-team-form" onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Line of Business"
            value={form.lob_id}
            onChange={e => setForm({ ...form, lob_id: e.target.value, sub_lob_id: '' })}
            options={[{ value: '', label: 'Select a LOB...' }, ...lobs.map(l => ({ value: l.id, label: l.name }))]}
            required
          />
          {form.lob_id && (
            <Select
              label="Sub-Line of Business"
              value={form.sub_lob_id}
              onChange={e => setForm({ ...form, sub_lob_id: e.target.value })}
              options={[{ value: '', label: 'Select a Sub-LOB...' }, ...sublobs.filter(sl => sl.lob_id === form.lob_id).map(sl => ({ value: sl.id, label: sl.name }))]}
              required
            />
          )}
          <Input label="Team Name" placeholder="e.g., Platform Engineering"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} required />
          <Input label="Slug" placeholder="platform-engineering"
            value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} required />
          <TextArea label="Description" placeholder="Optional description..."
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div>
            <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  className={cn('w-7 h-7 rounded-lg border-2 transition-all', form.color === c ? 'scale-110' : 'border-transparent hover:scale-105')}
                  style={{ background: c, borderColor: form.color === c ? 'white' : 'transparent' }} />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Team"
        subtitle="Update team details"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-team-form" loading={saving}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-team-form" onSubmit={handleEdit} className="space-y-4">
          <Select
            label="Line of Business"
            value={editForm.lob_id}
            onChange={e => setEditForm({ ...editForm, lob_id: e.target.value, sub_lob_id: '' })}
            options={[{ value: '', label: 'Select a LOB...' }, ...lobs.map(l => ({ value: l.id, label: l.name }))]}
            required
          />
          {editForm.lob_id && (
            <Select
              label="Sub-Line of Business"
              value={editForm.sub_lob_id}
              onChange={e => setEditForm({ ...editForm, sub_lob_id: e.target.value })}
              options={[{ value: '', label: 'Select a Sub-LOB...' }, ...sublobs.filter(sl => sl.lob_id === editForm.lob_id).map(sl => ({ value: sl.id, label: sl.name }))]}
              required
            />
          )}
          <Input label="Team Name" value={editForm.name}
            onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
          <TextArea label="Description" value={editForm.description}
            onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
          <div>
            <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setEditForm({ ...editForm, color: c })}
                  className={cn('w-7 h-7 rounded-lg border-2 transition-all', editForm.color === c ? 'scale-110' : 'border-transparent hover:scale-105')}
                  style={{ background: c, borderColor: editForm.color === c ? 'white' : 'transparent' }} />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Team"
        message={`Delete "${deleteTarget?.name}"? All project assignments and member associations will be removed.`}
        confirmLabel="Delete"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
