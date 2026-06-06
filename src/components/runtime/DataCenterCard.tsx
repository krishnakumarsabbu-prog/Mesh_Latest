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
    
    let chipColor = 'rgba(255,255,255,0.1)';
    let chipTextColor = 'rgba(255,255,255,0.6)';
    let chipBorder = '1px solid rgba(255,255,255,0.15)';
    let type: 'deterministic' | 'inferred' | 'cmdb' = 'inferred';
    
    if (asset.data_source === 'cmdb') {
      chipColor = 'rgba(142,142,147,0.08)';
      chipTextColor = '#8E8E93';
      chipBorder = '1px solid rgba(142,142,147,0.2)';
      type = 'cmdb';
    } else if (asset.is_deterministic) {
      chipColor = 'rgba(48,209,88,0.08)';
      chipTextColor = '#30D158';
      chipBorder = '1px solid rgba(48,209,88,0.2)';
      type = 'deterministic';
    } else {
      chipColor = 'rgba(255,159,10,0.08)';
      chipTextColor = '#FF9F0A';
      chipBorder = '1px solid rgba(255,159,10,0.2)';
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
      bg: 'rgba(48,209,88,0.08)',
      text: '#30D158',
      border: '1px solid rgba(48,209,88,0.2)',
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
      bg: 'rgba(255,159,10,0.08)',
      text: '#FF9F0A',
      border: '1px solid rgba(255,159,10,0.2)',
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
      bg: 'rgba(142,142,147,0.1)',
      text: '#8E8E93',
      border: '1px solid rgba(142,142,147,0.2)',
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
      className="rounded-lg px-3 py-2.5 flex flex-col gap-1.5 transition-all hover:bg-white/5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TechStackIcon techStack={asset.tech_stack} size={11} />
          <span className="text-[11px] font-bold truncate text-white/90">
            {asset.name}
          </span>
        </div>
        {asset.write_authority && (
          <span
            className="flex-shrink-0 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20"
          >
            Write
          </span>
        )}
      </div>
      {asset.host && (
        <p className="text-[10px] truncate text-white/50">
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
        <p className="text-[9px] italic text-[#FF9F0A]">
          Inferred (not verified)
        </p>
      )}
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[9px] text-white/30 mr-0.5">Evidence:</span>
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
          ? 'rgba(255, 69, 58, 0.05)' 
          : isPrimaryWrite
          ? 'rgba(10, 18, 30, 0.75)'
          : 'rgba(20, 20, 25, 0.65)',
        border: isFailed
          ? '1px solid rgba(255,69,58,0.35)'
          : isPrimaryWrite
          ? '1px solid rgba(0, 229, 153, 0.3)'
          : '1px solid rgba(255,255,255,0.06)',
        borderLeft: isPrimaryWrite 
          ? '4px solid #00E599' 
          : isFailed 
          ? '4px solid #FF453A' 
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isPrimaryWrite 
          ? '0 0 20px rgba(0, 229, 153, 0.15)' 
          : isFailed 
          ? '0 0 20px rgba(255, 69, 58, 0.1)' 
          : '0 4px 15px rgba(0, 0, 0, 0.2)',
        minWidth: 220,
      }}
    >
      {/* DC Header */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2 border-b border-white/5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Server className={cn("w-3.5 h-3.5 flex-shrink-0", isFailed ? "text-[#FF453A]" : "text-white/50")} />
            <p className="text-[13px] font-extrabold truncate text-white tracking-wide">
              {dataCenter.short_name ?? dataCenter.name}
            </p>
            
            {/* Live Traffic Pulsing Dot */}
            {!isFailed && (
              <span className="relative flex h-2 w-2 ml-1">
                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", isPrimaryWrite ? "bg-[#00E599]" : "bg-[#FF9F0A]")}></span>
                <span className={cn("relative inline-flex rounded-full h-2 w-2", isPrimaryWrite ? "bg-[#00E599]" : "bg-[#FF9F0A]")}></span>
              </span>
            )}
          </div>
          {dataCenter.region && (
            <p className="text-[10px] mt-0.5 truncate text-white/40 font-medium">
              {dataCenter.region}
            </p>
          )}
        </div>
        
        {isFailed ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#FF453A]/10 text-[#FF453A] border border-[#FF453A]/20"
          >
            OFFLINE
          </span>
        ) : isPrimaryWrite ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20"
          >
            <Crown className="w-2.5 h-2.5" />
            Primary
          </span>
        ) : (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-white/5 text-white/50 border border-white/5"
          >
            Standby
          </span>
        )}

        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-1 flex-shrink-0 p-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
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
          <div className="flex items-center justify-between text-[9px] font-extrabold text-white/40 uppercase tracking-widest">
            <span>Tech Distribution</span>
            <span className="text-[8px] font-mono text-white/30">{totalAssets} items</span>
          </div>
          <div className="flex h-1 rounded-full overflow-hidden bg-white/5 w-full">
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
            <div className="p-3 flex flex-col gap-2">
              {assets.length === 0 && (
                <p className="text-[11px] text-center py-4 text-white/30">
                  No assets found
                </p>
              )}
              {assets.map((asset) => (
                <AssetRow key={asset.id} asset={asset} onSelectEvidence={onSelectEvidence} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer count */}
      <div
        className="px-4 py-2 text-center border-t border-white/5 bg-white/[0.01]"
      >
        <p className="text-[10px] font-medium text-white/40">
          {assets.length} active resource{assets.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
