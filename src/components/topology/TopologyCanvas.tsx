import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LobNode } from './nodes/LobNode';
import { TeamNode } from './nodes/TeamNode';
import { ProjectNode } from './nodes/ProjectNode';
import { ConnectorNode } from './nodes/ConnectorNode';
import { AssetNode } from './nodes/AssetNode';
import { HealthEdge } from './edges/HealthEdge';
import apiClient from '@/lib/api';

const nodeTypes = {
  lob: LobNode,
  team: TeamNode,
  project: ProjectNode,
  connector: ConnectorNode,
  asset: AssetNode,
};

const edgeTypes = {
  health: HealthEdge,
};

interface TopologyData {
  nodes: Node[];
  edges: Edge[];
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  // Simple manual layout: nodes already have positions from backend
  // Space them out with consistent x-offsets per row
  const rowGroups: Record<string, Node[]> = {};
  for (const node of nodes) {
    const key = String(node.position.y);
    if (!rowGroups[key]) rowGroups[key] = [];
    rowGroups[key].push(node);
  }

  const laid: Node[] = [];
  for (const [yStr, rowNodes] of Object.entries(rowGroups)) {
    const y = Number(yStr);
    const total = rowNodes.length;
    const spacing = rowNodes[0]?.type === 'connector' ? 200 : rowNodes[0]?.type === 'project' ? 220 : 260;
    const totalWidth = (total - 1) * spacing;
    const startX = -totalWidth / 2;
    rowNodes.forEach((n, i) => {
      laid.push({ ...n, position: { x: startX + i * spacing, y } });
    });
  }
  return laid;
}

function TopologyCanvasInner({ filter }: { filter: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchTopology = useCallback(async () => {
    try {
      const res = await apiClient.get('/topology/graph');
      const data: TopologyData = res.data;
      const laidNodes = applyDagreLayout(data.nodes, data.edges);

      let filteredNodes = laidNodes;
      let filteredEdges = data.edges;

      if (filter && filter !== 'all') {
        const filterLower = filter.toLowerCase();
        filteredNodes = laidNodes.filter(
          (n) =>
            String((n.data as Record<string, unknown>).name || '')
              .toLowerCase()
              .includes(filterLower) ||
            n.type === filter
        );
        const nodeIds = new Set(filteredNodes.map((n) => n.id));
        filteredEdges = data.edges.filter(
          (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
        );
      }

      setNodes(filteredNodes);
      setEdges(filteredEdges as Edge[]);
      setError(null);
      setLoading(false);
      setTimeout(() => fitView({ padding: 0.12, duration: 600 }), 100);
    } catch {
      setError('Failed to load topology data');
      setLoading(false);
    }
  }, [filter, setNodes, setEdges, fitView]);

  useEffect(() => {
    fetchTopology();
    intervalRef.current = setInterval(fetchTopology, 15000);
    return () => clearInterval(intervalRef.current);
  }, [fetchTopology]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading topology...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: 'transparent' }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1}
        color="var(--app-border)"
        style={{ opacity: 0.5 }}
      />
      <Controls
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-md)',
        }}
      />
      <MiniMap
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          borderRadius: 12,
        }}
        maskColor="rgba(0,0,0,0.2)"
        nodeColor={(n) => {
          const d = n.data as Record<string, unknown>;
          return String(d.color || '#636366');
        }}
      />
    </ReactFlow>
  );
}

export function TopologyCanvas({ filter }: { filter: string }) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner filter={filter} />
    </ReactFlowProvider>
  );
}
