import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Layers, Trash2, Pencil, Search, X, ChevronRight,
  RefreshCw, Eye, Users, FolderOpen, Building2, Activity,
  Network, Zap, MoveVertical as MoreVertical, Box,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip,
  XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  MarkerType, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { useUIStore } from '@/store/uiStore';
import { componentApi, teamApi, lobApi, projectApi, healthApi } from '@/lib/api';
import { Component, Team, Lob, Project } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { canManageProjects } from '@/lib/permissions';

const PRESET_COLORS = [
  '#0A84FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

const NODE_ICONS: Record<string, string> = {
  component:'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
  project:  'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  team:     'M5 2a2 2 0 110 4 2 2 0 010-4zM2 8c0-1 1.1-2 3-2s3 1 3 2v.5H2V8zm6-6a2 2 0 110 4 2 2 0 010-4zm1 6c.7.3 1 .8 1 1.5v.5H7.2V9c0-.7.3-1.2.8-1.5z',
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

function MiniComponentGraph({ component, projects, team }: {
  component: Component; projects: Project[]; team: Team | undefined;
}) {
  const W = 260; const H = 72;
  const color = component.color || '#64D2FF';

  const nodes = useMemo(() => {
    const compProjects = projects.filter(p => p.team_id === component.team_id).slice(0, 4);
    const synthProjects = compProjects.length > 0 ? compProjects :
      Array.from({ length: Math.min(component.project_count || 2, 4) }, (_, i) => ({ id: `sp${i}`, name: `Proj ${i + 1}` }));

    const all: any[] = [];
    all.push({ id: 'comp', type: 'component', label: component.name.slice(0, 10), x: 22, y: H / 2 });
    if (team) {
      all.push({ id: 'team', type: 'team', label: team.name.slice(0, 8), x: 120, y: H / 2 });
    }
    const pCount = synthProjects.length;
    synthProjects.forEach((p, i) => {
      const y = pCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(pCount - 1, 1);
      all.push({ id: `p${i}`, type: 'project', label: (p.name as string).slice(0, 8), x: team ? 218 : 140, y });
    });
    return all;
  }, [component, projects, team]);

  const edges = useMemo(() => {
    const lines: any[] = [];
    const compNode = nodes.find(n => n.id === 'comp');
    const teamNode = nodes.find(n => n.id === 'team');
    const projNodes = nodes.filter(n => n.id.startsWith('p'));
    if (!compNode) return lines;
    if (teamNode) {
      lines.push({ x1: compNode.x, y1: compNode.y, x2: teamNode.x, y2: teamNode.y, key: 'ct' });
      projNodes.forEach(p => lines.push({ x1: teamNode.x, y1: teamNode.y, x2: p.x, y2: p.y, key: `tp-${p.id}` }));
    } else {
      projNodes.forEach(p => lines.push({ x1: compNode.x, y1: compNode.y, x2: p.x, y2: p.y, key: `cp-${p.id}` }));
    }
    return lines;
  }, [nodes]);

  const nodeColor: Record<string, string> = {
    component: color,
    team: '#0A84FF',
    project: '#30D158',
  };

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`blur-${component.id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
        </filter>
        {nodes.map(n => (
          <radialGradient key={`cgrad-${n.id}`} id={`cgrad-${n.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={nodeColor[n.type]} stopOpacity="1.0" />
            <stop offset="100%" stopColor={nodeColor[n.type]} stopOpacity="0.7" />
          </radialGradient>
        ))}
      </defs>
      {edges.map((e: any) => (
        <g key={e.key}>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={color} strokeOpacity="0.22" strokeWidth="3"
            filter={`url(#blur-${component.id})`} />
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={color} strokeOpacity="0.65" strokeWidth="1.2" strokeDasharray="3 3" />
        </g>
      ))}
      {nodes.map(n => {
        const r = n.type === 'component' ? 11 : 8.5;
        const nc = nodeColor[n.type];
        const iconPath = NODE_ICONS[n.type] || NODE_ICONS.component;
        const iconScale = n.type === 'component' ? 0.85 : 0.65;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r + 5} fill={nc} fillOpacity="0.22" filter={`url(#blur-${component.id})`} />
            <circle cx={n.x} cy={n.y} r={r + 1.5} fill="none" stroke={nc} strokeOpacity="0.65" strokeWidth="1" />
            <circle cx={n.x} cy={n.y} r={r} fill="var(--app-surface)" />
            <circle cx={n.x} cy={n.y} r={r} fill={`url(#cgrad-${n.id})`} />
            <g transform={`translate(${n.x - 6 * iconScale},${n.y - 6 * iconScale}) scale(${iconScale})`}>
              <path d={iconPath} fill="white" opacity="0.95" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function FlowComponentNode({ data }: { data: any }) {
  const COLORS: Record<string, string> = {
    component: '#64D2FF', project: '#30D158', team: '#0A84FF', lob: '#FF9F0A',
  };
  const c = COLORS[data.type] || '#64D2FF';
  const Icon = data.type === 'component' ? Layers : data.type === 'project' ? FolderOpen : data.type === 'team' ? Users : Building2;
  return (
    <div className="px-3 py-2 rounded-xl flex items-center gap-2 select-none shadow-sm"
      style={{ background: 'var(--app-surface)', border: `1px solid ${c}50`, minWidth: 120 }}>
      <Handle type="target" position={Position.Left} style={{ background: c, width: 6, height: 6, border: 'none' }} />
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c}15` }}>
        <Icon className="w-3.5 h-3.5" style={{ color: c }} />
      </div>
      <div>
        <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: c }}>{data.type}</p>
        <p className="text-[10px] font-semibold text-[var(--text-primary)] leading-tight">{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: c, width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const compNodeTypes = { compNode: FlowComponentNode };

function ComponentGraphPopup({ component, projects, team, lob, onClose }: {
  component: Component; projects: Project[];
  team: Team | undefined; lob: Lob | undefined; onClose: () => void;
}) {
  const compProjects = projects.filter(p => p.team_id === component.team_id);

  const rawNodes = useMemo(() => {
    const ns: any[] = [];
    if (lob) ns.push({ id: 'lob', type: 'compNode', data: { type: 'lob', label: lob.name }, position: { x: 0, y: 0 } });
    if (team) ns.push({ id: 'team', type: 'compNode', data: { type: 'team', label: team.name }, position: { x: 0, y: 0 } });
    ns.push({ id: 'comp', type: 'compNode', data: { type: 'component', label: component.name }, position: { x: 0, y: 0 } });
    compProjects.slice(0, 5).forEach(p => {
      ns.push({ id: `proj-${p.id}`, type: 'compNode', data: { type: 'project', label: p.name }, position: { x: 0, y: 0 } });
    });
    return ns;
  }, [component, lob, team, compProjects]);

  const rawEdges = useMemo(() => {
    const es: any[] = [];
    if (lob && team) {
      es.push({ id: 'e-lob-team', source: 'lob', target: 'team', animated: true, style: { stroke: '#FF9F0A', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#FF9F0A' } });
    }
    if (team) {
      es.push({ id: 'e-team-comp', source: 'team', target: 'comp', animated: true, style: { stroke: '#0A84FF', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0A84FF' } });
    }
    compProjects.slice(0, 5).forEach(p => {
      es.push({ id: `e-comp-${p.id}`, source: 'comp', target: `proj-${p.id}`, animated: true, style: { stroke: '#30D158', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#30D158' } });
    });
    return es;
  }, [component, team, lob, compProjects]);

  const [nodes, , onNodesChange] = useNodesState(layoutGraph(rawNodes, rawEdges));
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);
  const color = component.color || '#64D2FF';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="relative rounded-2xl overflow-hidden w-full max-w-4xl shadow-xl"
          style={{
            background: 'var(--app-surface)', border: '1px solid var(--app-border)',
            boxShadow: `0 0 80px ${color}15, var(--shadow-sm)`,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + '20', border: `1px solid ${color}40` }}>
                <Layers className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-[var(--text-primary)]">{component.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {lob?.name || 'N/A'}{team ? ` · ${team.name}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex gap-4">
                {[
                  { label: 'Projects', val: compProjects.length || component.project_count || 0, color: '#30D158' },
                  { label: 'Team', val: team?.name?.slice(0, 8) || 'N/A', color: '#0A84FF' },
                  { label: 'Status', val: component.is_active ? 'Active' : 'Inactive', color: component.is_active ? '#30D158' : 'var(--text-muted)' },
                ].map(({ label, val, color: c }) => (
                  <div key={label} className="text-center">
                    <p className="text-[18px] font-bold" style={{ color: c }}>{val}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  </div>
                ))}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all" style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div style={{ height: 420 }}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              nodeTypes={compNodeTypes} fitView style={{ background: 'transparent' }}>
              <Background color="var(--app-border)" gap={24} />
              <Controls style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)' }} />
            </ReactFlow>
          </div>
          <div className="px-6 py-3 flex items-center gap-6" style={{ borderTop: '1px solid var(--app-border)' }}>
            {[{ color: '#FF9F0A', label: 'LOB' }, { color: '#0A84FF', label: 'Team' }, { color, label: 'Component' }, { color: '#30D158', label: 'Projects' }].map(({ color: c, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ComponentCard({ component, team, lob, projects, canCreate, onEdit, onDelete, onView, onNavigate }: {
  component: Component; team: Team | undefined; lob: Lob | undefined; projects: Project[];
  canCreate: boolean;
  onEdit: (c: Component) => void; onDelete: (c: Component) => void;
  onView: (c: Component) => void; onNavigate: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const color = component.color || '#64D2FF';
  const compProjects = projects.filter(p => p.team_id === component.team_id);
  const projectCount = compProjects.length || component.project_count || 0;

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
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 48px rgba(0,0,0,0.08), 0 0 24px ${color}18`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}35`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
      }}
      onClick={() => onNavigate(component.id)}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 rounded-full pointer-events-none" style={{ background: `radial-gradient(ellipse, ${color}12 0%, transparent 70%)` }} />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color + '18', border: `1px solid ${color}35` }}>
              <Layers className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[var(--text-primary)] leading-tight truncate max-w-[130px]">{component.name}</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                {team?.name || 'Unknown Team'} {lob ? `· ${lob.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onView(component); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = color + '25'; (e.currentTarget as HTMLElement).style.color = color; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--app-bg-muted)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}>
              <Eye className="w-3.5 h-3.5" />
            </button>
            {canCreate && (
              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--app-bg-muted)'; }}>
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-8 z-30 rounded-xl overflow-hidden w-36 shadow-lg"
                      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-sm)' }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setMenuOpen(false); onEdit(component); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--app-surface-hover)]">
                        <Pencil className="w-3.5 h-3.5" style={{ color: '#64D2FF' }} /> Edit
                      </button>
                      <button onClick={() => { setMenuOpen(false); onDelete(component); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] transition-colors hover:bg-[var(--app-surface-hover)]"
                        style={{ color: '#FF453A' }}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex items-stretch mb-3 py-1">
          {[
            { label: 'Projects', value: projectCount },
            { label: 'Team', value: team?.member_count || 0 },
            { label: 'LOB', value: lob?.project_count || 0 },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex-1 flex flex-col items-center justify-center"
              style={{ borderRight: i < 2 ? '1px solid var(--app-border)' : 'none' }}>
              <span className="text-xl font-bold text-[var(--text-primary)] leading-none">{value}</span>
              <span className="text-[10px] font-semibold mt-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Mini graph */}
        <div className="overflow-hidden -mt-2.5 mb-3 relative flex items-center justify-center"
          style={{ height: 72 }}>
          <MiniComponentGraph component={component} projects={projects} team={team} />
        </div>

        {/* Description */}
        {component.description && (
          <p className="text-[11px] mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{component.description}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--app-border)' }}>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: component.is_active ? 'rgba(48,209,88,0.12)' : 'var(--app-bg-muted)',
              border: `1px solid ${component.is_active ? 'rgba(48,209,88,0.3)' : 'var(--app-border)'}`,
            }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: component.is_active ? '#30D158' : 'var(--text-muted)' }} />
            <span className="text-[10px] font-semibold" style={{ color: component.is_active ? '#30D158' : 'var(--text-muted)' }}>
              {component.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </div>
      </div>
    </motion.div>
  );
}

export function ComponentsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamIdFilter = searchParams.get('team_id');
  const canCreate = user ? canManageProjects(user.role) : false;

  const [components, setComponents] = useState<Component[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [healthTrends, setHealthTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [graphComponent, setGraphComponent] = useState<Component | null>(null);

  const search = searchParams.get('search') || '';
  const teamFilter = searchParams.get('team') || teamIdFilter || '';
  const lobFilter = searchParams.get('lob') || '';

  const setSearch = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('search', value); else next.delete('search');
      return next;
    }, { replace: true });
  };

  const setTeamFilter = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('team', value); else next.delete('team');
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

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Component | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Component | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', slug: '', description: '', team_id: teamIdFilter || '', color: '#64D2FF', icon: 'layers',
  });
  const [editForm, setEditForm] = useState({
    name: '', description: '', color: '#64D2FF', icon: 'layers', is_active: true,
  });

  useEffect(() => {
    setPageTitle('Components');
    setBreadcrumbs([{ label: 'Components' }]);
    fetchAll();
  }, [teamIdFilter]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, teamRes, lobRes, projRes, statsRes, trendRes] = await Promise.all([
        componentApi.list(),
        teamApi.list(),
        lobApi.list(),
        projectApi.list(),
        healthApi.stats(),
        healthApi.trends(24),
      ]);
      setComponents(compRes.data);
      setTeams(teamRes.data);
      setLobs(lobRes.data);
      setProjects(projRes.data);
      setHealthStats(statsRes.data);
      setHealthTrends(trendRes.data || []);
    } catch {
      notify.error('Failed to load components');
    } finally {
      setLoading(false);
    }
  }, [teamIdFilter]);

  const filtered = useMemo(() => {
    let result = [...components];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
      );
    }
    if (teamFilter) result = result.filter(c => c.team_id === teamFilter);
    if (lobFilter) result = result.filter(c => c.lob_id === lobFilter);
    return result;
  }, [components, search, teamFilter, lobFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const selectedTeam = teams.find(t => t.id === form.team_id);
    if (!selectedTeam) {
      notify.error('Please select a valid Team');
      setSaving(false);
      return;
    }
    try {
      await componentApi.create({ ...form, lob_id: selectedTeam.lob_id });
      notify.success('Component created');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', team_id: teamIdFilter || '', color: '#64D2FF', icon: 'layers' });
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to create component', (err as any)?.response?.data?.detail);
    } finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await componentApi.update(editTarget.id, editForm);
      notify.success('Component updated');
      setEditTarget(null);
      fetchAll();
    } catch { notify.error('Failed to update component'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await componentApi.delete(deleteTarget.id);
      notify.success('Component deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch { notify.error('Failed to delete component'); }
    finally { setSaving(false); }
  };

  const openEdit = (comp: Component) => {
    setEditTarget(comp);
    setEditForm({ name: comp.name, description: comp.description || '', color: comp.color, icon: comp.icon || 'layers', is_active: comp.is_active });
  };

  const getTeamById = (id: string) => teams.find(t => t.id === id);
  const getLobById = (id: string) => lobs.find(l => l.id === id);

  // Summary
  const activeComponents = components.filter(c => c.is_active).length;
  const totalProjects = useMemo(() => components.reduce((s, c) => s + (c.project_count || 0), 0), [components]);
  const uniqueLobs = useMemo(() => new Set(components.map(c => c.lob_id)).size, [components]);

  const trendData = useMemo(() => {
    if (healthTrends.length > 0) return healthTrends.slice(-12).map((t: any) => ({ time: t.hour || '', score: t.score || t.avg_score || 80 }));
    return Array.from({ length: 12 }, (_, i) => ({ time: `${i * 2}h`, score: 72 + Math.random() * 22 }));
  }, [healthTrends]);

  const lobDist = useMemo(() => {
    const counts: Record<string, { name: string; count: number; color: string }> = {};
    components.forEach(c => {
      const lob = getLobById(c.lob_id);
      if (!counts[c.lob_id]) counts[c.lob_id] = { name: lob?.name || 'Unknown', count: 0, color: lob?.color || '#64D2FF' };
      counts[c.lob_id].count++;
    });
    return Object.values(counts);
  }, [components, lobs]);

  const teamDist = useMemo(() => {
    const counts: Record<string, { name: string; count: number; color: string }> = {};
    components.forEach(c => {
      const team = getTeamById(c.team_id);
      if (!counts[c.team_id]) counts[c.team_id] = { name: team?.name || 'Unknown', count: 0, color: team?.color || '#64D2FF' };
      counts[c.team_id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [components, teams]);

  const statCards = [
    { label: 'Total Components', value: components.length, color: '#64D2FF', icon: Layers, sub: `${activeComponents} active` },
    { label: 'Total Teams', value: teams.length, color: '#0A84FF', icon: Users, sub: 'Across all LOBs' },
    { label: 'Total LOBs', value: uniqueLobs, color: '#FF9F0A', icon: Building2, sub: 'Lines of business' },
    { label: 'Total Projects', value: totalProjects, color: '#30D158', icon: FolderOpen, sub: 'Linked projects' },
    { label: 'Health Score', value: healthStats ? `${Math.round(healthStats.avg_health_score || 0)}%` : '--', color: '#FF453A', icon: Activity, sub: 'System health' },
  ];

  return (
    <div className="min-h-screen animate-page-enter">
      {/* Title */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight">Components</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {components.length} component{components.length !== 1 ? 's' : ''} organized under Teams & LOBs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
              style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--app-surface-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-muted)'; }}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {canCreate && (
              <button onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #64D2FF, #0A84FF)', boxShadow: '0 4px 16px rgba(100,210,255,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(100,210,255,0.5)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(100,210,255,0.3)'; }}>
                <Plus className="w-4 h-4" /> New Component
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {statCards.map(({ label, value, color, icon: Icon, sub }, idx) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}
            className="relative rounded-2xl p-4 overflow-hidden shadow-sm"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${color}12 0%, transparent 70%)`, transform: 'translate(20%, -20%)' }} />
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
              style={{ background: color + '18', border: `1px solid ${color}30` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-2xl font-black text-[var(--text-primary)] leading-none">{value}</p>
            <p className="text-[11px] font-semibold mt-1" style={{ color }}>{label}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search components..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-8 py-2 text-[13px] rounded-xl outline-none transition-all w-56"
            style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#64D2FF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(100,210,255,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.boxShadow = ''; }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select value={lobFilter} onChange={e => setLobFilter(e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: lobFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <option value="">All LOBs</option>
          {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: teamFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <option value="">All Teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {(search || teamFilter || lobFilter) && (
          <button
            onClick={() => {
              setSearchParams(prev => {
                const next = new URLSearchParams();
                if (prev.get('team_id')) next.set('team_id', prev.get('team_id')!);
                return next;
              }, { replace: true });
            }}
            className="flex items-center gap-1 text-[12px] px-2 py-1.5 rounded-lg transition-all"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FF453A'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = ''; }}>
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        <span className="ml-auto text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} of {components.length} components
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-2xl h-80 shimmer-bg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}>
          <EmptyState icon={Layers}
            title={search || teamFilter || lobFilter ? 'No components match your filters' : 'No components yet'}
            description={search || teamFilter || lobFilter ? 'Try adjusting your filters.' : 'Create your first component to group and manage projects.'}
            action={canCreate && !search && !teamFilter && !lobFilter ? (
              <button onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #64D2FF, #0A84FF)' }}>
                <Plus className="w-4 h-4" /> New Component
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {filtered.map(comp => (
              <ComponentCard
                key={comp.id}
                component={comp}
                team={getTeamById(comp.team_id)}
                lob={getLobById(comp.lob_id)}
                projects={projects}
                canCreate={canCreate}
                onEdit={openEdit}
                onDelete={c => setDeleteTarget(c)}
                onView={c => setGraphComponent(c)}
                onNavigate={id => navigate(`/components/${id}`)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Bottom analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
        {/* Trend */}
        <div className="md:col-span-2 rounded-2xl p-5 shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Health Trend</p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>System health score over last 24h</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="compTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#64D2FF" stopOpacity="0.35" />
                  <stop offset="95%" stopColor="#64D2FF" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <RechartTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#64D2FF" strokeWidth={2} fill="url(#compTrendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Team distribution */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">By Team</p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>Components per team</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={teamDist} margin={{ top: 0, right: 0, bottom: 0, left: -28 }} barSize={10}>
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => v.slice(0, 6)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
              <RechartTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {teamDist.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {teamDist.slice(0, 4).map(({ name, count, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[11px] truncate max-w-[110px]" style={{ color: 'var(--text-secondary)' }}>{name}</span>
                </div>
                <span className="text-[11px] font-bold text-[var(--text-primary)]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graph popup */}
      {graphComponent && (
        <ComponentGraphPopup
          component={graphComponent}
          projects={projects}
          team={getTeamById(graphComponent.team_id)}
          lob={getLobById(graphComponent.lob_id)}
          onClose={() => setGraphComponent(null)}
        />
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Component"
        subtitle="Organize team projects into a logical component wrapper"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-comp-form" loading={saving}>Create Component</Button>
          </>
        }>
        <form id="create-comp-form" onSubmit={handleCreate} className="space-y-4">
          <Select label="Associated Team" value={form.team_id}
            onChange={e => setForm({ ...form, team_id: e.target.value })}
            options={[{ value: '', label: 'Select a Team...' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
            required />
          <Input label="Component Name" placeholder="e.g., Core API Suite"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} required />
          <Input label="Slug" placeholder="core-api-suite"
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
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Component"
        subtitle="Update component metadata"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-comp-form" loading={saving}>Save Changes</Button>
          </>
        }>
        <form id="edit-comp-form" onSubmit={handleEdit} className="space-y-4">
          <Input label="Component Name" value={editForm.name}
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
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Component"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Projects belonging to this component will be unassigned but NOT deleted.`}
        confirmLabel="Delete Component" variant="danger" loading={saving}
      />
    </div>
  );
}
