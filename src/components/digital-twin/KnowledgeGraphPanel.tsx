import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, BackgroundVariant, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'framer-motion';
import {
  AppWindow, Database, MessageSquare, Server, Building2,
  Network, HardDrive, Clock, Briefcase, Users, Layers,
  ShieldCheck, Activity, Circle,
} from 'lucide-react';
import type { DTNode, DTEdge } from '@/store/digitalTwinStore';

const ICON_MAP: Record<string, React.ElementType> = {
  AppWindow, Database, MessageSquare, Server, Building2,
  Network, HardDrive, Clock, Briefcase, Users, Layers,
  ShieldCheck, Activity, Circle,
};

const statusColor = (status?: string) => {
  if (!status) return '#8A97A8';
  if (status === 'healthy') return '#00B074';
  if (status === 'degraded') return '#FFB100';
  if (status === 'down') return '#FF003C';
  return '#8A97A8';
};

// Custom node component
function GraphNode({ data, id }: { data: any; id: string }) {
  const Icon = ICON_MAP[data.icon] || Circle;
  const color = data.color || '#64748B';
  const isImpacted = data.impacted;
  const isSelected = data.selected;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex flex-col items-center gap-1 px-3 py-2 rounded-[12px] border transition-all"
        style={{
          background: isImpacted
            ? 'rgba(255,0,60,0.15)'
            : isSelected
            ? `linear-gradient(135deg, ${color}22 0%, rgba(18,24,38,0.95) 100%)`
            : 'rgba(18,24,38,0.92)',
          borderColor: isImpacted ? '#FF003C' : isSelected ? color : 'rgba(255,255,255,0.08)',
          boxShadow: isImpacted
            ? `0 0 20px rgba(255,0,60,0.3)`
            : isSelected
            ? `0 0 16px ${color}33`
            : '0 2px 8px rgba(0,0,0,0.4)',
          minWidth: 90,
        }}
      >
        <div
          className="w-8 h-8 rounded-[8px] flex items-center justify-center"
          style={{ background: isImpacted ? '#FF003C22' : `${color}18` }}
        >
          <Icon
            className="w-4 h-4"
            style={{ color: isImpacted ? '#FF003C' : color }}
            strokeWidth={2}
          />
        </div>
        <span
          className="text-[10px] font-semibold text-center truncate max-w-[100px]"
          style={{ color: isImpacted ? '#FF6B7A' : '#E6EAF0' }}
        >
          {data.label}
        </span>
        {data.status && (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isImpacted ? '#FF003C' : statusColor(data.status) }}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
}

const nodeTypes = { custom: GraphNode };

function KnowledgeGraphInner({
  nodes: rawNodes,
  edges: rawEdges,
  selectedNodeId,
  impactedNodeIds,
  onSelectNode,
}: {
  nodes: DTNode[];
  edges: DTEdge[];
  selectedNodeId: string | null;
  impactedNodeIds: string[];
  onSelectNode: (id: string | null) => void;
}) {
  // Convert to React Flow format with dagre layout
  const { rfNodes, rfEdges } = useMemo(() => {
    // Simple radial layout
    const cx = 400, cy = 300;
    const appNode = rawNodes.find((n) => n.type === 'APPLICATION');
    const otherNodes = rawNodes.filter((n) => n.type !== 'APPLICATION');

    const positions: Record<string, { x: number; y: number }> = {};
    if (appNode) positions[appNode.id] = { x: cx, y: cy };

    // Place nodes in concentric rings
    const rings = [
      { radius: 180, nodes: otherNodes.filter((n) => n.type === 'DATACENTER') },
      { radius: 260, nodes: otherNodes.filter((n) => ['DATABASE', 'MESSAGING', 'COMPUTE', 'LOAD_BALANCER', 'STORAGE', 'BATCH'].includes(n.type)) },
      { radius: 340, nodes: otherNodes.filter((n) => ['SECURITY', 'OBSERVABILITY', 'BUSINESS'].includes(n.type)) },
      { radius: 400, nodes: otherNodes.filter((n) => !['DATACENTER', 'DATABASE', 'MESSAGING', 'COMPUTE', 'LOAD_BALANCER', 'STORAGE', 'BATCH', 'SECURITY', 'OBSERVABILITY', 'BUSINESS'].includes(n.type)) },
    ];

    rings.forEach((ring) => {
      const count = ring.nodes.length;
      ring.nodes.forEach((node, i) => {
        const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
        positions[node.id] = {
          x: cx + Math.cos(angle) * ring.radius,
          y: cy + Math.sin(angle) * ring.radius,
        };
      });
    });

    const rfNodes: Node[] = rawNodes.map((n) => ({
      id: n.id,
      type: 'custom',
      position: positions[n.id] || { x: cx + Math.random() * 200, y: cy + Math.random() * 200 },
      data: {
        label: n.label,
        icon: n.icon,
        color: n.color,
        status: n.status,
        type: n.type,
        impacted: impactedNodeIds.includes(n.id),
        selected: selectedNodeId === n.id,
      },
    }));

    const rfEdges: Edge[] = rawEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'default',
      animated: e.animated || impactedNodeIds.includes(e.source) || impactedNodeIds.includes(e.target),
      style: {
        stroke: impactedNodeIds.includes(e.source) || impactedNodeIds.includes(e.target) ? '#FF003C' : 'rgba(255,255,255,0.15)',
        strokeWidth: 1.5,
      },
      labelStyle: { fontSize: 9, fill: '#667085' },
      labelBgStyle: { fill: 'rgba(18,24,38,0.9)' },
    }));

    return { rfNodes, rfEdges };
  }, [rawNodes, rawEdges, selectedNodeId, impactedNodeIds]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    onSelectNode(node.id);
  }, [onSelectNode]);

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.04)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'rgba(18,24,38,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
          }}
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.data?.impacted) return '#FF003C';
            return (node.data?.color as string) || '#64748B';
          }}
          maskColor="rgba(11,16,32,0.7)"
          style={{
            background: 'rgba(18,24,38,0.92)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function KnowledgeGraphPanel(props: {
  nodes: DTNode[];
  edges: DTEdge[];
  selectedNodeId: string | null;
  impactedNodeIds: string[];
  onSelectNode: (id: string | null) => void;
}) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
