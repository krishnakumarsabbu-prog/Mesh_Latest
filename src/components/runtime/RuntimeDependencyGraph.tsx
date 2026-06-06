import React, { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  Node,
  Edge,
  BackgroundVariant,
  ReactFlowProvider,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, MessageSquare, Cpu, Server, Box, X, ShieldCheck, Clock, FileJson, AlertCircle } from 'lucide-react';
import type { ApplicationLocationDetail, RuntimeAsset, RuntimeDataCenter } from '@/types';
import { TechStackIcon, techStackLabel } from './TechStackIcon';
import { MOCK_DATA_CENTERS } from '@/lib/runtimeLocationMock';
import { formatRelativeTime } from '@/lib/runtimeLocationMock';

interface RuntimeDependencyGraphProps {
  detail: ApplicationLocationDetail;
  simulatingFailover?: boolean;
  failedDcId?: string | null;
  failoverComplete?: boolean;
  promotedDcId?: string | null;
}

// ─── Custom Node Components ──────────────────────────────────────────────────

// 1. App Node (Center)
function AppNode({ data }: NodeProps) {
  const d = data as { name: string; confidence: number };
  const confColor = d.confidence === 4 ? '#30D158' : d.confidence === 3 ? '#FF9F0A' : '#FF453A';
  
  return (
    <div 
      className="p-4 rounded-2xl border text-center shadow-xl select-none" 
      style={{ 
        width: 240, 
        background: 'rgba(10, 20, 40, 0.9)', 
        borderColor: 'rgba(10, 132, 255, 0.5)', 
        boxShadow: '0 0 25px rgba(10, 132, 255, 0.15)' 
      }}
    >
      <div className="text-[9px] font-extrabold text-[#0A84FF] uppercase tracking-widest mb-1">
        Application Console
      </div>
      <div className="text-[14px] font-extrabold text-white truncate">{d.name}</div>
      <div className="mt-2.5 flex items-center justify-center gap-1.5 border-t border-white/5 pt-2">
        <span className="text-[10px] text-white/50">Overall Confidence:</span>
        <span 
          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full" 
          style={{ background: `${confColor}18`, color: confColor }}
        >
          {d.confidence}/4
        </span>
      </div>
      
      <Handle type="source" position={Position.Left} id="left" style={{ background: '#0A84FF', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: '#0A84FF', width: 8, height: 8 }} />
    </div>
  );
}

// 2. DC Node (Middle Layer)
function DCNode({ data }: NodeProps) {
  const d = data as { name: string; shortName: string; region: string; zone: string; branch: 'left' | 'right'; isFailed?: boolean };
  
  return (
    <div 
      className="p-3.5 rounded-xl border shadow-lg relative select-none" 
      style={{ 
        width: 190, 
        background: d.isFailed ? 'rgba(255, 69, 58, 0.08)' : 'rgba(20, 20, 25, 0.9)', 
        borderColor: d.isFailed ? 'rgba(255, 69, 58, 0.5)' : 'rgba(255, 255, 255, 0.08)',
        boxShadow: d.isFailed ? '0 0 15px rgba(255, 69, 58, 0.15)' : 'none'
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded bg-white/5 flex items-center justify-center">
          <Server className={`w-3.5 h-3.5 ${d.isFailed ? 'text-[#FF453A] animate-pulse' : 'text-white/80'}`} />
        </div>
        <span className="text-[11px] font-extrabold text-white tracking-wide truncate">{d.name}</span>
      </div>
      <div className="text-[9px] text-white/50 flex flex-col gap-0.5 border-t border-white/5 pt-1.5">
        <div>Region: <span className="text-white/80 font-medium">{d.region}</span></div>
        <div>Zone: <span className="text-white/80 font-medium">{d.zone}</span></div>
      </div>
      
      {d.isFailed && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#FF453A] text-white shadow-md animate-bounce">
          OFFLINE
        </span>
      )}

      {d.branch === 'left' ? (
        <>
          <Handle type="target" position={Position.Right} style={{ background: 'rgba(255, 255, 255, 0.25)', width: 6, height: 6 }} />
          <Handle type="source" position={Position.Left} style={{ background: 'rgba(255, 255, 255, 0.25)', width: 6, height: 6 }} />
        </>
      ) : (
        <>
          <Handle type="target" position={Position.Left} style={{ background: 'rgba(255, 255, 255, 0.25)', width: 6, height: 6 }} />
          <Handle type="source" position={Position.Right} style={{ background: 'rgba(255, 255, 255, 0.25)', width: 6, height: 6 }} />
        </>
      )}
    </div>
  );
}

// 3. Asset Node (Leaf Layer)
function AssetNode({ data }: NodeProps) {
  const d = data as { asset: RuntimeAsset; branch: 'left' | 'right'; isFailed?: boolean; isPrimary?: boolean; onSelect: (a: RuntimeAsset) => void };
  const asset = d.asset;
  
  const state = d.isFailed ? 'FAILED' : d.isPrimary ? 'ACTIVE' : asset.latest_operational_state;
  const role = d.isPrimary ? 'PRIMARY' : asset.latest_replication_role;
  const isWrite = d.isPrimary || (asset.write_authority && !d.isFailed);

  const stateColor = state?.toUpperCase() === 'ACTIVE' ? '#30D158' : state?.toUpperCase() === 'STANDBY' ? '#FF9F0A' : '#FF453A';

  return (
    <div 
      className="group relative cursor-pointer select-none" 
      style={{ width: 220 }}
      onClick={() => d.onSelect(asset)}
    >
      <div 
        className="rounded-xl overflow-hidden border transition-all duration-200 group-hover:scale-[1.02] shadow-md" 
        style={{ 
          background: 'rgba(15, 18, 30, 0.95)',
          borderColor: d.isFailed
            ? 'rgba(255, 69, 58, 0.45)'
            : isWrite
            ? 'rgba(48, 209, 88, 0.4)'
            : 'rgba(255, 255, 255, 0.08)',
          boxShadow: d.isFailed
            ? '0 0 15px rgba(255, 69, 58, 0.15)'
            : isWrite
            ? '0 0 15px rgba(48, 209, 88, 0.1)'
            : 'none'
        }}
      >
        <div 
          className="px-3 py-2 flex items-center gap-1.5 border-b border-white/5" 
          style={{ background: isWrite ? 'rgba(48, 209, 88, 0.06)' : 'rgba(255, 255, 255, 0.015)' }}
        >
          <div className="p-1 rounded bg-white/5 flex items-center justify-center">
            <TechStackIcon techStack={asset.tech_stack} size={11} />
          </div>
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/70">
            {techStackLabel(asset.tech_stack)}
          </span>
          {isWrite ? (
            <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20 animate-pulse">
              WRITE
            </span>
          ) : (
            <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-white/5 text-white/60">
              READ
            </span>
          )}
        </div>
        
        <div className="p-3">
          <div className="text-[12px] font-bold text-white truncate mb-1">{asset.name}</div>
          <div className="text-[9px] text-white/40 truncate">{asset.host}</div>
          
          <div className="flex items-center justify-between text-[10px] mt-2.5 border-t border-white/5 pt-2 text-white/50">
            <span>State: <span className="font-bold" style={{ color: stateColor }}>{state}</span></span>
            <span>Role: <span className="font-bold text-white/80">{role || 'NONE'}</span></span>
          </div>
        </div>
      </div>
      
      {/* Handles */}
      {d.branch === 'left' ? (
        <Handle type="target" id="dc-link" position={Position.Right} style={{ background: 'rgba(255, 255, 255, 0.25)', width: 6, height: 6 }} />
      ) : (
        <Handle type="target" id="dc-link" position={Position.Left} style={{ background: 'rgba(255, 255, 255, 0.25)', width: 6, height: 6 }} />
      )}
      
      {/* Top/Bottom handles for replication connections between components */}
      <Handle type="source" id="rep-out" position={Position.Top} style={{ background: '#0A84FF', width: 6, height: 6, opacity: 0.6 }} />
      <Handle type="target" id="rep-in" position={Position.Bottom} style={{ background: '#0A84FF', width: 6, height: 6, opacity: 0.6 }} />
    </div>
  );
}

const nodeTypes = {
  appNode: AppNode,
  dcNode: DCNode,
  assetNode: AssetNode,
};

// ─── Main Graph Component ────────────────────────────────────────────────────

export function RuntimeDependencyGraph({
  detail,
  simulatingFailover = false,
  failedDcId = null,
  failoverComplete = false,
  promotedDcId = null,
}: RuntimeDependencyGraphProps) {
  const [selectedAsset, setSelectedAsset] = useState<RuntimeAsset | null>(null);

  const dataCenters = useMemo(() => {
    const seen = new Map<string, RuntimeDataCenter>();
    for (const component of detail.components) {
      for (const asset of component.assets) {
        if (asset.data_center && !seen.has(asset.data_center.id)) {
          seen.set(asset.data_center.id, asset.data_center);
        }
      }
    }
    return Array.from(seen.values());
  }, [detail]);

  const assetsByDC = useMemo(() => {
    const map = new Map<string, RuntimeAsset[]>();
    for (const component of detail.components) {
      for (const asset of component.assets) {
        const dcId = asset.data_center?.id ?? '__unknown__';
        if (!map.has(dcId)) map.set(dcId, []);
        map.get(dcId)!.push(asset);
      }
    }
    return map;
  }, [detail]);

  // Dynamic layout coordinates builder
  const { nodes, edges } = useMemo(() => {
    const nodesList: Node[] = [];
    const edgesList: Edge[] = [];

    // 1. Root Application Node
    nodesList.push({
      id: 'app',
      type: 'appNode',
      data: { name: detail.application_name, confidence: detail.overall_confidence },
      position: { x: 0, y: 0 },
    });

    // Partition DCs to Left and Right branches
    const leftDCs: RuntimeDataCenter[] = [];
    const rightDCs: RuntimeDataCenter[] = [];
    dataCenters.forEach((dc, idx) => {
      if (idx % 2 === 0) leftDCs.push(dc);
      else rightDCs.push(dc);
    });

    // Helper: Position branch nodes and connect layout edges
    const buildBranch = (dcs: RuntimeDataCenter[], branch: 'left' | 'right') => {
      const xFactor = branch === 'left' ? -1 : 1;
      let currentY = -((dcs.length - 1) * 220) / 2;

      dcs.forEach((dc) => {
        const dcId = dc.id;
        const assets = assetsByDC.get(dcId) || [];
        const isDcFailed = simulatingFailover && failedDcId === dcId;

        // Position DC Node
        nodesList.push({
          id: `dc-${dcId}`,
          type: 'dcNode',
          data: {
            name: dc.name,
            shortName: dc.short_name,
            region: dc.region,
            zone: dc.zone,
            branch,
            isFailed: isDcFailed,
          },
          position: { x: 300 * xFactor, y: currentY },
        });

        // Edge App -> DC
        edgesList.push({
          id: `edge-app-dc-${dcId}`,
          source: 'app',
          target: `dc-${dcId}`,
          sourceHandle: branch,
          style: { stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1.5 },
        });

        // Position Asset Nodes surrounding parent DC Node
        let assetY = currentY - ((assets.length - 1) * 130) / 2;
        assets.forEach((asset) => {
          const isAssetFailed = simulatingFailover && failedDcId === dcId;
          const isAssetPromoted = simulatingFailover && failoverComplete && promotedDcId === dcId;
          const isAssetPrimary = isAssetPromoted || (asset.write_authority && !isAssetFailed);

          nodesList.push({
            id: `asset-${asset.id}`,
            type: 'assetNode',
            data: {
              asset,
              branch,
              isFailed: isAssetFailed,
              isPrimary: isAssetPrimary,
              onSelect: setSelectedAsset,
            },
            position: { x: 600 * xFactor, y: assetY },
          });

          // Edge DC -> Asset
          edgesList.push({
            id: `edge-dc-${dcId}-asset-${asset.id}`,
            source: `dc-${dcId}`,
            target: `asset-${asset.id}`,
            targetHandle: 'dc-link',
            style: { stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1.2 },
          });

          assetY += 130;
        });

        currentY += Math.max(220, assets.length * 130);
      });
    };

    buildBranch(leftDCs, 'left');
    buildBranch(rightDCs, 'right');

    // 2. Replication lines between assets representing the same component across data centers
    detail.components.forEach((component) => {
      const componentAssets = component.assets;
      if (componentAssets.length <= 1) return;

      // Find primary write node (taking failover simulation into account)
      const primaryAsset = componentAssets.find((asset) => {
        const isFailed = simulatingFailover && failedDcId === asset.data_center?.id;
        const isPromoted = simulatingFailover && failoverComplete && promotedDcId === asset.data_center?.id;
        return isPromoted || (asset.write_authority && !isFailed);
      });

      if (!primaryAsset) return;

      // Connect replication links from Primary to all Standbys
      componentAssets.forEach((standbyAsset) => {
        if (standbyAsset.id === primaryAsset.id) return;

        const isStandbyFailed = simulatingFailover && failedDcId === standbyAsset.data_center?.id;
        const isPrimaryFailed = simulatingFailover && failedDcId === primaryAsset.data_center?.id;
        const isFlowActive = !isStandbyFailed && !isPrimaryFailed;

        // Custom edge labelling
        let repLabel = 'Replication (Async)';
        if (component.tech_stack === 'oracle') repLabel = 'Data Guard (Sync)';
        if (component.tech_stack === 'mongodb') repLabel = 'Replica Sync';
        if (component.tech_stack === 'ibm_mq') repLabel = 'Queue Forward';

        edgesList.push({
          id: `rep-edge-${primaryAsset.id}-${standbyAsset.id}`,
          source: `asset-${primaryAsset.id}`,
          target: `asset-${standbyAsset.id}`,
          sourceHandle: 'rep-out',
          targetHandle: 'rep-in',
          label: repLabel,
          animated: isFlowActive,
          className: isFlowActive ? 'animated-flow-edge' : 'animated-flow-edge-paused',
          style: {
            stroke: isFlowActive ? '#30D158' : '#FF453A',
            strokeWidth: 2,
            opacity: isFlowActive ? 0.75 : 0.35,
          },
          labelStyle: {
            fill: '#ffffff',
            fontSize: 9,
            fontWeight: '600',
            background: '#0c0f1d',
          },
        });
      });
    });

    return { nodes: nodesList, edges: edgesList };
  }, [detail, dataCenters, assetsByDC, simulatingFailover, failedDcId, failoverComplete, promotedDcId]);

  const inlineCss = `
    @keyframes edgeFlow {
      to {
        stroke-dashoffset: -20;
      }
    }
    .animated-flow-edge path.react-flow__edge-path {
      stroke-dasharray: 6, 4;
      animation: edgeFlow 1s linear infinite;
    }
    .animated-flow-edge-paused path.react-flow__edge-path {
      stroke-dasharray: 4, 4;
    }
    .react-flow__edge-textbg {
      fill: #0c0f1d !important;
      rx: 4;
    }
    .react-flow__edge-text {
      fill: rgba(255, 255, 255, 0.75) !important;
    }
  `;

  return (
    <div 
      className="flex rounded-2xl overflow-hidden border relative" 
      style={{ 
        height: 520, 
        background: 'radial-gradient(circle at 50% 50%, #0c0f1d 0%, #07080f 100%)',
        borderColor: 'rgba(255, 255, 255, 0.05)'
      }}
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
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.02)"
            />
            <Controls
              style={{
                background: '#0d111e',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
              }}
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* Side Evidence / Resource Detail Panel */}
      <AnimatePresence>
        {selectedAsset && (
          <div 
            className="absolute top-0 right-0 h-full w-80 border-l flex flex-col z-50 shadow-2xl overflow-y-auto animate-slideInRight"
            style={{ 
              background: 'rgba(10, 14, 26, 0.98)', 
              borderColor: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(12px)'
            }}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-white/5 flex items-center justify-center">
                  <TechStackIcon techStack={selectedAsset.tech_stack} size={13} />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-white truncate max-w-[180px]">{selectedAsset.name}</h4>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Resource Telemetry Audit</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedAsset(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 flex flex-col gap-4 text-[11px]">
              
              {/* Asset Identity Details */}
              <div className="flex flex-col gap-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="text-[9px] font-extrabold uppercase text-white/40 tracking-wider mb-1">Infrastructure details</div>
                <div className="flex justify-between">
                  <span className="text-white/60">Asset Host:</span>
                  <span className="text-white font-medium select-all">{selectedAsset.host}</span>
                </div>
                {selectedAsset.port && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Registry Port:</span>
                    <span className="text-white font-medium">{selectedAsset.port}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/60">Platform OS:</span>
                  <span className="text-white font-medium">{selectedAsset.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Environment:</span>
                  <span className="text-white font-medium text-emerald-400">{selectedAsset.environment}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Data Center:</span>
                  <span className="text-white font-bold">{selectedAsset.data_center?.name || 'N/A'}</span>
                </div>
              </div>

              {/* Data Consistency Model */}
              <div className="flex flex-col gap-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="text-[9px] font-extrabold uppercase text-white/40 tracking-wider mb-1">Consistency Model</div>
                <div className="flex justify-between">
                  <span className="text-white/60">Role Authority:</span>
                  <span 
                    className="font-extrabold"
                    style={{ color: selectedAsset.write_authority ? '#30D158' : '#FF9F0A' }}
                  >
                    {selectedAsset.write_authority ? 'Write Primary' : 'Read Replica'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Sync Pattern:</span>
                  <span className="text-white font-medium">
                    {selectedAsset.tech_stack === 'oracle' 
                      ? 'Synchronous (Data Guard)' 
                      : selectedAsset.tech_stack === 'mongodb' 
                      ? 'Asynchronous (Replica Set)' 
                      : 'Asynchronous Stream'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Last Sync Time:</span>
                  <span className="text-white font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#30D158]" />
                    {formatRelativeTime(selectedAsset.last_seen_at)}
                  </span>
                </div>
              </div>

              {/* Confidence Matrix evidence */}
              <div className="flex flex-col gap-2 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="text-[9px] font-extrabold uppercase text-white/40 tracking-wider">Source Evidence Audit</div>
                
                <div className="flex items-start gap-2.5 mt-1">
                  <div className="p-1 rounded bg-[#30D158]/10 flex-shrink-0 mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#30D158]" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Source Authority: {selectedAsset.data_source}</div>
                    <div className="text-[9px] text-white/50 mt-0.5">Verified deterministic discovery telemetry.</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 mt-1 border-t border-white/5 pt-2">
                  <div className="p-1 rounded bg-[#0A84FF]/10 flex-shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#0A84FF]" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Import Telemetry age</div>
                    <div className="text-[9px] text-white/50 mt-0.5">Signal timestamp matches design register.</div>
                  </div>
                </div>
              </div>

              {/* Raw JSON evidence metadata */}
              {selectedAsset.metadata && Object.keys(selectedAsset.metadata).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[9px] font-extrabold uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                    <FileJson className="w-3 h-3" />
                    Raw Source Evidence Fields
                  </div>
                  <pre 
                    className="p-3 rounded-xl border text-[10px] font-mono text-white/80 overflow-x-auto max-h-[160px] bg-black/60 border-white/5"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {JSON.stringify(selectedAsset.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
