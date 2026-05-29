import React, { useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { lobApi, teamApi, componentApi, projectApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { Building2, Layers, FolderOpen, Network, Users } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface HierarchyNodeData {
  label: string;
  type: 'lob' | 'team' | 'project' | 'component';
  color: string;
  icon: any;
}

// Custom Node Renderer with premium glassmorphic tech-grid look
function CustomNode({ data }: { data: HierarchyNodeData }) {
  const Icon = data.icon;
  return (
    <div 
      className="px-4 py-2.5 rounded-xl border transition-all duration-300 flex items-center gap-2.5 shadow-md relative group hover:shadow-lg"
      style={{
        background: 'var(--app-surface)',
        borderColor: 'var(--app-border)',
        boxShadow: `inset 0 0 10px ${data.color}08, 0 4px 12px rgba(0, 0, 0, 0.05)`,
      }}
    >
      {/* Input port handle on the left */}
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ 
          background: data.color, 
          border: '2px solid var(--app-surface)', 
          width: 8, 
          height: 8, 
          borderRadius: '50%',
          boxShadow: `0 0 8px ${data.color}`
        }} 
      />

      <div 
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
        style={{ 
          background: `linear-gradient(135deg, ${data.color}, ${data.color}dd)`,
          boxShadow: `0 0 8px ${data.color}30`
        }}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="text-left">
        <p className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5" style={{ color: 'var(--text-muted)' }}>{data.type}</p>
        <p className="text-xs font-bold truncate max-w-[120px]" style={{ color: 'var(--text-primary)' }}>{data.label}</p>
      </div>

      {/* Output port handle on the right */}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ 
          background: data.color, 
          border: '2px solid var(--app-surface)', 
          width: 8, 
          height: 8, 
          borderRadius: '50%',
          boxShadow: `0 0 8px ${data.color}`
        }} 
      />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

// Automatic layout algorithm using Dagre
const getLayoutedElements = (nodes: any[], edges: any[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 50 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.from, edge.to);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 90,
        y: nodeWithPosition.y - 25,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function HierarchyMap() {
  const [lobs, setLobs] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  
  const [selectedLobId, setSelectedLobId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lobsRes, teamsRes, compRes, projRes] = await Promise.all([
        lobApi.list(),
        teamApi.list(),
        componentApi.list(),
        projectApi.list(),
      ]);

      setLobs(lobsRes.data);
      setTeams(teamsRes.data);
      setComponents(compRes.data);
      setProjects(projRes.data);

      if (lobsRes.data.length > 0) {
        setSelectedLobId(lobsRes.data[0].id);
      }
    } catch (e) {
      console.error('Failed to load hierarchy data', e);
    } finally {
      setLoading(false);
    }
  };

  // Re-calculate the flow tree elements whenever selected LOB changes
  useEffect(() => {
    if (!selectedLobId || lobs.length === 0) return;

    const currentLob = lobs.find(l => l.id === selectedLobId);
    if (!currentLob) return;

    const rawNodes: any[] = [];
    const rawEdges: any[] = [];

    // 1. Root LOB node
    const lobColor = currentLob.color || '#00e5ff';
    rawNodes.push({
      id: `lob-${currentLob.id}`,
      type: 'custom',
      data: { 
        label: currentLob.name, 
        type: 'LOB', 
        color: lobColor,
        icon: Building2 
      },
      position: { x: 0, y: 0 }
    });

    // 2. Teams under LOB
    const lobTeams = teams.filter(t => t.lob_id === selectedLobId);
    lobTeams.forEach(t => {
      const teamColor = t.color || '#30D158';
      const teamNodeId = `team-${t.id}`;
      
      rawNodes.push({
        id: teamNodeId,
        type: 'custom',
        data: { 
          label: t.name, 
          type: 'Team', 
          color: teamColor,
          icon: Users 
        },
        position: { x: 0, y: 0 }
      });

      rawEdges.push({
        id: `edge-lob-to-${teamNodeId}`,
        source: `lob-${currentLob.id}`,
        target: teamNodeId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: teamColor, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: teamColor },
      });

      // 3. Components under Team (Level 3 - Projects)
      const teamComps = components.filter(c => c.team_id === t.id);
      teamComps.forEach(c => {
        const compColor = c.color || '#AF52DE';
        const compNodeId = `comp-${c.id}`;

        rawNodes.push({
          id: compNodeId,
          type: 'custom',
          data: { 
            label: c.name, 
            type: 'Project', 
            color: compColor,
            icon: Layers 
          },
          position: { x: 0, y: 0 }
        });

        rawEdges.push({
          id: `edge-team-to-${compNodeId}`,
          source: teamNodeId,
          target: compNodeId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: compColor, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: compColor },
        });

        // 4. Projects under Component (Level 4 - Components)
        const compProjs = projects.filter(p => p.component_id === c.id);
        compProjs.forEach(p => {
          const projColor = p.color || '#FF9F0A';
          const projNodeId = `proj-${p.id}`;

          rawNodes.push({
            id: projNodeId,
            type: 'custom',
            data: { 
              label: p.name, 
              type: 'Component', 
              color: projColor,
              icon: FolderOpen 
            },
            position: { x: 0, y: 0 }
          });

          rawEdges.push({
            id: `edge-comp-to-${projNodeId}`,
            source: compNodeId,
            target: projNodeId,
            type: 'smoothstep',
            animated: false,
            style: { stroke: projColor, strokeWidth: 1 },
            markerEnd: { type: MarkerType.ArrowClosed, color: projColor },
          });
        });
      });
    });

    // Compute automatic layout coordinates
    const layout = getLayoutedElements(
      rawNodes, 
      rawEdges.map(e => ({ id: e.id, from: e.source, to: e.target }))
    );

    const layoutedNodes = rawNodes.map(n => {
      const positioned = layout.nodes.find(ln => ln.id === n.id);
      return positioned ? { ...n, position: positioned.position } : n;
    });

    setNodes(layoutedNodes);
    setEdges(rawEdges);
  }, [selectedLobId, lobs, teams, components, projects]);

  if (loading) {
    return (
      <div 
        className="rounded-2xl border h-[520px] flex items-center justify-center"
        style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)]">Loading Live Topology...</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="rounded-2xl border p-5 flex flex-col h-[520px] overflow-hidden relative shadow-sm transition-all"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
    >
      {/* Background glass decorative overlay */}
      <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[var(--accent-subtle)] blur-[100px] rounded-full pointer-events-none opacity-40" />

      {/* Header Panel */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3 z-10">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-[var(--accent)] animate-pulse" />
          <div>
            <h3 className="text-sm font-bold tracking-wide uppercase font-mono text-[var(--text-primary)]">Live Topology Map</h3>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Enterprise Observability Graph</p>
          </div>
        </div>

        <div className="w-48">
          <select
            value={selectedLobId}
            onChange={(e) => setSelectedLobId(e.target.value)}
            className="w-full text-xs py-1.5 px-3 rounded-lg border outline-none transition-all font-semibold bg-[var(--app-surface)] border-[var(--app-border)] text-[var(--text-primary)] focus:border-[var(--accent)]"
          >
            {lobs.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* React Flow Container */}
      <div 
        className="flex-1 rounded-xl overflow-hidden border relative bg-slate-50/50 dark:bg-slate-900/10"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="currentColor" className="text-slate-200 dark:text-slate-800" gap={20} size={1} />
          <Controls 
            className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg shadow-sm [&_button]:border-[var(--app-border)] [&_button]:bg-[var(--app-surface)] [&_button:hover]:bg-slate-100 dark:[&_button:hover]:bg-slate-800 [&_button_path]:fill-[var(--text-primary)] [&_button_path]:stroke-[var(--text-primary)]" 
            style={{ 
              background: 'var(--app-surface)',
              borderColor: 'var(--app-border)',
            }}
          />
        </ReactFlow>
      </div>

      <div className="flex items-center gap-4 mt-3 text-[9px] font-mono font-bold uppercase tracking-wider z-10 text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> LOB</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Team</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Project</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Component</span>
      </div>
    </div>
  );
}
