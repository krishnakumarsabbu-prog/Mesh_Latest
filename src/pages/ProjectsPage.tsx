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
  const W = 260; const H = 100;
  const color = project.color || '#30D158';

  const nodes = useMemo(() => {
    const projComps = components.filter(c => c.team_id === project.team_id).slice(0, 4);
    const synthComps = projComps.length > 0 ? projComps :
      Array.from({ length: Math.min(3, 4) }, (_, i) => ({ id: `sc${i}`, name: `Comp ${i + 1}` }));
    const all: any[] = [];
    all.push({ id: 'project', type: 'project', label: project.name.slice(0, 10), x: 22, y: H / 2 });
    const cCount = synthComps.length;
    synthComps.forEach((c, i) => {
      const y = cCount === 1 ? H / 2 : 15 + (i * (H - 30)) / Math.max(cCount - 1, 1);
      all.push({ id: `c${i}`, type: 'component', label: (c.name as string).slice(0, 8), x: 140, y });
    });
    // Fake connector nodes
    const connCount = Math.min(project.connector_count || 2, 3);
    Array.from({ length: connCount }).forEach((_, i) => {
      const y = connCount === 1 ? H / 2 : 15 + (i * (H - 30)) / Math.max(connCount - 1, 1);
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
        {nodes.map(n => (
          <radialGradient key={`grad-${n.id}`} id={`pgrad-${n.id}`} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor={nodeColor[n.type]} stopOpacity="0.9" />
            <stop offset="100%" stopColor={nodeColor[n.type]} stopOpacity="0.3" />
          </radialGradient>
        ))}
      </defs>
      {edges.map((e: any) => (
        <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke={color} strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3 3" />
      ))}
      {nodes.map(n => {
        const r = n.type === 'project' ? 12 : 8;
        const nc = nodeColor[n.type];
        const iconPath = NODE_ICONS[n.type] || NODE_ICONS.component;
        const iconScale = n.type === 'project' ? 0.9 : 0.65;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r + 6} fill={nc} fillOpacity="0.06" />
            <circle cx={n.x} cy={n.y} r={r + 3} fill="none" stroke={nc} strokeOpacity="0.22" strokeWidth="0.5" />
            <circle cx={n.x} cy={n.y} r={r} fill={`url(#pgrad-${n.id})`} />
            <g transform={`translate(${n.x - 6 * iconScale},${n.y - 6 * iconScale}) scale(${iconScale})`}>
              <path d={iconPath} fill="rgba(255,255,255,0.9)" />
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
            boxShadow: `0 0 80px ${project.color}30, 0 40px 80px rgba(0,0,0,0.8)`,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: project.color + '20', border: `1px solid ${project.color}40` }}>
                <FolderOpen className="w-5 h-5" style={{ color: project.color }} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white">{project.name}</p>
                <p className="text-[11px]" style={{ color: '#566F8A' }}>{lob?.name || 'Unknown LOB'} {team ? `· ${team.name}` : ''}</p>
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
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              nodeTypes={projNodeTypes} fitView style={{ background: 'transparent' }}>
              <Background color="rgba(255,255,255,0.03)" gap={24} />
              <Controls style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </ReactFlow>
          </div>
          <div className="px-6 py-3 flex items-center gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[{ color: '#0A84FF', label: 'Team' }, { color: project.color, label: 'Project' }, { color: '#64D2FF', label: 'Components' }].map(({ color, label }) => (
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
      className="relative rounded-2xl cursor-pointer group overflow-hidden"
      style={{
        background: 'rgba(12,18,36,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 48px rgba(0,0,0,0.5), 0 0 24px ${color}18`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}35`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 32px rgba(0,0,0,0.4)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
      }}
      onClick={() => onNavigate(project.id)}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 rounded-full pointer-events-none" style={{ background: `radial-gradient(ellipse, ${color}12 0%, transparent 70%)` }} />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color + '18', border: `1px solid ${color}35` }}>
              <FolderOpen className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-white leading-tight truncate max-w-[120px]">{project.name}</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: '#566F8A' }}>
                {lob?.name || 'N/A'}{team ? ` · ${team.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onView(project); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#566F8A' }}
              onMouseEnter={e => { e.currentTarget.style.background = color + '25'; (e.currentTarget as HTMLElement).style.color = color; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#566F8A'; }}>
              <Eye className="w-3.5 h-3.5" />
            </button>
            {canCreate && (
              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#566F8A' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-8 z-30 rounded-xl overflow-hidden w-36"
                      style={{ background: 'rgba(16,24,44,0.98)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setMenuOpen(false); onEdit(project); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-white transition-colors"
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                        <Pencil className="w-3.5 h-3.5" style={{ color: '#64D2FF' }} /> Edit
                      </button>
                      <button onClick={() => { setMenuOpen(false); onDelete(project); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] transition-colors"
                        style={{ color: '#FF453A' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
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
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
            style={{ background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}30` }}>
            {project.status}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
            style={{ background: envColor + '18', color: envColor, border: `1px solid ${envColor}30` }}>
            {project.environment}
          </span>
        </div>

        {/* Stats strip */}
        <div className="flex items-stretch mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Connectors', value: project.connector_count },
            { label: 'Healthy', value: project.healthy_count },
            { label: 'Members', value: project.member_count },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex-1 flex flex-col items-center justify-center py-2.5"
              style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-lg font-bold text-white leading-none">{value}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider mt-1" style={{ color: '#566F8A' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Mini graph */}
        <div className="rounded-xl overflow-hidden mb-3 flex items-center justify-center"
          style={{ background: 'rgba(6,10,24,0.9)', border: '1px solid rgba(255,255,255,0.06)', height: 100 }}>
          <MiniProjectGraph project={project} components={components} />
        </div>

        {/* Health bar */}
        {total > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] mb-1" style={{ color: '#566F8A' }}>
              <span>Health</span>
              <span className="font-bold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
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

        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: '#566F8A' }}>
            {project.healthy_count > 0 && (
              <span className="flex items-center gap-1" style={{ color: '#30D158' }}>
                <CheckCircle className="w-3 h-3" /> {project.healthy_count}
              </span>
            )}
            {project.degraded_count > 0 && (
              <span className="flex items-center gap-1" style={{ color: '#FF9F0A' }}>
                <AlertTriangle className="w-3 h-3" /> {project.degraded_count}
              </span>
            )}
            {project.down_count > 0 && (
              <span className="flex items-center gap-1" style={{ color: '#FF453A' }}>
                <AlertCircle className="w-3 h-3" /> {project.down_count}
              </span>
            )}
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: '#566F8A' }} />
        </div>
      </div>
    </motion.div>
  );
}

function ProjectListRow({ project, lob, canCreate, onEdit, onDelete, onNavigate }: {
  project: Project; lob: Lob | undefined; canCreate: boolean;
  onEdit: (p: Project) => void; onDelete: (p: Project) => void; onNavigate: (id: string) => void;
}) {
  const total = project.connector_count;
  const pct = total > 0 ? Math.round((project.healthy_count / total) * 100) : 100;
  const color = project.color || '#30D158';
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all cursor-pointer group"
      style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}
      onClick={() => onNavigate(project.id)}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}35`; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${color}12`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18', border: `1px solid ${color}30` }}>
        <FolderOpen className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{project.name}</p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize flex-shrink-0"
            style={{ background: (STATUS_COLORS[project.status] || '#566F8A') + '18', color: STATUS_COLORS[project.status] || '#566F8A' }}>
            {project.status}
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: '#566F8A' }}>
          {lob?.name || 'N/A'} · {project.environment}
        </p>
      </div>
      <div className="hidden md:flex items-center gap-2 w-32">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }} />
        </div>
        <span className="text-[11px] w-8 text-right font-bold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
      </div>
      <div className="hidden md:flex items-center gap-3 text-[11px]" style={{ color: '#566F8A' }}>
        <span className="flex items-center gap-1"><Plug className="w-3 h-3" />{project.connector_count}</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{project.member_count}</span>
      </div>
      {canCreate && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit(project); }}
            className="p-1.5 rounded-lg transition-all" style={{ color: '#566F8A' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#64D2FF'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#566F8A'; e.currentTarget.style.background = ''; }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(project); }}
            className="p-1.5 rounded-lg transition-all" style={{ color: '#566F8A' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#566F8A'; e.currentTarget.style.background = ''; }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#566F8A' }} />
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
            <h1 className="text-3xl font-black text-white tracking-tight">Projects</h1>
            <p className="text-sm mt-1" style={{ color: '#566F8A' }}>
              {filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}{lobIdFilter ? ` in ${getLobById(lobIdFilter)?.name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#99AABB' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}>
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
            className="relative rounded-2xl p-4 overflow-hidden"
            style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${color}12 0%, transparent 70%)`, transform: 'translate(20%, -20%)' }} />
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
              style={{ background: color + '18', border: `1px solid ${color}30` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-2xl font-black text-white leading-none">{value}</p>
            <p className="text-[11px] font-semibold mt-1" style={{ color }}>{label}</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#566F8A' }}>{sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#566F8A' }} />
          <input type="text" placeholder="Search projects..." value={search}
            onChange={e => setFilter('search', e.target.value)}
            className="pl-9 pr-8 py-2 text-[13px] rounded-xl outline-none transition-all w-52"
            style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#30D158'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(48,209,88,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = ''; }} />
          {search && (
            <button onClick={() => setFilter('search', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#566F8A' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!lobIdFilter && (
          <select value={lobFilter} onChange={e => setFilter('lob', e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
            style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.1)', color: lobFilter ? 'white' : '#566F8A' }}>
            <option value="">All LOBs</option>
            {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <select value={teamFilter} onChange={e => setFilter('team', e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.1)', color: teamFilter ? 'white' : '#566F8A' }}>
          <option value="">All Teams</option>
          {(lobFilter ? teams.filter(t => t.lob_id === lobFilter) : teams).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={e => setFilter('status', e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.1)', color: statusFilter ? 'white' : '#566F8A' }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        <select value={envFilter} onChange={e => setFilter('env', e.target.value)}
          className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
          style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.1)', color: envFilter ? 'white' : '#566F8A' }}>
          <option value="">All Envs</option>
          {ENV_OPTIONS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 text-[12px] px-2 py-1.5 rounded-lg transition-all"
            style={{ color: '#566F8A' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FF453A'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#566F8A'; (e.currentTarget as HTMLElement).style.background = ''; }}>
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-xl p-1"
          style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(12,18,36,0.97)' }}>
          {(['card', 'list', 'table'] as ViewMode[]).map((m) => {
            const Icon = m === 'card' ? LayoutGrid : m === 'list' ? List : TableIcon;
            return (
              <button key={m} onClick={() => setViewMode(m)}
                className="p-1.5 rounded-lg transition-all"
                style={viewMode === m ? { background: '#30D158', color: '#fff' } : { color: '#566F8A' }}>
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
          style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}>
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
              canCreate={canCreate}
              onEdit={openEdit}
              onDelete={p => setDeleteTarget(p)}
              onNavigate={id => navigate(`/projects/${id}`)}
            />
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                  {(['name', 'LOB / Team', 'status', 'environment', 'connector_count', 'health', 'member_count'] as any[]).map((col, i) => (
                    <th key={i} className="text-left px-4 py-3">
                      {['name', 'status', 'connector_count', 'member_count'].includes(col) ? (
                        <button onClick={() => handleSort(col as SortField)}
                          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors"
                          style={{ color: sortField === col ? '#30D158' : '#566F8A' }}>
                          {col === 'connector_count' ? 'Connectors' : col === 'member_count' ? 'Members' : col.charAt(0).toUpperCase() + col.slice(1)}
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>{col}</span>
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
                      style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                      onClick={() => navigate(`/projects/${proj.id}`)}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
                            <FolderOpen className="w-3.5 h-3.5" style={{ color }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{proj.name}</p>
                            <p className="text-[10px] font-mono" style={{ color: '#566F8A' }}>{proj.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-white">{getLobById(proj.lob_id)?.name || 'N/A'}</p>
                        {proj.team_name && <p className="text-[11px]" style={{ color: '#566F8A' }}>{proj.team_name}</p>}
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
                      <td className="px-4 py-3"><span className="text-sm text-white">{proj.connector_count}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }} />
                          </div>
                          <span className="text-[11px] w-8 text-right font-bold" style={{ color: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A' }}>{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-white">{proj.member_count}</span></td>
                      <td className="px-4 py-3 text-right">
                        {canCreate && (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); openEdit(proj); }}
                              className="p-1.5 rounded-lg transition-all" style={{ color: '#566F8A' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#64D2FF'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = '#566F8A'; e.currentTarget.style.background = ''; }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDeleteTarget(proj); }}
                              className="p-1.5 rounded-lg transition-all" style={{ color: '#566F8A' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = '#566F8A'; e.currentTarget.style.background = ''; }}>
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
        <div className="md:col-span-2 rounded-2xl p-5" style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[13px] font-bold text-white mb-1">Health Trend</p>
          <p className="text-[11px] mb-4" style={{ color: '#566F8A' }}>System health score over last 24h</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="projTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#30D158" stopOpacity="0.35" />
                  <stop offset="95%" stopColor="#30D158" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" tick={{ fill: '#566F8A', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#566F8A', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <RechartTooltip contentStyle={{ background: 'rgba(16,24,44,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'white', fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#30D158" strokeWidth={2} fill="url(#projTrendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-5" style={{ background: 'rgba(12,18,36,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[13px] font-bold text-white mb-1">Status Distribution</p>
          <p className="text-[11px] mb-4" style={{ color: '#566F8A' }}>Projects by status</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" innerRadius={30} outerRadius={55} paddingAngle={3}>
                {statusDist.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.9} />)}
              </Pie>
              <RechartTooltip contentStyle={{ background: 'rgba(16,24,44,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'white', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {statusDist.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[11px]" style={{ color: '#99AABB' }}>{name}</span>
                </div>
                <span className="text-[11px] font-bold text-white">{value}</span>
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
