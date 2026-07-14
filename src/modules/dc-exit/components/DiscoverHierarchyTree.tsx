/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DiscoverHierarchyTree — large expandable tree showing the
 * Datacenter > Cluster > Namespace > Application hierarchy.
 * Enterprise, minimal style consistent with the dc-exit module.
 */

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Building2,
  Network,
  Layers,
  Boxes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HierarchyNode, HealthState } from '@/modules/dc-exit/data/discoverMockData';

const HEALTH_STYLES: Record<HealthState, { color: string; bg: string; border: string; label: string }> = {
  healthy:  { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)',  label: 'Healthy' },
  degraded: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)',   label: 'Degraded' },
  down:     { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',    border: 'rgba(255,0,60,0.22)',    label: 'Down' },
};

const TYPE_META: Record<HierarchyNode['type'], { Icon: typeof Building2; color: string; label: string }> = {
  datacenter:  { Icon: Building2, color: '#006CFF', label: 'Datacenter' },
  cluster:     { Icon: Network,   color: '#14B8A6', label: 'Cluster' },
  namespace:   { Icon: Layers,    color: '#8B5CF6', label: 'Namespace' },
  application: { Icon: Boxes,     color: '#8A97A8', label: 'Application' },
};

function HealthDot({ state }: { state: HealthState }) {
  const s = HEALTH_STYLES[state];
  return (
    <span
      className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: s.color }}
      aria-label={s.label}
    />
  );
}

function HealthBadge({ state }: { state: HealthState }) {
  const s = HEALTH_STYLES[state];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold uppercase tracking-wider select-none flex-shrink-0"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      <HealthDot state={state} />
      {s.label}
    </span>
  );
}

function TreeNode({ node, level }: { node: HierarchyNode; level: number }) {
  const [isOpen, setIsOpen] = useState(level < 2);
  const hasChildren = !!node.children && node.children.length > 0;
  const meta = TYPE_META[node.type];
  const Icon = meta.Icon;

  return (
    <div className="select-none flex flex-col">
      <div
        className={cn(
          'group flex items-center gap-2 py-2 px-3 rounded-[6px] transition-colors',
          hasChildren && 'cursor-pointer',
        )}
        style={{ paddingLeft: `${level * 22 + 12}px` }}
        onClick={() => hasChildren && setIsOpen((o) => !o)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--app-surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '';
        }}
      >
        {hasChildren ? (
          <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        ) : (
          <span className="flex-shrink-0 w-3.5 h-3.5" />
        )}

        <span
          className="flex items-center justify-center w-6 h-6 rounded-[6px] flex-shrink-0"
          style={{ background: `${meta.color}14`, border: `1px solid ${meta.color}26` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} strokeWidth={1.8} />
        </span>

        <span
          className="text-[12.5px] font-semibold truncate flex-1 min-w-0"
          style={{ color: 'var(--text-primary)' }}
        >
          {node.name}
        </span>

        <span
          className="text-[9.5px] font-mono font-medium flex-shrink-0 px-1.5 py-0.5 rounded-[4px]"
          style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}
        >
          {meta.label}
        </span>

        <span
          className="text-[10px] font-mono tabular-nums flex-shrink-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {node.count}
        </span>

        <HealthBadge state={node.status} />
      </div>

      {hasChildren && isOpen && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface DiscoverHierarchyTreeProps {
  nodes: HierarchyNode[];
  className?: string;
}

export function DiscoverHierarchyTree({ nodes, className }: DiscoverHierarchyTreeProps) {
  return (
    <div
      className={cn('rounded-[8px] flex flex-col', className)}
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: 'var(--text-muted)' }}>
            Deployment Hierarchy
          </span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
          Datacenter / Cluster / Namespace / Application
        </span>
      </div>

      <div className="py-1">
        {nodes.map((node) => (
          <TreeNode key={node.id} node={node} level={0} />
        ))}
      </div>
    </div>
  );
}
