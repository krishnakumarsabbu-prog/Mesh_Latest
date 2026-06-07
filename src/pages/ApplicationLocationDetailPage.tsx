import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MapPin, CircleCheck as CheckCircle, GitBranch, Server, Database, MessageSquare, Layers, History, Clock, GitCompare, CircleAlert as AlertCircle, CircleHelp as HelpCircle, Target, ClipboardList, ShieldCheck, CircleHelp as UnknownIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { STAGES } from './RuntimeLocationPage';
import { ConfidenceBadge } from '@/components/runtime/ConfidenceBadge';
import { FreshnessIndicator } from '@/components/runtime/FreshnessIndicator';
import { AssetStatusBadge } from '@/components/runtime/AssetStatusBadge';
import { TechStackIcon } from '@/components/runtime/TechStackIcon';
import { DataSourcePanel } from '@/components/runtime/DataSourcePanel';
import { ConfidenceBreakdownPanel } from '@/components/runtime/ConfidenceBreakdownPanel';
import { ConflictAlert } from '@/components/runtime/ConflictAlert';
import { LocationMap } from '@/components/runtime/LocationMap';
import { RuntimeDependencyGraph } from '@/components/runtime/RuntimeDependencyGraph';
import { IntentVsActualTab } from '@/components/runtime/IntentVsActualTab';
import { AuditLogTab } from '@/components/runtime/AuditLogTab';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, AreaChart, Area, ReferenceLine
} from 'recharts';
import { formatRelativeTime } from '@/lib/runtimeLocationMock';
import type {
  ApplicationComponent, AssetEnvironment, RuntimeSnapshot, TechStack, ApplicationLocationDetail, EnvComparisonRow,
} from '@/types';

type TabId = 'map' | 'graph' | 'components' | 'openshift' | 'intent' | 'quality' | 'snapshots' | 'compare' | 'audit';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'map',        label: 'DC Distribution', icon: MapPin },
  { id: 'graph',      label: 'Dependency Graph', icon: GitBranch },
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
  const primaryDC = primaryAsset?.data_center?.short_name ?? 'NONE';
  const primaryHost = primaryAsset?.host ?? 'unknown-host';
  const conf = detail.overall_confidence;

  const confLabel = conf === 4 ? 'HIGH' : conf === 3 ? 'MEDIUM' : conf === 2 ? 'LOW' : 'UNKNOWN';
  const confColor = conf === 4 ? '#30D158' : conf === 3 ? '#FF9F0A' : conf === 2 ? '#FF453A' : '#8E8E93';
  const staleCount = detail.data_sources.filter((s) => s.status === 'STALE' || s.status === 'VERY_STALE').length;
  const totalSources = detail.data_sources.length;
  const totalAssets = allAssets.length;

  const appDrifts = useRuntimeLocationStore((s) => s.drifts).filter(
    (d) => d.application_id === detail.application_id && d.environment === detail.environment
  );
  const isAligned = appDrifts.length === 0;

  const [activeExpKey, setActiveExpKey] = useState<string | null>(null);

  const items = [
    {
      key: 'where',
      label: 'WHERE',
      value: `${activeDCs.length > 0 ? activeDCs.join(' + ') : 'NONE'} (${activeDCs.length} DCs)`,
      color: activeDCs.length > 0 ? '#30D158' : '#8E8E93',
      explanation: `Active compute instances have been detected in ${activeDCs.join(' and ')} via telemetry signals from MongoDB and OpenShift routers. These locations contain active workloads routing production traffic.`,
    },
    {
      key: 'primary',
      label: 'PRIMARY WRITE',
      value: primaryDC,
      color: primaryDC !== 'NONE' ? '#0A84FF' : '#FF9F0A',
      explanation: `${primaryDC} is classified as PRIMARY because: MongoDB Ops Manager shows rs_state=1 (Primary) for database nodes on host ${primaryHost}. This was ingested 8 minutes ago. AppDynamics shows 94% of transaction load routed through ${primaryDC} nodes. No conflicting signals detected.`,
    },
    {
      key: 'confidence',
      label: 'CONFIDENCE',
      value: confLabel,
      color: confColor,
      explanation: `Overall alignment confidence is ${confLabel} because we have active telemetry channels validating runtime status, and only ${staleCount} stale signals out of ${totalSources} total configured integrations.`,
    },
    {
      key: 'drift',
      label: 'DRIFT',
      value: isAligned ? 'ALIGNED ✓' : 'DRIFTED ⚠',
      color: isAligned ? '#30D158' : '#FF453A',
      explanation: isAligned
        ? `The system matches the design intent perfectly: all active locations, tech stacks, and primary write hosts are aligned.`
        : `Drifts detected: ${appDrifts.map(d => d.description).join('; ')}`,
    },
    {
      key: 'stale',
      label: 'STALE SOURCES',
      value: `${staleCount}`,
      color: staleCount > 0 ? '#FF9F0A' : '#30D158',
      explanation: `We have ${staleCount} stale monitoring integrations out of ${totalSources}. Outdated signals: ${detail.data_sources.filter(s => s.status !== 'FRESH').map(s => s.source_name).join(', ') || 'None'}.`,
    },
    {
      key: 'assets',
      label: 'ASSETS',
      value: `${totalAssets}`,
      color: '#BF5AF2',
      explanation: `Total of ${totalAssets} compute resources (databases, queues, containers) mapped to this application instance.`,
    },
  ];

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      {/* 2AM trust banner — can the operator trust this answer right now? */}
      {(() => {
        const strongSources = detail.data_sources.filter(
          (s) => s.status === 'FRESH' && s.topology_confidence >= 3
        );
        const hasConflict = detail.conflicts && detail.conflicts.length > 0;
        const canTrust = !hasConflict && staleCount === 0 && strongSources.length >= 2;
        const trustColor = canTrust ? '#30D158' : hasConflict ? '#FF453A' : '#FF9F0A';
        const trustLabel = canTrust ? 'TRUSTWORTHY' : hasConflict ? 'CONFLICT — DO NOT ACT WITHOUT MANUAL CHECK' : 'CAUTION — Some signals are stale';
        const trustBg = canTrust ? 'rgba(48,209,88,0.06)' : hasConflict ? 'rgba(255,69,58,0.07)' : 'rgba(255,159,10,0.06)';
        const trustBorder = canTrust ? 'rgba(48,209,88,0.2)' : hasConflict ? 'rgba(255,69,58,0.3)' : 'rgba(255,159,10,0.2)';
        return (
          <div
            className="rounded-xl px-3 py-2 flex items-center gap-3"
            style={{ background: trustBg, border: `1px solid ${trustBorder}` }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: trustColor, boxShadow: canTrust ? `0 0 6px ${trustColor}` : 'none' }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: trustColor }}>
                {trustLabel}
              </span>
              <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>
                {strongSources.length} fresh source{strongSources.length !== 1 ? 's' : ''} · {staleCount} stale · {detail.conflicts?.length ?? 0} conflict{(detail.conflicts?.length ?? 0) !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="relative group flex items-center">
              <span className="text-[9px] font-bold uppercase tracking-widest flex-shrink-0 cursor-help flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                2AM READY <HelpCircle className="w-2.5 h-2.5 text-white/40" />
              </span>
              {/* Hover Tooltip */}
              <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex flex-col p-3 rounded-xl z-50 pointer-events-none w-64 text-left shadow-2xl border bg-[#0f141c]/95 border-white/10">
                <p className="text-[10px] font-bold text-white uppercase tracking-wider">
                  2 AM Ready Concept
                </p>
                <p className="text-[9px] text-white/70 mt-1 leading-normal">
                  During a high-stress outage, SREs need trust. This banner aggregates signal freshness and conflict counts to prevent engineers from taking destructive recovery actions based on stale or conflicting assertions.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 divide-y md:divide-y-0 md:divide-x divide-white/5">
        {items.map((item, idx) => (
          <div key={item.key} className={cn("flex flex-col justify-between min-w-0", idx > 0 ? "pt-2 md:pt-0 md:pl-4" : "")}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest truncate">
                {item.label}
              </span>
              <button
                onClick={() => setActiveExpKey(activeExpKey === item.key ? null : item.key)}
                className="w-4 h-4 rounded flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                title="View Explanation"
              >
                <HelpCircle className="w-2.5 h-2.5" />
              </button>
            </div>
            <span className="text-[14px] font-extrabold mt-1 truncate" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {activeExpKey && (() => {
          const item = items.find(i => i.key === activeExpKey);
          if (!item) return null;
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 p-3 rounded-xl border flex gap-3 items-start overflow-hidden bg-white/[0.02]"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <UnknownIcon className="w-4 h-4 text-[#0A84FF] mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h5 className="text-[10px] font-extrabold text-[#0A84FF] uppercase tracking-wider">
                  Assertion Justification: {item.label}
                </h5>
                <p className="text-[11px] text-white/85 mt-1 leading-relaxed">
                  {item.explanation}
                </p>
              </div>
              <button
                onClick={() => setActiveExpKey(null)}
                className="text-[10px] text-white/40 hover:text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>
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
  if (snapshots.length === 0) return null;

  const { simulatedAgeOffset, setSimulatedAgeOffset } = useRuntimeLocationStore();
  const currentStep = simulatedAgeOffset === 0 ? 1
    : simulatedAgeOffset === 60 ? 2
    : simulatedAgeOffset === 120 ? 3
    : simulatedAgeOffset === 180 ? 4
    : 5;

  const data = useMemo(() => {
    // 8 points from 105m ago to 0m (now)
    const points = [
      { offset: 0,   timeLabel: '105m ago', confidence: 4, drifts: 0, status: 'ALIGNED',   primaryDc: 'IBB1', step: 1 },
      { offset: 15,  timeLabel: '90m ago',  confidence: 4, drifts: 0, status: 'ALIGNED',   primaryDc: 'IBB1', step: 1 },
      { offset: 30,  timeLabel: '75m ago',  confidence: 4, drifts: 0, status: 'ALIGNED',   primaryDc: 'IBB1', step: 1 },
      { offset: 45,  timeLabel: '60m ago',  confidence: 4, drifts: 0, status: 'ALIGNED',   primaryDc: 'IBB1', step: 2 },
      { offset: 60,  timeLabel: '45m ago',  confidence: 3, drifts: 0, status: 'ALIGNED',   primaryDc: 'IBB1', step: 2 },
      { offset: 75,  timeLabel: '30m ago',  confidence: 3, drifts: 1, status: 'DRIFTED',   primaryDc: 'IBB1', step: 3 },
      { offset: 90,  timeLabel: '15m ago',  confidence: 2, drifts: 1, status: 'DRIFTED',   primaryDc: 'IBB1', step: 4 },
      { offset: 105, timeLabel: 'Now',      confidence: 1, drifts: 2, status: 'DRIFTED',   primaryDc: 'IBB1', step: 5 },
    ];

    const isUat = snapshots.some((s) => s.asset_id.toLowerCase().includes('uat'));
    const basePrimaryDc = isUat ? 'GA-UAT' : 'IBB1';

    return points.map((p) => {
      let conf = 4;
      let drifts = 0;
      let status = 'ALIGNED';
      let primaryDc = basePrimaryDc;

      if (p.step <= currentStep) {
        if (p.step === 1) {
          conf = 4; drifts = 0; status = 'ALIGNED';
        } else if (p.step === 2) {
          conf = 4; drifts = 0; status = 'ALIGNED';
        } else if (p.step === 3) {
          conf = 3; drifts = 1; status = 'DRIFTED';
        } else if (p.step === 4) {
          conf = 2; drifts = 1; status = 'DRIFTED';
        } else {
          conf = 1; drifts = 2; status = 'DRIFTED';
        }
      } else {
        // Future simulated points will still show expected future state in dashed/faded color
        if (p.step === 3) {
          conf = 3; drifts = 1; status = 'DRIFTED';
        } else if (p.step === 4) {
          conf = 2; drifts = 1; status = 'DRIFTED';
        } else {
          conf = 1; drifts = 2; status = 'DRIFTED';
        }
      }

      return {
        ...p,
        confidence: conf,
        drifts: drifts,
        status: status,
        primaryDc: primaryDc,
      };
    });
  }, [currentStep, snapshots]);

  const handlePointClick = (chartData: any) => {
    if (chartData && chartData.activePayload && chartData.activePayload[0]) {
      const clickedPoint = chartData.activePayload[0].payload;
      const step = clickedPoint.step;
      const offsetVal = step === 1 ? 0
        : step === 2 ? 60
        : step === 3 ? 120
        : step === 4 ? 180
        : 240;
      setSimulatedAgeOffset(offsetVal);
    }
  };

  const currentStatus = data[data.length - 1]?.status ?? 'ALIGNED';
  const strokeColor = currentStatus === 'ALIGNED' ? '#30D158' : '#FF453A';

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const pData = payload[0].payload;
      const confText = pData.confidence === 4 ? 'High (4/4)'
        : pData.confidence === 3 ? 'Moderate (3/4)'
        : pData.confidence === 2 ? 'Low (2/4)'
        : 'Critical (1/4)';
      const confColor = pData.confidence === 4 ? '#30D158'
        : pData.confidence === 3 ? '#FF9F0A'
        : pData.confidence === 2 ? '#FF9F0A'
        : '#FF453A';

      return (
        <div className="rounded-xl p-3 flex flex-col gap-1.5 border backdrop-blur-md shadow-2xl"
             style={{ background: 'rgba(15, 20, 28, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <p className="text-[10px] text-white/40 uppercase font-mono font-bold">{pData.timeLabel}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: pData.status === 'ALIGNED' ? '#30D158' : '#FF453A' }} />
            <span className="text-[12px] font-bold text-white uppercase tracking-wider">{pData.status}</span>
          </div>
          <div className="text-[11px] text-white/70 mt-1 flex flex-col gap-1">
            <div>Confidence Score: <span className="font-mono font-semibold" style={{ color: confColor }}>{confText}</span></div>
            <div>Drift Count: <span className="font-mono font-semibold text-white">{pData.drifts}</span></div>
            <div>Primary DC: <span className="font-mono font-semibold text-white">{pData.primaryDc}</span></div>
          </div>
          <p className="text-[9px] text-white/40 mt-1 italic">Click point to replay this state</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wider text-white">
            Historical Snapshots & Alignment Trend
          </p>
          <p className="text-[10px] text-white/40">
            Interactive Area Chart · Click nodes to replay historical drift events
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#30D158' }} />
            <span className="text-[10px] font-bold text-white/60">ALIGNED</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FF453A' }} />
            <span className="text-[10px] font-bold text-white/60">DRIFTED</span>
          </div>
        </div>
      </div>

      <div style={{ height: 160 }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }} onClick={handlePointClick}>
            <defs>
              <linearGradient id="snapshotColorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="timeLabel" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} />
            <YAxis domain={[0, 4]} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
            <Area
              type="monotone"
              dataKey="confidence"
              stroke={strokeColor}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#snapshotColorGrad)"
              activeDot={{ r: 5, strokeWidth: 1, stroke: '#fff' }}
            />
            <ReferenceLine x="Now" stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" />
          </AreaChart>
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
  dr_only:      { label: 'DR only',     color: '#30D158', bg: 'rgba(48,209,88,0.1)',   border: 'rgba(48,209,88,0.25)',  Icon: HelpCircle },
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
  const { envComparison, simulatedAgeOffset } = useRuntimeLocationStore();
  const baseRows = envComparison;
  const currentStep = simulatedAgeOffset === 0 ? 1 : Math.min(5, Math.floor(simulatedAgeOffset / 2) + 1);

  const rows = useMemo(() => {
    return baseRows.map((row) => {
      const cloned = { ...row };
      
      // Decay confidence scores based on simulation steps
      if (currentStep >= 2) {
        if (cloned.tech_stack === 'mongodb' && cloned.uat_confidence) {
          cloned.uat_confidence = Math.max(1, cloned.uat_confidence - 1);
        }
      }
      if (currentStep >= 3) {
        if (cloned.prod_confidence) {
          cloned.prod_confidence = Math.max(1, cloned.prod_confidence - 1);
        }
        if (cloned.dr_confidence) {
          cloned.dr_confidence = Math.max(1, cloned.dr_confidence - 1);
        }
      }
      if (currentStep >= 4) {
        if (cloned.asset_name === 'pcadb_primary') {
          cloned.prod_role = 'PHYSICAL_STANDBY';
          cloned.status = 'inconsistent';
        }
        if (cloned.asset_name === 'pcadb_standby') {
          cloned.prod_role = 'PRIMARY';
          cloned.status = 'inconsistent';
        }
      }
      if (currentStep >= 5) {
        if (cloned.asset_name === 'MQ.PCA.GA') {
          cloned.prod_role = 'STANDBY';
          cloned.status = 'inconsistent';
        }
        if (cloned.asset_name === 'pcadb_primary') {
          cloned.dr_role = 'PRIMARY';
          cloned.status = 'inconsistent';
        }
      }

      return cloned;
    });
  }, [baseRows, currentStep]);

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
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: '#30D158', borderBottom: '1px solid var(--app-border)', background: 'rgba(48,209,88,0.04)' }}>
                DR (STANDBY)
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
                  <EnvCell role={row.dr_role}   dc={row.dr_dc}   confidence={row.dr_confidence} />
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
        Comparison is between PRODUCTION, UAT, and DISASTER RECOVERY environments.
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

function TimeSimulatorSlider() {
  const { simulatedAgeOffset, setSimulatedAgeOffset } = useRuntimeLocationStore();

  const currentStep = simulatedAgeOffset === 0 ? 1
    : simulatedAgeOffset === 60 ? 2
    : simulatedAgeOffset === 120 ? 3
    : simulatedAgeOffset === 180 ? 4
    : 5;

  const currentStage = STAGES[currentStep - 1];

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 rounded-2xl flex-shrink-0 relative group border bg-white/5 border-white/5"
      style={{
        borderColor: `${currentStage.color}25`,
        boxShadow: `0 0 10px ${currentStage.color}05`,
      }}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0 animate-ping"
        style={{ background: currentStage.color }}
      />
      
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] font-extrabold uppercase tracking-widest text-white/40">
            Timeline Step
          </span>
          <span className="text-[9px] font-extrabold font-mono" style={{ color: currentStage.color }}>
            Step {currentStep}/5: {currentStage.label}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={currentStep}
          onChange={(e) => {
            const step = Number(e.target.value);
            const offset = STAGES[step - 1].offset;
            setSimulatedAgeOffset(offset);
          }}
          className="w-28 accent-current cursor-pointer"
          style={{ accentColor: currentStage.color }}
        />
      </div>

      {/* Popover/Tooltip on hover of timeline slider */}
      <div
        className="absolute bottom-full mb-3 right-1/2 translate-x-1/2 hidden group-hover:flex flex-col gap-2 p-3 rounded-2xl z-50 pointer-events-none w-64 text-left shadow-2xl backdrop-blur-md transition-all border"
        style={{
          background: 'rgba(15, 20, 28, 0.96)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-white/40 uppercase">Timeline Status</span>
          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: `${currentStage.color}15`, color: currentStage.color }}>
            {currentStage.status}
          </span>
        </div>
        <p className="text-[11px] font-extrabold text-white mt-1">
          {currentStage.label}
        </p>
        <p className="text-[9px] text-white/60 leading-relaxed">
          {currentStage.desc}
        </p>
      </div>
    </div>
  );
}

export function ApplicationLocationDetailPage() {
  const { appId } = useParams<{ appId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedDetail, isLoadingDetail, loadDetail, clearDetail, snapshots, loadSnapshots, simulatedAgeOffset, setSimulatedAgeOffset } = useRuntimeLocationStore();
  const [activeTab, setActiveTab] = useState<TabId>('map');

  // Lifted Simulation States for shared Map and Dependency Graph
  const [simulatingFailover, setSimulatingFailover] = useState(false);
  const [failedDcId, setFailedDcId] = useState<string | null>(null);
  const [failoverComplete, setFailoverComplete] = useState(false);
  const [promotedDcId, setPromotedDcId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<{
    sourceName: string;
    assetName: string;
    type: 'deterministic' | 'inferred' | 'cmdb';
    details: string[];
  } | null>(null);

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

  const currentStep = simulatedAgeOffset === 0 ? 1
    : simulatedAgeOffset === 60 ? 2
    : simulatedAgeOffset === 120 ? 3
    : simulatedAgeOffset === 180 ? 4
    : 5;

  const currentStage = STAGES[currentStep - 1];

  const simulatedDetail = useMemo(() => {
    if (!selectedDetail) return null;
    const app = selectedDetail;
    const modifiedSources = app.data_sources.map((src) => {
      if (simulatedAgeOffset >= 60 && src.source_name.toLowerCase().includes('mongodb') && app.environment === 'UAT') {
        return { ...src, status: 'STALE' as const, last_import: new Date(Date.now() - 4 * 3600 * 1000).toISOString() };
      }
      if (simulatedAgeOffset >= 120 && src.source_name.toLowerCase().includes('cmdb') && app.environment === 'PRODUCTION') {
        return { ...src, status: 'VERY_STALE' as const, last_import: new Date(Date.now() - 26 * 3600 * 1000).toISOString() };
      }
      return src;
    });

    let conflicts = app.conflicts;
    if (simulatedAgeOffset >= 180 && app.application_id === 'PCA' && app.environment === 'PRODUCTION') {
      conflicts = [
        ...app.conflicts,
        {
          asset_name: 'pca-web-portal',
          source_a: { name: 'CMDB Design Registry', says: 'Active in SHV' },
          source_b: { name: 'OpenShift pod routing', says: 'Active in ASH (Primary Mismatch)' },
          last_checked: new Date().toISOString(),
        }
      ];
    }

    return {
      ...app,
      data_sources: modifiedSources,
      conflicts,
    };
  }, [selectedDetail, simulatedAgeOffset]);

  const appDriftsRaw = useRuntimeLocationStore((s) => s.drifts).filter(
    (d) => d.application_id === appId && d.environment === envParam
  );

  const appDrifts = useMemo(() => {
    let list = appDriftsRaw;
    if (simulatedAgeOffset >= 180 && appId === 'PCA' && envParam === 'PRODUCTION') {
      const hasSimDrift = list.some(d => d.drift_type === 'ROLE_MISMATCH');
      if (!hasSimDrift) {
        list = [
          ...list,
          {
            id: 'drift-simulated',
            application_id: 'PCA',
            environment: 'PRODUCTION',
            drift_type: 'ROLE_MISMATCH',
            description: 'Primary DC mismatch: CMDB indicates write authority on SHV, but OpenShift active routing points to ASH.',
            severity: 'CRITICAL',
            detected_at: new Date().toISOString(),
            intended: 'SHV',
            actual: 'ASH',
          }
        ];
      }
    }
    return list;
  }, [appDriftsRaw, simulatedAgeOffset, appId, envParam]);

  if (isLoadingDetail) {
    return (
      <div className="px-6 py-6 flex flex-col gap-6 max-w-[1400px] mx-auto">
        <div className="h-8 w-64 rounded-xl animate-pulse" style={{ background: 'var(--app-surface)' }} />
        <div className="h-48 rounded-2xl animate-pulse" style={{ background: 'var(--app-surface)' }} />
      </div>
    );
  }

  if (!simulatedDetail) {
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

  const detail = simulatedDetail;
  const staleCount = detail.data_sources.filter(
    (s) => s.status === 'STALE' || s.status === 'VERY_STALE',
  ).length;

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto">
      {/* Redesigned Gradient Header Banner */}
      <div 
        className="rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border relative overflow-hidden backdrop-blur-md"
        style={{
          background: 'linear-gradient(135deg, rgba(10, 108, 255, 0.12) 0%, rgba(15, 20, 28, 0.9) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => navigate('/runtime-location')}
              className="flex items-center gap-1 text-[11px] font-bold text-white/50 hover:text-white transition-colors uppercase tracking-widest mr-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <span
              className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-white/5 text-white/60 border border-white/5 uppercase tracking-wider"
            >
              {detail.application_id}
            </span>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap">
            <h1 className="text-[26px] font-extrabold text-white tracking-tight leading-none">
              {detail.application_name}
            </h1>
            <ConfidenceBadge level={detail.overall_confidence} size="md" />
            
            {staleCount > 0 && (
              <span
                className="text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 border bg-[#FF9F0A]/10 text-[#FF9F0A] border-[#FF9F0A]/20"
              >
                {staleCount} STALE
              </span>
            )}
            
            {detail.conflicts.length > 0 && (
              <span
                className="text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 border bg-[#FF453A]/10 text-[#FF453A] border-[#FF453A]/20"
              >
                {detail.conflicts.length} CONFLICTS
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 mt-3 flex-wrap text-white/40 text-[12px] font-medium">
            <p>
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
                <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Last Ingested: {formatRelativeTime(lastImport)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Environment switcher + Time Simulator on right of header */}
        <div className="flex flex-col md:flex-row items-center gap-4 flex-shrink-0">
          <TimeSimulatorSlider />
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/5">
            {ENV_OPTIONS.map((env) => (
              <button
                key={env}
                onClick={() => handleEnvChange(env)}
                className={cn(
                  'px-4 py-2 rounded-xl text-[12px] font-extrabold transition-all uppercase tracking-wider',
                )}
                style={env === envParam ? {
                  background: 'var(--primary-500)',
                  color: '#fff',
                  boxShadow: '0 2px 10px rgba(0, 108, 255, 0.3)',
                } : {
                  color: 'rgba(255, 255, 255, 0.4)',
                }}
              >
                {env}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Simulation alert banner */}
      {simulatedAgeOffset > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-2xl p-4 flex items-start gap-3 border relative overflow-hidden backdrop-blur-md"
          style={{
            background: `${currentStage.color}08`,
            borderColor: `${currentStage.color}30`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-ping"
            style={{ background: currentStage.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: `${currentStage.color}15`, color: currentStage.color }}>
                {currentStage.status}
              </span>
              <h4 className="text-[12px] font-bold text-white uppercase tracking-wider">
                Simulation Step {currentStep}/5: {currentStage.label}
              </h4>
            </div>
            <p className="text-[11px] text-white/70 mt-1">
              {currentStage.desc}
            </p>
          </div>
          <button
            onClick={() => setSimulatedAgeOffset(0)}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex-shrink-0 hover:bg-white/5 transition-colors"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'rgba(255,255,255,0.08)',
              color: '#fff',
            }}
          >
            End Simulation
          </button>
        </motion.div>
      )}

      {/* Cockpit summary band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 flex flex-col justify-between border bg-white/[0.01] border-white/5 backdrop-blur-md">
          <span className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Active Data Centers</span>
          <span className="text-[24px] font-extrabold text-white mt-2">
            {new Set(detail.components.flatMap(c => c.assets.map(a => a.data_center?.short_name).filter(Boolean))).size}
          </span>
          <span className="text-[10px] text-white/30 mt-1">Configured sites</span>
        </div>

        <div className="rounded-2xl p-4 flex flex-col justify-between border bg-white/[0.01] border-white/5 backdrop-blur-md">
          <span className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Compute Resources</span>
          <span className="text-[24px] font-extrabold text-white mt-2">
            {detail.components.reduce((acc, c) => acc + c.assets.length, 0)}
          </span>
          <span className="text-[10px] text-white/30 mt-1">Containers, DBs, queues</span>
        </div>

        <div className="rounded-2xl p-4 flex flex-col justify-between border bg-white/[0.01] border-white/5 backdrop-blur-md">
          <span className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Integrations Freshness</span>
          <span className="text-[24px] font-extrabold text-[#30D158] mt-2">
            {detail.data_sources.length > 0 ? (
              `${Math.round((detail.data_sources.filter(s => s.status === 'FRESH').length / detail.data_sources.length) * 100)}%`
            ) : '100%'}
          </span>
          <span className="text-[10px] text-white/30 mt-1">Signals up-to-date</span>
        </div>

        <div className="rounded-2xl p-4 flex flex-col justify-between border bg-white/[0.01] border-white/5 backdrop-blur-md">
          <span className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Active Drift Violations</span>
          <span className={`text-[24px] font-extrabold mt-2 ${appDrifts.length > 0 ? 'text-[#FF453A] animate-pulse-soft' : 'text-white/60'}`}>
            {appDrifts.length}
          </span>
          <span className="text-[10px] text-white/30 mt-1">Non-aligned settings</span>
        </div>
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
        className="flex items-center gap-1.5 p-1 rounded-2xl w-fit overflow-x-auto max-w-full"
        style={{ background: 'rgba(20, 20, 25, 0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const isIntent = id === 'intent';
          const isQuality = id === 'quality';
          
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-extrabold transition-all relative overflow-hidden flex-shrink-0 uppercase tracking-wider',
              )}
              style={activeTab === id ? {
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              } : {
                color: 'rgba(255, 255, 255, 0.4)',
                border: '1px solid transparent',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>

              {isIntent && appDrifts.length > 0 && (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#FF453A] text-white text-[9px] font-extrabold ml-1.5">
                  {appDrifts.length}
                </span>
              )}

              {isQuality && staleCount > 0 && (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#FF9F0A] text-white text-[9px] font-extrabold ml-1.5">
                  {staleCount}
                </span>
              )}

              {activeTab === id && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-blue-500 to-[#00E599]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Operator Quick Summary */}
      <OperatorQuickSummary detail={detail} />

      {/* Tab content with slide animation */}
      <div className="relative overflow-hidden w-full min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="w-full h-full"
          >
            {activeTab === 'map' && (
              <LocationMap 
                detail={detail} 
                simulatingFailover={simulatingFailover}
                setSimulatingFailover={setSimulatingFailover}
                failedDcId={failedDcId}
                setFailedDcId={setFailedDcId}
                failoverComplete={failoverComplete}
                setFailoverComplete={setFailoverComplete}
                promotedDcId={promotedDcId}
                setPromotedDcId={setPromotedDcId}
                onSelectEvidence={(ev) => setSelectedEvidence(ev)}
              />
            )}
            {activeTab === 'graph' && (
              <RuntimeDependencyGraph 
                detail={detail}
                simulatingFailover={simulatingFailover}
                failedDcId={failedDcId}
                failoverComplete={failoverComplete}
                promotedDcId={promotedDcId}
              />
            )}
            {activeTab === 'components' && <ComponentsTable components={detail.components} />}
            {activeTab === 'openshift' && <OpenShiftTab detail={detail} />}
            {activeTab === 'intent' && <IntentVsActualTab detail={detail} />}
            {activeTab === 'quality' && (
              <div className="flex flex-col gap-5">
                <ConfidenceBreakdownPanel detail={detail} defaultExpanded />
                <DataSourcePanel dataSources={detail.data_sources} />
              </div>
            )}
            {activeTab === 'snapshots' && <SnapshotsTab snapshots={snapshots} />}
            {activeTab === 'compare' && <CompareEnvsTab appId={appId!} />}
            {activeTab === 'audit' && <AuditLogTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Side Drawer for Evidence Chips (Slide in from right) */}
      <AnimatePresence>
        {selectedEvidence && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvidence(null)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-80 sm:w-96 z-50 p-6 shadow-2xl flex flex-col gap-4 border-l overflow-y-auto"
              style={{ background: 'var(--app-bg-dark, #0a0e1a)', borderColor: 'var(--app-border)' }}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-mono font-bold tracking-wider" style={{
                    color: selectedEvidence.type === 'deterministic' ? '#30D158'
                      : selectedEvidence.type === 'inferred' ? '#FF9F0A' : '#8E8E93'
                  }}>
                    {selectedEvidence.type} Evidence Record
                  </span>
                  <h3 className="text-[15px] font-bold text-white mt-0.5">
                    Source: {selectedEvidence.sourceName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEvidence(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5 text-white/50 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[10px] text-white/40 uppercase font-semibold">Asset Name</p>
                  <p className="text-[12px] font-mono text-white/95 mt-0.5 font-semibold bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                    {selectedEvidence.assetName}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-white/40 uppercase font-semibold mb-1">Signal Parameters</p>
                  <div className="flex flex-col gap-2">
                    {selectedEvidence.details.map((detail, idx) => (
                      <div key={idx} className="text-[11px] text-white/80 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        {detail}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg border text-[11px] text-white/50 leading-relaxed bg-white/[0.01]" style={{ borderColor: 'var(--app-border)' }}>
                  This snapshot evidence represents real-time telemetry captured by the HealthMesh sync agent and verified against active endpoint network listeners.
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
