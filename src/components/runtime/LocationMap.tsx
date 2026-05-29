import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TriangleAlert as AlertTriangle, Play, X } from 'lucide-react';
import type { ApplicationLocationDetail, RuntimeDataCenter, RuntimeAsset } from '@/types';
import { DataCenterCard } from './DataCenterCard';

interface LocationMapProps {
  detail: ApplicationLocationDetail;
}

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
  // Find a DC with write authority that isn't the failed one
  for (const dc of dataCenters) {
    if (dc.id === failedDcId) continue;
    const assets = assetsByDC.get(dc.id) ?? [];
    if (assets.some((a) => a.write_authority)) return dc.id;
  }
  // Otherwise return first other DC
  return dataCenters.find((d) => d.id !== failedDcId)?.id;
}

export function LocationMap({ detail }: LocationMapProps) {
  const assetsByDC = groupAssetsByDC(detail);
  const dataCenters = getDCsFromDetail(detail);
  const primaryWriteDCId = getPrimaryWriteDC(detail);

  const [simulatingFailover, setSimulatingFailover] = useState(false);
  const [failedDcId, setFailedDcId] = useState<string | null>(null);
  const [failoverComplete, setFailoverComplete] = useState(false);
  const [promotedDcId, setPromotedDcId] = useState<string | null>(null);

  if (dataCenters.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No data center topology available
        </p>
      </div>
    );
  }

  function startFailoverSimulation(dcId: string) {
    setFailedDcId(dcId);
    setSimulatingFailover(true);
    setFailoverComplete(false);
    setPromotedDcId(null);

    // After 1.5s, promote the standby DC
    setTimeout(() => {
      const standby = getStandbyDCForFailed(dcId, dataCenters, assetsByDC);
      setPromotedDcId(standby ?? null);
      setFailoverComplete(true);
    }, 1500);
  }

  function resetSimulation() {
    setSimulatingFailover(false);
    setFailedDcId(null);
    setFailoverComplete(false);
    setPromotedDcId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Simulation banner */}
      <AnimatePresence>
        {simulatingFailover && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            style={{
              background: failoverComplete ? 'rgba(48,209,88,0.08)' : 'rgba(255,69,58,0.08)',
              border: failoverComplete ? '1px solid rgba(48,209,88,0.3)' : '1px solid rgba(255,69,58,0.3)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0"
                style={{ color: failoverComplete ? '#30D158' : '#FF453A' }}
              />
              <div>
                <p className="text-[12px] font-bold" style={{ color: failoverComplete ? '#30D158' : '#FF453A' }}>
                  {failoverComplete
                    ? `Failover complete — ${promotedDcId ? dataCenters.find((d) => d.id === promotedDcId)?.short_name ?? promotedDcId : 'standby'} promoted to PRIMARY`
                    : `Simulating ${dataCenters.find((d) => d.id === failedDcId)?.short_name ?? failedDcId} going OFFLINE...`}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Simulation only — no real changes made
                </p>
              </div>
            </div>
            <button
              onClick={resetSimulation}
              className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DC Cards row */}
      <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {dataCenters.map((dc) => {
          const isFailed = simulatingFailover && failedDcId === dc.id;
          const isPromoted = simulatingFailover && failoverComplete && promotedDcId === dc.id;
          const isEffectivePrimary = isPromoted || (dc.id === primaryWriteDCId && !isFailed);

          return (
            <div key={dc.id} className="flex-shrink-0 flex flex-col gap-1.5" style={{ width: 240 }}>
              <motion.div
                animate={
                  isFailed
                    ? { opacity: [1, 0.3, 0.15], scale: [1, 0.98, 0.96] }
                    : isPromoted
                    ? { scale: [1, 1.02, 1], opacity: 1 }
                    : { opacity: 1, scale: 1 }
                }
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                style={{
                  filter: isFailed ? 'grayscale(0.6)' : 'none',
                  boxShadow: isPromoted ? '0 0 20px rgba(48,209,88,0.25)' : 'none',
                  borderRadius: 16,
                }}
              >
                <DataCenterCard
                  dataCenter={dc}
                  assets={assetsByDC.get(dc.id) ?? []}
                  isPrimaryWrite={isEffectivePrimary}
                  isFailed={isFailed}
                />
              </motion.div>

              {/* Failover simulation trigger */}
              {!simulatingFailover && (
                <button
                  onClick={() => startFailoverSimulation(dc.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all opacity-0 group-hover:opacity-100"
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
                  Simulate Failure
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
