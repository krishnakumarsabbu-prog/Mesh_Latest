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

function mapToMapDcId(idOrShortName: string | undefined): string | null {
  if (!idOrShortName) return null;
  const norm = idOrShortName.toLowerCase().replace(/^dc-/, '');
  
  if (
    norm === 'ibb1' ||
    norm === 'arv' ||
    norm === 'gl' ||
    norm === 'str' ||
    norm === '1axm'
  ) {
    return 'dc-ibb1';
  }
  if (norm === 'shv' || norm === 'lew' || norm === 'wec') {
    return 'dc-shv';
  }
  if (norm.includes('ga') || norm === 'atl') {
    return 'dc-uat-ga';
  }
  if (
    norm.includes('ma') ||
    norm.includes('md') ||
    norm === 'gar' ||
    norm === 'man' ||
    norm === 'oxm' ||
    norm === 'uat'
  ) {
    return 'dc-uat-ma';
  }
  if (
    norm.includes('az') ||
    norm === 'cld' ||
    norm === 'cloud' ||
    norm === 'unk' ||
    norm === 'tpe'
  ) {
    return 'dc-az3';
  }
  
  return null;
}

function groupAssetsByDC(detail: ApplicationLocationDetail): Map<string, RuntimeAsset[]> {
  const map = new Map<string, RuntimeAsset[]>();
  for (const component of detail.components) {
    for (const asset of component.assets) {
      const rawDcId = asset.data_center?.id;
      const dcId = (rawDcId ? mapToMapDcId(rawDcId) : null) ?? '__unknown__';
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
  activeDcIds: Set<string>,
  assetsByDC: Map<string, RuntimeAsset[]>,
): string | undefined {
  for (const dcId of activeDcIds) {
    if (dcId === failedDcId) continue;
    const assets = assetsByDC.get(dcId) ?? [];
    if (assets.some((a) => a.write_authority)) return dcId;
  }
  return Array.from(activeDcIds).find((id) => id !== failedDcId);
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
  const assetsByDC = useMemo(() => groupAssetsByDC(detail), [detail]);
  const dataCenters = useMemo(() => getDCsFromDetail(detail), [detail]);
  
  const primaryWriteDCId = useMemo(() => {
    const rawId = getPrimaryWriteDC(detail);
    return rawId ? (mapToMapDcId(rawId) || rawId) : undefined;
  }, [detail]);
  
  // Hovered state id or DC id for tooltips
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [hoveredDCId, setHoveredDCId] = useState<string | null>(null);
  const [selectedDcId, setSelectedDcId] = useState<string | null>(null);

  // Progressive Failover Simulation States
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [failoverProgress, setFailoverProgress] = useState<number>(0);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const activeDcIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of dataCenters) {
      const mapped = mapToMapDcId(d.id) || mapToMapDcId(d.short_name);
      if (mapped) ids.add(mapped);
    }
    return ids;
  }, [dataCenters]);

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
          const standby = getStandbyDCForFailed(failedDcId ?? '', activeDcIds, assetsByDC);
          setPromotedDcId(standby ?? null);
          setFailoverComplete(true);
        }
        return next;
      });
    }, stepDuration);

    return () => clearInterval(timer);
  }, [simulatingFailover, failoverComplete, isPaused, simulationSpeed, failedDcId, activeDcIds, assetsByDC, setPromotedDcId, setFailoverComplete]);

  // Dynamic console log builder
  useEffect(() => {
    if (!simulatingFailover) {
      setConsoleLogs((prev) => (prev.length > 0 ? [] : prev));
      return;
    }
    const failedDc = MOCK_DATA_CENTERS.find((d) => d.id === failedDcId);
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
      const standby = getStandbyDCForFailed(failedDcId ?? '', activeDcIds, assetsByDC);
      const standbyName = MOCK_DATA_CENTERS.find((d) => d.id === standby)?.name ?? standby ?? 'Standby Node';
      logs.push(`[${new Date().toLocaleTimeString()}] SUCCESS: ${standbyName} promoted to Write Primary.`);
      logs.push(`[${new Date().toLocaleTimeString()}] INTEGRITY: Replication channels re-established.`);
    }
    setConsoleLogs(logs);
  }, [failoverProgress, simulatingFailover, failedDcId, activeDcIds, assetsByDC]);

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
    
    let fill = 'var(--map-state-default-fill)';
    let stroke = 'var(--map-state-default-stroke)';
    let strokeWidth = '1';
    
    switch (status) {
      case 'primary':
        fill = isHovered ? 'var(--map-state-primary-hover-fill)' : 'var(--map-state-primary-fill)';
        stroke = 'var(--map-state-primary-stroke)';
        strokeWidth = '1.5';
        break;
      case 'secondary':
        fill = isHovered ? 'var(--map-state-secondary-hover-fill)' : 'var(--map-state-secondary-fill)';
        stroke = 'var(--map-state-secondary-stroke)';
        strokeWidth = '1.2';
        break;
      case 'failed':
        fill = isHovered ? 'var(--map-state-failed-hover-fill)' : 'var(--map-state-failed-fill)';
        stroke = 'var(--map-state-failed-stroke)';
        strokeWidth = '1.5';
        break;
      default:
        fill = isHovered ? 'var(--map-state-hover-fill)' : 'var(--map-state-default-fill)';
        stroke = isHovered ? 'var(--map-state-hover-stroke)' : 'var(--map-state-default-stroke)';
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
        linear-gradient(to right, var(--map-grid-color) 1px, transparent 1px),
        linear-gradient(to bottom, var(--map-grid-color) 1px, transparent 1px);
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
              background: failoverComplete ? 'var(--success-subtle)' : 'var(--danger-subtle)',
              border: failoverComplete ? '1px solid var(--success)' : '1px solid var(--danger)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <div className="flex items-center gap-2.5">
              {failoverComplete ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[var(--success)] animate-bounce" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[var(--danger)] animate-pulse" />
              )}
              <div>
                <p className="text-[12px] font-bold" style={{ color: failoverComplete ? 'var(--success)' : 'var(--danger)' }}>
                  {failoverComplete
                    ? `FAILOVER SUCCESSFUL — Standby node ${promotedDcId ? MOCK_DATA_CENTERS.find((d) => d.id === promotedDcId)?.short_name ?? promotedDcId : 'standby'} promoted to authoritative WRITE PRIMARY.`
                    : `CRITICAL ALERT — Simulating failure on ${MOCK_DATA_CENTERS.find((d) => d.id === failedDcId)?.short_name ?? failedDcId}. Promoting standby write authority...`}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Visualizing dynamic replication redirection and data consistency state.
                </p>
              </div>
            </div>
            <button
              onClick={resetSimulation}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--app-surface-hover)]"
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
          background: 'var(--map-container-bg)',
          borderColor: 'var(--app-border)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* HUD Map Controls & Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 z-10 relative">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] tracking-wide uppercase">GEOGRAPHIC TOPOLOGY MAP</h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Hover nodes and states to inspect live compute and data layers</p>
            </div>
          </div>
          
          {/* Map Legend */}
          <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[10px] text-[var(--text-secondary)] shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--success)] inline-block shadow-[0_0_8px_rgba(0,176,116,0.3)]" />
              <span>Write Primary</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--warning)] inline-block shadow-[0_0_8px_rgba(255,177,0,0.3)]" />
              <span>Standby Target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--danger)] inline-block shadow-[0_0_8px_rgba(255,0,60,0.3)]" />
              <span>Failed/Offline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-disabled)] inline-block" />
              <span>Inactive</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-[var(--app-border)] pl-4">
              <div className="w-6 h-0.5 border-t border-dashed border-[var(--accent)] inline-block" />
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
                  onClick={() => isActive && !isFailed && setSelectedDcId(dc.id)}
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
                    fill={isActive ? 'var(--text-primary)' : 'var(--text-muted)'}
                    fontSize="11"
                    fontWeight={isPrimary ? '700' : '500'}
                    className="transition-colors pointer-events-none font-semibold"
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
                      background: 'var(--app-surface-raised)',
                      borderColor: isFailed 
                        ? 'var(--danger)' 
                        : isPrimary 
                        ? 'var(--success)' 
                        : 'var(--app-border)',
                      backdropFilter: 'blur(10px)',
                      boxShadow: 'var(--shadow-lg)'
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-wide">{dc.name}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--app-bg-muted)] text-[var(--text-secondary)] font-medium">
                        {dc.short_name}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                      <span>Environment:</span>
                      <span className="font-semibold text-[var(--text-primary)]">{isActive ? 'Production' : 'Inactive'}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                      <span>Replication Role:</span>
                      <span 
                        className="font-bold text-[9px] px-1.5 py-0.5 rounded uppercase"
                        style={{
                          background: isFailed 
                            ? 'var(--danger-subtle)' 
                            : isPrimary 
                            ? 'var(--success-subtle)' 
                            : isStandby 
                            ? 'var(--warning-subtle)' 
                            : 'var(--app-bg-muted)',
                          color: isFailed ? 'var(--danger)' : isPrimary ? 'var(--success)' : isStandby ? 'var(--warning)' : 'var(--text-muted)'
                        }}
                      >
                        {isFailed ? 'OFFLINE' : isPrimary ? 'WRITE PRIMARY' : isStandby ? 'STANDBY REPLICA' : 'INACTIVE'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                      <span>Component Assets:</span>
                      <span className="font-semibold text-[var(--text-primary)]">{assets.length} active assets</span>
                    </div>

                    {/* Tech stack badges */}
                    {techStacks.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap border-t border-[var(--app-border)] pt-1.5">
                        <span className="text-[9px] text-[var(--text-muted)] mr-1">Stacks:</span>
                        {techStacks.map((stack) => (
                          <div 
                            key={stack} 
                            className="p-1 rounded bg-[var(--app-surface)] flex items-center justify-center border border-[var(--app-border)]" 
                            title={stack}
                          >
                            <TechStackIcon techStack={stack as TechStack} size={12} className="text-[var(--text-primary)]" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Simulation Hint */}
                    {isActive && !simulatingFailover && (
                      <div className="mt-1.5 text-[8px] text-center text-[var(--danger)] font-bold bg-[var(--danger-subtle)] py-1 rounded">
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
        {(() => {
          const isDetailPanelOpen = selectedDcId !== null && !simulatingFailover;
          const colSpanClass = (simulatingFailover || isDetailPanelOpen) ? "lg:col-span-5" : "lg:col-span-12";
          const listFlexClass = (simulatingFailover || isDetailPanelOpen) ? "flex-col overflow-y-auto max-h-[420px] pr-1" : "overflow-x-auto";
          const cardWidthClass = (simulatingFailover || isDetailPanelOpen) ? "w-full" : "w-[250px]";

          return (
            <div className={cn("flex flex-col gap-2.5", colSpanClass)}>
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>Data Center Instance Details</h4>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dataCenters.length} locations configured</span>
              </div>
              
              <div className={cn("flex gap-4 pb-2", listFlexClass)} style={{ scrollbarWidth: 'none' }}>
                {dataCenters.map((dc, index) => {
                  const mapDcId = mapToMapDcId(dc.id) || dc.id;
                  const isFailed = simulatingFailover && failedDcId === mapDcId;
                  const isPromoted = simulatingFailover && failoverComplete && promotedDcId === mapDcId;
                  const isEffectivePrimary = isPromoted || (mapDcId === primaryWriteDCId && !isFailed);
                  const isSelected = selectedDcId === mapDcId;

                  return (
                    <React.Fragment key={dc.id}>
                      <div className={cn("flex-shrink-0 flex flex-col gap-1.5", cardWidthClass)}>
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
                            boxShadow: isPromoted 
                              ? '0 0 25px var(--success-subtle)' 
                              : isSelected 
                              ? '0 0 18px var(--accent-subtle)' 
                              : 'none',
                            border: isSelected ? '2px solid var(--accent)' : 'none',
                            borderRadius: 16,
                          }}
                        >
                          <div 
                            className="cursor-pointer" 
                            onClick={() => !isFailed && !simulatingFailover && setSelectedDcId(mapDcId)}
                          >
                            <DataCenterCard
                              dataCenter={dc}
                              assets={assetsByDC.get(mapDcId) ?? []}
                              isPrimaryWrite={isEffectivePrimary}
                              isFailed={isFailed}
                              onSelectEvidence={onSelectEvidence}
                            />
                          </div>
                        </motion.div>

                        {/* Failover simulation trigger */}
                        {!simulatingFailover && (
                          <button
                            onClick={() => startFailoverSimulation(mapDcId)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                            style={{
                              background: 'var(--danger-subtle)',
                              border: '1px solid rgba(255,69,58,0.15)',
                              color: 'var(--danger)',
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
                      {index < dataCenters.length - 1 && !simulatingFailover && !isDetailPanelOpen && (
                        <div className="flex items-center justify-center flex-shrink-0 px-2">
                          <div className="relative w-8 h-8 flex items-center justify-center rounded-full border shadow-md" style={{ background: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                            <motion.div
                              animate={{ x: [-6, 6], opacity: [0, 1, 0] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
                              className="absolute text-[10px] font-extrabold text-[var(--success)]"
                            >
                              ➔
                            </motion.div>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.3 }}>➔</span>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Column: Data Center Cockpit Detail Panel */}
        {selectedDcId && !simulatingFailover && (() => {
          const realDc = dataCenters.find(d => (mapToMapDcId(d.id) || mapToMapDcId(d.short_name)) === selectedDcId);
          const dcInfo = MOCK_DATA_CENTERS.find(d => d.id === selectedDcId);
          const dcName = realDc?.name || dcInfo?.name || selectedDcId;
          const dcShortName = realDc?.short_name || dcInfo?.short_name || 'UNK';
          const dcRegion = realDc?.region || dcInfo?.region || 'Production Region';
          const dcZone = realDc?.zone || dcInfo?.zone || 'Primary Zone';
          const selectedDcAssets = assetsByDC.get(selectedDcId) || [];
          const selectedDcIsPrimary = selectedDcId === effectivePrimaryId;

          // Group selected DC's assets by Neighborhood
          const groupedByNeighborhood: Record<string, RuntimeAsset[]> = {};
          selectedDcAssets.forEach(asset => {
            const nh = asset.metadata?.neighborhood || 'DEFAULT_ZONE';
            if (!groupedByNeighborhood[nh]) {
              groupedByNeighborhood[nh] = [];
            }
            groupedByNeighborhood[nh].push(asset);
          });

          return (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-7 flex flex-col gap-4 rounded-2xl p-5 border backdrop-blur-md"
              style={{
                background: 'var(--app-surface)',
                borderColor: 'var(--app-border)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-2">
                  <Server className={cn("w-4.5 h-4.5", selectedDcIsPrimary ? "text-[var(--success)]" : "text-[var(--warning)]")} />
                  <div>
                    <h4 className="text-[13px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                      {dcName} Cockpit
                    </h4>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dcRegion} • {dcZone} • {dcShortName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDcId(null)}
                  className="p-1 rounded-lg transition-colors hover:bg-[var(--app-surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2.5 rounded-xl text-center border" style={{ background: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <p className="text-[9px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</p>
                  <p className="text-[11px] font-bold mt-1 text-[var(--success)]">ONLINE</p>
                </div>
                <div className="p-2.5 rounded-xl text-center border" style={{ background: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <p className="text-[9px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Assets</p>
                  <p className="text-[11px] font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{selectedDcAssets.length}</p>
                </div>
                <div className="p-2.5 rounded-xl text-center border" style={{ background: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <p className="text-[9px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--text-muted)' }}>Replication Role</p>
                  <p className="text-[11px] font-bold mt-1 uppercase" style={{ color: selectedDcIsPrimary ? 'var(--success)' : 'var(--warning)' }}>{selectedDcIsPrimary ? 'PRIMARY' : 'STANDBY'}</p>
                </div>
              </div>

              {/* Neighborhoods Drill Down */}
              <div className="flex-1 overflow-y-auto max-h-[280px] space-y-4 pr-1 scrollbar-thin">
                {Object.entries(groupedByNeighborhood).map(([nhName, nhAssets]) => (
                  <div key={nhName} className="space-y-2">
                    <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--app-border)' }}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--warning)]" />
                        <h5 className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--warning)' }}>
                          Neighborhood: {nhName}
                        </h5>
                      </div>
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{nhAssets.length} resource(s)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {nhAssets.map((asset) => {
                        const role = asset.latest_replication_role ?? asset.latest_operational_state ?? 'UNKNOWN';
                        const displayRole = role === 'NONE' ? (asset.latest_operational_state ?? 'ACTIVE') : role;
                        return (
                          <div 
                            key={asset.id} 
                            className="p-3 rounded-xl flex flex-col gap-1.5 hover:bg-[var(--app-surface-hover)] transition-colors border"
                            style={{ background: 'var(--app-bg-muted)', borderColor: 'var(--app-border)' }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <TechStackIcon techStack={asset.tech_stack} size={11} />
                                <span className="text-[10px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{asset.name}</span>
                              </div>
                              {asset.write_authority && (
                                <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase border" style={{ background: 'var(--success-subtle)', color: 'var(--success)', borderColor: 'var(--app-border)' }}>
                                  Write
                                </span>
                              )}
                            </div>
                            {asset.host && (
                              <p className="text-[9px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{asset.host}</p>
                            )}
                            <div className="flex items-center justify-between mt-1 text-[9px]">
                              <span style={{ color: 'var(--text-secondary)' }}>State:</span>
                              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{displayRole}</span>
                            </div>
                            {asset.latest_confidence_level && (
                              <div className="flex items-center justify-between text-[9px]">
                                <span style={{ color: 'var(--text-secondary)' }}>Confidence:</span>
                                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{asset.latest_confidence_level}/4</span>
                              </div>
                            )}
                            {asset.data_source && (
                              <div className="flex items-center justify-between text-[9px]">
                                <span style={{ color: 'var(--text-secondary)' }}>Source:</span>
                                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{asset.data_source}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="border-t pt-3 flex items-center justify-between" style={{ borderColor: 'var(--app-border)' }}>
                <p className="text-[9px] italic" style={{ color: 'var(--text-muted)' }}>Click "Simulate Outage" to test active failover routing.</p>
                <button
                  onClick={() => {
                    startFailoverSimulation(selectedDcId);
                    setSelectedDcId(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[var(--danger)] bg-[var(--danger-subtle)] border border-[var(--danger)]/20 hover:brightness-110 transition-all"
                >
                  <Play className="w-3 h-3" />
                  Simulate Outage
                </button>
              </div>
            </motion.div>
          );
        })()}

        {/* Column: Failover Console */}
        {simulatingFailover && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-7 flex flex-col gap-4 rounded-2xl p-5 border backdrop-blur-md"
            style={{
              background: 'var(--app-surface)',
              borderColor: 'var(--app-border)',
            }}
          >
            {/* Console Header */}
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4.5 h-4.5 text-[var(--danger)]" />
                <div>
                  <h4 className="text-[13px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                    Failover Control Console
                  </h4>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Active Incident Response Systems</p>
                </div>
              </div>

              <div className="flex gap-2">
                {failoverComplete && (
                  <button
                    onClick={exportFailoverReport}
                    className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold border"
                    style={{ background: 'var(--success-subtle)', borderColor: 'var(--success)', color: 'var(--success)' }}
                  >
                    Export Report
                  </button>
                )}
                <button
                  onClick={resetSimulation}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold border transition-colors hover:bg-[var(--app-surface-hover)]"
                  style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--text-muted)' }}
                >
                  Close Console
                </button>
              </div>
            </div>

            {/* Circular Progress & Info Grid */}
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border" style={{ background: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
              {/* Circular progress loader */}
              <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="28" cy="28" r="24" stroke="var(--app-border)" strokeWidth="3.5" fill="transparent" />
                  <circle cx="28" cy="28" r="24" stroke={failoverComplete ? "var(--success)" : "var(--accent)"} strokeWidth="3.5" fill="transparent"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 * (1 - failoverProgress / 100)}
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="absolute text-[10px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {failoverProgress}%
                </span>
              </div>

              {/* Progress Detail */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Mitigation Step</span>
                  <span style={{ color: failoverComplete ? 'var(--success)' : 'var(--accent)' }}>
                    {currentLogMsg}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--app-bg-muted)' }}>
                  <div 
                    className="h-full transition-all duration-300" 
                    style={{ 
                      width: `${failoverProgress}%`, 
                      background: failoverComplete ? 'var(--success)' : 'linear-gradient(to right, var(--accent), #00E599)' 
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* Terminal Prompts (Console Logs) */}
            <div className="flex-1 min-h-[180px] max-h-[180px] border rounded-xl p-3 font-mono text-[9px] overflow-y-auto flex flex-col gap-1.5 scrollbar-thin" style={{ background: 'var(--app-bg-muted)', borderColor: 'var(--app-border)' }}>
              {consoleLogs.map((log, i) => {
                let color = 'var(--success)';
                if (log.includes('ALERT') || log.includes('CRITICAL')) {
                  color = 'var(--danger)';
                } else if (log.includes('INITIATING') || log.includes('ROUTING') || log.includes('SYNCING') || log.includes('TRAFFIC') || log.includes('CHECKING')) {
                  color = 'var(--accent)';
                } else if (log.includes('SUCCESS') || log.includes('INTEGRITY')) {
                  color = 'var(--success)';
                }
                return (
                  <div key={i} style={{ color }} className="leading-normal">
                    {log}
                  </div>
                );
              })}
              {!failoverComplete && !isPaused && (
                <div className="animate-pulse" style={{ color: 'var(--text-muted)' }}>_ [Executing replication task hooks...]</div>
              )}
            </div>

            {/* Console Control Row */}
            <div className="flex items-center justify-between gap-4 border-t border-[var(--app-border)] pt-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors hover:bg-[var(--app-surface-hover)]"
                  style={{
                    background: 'var(--app-surface)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--text-primary)',
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
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors hover:bg-[var(--app-surface-hover)]"
                  style={{
                    background: 'var(--app-surface)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Restart Simulation
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Simulation Speed:</span>
                <div className="flex gap-1">
                  {[1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setSimulationSpeed(speed)}
                      className="px-2.5 py-0.5 rounded text-[10px] font-extrabold transition-all border"
                      style={simulationSpeed === speed ? {
                        background: 'var(--accent)',
                        color: 'var(--text-inverse)',
                        borderColor: 'var(--accent)',
                      } : {
                        background: 'var(--app-surface)',
                        color: 'var(--text-muted)',
                        borderColor: 'var(--app-border)',
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
