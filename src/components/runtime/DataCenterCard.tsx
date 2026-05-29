import React from 'react';
import { Server, Pen as PenLine, Award } from 'lucide-react';
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
}

function AssetRow({ asset }: { asset: RuntimeAsset }) {
  const role = asset.latest_replication_role ?? asset.latest_operational_state ?? 'UNKNOWN';
  const displayRole = role === 'NONE'
    ? (asset.latest_operational_state ?? 'ACTIVE')
    : role;

  return (
    <div
      className="rounded-lg px-3 py-2.5 flex flex-col gap-1.5"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TechStackIcon techStack={asset.tech_stack} size={12} />
          <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {asset.name}
          </span>
        </div>
        {asset.write_authority && (
          <span
            className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: 'rgba(48,209,88,0.15)', color: '#30D158' }}
          >
            Write
          </span>
        )}
      </div>
      {asset.host && (
        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
          {asset.host}
        </p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <AssetStatusBadge role={displayRole} />
        {asset.latest_confidence_level != null && (
          <ConfidenceBadge level={asset.latest_confidence_level} showLabel={false} />
        )}
        <FreshnessIndicator lastUpdated={asset.last_seen_at} compact showRelativeTime />
      </div>
      {asset.is_deterministic === false && (
        <p className="text-[9px] italic" style={{ color: '#FF9F0A' }}>
          Inferred (not verified)
        </p>
      )}
    </div>
  );
}

export function DataCenterCard({ dataCenter, assets, isPrimaryWrite = false, isFailed = false }: DataCenterCardProps) {
  return (
    <div
      className="rounded-2xl flex flex-col overflow-hidden"
      style={{
        background: isFailed ? 'rgba(255,69,58,0.04)' : 'var(--app-surface-raised)',
        border: isFailed
          ? '1.5px solid rgba(255,69,58,0.4)'
          : isPrimaryWrite
          ? '1.5px solid rgba(48,209,88,0.4)'
          : '1px solid var(--app-border)',
        minWidth: 220,
      }}
    >
      {/* DC Header */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2"
        style={{ borderBottom: '1px solid var(--app-border)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {dataCenter.short_name ?? dataCenter.name}
            </p>
          </div>
          {dataCenter.region && (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {dataCenter.region}
            </p>
          )}
        </div>
        {isFailed ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider"
            style={{ background: 'rgba(255,69,58,0.15)', color: '#FF453A', border: '1px solid rgba(255,69,58,0.3)' }}
          >
            OFFLINE
          </span>
        ) : isPrimaryWrite ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider"
            style={{ background: 'rgba(48,209,88,0.15)', color: '#30D158', border: '1px solid rgba(48,209,88,0.3)' }}
          >
            <Award className="w-2.5 h-2.5" />
            Write
          </span>
        ) : null}
      </div>

      {/* Assets */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {assets.length === 0 && (
          <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No assets
          </p>
        )}
        {assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} />
        ))}
      </div>

      {/* Footer count */}
      <div
        className="px-4 py-2 text-center"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {assets.length} asset{assets.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
