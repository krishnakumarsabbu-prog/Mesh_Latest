/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DependenciesTab — the "Dependencies" tab of the Analyze step.
 * Renders an interactive XYFlow dependency graph (applications on
 * the left, dependency services on the right) with a filter bar to
 * show/hide dependency types (MQ, Kafka, Oracle, Mongo, VIP, DNS).
 * Mock data only.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BackgroundVariant,
  ReactFlowProvider,
  NodeProps,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Filter, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  depGraphNodes,
  depGraphEdges,
  DEPENDENCY_TYPE_META,
  DEPENDENCY_TYPE_ORDER,
  type DependencyType,
  type HealthState,
  type DepGraphNodeData,
} from '@/modules/dc-exit/data/analyzeMockData';

const HEALTH_COLOR: Record<HealthState, string> = {
  healthy: '#00B074',
  degraded: '#FFB100',
  down: '#FF003C',
};

const HEALTH_LABEL: Record<HealthState, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

// ─── Custom node components ──────────────────────────────────────────────────

function DepAppNode({ data }: NodeProps) {
  const d = data as unknown as DepGraphNodeData;
  const color = HEALTH_COLOR[d.health];
  return (
    <div
      className="rounded-[8px] px-3 py-2.5 select-none"
      style={{
        width: 180,
        background: 'var(--app-surface-raised)',
        border: `1px solid ${color}55`,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span
          className="text-[9px] font-bold uppercase tracking-[0.08em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {d.sublabel ?? 'Application'}
        </span>
      </div>
      <div className="text-[12px] font-bold truncate mt-1" style={{ color: 'var(--text-primary)' }}>
        {d.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: color, width: 7, height: 7 }} />
    </div>
  );
}

function DepServiceNode({ data }: NodeProps) {
  const d = data as unknown as DepGraphNodeData;
  const meta = DEPENDENCY_TYPE_META[d.nodeType as DependencyType];
  const Icon = meta.icon;
  const healthColor = HEALTH_COLOR[d.health];
  return (
    <div
      className="rounded-[8px] px-3 py-2.5 select-none"
      style={{
        width: 180,
        background: 'var(--app-surface)',
        border: `1px solid ${meta.border}`,
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex items-center justify-center w-6 h-6 rounded-[5px] flex-shrink-0"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} strokeWidth={1.8} />
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.08em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {d.sublabel}
          </span>
        </div>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: healthColor }} />
      </div>
      <div className="text-[12px] font-bold truncate mt-1.5" style={{ color: 'var(--text-primary)' }}>
        {d.label}
      </div>
      <Handle type="target" position={Position.Left} style={{ background: meta.color, width: 7, height: 7 }} />
    </div>
  );
}

const nodeTypes = { depApp: DepAppNode, depService: DepServiceNode };

// ─── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  type,
  active,
  count,
  onToggle,
}: {
  type: DependencyType;
  active: boolean;
  count: number;
  onToggle: () => void;
}) {
  const meta = DEPENDENCY_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <button
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-[11px] font-semibold select-none transition-all duration-150',
      )}
      style={{
        background: active ? meta.bg : 'var(--app-bg-subtle)',
        color: active ? meta.color : 'var(--text-muted)',
        border: `1px solid ${active ? meta.border : 'var(--app-border)'}`,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--app-border-strong)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--app-border)';
          e.currentTarget.style.color = 'var(--text-muted)';
        }
      }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      {meta.label}
      <span className="font-mono opacity-70">{count}</span>
    </button>
  );
}

// ─── Tab body ────────────────────────────────────────────────────────────────

function DependenciesGraph() {
  const [activeTypes, setActiveTypes] = useState<Set<DependencyType>>(
    () => new Set(DEPENDENCY_TYPE_ORDER),
  );

  const toggleType = useCallback((type: DependencyType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setActiveTypes(new Set(DEPENDENCY_TYPE_ORDER));
  }, []);

  // Count edges per type for the filter chips.
  const typeCounts = useMemo(() => {
    const counts: Record<DependencyType, number> = {
      mq: 0, kafka: 0, oracle: 0, mongo: 0, vip: 0, dns: 0,
    };
    for (const e of depGraphEdges) counts[e.depType] += 1;
    return counts;
  }, []);

  // Service node ids that should remain visible given the active filters.
  const visibleServiceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of depGraphNodes) {
      if (n.type !== 'depService') continue;
      if (activeTypes.has(n.data.nodeType as DependencyType)) ids.add(n.id);
    }
    return ids;
  }, [activeTypes]);

  // App node ids that have at least one visible edge.
  const visibleAppIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of depGraphEdges) {
      if (!activeTypes.has(e.depType)) continue;
      if (visibleServiceIds.has(e.target)) ids.add(e.source);
    }
    return ids;
  }, [activeTypes, visibleServiceIds]);

  const nodes: Node[] = useMemo(
    () =>
      depGraphNodes
        .filter((n) => {
          if (n.type === 'depApp') return visibleAppIds.has(n.id);
          return visibleServiceIds.has(n.id);
        })
        .map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data as unknown as Record<string, unknown>,
        })),
    [visibleAppIds, visibleServiceIds],
  );

  const edges: Edge[] = useMemo(
    () =>
      depGraphEdges
        .filter((e) => activeTypes.has(e.depType))
        .map((e) => {
          const meta = DEPENDENCY_TYPE_META[e.depType];
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: e.animated,
            style: { stroke: meta.color, strokeWidth: 1.5, opacity: 0.7 },
            labelStyle: { fill: 'var(--text-secondary)', fontSize: 9, fontWeight: 600 },
            labelBgStyle: { fill: 'var(--app-surface)', rx: 4 },
          };
        }),
    [activeTypes],
  );

  const inlineCss = `
    .react-flow__edge-textbg { rx: 4; }
    .react-flow__attribution { display: none; }
  `;

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-secondary)' }}>
          <Filter className="w-3.5 h-3.5" strokeWidth={2} />
          Filter
        </span>
        {DEPENDENCY_TYPE_ORDER.map((type) => (
          <FilterChip
            key={type}
            type={type}
            active={activeTypes.has(type)}
            count={typeCounts[type]}
            onToggle={() => toggleType(type)}
          />
        ))}
        <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={resetFilters}>
          Reset
        </Button>
        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
          {nodes.length} nodes / {edges.length} links
        </span>
      </div>

      {/* Graph canvas */}
      <div
        className="flex rounded-[8px] overflow-hidden relative"
        style={{ height: 560, background: 'var(--map-container-bg)', border: '1px solid var(--app-border)' }}
      >
        <style>{inlineCss}</style>
        <div className="flex-1 h-full relative">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.2}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
              style={{ background: 'transparent' }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--map-grid-color)" />
              <Controls
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 8,
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  const d = n.data as unknown as DepGraphNodeData;
                  return HEALTH_COLOR[d.health];
                }}
                maskColor="rgba(0,0,0,0.05)"
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 8,
                }}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-[10px] font-mono">
        {(Object.keys(HEALTH_COLOR) as HealthState[]).map((h) => (
          <span key={h} className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} />
            {HEALTH_LABEL[h]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 ml-auto" style={{ color: 'var(--text-disabled)' }}>
          Dashed animated links = active data flow
        </span>
      </div>
    </div>
  );
}

export function DependenciesTab() {
  return <DependenciesGraph />;
}
