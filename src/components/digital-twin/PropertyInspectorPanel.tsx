import { motion } from 'framer-motion';
import { AppWindow, Server, Database, ShieldCheck, Activity, Cpu, HardDrive, TrendingUp, TriangleAlert as AlertTriangle, GitBranch, ExternalLink, FileText, BookOpen, Wrench, Clock } from 'lucide-react';
import type { DTNode, DTProperties } from '@/store/digitalTwinStore';

const typeIcon: Record<string, React.ElementType> = {
  APPLICATION: AppWindow,
  DATABASE: Database,
  MESSAGING: Server,
  COMPUTE: Cpu,
  DATACENTER: Server,
  LOAD_BALANCER: Server,
  STORAGE: HardDrive,
  SECURITY: ShieldCheck,
  OBSERVABILITY: Activity,
};

const confidenceColor = (score: number) => {
  if (score >= 85) return '#00B074';
  if (score >= 60) return '#FFB100';
  if (score >= 35) return '#FF8800';
  return '#FF003C';
};

function PropertyRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-[6px] hover:bg-white/[0.02] transition-all">
      <span className="text-[10.5px] font-medium" style={{ color: '#667085' }}>{label}</span>
      <span className="text-[11px] font-semibold" style={{ color: color || '#E6EAF0' }}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
      <Icon className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
      <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>{title}</h4>
    </div>
  );
}

export function PropertyInspectorPanel({
  properties,
  selectedNode,
}: {
  properties: DTProperties | null;
  selectedNode: DTNode | null;
}) {
  if (!properties && !selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AppWindow className="w-8 h-8 mb-3 opacity-20" style={{ color: '#667085' }} />
        <p className="text-[12px] font-medium" style={{ color: '#667085' }}>Select a node to inspect</p>
        <p className="text-[10px] mt-1" style={{ color: '#475467' }}>Click any node in the knowledge graph to see its properties</p>
      </div>
    );
  }

  const props = properties;
  const Icon = selectedNode ? (typeIcon[selectedNode.type] || Server) : AppWindow;
  const title = selectedNode?.label || props?.name || 'Application';
  const nodeType = selectedNode?.type || props?.node_type || 'APPLICATION';

  return (
    <motion.div
      key={selectedNode?.id || 'default'}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col h-full overflow-y-auto scrollbar-thin"
    >
      {/* Header */}
      <div className="px-3 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: `${selectedNode?.color || '#3B82F6'}18` }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color: selectedNode?.color || '#3B82F6' }} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-bold truncate" style={{ color: '#E6EAF0' }}>{title}</h3>
            <p className="text-[10px] font-medium" style={{ color: '#667085' }}>{nodeType}</p>
          </div>
          {selectedNode?.status && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: selectedNode.status === 'healthy' ? '#00B074' : selectedNode.status === 'degraded' ? '#FFB100' : '#FF003C' }}
            />
          )}
        </div>
      </div>

      {/* Node-specific properties */}
      {selectedNode && selectedNode.type !== 'APPLICATION' && (
        <div>
          <SectionTitle icon={Server} title="Properties" />
          {selectedNode.tech_stack && <PropertyRow label="Tech Stack" value={selectedNode.tech_stack} />}
          {selectedNode.host && <PropertyRow label="Host" value={selectedNode.host} />}
          {selectedNode.port && <PropertyRow label="Port" value={selectedNode.port} />}
          {selectedNode.environment && <PropertyRow label="Environment" value={selectedNode.environment} />}
          {selectedNode.operational_state && (
            <PropertyRow
              label="Operational State"
              value={selectedNode.operational_state}
              color={selectedNode.operational_state === 'ACTIVE' ? '#00B074' : '#FFB100'}
            />
          )}
          {selectedNode.replication_role && selectedNode.replication_role !== 'NONE' && (
            <PropertyRow label="Replication Role" value={selectedNode.replication_role} />
          )}
          {selectedNode.write_authority !== undefined && (
            <PropertyRow
              label="Write Authority"
              value={selectedNode.write_authority ? 'YES' : 'NO'}
              color={selectedNode.write_authority ? '#00B074' : '#667085'}
            />
          )}
          {selectedNode.confidence_score !== undefined && (
            <PropertyRow
              label="Confidence Score"
              value={`${selectedNode.confidence_score}/100`}
              color={confidenceColor(selectedNode.confidence_score)}
            />
          )}
          {selectedNode.data_source && <PropertyRow label="Data Source" value={selectedNode.data_source} />}
          {selectedNode.last_seen_at && <PropertyRow label="Last Seen" value={selectedNode.last_seen_at.slice(0, 19).replace('T', ' ')} />}
        </div>
      )}

      {/* Application properties */}
      {props && (!selectedNode || selectedNode.type === 'APPLICATION') && (
        <>
          {/* Metadata */}
          <div>
            <SectionTitle icon={AppWindow} title="Metadata" />
            <PropertyRow label="Environment" value={props.environment} />
            <PropertyRow label="Version" value={props.version} />
            <PropertyRow label="Owner" value={props.owner} />
            <PropertyRow label="Support Team" value={props.support_team} />
            <PropertyRow label="CI/CD" value={props.ci_cd} />
          </div>

          {/* Resources */}
          <div>
            <SectionTitle icon={Cpu} title="Resources" />
            <PropertyRow label="CPU Cores" value={props.resources.cpu_cores} color="#3B82F6" />
            <PropertyRow label="Memory" value={`${props.resources.memory_gb} GB`} color="#8B5CF6" />
            <PropertyRow label="Storage" value={`${props.resources.storage_tb} TB`} color="#EAB308" />
          </div>

          {/* Traffic */}
          <div>
            <SectionTitle icon={TrendingUp} title="Traffic" />
            <PropertyRow label="Requests/min" value={props.traffic.rpm.toLocaleString()} color="#3B82F6" />
            <PropertyRow label="Avg Latency" value={`${props.traffic.avg_latency_ms} ms`} />
            <PropertyRow label="P95 Latency" value={`${props.traffic.p95_latency_ms} ms`} color="#FFB100" />
            <PropertyRow label="Error Rate" value={`${props.traffic.error_rate}%`} color={props.traffic.error_rate > 0.3 ? '#FF003C' : '#00B074'} />
          </div>

          {/* Health */}
          <div>
            <SectionTitle icon={Activity} title="Health" />
            <PropertyRow
              label="Health Score"
              value={`${props.health.score}/100`}
              color={confidenceColor(props.health.score)}
            />
            <PropertyRow label="Active Alerts" value={props.health.active_alerts} color={props.health.active_alerts > 0 ? '#FFB100' : '#00B074'} />
            <PropertyRow label="Open Incidents" value={props.health.open_incidents} color={props.health.open_incidents > 0 ? '#FF003C' : '#00B074'} />
          </div>

          {/* Intent */}
          {props.intent && (
            <div>
              <SectionTitle icon={ShieldCheck} title="Intent & Alignment" />
              <PropertyRow label="Primary DC" value={props.intent.intended_primary_dc || 'N/A'} />
              <PropertyRow label="Active DCs" value={props.intent.intended_active_dcs.join(', ')} />
              <PropertyRow label="Failover Type" value={props.intent.failover_type} />
              <PropertyRow label="Replication" value={props.intent.replication_model} />
              <PropertyRow
                label="Alignment"
                value={props.intent.alignment_status}
                color={props.intent.alignment_status === 'ALIGNED' ? '#00B074' : '#FFB100'}
              />
            </div>
          )}

          {/* Links */}
          <div>
            <SectionTitle icon={ExternalLink} title="Links" />
            <a href={props.git_repository} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] hover:bg-white/[0.02] transition-all">
              <GitBranch className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
              <span className="text-[11px] font-medium" style={{ color: '#3B82F6' }}>Git Repository</span>
            </a>
            <a href={props.runbook} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] hover:bg-white/[0.02] transition-all">
              <Wrench className="w-3.5 h-3.5" style={{ color: '#FFB100' }} />
              <span className="text-[11px] font-medium" style={{ color: '#3B82F6' }}>Runbook</span>
            </a>
            <a href={props.documentation} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] hover:bg-white/[0.02] transition-all">
              <BookOpen className="w-3.5 h-3.5" style={{ color: '#00B074' }} />
              <span className="text-[11px] font-medium" style={{ color: '#3B82F6' }}>Documentation</span>
            </a>
          </div>

          {/* Tags */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex flex-wrap gap-1.5">
              {props.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[9px] font-semibold rounded-full"
                  style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.15)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
