import React from 'react';
import { CircleHelp as HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OperationalState, ReplicationRole } from '@/types';

type AssetRole = OperationalState | ReplicationRole | string;

interface AssetStatusBadgeProps {
  role: AssetRole;
  size?: 'sm' | 'md';
  className?: string;
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; border?: string }> = {
  PRIMARY:          { label: 'Primary',        bg: 'rgba(48,209,88,0.15)',  text: '#30D158' },
  ACTIVE:           { label: 'Active',          bg: 'rgba(48,209,88,0.15)',  text: '#30D158' },
  SECONDARY:        { label: 'Secondary',       bg: 'rgba(10,132,255,0.12)', text: '#0A84FF', border: 'rgba(10,132,255,0.4)' },
  STANDBY:          { label: 'Standby',         bg: 'rgba(255,159,10,0.12)', text: '#FF9F0A', border: 'rgba(255,159,10,0.4)' },
  PHYSICAL_STANDBY: { label: 'Phys. Standby',  bg: 'rgba(255,159,10,0.12)', text: '#FF9F0A', border: 'rgba(255,159,10,0.4)' },
  PASSIVE:          { label: 'Passive',         bg: 'rgba(255,159,10,0.12)', text: '#FF9F0A', border: 'rgba(255,159,10,0.4)' },
  MONGOS:           { label: 'Mongos',          bg: 'rgba(94,92,230,0.12)',  text: '#636366' },
  CONFIG_SVR:       { label: 'Config SVR',      bg: 'rgba(94,92,230,0.12)',  text: '#636366' },
  SHARD_PRIMARY:    { label: 'Shard Primary',   bg: 'rgba(48,209,88,0.12)',  text: '#30D158' },
  SHARD_SECONDARY:  { label: 'Shard Sec.',      bg: 'rgba(10,132,255,0.12)', text: '#0A84FF' },
  NONE:             { label: 'Active',          bg: 'rgba(48,209,88,0.15)',  text: '#30D158' },
  UNKNOWN:          { label: 'Unknown',         bg: 'rgba(142,142,147,0.15)', text: '#8E8E93' },
};

export function AssetStatusBadge({ role, size = 'sm', className }: AssetStatusBadgeProps) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG['UNKNOWN'];
  const isUnknown = role === 'UNKNOWN';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        className,
      )}
      style={{
        background: cfg.bg,
        color: cfg.text,
        border: cfg.border ? `1px solid ${cfg.border}` : 'none',
      }}
    >
      {isUnknown && <HelpCircle className="w-2.5 h-2.5" />}
      {cfg.label}
    </span>
  );
}
