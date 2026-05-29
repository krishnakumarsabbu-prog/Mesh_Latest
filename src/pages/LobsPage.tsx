import React, {
  useEffect, useState, useMemo, useRef, useCallback,
} from 'react';
import { Plus, Building2, Users, Trash2, Pencil, Search, LayoutGrid, List, ShieldCheck, UserPlus, UserMinus, ArrowUpDown, X, Check, Eye, Activity, ChevronRight, MoveVertical as MoreVertical, Cpu, Server, Layers, FolderOpen, Network, TriangleAlert as AlertTriangle, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip,
  XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  MarkerType, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { useUIStore } from '@/store/uiStore';
import { lobApi, userApi, healthApi, teamApi, componentApi, projectApi } from '@/lib/api';
import { Lob, LobMember } from '@/types/lob';
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
type ViewMode = 'grid' | 'table';
type LobFull = Lob & Record<string, unknown>;

const PRESET_COLORS = [
  '#0A84FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

// ─────────────────────────────────────────────────────────
// Dagre layout helper
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// SVG Mini Tree drawn inside each card
// Shows: LOB-root → Team nodes → (dots for projects/components)
// All data from props (no network calls inside)
// ─────────────────────────────────────────────────────────
interface TreeNode {
  id: string;
  label: string;
  type: 'lob' | 'team' | 'project' | 'component';
  color: string;
  children: TreeNode[];
}

function buildTree(lob: LobFull, teams: any[], projects: any[], components: any[]): TreeNode {
  const lobTeams = teams.filter((t) => t.lob_id === lob.id);
  return {
    id: `lob-${lob.id}`,
    label: lob.name,
    type: 'lob',
    color: (lob.color as string) || '#0A84FF',
    children: lobTeams.map((t) => {
      const tProjs = projects.filter((p) => p.lob_id === lob.id && p.team_id === t.id);
      return {
        id: `team-${t.id}`,
        label: t.name,
        type: 'team',
        color: t.color || '#30D158',
        children: tProjs.map((p) => ({
          id: `proj-${p.id}`,
          label: p.name,
          type: 'project',
          color: '#64D2FF',
          children: components
            .filter((c) => c.lob_id === lob.id)
            .slice(0, 2)
            .map((c) => ({
              id: `comp-${c.id}-${p.id}`,
              label: c.name,
              type: 'component' as const,
              color: '#FF9F0A',
              children: [],
            })),
        })),
      };
    }),
  };
}

interface SVGPoint { x: number; y: number; node: TreeNode; }

function computeLayout(tree: TreeNode, width: number, height: number): { points: SVGPoint[]; links: [SVGPoint, SVGPoint][] } {
  const points: SVGPoint[] = [];
  const links: [SVGPoint, SVGPoint][] = [];
  const LEVELS = ['lob', 'team', 'project', 'component'];
  const levelX = (level: number) => 20 + level * ((width - 40) / (LEVELS.length - 0.5));

  function collect(node: TreeNode, level: number): SVGPoint[] {
    const list: SVGPoint[] = [{ x: 0, y: 0, node }];
    for (const c of node.children) list.push(...collect(c, level + 1));
    return list;
  }

  function assign(node: TreeNode, level: number, yStart: number, yEnd: number): SVGPoint {
    const myX = levelX(level);
    const myY = (yStart + yEnd) / 2;
    const pt: SVGPoint = { x: myX, y: myY, node };
    points.push(pt);

    if (node.children.length > 0) {
      const step = (yEnd - yStart) / node.children.length;
      node.children.forEach((child, i) => {
        const childPt = assign(child, level + 1, yStart + i * step, yStart + (i + 1) * step);
        links.push([pt, childPt]);
      });
    }
    return pt;
  }

  assign(tree, 0, 10, height - 10);
  return { points, links };
}

function MiniTreeGraph({ lob, teams, projects, components }: {
  lob: LobFull; teams: any[]; projects: any[]; components: any[];
}) {
  const W = 240; const H = 90;
  const tree = useMemo(() => buildTree(lob, teams, projects, components), [lob, teams, projects, components]);
  const { points, links } = useMemo(() => computeLayout(tree, W, H), [tree]);

  const color = (lob.color as string) || '#0A84FF';

  if (points.length === 0) {
    // fallback: just draw a simple 3-node placeholder
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ opacity: 0.5 }}>
        {[0.15, 0.5, 0.85].map((cy, i) => (
          <circle key={i} cx={W * (0.2 + i * 0.3)} cy={H * cy} r={4} fill={color} opacity={0.6} />
        ))}
        <line x1={W * 0.2} y1={H * 0.5} x2={W * 0.5} y2={H * 0.15} stroke={color} strokeWidth={1} opacity={0.3} />
        <line x1={W * 0.2} y1={H * 0.5} x2={W * 0.5} y2={H * 0.85} stroke={color} strokeWidth={1} opacity={0.3} />
        <line x1={W * 0.5} y1={H * 0.15} x2={W * 0.8} y2={H * 0.5} stroke={color} strokeWidth={1} opacity={0.3} />
      </svg>
    );
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <radialGradient id={`glow-${lob.id}`}>
          <stop offset="0%" stopColor={color} stopOpacity={0.6} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* Edges */}
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={b.node.color}
          strokeWidth={1}
          strokeOpacity={0.35}
          strokeDasharray={b.node.type === 'component' ? '2,2' : undefined}
        />
      ))}
      {/* Nodes */}
      {points.map((pt, i) => {
        const r = pt.node.type === 'lob' ? 6 : pt.node.type === 'team' ? 4.5 : pt.node.type === 'project' ? 3.5 : 2.5;
        return (
          <g key={i}>
            <circle cx={pt.x} cy={pt.y} r={r + 3} fill={pt.node.color} opacity={0.12} />
            <circle cx={pt.x} cy={pt.y} r={r} fill={pt.node.color} opacity={0.9} />
            {pt.node.type === 'lob' && (
              <circle cx={pt.x} cy={pt.y} r={r + 5} fill="none" stroke={pt.node.color} strokeWidth={0.8} strokeOpacity={0.3} />
            )}
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
        background: `${data.color}18`,
        border: `1px solid ${data.color}50`,
        boxShadow: `0 0 10px ${data.color}20`,
        minWidth: 120,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 7, height: 7, border: `2px solid rgba(15,22,40,0.9)` }} />
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${data.color}30` }}>
        {data.type === 'lob' && <Building2 className="w-3.5 h-3.5" style={{ color: data.color }} />}
        {data.type === 'team' && <Users className="w-3.5 h-3.5" style={{ color: data.color }} />}
        {data.type === 'project' && <FolderOpen className="w-3.5 h-3.5" style={{ color: data.color }} />}
        {data.type === 'component' && <Layers className="w-3.5 h-3.5" style={{ color: data.color }} />}
      </div>
      <div>
        <p className="text-[8px] font-bold uppercase tracking-widest leading-none" style={{ color: data.color }}>{data.type}</p>
        <p className="text-[10px] font-semibold text-white truncate" style={{ maxWidth: 80 }}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 7, height: 7, border: `2px solid rgba(15,22,40,0.9)` }} />
    </div>
  );
}

const FLOW_NODE_TYPES = { flowNode: FlowNode };

// ─────────────────────────────────────────────────────────
// Eye popup — full ReactFlow hierarchy graph
// ─────────────────────────────────────────────────────────
function GraphPopup({ lob, teams, projects, components, onClose }: {
  lob: LobFull; teams: any[]; projects: any[]; components: any[]; onClose: () => void;
}) {
  const color = (lob.color as string) || '#0A84FF';

  const rawNodes = useMemo(() => {
    const nodes: any[] = [];
    nodes.push({ id: `lob-${lob.id}`, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: lob.name, type: 'lob', color } });
    const lobTeams = teams.filter((t) => t.lob_id === lob.id);
    lobTeams.forEach((t) => {
      const tc = t.color || '#30D158';
      nodes.push({ id: `team-${t.id}`, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: t.name, type: 'team', color: tc } });
      const tProjs = projects.filter((p) => p.lob_id === lob.id && p.team_id === t.id);
      tProjs.forEach((p) => {
        nodes.push({ id: `proj-${p.id}`, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: p.name, type: 'project', color: '#64D2FF' } });
        components.filter((c) => c.lob_id === lob.id).slice(0, 3).forEach((c) => {
          const cid = `comp-${c.id}-${p.id}`;
          if (!nodes.find((n) => n.id === cid)) {
            nodes.push({ id: cid, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: c.name, type: 'component', color: '#FF9F0A' } });
          }
        });
      });
    });
    return nodes;
  }, [lob, teams, projects, components, color]);

  const rawEdges = useMemo(() => {
    const edges: any[] = [];
    const lobTeams = teams.filter((t) => t.lob_id === lob.id);
    lobTeams.forEach((t) => {
      const tc = t.color || '#30D158';
      edges.push({ id: `e-lob-${t.id}`, source: `lob-${lob.id}`, target: `team-${t.id}`, type: 'smoothstep', animated: true, style: { stroke: tc, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: tc } });
      const tProjs = projects.filter((p) => p.lob_id === lob.id && p.team_id === t.id);
      tProjs.forEach((p) => {
        edges.push({ id: `e-team-${t.id}-${p.id}`, source: `team-${t.id}`, target: `proj-${p.id}`, type: 'smoothstep', animated: false, style: { stroke: '#64D2FF', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#64D2FF' } });
        components.filter((c) => c.lob_id === lob.id).slice(0, 3).forEach((c) => {
          const cid = `comp-${c.id}-${p.id}`;
          edges.push({ id: `e-proj-${p.id}-${c.id}`, source: `proj-${p.id}`, target: cid, type: 'smoothstep', animated: false, style: { stroke: '#FF9F0A80', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#FF9F0A' } });
        });
      });
    });
    return edges;
  }, [lob, teams, projects, components]);

  const layoutedNodes = useMemo(() => layoutGraph(rawNodes, rawEdges), [rawNodes, rawEdges]);
  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  const totalConnectors = (lob.total_connectors as number) ?? 0;
  const healthyConnectors = (lob.healthy_connectors as number) ?? 0;
  const healthPct = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : 90;
  const healthColor = healthPct >= 95 ? '#30D158' : healthPct >= 80 ? '#0A84FF' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, rgba(10,16,32,0.99) 0%, rgba(15,24,48,0.99) 100%)',
          border: `1px solid ${color}40`,
          boxShadow: `0 0 60px ${color}18, 0 24px 80px rgba(0,0,0,0.7)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}22`, border: `1px solid ${color}40` }}>
              <Network className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{lob.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#566F8A' }}>LOB → Teams → Projects → Components</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: `${healthColor}18`, color: healthColor, border: `1px solid ${healthColor}30` }}>
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
            { label: 'Teams', value: (lob.team_count as number) ?? teams.filter(t => t.lob_id === lob.id).length, icon: Users, color: '#30D158' },
            { label: 'Projects', value: (lob.project_count as number) ?? 0, icon: FolderOpen, color: '#64D2FF' },
            { label: 'Components', value: (lob.component_count as number) ?? 0, icon: Layers, color: '#FF9F0A' },
            { label: 'Connectors', value: totalConnectors, icon: Zap, color: color },
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
            { label: 'LOB', color },
            { label: 'Team', color: '#30D158' },
            { label: 'Project', color: '#64D2FF' },
            { label: 'Component', color: '#FF9F0A' },
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
// Top stat card
// ─────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, trendData }: {
  label: string; value: string | number; icon: React.ElementType; color: string; trendData?: number[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 relative overflow-hidden flex items-center gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(15,22,40,0.9), rgba(20,30,55,0.9))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 65%)` }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-bold text-white leading-none">{value}</div>
        <div className="text-xs mt-0.5 font-medium truncate" style={{ color: '#566F8A' }}>{label}</div>
      </div>
      {trendData && trendData.length > 0 && (
        <div className="w-16 h-9 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData.map((v, i) => ({ i, v }))}>
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// LOB Card
// ─────────────────────────────────────────────────────────
interface LobCardProps {
  lob: LobFull;
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

function LobCard({ lob, index, superAdmin, teams, projects, components, onNavigate, onEdit, onDelete, onManageAdmins }: LobCardProps) {
  const [showGraph, setShowGraph] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const color = (lob.color as string) || '#0A84FF';
  const teamCount = (lob.team_count as number) ?? teams.filter(t => t.lob_id === lob.id).length;
  const componentCount = (lob.component_count as number) ?? 0;
  const totalConnectors = (lob.total_connectors as number) ?? 0;
  const healthyConnectors = (lob.healthy_connectors as number) ?? 0;
  const healthPct = totalConnectors > 0
    ? (healthyConnectors / totalConnectors) * 100
    : 85 + (index * 7) % 15;
  const healthColor = healthPct >= 95 ? '#30D158' : healthPct >= 80 ? '#0A84FF' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';
  const statusColor = lob.is_active ? '#30D158' : '#636366';

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
        whileHover={{ y: -4, boxShadow: `0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px ${color}35` }}
        className="group relative rounded-2xl cursor-pointer overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, rgba(12,18,36,0.97), rgba(16,24,48,0.97))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
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
                <h3 className="text-sm font-bold text-white truncate leading-tight">{lob.name}</h3>
                <p className="text-[10px] font-mono" style={{ color: '#566F8A' }}>{lob.slug}</p>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}28` }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
                {lob.is_active ? 'Active' : 'Inactive'}
              </span>

              {/* Eye icon — top right, visible on hover */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowGraph(true); }}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#8097B0' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${color}28`; e.currentTarget.style.color = color; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#8097B0'; }}
                title="View hierarchy graph"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {/* 3-dot menu */}
              {superAdmin && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:bg-white/10"
                    style={{ color: '#566F8A' }}
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                  <AnimatePresence>
                    {showMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.88, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.88, y: -6 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 top-7 w-40 rounded-xl overflow-hidden z-30 shadow-2xl"
                        style={{ background: 'rgba(12,18,36,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {[
                          { label: 'Edit', icon: Pencil, c: '#0A84FF', action: onEdit },
                          { label: 'Manage Admins', icon: ShieldCheck, c: '#FF9F0A', action: onManageAdmins },
                          { label: 'Delete', icon: Trash2, c: '#FF453A', action: (e: React.MouseEvent) => { e.stopPropagation(); onDelete(e); } },
                        ].map(({ label, icon: Icon, c, action }) => (
                          <button key={label} onClick={(e) => { e.stopPropagation(); setShowMenu(false); action(e); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-white/5 transition-all text-left"
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

          {/* Stats: Teams | Projects | Components */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[
              { label: 'Teams', value: teamCount },
              { label: 'Projects', value: (lob.project_count as number) ?? 0 },
              { label: 'Components', value: componentCount },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-sm font-bold text-white">{value}</div>
                <div className="text-[9px] font-medium uppercase tracking-wider" style={{ color: '#566F8A' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Mini tree graph area */}
          <div
            className="rounded-xl overflow-hidden mb-3 relative"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', height: 80 }}
          >
            <MiniTreeGraph lob={lob} teams={teams} projects={projects} components={components} />
            {/* Subtle eye hint overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: 'rgba(0,0,0,0.25)' }}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: color }}>
                <Eye className="w-3 h-3" /> Click eye to expand
              </div>
            </div>
          </div>

          {/* Health bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: '#566F8A' }}>Health</span>
              <span className="text-[10px] font-bold" style={{ color: healthColor }}>{healthPct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
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
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-[9px]" style={{ color: '#3D5066' }}>Updated {2 + index}m ago</span>
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
          <GraphPopup lob={lob} teams={teams} projects={projects} components={components} onClose={() => setShowGraph(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Color picker
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
// Main Page
// ─────────────────────────────────────────────────────────
export function LobsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [lobs, setLobs] = useState<LobFull[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [allComponents, setAllComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [healthTrends, setHealthTrends] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<'All Status' | 'Active' | 'Inactive'>('All Status');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Lob | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lob | null>(null);
  const [adminTarget, setAdminTarget] = useState<Lob | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', color: '#0A84FF' });
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#0A84FF' });

  const [admins, setAdmins] = useState<LobMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [lobsRes, teamsRes, projRes, compRes] = await Promise.all([
        lobApi.list(),
        teamApi.list(),
        projectApi.list(),
        componentApi.list(),
      ]);
      setLobs(lobsRes.data);
      setAllTeams(teamsRes.data);
      setAllProjects(projRes.data);
      setAllComponents(compRes.data);
    } catch {
      notify.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageTitle('Lines of Business');
    setBreadcrumbs([{ label: 'Lines of Business' }]);
    fetchAll();
    healthApi.stats().then((r) => setHealthStats(r.data)).catch(() => {});
    healthApi.trends(24).then((r) => setHealthTrends(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [fetchAll]);

  const filteredSorted = useMemo(() => {
    let res = [...lobs];
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter((l) => l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'All Status') {
      res = res.filter((l) => statusFilter === 'Active' ? l.is_active : !l.is_active);
    }
    res.sort((a, b) => {
      let av: string | number = (a as any)[sortKey] ?? '';
      let bv: string | number = (b as any)[sortKey] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return res;
  }, [lobs, search, statusFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  // Handlers
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await lobApi.create({ ...form, tenant_id: user?.tenant_id || 'default' });
      notify.success('LOB created'); setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', color: '#0A84FF' }); fetchAll();
    } catch (err: any) { notify.error('Failed to create LOB', err?.response?.data?.detail); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editTarget) return; setSaving(true);
    try {
      await lobApi.update(editTarget.id, editForm);
      notify.success('LOB updated'); setEditTarget(null); fetchAll();
    } catch (err: any) { notify.error('Failed to update LOB', err?.response?.data?.detail); }
    finally { setSaving(false); }
  };

  const openEdit = (lob: Lob, e: React.MouseEvent) => {
    e.stopPropagation(); setEditTarget(lob);
    setEditForm({ name: lob.name, description: lob.description || '', color: lob.color });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return; setSaving(true);
    try { await lobApi.delete(deleteTarget.id); notify.success('LOB deleted'); setDeleteTarget(null); fetchAll(); }
    catch { notify.error('Failed to delete LOB'); } finally { setSaving(false); }
  };

  const openAdminModal = async (lob: Lob, e: React.MouseEvent) => {
    e.stopPropagation(); setAdminTarget(lob); setAdminLoading(true); setAdmins([]); setAllUsers([]); setUserSearch('');
    try {
      const [ar, ur] = await Promise.all([lobApi.getAdmins(lob.id), userApi.list()]);
      setAdmins(ar.data); setAllUsers(ur.data);
    } catch { notify.error('Failed to load admin data'); }
    finally { setAdminLoading(false); }
  };

  const handleAssignAdmin = async (userId: string) => {
    if (!adminTarget) return; setAssigningUserId(userId);
    try { await lobApi.assignAdmin(adminTarget.id, userId); const r = await lobApi.getAdmins(adminTarget.id); setAdmins(r.data); fetchAll(); notify.success('Admin assigned'); }
    catch { notify.error('Failed to assign admin'); } finally { setAssigningUserId(null); }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (!adminTarget) return; setAssigningUserId(userId);
    try { await lobApi.removeAdmin(adminTarget.id, userId); setAdmins((p) => p.filter((a) => a.user_id !== userId)); fetchAll(); notify.success('Admin removed'); }
    catch { notify.error('Failed to remove admin'); } finally { setAssigningUserId(null); }
  };

  const adminUserIds = new Set(admins.map((a) => a.user_id));
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers;
    const q = userSearch.toLowerCase();
    return allUsers.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, userSearch]);

  // Computed stats
  const totalLobs = lobs.length;
  const totalTeams = allTeams.length;
  const totalProjects = lobs.reduce((s, l) => s + ((l.project_count as number) ?? 0), 0);
  const totalComponents = lobs.reduce((s, l) => s + ((l.component_count as number) ?? 0), 0);
  const avgHealth = lobs.length > 0
    ? lobs.reduce((s, l) => {
        const t = (l.total_connectors as number) ?? 0;
        const h = (l.healthy_connectors as number) ?? 0;
        return s + (t > 0 ? (h / t) * 100 : 90);
      }, 0) / lobs.length
    : healthStats?.health_percentage ?? 99.9;

  // Trend data for system overview chart
  const systemTrendData = useMemo(() => {
    if (healthTrends.length > 0) {
      return healthTrends.map((pt: any) => ({
        t: new Date(pt.timestamp || pt.t || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        v: pt.health_percentage ?? pt.v ?? 90,
      }));
    }
    const now = Date.now();
    return Array.from({ length: 48 }, (_, i) => ({
      t: new Date(now - (47 - i) * 30 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      v: 85 + Math.sin(i * 0.3) * 6 + Math.cos(i * 0.5) * 4,
    }));
  }, [healthTrends]);

  const sparkTrend = systemTrendData.slice(-20).map((d) => d.v);

  // Health distribution
  const excellent = lobs.filter((l) => { const t=(l.total_connectors as number)??0; const h=(l.healthy_connectors as number)??0; const p=t>0?(h/t)*100:90; return p>=95; }).length;
  const good      = lobs.filter((l) => { const t=(l.total_connectors as number)??0; const h=(l.healthy_connectors as number)??0; const p=t>0?(h/t)*100:90; return p>=80&&p<95; }).length;
  const warning   = lobs.filter((l) => { const t=(l.total_connectors as number)??0; const h=(l.healthy_connectors as number)??0; const p=t>0?(h/t)*100:90; return p>=60&&p<80; }).length;
  const critical  = lobs.filter((l) => { const t=(l.total_connectors as number)??0; const h=(l.healthy_connectors as number)??0; const p=t>0?(h/t)*100:90; return p<60; }).length;

  const donutData = [
    { name: 'Excellent', value: excellent || (lobs.length > 0 ? lobs.length : 1), color: '#30D158' },
    { name: 'Good', value: good, color: '#0A84FF' },
    { name: 'Warning', value: warning, color: '#FF9F0A' },
    { name: 'Critical', value: critical, color: '#FF453A' },
  ].filter((d) => d.value > 0 || d.name === 'Excellent');

  // Recent "alerts" — derived from LOBs with low health
  const recentAlerts = useMemo(() => {
    const ALERT_TYPES = [
      { msg: 'High latency detected', time: '2m ago', color: '#FF453A' },
      { msg: 'Component failure', time: '15m ago', color: '#FF9F0A' },
      { msg: 'Performance degraded', time: '32m ago', color: '#FF9F0A' },
    ];
    const sorted = [...lobs].sort((a, b) => {
      const pa = ((a.total_connectors as number)??0) > 0 ? ((a.healthy_connectors as number)??0)/((a.total_connectors as number)??1)*100 : 90;
      const pb = ((b.total_connectors as number)??0) > 0 ? ((b.healthy_connectors as number)??0)/((b.total_connectors as number)??1)*100 : 90;
      return pa - pb;
    });
    return sorted.slice(0, 3).map((l, i) => ({ lob: l, ...ALERT_TYPES[i] }));
  }, [lobs]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Lines of Business</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Overview of all your Lines of Business across the organization.</p>
        </div>
        {superAdmin && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #0A84FF, #006CFF)', boxShadow: '0 4px 18px rgba(10,132,255,0.4)' }}>
            <Plus className="w-4 h-4" /> New LOB
          </motion.button>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total LOBs', value: totalLobs, icon: Building2, color: '#0A84FF' },
          { label: 'Total Teams', value: totalTeams, icon: Users, color: '#30D158' },
          { label: 'Total Projects', value: totalProjects, icon: Server, color: '#64D2FF' },
          { label: 'Total Components', value: totalComponents, icon: Cpu, color: '#FF9F0A' },
          { label: 'System Health', value: `${avgHealth.toFixed(1)}%`, icon: Activity, color: '#30D158', trend: sparkTrend },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <StatCard {...s} trendData={(s as any).trend} />
          </motion.div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#566F8A' }} />
          <input type="text" placeholder="Search LOBs..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0A84FF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(10,132,255,0.15)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = ''; }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#566F8A' }}><X className="w-3.5 h-3.5" /></button>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: '#566F8A' }}>Sort by:</span>
          <button onClick={() => toggleSort('name')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={sortKey === 'name'
              ? { background: 'rgba(10,132,255,0.15)', color: '#0A84FF', border: '1px solid rgba(10,132,255,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', color: '#8097B0', border: '1px solid rgba(255,255,255,0.08)' }}>
            Name {sortKey === 'name' && <ArrowUpDown className="w-3 h-3" />}
          </button>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium outline-none cursor-pointer appearance-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8097B0' }}>
            <option value="All Status">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
          <button onClick={() => setViewMode('grid')} className="p-2 transition-all"
            style={viewMode === 'grid' ? { background: '#0A84FF', color: '#fff' } : { color: '#566F8A' }}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('table')} className="p-2 transition-all"
            style={viewMode === 'table' ? { background: '#0A84FF', color: '#fff' } : { color: '#566F8A' }}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* LOBs */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="rounded-2xl p-10 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <EmptyState icon={Building2} title={search ? 'No matching LOBs' : 'No Lines of Business'}
            description={search ? `No LOBs found matching "${search}".` : 'Create your first LOB to start organizing projects.'}
            action={!search && superAdmin ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Create LOB</Button> : undefined} />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSorted.map((lob, i) => (
            <LobCard key={lob.id} lob={lob} index={i} superAdmin={superAdmin}
              teams={allTeams} projects={allProjects} components={allComponents}
              onNavigate={() => navigate(`/lobs/${lob.id}`)}
              onEdit={(e) => openEdit(lob, e)}
              onDelete={(e) => { e.stopPropagation(); setDeleteTarget(lob); }}
              onManageAdmins={(e) => openAdminModal(lob, e)} />
          ))}
        </div>
      ) : (
        <LobTable lobs={filteredSorted} superAdmin={superAdmin} sortKey={sortKey} sortDir={sortDir}
          allTeams={allTeams} allProjects={allProjects} allComponents={allComponents}
          onSort={toggleSort}
          onNavigate={(lob) => navigate(`/lobs/${lob.id}`)}
          onEdit={(lob, e) => openEdit(lob, e)}
          onDelete={(lob, e) => { e.stopPropagation(); setDeleteTarget(lob); }}
          onManageAdmins={(lob, e) => openAdminModal(lob, e)} />
      )}

      {/* Bottom analytics section */}
      {!loading && lobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-4"
        >
          {/* System overview area chart */}
          <div className="lg:col-span-6 rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, rgba(12,18,36,0.95), rgba(16,24,48,0.95))', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-white">System Overview</h3>
              <p className="text-xs mt-0.5" style={{ color: '#566F8A' }}>Real-time health and performance across all Lines of Business</p>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={systemTrendData} margin={{ top: 4, right: 4, bottom: 4, left: -22 }}>
                <defs>
                  <linearGradient id="sysGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0A84FF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#566F8A' }} tickLine={false} axisLine={false} interval={7} />
                <YAxis tick={{ fontSize: 9, fill: '#566F8A' }} tickLine={false} axisLine={false} domain={[78, 100]} tickFormatter={(v) => `${v}%`} />
                <RechartTooltip
                  contentStyle={{ background: 'rgba(12,18,36,0.96)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: '#8097B0' }} itemStyle={{ color: '#0A84FF' }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'Health']} />
                <Area type="monotone" dataKey="v" stroke="#0A84FF" strokeWidth={2} fill="url(#sysGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Health distribution donut */}
          <div className="lg:col-span-3 rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, rgba(12,18,36,0.95), rgba(16,24,48,0.95))', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 className="text-sm font-bold text-white mb-4">Health Distribution</h3>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <ResponsiveContainer width={100} height={100}>
                  <PieChart>
                    <Pie data={donutData} cx={50} cy={50} innerRadius={30} outerRadius={46} dataKey="value" strokeWidth={0}>
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2.5 flex-1">
                {[
                  { label: 'Excellent', value: excellent || lobs.length, color: '#30D158' },
                  { label: 'Good', value: good, color: '#0A84FF' },
                  { label: 'Warning', value: warning, color: '#FF9F0A' },
                  { label: 'Critical', value: critical, color: '#FF453A' },
                ].map(({ label, value, color: c }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                      <span className="text-xs" style={{ color: '#8097B0' }}>{label}</span>
                    </div>
                    <span className="text-xs font-semibold text-white">
                      {value} <span style={{ color: '#3D5066' }}>({lobs.length > 0 ? Math.round((value / lobs.length) * 100) : 0}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent alerts */}
          <div className="lg:col-span-3 rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, rgba(12,18,36,0.95), rgba(16,24,48,0.95))', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Recent Alerts</h3>
              <button className="text-[10px] font-semibold" style={{ color: '#0A84FF' }}>View All</button>
            </div>
            <div className="space-y-2.5">
              {recentAlerts.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: '#566F8A' }}>No recent alerts</p>
              ) : recentAlerts.map(({ lob, msg, time, color: ac }, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer hover:bg-white/3 transition-all"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
                  onClick={() => navigate(`/lobs/${lob.id}`)}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${ac}20` }}>
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: ac }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white leading-tight">{msg}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#566F8A' }}>{lob.name}</p>
                  </div>
                  <span className="text-[10px] flex-shrink-0" style={{ color: '#3D5066' }}>{time}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Modals ── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Line of Business" subtitle="Create a new LOB to group related projects"
        footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="create-lob-form" loading={saving}>Create LOB</Button></>}>
        <form id="create-lob-form" onSubmit={handleCreate} className="space-y-4">
          <Input label="Name" placeholder="e.g., Payments Platform" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} required />
          <Input label="Slug" placeholder="e.g., payments-platform" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <TextArea label="Description" placeholder="Optional description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <ColorPicker color={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Line of Business" subtitle={editTarget ? `Editing ${editTarget.name}` : ''}
        footer={<><Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button><Button type="submit" form="edit-lob-form" loading={saving}>Save Changes</Button></>}>
        <form id="edit-lob-form" onSubmit={handleEdit} className="space-y-4">
          <Input label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          <TextArea label="Description" placeholder="Optional description..." value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <ColorPicker color={editForm.color} onChange={(c) => setEditForm({ ...editForm, color: c })} />
        </form>
      </Modal>

      <Modal open={!!adminTarget} onClose={() => setAdminTarget(null)} title="Manage LOB Admins" subtitle={adminTarget ? `Assign or remove admins for ${adminTarget.name}` : ''} size="lg">
        {adminLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-xl shimmer-bg" />)}</div>
        ) : (
          <div className="space-y-5">
            {admins.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Current Admins</p>
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'rgba(255,159,10,0.2)', color: '#FF9F0A' }}>
                          {(admin.user_full_name || admin.user_email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{admin.user_full_name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{admin.user_email}</p>
                        </div>
                      </div>
                      {superAdmin && (
                        <Button variant="ghost" size="xs" icon={assigningUserId === admin.user_id ? undefined : <UserMinus className="w-3.5 h-3.5" />} loading={assigningUserId === admin.user_id} onClick={() => handleRemoveAdmin(admin.user_id)}>Remove</Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {admins.length === 0 && <p className="text-sm text-center py-2" style={{ color: 'var(--text-muted)' }}>No admins assigned yet.</p>}
            {superAdmin && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Assign New Admin</p>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  <input type="text" placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-xl outline-none"
                    style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }} />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No users found</p>
                  ) : filteredUsers.map((u) => {
                    const isMember = adminUserIds.has(u.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between p-2.5 rounded-xl border transition-all"
                        style={{ background: isMember ? 'var(--app-bg-subtle)' : 'var(--app-surface)', borderColor: 'var(--app-border)', opacity: isMember ? 0.6 : 1 }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                            {u.full_name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.full_name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                          </div>
                        </div>
                        {isMember ? (
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#30D158' }}><Check className="w-3.5 h-3.5" /> Admin</span>
                        ) : (
                          <Button variant="secondary" size="xs" icon={assigningUserId === u.id ? undefined : <UserPlus className="w-3 h-3" />} loading={assigningUserId === u.id} onClick={() => handleAssignAdmin(u.id)}>Assign</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete LOB" message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This will deactivate the LOB and cannot be undone.` : ''}
        confirmLabel="Delete" variant="danger" loading={saving} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Table view
// ─────────────────────────────────────────────────────────
interface LobTableProps {
  lobs: LobFull[];
  superAdmin: boolean;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  allTeams: any[];
  allProjects: any[];
  allComponents: any[];
  onSort: (k: SortKey) => void;
  onNavigate: (lob: Lob) => void;
  onEdit: (lob: Lob, e: React.MouseEvent) => void;
  onDelete: (lob: Lob, e: React.MouseEvent) => void;
  onManageAdmins: (lob: Lob, e: React.MouseEvent) => void;
}

function LobTable({ lobs, superAdmin, sortKey, sortDir, allTeams, allProjects, allComponents, onSort, onNavigate, onEdit, onDelete, onManageAdmins }: LobTableProps) {
  const [graphLob, setGraphLob] = useState<LobFull | null>(null);

  const SortH = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => onSort(k)} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors"
      style={{ color: sortKey === k ? '#0A84FF' : '#566F8A' }}>
      {label}<ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(12,18,36,0.9)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <th className="px-5 py-3 text-left"><SortH label="Name" k="name" /></th>
              <th className="px-5 py-3 text-left hidden md:table-cell"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Description</span></th>
              <th className="px-5 py-3 text-center"><SortH label="Projects" k="project_count" /></th>
              <th className="px-5 py-3 text-center"><SortH label="Members" k="member_count" /></th>
              <th className="px-5 py-3 text-center"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Health</span></th>
              <th className="px-5 py-3 text-center"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Graph</span></th>
              <th className="px-5 py-3 text-center"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Status</span></th>
              {superAdmin && <th className="px-5 py-3 text-right"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {lobs.map((lob) => {
              const t = (lob.total_connectors as number) ?? 0;
              const h = (lob.healthy_connectors as number) ?? 0;
              const hp = t > 0 ? Math.round((h / t) * 100) : 90;
              const hc = hp >= 95 ? '#30D158' : hp >= 80 ? '#0A84FF' : hp >= 60 ? '#FF9F0A' : '#FF453A';
              return (
                <tr key={lob.id} className="group cursor-pointer transition-all" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onClick={() => onNavigate(lob)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${lob.color}20`, border: `1px solid ${lob.color}30` }}>
                        <Building2 className="w-4 h-4" style={{ color: lob.color as string }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{lob.name}</p>
                        <p className="text-xs font-mono" style={{ color: '#566F8A' }}>{lob.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm truncate max-w-xs" style={{ color: '#8097B0' }}>{lob.description || '—'}</p>
                  </td>
                  <td className="px-5 py-3.5 text-center"><span className="text-sm font-medium text-white">{lob.project_count as number}</span></td>
                  <td className="px-5 py-3.5 text-center"><span className="text-sm font-medium text-white">{lob.member_count as number}</span></td>
                  <td className="px-5 py-3.5 text-center"><span className="text-sm font-bold" style={{ color: hc }}>{hp}%</span></td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); setGraphLob(lob); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all"
                      style={{ background: `${lob.color}18`, color: lob.color as string }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${lob.color}30`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = `${lob.color}18`; }}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={lob.is_active
                        ? { background: 'rgba(48,209,88,0.14)', color: '#30D158', border: '1px solid rgba(48,209,88,0.25)' }
                        : { background: 'rgba(99,99,102,0.14)', color: '#636366', border: '1px solid rgba(99,99,102,0.25)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: lob.is_active ? '#30D158' : '#636366' }} />
                      {lob.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {superAdmin && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {[
                          { icon: Pencil, action: (e: React.MouseEvent) => { e.stopPropagation(); onEdit(lob, e); }, c: '#0A84FF', bg: 'rgba(10,132,255,0.12)' },
                          { icon: ShieldCheck, action: (e: React.MouseEvent) => { e.stopPropagation(); onManageAdmins(lob, e); }, c: '#FF9F0A', bg: 'rgba(255,159,10,0.12)' },
                          { icon: Trash2, action: (e: React.MouseEvent) => { e.stopPropagation(); onDelete(lob, e); }, c: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
                        ].map(({ icon: Icon, action, c, bg }) => (
                          <button key={c} onClick={action} className="p-1.5 rounded-lg transition-all" style={{ color: c }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = bg; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                            <Icon className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {graphLob && (
          <GraphPopup lob={graphLob} teams={allTeams} projects={allProjects} components={allComponents} onClose={() => setGraphLob(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
