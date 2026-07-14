/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Discover step page. The operator selects a Datacenter; the
 * entire datacenter becomes visible — header summary (name,
 * health, capacity, readiness), a large hierarchy tree
 * (Datacenter > Cluster > Namespace > Application), an inventory
 * card grid (Applications, Pods, Namespaces, Oracle, Mongo, MQ,
 * Kafka, Firewall, VIP, DNS, Certificates, Storage), and a bottom
 * section listing business capabilities and owner teams. A Continue
 * button advances to the Analyze phase.
 *
 * Mock data only — no backend.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Users, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { StatusPill, type DcExitPillStatus } from '@/modules/dc-exit/components/StatusPill';
import { DiscoverHierarchyTree } from '@/modules/dc-exit/components/DiscoverHierarchyTree';
import { DiscoverInventoryCard } from '@/modules/dc-exit/components/DiscoverInventoryCard';
import {
  discoverDatacenter,
  discoverHierarchy,
  discoverInventory,
  discoverCapabilities,
  discoverOwnerTeams,
  type HealthState,
} from '@/modules/dc-exit/data/discoverMockData';

const HEALTH_TO_PILL: Record<HealthState, DcExitPillStatus> = {
  healthy: 'complete',
  degraded: 'in-progress',
  down: 'error',
};

const HEALTH_STYLES: Record<HealthState, { color: string; bg: string; border: string; label: string }> = {
  healthy:  { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)',  label: 'Healthy' },
  degraded: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)',   label: 'Degraded' },
  down:     { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',    border: 'rgba(255,0,60,0.22)',    label: 'Down' },
};

const CRITICALITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
  high:     { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)' },
  medium:   { color: '#006CFF', bg: 'rgba(0,108,255,0.08)',   border: 'rgba(0,108,255,0.22)' },
  low:      { color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
};

function HealthDot({ state }: { state: HealthState }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: HEALTH_STYLES[state].color }}
    />
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {value}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function DiscoverPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [selectedDc] = useState(discoverDatacenter);

  const totalApps = useMemo(() => discoverInventory.find((c) => c.key === 'applications')?.total ?? 0, []);

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/analyze`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* === Datacenter summary header === */}
      <section
        className="rounded-[8px] p-5 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex items-center justify-center w-11 h-11 rounded-[8px] flex-shrink-0"
              style={{ background: 'rgba(0,108,255,0.10)', border: '1px solid rgba(0,108,255,0.24)' }}
            >
              <span className="text-[15px] font-extrabold tracking-tight" style={{ color: '#006CFF' }}>
                DC
              </span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3
                  className="text-[18px] font-bold tracking-tight leading-tight truncate"
                  style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
                >
                  {selectedDc.name}
                </h3>
                <span
                  className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-[4px]"
                  style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  {selectedDc.shortName}
                </span>
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {selectedDc.region}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <StatusPill status={HEALTH_TO_PILL[selectedDc.health]} label={selectedDc.healthLabel} pulse={selectedDc.health === 'degraded'} />
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-semibold select-none"
              style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            >
              {totalApps} apps
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3">
            <HealthDot state={selectedDc.health} />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
                Health
              </span>
              <span className="text-[13px] font-semibold" style={{ color: HEALTH_STYLES[selectedDc.health].color }}>
                {selectedDc.healthLabel}
              </span>
            </div>
          </div>
          <MetricBar label="Capacity" value={selectedDc.capacity} color="#006CFF" />
          <MetricBar label="Readiness" value={selectedDc.readiness} color="#00B074" />
        </div>
      </section>

      {/* === Hierarchy tree === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Resource Hierarchy
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {discoverHierarchy.length} datacenter
          </span>
        </div>
        <DiscoverHierarchyTree nodes={discoverHierarchy} />
      </section>

      {/* === Inventory cards === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Inventory
          </h4>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
            {discoverInventory.length} categories
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {discoverInventory.map((category) => (
            <DiscoverInventoryCard key={category.key} category={category} />
          ))}
        </div>
      </section>

      {/* === Bottom section: capabilities + owner teams === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Business capabilities */}
        <div
          className="rounded-[8px] flex flex-col"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <Briefcase className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} strokeWidth={2} />
            <h4 className="text-[12.5px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Business Capabilities
            </h4>
            <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
              {discoverCapabilities.length}
            </span>
          </div>
          <div className="flex flex-col">
            {discoverCapabilities.map((cap, idx) => {
              const crit = CRITICALITY_STYLES[cap.criticality];
              const health = HEALTH_STYLES[cap.health];
              return (
                <div
                  key={cap.id}
                  className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors')}
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                >
                  <HealthDot state={cap.health} />
                  <span className="text-[12px] font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {cap.name}
                  </span>
                  <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {cap.applications} apps
                  </span>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
                    style={{ background: crit.bg, color: crit.color, border: `1px solid ${crit.border}` }}
                  >
                    {cap.criticality}
                  </span>
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
                    style={{ background: health.bg, color: health.color, border: `1px solid ${health.border}` }}
                  >
                    {health.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Owner teams */}
        <div
          className="rounded-[8px] flex flex-col"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <Users className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} strokeWidth={2} />
            <h4 className="text-[12.5px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Owner Teams
            </h4>
            <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
              {discoverOwnerTeams.length}
            </span>
          </div>
          <div className="flex flex-col">
            {discoverOwnerTeams.map((team, idx) => {
              const health = HEALTH_STYLES[team.health];
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                >
                  <HealthDot state={team.health} />
                  <span className="text-[12px] font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {team.name}
                  </span>
                  <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {team.applications} apps / {team.services} svc
                  </span>
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
                    style={{ background: health.bg, color: health.color, border: `1px solid ${health.border}` }}
                  >
                    {health.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === Continue === */}
      <div className="flex items-center justify-end pt-1">
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          iconRight={<ArrowRight className="w-4 h-4" />}
        >
          Continue to Analyze
        </Button>
      </div>
    </div>
  );
}
