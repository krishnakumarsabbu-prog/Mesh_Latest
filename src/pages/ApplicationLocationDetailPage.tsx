import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, CircleCheck as CheckCircle, GitBranch, Server, Database, MessageSquare, Layers, History, Clock, GitCompare, CircleAlert as AlertCircle, CircleHelp as HelpCircle, Target, ClipboardList, ShieldCheck, CircleHelp as UnknownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { ConfidenceBadge } from '@/components/runtime/ConfidenceBadge';
import { FreshnessIndicator } from '@/components/runtime/FreshnessIndicator';
import { AssetStatusBadge } from '@/components/runtime/AssetStatusBadge';
import { TechStackIcon } from '@/components/runtime/TechStackIcon';
import { DataSourcePanel } from '@/components/runtime/DataSourcePanel';
import { ConflictAlert } from '@/components/runtime/ConflictAlert';
import { LocationMap } from '@/components/runtime/LocationMap';
import { IntentVsActualTab } from '@/components/runtime/IntentVsActualTab';
import { AuditLogTab } from '@/components/runtime/AuditLogTab';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { formatRelativeTime, getEnvComparison, type EnvComparisonRow } from '@/lib/runtimeLocationMock';
import type {
  ApplicationComponent, AssetEnvironment, RuntimeSnapshot, TechStack, ApplicationLocationDetail,
} from '@/types';

type TabId = 'map' | 'components' | 'openshift' | 'intent' | 'quality' | 'snapshots' | 'compare' | 'audit';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'map',        label: 'DC Distribution', icon: MapPin },
  { id: 'components', label: 'Components',      icon: Layers },
  { id: 'openshift',  label: 'OpenShift Console', icon: Layers },
  { id: 'intent',     label: 'Intent vs Actual', icon: Target },
  { id: 'quality',    label: 'Data Quality',    icon: Database },
  { id: 'snapshots',  label: 'Snapshots',       icon: History },
  { id: 'compare',    label: 'Compare Envs',    icon: GitCompare },
  { id: 'audit',      label: 'Audit Log',       icon: ClipboardList },
];

// ─── Operator Quick Summary Band ─────────────────────────────────────────────

function OperatorQuickSummary({ detail }: { detail: ApplicationLocationDetail }) {
  const allAssets = detail.components.flatMap((c) => c.assets);
  const activeDCs = [...new Set(allAssets.map((a) => a.data_center?.short_name).filter(Boolean))];
  const primaryAsset = allAssets.find((a) => a.write_authority && a.latest_operational_state === 'ACTIVE');
  const primaryDC = primaryAsset?.data_center?.short_name;
  const conf = detail.overall_confidence;

  const confLabel = conf === 4 ? 'High' : conf === 3 ? 'Moderate' : conf === 2 ? 'Low' : 'Unknown';
  const confColor = conf === 4 ? '#30D158' : conf === 3 ? '#FF9F0A' : conf === 2 ? '#FF453A' : '#8E8E93';
  const staleCount = detail.data_sources.filter((s) => s.status === 'STALE' || s.status === 'VERY_STALE').length;

  const items = [
    {
      question: 'WHERE is it running?',
      answer: activeDCs.length > 0 ? activeDCs.join(', ') : 'Unknown',
      color: activeDCs.length > 0 ? '#30D158' : '#8E8E93',
      icon: MapPin,
    },
    {
      question: 'WHICH site owns state?',
      answer: primaryDC ? `${primaryDC} (Primary Write)` : 'Cannot determine',
      color: primaryDC ? '#0A84FF' : '#FF9F0A',
      icon: ShieldCheck,
    },
    {
      question: 'HOW confident are we?',
      answer: `${confLabel} (${conf}/4)${staleCount > 0 ? ` — ${staleCount} stale source(s)` : ''}`,
      color: confColor,
      icon: staleCount > 0 ? AlertCircle : CheckCircle,
    },
  ];

  return (
    <div
      className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.question} className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${item.color}18` }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {item.question}
              </p>
              <p className="text-[13px] font-semibold mt-0.5" style={{ color: item.color }}>
                {item.answer}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component icon by type ───────────────────────────────────────────────────

function ComponentTypeIcon({ type }: { type: ApplicationComponent['component_type'] }) {
  const icons: Record<string, React.ElementType> = {
    DATABASE:  Database,
    MESSAGING: MessageSquare,
    COMPUTE:   Server,
    STORAGE:   Server,
  };
  const Icon = icons[type] ?? Server;
  return <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />;
}

// ─── Components table tab ─────────────────────────────────────────────────────

function ComponentsTable({ components }: { components: ApplicationComponent[] }) {
  return (
    <div className="flex flex-col gap-4">
      {components.map((comp) => (
        <div key={comp.id}>
          <div className="flex items-center gap-2 mb-2">
            <ComponentTypeIcon type={comp.component_type} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {comp.component_name}
            </p>
            <TechStackIcon techStack={comp.tech_stack} size={12} showLabel />
          </div>

          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--app-border)' }}
          >
            <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--app-surface)' }}>
                  {['Asset', 'Host', 'Role', 'Write', 'Data Center', 'Last Seen', 'Conf', 'Source'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comp.assets.map((asset) => {
                  const role = asset.latest_replication_role ?? asset.latest_operational_state ?? 'UNKNOWN';
                  const displayRole = role === 'NONE' ? (asset.latest_operational_state ?? 'ACTIVE') : role;
                  return (
                    <tr
                      key={asset.id}
                      style={{ borderBottom: '1px solid var(--app-border)' }}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <TechStackIcon techStack={asset.tech_stack} size={12} />
                          <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                            {asset.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          {asset.host ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <AssetStatusBadge role={displayRole} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {asset.write_authority === true && (
                          <CheckCircle className="w-3.5 h-3.5 mx-auto" style={{ color: '#30D158' }} />
                        )}
                        {asset.write_authority === false && (
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                        {asset.write_authority === undefined && (
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>?</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {asset.data_center?.short_name ?? asset.data_center?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <FreshnessIndicator lastUpdated={asset.last_seen_at} compact />
                      </td>
                      <td className="px-3 py-2.5">
                        {asset.latest_confidence_level != null && (
                          <ConfidenceBadge level={asset.latest_confidence_level} />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {asset.is_deterministic === false && (
                            <span title="Inferred from hostname pattern">
                              <GitBranch className="w-3 h-3" style={{ color: '#FF9F0A' }} />
                            </span>
                          )}
                          {asset.is_deterministic === true && (
                            <span title="Verified by source control plane">
                              <CheckCircle className="w-3 h-3" style={{ color: '#30D158' }} />
                            </span>
                          )}
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {asset.data_source ?? '—'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Snapshot timeline chart ─────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  PRIMARY:          '#30D158',
  ACTIVE:           '#30D158',
  SECONDARY:        '#0A84FF',
  PHYSICAL_STANDBY: '#0A84FF',
  PASSIVE:          '#0A84FF',
  STANDBY:          '#FF9F0A',
  INACTIVE:         '#8E8E93',
  UNKNOWN:          '#8E8E93',
};

function SnapshotTimeline({ snapshots }: { snapshots: RuntimeSnapshot[] }) {
  if (snapshots.length < 2) return null;

  // Group snapshots by asset and build a bar per snapshot
  const assetIds = [...new Set(snapshots.map((s) => s.asset_id))].slice(0, 8);
  const data = snapshots
    .filter((s) => assetIds.includes(s.asset_id))
    .map((s) => ({
      name: `${s.asset_id.slice(-6)}`,
      role: s.replication_role && s.replication_role !== 'NONE' ? s.replication_role : s.operational_state,
      conf: s.confidence_level,
      time: new Date(s.snapshot_time).getTime(),
    }))
    .sort((a, b) => a.time - b.time);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        State Timeline (by confidence)
      </p>
      <div style={{ height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -30, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
            <YAxis domain={[0, 4]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--app-surface-raised)',
                border: '1px solid var(--app-border)',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v: number, _n: string, entry: { payload?: { role?: string } }) => [
                `${entry.payload?.role ?? ''} (conf ${v}/4)`, 'State',
              ]}
            />
            <Bar dataKey="conf" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={ROLE_COLOR[entry.role] ?? '#8E8E93'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Snapshots tab ───────────────────────────────────────────────────────────

const SOURCE_DISPLAY: Record<string, string> = {
  ibm_mq: 'IBM MQ',
  mongodb: 'MongoDB',
  oracle_oem: 'Oracle OEM',
  cmdb: 'CMDB',
};

function SnapshotsTab({ snapshots }: { snapshots: RuntimeSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <History className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          No snapshot history available
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SnapshotTimeline snapshots={snapshots} />
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} recorded
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--app-surface)' }}>
              {['Asset', 'Time', 'State', 'Role', 'Source', 'Confidence', 'Verified'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snap) => (
              <tr key={snap.id} style={{ borderBottom: '1px solid var(--app-border)' }}>
                <td className="px-3 py-2.5">
                  <span className="text-[12px] font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {snap.asset_id}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {formatRelativeTime(snap.snapshot_time)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <AssetStatusBadge role={snap.operational_state} />
                </td>
                <td className="px-3 py-2.5">
                  {snap.replication_role && snap.replication_role !== 'NONE' ? (
                    <AssetStatusBadge role={snap.replication_role} />
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {SOURCE_DISPLAY[snap.data_source] ?? snap.data_source}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ConfidenceBadge level={snap.confidence_level} />
                </td>
                <td className="px-3 py-2.5">
                  {snap.is_deterministic ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: '#30D158' }} />
                      <span className="text-[10px]" style={{ color: '#30D158' }}>Verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5" style={{ color: '#FF9F0A' }} />
                      <span className="text-[10px]" style={{ color: '#FF9F0A' }}>Inferred</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Compare Environments tab ─────────────────────────────────────────────────

const STATUS_CONFIG = {
  consistent:   { label: 'Consistent',  color: '#30D158', bg: 'rgba(48,209,88,0.1)',   border: 'rgba(48,209,88,0.25)',  Icon: CheckCircle },
  inconsistent: { label: 'Inconsistent', color: '#FF453A', bg: 'rgba(255,69,58,0.1)',  border: 'rgba(255,69,58,0.25)',  Icon: AlertCircle },
  prod_only:    { label: 'PROD only',   color: '#0A84FF', bg: 'rgba(10,132,255,0.1)',  border: 'rgba(10,132,255,0.25)', Icon: Server },
  uat_only:     { label: 'UAT only',    color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)',  border: 'rgba(255,159,10,0.25)', Icon: HelpCircle },
} as const;

function EnvCell({ role, dc, confidence }: { role?: string; dc?: string; confidence?: number }) {
  if (!role && !dc) {
    return (
      <td className="px-3 py-3 text-center">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
      </td>
    );
  }
  return (
    <td className="px-3 py-3">
      <div className="flex flex-col gap-0.5">
        {role && <AssetStatusBadge role={role} />}
        {dc && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dc}</span>}
        {confidence != null && <ConfidenceBadge level={confidence as 1|2|3|4} showLabel={false} />}
      </div>
    </td>
  );
}

function CompareEnvsTab({ appId }: { appId: string }) {
  const rows = getEnvComparison(appId);

  const counts = {
    consistent:   rows.filter((r) => r.status === 'consistent').length,
    inconsistent: rows.filter((r) => r.status === 'inconsistent').length,
    prod_only:    rows.filter((r) => r.status === 'prod_only').length,
    uat_only:     rows.filter((r) => r.status === 'uat_only').length,
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <GitCompare className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          No environment comparison data available
        </p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Import PRODUCTION and UAT topology data to compare environments
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(counts) as [keyof typeof STATUS_CONFIG, number][]).map(([key, count]) => {
          const cfg = STATUS_CONFIG[key];
          return (
            <div
              key={key}
              className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <cfg.Icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
              <div>
                <p className="text-[18px] font-bold leading-none" style={{ color: cfg.color }}>{count}</p>
                <p className="text-[10px] mt-0.5" style={{ color: cfg.color }}>{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {counts.inconsistent > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-2.5"
          style={{ background: 'rgba(255,69,58,0.07)', border: '1px solid rgba(255,69,58,0.25)' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FF453A' }} />
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: '#FF453A' }}>
              {counts.inconsistent} asset{counts.inconsistent !== 1 ? 's are' : ' is'} inconsistent
            </span>{' '}
            between PRODUCTION and UAT — the same asset has different roles in each environment. Manual review recommended.
          </p>
        </div>
      )}

      {/* Comparison table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--app-surface)' }}>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                Asset
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                Component
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0A84FF', borderBottom: '1px solid var(--app-border)', background: 'rgba(10,132,255,0.04)' }}>
                PRODUCTION
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: '#FF9F0A', borderBottom: '1px solid var(--app-border)', background: 'rgba(255,159,10,0.04)' }}>
                UAT
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cfg = STATUS_CONFIG[row.status];
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--app-border)',
                    background: row.status === 'inconsistent' ? 'rgba(255,69,58,0.03)' : 'transparent',
                  }}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <TechStackIcon techStack={row.tech_stack as TechStack} size={12} />
                      <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {row.asset_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {row.component}
                    </span>
                  </td>
                  <EnvCell role={row.prod_role} dc={row.prod_dc} confidence={row.prod_confidence} />
                  <EnvCell role={row.uat_role}  dc={row.uat_dc}  confidence={row.uat_confidence} />
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      <cfg.Icon className="w-2.5 h-2.5" />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Comparison is between PRODUCTION and UAT environments. DR environment data is not included.
      </p>
    </div>
  );
}

// ─── OpenShift Console Tab ────────────────────────────────────────────────────

function OpenShiftTab({ detail }: { detail: ApplicationLocationDetail }) {
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);
  const [activeLogPod, setActiveLogPod] = useState<{ name: string; logs: string[] } | null>(null);

  // Generate logs based on tech stack
  function generateMockLogs(podName: string, techStack: TechStack): string[] {
    const timestamp = new Date().toISOString();
    if (techStack === 'mongodb') {
      return [
        `[${timestamp}] I CONTROL  [main] Automatically responding to connection...`,
        `[${timestamp}] I JOURNAL  [journal] Journal directory '/var/lib/mongodb/journal' exists`,
        `[${timestamp}] I NETWORK  [listener] Listening on 0.0.0.0:27017`,
        `[${timestamp}] I REPL     [reconciler] Replication coordinator started`,
        `[${timestamp}] I REPL     [reconciler] Transitioned replica state to PRIMARY`,
        `[${timestamp}] I ACCESS   [conn1] Successfully authenticated client 'healthmesh-agent'`,
        `[${timestamp}] I COMMAND  [conn1] run command: find { collection: "patients", query: {} }`,
      ];
    } else if (techStack === 'oracle') {
      return [
        `[${timestamp}] Starting Oracle Database instance PCA_ORCL...`,
        `[${timestamp}] System Parameter File (SPFILE) loaded successfully`,
        `[${timestamp}] Database Redo Log Thread 1 enabled, state opened`,
        `[${timestamp}] PMON process started (Process ID: 3012)`,
        `[${timestamp}] LGWR background writer running (Process ID: 3014)`,
        `[${timestamp}] DBWR database block writer running (Process ID: 3016)`,
        `[${timestamp}] Database replication state: ACTIVE DATA GUARD - PHYSICAL STANDBY`,
      ];
    } else if (techStack === 'ibm_mq') {
      return [
        `[${timestamp}] AMQ5026: WebSphere MQ queue manager 'QM_PCA' is starting.`,
        `[${timestamp}] AMQ5041: Active logs directory '/var/mqm/qmgrs/QM_PCA/log' verified.`,
        `[${timestamp}] AMQ5018: 34 MQ channels successfully bound to port 1414.`,
        `[${timestamp}] AMQ5087: Message routing broker initiated under transactional persistence.`,
        `[${timestamp}] AMQ5022: Channel listener 'CHAN_INBOUND_SHV' transitioned to RUNNING.`,
      ];
    }
    return [
      `[${timestamp}] Container starting up under namespace '${detail.application_id.toLowerCase()}-prod'`,
      `[${timestamp}] Deploying environment configuration profiles`,
      `[${timestamp}] Checking persistent storage mounts... OK`,
      `[${timestamp}] TCP Connection listener bound to port 8080`,
      `[${timestamp}] Telemetry sidecar heartbeat reported successfully`,
    ];
  }

  return (
    <div className="flex flex-col gap-5">
      {/* OpenShift Cluster Header Status */}
      <div
        className="rounded-2xl p-5 flex flex-col gap-4 animate-scale-in"
        style={{
          background: 'var(--sidebar-bg)',
          color: '#FFFFFF',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid rgba(255,255,255,0.06)'
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <Layers className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-bold text-white">OpenShift Container Platform</p>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider" style={{ background: '#0064FA', color: '#FFFFFF' }}>
                  ACTIVE CLUSTER
                </span>
              </div>
              <p className="text-[11px] text-white/60 mt-0.5">
                Cluster: <span className="font-mono text-white">ocp-prod-us-east-1</span> · Namespace: <span className="font-mono text-white">{detail.application_id.toLowerCase()}-prod</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-white/50 uppercase tracking-wider">Pods Running</p>
              <p className="text-[16px] font-mono font-bold text-[#30D158]">
                {detail.components.reduce((a, c) => a + c.assets.length, 0)} / {detail.components.reduce((a, c) => a + c.assets.length, 0)} Ready
              </p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-right">
              <p className="text-[10px] text-white/50 uppercase tracking-wider">Cluster CPU</p>
              <p className="text-[16px] font-mono font-bold text-[#0064FA]">34.2%</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-right">
              <p className="text-[10px] text-white/50 uppercase tracking-wider">Cluster Memory</p>
              <p className="text-[16px] font-mono font-bold text-[#BF5AF2]">4.8 GB / 16 GB</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
        OpenShift Container Tiers (Deployments)
      </p>

      {/* Grid of Deployment Containers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {detail.components.map((comp) => {
          const isExpanded = expandedComponent === comp.id;
          const activeReplicas = comp.assets.filter((a) => a.latest_operational_state === 'ACTIVE').length;
          const totalReplicas = comp.assets.length;
          const stackName = comp.tech_stack.replace('_', ' ').toUpperCase();

          return (
            <div
              key={comp.id}
              className="rounded-2xl transition-all duration-200 flex flex-col gap-3 p-5 cursor-pointer"
              style={{
                background: 'var(--app-surface)',
                border: isExpanded ? '1.5px solid var(--accent)' : '1px solid var(--app-border)',
                boxShadow: isExpanded ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              }}
              onClick={() => setExpandedComponent(isExpanded ? null : comp.id)}
              onMouseEnter={(e) => {
                if (!isExpanded) {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isExpanded) {
                  e.currentTarget.style.borderColor = 'var(--app-border)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }
              }}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TechStackIcon techStack={comp.tech_stack} size={14} />
                    <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {comp.component_name}
                    </p>
                  </div>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Image: openshift/{comp.tech_stack}:latest
                  </p>
                </div>
                <span
                  className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: activeReplicas === totalReplicas ? 'rgba(48,209,88,0.08)' : 'rgba(255,159,10,0.08)',
                    color: activeReplicas === totalReplicas ? '#30D158' : '#FF9F0A',
                    border: activeReplicas === totalReplicas ? '1px solid rgba(48,209,88,0.2)' : '1px solid rgba(255,159,10,0.2)'
                  }}
                >
                  {activeReplicas}/{totalReplicas} Pods
                </span>
              </div>

              {/* Resource Metrics */}
              <div className="flex items-center justify-between text-[11px] pt-1" style={{ color: 'var(--text-secondary)' }}>
                <span>Type: <span className="font-semibold text-app-primary">{comp.component_type}</span></span>
                <span>Stack: <span className="font-semibold text-app-primary">{stackName}</span></span>
              </div>

              {/* Action Prompt */}
              <div
                className="mt-2 pt-2 text-center text-[10px] font-semibold flex items-center justify-center gap-1"
                style={{ borderTop: '1px solid var(--app-border)', color: 'var(--accent)' }}
              >
                {isExpanded ? 'Click to collapse nodes' : 'Click to show deployment nodes'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Container Detail Panel (Drilldown) */}
      <div className="relative">
        {expandedComponent && (() => {
          const comp = detail.components.find((c) => c.id === expandedComponent);
          if (!comp) return null;

          return (
            <div
              className="rounded-2xl p-5 flex flex-col gap-4 animate-slide-in-up"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--app-border)' }}>
                <div>
                  <h4 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    Container Node Replica Topology: {comp.component_name}
                  </h4>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Showing active deployment instances mapped across servers and data centers.
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedComponent(null); }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                  style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  Close Detail
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {comp.assets.map((asset, i) => {
                  const role = asset.latest_replication_role ?? asset.latest_operational_state ?? 'UNKNOWN';
                  const displayRole = role === 'NONE' ? (asset.latest_operational_state ?? 'ACTIVE') : role;
                  const isPrimary = asset.write_authority === true;

                  // Generate mock resource usage
                  const mockCpu = Math.floor(10 + Math.random() * 25);
                  const mockMem = (0.8 + Math.random() * 0.9).toFixed(1);

                  return (
                    <div
                      key={asset.id}
                      className="rounded-xl p-4 flex flex-col gap-3 transition-shadow"
                      style={{
                        background: 'var(--app-bg-subtle)',
                        border: isPrimary ? '1.5px solid rgba(48,209,88,0.35)' : '1px solid var(--app-border)'
                      }}
                    >
                      {/* Node Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full animate-pulse-soft"
                            style={{ background: asset.latest_operational_state === 'ACTIVE' ? '#30D158' : '#FF9F0A' }}
                          />
                          <div>
                            <p className="text-[12px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                              pod-{comp.tech_stack}-{i + 1}
                            </p>
                            <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                              Host: {asset.host ?? 'ocp-worker-node'}
                            </p>
                          </div>
                        </div>
                        <AssetStatusBadge role={displayRole} />
                      </div>

                      {/* Info lines */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <div>Data Center: <span className="font-semibold text-app-primary">{asset.data_center?.short_name ?? 'SHV'}</span></div>
                        <div>Role: <span className="font-semibold text-app-primary">{displayRole}</span></div>
                        <div>Pod CPU: <span className="font-mono font-semibold text-app-primary">{mockCpu}%</span></div>
                        <div>Pod Memory: <span className="font-mono font-semibold text-app-primary">{mockMem} GB</span></div>
                      </div>

                      {/* Action Log Button */}
                      <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-dashed" style={{ borderColor: 'var(--app-border)' }}>
                        <div className="flex items-center gap-1">
                          {asset.is_deterministic ? (
                            <span className="text-[9px] font-bold text-[#30D158] bg-[rgba(48,209,88,0.08)] px-1.5 py-0.5 rounded">VERIFIED SOURCE</span>
                          ) : (
                            <span className="text-[9px] font-bold text-[#FF9F0A] bg-[rgba(255,159,10,0.08)] px-1.5 py-0.5 rounded">INFERRED SOURCE</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveLogPod({
                              name: `pod-${comp.tech_stack}-${i + 1}`,
                              logs: generateMockLogs(`pod-${comp.tech_stack}-${i + 1}`, comp.tech_stack)
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white transition-opacity hover:opacity-90"
                          style={{ background: 'var(--accent)' }}
                        >
                          View Live Logs
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Mock Terminal Log Modal */}
      {activeLogPod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setActiveLogPod(null)} />
          <div
            className="relative rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl animate-scale-in"
            style={{ background: '#0F141C', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Terminal Header */}
            <div className="px-4 py-3 flex items-center justify-between bg-[#161D28] border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <span className="text-[12px] font-mono font-bold text-white/80 ml-2">
                  oc logs {activeLogPod.name} --tail=100 -f
                </span>
              </div>
              <button
                onClick={() => setActiveLogPod(null)}
                className="text-white/60 hover:text-white text-[12px] font-semibold px-2 py-0.5 rounded hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {/* Terminal Body */}
            <div className="p-4 h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#00E599] bg-[#0F141C]">
              {activeLogPod.logs.map((log, index) => (
                <p key={index} className="whitespace-pre-wrap">
                  {log}
                </p>
              ))}
              <p className="text-white/40 mt-2 animate-pulse-soft">_ [Streaming active log tail...]</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ENV_OPTIONS: AssetEnvironment[] = ['PRODUCTION', 'UAT', 'DR'];

export function ApplicationLocationDetailPage() {
  const { appId } = useParams<{ appId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedDetail, isLoadingDetail, loadDetail, clearDetail, snapshots, loadSnapshots } = useRuntimeLocationStore();
  const [activeTab, setActiveTab] = useState<TabId>('map');

  const envParam = (searchParams.get('env') ?? 'PRODUCTION') as AssetEnvironment;

  useEffect(() => {
    if (appId) {
      loadDetail(appId, envParam);
      loadSnapshots(appId, envParam);
    }
    return () => clearDetail();
  }, [appId, envParam]);

  function handleEnvChange(env: AssetEnvironment) {
    setSearchParams({ env });
  }

  if (isLoadingDetail) {
    return (
      <div className="px-6 py-6 flex flex-col gap-6 max-w-[1400px] mx-auto">
        <div className="h-8 w-64 rounded-xl animate-pulse" style={{ background: 'var(--app-surface)' }} />
        <div className="h-48 rounded-2xl animate-pulse" style={{ background: 'var(--app-surface)' }} />
      </div>
    );
  }

  if (!selectedDetail) {
    return (
      <div className="px-6 py-16 flex flex-col items-center gap-4">
        <MapPin className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          Application not found
        </p>
        <button
          onClick={() => navigate('/runtime-location')}
          className="text-[13px] font-medium"
          style={{ color: 'var(--primary-500)' }}
        >
          Back to Runtime Location
        </button>
      </div>
    );
  }

  const detail = selectedDetail;
  const staleCount = detail.data_sources.filter(
    (s) => s.status === 'STALE' || s.status === 'VERY_STALE',
  ).length;

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto">
      {/* Back + title */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/runtime-location')}
          className="flex items-center gap-1.5 text-[12px] font-medium mt-1 transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {detail.application_name}
            </h1>
            <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
              {detail.application_id}
            </span>
            <ConfidenceBadge level={detail.overall_confidence} size="md" />
            {staleCount > 0 && (
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1"
                style={{ background: 'rgba(255,159,10,0.1)', color: '#FF9F0A' }}
              >
                {staleCount} stale source{staleCount > 1 ? 's' : ''}
              </span>
            )}
            {detail.conflicts.length > 0 && (
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1"
                style={{ background: 'rgba(255,69,58,0.1)', color: '#FF453A' }}
              >
                {detail.conflicts.length} conflict{detail.conflicts.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {detail.components.length} component{detail.components.length !== 1 ? 's' : ''} ·{' '}
              {detail.components.reduce((a, c) => a + c.assets.length, 0)} assets
            </p>
            {detail.data_sources.length > 0 && (() => {
              const lastImport = detail.data_sources
                .map((s) => s.last_import)
                .filter(Boolean)
                .sort()
                .pop();
              if (!lastImport) return null;
              return (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Last Updated: {formatRelativeTime(lastImport)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Environment switcher */}
      <div className="flex items-center gap-2">
        {ENV_OPTIONS.map((env) => (
          <button
            key={env}
            onClick={() => handleEnvChange(env)}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-[12px] font-semibold transition-all',
            )}
            style={env === envParam ? {
              background: 'var(--primary-500)',
              color: '#fff',
            } : {
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-secondary)',
            }}
          >
            {env}
          </button>
        ))}
      </div>

      {/* Conflicts (if any) */}
      {detail.conflicts.length > 0 && (
        <div className="flex flex-col gap-2">
          {detail.conflicts.map((c, i) => (
            <ConflictAlert key={i} conflict={c} onResolve={() => loadDetail(appId!, envParam)} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all',
            )}
            style={activeTab === id ? {
              background: 'var(--app-surface-raised)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-sm)',
            } : {
              color: 'var(--text-muted)',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Operator Quick Summary */}
      <OperatorQuickSummary detail={detail} />

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {activeTab === 'map' && <LocationMap detail={detail} />}
        {activeTab === 'components' && <ComponentsTable components={detail.components} />}
        {activeTab === 'openshift' && <OpenShiftTab detail={detail} />}
        {activeTab === 'intent' && <IntentVsActualTab detail={detail} />}
        {activeTab === 'quality' && <DataSourcePanel dataSources={detail.data_sources} />}
        {activeTab === 'snapshots' && <SnapshotsTab snapshots={snapshots} />}
        {activeTab === 'compare' && <CompareEnvsTab appId={appId!} />}
        {activeTab === 'audit' && <AuditLogTab />}
      </motion.div>
    </div>
  );
}
