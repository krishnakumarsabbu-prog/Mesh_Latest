import React, { useState } from 'react';
import {
  Server, Database, Network, MessageSquare, ArrowRight, CheckCircle2,
  AlertTriangle, Cpu, Activity, ShieldAlert, Layers, HelpCircle
} from 'lucide-react';
import { useFailoverView } from '../hooks/useDcExitQueries';
import { DcExitLoading, DcExitError } from './DcExitStates';

interface FailoverViewTabProps {
  sourceDc: string;
}

export function FailoverViewTab({ sourceDc }: FailoverViewTabProps) {
  const [targetDc, setTargetDc] = useState<string>('MA-PRD');
  const { data, isLoading, isError } = useFailoverView(sourceDc, targetDc);

  if (isLoading) return <DcExitLoading label="Generating 6-layer failover ontology projection..." />;
  if (isError) return <DcExitError message="Failed to load failover projection. Please check backend connection." />;
  if (!data) return null;

  const { summary, layer_1_apps, layer_2_compute, layer_3_storage, layer_4_integration, layer_5_config, layer_6_waves } = data;

  return (
    <div className="flex flex-col gap-6 text-[12.5px] leading-relaxed">
      {/* Target DC selector & summary bar */}
      <div
        className="rounded-[8px] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
            Active Failover Path
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[14px]" style={{ color: '#00B074' }}>{sourceDc}</span>
            <ArrowRight className="w-4 h-4 opacity-50" />
            <select
              value={targetDc}
              onChange={(e) => setTargetDc(e.target.value)}
              className="bg-transparent font-bold text-[14px] outline-none cursor-pointer pr-4"
              style={{ color: 'var(--text-primary)' }}
            >
              <option value="MA-PRD" className="bg-[#111A24]">MA-PRD (Secondary Data Center)</option>
              <option value="AZ003" className="bg-[#111A24]">AZ003 (Azure Cloud East)</option>
              <option value="LEW" className="bg-[#111A24]">LEW (EU Central Hub)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 max-w-2xl">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-disabled)' }}>Resident Apps</span>
            <span className="text-[16px] font-bold tracking-tight">{summary.total_resident_apps}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-disabled)' }}>Storage Clusters</span>
            <span className="text-[16px] font-bold tracking-tight">{summary.total_storage_clusters}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-disabled)' }}>Msg Channels</span>
            <span className="text-[16px] font-bold tracking-tight">{summary.total_integration_channels}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-disabled)' }}>Verdict</span>
            <span
              className="text-[12px] font-bold px-2 py-0.5 rounded-[4px] w-fit"
              style={{
                background: summary.readiness_verdict === 'READY' ? 'rgba(0,176,116,0.1)' : 'rgba(255,0,60,0.1)',
                color: summary.readiness_verdict === 'READY' ? '#00B074' : '#FF003C',
              }}
            >
              {summary.readiness_verdict}
            </span>
          </div>
        </div>
      </div>

      {/* Layer 1: Affected Application Set */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <Layers className="w-4 h-4 text-blue-500" />
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Layer 1: Affected Application Set (Resident & Dependent)
          </h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h5 className="font-bold text-[11px] mb-2 tracking-[0.06em] uppercase" style={{ color: 'var(--text-secondary)' }}>
              Resident Workloads in {sourceDc} ({layer_1_apps.resident.length})
            </h5>
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
              {layer_1_apps.resident.map((app) => (
                <div
                  key={app.app_id}
                  className="flex items-center justify-between p-2 rounded-[6px]"
                  style={{ background: 'var(--app-bg-muted)' }}
                >
                  <div>
                    <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>{app.app_name}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
                      {app.app_id} • {app.asset_count} assets
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {app.tech_stacks.map((t) => (
                      <span key={t} className="text-[9px] font-mono px-1 rounded bg-[#ffffff10]" style={{ color: 'var(--text-secondary)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h5 className="font-bold text-[11px] mb-2 tracking-[0.06em] uppercase" style={{ color: 'var(--text-secondary)' }}>
              Dependent Apps (External Impact) ({layer_1_apps.dependent.length})
            </h5>
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
              {layer_1_apps.dependent.map((app) => (
                <div
                  key={app.app_id}
                  className="flex items-center justify-between p-2 rounded-[6px]"
                  style={{ background: 'var(--app-bg-muted)' }}
                >
                  <div>
                    <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>{app.app_name}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>
                      Type: {app.dependency_type}
                    </span>
                  </div>
                  <span
                    className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[4px]"
                    style={{
                      background: app.impact_severity === 'HIGH' ? 'rgba(255,140,0,0.1)' : 'rgba(255,255,255,0.08)',
                      color: app.impact_severity === 'HIGH' ? '#FF8800' : 'var(--text-secondary)',
                    }}
                  >
                    {app.impact_severity} IMPACT
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Layer 2: Compute Failover Units & Capacity Check */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <Cpu className="w-4 h-4 text-cyan-500" />
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Layer 2: Compute Failover Mappings & target Headroom
          </h4>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <h5 className="font-bold text-[11px] tracking-[0.06em] uppercase" style={{ color: 'var(--text-secondary)' }}>
              Workload Placements
            </h5>
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
              {layer_2_compute.units.map((unit) => (
                <div
                  key={unit.asset_id}
                  className="p-2.5 rounded-[6px] grid grid-cols-2 md:grid-cols-4 gap-2 items-center"
                  style={{ background: 'var(--app-bg-muted)' }}
                >
                  <div>
                    <span className="font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>{unit.name}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-disabled)' }}>{unit.app_id}</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] block font-mono text-blue-400">{unit.source_cluster}</span>
                    <span className="text-[9px] font-mono opacity-50">{unit.source_namespace}</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] block font-mono text-emerald-400">{unit.target_cluster}</span>
                    <span className="text-[9px] font-mono opacity-50">{unit.target_namespace}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono">
                      {unit.cpu_cores_required} Cores / {unit.memory_gb_required} GB
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  </div>
                </div>
              ))}
              {layer_2_compute.units.length === 0 && (
                <span className="text-center py-4 text-gray-500">No active OpenShift container workloads in source.</span>
              )}
            </div>
          </div>

          <div
            className="p-4 rounded-[6px] flex flex-col justify-between gap-4"
            style={{ background: 'var(--app-bg-muted)' }}
          >
            <div>
              <h5 className="font-bold text-[11px] tracking-[0.06em] uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
                Target Capacity Check
              </h5>
              <div className="flex flex-col gap-2.5">
                <div>
                  <div className="flex justify-between text-[11px] mb-1 font-mono">
                    <span>CPU Headroom</span>
                    <span>{layer_2_compute.capacity_check.required_cpu_cores} / {layer_2_compute.capacity_check.available_cpu_cores} Cores</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#ffffff10] overflow-hidden">
                    <div
                      className="h-full bg-cyan-500"
                      style={{ width: `${Math.min(100, (layer_2_compute.capacity_check.required_cpu_cores / layer_2_compute.capacity_check.available_cpu_cores) * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1 font-mono">
                    <span>Memory Headroom</span>
                    <span>{layer_2_compute.capacity_check.required_memory_gb} / {layer_2_compute.capacity_check.available_memory_gb} GB</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#ffffff10] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (layer_2_compute.capacity_check.required_memory_gb / layer_2_compute.capacity_check.available_memory_gb) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid #ffffff10' }}>
              <Activity className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="block font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                  Status: {layer_2_compute.capacity_check.status}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
                  {layer_2_compute.capacity_check.headroom_percent}% overall target headroom
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Layer 3: Storage Plane View */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <Database className="w-4 h-4 text-orange-500" />
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Layer 3: Storage replication lag & Promotion Mode
          </h4>
        </div>
        {layer_3_storage.blockers.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-[6px] flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold block text-[11px]">Storage Blocker Detected</span>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                {layer_3_storage.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
          {layer_3_storage.clusters.map((cluster, i) => (
            <div
              key={i}
              className="p-2.5 rounded-[6px] grid grid-cols-2 md:grid-cols-5 gap-2 items-center"
              style={{ background: 'var(--app-bg-muted)' }}
            >
              <div>
                <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>{cluster.db_name}</span>
                <span className="text-[10px] font-mono px-1 rounded bg-[#ffffff10] w-fit text-orange-400">{cluster.tech_stack.toUpperCase()}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono block opacity-50">Source Primary</span>
                <span className="font-semibold text-orange-200">{cluster.source_node}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono block opacity-50">Target Standby</span>
                <span className="font-semibold text-emerald-400">{cluster.target_node}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono block opacity-50">Lag / Sync</span>
                <span
                  className="font-bold"
                  style={{ color: cluster.status === 'SYNCHRONIZED' ? '#00B074' : '#FFB100' }}
                >
                  {cluster.replication_lag_seconds >= 0 ? `${cluster.replication_lag_seconds}s Lag` : 'N/A'} ({cluster.status})
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono block opacity-50">Cutover Strategy</span>
                <span
                  className="font-bold text-[10px] uppercase px-1.5 py-0.5 rounded"
                  style={{
                    background: cluster.classification === 'PROMOTE_LOCAL' ? 'rgba(0,176,116,0.1)' : 'rgba(255,140,0,0.1)',
                    color: cluster.classification === 'PROMOTE_LOCAL' ? '#00B074' : '#FF8800',
                  }}
                >
                  {cluster.classification}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer 4: Integration Plane View (Kafka / MQ) */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <MessageSquare className="w-4 h-4 text-purple-500" />
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Layer 4: Messaging Mirroring & Consumer group lag
          </h4>
        </div>
        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
          {layer_4_integration.channels.map((chan, i) => (
            <div
              key={i}
              className="p-2.5 rounded-[6px] grid grid-cols-2 md:grid-cols-4 gap-2 items-center"
              style={{ background: 'var(--app-bg-muted)' }}
            >
              <div>
                <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>{chan.name}</span>
                <span className="text-[10px] font-mono px-1 rounded bg-[#ffffff10] text-purple-400">{chan.type}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono block opacity-50">Mirrored Endpoints</span>
                <span className="font-mono truncate block text-[11px]">{chan.source_endpoint} ➔ {chan.target_endpoint}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono block opacity-50">Sync state</span>
                <span
                  className="font-semibold"
                  style={{ color: chan.mirror_status === 'ACTIVE' ? '#00B074' : '#FFB100' }}
                >
                  Mirroring: {chan.mirror_status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-mono block opacity-50">Lag / Status</span>
                  <span className="font-bold" style={{ color: chan.consumer_group_lag > 50 ? '#FF8800' : '#00B074' }}>
                    {chan.consumer_group_lag} messages
                  </span>
                </div>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: chan.status === 'READY' ? 'rgba(0,176,116,0.1)' : 'rgba(255,140,0,0.1)',
                    color: chan.status === 'READY' ? '#00B074' : '#FF8800',
                  }}
                >
                  {chan.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer 5: Downstream Configuration Change View */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <Network className="w-4 h-4 text-emerald-500" />
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Layer 5: Downstream configurations (DNS & Connection URLs)
          </h4>
        </div>
        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
          {layer_5_config.items.map((item, i) => (
            <div
              key={i}
              className="p-2.5 rounded-[6px] flex flex-col md:flex-row md:items-center justify-between gap-3"
              style={{ background: 'var(--app-bg-muted)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-[11px] text-emerald-400">{item.config_type}</span>
                  <span className="text-[10px] font-mono opacity-50">{item.app_id}</span>
                </div>
                <span className="font-semibold block font-mono text-[11px] truncate">{item.property_key}</span>
                <div className="flex items-center gap-2 text-[10.5px] mt-1 font-mono text-gray-400 truncate">
                  <span className="text-red-400 truncate">{item.current_value}</span>
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-emerald-400 truncate">{item.proposed_value}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                <span className="font-mono text-[10px] bg-[#ffffff08] px-1 rounded block" style={{ color: 'var(--text-disabled)' }}>
                  {item.file_path}
                </span>
                <span className="text-[10px] font-bold text-gray-300">
                  Remediation: {item.remediation.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer 6: Wave-Ordered Orchestration Graph */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <Layers className="w-4 h-4 text-yellow-500" />
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Layer 6: Wave-Ordered Orchestration Graph (Prioritized Execution)
          </h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {layer_6_waves.waves.map((wave) => (
            <div
              key={wave.wave}
              className="p-3 rounded-[6px] flex flex-col gap-3"
              style={{ background: 'var(--app-bg-muted)' }}
            >
              <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid #ffffff10' }}>
                <span className="font-bold text-[12px] text-yellow-400">Wave {wave.wave}</span>
                <span className="text-[10px] opacity-60">{wave.app_count} apps</span>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {wave.apps.map((app) => (
                  <div
                    key={app.app_id}
                    className="p-2 rounded bg-[#0a111a] flex flex-col gap-1 border border-[#ffffff05]"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[11px] truncate">{app.appName}</span>
                      <span className="text-[8.5px] font-bold px-1 rounded bg-yellow-500/10 text-yellow-500">
                        {app.tier}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[9.5px] text-gray-500">
                      <span>Effort: {app.estimatedEffort}</span>
                      <span>Complexity: {app.complexity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
