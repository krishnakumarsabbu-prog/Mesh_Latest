/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DiscoverInventoryCard — a compact inventory summary card with
 * icon, total count, and a segmented healthy/degraded/down bar.
 * Enterprise, minimal style consistent with the dc-exit module.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { InventoryCategory } from '@/modules/dc-exit/data/discoverMockData';

interface DiscoverInventoryCardProps {
  category: InventoryCategory;
  className?: string;
}

export function DiscoverInventoryCard({ category, className }: DiscoverInventoryCardProps) {
  const Icon = category.icon;
  const total = category.total || 1;
  const hPct = (category.healthy / total) * 100;
  const dPct = (category.degraded / total) * 100;
  const downPct = (category.down / total) * 100;

  return (
    <div
      className={cn(
        'group rounded-[8px] p-3.5 flex flex-col gap-3 transition-all duration-150',
        className,
      )}
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--app-border-strong)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--app-border)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-[6px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ background: category.iconBg, border: `1px solid ${category.iconColor}26` }}
        >
          <Icon className="w-4 h-4" style={{ color: category.iconColor }} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-[0.06em] truncate flex-1 min-w-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {category.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[26px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {category.total}
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
          assets
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
          <div style={{ width: `${hPct}%`, background: '#00B074' }} />
          <div style={{ width: `${dPct}%`, background: '#FFB100' }} />
          <div style={{ width: `${downPct}%`, background: '#FF003C' }} />
        </div>
        <div className="flex items-center gap-3 text-[9.5px] font-mono">
          <span className="flex items-center gap-1" style={{ color: '#00B074' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00B074' }} />
            {category.healthy}
          </span>
          <span className="flex items-center gap-1" style={{ color: '#FFB100' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FFB100' }} />
            {category.degraded}
          </span>
          <span className="flex items-center gap-1" style={{ color: '#FF003C' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FF003C' }} />
            {category.down}
          </span>
        </div>
      </div>
    </div>
  );
}
