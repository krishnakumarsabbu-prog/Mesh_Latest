import React, { useState, useMemo } from 'react';
import {
  ReactFlow,
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  Node, Edge, Handle, Position,
  getStraightPath, BaseEdge, EdgeLabelRenderer,
  type NodeProps, type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, MessageSquare, Server, Layers, Network, CircleCheck as CheckCircle2, GitBranch, CircleAlert as AlertCircle, CircleHelp as HelpCircle, Activity, TrendingUp, ChartBar as BarChart2, Filter, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceNode, ServiceEdge, ServiceTopologyData } from '@/lib/runtimeTruthEngine';

// ─── Health colour helpers ────────────────────────────────────────────────────

function healthColor(health: ServiceNode['health']): string {
  if (health === 'healthy')  return '#30D158';
  if (health === 'degraded') return '#FF9F0A';
  if (health === 'critical') return '#FF453A';
  return '#636366';
}

function edgeHealthColor(health: ServiceEdge['health']): string {
  if (health === 'healthy')  return '#30D158';
  if (health === 'degraded') return '#FF9F0A';
  return '#FF453A';
}

function techIcon(tech: string, size = 12) {
  const cls = `w-${size === 12 ? 3 : 3.5} h-${size === 12 ? 3 : 3.5}`;
  const style = { color: 'var(--text-muted)' };
  if (tech === 'oracle' || tech === 'mssql' || tech === 'mongodb') return <Database className={cls} style={style} />;
  if (tech === 'ibm_mq' || tech === 'kafka') return <MessageSquare className={cls} style={style} />;
  if (tech === 'ocp') return <Layers className={cls} style={style} />;
  return <Server className={cls} style={style} />;
}

// ─── Custom Node ──────────────────────────────────────────────────────────────

interface ServiceNodeData extends Record<string, unknown> {
  node: ServiceNode;
  onSelect: (n: ServiceNode) => void;
}

function ServiceNodeComponent({ data }: NodeProps) {
  const { node, onSelect } = data as unknown as ServiceNodeData;
  const color = healthColor(node.health);
  const isHighError = node.errorRate > 4;

  return (
    <div
      className="rounded-xl border-2 px-3 py-2 min-w-[160px] cursor-pointer transition-all duration-150 hover:shadow-lg"
      style={{
        background: 'var(--app-surface-raised)',
        borderColor: color,
        boxShadow: `0 0 8px ${color}30`,
      }}
      onClick={() => onSelect(node)}
    >
      <Handle type="target" position={Position.Top} style={{ background: color, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 6, height: 6 }} />

      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ background: color }} />
        {techIcon(node.technology)}
        <span className="text-[10px] font-extrabold truncate max-w-[120px]" style={{ color: 'var(--text-primary)' }}>
          {node.label}
        </span>
        <span className="ml-auto text-[8px] font-bold uppercase px-1 py-0.5 rounded flex-shrink-0"
          style={{
            background: `${color}20`,
            color,
            border: `1px solid ${color}40`,
          }}>
          {node.type.slice(0, 3)}
        </span>
      </div>

      {/* Role badge */}
      <div className="text-[8px] font-bold uppercase tracking-wider mb-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
        {node.role} · {node.dc}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <div className="text-[8px] text-[var(--text-muted)]">Req/s:</div>
        <div className="text-[8px] font-mono font-bold text-[var(--text-primary)] text-right">{node.requestRate > 0 ? node.requestRate.toFixed(1) : '—'}</div>
        <div className="text-[8px] text-[var(--text-muted)]">P95:</div>
        <div className="text-[8px] font-mono font-bold text-[var(--text-primary)] text-right">{node.p95Latency}ms</div>
        <div className="text-[8px] text-[var(--text-muted)]">P99:</div>
        <div className="text-[8px] font-mono font-bold text-[var(--text-primary)] text-right">{node.p99Latency}ms</div>
        <div className="text-[8px] text-[var(--text-muted)]">Error:</div>
        <div className="text-[8px] font-mono font-bold text-right" style={{ color: isHighError ? '#FF453A' : node.errorRate > 2 ? '#FF9F0A' : 'var(--success)' }}>
          {node.errorRate.toFixed(2)}%
        </div>
      </div>

      {/* Write authority badge */}
      {node.isWriteAuthority && (
        <div className="mt-1.5 flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" style={{ color: '#30D158' }} />
          <span className="text-[8px] font-bold text-[#30D158]">WRITE AUTHORITY</span>
        </div>
      )}
    </div>
  );
}

// ─── Custom Edge ──────────────────────────────────────────────────────────────

interface ServiceEdgeData extends Record<string, unknown> {
  edge: ServiceEdge;
  onSelect: (e: ServiceEdge) => void;
}

function ServiceEdgeComponent({
  id, sourceX, sourceY, targetX, targetY, data,
}: EdgeProps) {
  const typedData = data as unknown as ServiceEdgeData | undefined;
  const edge = typedData?.edge;
  if (!edge) return null;

  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const color = edgeHealthColor(edge.health);
  const isDashed = edge.type === 'replication';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: isDashed ? '5 3' : undefined,
          opacity: 0.8,
        }}
      />
      {edge.errorRate != null && edge.errorRate > 0 && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-none"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            <span className="text-[8px] font-bold px-1 py-0.5 rounded"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
              {edge.errorRate?.toFixed(1)}% err
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { serviceNode: ServiceNodeComponent };
const edgeTypes = { serviceEdge: ServiceEdgeComponent };

// ─── Node detail panel ───────────────────────────────────────────────────────

function NodeDetailPanel({ node, onClose }: { node: ServiceNode; onClose: () => void }) {
  const color = healthColor(node.health);
  const latencyBuckets = [
    { label: '0–100ms', pct: node.errorRate < 1 ? 97 : 82 },
    { label: '100–500ms', pct: node.errorRate < 1 ? 2.5 : 12 },
    { label: '500–1000ms', pct: node.errorRate < 1 ? 0.3 : 4 },
    { label: '>1000ms', pct: node.errorRate < 1 ? 0.2 : 2 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute right-3 top-3 z-30 rounded-2xl shadow-2xl w-72 overflow-hidden"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          {techIcon(node.technology, 14)}
          <span className="text-[12px] font-bold text-[var(--text-primary)] truncate max-w-[160px]">{node.label}</span>
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
        {/* Quick badge row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase"
            style={{ background: `${color}15`, color, borderColor: `${color}40` }}>
            {node.health}
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase"
            style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--app-border)' }}>
            {node.role}
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase"
            style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--app-border)' }}>
            {node.dc}
          </span>
        </div>

        {/* Overview metrics */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Overview</p>
          {[
            { label: 'Request Rate', value: node.requestRate > 0 ? `${node.requestRate.toFixed(1)} req/s` : '—' },
            { label: 'Error Rate', value: `${node.errorRate.toFixed(2)}%`, color: node.errorRate > 4 ? '#FF453A' : node.errorRate > 2 ? '#FF9F0A' : '#30D158' },
            { label: 'P95 Latency', value: `${node.p95Latency}ms` },
            { label: 'P99 Latency', value: `${node.p99Latency}ms` },
            { label: 'Host', value: node.host ?? '—' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1 border-b last:border-0" style={{ borderColor: 'var(--app-border)' }}>
              <span className="text-[11px] text-[var(--text-secondary)]">{row.label}</span>
              <span className="text-[11px] font-semibold" style={{ color: row.color ?? 'var(--text-primary)' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Latency distribution */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Latency Distribution</p>
          {latencyBuckets.map(b => (
            <div key={b.label} className="flex items-center gap-2 mb-1">
              <span className="text-[9px] text-[var(--text-muted)] w-20 flex-shrink-0">{b.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--app-bg-muted)] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: '#0A84FF' }} />
              </div>
              <span className="text-[9px] font-mono text-[var(--text-muted)] w-8 text-right">{b.pct}%</span>
            </div>
          ))}
        </div>

        {/* Source info */}
        <div className="flex items-center justify-between p-2.5 rounded-lg border text-[10px]"
          style={{ background: node.isDeterministic ? 'var(--success-subtle)' : 'var(--warning-subtle)', borderColor: node.isDeterministic ? 'var(--success)' : 'var(--warning)' }}>
          {node.isDeterministic
            ? <><CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" /><span className="text-[var(--success)] font-bold">Verified Source — Deterministic</span></>
            : <><GitBranch className="w-3.5 h-3.5 text-[var(--warning)]" /><span className="text-[var(--warning)] font-bold">Inferred Source — Not Deterministic</span></>
          }
        </div>
      </div>
    </motion.div>
  );
}

// ─── Edge detail panel ───────────────────────────────────────────────────────

function EdgeDetailPanel({ edge, sourceLabel, targetLabel, onClose }: { edge: ServiceEdge; sourceLabel: string; targetLabel: string; onClose: () => void }) {
  const color = edgeHealthColor(edge.health);
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute right-3 top-3 z-30 rounded-2xl shadow-2xl w-72 overflow-hidden"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
        <span className="text-[11px] font-bold text-[var(--text-primary)] truncate">
          {sourceLabel} → {targetLabel}
        </span>
        <button onClick={onClose}><X className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--text-primary)]" /></button>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase"
            style={{ background: `${color}15`, color, borderColor: `${color}40` }}>
            {edge.health}
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border"
            style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--app-border)' }}>
            {edge.type}
          </span>
          {edge.protocol && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border"
              style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', borderColor: 'var(--app-border)' }}>
              {edge.protocol}
            </span>
          )}
        </div>

        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Request Metrics</p>
          {[
            { label: 'Request Rate', value: edge.requestRate != null ? `${edge.requestRate.toFixed(1)} req/s` : '—' },
            { label: 'Error Rate', value: edge.errorRate != null ? `${edge.errorRate.toFixed(2)}%` : '—', color: (edge.errorRate ?? 0) > 2 ? '#FF453A' : '#30D158' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1 border-b last:border-0" style={{ borderColor: 'var(--app-border)' }}>
              <span className="text-[11px] text-[var(--text-secondary)]">{row.label}</span>
              <span className="text-[11px] font-semibold" style={{ color: row.color ?? 'var(--text-primary)' }}>{row.value}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Latency Metrics</p>
          {[
            { label: 'Avg Latency', value: edge.avgLatency != null ? `${edge.avgLatency}ms` : '—' },
            { label: 'P95 Latency', value: edge.p95Latency != null ? `${edge.p95Latency}ms` : '—', color: (edge.p95Latency ?? 0) > 500 ? '#FF9F0A' : undefined },
            { label: 'P99 Latency', value: edge.p99Latency != null ? `${edge.p99Latency}ms` : '—', color: (edge.p99Latency ?? 0) > 1000 ? '#FF453A' : undefined },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1 border-b last:border-0" style={{ borderColor: 'var(--app-border)' }}>
              <span className="text-[11px] text-[var(--text-secondary)]">{row.label}</span>
              <span className="text-[11px] font-semibold" style={{ color: row.color ?? 'var(--text-primary)' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Filter panel ─────────────────────────────────────────────────────────────

interface Filters {
  health: Set<string>;
  minErrorRate: number;
  maxP95: number;
}

function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const healthOptions = ['healthy', 'degraded', 'critical', 'unknown'];
  return (
    <div className="absolute left-3 top-3 z-30 rounded-2xl shadow-xl w-52 overflow-hidden"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)' }}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
        <Filter className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Service Filters</span>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Health status */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Health Status</p>
          {healthOptions.map(h => {
            const color = healthColor(h as ServiceNode['health']);
            return (
              <label key={h} className="flex items-center gap-2 mb-1 cursor-pointer">
                <input type="checkbox"
                  checked={filters.health.has(h)}
                  onChange={e => {
                    const next = new Set(filters.health);
                    if (e.target.checked) next.add(h); else next.delete(h);
                    onChange({ ...filters, health: next });
                  }}
                  className="accent-blue-500 w-3 h-3"
                />
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[10px] capitalize" style={{ color: 'var(--text-secondary)' }}>{h}</span>
              </label>
            );
          })}
        </div>

        {/* Error rate filter */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Min Error Rate: {filters.minErrorRate}%
          </p>
          <input type="range" min={0} max={10} step={0.5}
            value={filters.minErrorRate}
            onChange={e => onChange({ ...filters, minErrorRate: parseFloat(e.target.value) })}
            className="w-full h-1 accent-blue-500"
          />
        </div>

        {/* Max P95 */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Max P95: {filters.maxP95}ms
          </p>
          <input type="range" min={0} max={2000} step={50}
            value={filters.maxP95}
            onChange={e => onChange({ ...filters, maxP95: parseInt(e.target.value) })}
            className="w-full h-1 accent-blue-500"
          />
        </div>

        {/* Legend */}
        <div className="border-t pt-2" style={{ borderColor: 'var(--app-border)' }}>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Edge Legend</p>
          {[
            { color: '#30D158', label: 'Low latency / healthy' },
            { color: '#FF9F0A', label: 'High latency (≥500ms)' },
            { color: '#FF453A', label: 'Errors present' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-0.5 rounded" style={{ background: l.color }} />
              <span className="text-[9px] text-[var(--text-muted)]">{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 rounded border-dashed border" style={{ borderColor: '#30D158' }} />
            <span className="text-[9px] text-[var(--text-muted)]">Replication</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Layout helper ─────────────────────────────────────────────────────────────

function buildFlowElements(topology: ServiceTopologyData, filters: Filters, onSelectNode: (n: ServiceNode) => void, onSelectEdge: (e: ServiceEdge) => void): { nodes: Node[]; edges: Edge[] } {
  // Group nodes by DC and type
  const filtered = topology.nodes.filter(n =>
    filters.health.has(n.health) &&
    n.errorRate >= filters.minErrorRate &&
    n.p95Latency <= filters.maxP95
  );

  // Layout: group by DC column
  const dcGroups = new Map<string, ServiceNode[]>();
  filtered.forEach(n => {
    if (!dcGroups.has(n.dc)) dcGroups.set(n.dc, []);
    dcGroups.get(n.dc)!.push(n);
  });

  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 110;
  const COL_GAP = 250;
  const ROW_GAP = 140;

  const flowNodes: Node[] = [];
  let colIdx = 0;
  dcGroups.forEach((nodes, dc) => {
    nodes.forEach((n, rowIdx) => {
      flowNodes.push({
        id: n.id,
        type: 'serviceNode',
        position: { x: colIdx * COL_GAP, y: rowIdx * ROW_GAP },
        data: { node: n, onSelect: onSelectNode } as ServiceNodeData,
        style: { width: NODE_WIDTH },
      });
    });
    colIdx++;
  });

  const filteredIds = new Set(filtered.map(n => n.id));
  const flowEdges: Edge[] = topology.edges
    .filter(e => filteredIds.has(e.source) && filteredIds.has(e.target))
    .map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'serviceEdge',
      data: { edge: e, onSelect: onSelectEdge } as ServiceEdgeData,
      animated: e.type === 'traffic',
    }));

  return { nodes: flowNodes, edges: flowEdges };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ServiceTopologyMap({ topology }: { topology: ServiceTopologyData }) {
  const [filters, setFilters] = useState<Filters>({
    health: new Set(['healthy', 'degraded', 'critical', 'unknown']),
    minErrorRate: 0,
    maxP95: 2000,
  });
  const [selectedNode, setSelectedNode] = useState<ServiceNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<ServiceEdge | null>(null);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => buildFlowElements(topology, filters, setSelectedNode, setSelectedEdge),
    [topology, filters]
  );

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

  // Sync nodes/edges when topology or filters change
  const nodesKey = flowNodes.map(n => n.id).join(',');
  const finalNodes = useMemo(() => flowNodes, [nodesKey]);
  const finalEdges = useMemo(() => flowEdges, [nodesKey]);

  const nodeLabel = (id: string) => topology.nodes.find(n => n.id === id)?.label ?? id;

  if (topology.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Network className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">No service topology data available</p>
        <p className="text-[11px] text-[var(--text-muted)]">Import telemetry sources to build the dependency map</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden relative" style={{ height: 520, background: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
      <ReactFlow
        nodes={finalNodes}
        edges={finalEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--app-border)" gap={20} />
        <Controls style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }} />
        <MiniMap
          nodeColor={node => {
            const n = topology.nodes.find(nn => nn.id === node.id);
            return n ? healthColor(n.health) : '#636366';
          }}
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        />
      </ReactFlow>

      {/* Filter panel overlay */}
      <FilterPanel filters={filters} onChange={setFilters} />

      {/* Node / Edge detail panels */}
      <AnimatePresence>
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
        {!selectedNode && selectedEdge && (
          <EdgeDetailPanel
            edge={selectedEdge}
            sourceLabel={nodeLabel(selectedEdge.source)}
            targetLabel={nodeLabel(selectedEdge.target)}
            onClose={() => setSelectedEdge(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
