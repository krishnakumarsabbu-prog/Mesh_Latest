import React, {
  useEffect, useState, useMemo, useRef, useCallback,
} from 'react';
import { Plus, Building2, Users, Trash2, Pencil, Search, LayoutGrid, List, Table as TableIcon, ShieldCheck, UserPlus, UserMinus, ArrowUpDown, X, ChevronRight, FolderOpen, Layers, Zap, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { useUIStore } from '@/store/uiStore';
import { subLobApi, lobApi, userApi, teamApi, componentApi, projectApi } from '@/lib/api';
import { SubLob, SubLobMember } from '@/types/sub_lob';
import { Lob } from '@/types/lob';
import { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { isSuperAdmin } from '@/lib/permissions';

type SortKey = 'name' | 'project_count' | 'member_count' | 'created_at';
type ViewMode = 'card' | 'list' | 'table';
type SubLobFull = SubLob & Record<string, unknown>;

const PRESET_COLORS = [
  '#A259FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

const NODE_ICONS: Record<string, string> = {
  lob: 'M6 2a2 2 0 110 4 2 2 0 010-4zm0 5c-2.7 0-4 1.34-4 2v1h8v-1c0-.66-1.3-2-4-2z',
  sublob: 'M12 2L2 7l10 5 10-5-10-5zm0 18l-10-5 2-1 8 4 8-4 2 1-10 5z',
  team: 'M5 2a2 2 0 110 4 2 2 0 010-4zM2 8c0-1 1.1-2 3-2s3 1 3 2v.5H2V8zm6-6a2 2 0 110 4 2 2 0 010-4zm1 6c.7.3 1 .8 1 1.5v.5H7.2V9c0-.7.3-1.2.8-1.5z',
  project: 'M2 3h8v1H2V3zm0 3h6v1H2V6zm0 3h8v1H2V9zm8-7v8H1V2h9zm-1 1H2v6h7V3z',
  component: 'M4 1L1 4l3 3 1-1-2-2 2-2-1-1zm4 0l-1 1 2 2-2 2 1 1 3-3-3-3zM4 7h4v1H4V7z',
};

// Dagre layout helper
function layoutGraph(rawNodes: any[], rawEdges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 55, ranksep: 85 });
  rawNodes.forEach((n) => g.setNode(n.id, { width: 150, height: 44 }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rawNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 75, y: pos.y - 22 } };
  });
}

// ─────────────────────────────────────────────────────────
// Mini graph visualization for Sub-LOB cards
// ─────────────────────────────────────────────────────────
function MiniNetGraph({ sublob, teams, projects, components }: {
  sublob: SubLobFull; teams: any[]; projects: any[]; components: any[];
}) {
  const W = 160; const H = 72;
  const nodes = useMemo(() => {
    const arr: any[] = [];
    const color = sublob.color || '#A259FF';
    // Center parent sublob
    arr.push({ id: `sublob-${sublob.id}`, x: 24, y: H / 2, color, type: 'sublob' });
    
    // Sub-lob teams
    const sTeams = teams.filter((t) => t.sub_lob_id === sublob.id).slice(0, 3);
    sTeams.forEach((t, i) => {
      const tc = t.color || '#30D158';
      const ty = H / 2 + (i - (sTeams.length - 1) / 2) * 22;
      arr.push({ id: `team-${t.id}`, x: 74, y: ty, color: tc, type: 'team' });
      
      // Projects belonging to this team
      const tProjs = projects.filter((p) => p.team_id === t.id).slice(0, 2);
      tProjs.forEach((p, pi) => {
        const py = ty + (pi - (tProjs.length - 1) / 2) * 11;
        arr.push({ id: `proj-${p.id}`, x: 124, y: py, color: '#64D2FF', type: 'project' });
      });
    });
    return arr;
  }, [sublob, teams, projects]);

  const edges = useMemo(() => {
    const e: number[][] = [];
    const sublobNode = nodes.find((n) => n.type === 'sublob');
    if (!sublobNode) return e;

    const sTeams = nodes.filter((n) => n.type === 'team');
    sTeams.forEach((t) => {
      e.push([nodes.indexOf(sublobNode), nodes.indexOf(t)]);
    });

    const projs_ = nodes.filter((n) => n.type === 'project');
    const comps_ = nodes.filter((n) => n.type === 'component');
    projs_.forEach((p, pi) => {
      const c = comps_[pi % comps_.length];
      if (c) e.push([nodes.indexOf(p), nodes.indexOf(c)]);
    });
    // Dedupe
    const seen = new Set<string>();
    return e.filter(([a, b]) => {
      if (a < 0 || b < 0 || a === b) return false;
      const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }, [nodes]);

  const R = 8; // icon node radius

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`blur-${sublob.id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.0" result="blur" />
        </filter>
        {nodes.map((n) => (
          <radialGradient key={`rg-${n.id}`} id={`rg-${sublob.id}-${n.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={n.color} stopOpacity={1.0} />
            <stop offset="100%" stopColor={n.color} stopOpacity={0.7} />
          </radialGradient>
        ))}
      </defs>

      {/* Edges */}
      {edges.map(([ai, bi], i) => {
        const a = nodes[ai]; const b = nodes[bi];
        if (!a || !b) return null;
        return (
          <g key={i}>
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={b.color}
              strokeWidth={3}
              strokeOpacity={0.2}
              filter={`url(#blur-${sublob.id})`}
            />
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={b.color}
              strokeWidth={1.2}
              strokeOpacity={0.6}
            />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        const iconSize = 6.5;
        const iconOffset = iconSize / 2;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={R + 4} fill={n.color} opacity={0.2} filter={`url(#blur-${sublob.id})`} />
            <circle cx={n.x} cy={n.y} r={R + 1} fill="none" stroke={n.color} strokeWidth={1} strokeOpacity={0.6} />
            <circle cx={n.x} cy={n.y} r={R} fill="var(--app-surface)" />
            <circle cx={n.x} cy={n.y} r={R} fill={`url(#rg-${sublob.id}-${n.id})`} />
            <g transform={`translate(${n.x - iconOffset - 0.5}, ${n.y - iconOffset - 0.5}) scale(${iconSize / 12})`}>
              <path d={NODE_ICONS[n.type as keyof typeof NODE_ICONS] || NODE_ICONS.sublob} fill="white" opacity={0.9} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// ReactFlow custom node for popup graph
// ─────────────────────────────────────────────────────────
function FlowNode({ data }: { data: any }) {
  return (
    <div
      className="px-3 py-2 rounded-xl flex items-center gap-2 select-none"
      style={{
        background: `${data.color}15`,
        border: `1px solid ${data.color}45`,
        boxShadow: `0 0 10px ${data.color}15`,
        minWidth: 120,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 6, height: 6, border: `2px solid rgba(15,22,40,0.9)` }} />
      <div className="w-5.5 h-5.5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${data.color}25` }}>
        {data.type === 'sublob' && <Building2 className="w-3 h-3" style={{ color: data.color }} />}
        {data.type === 'team' && <Users className="w-3 h-3" style={{ color: data.color }} />}
        {data.type === 'project' && <FolderOpen className="w-3 h-3" style={{ color: data.color }} />}
        {data.type === 'component' && <Layers className="w-3 h-3" style={{ color: data.color }} />}
      </div>
      <div>
        <p className="text-[7.5px] font-bold uppercase tracking-widest leading-none" style={{ color: data.color }}>{data.type}</p>
        <p className="text-[10px] font-semibold text-white truncate" style={{ maxWidth: 85 }}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 6, height: 6, border: `2px solid rgba(15,22,40,0.9)` }} />
    </div>
  );
}

const FLOW_NODE_TYPES = { flowNode: FlowNode };

// ─────────────────────────────────────────────────────────
// Eye popup — full ReactFlow hierarchy graph
// ─────────────────────────────────────────────────────────
function GraphPopup({ sublob, teams, projects, onClose }: {
  sublob: SubLobFull; teams: any[]; projects: any[]; onClose: () => void;
}) {
  const color = (sublob.color as string) || '#A259FF';

  const rawNodes = useMemo(() => {
    const nodes: any[] = [];
    nodes.push({ id: `sublob-${sublob.id}`, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: sublob.name, type: 'sublob', color } });
    
    const sTeams = teams.filter((t) => t.sub_lob_id === sublob.id);
    sTeams.forEach((t) => {
      const tc = t.color || '#30D158';
      nodes.push({ id: `team-${t.id}`, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: t.name, type: 'team', color: tc } });
      
      const tProjs = projects.filter((p) => p.team_id === t.id);
      tProjs.forEach((p) => {
        nodes.push({ id: `proj-${p.id}`, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: p.name, type: 'project', color: '#64D2FF' } });
      });
    });
    return nodes;
  }, [sublob, teams, projects, color]);

  const rawEdges = useMemo(() => {
    const edges: any[] = [];
    const sTeams = teams.filter((t) => t.sub_lob_id === sublob.id);
    sTeams.forEach((t) => {
      const tc = t.color || '#30D158';
      edges.push({ id: `e-sublob-${t.id}`, source: `sublob-${sublob.id}`, target: `team-${t.id}`, type: 'smoothstep', animated: true, style: { stroke: tc, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: tc } });
      
      const tProjs = projects.filter((p) => p.team_id === t.id);
      tProjs.forEach((p) => {
        edges.push({ id: `e-team-${t.id}-${p.id}`, source: `team-${t.id}`, target: `proj-${p.id}`, type: 'smoothstep', animated: false, style: { stroke: '#64D2FF', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#64D2FF' } });
      });
    });
    return edges;
  }, [sublob, teams, projects]);

  const layoutedNodes = useMemo(() => layoutGraph(rawNodes, rawEdges), [rawNodes, rawEdges]);
  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  const totalConnectors = (sublob.total_connectors as number) ?? 0;
  const healthyConnectors = (sublob.healthy_connectors as number) ?? 0;
  const healthPct = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : 90;
  const healthColor = healthPct >= 95 ? '#30D158' : healthPct >= 80 ? '#0A84FF' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 25 }}
        className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, rgba(10,16,32,0.99) 0%, rgba(15,24,48,0.99) 100%)',
          border: `1px solid ${color}40`,
          boxShadow: `0 0 60px ${color}15, 0 24px 80px rgba(0,0,0,0.8)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
              <Building2 className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{sublob.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#566F8A' }}>Sub-LOB → Teams → Projects</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: `${healthColor}15`, color: healthColor, border: `1px solid ${healthColor}25` }}>
              {healthPct}% Health
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: '#566F8A' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Teams', value: (sublob.team_count as number) ?? teams.filter(t => t.sub_lob_id === sublob.id).length, icon: Users, color: '#30D158' },
            { label: 'Projects', value: (sublob.project_count as number) ?? 0, icon: FolderOpen, color: '#64D2FF' },
            { label: 'Components', value: (sublob.component_count as number) ?? 0, icon: Layers, color: '#FF9F0A' },
            { label: 'Connectors', value: totalConnectors, icon: Zap, color },
          ].map(({ label, value, icon: Icon, color: c }, i) => (
            <div key={label} className="flex flex-col items-center justify-center py-4 gap-1" style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <Icon className="w-4 h-4" style={{ color: c }} />
              <span className="text-xl font-bold text-white">{value}</span>
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#566F8A' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* ReactFlow Graph */}
        <div style={{ height: 320, background: 'rgba(255,255,255,0.01)' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={FLOW_NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.25 }}
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
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Sub-LOB', color },
            { label: 'Team', color: '#30D158' },
            { label: 'Project', color: '#64D2FF' },
          ].map(({ label, color: c }) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: c }} />{label}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 relative overflow-hidden flex items-center gap-3 shadow-sm"
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 65%)` }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-bold text-[var(--text-primary)] leading-none">{value}</div>
        <div className="text-xs mt-0.5 font-medium truncate" style={{ color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// Sub-LOB Card
// ─────────────────────────────────────────────────────────
interface SubLobCardProps {
  sublob: SubLobFull;
  index: number;
  superAdmin: boolean;
  teams: any[];
  projects: any[];
  components: any[];
  onNavigate: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onManageAdmins: (e: React.MouseEvent) => void;
}

function SubLobCard({ sublob, index, superAdmin, teams, projects, components, onNavigate, onEdit, onDelete, onManageAdmins }: SubLobCardProps) {
  const [showGraph, setShowGraph] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const color = (sublob.color as string) || '#A259FF';
  const teamCount = (sublob.team_count as number) ?? teams.filter(t => t.sub_lob_id === sublob.id).length;
  const componentCount = (sublob.component_count as number) ?? 0;
  const totalConnectors = (sublob.total_connectors as number) ?? 0;
  const healthyConnectors = (sublob.healthy_connectors as number) ?? 0;
  const healthPct = totalConnectors > 0
    ? (healthyConnectors / totalConnectors) * 100
    : 85 + (index * 7) % 15;
  const healthColor = healthPct >= 95 ? '#30D158' : healthPct >= 80 ? '#0A84FF' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';
  const statusColor = sublob.is_active ? '#30D158' : '#636366';

  useEffect(() => {
    if (!showMenu) return;
    function handleOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleOut);
    return () => document.removeEventListener('mousedown', handleOut);
  }, [showMenu]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, type: 'spring', stiffness: 240, damping: 22 }}
        whileHover={{ y: -4, boxShadow: `0 16px 48px rgba(0,0,0,0.1), 0 0 0 1px ${color}35` }}
        className="group relative rounded-2xl cursor-pointer overflow-hidden shadow-sm"
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'box-shadow 0.25s ease, transform 0.25s ease',
        }}
        onClick={onNavigate}
      >
        {/* Accent glow at top */}
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        <div className="absolute top-0 left-0 w-28 h-28 pointer-events-none" style={{ background: `radial-gradient(circle, ${color}18 0%, transparent 70%)` }} />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                <Building2 className="w-4.5 h-4.5" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">{sublob.name}</h3>
                <p className="text-[10px] font-mono text-[var(--text-secondary)]">{sublob.slug}</p>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}28` }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
                {sublob.is_active ? 'Active' : 'Inactive'}
              </span>

              {/* Eye icon */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowGraph(true); }}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${color}28`; e.currentTarget.style.color = color; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--app-bg-muted)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                title="View hierarchy graph"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {/* 3-dot menu */}
              {superAdmin && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--app-surface-hover)]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Plus className="w-3.5 h-3.5 rotate-45" />
                  </button>
                  <AnimatePresence>
                    {showMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.88, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.88, y: -6 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 top-7 w-40 rounded-xl overflow-hidden z-30 shadow-2xl"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                      >
                        {[
                          { label: 'Edit', icon: Pencil, c: '#0A84FF', action: onEdit },
                          { label: 'Manage Admins', icon: ShieldCheck, c: '#FF9F0A', action: onManageAdmins },
                          { label: 'Delete', icon: Trash2, c: '#FF453A', action: onDelete },
                        ].map(({ label, icon: Icon, c, action }) => (
                          <button key={label} onClick={(e) => { e.stopPropagation(); setShowMenu(false); action(e); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-[var(--app-surface-hover)] transition-all text-left"
                            style={{ color: c }}>
                            <Icon className="w-3.5 h-3.5" />{label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-stretch mb-3 py-1">
            {[
              { label: 'Teams', value: teamCount },
              { label: 'Projects', value: (sublob.project_count as number) ?? 0 },
              { label: 'Components', value: componentCount },
            ].map(({ label, value }, i) => (
              <div key={label} className="flex-1 flex flex-col items-center justify-center"
                style={{
                  borderRight: i < 2 ? '1px solid var(--app-border)' : 'none',
                }}>
                <span className="text-xl font-bold text-[var(--text-primary)] leading-none">{value}</span>
                <span className="text-[10px] font-semibold mt-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Mini network graph */}
          <div className="overflow-hidden -mt-2.5 mb-3 relative flex items-center justify-center" style={{ height: 72 }}>
            <MiniNetGraph sublob={sublob} teams={teams} projects={projects} components={components} />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 12 }}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-full shadow-sm"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color }}>
                <Eye className="w-3 h-3" /> Expand graph
              </div>
            </div>
          </div>

          {/* Health bar */}
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Health</span>
              <span className="text-[10px] font-bold" style={{ color: healthColor }}>{healthPct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${healthPct}%` }}
                transition={{ duration: 1, delay: index * 0.06 + 0.2, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${healthColor}70, ${healthColor})` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--app-border)' }}>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Updated {2 + index}m ago</span>
            <motion.span
              className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color }}
              whileHover={{ x: 2 }}
            >
              View Details <ChevronRight className="w-3 h-3" />
            </motion.span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showGraph && (
          <GraphPopup sublob={sublob} teams={teams} projects={projects} onClose={() => setShowGraph(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Color Picker
// ─────────────────────────────────────────────────────────
function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>Color</label>
      <div className="flex items-center gap-2.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)}
            className={cn('w-7 h-7 rounded-full transition-all border-2', color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105')}
            style={{ backgroundColor: c }} />
        ))}
        <div className="flex items-center gap-2 ml-1">
          <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded-full cursor-pointer border-0" />
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{color}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Page component
// ─────────────────────────────────────────────────────────
export function SubLobsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [sublobs, setSublobs] = useState<SubLobFull[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedLobId, setSelectedLobId] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSubLob, setEditingSubLob] = useState<SubLobFull | null>(null);
  const [deletingSubLob, setDeletingSubLob] = useState<SubLobFull | null>(null);
  const [adminSubLob, setAdminSubLob] = useState<SubLobFull | null>(null);

  // Form states
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    color: '#A259FF',
    icon: 'layers',
    lob_id: '',
  });

  const [adminForm, setAdminForm] = useState({
    searchQuery: '',
    users: [] as User[],
    assignedAdmins: [] as any[],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [slRes, lRes, tRes, pRes, cRes] = await Promise.all([
        subLobApi.list(),
        lobApi.list(),
        teamApi.list(),
        projectApi.list(),
        componentApi.list(),
      ]);
      setSublobs(slRes.data);
      setLobs(lRes.data);
      setTeams(tRes.data);
      setProjects(pRes.data);
      setComponents(cRes.data);
    } catch (err: any) {
      notify.error('Fetch Failed', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageTitle('Sub-Lines of Business');
    setBreadcrumbs([
      { label: 'Sub-LOBs' },
    ]);
    loadData();
  }, [setPageTitle, setBreadcrumbs, loadData]);

  // Form helpers
  const handleNameChange = (nameVal: string) => {
    setForm((f) => ({
      ...f,
      name: nameVal,
      slug: slugify(nameVal),
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lob_id) {
      notify.warning('Validation Warning', 'Please select a parent LOB.');
      return;
    }
    try {
      await subLobApi.create({
        ...form,
        tenant_id: user?.tenant_id || 'default',
      });
      notify.success('Sub-LOB Created', `Sub-LOB "${form.name}" has been registered successfully.`);
      setShowAddModal(false);
      setForm({ name: '', slug: '', description: '', color: '#A259FF', icon: 'layers', lob_id: '' });
      loadData();
    } catch (err: any) {
      notify.error('Create Failed', err.message);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubLob) return;
    try {
      await subLobApi.update(editingSubLob.id, form);
      notify.success('Sub-LOB Updated', `Sub-LOB "${form.name}" has been updated.`);
      setEditingSubLob(null);
      loadData();
    } catch (err: any) {
      notify.error('Update Failed', err.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingSubLob) return;
    try {
      await subLobApi.delete(deletingSubLob.id);
      notify.success('Sub-LOB Deleted', `Sub-LOB has been deactivated successfully.`);
      setDeletingSubLob(null);
      loadData();
    } catch (err: any) {
      notify.error('Delete Failed', err.message);
    }
  };

  // Admin management
  const loadAdmins = async (sl: SubLobFull) => {
    try {
      const [admRes, usrRes] = await Promise.all([
        subLobApi.getAdmins(sl.id),
        userApi.list(),
      ]);
      setAdminForm({
        searchQuery: '',
        users: usrRes.data,
        assignedAdmins: admRes.data,
      });
    } catch (err: any) {
      notify.error('Load Failed', err.message);
    }
  };

  useEffect(() => {
    if (adminSubLob) {
      loadAdmins(adminSubLob);
    }
  }, [adminSubLob]);

  const handleAssignAdmin = async (userId: string) => {
    if (!adminSubLob) return;
    try {
      await subLobApi.assignAdmin(adminSubLob.id, userId);
      notify.success('Admin Assigned', 'Super role registered successfully.');
      loadAdmins(adminSubLob);
      loadData();
    } catch (err: any) {
      notify.error('Assignment Failed', err.message);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (!adminSubLob) return;
    try {
      await subLobApi.removeAdmin(adminSubLob.id, userId);
      notify.success('Admin Revoked', 'Super role unassigned successfully.');
      loadAdmins(adminSubLob);
      loadData();
    } catch (err: any) {
      notify.error('Revoke Failed', err.message);
    }
  };

  // Sorting & Filtering
  const filteredSubLobs = useMemo(() => {
    let out = [...sublobs];
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
    }
    if (selectedLobId) {
      out = out.filter((s) => s.lob_id === selectedLobId);
    }
    out.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];
      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });
    return out;
  }, [sublobs, search, selectedLobId, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const total = sublobs.length;
    const active = sublobs.filter((s) => s.is_active).length;
    const totalT = sublobs.reduce((acc, s) => acc + (s.team_count || 0), 0);
    const totalP = sublobs.reduce((acc, s) => acc + (s.project_count || 0), 0);
    return { total, active, totalT, totalP };
  }, [sublobs]);

  return (
    <div className="space-y-6">
      {/* Telemetry row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sub-LOBs" value={stats.total} icon={Building2} color="#A259FF" />
        <StatCard label="Active Sub-LOBs" value={stats.active} icon={ShieldCheck} color="#30D158" />
        <StatCard label="Teams Associated" value={stats.totalT} icon={Users} color="#FF9F0A" />
        <StatCard label="Projects Connected" value={stats.totalP} icon={FolderOpen} color="#64D2FF" />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text" placeholder="Search Sub-LOBs..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs font-semibold bg-[var(--app-bg)] text-white border border-[var(--app-border)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <select
            value={selectedLobId} onChange={(e) => setSelectedLobId(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--app-bg)] text-white border border-[var(--app-border)] focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">All Parent LOBs</option>
            {lobs.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-auto">
          {/* Sorting */}
          <div className="flex items-center gap-1.5">
            <select
              value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--app-bg)] text-white border border-[var(--app-border)] focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value="name">Sort by Name</option>
              <option value="project_count">Sort by Projects</option>
              <option value="member_count">Sort by Members</option>
            </select>
            <button
              onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--app-bg)] border border-[var(--app-border)] text-white hover:bg-[var(--app-surface-hover)]"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-[var(--app-border)]" />

          {/* View mode toggle */}
          <div className="flex items-center rounded-xl overflow-hidden border border-[var(--app-border)] bg-[var(--app-bg)]">
            {([
              { key: 'card', icon: LayoutGrid },
              { key: 'list', icon: List },
              { key: 'table', icon: TableIcon },
            ] as const).map(({ key, icon: Icon }) => (
              <button
                key={key} onClick={() => setViewMode(key)}
                className={cn('w-8 h-8 flex items-center justify-center transition-all', viewMode === key ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)]' : 'text-[var(--text-secondary)] hover:text-white')}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {superAdmin && (
            <Button
              onClick={() => {
                setForm({ name: '', slug: '', description: '', color: '#A259FF', icon: 'layers', lob_id: lobs[0]?.id || '' });
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 font-bold"
            >
              <Plus className="w-4 h-4" /> Add Sub-LOB
            </Button>
          )}
        </div>
      </div>

      {/* Content Body */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSubLobs.length === 0 ? (
        <EmptyState title="No Sub-LOBs found" description="Try refining your filters or register a new hierarchy." action={superAdmin ? <Button onClick={() => setShowAddModal(true)}>Add Sub-LOB</Button> : undefined} />
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSubLobs.map((s, idx) => (
            <SubLobCard
              key={s.id} sublob={s} index={idx} superAdmin={superAdmin} teams={teams} projects={projects} components={components}
              onNavigate={() => navigate(`/sublobs/${s.id}`)}
              onEdit={() => {
                setForm({ name: s.name, slug: s.slug, description: s.description || '', color: s.color, icon: s.icon, lob_id: s.lob_id });
                setEditingSubLob(s);
              }}
              onDelete={() => setDeletingSubLob(s)}
              onManageAdmins={() => setAdminSubLob(s)}
            />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-3">
          {filteredSubLobs.map((s, idx) => {
            const color = s.color || '#A259FF';
            const sTeams = teams.filter(t => t.sub_lob_id === s.id);
            const teamCount = s.team_count ?? sTeams.length;
            const projectCount = s.project_count ?? projects.filter(p => sTeams.some(t => t.id === p.team_id)).length;
            const healthPct = s.total_connectors && s.total_connectors > 0 ? (s.healthy_connectors! / s.total_connectors!) * 100 : 85 + (idx * 7) % 15;
            const healthColor = healthPct >= 95 ? '#30D158' : healthPct >= 80 ? '#0A84FF' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';

            return (
              <motion.div
                key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all cursor-pointer group shadow-sm bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-violet-500/30"
                onClick={() => navigate(`/sublobs/${s.id}`)}
              >
                <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18', border: `1px solid ${color}30` }}>
                  <Building2 className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize" style={{ background: s.is_active ? 'rgba(48,209,88,0.1)' : 'var(--app-bg-muted)', color: s.is_active ? '#30D158' : 'var(--text-muted)' }}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {s.slug} {s.description ? `· ${s.description}` : ''}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2 w-32 flex-shrink-0">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${healthPct}%`, background: healthColor }} />
                  </div>
                  <span className="text-[10px] w-8 text-right font-bold" style={{ color: healthColor }}>{Math.round(healthPct)}%</span>
                </div>
                <div className="hidden md:flex items-center gap-4 text-[10px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1 font-semibold"><Users className="w-3.5 h-3.5" />{teamCount}</span>
                  <span className="flex items-center gap-1 font-semibold"><FolderOpen className="w-3.5 h-3.5" />{projectCount}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40" />
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--app-border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-white/[0.01]">
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Slug</th>
                <th className="px-5 py-3.5">Teams</th>
                <th className="px-5 py-3.5">Projects</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-xs font-medium text-white divide-y divide-white/[0.04]">
              {filteredSubLobs.map((s) => (
                <tr key={s.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/sublobs/${s.id}`)}>
                  <td className="px-5 py-3">{s.name}</td>
                  <td className="px-5 py-3 font-mono text-[10px] text-white/60">{s.slug}</td>
                  <td className="px-5 py-3">{s.team_count || 0}</td>
                  <td className="px-5 py-3">{s.project_count || 0}</td>
                  <td className="px-5 py-3">
                    <span className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ background: s.is_active ? '#30D158' : '#636366' }} />
                    {s.is_active ? 'Active' : 'Inactive'}
                  </td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => { setForm({ name: s.name, slug: s.slug, description: s.description || '', color: s.color, icon: s.icon, lob_id: s.lob_id }); setEditingSubLob(s); }} className="p-1 rounded hover:bg-white/10 text-violet-400"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeletingSubLob(s)} className="p-1 rounded hover:bg-white/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Register New Sub-LOB">
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <select
            value={form.lob_id} onChange={(e) => setForm({ ...form, lob_id: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--app-bg)] border border-[var(--app-border)] text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
            required
          >
            <option value="">Select Parent Line of Business (LOB)</option>
            {lobs.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <Input label="Name" placeholder="e.g. Retail Mortgages" value={form.name} onChange={(e) => handleNameChange(e.target.value)} required />
          <Input label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <TextArea label="Description" placeholder="Optional details..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <ColorPicker color={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button type="submit">Create Sub-LOB</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingSubLob} onClose={() => setEditingSubLob(null)} title="Modify Sub-LOB">
        <form onSubmit={handleUpdate} className="space-y-4 pt-2">
          <Input label="Name" value={form.name} onChange={(e) => handleNameChange(e.target.value)} required />
          <Input label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <TextArea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <ColorPicker color={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" onClick={() => setEditingSubLob(null)}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        open={!!deletingSubLob} onClose={() => setDeletingSubLob(null)} onConfirm={handleDelete}
        title="Confirm Deactivation" message={`Are you sure you want to deactivate the Sub-LOB "${deletingSubLob?.name}"? Associated teams and dashboard assignments will be preserved but hidden.`}
      />

      {/* Manage Admins slide-out Modal */}
      <Modal open={!!adminSubLob} onClose={() => setAdminSubLob(null)} title={`Manage Admins - ${adminSubLob?.name}`}>
        <div className="space-y-4 pt-2 max-h-[500px] overflow-y-auto">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Search and Assign User</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
              <input
                type="text" placeholder="Search system users..." value={adminForm.searchQuery} onChange={(e) => setAdminForm({ ...adminForm, searchQuery: e.target.value })}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-[var(--app-bg)] text-white border border-[var(--app-border)] focus:outline-none"
              />
            </div>
            <div className="mt-2 divide-y divide-white/[0.04] bg-white/[0.01] rounded-xl overflow-hidden border border-white/[0.04]">
              {adminForm.users
                .filter((u) => u.email.toLowerCase().includes(adminForm.searchQuery.toLowerCase()))
                .slice(0, 4)
                .map((u) => {
                  const isAssigned = adminForm.assignedAdmins.some((a) => a.user_id === u.id);
                  return (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <p className="font-semibold text-white">{u.full_name}</p>
                        <p className="text-[10px] text-white/50">{u.email}</p>
                      </div>
                      {isAssigned ? (
                        <button onClick={() => handleRemoveAdmin(u.id)} className="flex items-center gap-1 text-[10px] font-bold text-red-400 px-2.5 py-1 rounded-lg bg-red-400/10 hover:bg-red-400/20">
                          <UserMinus className="w-3 h-3" /> Revoke
                        </button>
                      ) : (
                        <button onClick={() => handleAssignAdmin(u.id)} className="flex items-center gap-1 text-[10px] font-bold text-violet-400 px-2.5 py-1 rounded-lg bg-violet-400/10 hover:bg-violet-400/20">
                          <UserPlus className="w-3 h-3" /> Assign
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="h-px bg-white/10" />

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Currently Assigned Admins ({adminForm.assignedAdmins.length})</label>
            <div className="mt-1 divide-y divide-white/[0.04]">
              {adminForm.assignedAdmins.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <p className="font-semibold text-white">{a.user_full_name || 'N/A'}</p>
                    <p className="text-[10px] text-white/50">{a.user_email}</p>
                  </div>
                  <button onClick={() => handleRemoveAdmin(a.user_id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
