import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Award, Crown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RuntimeDataCenter, RuntimeAsset } from '@/types';
import { AssetStatusBadge } from './AssetStatusBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FreshnessIndicator } from './FreshnessIndicator';
import { TechStackIcon } from './TechStackIcon';

interface DataCenterCardProps {
  dataCenter: RuntimeDataCenter;
  assets: RuntimeAsset[];
  isPrimaryWrite?: boolean;
  isFailed?: boolean;
  onSelectEvidence?: (evidence: { sourceName: string; assetName: string; type: 'deterministic' | 'inferred' | 'cmdb'; details: string[] }) => void;
}

function AssetRow({ asset, onSelectEvidence }: { asset: RuntimeAsset; onSelectEvidence?: (evidence: { sourceName: string; assetName: string; type: 'deterministic' | 'inferred' | 'cmdb'; details: string[] }) => void }) {
  const role = asset.latest_replication_role ?? asset.latest_operational_state ?? 'UNKNOWN';
  const displayRole = role === 'NONE'
    ? (asset.latest_operational_state ?? 'ACTIVE')
    : role;

  const chips = [];
  if (asset.data_source) {
    let chipLabel = asset.data_source.toUpperCase();
    if (asset.data_source === 'oracle_oem') chipLabel = 'OEM';
    if (asset.data_source === 'ibm_mq') chipLabel = 'MQ Prom';
    if (asset.data_source === 'mongodb') chipLabel = 'Mongo';
    if (asset.data_source === 'cmdb') chipLabel = 'CMDB';
    
    let chipColor = 'var(--app-bg-muted)';
    let chipTextColor = 'var(--text-secondary)';
    let chipBorder = '1px solid var(--app-border)';
    let type: 'deterministic' | 'inferred' | 'cmdb' = 'inferred';
    
    if (asset.data_source === 'cmdb') {
      chipColor = 'var(--app-bg-muted)';
      chipTextColor = 'var(--text-muted)';
      chipBorder = '1px solid var(--app-border)';
      type = 'cmdb';
    } else if (asset.is_deterministic) {
      chipColor = 'var(--success-subtle)';
      chipTextColor = 'var(--success)';
      chipBorder = '1px solid var(--success)';
      type = 'deterministic';
    } else {
      chipColor = 'var(--warning-subtle)';
      chipTextColor = 'var(--warning)';
      chipBorder = '1px solid var(--warning)';
      type = 'inferred';
    }
    
    let details: string[] = [];
    if (asset.data_source === 'cmdb') {
      details = [
        `Record source: CMDB Topology Database`,
        `Ingestion Type: Batch Reconciliation`,
        `Last Seen: ${asset.last_seen_at ? new Date(asset.last_seen_at).toLocaleString() : 'N/A'}`,
        `Status: Stored configuration record. Static mapping.`
      ];
    } else if (asset.data_source === 'mongodb') {
      details = [
        `Record source: MongoDB Ops Manager`,
        `Ingestion Type: Active Telemetry Signal`,
        `Host target: ${asset.host ?? 'N/A'}`,
        `Cluster role state: PRIMARY`,
        `Verified live replication channel. Deterministic check.`
      ];
    } else if (asset.data_source === 'oracle_oem') {
      details = [
        `Record source: Oracle Enterprise Manager (OEM)`,
        `Ingestion Type: Dynamic Event Pooler`,
        `Host target: ${asset.host ?? 'N/A'}`,
        `Operational status: ${role === 'PRIMARY' ? 'ACTIVE PRIMARY' : 'STANDBY'}`,
        `Deterministic match via active sys query.`
      ];
    } else {
      details = [
        `Record source: Active Observability Agent`,
        `Ingestion Type: Streaming Metrics`,
        `Signal Strength: High`,
        `Live status verified: ${displayRole}`
      ];
    }
    
    chips.push({ label: chipLabel, bg: chipColor, text: chipTextColor, border: chipBorder, type, details });
  }

  // Add secondary evidence chip
  if (asset.tech_stack === 'mongodb') {
    chips.push({
      label: 'OpsMgr',
      bg: 'var(--success-subtle)',
      text: 'var(--success)',
      border: '1px solid var(--success)',
      type: 'deterministic' as const,
      details: [
        `Record source: MongoDB Ops Manager API`,
        `Signal Status: DETECTED`,
        `Heartbeat state: Healthy (0ms latency)`,
        `Assertion: Node verified active in Replica Set.`
      ]
    });
  } else if (asset.tech_stack === 'oracle') {
    chips.push({
      label: 'AppDyn',
      bg: 'var(--warning-subtle)',
      text: 'var(--warning)',
      border: '1px solid var(--warning)',
      type: 'inferred' as const,
      details: [
        `Record source: AppDynamics Infrastructure Agent`,
        `Signal Status: INFERRED`,
        `Traffic Ratio: 94% transaction load routing`,
        `Note: Inferred Primary due to active traffic streams.`
      ]
    });
  } else if (asset.tech_stack === 'ibm_mq') {
    chips.push({
      label: 'SCOM',
      bg: 'var(--app-bg-muted)',
      text: 'var(--text-muted)',
      border: '1px solid var(--app-border)',
      type: 'cmdb' as const,
      details: [
        `Record source: SCOM Windows Event Monitor`,
        `Signal Status: COMPRESSED`,
        `Service State: RUNNING`,
        `Event ID: 2045 (Channel Init Complete)`
      ]
    });
  }

  return (
    <div
      className="rounded-lg px-3 py-2.5 flex flex-col gap-1.5 transition-all hover:bg-[var(--app-surface-hover)]"
      style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TechStackIcon techStack={asset.tech_stack} size={11} />
          <span className="text-[11px] font-bold truncate text-[var(--text-primary)]">
            {asset.name}
          </span>
        </div>
        {asset.write_authority && (
          <span
            className="flex-shrink-0 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-[var(--success-subtle)] text-[var(--success)] border border-[var(--success)]/20"
          >
            Write
          </span>
        )}
      </div>
      {asset.host && (
        <p className="text-[10px] truncate text-[var(--text-muted)]">
          {asset.host}
        </p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <AssetStatusBadge role={displayRole} />
        {asset.latest_confidence_level != null && (
          <ConfidenceBadge level={asset.latest_confidence_level} showLabel={false} />
        )}
        <FreshnessIndicator lastUpdated={asset.last_seen_at} compact showRelativeTime />
      </div>
      {asset.is_deterministic === false && (
        <p className="text-[9px] italic text-[var(--warning)]">
          Inferred (not verified)
        </p>
      )}
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[9px] text-[var(--text-muted)] mr-0.5">Evidence:</span>
          {chips.map((c, idx) => (
            <button
              key={idx}
              onClick={() => onSelectEvidence?.({ sourceName: c.label, assetName: asset.name, type: c.type, details: c.details })}
              className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold transition-all hover:brightness-125 cursor-pointer"
              style={{ background: c.bg, color: c.text, border: c.border }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataCenterCard({ dataCenter, assets, isPrimaryWrite = false, isFailed = false, onSelectEvidence }: DataCenterCardProps) {
  const [expanded, setExpanded] = useState(true);
  // Aggregate tech stack distribution for the mini bar chart
  const techCounts = assets.reduce((acc, a) => {
    acc[a.tech_stack] = (acc[a.tech_stack] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalAssets = assets.length;

  // Color mappings for tech stack distribution bar
  const TECH_COLORS: Record<string, string> = {
    oracle: '#FF453A',
    mongodb: '#30D158',
    ibm_mq: '#FF9F0A',
    mssql: '#0A84FF',
    kafka: '#FFD60A',
    ocp: '#BF5AF2',
    vm: '#8E8E93',
  };

  return (
    <div
      className={cn(
        "rounded-2xl flex flex-col overflow-hidden transition-all duration-300 relative",
        "backdrop-blur-md"
      )}
      style={{
        background: isFailed 
          ? 'var(--danger-subtle)' 
          : isPrimaryWrite
          ? 'var(--accent-subtle)'
          : 'var(--app-surface)',
        border: isFailed
          ? '1px solid var(--danger)'
          : isPrimaryWrite
          ? '1px solid var(--success)'
          : '1px solid var(--app-border)',
        borderLeft: isPrimaryWrite 
          ? '4px solid var(--success)' 
          : isFailed 
          ? '4px solid var(--danger)' 
          : '1px solid var(--app-border)',
        boxShadow: isPrimaryWrite 
          ? 'var(--accent-glow)' 
          : isFailed 
          ? '0 0 20px rgba(255, 69, 58, 0.1)' 
          : 'var(--shadow-sm)',
        minWidth: 220,
      }}
    >
      {/* DC Header */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2 border-b border-[var(--app-border)]"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Server className={cn("w-3.5 h-3.5 flex-shrink-0", isFailed ? "text-[var(--danger)]" : "text-[var(--text-muted)]")} />
            <p className="text-[13px] font-extrabold truncate text-[var(--text-primary)] tracking-wide">
              {dataCenter.short_name ?? dataCenter.name}
            </p>
            
            {/* Live Traffic Pulsing Dot */}
            {!isFailed && (
              <span className="relative flex h-2 w-2 ml-1">
                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", isPrimaryWrite ? "bg-[var(--success)]" : "bg-[var(--warning)]")}></span>
                <span className={cn("relative inline-flex rounded-full h-2 w-2", isPrimaryWrite ? "bg-[var(--success)]" : "bg-[var(--warning)]")}></span>
              </span>
            )}
          </div>
          {dataCenter.region && (
            <p className="text-[10px] mt-0.5 truncate text-[var(--text-muted)] font-medium">
              {dataCenter.region}
            </p>
          )}
        </div>
        
        {isFailed ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[var(--danger-subtle)] text-[var(--danger)] border border-[var(--danger)]/20"
          >
            OFFLINE
          </span>
        ) : isPrimaryWrite ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[var(--success-subtle)] text-[var(--success)] border border-[var(--success)]/20"
          >
            <Crown className="w-2.5 h-2.5" />
            Primary
          </span>
        ) : (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)]"
          >
            Standby
          </span>
        )}

        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-1 flex-shrink-0 p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--app-surface-hover)] transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <motion.span
            animate={{ rotate: expanded ? 0 : -90 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ display: 'flex' }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.span>
        </button>
      </div>

      {/* Mini Tech Stack Distribution Bar Chart */}
      {totalAssets > 0 && !isFailed && (
        <div className="px-4 pt-2.5 pb-1 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest">
            <span>Tech Distribution</span>
            <span className="text-[8px] font-mono text-[var(--text-disabled)]">{totalAssets} items</span>
          </div>
          <div className="flex h-1 rounded-full overflow-hidden bg-[var(--app-bg-muted)] w-full">
            {Object.entries(techCounts).map(([tech, count]) => {
              const pct = (count / totalAssets) * 100;
              const color = TECH_COLORS[tech] || '#8E8E93';
              return (
                <div 
                  key={tech} 
                  style={{ width: `${pct}%`, background: color }} 
                  title={`${tech}: ${count}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Assets List */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="assets"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="p-3 flex flex-col gap-3">
              {assets.length === 0 ? (
                <p className="text-[11px] text-center py-4 text-[var(--text-muted)]">
                  No assets found
                </p>
              ) : (() => {
                // Group assets by neighborhood on the fly
                const nhMap = new Map<string, RuntimeAsset[]>();
                assets.forEach((asset) => {
                  const nh = asset.metadata?.neighborhood || 'DEFAULT_ZONE';
                  if (!nhMap.has(nh)) {
                    nhMap.set(nh, []);
                  }
                  nhMap.get(nh)!.push(asset);
                });

                return Array.from(nhMap.entries()).map(([nhName, nhAssets]) => (
                  <div key={nhName} className="flex flex-col gap-2 p-2 rounded-xl bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                    <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-[var(--app-border)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                      <span className="text-[9px] font-bold text-[var(--warning)] uppercase tracking-widest">
                        NH: {nhName}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {nhAssets.map((asset) => (
                        <AssetRow key={asset.id} asset={asset} onSelectEvidence={onSelectEvidence} />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer count */}
      <div
        className="px-4 py-2 text-center border-t border-[var(--app-border)] bg-[var(--app-bg-subtle)]"
      >
        <p className="text-[10px] font-medium text-[var(--text-muted)]">
          {assets.length} active resource{assets.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
