import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, FolderOpen, Plug, CircleCheck as CheckCircle,
  TriangleAlert as AlertTriangle, CircleAlert as AlertCircle,
  Trash2, Pencil, LayoutGrid, List, Table as TableIcon,
  Search, X, Users, ChevronRight, ArrowUpDown, RefreshCw,
  Eye, Activity, Layers, Building2, Zap, MoveVertical as MoreVertical, Network,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip,
  XAxis, YAxis, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  MarkerType, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { useUIStore } from '@/store/uiStore';
import { projectApi, lobApi, teamApi, componentApi, healthApi } from '@/lib/api';
import { Project, Lob, Team, Component } from '@/types';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { isLobAdmin } from '@/lib/permissions';
import { RegistrationWizard } from '@/components/project/RegistrationWizard';

type ViewMode = 'card' | 'list' | 'table';
type SortField = 'name' | 'status' | 'connector_count' | 'member_count' | 'created_at';

const STATUS_OPTIONS = ['active', 'inactive', 'maintenance', 'archived'];
const ENV_OPTIONS = ['production', 'staging', 'development', 'testing'];

const STATUS_COLORS: Record<string, string> = {
  active: '#30D158', inactive: '#566F8A', maintenance: '#FF9F0A', archived: '#FF453A',
};
const ENV_COLORS: Record<string, string> = {
  production: '#0A84FF', staging: '#FF9F0A', development: '#30D158', testing: '#64D2FF',
};

const NODE_ICONS: Record<string, string> = {
  project:  'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  component:'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
  connector:'M3 2h6v1H3V2zm0 2h6v1H3V4zM2 1h8v8H2V1zm1 1v6h6V2H3zm2 7h2v1H5V9z',
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

function MiniProjectGraph({ project, components }: { project: Project; components: Component[] }) {
  const W = 260; const H = 72;
  const color = project.color || '#30D158';

  const nodes = useMemo(() => {
    const projComps = components.filter(c => c.team_id === project.team_id).slice(0, 4);
    const synthComps = projComps.length > 0 ? projComps :
      Array.from({ length: Math.min(3, 4) }, (_, i) => ({ id: `sc${i}`, name: `Comp ${i + 1}` }));
    const all: any[] = [];
    all.push({ id: 'project', type: 'project', label: project.name.slice(0, 10), x: 22, y: H / 2 });
    const cCount = synthComps.length;
    synthComps.forEach((c, i) => {
      const y = cCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(cCount - 1, 1);
      all.push({ id: `c${i}`, type: 'component', label: (c.name as string).slice(0, 8), x: 140, y });
    });
    // Fake connector nodes
    const connCount = Math.min(project.connector_count || 2, 3);
    Array.from({ length: connCount }).forEach((_, i) => {
      const y = connCount === 1 ? H / 2 : 12 + (i * (H - 24)) / Math.max(connCount - 1, 1);
      all.push({ id: `conn${i}`, type: 'connector', label: `Conn${i + 1}`, x: 232, y });
    });
    return all;
  }, [project, components]);

  const edges = useMemo(() => {
    const lines: any[] = [];
    const projNode = nodes.find(n => n.id === 'project');
    const compNodes = nodes.filter(n => n.id.startsWith('c'));
    const connNodes = nodes.filter(n => n.id.startsWith('conn'));
    if (!projNode) return lines;
    compNodes.forEach(c => lines.push({ x1: projNode.x, y1: projNode.y, x2: c.x, y2: c.y, key: `pc-${c.id}` }));
    compNodes.forEach((c, ci) => {
      connNodes.forEach((cn, cni) => {
        if (ci === 0 || cni === ci || cni === ci - 1) {
          lines.push({ x1: c.x, y1: c.y, x2: cn.x, y2: cn.y, key: `cc-${c.id}-${cn.id}` });
        }
      });
    });
    return lines;
  }, [nodes]);

  const nodeColor: Record<string, string> = {
    project: color,
    component: '#64D2FF',
    connector: '#FF9F0A',
  };

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`blur-${project.id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
        </filter>
        {nodes.map(n => (
          <radialGradient key={`grad-${n.id}`} id={`pgrad-${n.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={nodeColor[n.type]} stopOpacity="1.0" />
            <stop offset="100%" stopColor={nodeColor[n.type]} stopOpacity="0.7" />
          </radialGradient>
        ))}
      </defs>
      {edges.map((e: any) => (
        <g key={e.key}>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={color} strokeOpacity="0.22" strokeWidth="3"
            filter={`url(#blur-${project.id})`} />
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={color} strokeOpacity="0.65" strokeWidth="1.2" strokeDasharray="3 3" />
        </g>
      ))}
      {nodes.map(n => {
        const r = n.type === 'project' ? 11 : 8.5;
        const nc = nodeColor[n.type];
        const iconPath = NODE_ICONS[n.type] || NODE_ICONS.component;
        const iconScale = n.type === 'project' ? 0.85 : 0.65;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r + 5} fill={nc} fillOpacity="0.22" filter={`url(#blur-${project.id})`} />
            <circle cx={n.x} cy={n.y} r={r + 1.5} fill="none" stroke={nc} strokeOpacity="0.65" strokeWidth="1" />
            <circle cx={n.x} cy={n.y} r={r} fill="var(--app-surface)" />
            <circle cx={n.x} cy={n.y} r={r} fill={`url(#pgrad-${n.id})`} />
            <g transform={`translate(${n.x - 6 * iconScale},${n.y - 6 * iconScale}) scale(${iconScale})`}>
              <path d={iconPath} fill="white" opacity="0.95" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function FlowProjectNode({ data }: { data: any }) {
  const COLORS: Record<string, string> = {
    project: '#30D158', component: '#64D2FF', connector: '#FF9F0A', team: '#0A84FF',
  };
  const c = COLORS[data.type] || '#30D158';
  const Icon = data.type === 'project' ? FolderOpen : data.type === 'component' ? Layers : data.type === 'team' ? Users : Plug;
  return (
    <div className="px-3 py-2 rounded-xl flex items-center gap-2 select-none"
      style={{ background: `${c}18`, border: `1px solid ${c}50`, boxShadow: `0 0 10px ${c}20`, minWidth: 120 }}>
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

const projNodeTypes = { projNode: FlowProjectNode };

function ProjectGraphPopup({ project, components, lob, team, onClose }: {
  project: Project; components: Component[];
  lob: Lob | undefined; team: Team | undefined; onClose: () => void;
}) {
  const projComps = components.filter(c => c.team_id === project.team_id);
  const pct = project.connector_count > 0 ? Math.round((project.healthy_count / project.connector_count) * 100) : 100;

  const rawNodes = useMemo(() => {
    const ns: any[] = [];
    if (team) ns.push({ id: 'team', type: 'projNode', data: { type: 'team', label: team.name }, position: { x: 0, y: 0 } });
    ns.push({ id: 'project', type: 'projNode', data: { type: 'project', label: project.name }, position: { x: 0, y: 0 } });
    projComps.slice(0, 5).forEach(c => {
      ns.push({ id: `comp-${c.id}`, type: 'projNode', data: { type: 'component', label: c.name }, position: { x: 0, y: 0 } });
    });
    return ns;
  }, [project, team, projComps]);

  const rawEdges = useMemo(() => {
    const es: any[] = [];
    if (team) {
      es.push({ id: 'e-team-proj', source: 'team', target: 'project', animated: true, style: { stroke: '#0A84FF', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0A84FF' } });
    }
    projComps.slice(0, 5).forEach(c => {
      es.push({ id: `e-proj-${c.id}`, source: 'project', target: `comp-${c.id}`, animated: true, style: { stroke: '#64D2FF', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#64D2FF' } });
    });
    return es;
  }, [project, team, projComps]);

  const [nodes, , onNodesChange] = useNodesState(layoutGraph(rawNodes, rawEdges));
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

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
            boxShadow: `0 0 80px ${project.color}15, var(--shadow-sm)`,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: project.color + '20', border: `1px solid ${project.color}40` }}>
                <FolderOpen className="w-5 h-5" style={{ color: project.color }} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-[var(--text-primary)]">{project.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{lob?.name || 'Unknown LOB'} {team ? `· ${team.name}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex gap-4">
                {[
                  { label: 'Connectors', val: project.connector_count, color: '#64D2FF' },
                  { label: 'Healthy', val: project.healthy_count, color: '#30D158' },
                  { label: 'Health', val: `${pct}%`, color: pct >= 80 ? '#30D158' : pct >= 60 ? '#FF9F0A' : '#FF453A' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <p className="text-[18px] font-bold" style={{ color }}>{val}</p>
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
              nodeTypes={projNodeTypes} fitView style={{ background: 'transparent' }}>
              <Background color="var(--app-border)" gap={24} />
              <Controls style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)' }} />
            </ReactFlow>
          </div>
          <div className="px-6 py-3 flex items-center gap-6" style={{ borderTop: '1px solid var(--app-border)' }}>
            {[{ color: '#0A84FF', label: 'Team' }, { color: project.color, label: 'Project' }, { color: '#64D2FF', label: 'Components' }].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ProjectCard({ project, lob, team, components, canCreate, onEdit, onDelete, onView, onNavigate }: {
  project: Project; lob: Lob | undefined; team: Team | undefined; components: Component[];
  canCreate: boolean;
  onEdit: (p: Project) => void; onDelete: (p: Project) => void;
  onView: (p: Project) => void; onNavigate: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const total = project.connector_count;
  const pct = total > 0 ? Math.round((project.healthy_count / total) * 100) : 100;
  const color = project.color || '#30D158';
  const statusColor = STATUS_COLORS[project.status] || '#566F8A';
  const envColor = ENV_COLORS[project.environment] || '#64D2FF';

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
      onClick={() => onNavigate(project.id)}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 rounded-full pointer-events-none" style={{ background: `radial-gradient(ellipse, ${color}12 0%, transparent 70%)` }} />
      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color + '15', border: `1px solid ${color}25` }}>
              <FolderOpen className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-[var(--text-primary)] leading-tight truncate max-w-[130px]">{project.name}</p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                {lob?.name || 'N/A'}{team ? ` · ${team.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onView(project); }}
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
                      <button onClick={() => { setMenuOpen(false); onEdit(project); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--app-surface-hover)]">
                        <Pencil className="w-3.5 h-3.5" style={{ color: '#64D2FF' }} /> Edit
                      </button>
                      <button onClick={() => { setMenuOpen(false); onDelete(project); }}
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

        {/* Badges */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full capitalize"
            style={{ background: statusColor + '12', color: statusColor, border: `1px solid ${statusColor}20` }}>
            {project.status}
          </span>
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full capitalize"
            style={{ background: envColor + '12', color: envColor, border: `1px solid ${envColor}20` }}>
            {project.environment}
          </span>
        </div>

        {/* Stats strip */}
        <div className="flex items-stretch mb-3 py-2 px-1 rounded-xl bg-black/[0.02]" style={{ border: '1px solid var(--app-border)' }}>
          {[
            { label: 'Connectors', value: project.connector_count },
            { label: 'Healthy', value: project.healthy_count },
            { label: 'Members', value: project.member_count },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex-1 flex flex-col items-center justify-center"
              style={{ borderRight: i < 2 ? '1px solid var(--app-border)' : 'none' }}>
              <span className="text-sm font-black text-[var(--text-primary)] leading-none">{value}</span>
              <span className="text-[8.5px] font-bold uppercase mt-1 text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Mini graph */}
        <div className="overflow-hidden -mt-1.5 mb-2 relative flex items-center justify-center"
          style={{ height: 72 }}>
          <MiniProjectGraph project={project} components={components} />
        </div>

        {/* Health bar */}
        {total > 0 && (
          <div className="mb-2.5">
            <div className="flex justify-between text-[9.5px] mb-1" style={{ color: 'var(--text-secondary)' }}>
              <span>Health</span>
              <span className="font-extrabold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
            </div>
            <div className="h-1.2 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2.5" style={{ borderTop: '1px solid var(--app-border)' }}>
          <div className="flex items-center gap-2.5 text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
            {project.healthy_count > 0 && (
              <span className="flex items-center gap-1 font-bold" style={{ color: '#30D158' }}>
                <CheckCircle className="w-3 h-3" /> {project.healthy_count}
              </span>
            )}
            {project.degraded_count > 0 && (
              <span className="flex items-center gap-1 font-bold" style={{ color: '#FF9F0A' }}>
                <AlertTriangle className="w-3 h-3" /> {project.degraded_count}
              </span>
            )}
            {project.down_count > 0 && (
              <span className="flex items-center gap-1 font-bold" style={{ color: '#FF453A' }}>
                <AlertCircle className="w-3 h-3" /> {project.down_count}
              </span>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
        </div>
      </div>
    </motion.div>
  );
}

function ProjectListRow({ project, lob, team, canCreate, onEdit, onDelete, onNavigate }: {
  project: Project; lob: Lob | undefined; team: Team | undefined; canCreate: boolean;
  onEdit: (p: Project) => void; onDelete: (p: Project) => void; onNavigate: (id: string) => void;
}) {
  const total = project.connector_count;
  const pct = total > 0 ? Math.round((project.healthy_count / total) * 100) : 100;
  const color = project.color || '#30D158';
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all cursor-pointer group shadow-sm"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      onClick={() => onNavigate(project.id)}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}35`; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${color}12`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)'; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18', border: `1px solid ${color}30` }}>
        <FolderOpen className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{project.name}</p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize flex-shrink-0"
            style={{ background: (STATUS_COLORS[project.status] || '#566F8A') + '18', color: STATUS_COLORS[project.status] || '#566F8A' }}>
            {project.status}
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {lob?.name || 'N/A'} {team ? `· ${team.name}` : ''} · {project.environment}
        </p>
      </div>
      <div className="hidden md:flex items-center gap-2 w-32">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }} />
        </div>
        <span className="text-[11px] w-8 text-right font-bold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
      </div>
      <div className="hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1"><Plug className="w-3 h-3" />{project.connector_count}</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{project.member_count}</span>
      </div>
      {canCreate && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit(project); }}
            className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#64D2FF'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = ''; }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(project); }}
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

export function ProjectsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lobIdFilter = searchParams.get('lob_id');
  const canCreate = user ? isLobAdmin(user.role) : false;

  const [projects, setProjects] = useState<Project[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [healthTrends, setHealthTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [graphProject, setGraphProject] = useState<Project | null>(null);

  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const envFilter = searchParams.get('env') || '';
  const lobFilter = searchParams.get('lob') || lobIdFilter || '';
  const teamFilter = searchParams.get('team') || '';

  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    name: '', description: '', status: 'active', environment: 'production', color: '#30D158',
  });

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    setPageTitle('Projects');
    setBreadcrumbs([{ label: 'Projects' }]);
    fetchAll();
  }, [lobIdFilter]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, lobRes, teamRes, compRes, statsRes, trendRes] = await Promise.all([
        projectApi.list(lobIdFilter || undefined),
        lobApi.list(),
        teamApi.list(),
        componentApi.list(),
        healthApi.stats(),
        healthApi.trends(24),
      ]);
      setProjects(projRes.data);
      setLobs(lobRes.data);
      setTeams(teamRes.data);
      setComponents(compRes.data);
      setHealthStats(statsRes.data);
      setHealthTrends(trendRes.data || []);
    } catch {
      notify.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [lobIdFilter]);

  const filtered = useMemo(() => {
    let result = [...projects];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter(p => p.status === statusFilter);
    if (envFilter) result = result.filter(p => p.environment === envFilter);
    if (lobFilter) result = result.filter(p => p.lob_id === lobFilter);
    if (teamFilter) result = result.filter(p => p.team_id === teamFilter);
    result.sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      if (sortField === 'name') { av = a.name; bv = b.name; }
      else if (sortField === 'status') { av = a.status; bv = b.status; }
      else if (sortField === 'connector_count') { av = a.connector_count; bv = b.connector_count; }
      else if (sortField === 'member_count') { av = a.member_count; bv = b.member_count; }
      else if (sortField === 'created_at') { av = a.created_at; bv = b.created_at; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [projects, search, statusFilter, envFilter, lobFilter, teamFilter, sortField, sortDir]);

  const getLobById = (id: string) => lobs.find(l => l.id === id);
  const getTeamById = (id?: string) => id ? teams.find(t => t.id === id) : undefined;

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await projectApi.update(editTarget.id, editForm);
      notify.success('Project updated');
      setEditTarget(null);
      fetchAll();
    } catch { notify.error('Failed to update project'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await projectApi.delete(deleteTarget.id);
      notify.success('Project deleted');
      setDeleteTarget(null);
      fetchAll();
    } catch { notify.error('Failed to delete project'); }
    finally { setSaving(false); }
  };

  const openEdit = (p: Project) => {
    setEditForm({ name: p.name, description: p.description || '', status: p.status, environment: p.environment, color: p.color });
    setEditTarget(p);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const hasFilters = search || statusFilter || envFilter || (lobFilter && !lobIdFilter) || teamFilter;
  const clearFilters = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams();
      if (prev.get('lob_id')) next.set('lob_id', prev.get('lob_id')!);
      return next;
    }, { replace: true });
  };

  // Summary stats
  const totalConnectors = useMemo(() => projects.reduce((s, p) => s + p.connector_count, 0), [projects]);
  const totalHealthy = useMemo(() => projects.reduce((s, p) => s + p.healthy_count, 0), [projects]);
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const avgHealth = totalConnectors > 0 ? Math.round((totalHealthy / totalConnectors) * 100) : 0;

  const trendData = useMemo(() => {
    if (healthTrends.length > 0) return healthTrends.slice(-12).map((t: any) => ({ time: t.hour || '', score: t.score || t.avg_score || 80 }));
    return Array.from({ length: 12 }, (_, i) => ({ time: `${i * 2}h`, score: 70 + Math.random() * 25 }));
  }, [healthTrends]);

  const statusDist = useMemo(() => STATUS_OPTIONS.map(s => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: projects.filter(p => p.status === s).length,
    color: STATUS_COLORS[s],
  })).filter(d => d.value > 0), [projects]);

  const statCards = [
    { label: 'Total Projects', value: projects.length, color: '#30D158', icon: FolderOpen, sub: `${activeProjects} active` },
    { label: 'Total LOBs', value: lobs.length, color: '#0A84FF', icon: Building2, sub: 'Lines of business' },
    { label: 'Total Teams', value: teams.length, color: '#FF9F0A', icon: Users, sub: 'Across all LOBs' },
    { label: 'Connectors', value: totalConnectors, color: '#64D2FF', icon: Plug, sub: `${totalHealthy} healthy` },
    { label: 'Avg Health', value: `${avgHealth}%`, color: avgHealth >= 80 ? '#30D158' : avgHealth >= 60 ? '#FF9F0A' : '#FF453A', icon: Activity, sub: 'System health' },
  ];

  return (
    <div className="min-h-screen animate-page-enter">
      {/* Title */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight">Projects</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}{lobIdFilter ? ` in ${getLobById(lobIdFilter)?.name}` : ''}
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
              <button onClick={() => setWizardOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #30D158, #1DB954)', boxShadow: '0 4px 16px rgba(48,209,88,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(48,209,88,0.5)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(48,209,88,0.3)'; }}>
                <Plus className="w-4 h-4" /> New Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {statCards.map(({ label, value, color, icon: Icon, sub }, idx) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}
            className="relative rounded-2xl p-3.5 overflow-hidden shadow-sm hover:scale-[1.02] transition-transform duration-200"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-sm)' }}>
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

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search projects..." value={search}
            onChange={e => setFilter('search', e.target.value)}
            className="pl-9 pr-8 py-2 text-[13px] rounded-xl outline-none transition-all w-52"
            style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#30D158'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(48,209,88,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.boxShadow = ''; }} />
          {search && (
            <button onClick={() => setFilter('search', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!lobIdFilter && (
          <select value={lobFilter} onChange={e => setFilter('lob', e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
            style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: lobFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            <option value="">All LOBs</option>
            {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <select value={teamFilter} onChange={e => setFilter('team', e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: teamFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <option value="">All Teams</option>
          {(lobFilter ? teams.filter(t => t.lob_id === lobFilter) : teams).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={e => setFilter('status', e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: statusFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        <select value={envFilter} onChange={e => setFilter('env', e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: envFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <option value="">All Envs</option>
          {ENV_OPTIONS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 text-[12px] px-2 py-1.5 rounded-lg transition-all"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FF453A'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = ''; }}>
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
                style={viewMode === m ? { background: '#30D158', color: '#fff' } : { color: 'var(--text-secondary)' }}>
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-2xl h-80 shimmer-bg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl shimmer-bg" />)}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}>
          <EmptyState icon={FolderOpen}
            title={hasFilters ? 'No matching projects' : 'No Projects'}
            description={hasFilters ? 'Try adjusting your filters.' : 'Create your first project to start adding connectors.'}
            action={!hasFilters && canCreate ? (
              <button onClick={() => setWizardOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #30D158, #1DB954)' }}>
                <Plus className="w-4 h-4" /> Create Project
              </button>
            ) : undefined}
          />
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {filtered.map(proj => (
              <ProjectCard
                key={proj.id}
                project={proj}
                lob={getLobById(proj.lob_id)}
                team={getTeamById(proj.team_id)}
                components={components}
                canCreate={canCreate}
                onEdit={openEdit}
                onDelete={p => setDeleteTarget(p)}
                onView={p => setGraphProject(p)}
                onNavigate={id => navigate(`/projects/${id}`)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-2">
          {filtered.map(proj => (
            <ProjectListRow
              key={proj.id}
              project={proj}
              lob={getLobById(proj.lob_id)}
              team={getTeamById(proj.team_id)}
              canCreate={canCreate}
              onEdit={openEdit}
              onDelete={p => setDeleteTarget(p)}
              onNavigate={id => navigate(`/projects/${id}`)}
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
                  {(['name', 'LOB / Team', 'status', 'environment', 'connector_count', 'health', 'member_count'] as any[]).map((col, i) => (
                    <th key={i} className="text-left px-4 py-3">
                      {['name', 'status', 'connector_count', 'member_count'].includes(col) ? (
                        <button onClick={() => handleSort(col as SortField)}
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors select-none"
                          style={{ color: sortField === col ? '#30D158' : 'var(--text-secondary)' }}>
                          {col === 'connector_count' ? 'Connectors' : col === 'member_count' ? 'Members' : col.charAt(0).toUpperCase() + col.slice(1)}
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
                {filtered.map((proj, idx) => {
                  const total = proj.connector_count;
                  const pct = total > 0 ? Math.round((proj.healthy_count / total) * 100) : 100;
                  const color = proj.color || '#30D158';
                  return (
                    <tr key={proj.id}
                      className={cn('cursor-pointer transition-all group', idx !== filtered.length - 1 && 'border-b')}
                      style={{ borderColor: 'var(--app-border)' }}
                      onClick={() => navigate(`/projects/${proj.id}`)}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--app-surface-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
                            <FolderOpen className="w-3.5 h-3.5" style={{ color }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{proj.name}</p>
                            <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{proj.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{getLobById(proj.lob_id)?.name || 'N/A'}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{getTeamById(proj.team_id)?.name || 'N/A'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize"
                          style={{ background: (STATUS_COLORS[proj.status] || '#566F8A') + '18', color: STATUS_COLORS[proj.status] || '#566F8A' }}>
                          {proj.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize"
                          style={{ background: (ENV_COLORS[proj.environment] || '#64D2FF') + '18', color: ENV_COLORS[proj.environment] || '#64D2FF' }}>
                          {proj.environment}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--text-primary)]">{proj.connector_count}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }} />
                          </div>
                          <span className="text-[11px] w-8 text-right font-bold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--text-primary)]">{proj.member_count}</span></td>
                      <td className="px-4 py-3 text-right">
                        {canCreate && (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); openEdit(proj); }}
                              className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#64D2FF'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = ''; }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDeleteTarget(proj); }}
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
        <div className="md:col-span-2 rounded-2xl p-5 shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Health Trend</p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>System health score over last 24h</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="projTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#30D158" stopOpacity="0.35" />
                  <stop offset="95%" stopColor="#30D158" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <RechartTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#30D158" strokeWidth={2} fill="url(#projTrendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Status Distribution</p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>Projects by status</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" innerRadius={30} outerRadius={55} paddingAngle={3}>
                {statusDist.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.9} />)}
              </Pie>
              <RechartTooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {statusDist.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{name}</span>
                </div>
                <span className="text-[11px] font-bold text-[var(--text-primary)]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graph popup */}
      {graphProject && (
        <ProjectGraphPopup
          project={graphProject}
          components={components}
          lob={getLobById(graphProject.lob_id)}
          team={getTeamById(graphProject.team_id)}
          onClose={() => setGraphProject(null)}
        />
      )}

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-proj-form" loading={saving}>Save Changes</Button>
          </>
        }>
        <form id="edit-proj-form" onSubmit={handleEdit} className="space-y-4">
          <Input label="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
          <TextArea label="Description" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              options={STATUS_OPTIONS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
            <Select label="Environment" value={editForm.environment} onChange={e => setEditForm({ ...editForm, environment: e.target.value })}
              options={ENV_OPTIONS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Color</label>
            <input type="color" value={editForm.color} onChange={e => setEditForm({ ...editForm, color: e.target.value })}
              className="w-full h-9 rounded-xl cursor-pointer" style={{ border: '1px solid var(--app-border)' }} />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Project"
        message={`Delete "${deleteTarget?.name}"? This will also remove all associated connectors.`}
        confirmLabel="Delete" variant="danger" loading={saving}
      />

      {wizardOpen && (
        <RegistrationWizard
          initialLobId={lobIdFilter || undefined}
          onClose={() => setWizardOpen(false)}
          onSuccess={(projectId) => {
            setWizardOpen(false);
            fetchAll();
            navigate(`/projects/${projectId}`);
          }}
        />
      )}
    </div>
  );
}
