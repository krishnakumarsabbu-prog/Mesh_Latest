/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * BusinessImpactTab — the "Business Impact" tab of the Analyze step.
 * Renders a grid of business-capability cards (Payments, Cards,
 * Treasury, Mortgage, Wire) each showing health, reason, customer
 * impact and affected-customer count. Mock data only.
 */

import React from 'react';
import { Users, TrendingUp, TrendingDown, Minus, TriangleAlert as AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type BusinessImpactCard,
} from '@/modules/dc-exit/data/analyzeMockData';

const HEALTH_META = {
  healthy:  { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)',  label: 'Healthy' },
  degraded: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)',   label: 'Degraded' },
  down:     { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',    border: 'rgba(255,0,60,0.22)',    label: 'Down' },
} as const;

const SEVERITY_META = {
  critical: { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
  high:     { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)' },
  medium:   { color: '#006CFF', bg: 'rgba(0,108,255,0.08)',   border: 'rgba(0,108,255,0.22)' },
  low:      { color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
} as const;

function TrendIcon({ trend }: { trend: BusinessImpactCard['trend'] }) {
  if (trend === 'up') return <TrendingUp className="w-3 h-3" strokeWidth={2} />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3" strokeWidth={2} />;
  return <Minus className="w-3 h-3" strokeWidth={2} />;
}

function BusinessCard({ card }: { card: BusinessImpactCard }) {
  const health = HEALTH_META[card.health];
  const sev = SEVERITY_META[card.severity];
  const Icon = card.health === 'down' ? AlertTriangle : Users;

  return (
    <div
      className="group rounded-[8px] flex flex-col transition-all duration-150"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--app-border-strong)';
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--app-border)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
        <span
          className="flex items-center justify-center w-8 h-8 rounded-[6px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ background: health.bg, border: `1px solid ${health.border}` }}
        >
          <Icon className="w-4 h-4" style={{ color: health.color }} strokeWidth={1.8} />
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {card.name}
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {card.affectedCustomers} customers
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold select-none flex-shrink-0"
          style={{ background: health.bg, color: health.color, border: `1px solid ${health.border}` }}
        >
          <span className="relative flex items-center justify-center w-1.5 h-1.5">
            {card.health === 'degraded' && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: health.color, animationDuration: '2s' }}
              />
            )}
            <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: health.color }} />
          </span>
          {health.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-4 py-3.5 flex-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
            Reason
          </span>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {card.reason}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
            Customer Impact
          </span>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {card.customerImpact}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-t"
        style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-subtle)' }}
      >
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px]"
          style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}
        >
          {card.severity}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono"
          style={{ color: card.trend === 'down' ? '#FF003C' : card.trend === 'up' ? '#00B074' : 'var(--text-muted)' }}
        >
          <TrendIcon trend={card.trend} />
          {card.trend}
        </span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
          {card.affectedCustomers} affected
        </span>
      </div>
    </div>
  );
}

export function BusinessImpactTab({ cards }: { cards: BusinessImpactCard[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Business Impact
        </h4>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
          {cards.length} capabilities
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => (
          <BusinessCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
