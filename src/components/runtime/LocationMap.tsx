import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TriangleAlert as AlertTriangle, Play, X, Star, Server, CheckCircle2, ShieldAlert, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationLocationDetail, RuntimeDataCenter, RuntimeAsset, TechStack } from '@/types';
import { DataCenterCard } from './DataCenterCard';
import { USAMapPaths } from './USAMapPaths';
import { TechStackIcon } from './TechStackIcon';
import { MOCK_DATA_CENTERS } from '@/lib/runtimeLocationMock';

interface LocationMapProps {
  detail: ApplicationLocationDetail;
  simulatingFailover: boolean;
  setSimulatingFailover: (v: boolean) => void;
  failedDcId: string | null;
  setFailedDcId: (v: string | null) => void;
  failoverComplete: boolean;
  setFailoverComplete: (v: boolean) => void;
  promotedDcId: string | null;
  setPromotedDcId: (v: string | null) => void;
  onSelectEvidence?: (evidence: { sourceName: string; assetName: string; type: 'deterministic' | 'inferred' | 'cmdb'; details: string[] }) => void;
}

// Map of DC IDs to their approximate SVG coordinates on the 192 9 1028 746 US map projection
const DC_COORDINATES: Record<string, { x: number; y: number }> = {
  'dc-ibb1': { x: 600, y: 280 },    // Denver CO (Central)
  'dc-shv': { x: 720, y: 480 },     // Shoreview/Dallas TX (South-Central)
  'dc-uat-ga': { x: 950, y: 420 },  // Atlanta GA (Southeast)
  'dc-uat-ma': { x: 1050, y: 200 }, // Boston MA / MD (Northeast)
  'dc-az3': { x: 480, y: 380 }      // Phoenix AZ (Southwest)
};

// Map of DC IDs to their state code highlights
const DC_STATE_MAPPING: Record<string, string[]> = {
  'dc-ibb1': ['co'],
  'dc-shv': ['tx'],
  'dc-uat-ga': ['ga'],
  'dc-uat-ma': ['md', 'ma', 'nj', 'ny'],
  'dc-az3': ['az']
};

function groupAssetsByDC(detail: ApplicationLocationDetail): Map<string, RuntimeAsset[]> {
  const map = new Map<string, RuntimeAsset[]>();
  for (const component of detail.components) {
    for (const asset of component.assets) {
      const dcId = asset.data_center?.id ?? '__unknown__';
      if (!map.has(dcId)) map.set(dcId, []);
      map.get(dcId)!.push(asset);
    }
  }
  return map;
}

function getDCsFromDetail(detail: ApplicationLocationDetail): RuntimeDataCenter[] {
  const seen = new Map<string, RuntimeDataCenter>();
  for (const component of detail.components) {
    for (const asset of component.assets) {
      if (asset.data_center && !seen.has(asset.data_center.id)) {
        seen.set(asset.data_center.id, asset.data_center);
      }
    }
  }
  return Array.from(seen.values());
}

function getPrimaryWriteDC(detail: ApplicationLocationDetail): string | undefined {
  for (const component of detail.components) {
    for (const asset of component.assets) {
      if (asset.write_authority && asset.data_center) {
        return asset.data_center.id;
      }
    }
  }
  return undefined;
}

function getStandbyDCForFailed(
  failedDcId: string,
  dataCenters: RuntimeDataCenter[],
  assetsByDC: Map<string, RuntimeAsset[]>,
): string | undefined {
  for (const dc of dataCenters) {
    if (dc.id === failedDcId) continue;
    const assets = assetsByDC.get(dc.id) ?? [];
    if (assets.some((a) => a.write_authority)) return dc.id;
  }
  return dataCenters.find((d) => d.id !== failedDcId)?.id;
}

// Generates a curved quadratic Bezier path for replication lines
function getCurvedPath(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  // Perpendicular vector for offset
  const px = -dy / (len || 1);
  const py = dx / (len || 1);
  
  // Curvature amount
  const k = 35; 
  const cx = mx + px * k;
  const cy = my + py * k;
  
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export function LocationMap({
  detail,
  simulatingFailover,
  setSimulatingFailover,
  failedDcId,
  setFailedDcId,
  failoverComplete,
  setFailoverComplete,
  promotedDcId,
  setPromotedDcId,
  onSelectEvidence,
}: LocationMapProps) {
  const assetsByDC = groupAssetsByDC(detail);
  const dataCenters = getDCsFromDetail(detail);
  const primaryWriteDCId = getPrimaryWriteDC(detail);
  
  // Hovered state id or DC id for tooltips
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [hoveredDCId, setHoveredDCId] = useState<string | null>(null);

  // Progressive Failover Simulation States
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [failoverProgress, setFailoverProgress] = useState<number>(0);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const activeDcIds = new Set(dataCenters.map((d) => d.id));
  const effectivePrimaryId = failoverComplete
    ? promotedDcId
    : simulatingFailover
    ? (primaryWriteDCId !== failedDcId ? primaryWriteDCId : null)
    : primaryWriteDCId;

  // Progressive failover state updates
  useEffect(() => {
    if (!simulatingFailover || failoverComplete || isPaused) return;

    // Adjust step rate based on speed
    const stepDuration = 150 / simulationSpeed;
    const timer = setInterval(() => {
      setFailoverProgress((prev) => {
        const next = Math.min(prev + 2, 100);
        if (next === 100) {
          clearInterval(timer);
          const standby = getStandbyDCForFailed(failedDcId ?? '', dataCenters, assetsByDC);
          setPromotedDcId(standby ?? null);
          setFailoverComplete(true);
        }
        return next;
      });
    }, stepDuration);

    return () => clearInterval(timer);
  }, [simulatingFailover, failoverComplete, isPaused, simulationSpeed, failedDcId, dataCenters, assetsByDC, setPromotedDcId, setFailoverComplete]);

  // Dynamic console log builder
  useEffect(() => {
    if (!simulatingFailover) {
      setConsoleLogs([]);
      return;
    }
    const failedDc = dataCenters.find((d) => d.id === failedDcId);
    const failedDcName = failedDc?.name ?? failedDcId ?? 'Data Center';
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleTimeString()}] ALERT: Outage detected on data center: ${failedDcName}`);
    logs.push(`[${new Date().toLocaleTimeString()}] CRITICAL: Alignment lost. Primary authority unavailable.`);
    logs.push(`[${new Date().toLocaleTimeString()}] INITIATING: Mitigation sequence launched.`);

    if (failoverProgress >= 15) {
      logs.push(`[${new Date().toLocaleTimeString()}] ROUTING: Fetching OpenShift route redirection rules.`);
    }
    if (failoverProgress >= 35) {
      logs.push(`[${new Date().toLocaleTimeString()}] SYNCING: Replicating state databases to standby targets.`);
    }
    if (failoverProgress >= 60) {
      logs.push(`[${new Date().toLocaleTimeString()}] TRAFFIC: Diverting ingress routers to secondary node.`);
    }
    if (failoverProgress >= 85) {
      logs.push(`[${new Date().toLocaleTimeString()}] CHECKING: Executing load balancer and node health checks.`);
    }
    if (failoverProgress >= 100) {
      const standby = getStandbyDCForFailed(failedDcId ?? '', dataCenters, assetsByDC);
      const standbyName = dataCenters.find((d) => d.id === standby)?.name ?? standby ?? 'Standby Node';
      logs.push(`[${new Date().toLocaleTimeString()}] SUCCESS: ${standbyName} promoted to Write Primary.`);
      logs.push(`[${new Date().toLocaleTimeString()}] INTEGRITY: Replication channels re-established.`);
    }
    setConsoleLogs(logs);
  }, [failoverProgress, simulatingFailover, failedDcId, dataCenters, assetsByDC]);

  const currentLogMsg = useMemo(() => {
    if (failoverProgress >= 100) return 'Mitigation sequence completed successfully.';
    if (failoverProgress >= 85) return 'Verifying endpoint health checks...';
    if (failoverProgress >= 60) return 'Redirecting routing layers...';
    if (failoverProgress >= 35) return 'Syncing database instances...';
    if (failoverProgress >= 15) return 'Calculating failover parameters...';
    return 'Initializing backup nodes...';
  }, [failoverProgress]);

  function exportFailoverReport() {
    const logText = consoleLogs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `healthmesh-failover-report-${detail.application_id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (dataCenters.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 rounded-xl" style={{ border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No data center topology available
        </p>
      </div>
    );
  }

  function startFailoverSimulation(dcId: string) {
    setHoveredDCId(null);
    setFailedDcId(dcId);
    setSimulatingFailover(true);
    setFailoverComplete(false);
    setPromotedDcId(null);
    setFailoverProgress(0);
    setIsPaused(false);
  }

  function resetSimulation() {
    setSimulatingFailover(false);
    setFailedDcId(null);
    setFailoverComplete(false);
    setPromotedDcId(null);
    setFailoverProgress(0);
    setIsPaused(false);
  }

  // Determine role of a specific state path on the map
  function getStateStatus(stateId: string): 'primary' | 'secondary' | 'failed' | 'default' {
    for (const [dcId, states] of Object.entries(DC_STATE_MAPPING)) {
      if (states.includes(stateId)) {
        const isActive = activeDcIds.has(dcId);
        if (!isActive) return 'default';
        if (dcId === failedDcId) return 'failed';
        if (dcId === effectivePrimaryId) return 'primary';
        return 'secondary';
      }
    }
    return 'default';
  }

  // Generate SVG path classes and styles dynamically
  function getPathProps(stateId: string) {
    const status = getStateStatus(stateId);
    const isHovered = hoveredState === stateId;
    
    let fill = 'rgba(255, 255, 255, 0.012)';
    let stroke = 'rgba(255, 255, 255, 0.05)';
    let strokeWidth = '1';
    
    switch (status) {
      case 'primary':
        fill = isHovered ? 'rgba(48, 209, 88, 0.16)' : 'rgba(48, 209, 88, 0.06)';
        stroke = 'rgba(48, 209, 88, 0.35)';
        strokeWidth = '1.5';
        break;
      case 'secondary':
        fill = isHovered ? 'rgba(255, 159, 10, 0.14)' : 'rgba(255, 159, 10, 0.05)';
        stroke = 'rgba(255, 159, 10, 0.25)';
        strokeWidth = '1.2';
        break;
      case 'failed':
        fill = isHovered ? 'rgba(255, 69, 58, 0.22)' : 'rgba(255, 69, 58, 0.08)';
        stroke = 'rgba(255, 69, 58, 0.45)';
        strokeWidth = '1.5';
        break;
      default:
        fill = isHovered ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.012)';
        stroke = isHovered ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)';
        break;
    }
    
    return {
      fill,
      stroke,
      strokeWidth,
      className: 'transition-all duration-300 ease-out cursor-pointer',
      onMouseEnter: () => setHoveredState(stateId),
      onMouseLeave: () => setHoveredState(null)
    };
  }

  // Animation CSS classes injected safely into the page
  const inlineStyles = `
    @keyframes replicationFlow {
      to {
        stroke-dashoffset: -20;
      }
    }
    .replication-line {
      stroke-dasharray: 6, 4;
      animation: replicationFlow 1.2s linear infinite;
    }
    .replication-line-paused {
      stroke-dasharray: 4, 4;
    }
    @keyframes pulseRing {
      0% {
        transform: scale(0.95);
        opacity: 0.8;
      }
      50% {
        transform: scale(1.35);
        opacity: 0.35;
      }
      100% {
        transform: scale(0.95);
        opacity: 0;
      }
    }
    .pulse-ring-active {
      transform-origin: center;
      animation: pulseRing 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .grid-bg {
      background-size: 30px 30px;
      background-image: 
        linear-gradient(to right, rgba(255,255,255,0.01) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.01) 1px, transparent 1px);
    }
  `;

  return (
    <div className="flex flex-col gap-4">
      <style>{inlineStyles}</style>

      {/* Failover simulation banner */}
      <AnimatePresence>
        {simulatingFailover && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
            style={{
              background: failoverComplete ? 'rgba(48,209,88,0.08)' : 'rgba(255,69,58,0.08)',
              border: failoverComplete ? '1px solid rgba(48,209,88,0.25)' : '1px solid rgba(255,69,58,0.25)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <div className="flex items-center gap-2.5">
              {failoverComplete ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#30D158] animate-bounce" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#FF453A] animate-pulse" />
              )}
              <div>
                <p className="text-[12px] font-bold" style={{ color: failoverComplete ? '#30D158' : '#FF453A' }}>
                  {failoverComplete
                    ? `FAILOVER SUCCESSFUL — Standby node ${promotedDcId ? dataCenters.find((d) => d.id === promotedDcId)?.short_name ?? promotedDcId : 'standby'} promoted to authoritative WRITE PRIMARY.`
                    : `CRITICAL ALERT — Simulating failure on ${dataCenters.find((d) => d.id === failedDcId)?.short_name ?? failedDcId}. Promoting standby write authority...`}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Visualizing dynamic replication redirection and data consistency state.
                </p>
              </div>
            </div>
            <button
              onClick={resetSimulation}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Interactive Geographic Panel */}
      <div 
        className="relative rounded-2xl p-5 overflow-hidden grid-bg border"
        style={{
          background: 'radial-gradient(circle at 50% 50%, #0D1326 0%, #070913 100%)',
          borderColor: 'rgba(255, 255, 255, 0.05)',
          boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.6)'
        }}
      >
        {/* HUD Map Controls & Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 z-10 relative">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0A84FF]" />
            <div>
              <h3 className="text-[13px] font-semibold text-white tracking-wide uppercase">GEOGRAPHIC TOPOLOGY MAP</h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Hover nodes and states to inspect live compute and data layers</p>
            </div>
          </div>
          
          {/* Map Legend */}
          <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-[10px] text-white/70">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#30D158] inline-block shadow-[0_0_8px_rgba(48,209,88,0.6)]" />
              <span>Write Primary</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF9F0A] inline-block shadow-[0_0_8px_rgba(255,159,10,0.6)]" />
              <span>Standby Target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF453A] inline-block shadow-[0_0_8px_rgba(255,69,58,0.6)]" />
              <span>Failed/Offline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#48484A] inline-block" />
              <span>Inactive</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
              <div className="w-6 h-0.5 border-t border-dashed border-[#0A84FF] inline-block" />
              <span>Replication Link</span>
            </div>
          </div>
        </div>

        {/* USA SVG MAP VIEW */}
        <div className="w-full h-full min-h-[300px] max-h-[500px] flex items-center justify-center">
          <svg
            viewBox="192 9 1028 746"
            className="w-full h-auto max-w-4xl select-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Base USA State Paths */}
            <USAMapPaths pathProps={getPathProps} />

            {/* Replication flow lines (only from active write primary to other active standbys) */}
            {effectivePrimaryId && MOCK_DATA_CENTERS.map((dc) => {
              const isActive = activeDcIds.has(dc.id);
              const isPrimary = dc.id === effectivePrimaryId;
              
              if (!isActive || isPrimary) return null;
              
              const primaryCoords = DC_COORDINATES[effectivePrimaryId];
              const standbyCoords = DC_COORDINATES[dc.id];
              
              if (!primaryCoords || !standbyCoords) return null;
              
              // Verify line health
              const isLineHealthy = (dc.id !== failedDcId) && (effectivePrimaryId !== failedDcId);
              
              // Color based on health state
              const strokeColor = isLineHealthy ? '#0A84FF' : '#FF453A';
              const opacity = isLineHealthy ? 0.6 : 0.25;
              
              return (
                <g key={`replication-flow-${dc.id}`}>
                  {/* Physical route line (curved) */}
                  <path
                    d={getCurvedPath(primaryCoords.x, primaryCoords.y, standbyCoords.x, standbyCoords.y)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="1.5"
                    opacity={opacity * 0.4}
                  />
                  {/* Pulse flow path (curved) */}
                  <path
                    d={getCurvedPath(primaryCoords.x, primaryCoords.y, standbyCoords.x, standbyCoords.y)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2"
                    opacity={opacity}
                    className={isLineHealthy ? "replication-line" : "replication-line-paused"}
                    style={{ animationPlayState: isLineHealthy ? 'running' : 'paused' }}
                  />
                </g>
              );
            })}

            {/* Data Center Dot Markers */}
            {MOCK_DATA_CENTERS.map((dc) => {
              const coords = DC_COORDINATES[dc.id];
              if (!coords) return null;
              
              const isActive = activeDcIds.has(dc.id);
              const isFailed = simulatingFailover && failedDcId === dc.id;
              const isPrimary = dc.id === effectivePrimaryId;
              const isStandby = isActive && !isPrimary && !isFailed;
              
              // Node styling based on current state
              let dotColor = '#48484A';
              let ringColor = 'rgba(72, 72, 74, 0.4)';
              let radius = 7;
              
              if (isFailed) {
                dotColor = '#FF453A';
                ringColor = 'rgba(255, 69, 58, 0.5)';
                radius = 9;
              } else if (isPrimary) {
                dotColor = '#30D158';
                ringColor = 'rgba(48, 209, 88, 0.5)';
                radius = 11;
              } else if (isStandby) {
                dotColor = '#FF9F0A';
                ringColor = 'rgba(255, 159, 10, 0.4)';
                radius = 8;
              }

              return (
                <g
                  key={dc.id}
                  className="cursor-pointer group"
                  onClick={() => isActive && !isFailed && startFailoverSimulation(dc.id)}
                  onMouseEnter={() => setHoveredDCId(dc.id)}
                  onMouseLeave={() => setHoveredDCId(null)}
                >
                  {/* Pulsing ring for active / failed states */}
                  {(isPrimary || isStandby || isFailed) && (
                    <circle
                      cx={coords.x}
                      cy={coords.y}
                      r={radius * 2}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="1.5"
                      className="pulse-ring-active"
                    />
                  )}
                  
                  {/* Inner interactive glow circle */}
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r={radius + 4}
                    fill="transparent"
                    className="transition-all group-hover:scale-125"
                  />

                  {/* Core DC Dot */}
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r={radius}
                    fill={dotColor}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1.5"
                    className="transition-all duration-300"
                    style={{
                      filter: (isPrimary || isFailed) ? `drop-shadow(0 0 8px ${dotColor})` : 'none'
                    }}
                  />
                  
                  {/* Primary write DC crown/star badge */}
                  {isPrimary && (
                    <g transform={`translate(${coords.x - 7}, ${coords.y - 23}) scale(0.6)`}>
                      <path
                        d="M12 2L2 22h20L12 2z"
                        fill="#FFD700"
                        stroke="#000"
                        strokeWidth="1"
                        style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.6))' }}
                      />
                      <circle cx="12" cy="15" r="3" fill="#000" />
                    </g>
                  )}

                  {/* Failed/Offline indicator badge */}
                  {isFailed && (
                    <g transform={`translate(${coords.x - 18}, ${coords.y - 18}) scale(0.7)`}>
                      <circle cx="25" cy="25" r="9" fill="#000" />
                      <path
                        d="M12 22L24 2l12 20H12z"
                        fill="#FF453A"
                        style={{ filter: 'drop-shadow(0 0 3px rgba(255,69,58,0.8))' }}
                      />
                    </g>
                  )}

                  {/* Text Label next to node */}
                  <text
                    x={coords.x + radius + 6}
                    y={coords.y + 4}
                    fill={isActive ? '#ffffff' : 'rgba(255,255,255,0.35)'}
                    fontSize="11"
                    fontWeight={isPrimary ? '700' : '500'}
                    className="transition-colors pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                  >
                    {dc.short_name}
                  </text>
                </g>
              );
            })}

            {/* Custom Tooltips positioned right over the SVG element coordinates */}
            {MOCK_DATA_CENTERS.map((dc) => {
              const coords = DC_COORDINATES[dc.id];
              if (!coords || hoveredDCId !== dc.id) return null;
              
              const isActive = activeDcIds.has(dc.id);
              const isFailed = simulatingFailover && failedDcId === dc.id;
              const isPrimary = dc.id === effectivePrimaryId;
              const isStandby = isActive && !isPrimary && !isFailed;
              
              const assets = assetsByDC.get(dc.id) || [];
              const techStacks = Array.from(new Set(assets.map((a) => a.tech_stack).filter(Boolean)));
              
              return (
                <foreignObject
                  key={`tooltip-${dc.id}`}
                  x={coords.x - 120}
                  y={coords.y - 170}
                  width="240"
                  height="160"
                  className="overflow-visible pointer-events-none select-none z-50"
                >
                  <div 
                    className="rounded-xl border p-3 shadow-2xl flex flex-col gap-1.5 animate-fadeIn"
                    style={{
                      background: 'rgba(10, 14, 26, 0.95)',
                      borderColor: isFailed 
                        ? 'rgba(255,69,58,0.4)' 
                        : isPrimary 
                        ? 'rgba(48,209,88,0.4)' 
                        : 'rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)'
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-white/70" />
                        <span className="text-[11px] font-bold text-white tracking-wide">{dc.name}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white font-medium">
                        {dc.short_name}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/80">
                      <span>Environment:</span>
                      <span className="font-semibold text-white/90">{isActive ? 'Production' : 'Inactive'}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/80">
                      <span>Replication Role:</span>
                      <span 
                        className="font-bold text-[9px] px-1.5 py-0.5 rounded uppercase"
                        style={{
                          background: isFailed 
                            ? 'rgba(255,69,58,0.15)' 
                            : isPrimary 
                            ? 'rgba(48,209,88,0.15)' 
                            : isStandby 
                            ? 'rgba(255,159,10,0.15)' 
                            : 'rgba(255,255,255,0.05)',
                          color: isFailed ? '#FF453A' : isPrimary ? '#30D158' : isStandby ? '#FF9F0A' : '#8E8E93'
                        }}
                      >
                        {isFailed ? 'OFFLINE' : isPrimary ? 'WRITE PRIMARY' : isStandby ? 'STANDBY REPLICA' : 'INACTIVE'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/80">
                      <span>Component Assets:</span>
                      <span className="font-semibold text-white/90">{assets.length} active assets</span>
                    </div>

                    {/* Tech stack badges */}
                    {techStacks.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap border-t border-white/5 pt-1.5">
                        <span className="text-[9px] text-white/50 mr-1">Stacks:</span>
                        {techStacks.map((stack) => (
                          <div 
                            key={stack} 
                            className="p-1 rounded bg-white/5 flex items-center justify-center border border-white/5" 
                            title={stack}
                          >
                            <TechStackIcon techStack={stack as TechStack} size={12} className="text-white" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Simulation Hint */}
                    {isActive && !simulatingFailover && (
                      <div className="mt-1.5 text-[8px] text-center text-[#FF453A]/80 font-bold bg-[#FF453A]/10 py-1 rounded">
                        Click node to simulate failover
                      </div>
                    )}
                  </div>
                </foreignObject>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Grid of Data Center Cards + Failover Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2 items-start">
        {/* Column: Data Center Cards */}
        <div className={cn("flex flex-col gap-2.5", simulatingFailover ? "lg:col-span-5" : "lg:col-span-12")}>
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Data Center Instance Details</h4>
            <span className="text-[10px] text-white/40">{dataCenters.length} locations configured</span>
          </div>
          
          <div className={cn("flex gap-4 pb-2", simulatingFailover ? "flex-col overflow-y-auto max-h-[420px] pr-1" : "overflow-x-auto")} style={{ scrollbarWidth: 'none' }}>
            {dataCenters.map((dc, index) => {
              const isFailed = simulatingFailover && failedDcId === dc.id;
              const isPromoted = simulatingFailover && failoverComplete && promotedDcId === dc.id;
              const isEffectivePrimary = isPromoted || (dc.id === primaryWriteDCId && !isFailed);

              return (
                <React.Fragment key={dc.id}>
                  <div className={cn("flex-shrink-0 flex flex-col gap-1.5", simulatingFailover ? "w-full" : "w-[250px]")}>
                    <motion.div
                      animate={
                        isFailed
                          ? { opacity: [1, 0.45, 0.25], scale: [1, 0.98, 0.96] }
                          : isPromoted
                          ? { scale: [1, 1.02, 1], opacity: 1 }
                          : { opacity: 1, scale: 1 }
                      }
                      transition={{ duration: 0.8, ease: 'easeInOut' }}
                      style={{
                        filter: isFailed ? 'grayscale(0.6)' : 'none',
                        boxShadow: isPromoted ? '0 0 25px rgba(48,209,88,0.25)' : 'none',
                        borderRadius: 16,
                      }}
                    >
                      <DataCenterCard
                        dataCenter={dc}
                        assets={assetsByDC.get(dc.id) ?? []}
                        isPrimaryWrite={isEffectivePrimary}
                        isFailed={isFailed}
                        onSelectEvidence={onSelectEvidence}
                      />
                    </motion.div>

                    {/* Failover simulation trigger */}
                    {!simulatingFailover && (
                      <button
                        onClick={() => startFailoverSimulation(dc.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                        style={{
                          background: 'rgba(255,69,58,0.06)',
                          border: '1px solid rgba(255,69,58,0.15)',
                          color: '#FF453A',
                          opacity: 0.6,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                      >
                        <Play className="w-2.5 h-2.5" />
                        Simulate Node Outage
                      </button>
                    )}
                  </div>
                  {index < dataCenters.length - 1 && !simulatingFailover && (
                    <div className="flex items-center justify-center flex-shrink-0 px-2">
                      <div className="relative w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/5 shadow-md">
                        <motion.div
                          animate={{ x: [-6, 6], opacity: [0, 1, 0] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
                          className="absolute text-[10px] font-extrabold text-[#00E599]"
                        >
                          ➔
                        </motion.div>
                        <span className="text-white/20 text-[10px]">➔</span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Column: Failover Console */}
        {simulatingFailover && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-7 flex flex-col gap-4 rounded-2xl p-5 border backdrop-blur-md"
            style={{
              background: 'rgba(15, 20, 28, 0.4)',
              borderColor: 'rgba(255, 255, 255, 0.06)',
            }}
          >
            {/* Console Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4.5 h-4.5 text-[#FF453A]" />
                <div>
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-wider">
                    Failover Control Console
                  </h4>
                  <p className="text-[10px] text-white/40">Active Incident Response Systems</p>
                </div>
              </div>

              <div className="flex gap-2">
                {failoverComplete && (
                  <button
                    onClick={exportFailoverReport}
                    className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold border bg-[#30D158]/10 border-[#30D158]/20 text-[#30D158] hover:bg-[#30D158]/20 transition-colors"
                  >
                    Export Report
                  </button>
                )}
                <button
                  onClick={resetSimulation}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold border bg-white/5 border-white/10 text-white/60 hover:bg-white/10 transition-colors"
                >
                  Close Console
                </button>
              </div>
            </div>

            {/* Circular Progress & Info Grid */}
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-xl">
              {/* Circular progress loader */}
              <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="28" cy="28" r="24" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="3.5" fill="transparent" />
                  <circle cx="28" cy="28" r="24" stroke={failoverComplete ? "#30D158" : "var(--primary-500)"} strokeWidth="3.5" fill="transparent"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 * (1 - failoverProgress / 100)}
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="absolute text-[10px] font-bold text-white font-mono">
                  {failoverProgress}%
                </span>
              </div>

              {/* Progress Detail */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/40 uppercase tracking-wider">Mitigation Step</span>
                  <span style={{ color: failoverComplete ? '#30D158' : 'var(--primary-500)' }}>
                    {currentLogMsg}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                  <div 
                    className="h-full transition-all duration-300" 
                    style={{ 
                      width: `${failoverProgress}%`, 
                      background: failoverComplete ? '#30D158' : 'linear-gradient(to right, var(--primary-500), #00E599)' 
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* Terminal Prompts (Console Logs) */}
            <div className="flex-1 min-h-[180px] max-h-[180px] bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[9px] overflow-y-auto flex flex-col gap-1.5 scrollbar-thin">
              {consoleLogs.map((log, i) => {
                let color = '#30D158'; // Green
                if (log.includes('ALERT') || log.includes('CRITICAL')) {
                  color = '#FF453A';
                } else if (log.includes('INITIATING') || log.includes('ROUTING') || log.includes('SYNCING') || log.includes('TRAFFIC') || log.includes('CHECKING')) {
                  color = '#0A84FF';
                } else if (log.includes('SUCCESS') || log.includes('INTEGRITY')) {
                  color = '#30D158';
                }
                return (
                  <div key={i} style={{ color }} className="leading-normal">
                    {log}
                  </div>
                );
              })}
              {!failoverComplete && !isPaused && (
                <div className="text-white/20 animate-pulse">_ [Executing replication task hooks...]</div>
              )}
            </div>

            {/* Console Control Row */}
            <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors hover:bg-white/5"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                  }}
                >
                  {isPaused ? 'Resume Failover' : 'Pause Failover'}
                </button>
                <button
                  onClick={() => {
                    setFailoverProgress(0);
                    setFailoverComplete(false);
                    setPromotedDcId(null);
                    setIsPaused(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors hover:bg-white/5"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  Restart Simulation
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-white/40 uppercase">Simulation Speed:</span>
                <div className="flex gap-1">
                  {[1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setSimulationSpeed(speed)}
                      className="px-2.5 py-0.5 rounded text-[10px] font-extrabold transition-all"
                      style={simulationSpeed === speed ? {
                        background: 'var(--primary-500)',
                        color: '#fff',
                      } : {
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
