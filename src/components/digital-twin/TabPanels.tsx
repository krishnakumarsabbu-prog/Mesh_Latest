import { motion } from 'framer-motion';
import { Box, Server, Cpu, HardDrive, Database, MessageSquare, Network, ShieldCheck, Activity, Layers, Briefcase, Globe, Zap, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Clock, TrendingUp, Lock, KeyRound, FileCheck, Eye, GitBranch, MapPin, Gauge, Circle } from 'lucide-react';
import type { DTNode, DTEdge, DTHero, DTProperties } from '@/store/digitalTwinStore';

const PANEL_STYLE = 'flex flex-col h-full overflow-y-auto scrollbar-thin';

function PanelHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.04] flex-shrink-0">
      <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
        <Icon className="w-4 h-4" style={{ color: '#3B82F6' }} strokeWidth={2} />
      </div>
      <div>
        <h3 className="text-[13px] font-bold" style={{ color: '#E6EAF0' }}>{title}</h3>
        <p className="text-[10px]" style={{ color: '#667085' }}>{subtitle}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: React.ElementType }) {
  return (
    <div className="rounded-[12px] border border-white/[0.05] p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#667085' }}>{label}</span>
      </div>
      <p className="text-[18px] font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function NodeRow({ node, onClick }: { node: DTNode; onClick?: () => void }) {
  const statusColor = node.status === 'healthy' ? '#00B074' : node.status === 'degraded' ? '#FFB100' : node.status === 'down' ? '#FF003C' : '#8A97A8';
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] border border-white/[0.04] hover:border-white/[0.1] transition-all cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.015)' }}
      onClick={onClick}
    >
      <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: `${node.color}18` }}>
        <Circle className="w-3.5 h-3.5" style={{ color: node.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold truncate" style={{ color: '#E6EAF0' }}>{node.label}</p>
        <p className="text-[10px]" style={{ color: '#667085' }}>{node.type.replace(/_/g, ' ')}</p>
      </div>
      {node.tech_stack && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>{node.tech_stack}</span>}
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
    </div>
  );
}

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, delay },
});

// ─── Dependencies Panel ───────────────────────────────────────────────────────

export function DependenciesPanel({ nodes, edges, onSelectNode }: {
  nodes: DTNode[]; edges: DTEdge[]; onSelectNode: (id: string) => void;
}) {
  const dependencies = edges.map((e) => {
    const source = nodes.find((n) => n.id === e.source);
    const target = nodes.find((n) => n.id === e.target);
    return { edge: e, source, target };
  }).filter((d) => d.source && d.target);

  return (
    <div className={PANEL_STYLE}>
      <PanelHeader icon={Box} title="Dependencies" subtitle={`${dependencies.length} dependency relationships`} />
      <div className="p-3 space-y-2">
        {dependencies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Box className="w-8 h-8 mb-2 opacity-20" style={{ color: '#667085' }} />
            <p className="text-[12px]" style={{ color: '#667085' }}>No dependency data</p>
          </div>
        ) : (
          dependencies.map(({ edge, source, target }, i) => (
            <motion.div key={edge.id} {...fade(i * 0.02)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] border border-white/[0.04]"
              style={{ background: 'rgba(255,255,255,0.015)' }}
            >
              <button onClick={() => source && onSelectNode(source.id)} className="flex-1 text-left min-w-0">
                <p className="text-[11px] font-semibold truncate" style={{ color: '#E6EAF0' }}>{source!.label}</p>
                <p className="text-[9px]" style={{ color: '#667085' }}>{source!.type.replace(/_/g, ' ')}</p>
              </button>
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <GitBranch className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
                <span className="text-[8px] font-medium" style={{ color: '#667085' }}>{edge.label}</span>
              </div>
              <button onClick={() => target && onSelectNode(target.id)} className="flex-1 text-left min-w-0">
                <p className="text-[11px] font-semibold truncate" style={{ color: '#E6EAF0' }}>{target!.label}</p>
                <p className="text-[9px]" style={{ color: '#667085' }}>{target!.type.replace(/_/g, ' ')}</p>
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Infrastructure Panel ──────────────────────────────────────────────────────

export function InfrastructurePanel({ nodes, onSelectNode }: { nodes: DTNode[]; onSelectNode: (id: string) => void }) {
  const infraTypes = ['DATACENTER', 'DATABASE', 'MESSAGING', 'COMPUTE', 'LOAD_BALANCER', 'STORAGE', 'BATCH'];
  const infraNodes = nodes.filter((n) => infraTypes.includes(n.type));

  return (
    <div className={PANEL_STYLE}>
      <PanelHeader icon={Server} title="Infrastructure" subtitle={`${infraNodes.length} infrastructure assets`} />
      <div className="p-3 grid grid-cols-3 gap-2 mb-3">
        <StatCard label="Datacenters" value={nodes.filter((n) => n.type === 'DATACENTER').length} color="#3B82F6" icon={Globe} />
        <StatCard label="Databases" value={nodes.filter((n) => n.type === 'DATABASE').length} color="#10B981" icon={Database} />
        <StatCard label="Compute" value={nodes.filter((n) => n.type === 'COMPUTE').length} color="#8B5CF6" icon={Cpu} />
      </div>
      <div className="px-3 space-y-2">
        {infraNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Server className="w-8 h-8 mb-2 opacity-20" style={{ color: '#667085' }} />
            <p className="text-[12px]" style={{ color: '#667085' }}>No infrastructure data</p>
          </div>
        ) : (
          infraNodes.map((node, i) => (
            <motion.div key={node.id} {...fade(i * 0.02)}>
              <NodeRow node={node} onClick={() => onSelectNode(node.id)} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Runtime Panel ──────────────────────────────────────────────────────────────

export function RuntimePanel({ nodes, hero, onSelectNode }: {
  nodes: DTNode[]; hero: DTHero | null; onSelectNode: (id: string) => void;
}) {
  const runtimeNodes = nodes.filter((n) => ['COMPUTE', 'DATABASE', 'MESSAGING', 'STORAGE', 'LOAD_BALANCER'].includes(n.type));
  const activeCount = runtimeNodes.filter((n) => n.operational_state === 'ACTIVE').length;
  const standbyCount = runtimeNodes.filter((n) => n.operational_state === 'STANDBY').length;

  return (
    <div className={PANEL_STYLE}>
      <PanelHeader icon={Cpu} title="Runtime" subtitle="Live runtime state & operational status" />
      <div className="p-3 grid grid-cols-3 gap-2 mb-3">
        <StatCard label="Active" value={activeCount} color="#00B074" icon={CheckCircle} />
        <StatCard label="Standby" value={standbyCount} color="#FFB100" icon={Clock} />
        <StatCard label="Total" value={runtimeNodes.length} color="#3B82F6" icon={Cpu} />
      </div>
      {hero && (
        <div className="px-3 mb-3">
          <div className="rounded-[12px] border border-white/[0.05] p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Runtime Truth</span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: '#E6EAF0' }}>{hero.runtime_truth}</p>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: hero.alignment_status === 'ALIGNED' ? '#00B074' : '#FFB100' }} />
                <span className="text-[10px] font-medium" style={{ color: '#667085' }}>{hero.alignment_status}</span>
              </div>
              <span className="text-[10px]" style={{ color: '#667085' }}>Confidence: {hero.confidence_score}/100</span>
            </div>
          </div>
        </div>
      )}
      <div className="px-3 space-y-2">
        {runtimeNodes.map((node, i) => (
          <motion.div key={node.id} {...fade(i * 0.02)}>
            <NodeRow node={node} onClick={() => onSelectNode(node.id)} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Business Panel ─────────────────────────────────────────────────────────────

export function BusinessPanel({ hero, properties }: { hero: DTHero | null; properties: DTProperties | null }) {
  return (
    <div className={PANEL_STYLE}>
      <PanelHeader icon={Briefcase} title="Business" subtitle="Business capability & alignment" />
      <div className="p-3 space-y-3">
        {hero ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Health Score" value={`${hero.health_score}/100`} color={hero.health_score >= 80 ? '#00B074' : hero.health_score >= 50 ? '#FFB100' : '#FF003C'} icon={Activity} />
              <StatCard label="Traffic RPM" value={hero.traffic_rpm.toLocaleString()} color="#3B82F6" icon={TrendingUp} />
            </div>
            <div className="rounded-[12px] border border-white/[0.05] p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#667085' }}>Business Capability</span>
                <span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{hero.business_capability}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#667085' }}>Line of Business</span>
                <span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{hero.lob}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#667085' }}>Owner</span>
                <span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{hero.owner}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#667085' }}>Criticality</span>
                <span className="text-[11px] font-semibold" style={{ color: hero.criticality === 'CRITICAL' ? '#FF003C' : hero.criticality === 'HIGH' ? '#FFB100' : '#00B074' }}>{hero.criticality}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#667085' }}>Version</span>
                <span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{hero.version}</span>
              </div>
            </div>
            <div className="rounded-[12px] border border-white/[0.05] p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Data Centers</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hero.data_centers.map((dc) => (
                  <span key={dc} className="px-2.5 py-1 text-[10px] font-semibold rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.15)' }}>{dc}</span>
                ))}
              </div>
            </div>
            {properties?.intent && (
              <div className="rounded-[12px] border border-white/[0.05] p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Intent & Alignment</span>
                </div>
                <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Primary DC</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.intent.intended_primary_dc || 'N/A'}</span></div>
                <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Active DCs</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.intent.intended_active_dcs.join(', ')}</span></div>
                <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Failover</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.intent.failover_type}</span></div>
                <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Alignment</span><span className="text-[11px] font-semibold" style={{ color: properties.intent.alignment_status === 'ALIGNED' ? '#00B074' : '#FFB100' }}>{properties.intent.alignment_status}</span></div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <Briefcase className="w-8 h-8 mb-2 opacity-20" style={{ color: '#667085' }} />
            <p className="text-[12px]" style={{ color: '#667085' }}>No business data</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Observability Panel ────────────────────────────────────────────────────────

export function ObservabilityPanel({ nodes, properties, onSelectNode }: {
  nodes: DTNode[]; properties: DTProperties | null; onSelectNode: (id: string) => void;
}) {
  const obsNodes = nodes.filter((n) => n.type === 'OBSERVABILITY' || n.type === 'SECURITY');
  return (
    <div className={PANEL_STYLE}>
      <PanelHeader icon={Activity} title="Observability" subtitle="Monitoring, metrics & alerting" />
      <div className="p-3 space-y-3">
        {properties && (
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Health Score" value={`${properties.health.score}/100`} color={properties.health.score >= 80 ? '#00B074' : '#FFB100'} icon={Gauge} />
            <StatCard label="Active Alerts" value={properties.health.active_alerts} color={properties.health.active_alerts > 0 ? '#FFB100' : '#00B074'} icon={AlertTriangle} />
            <StatCard label="Open Incidents" value={properties.health.open_incidents} color={properties.health.open_incidents > 0 ? '#FF003C' : '#00B074'} icon={Zap} />
            <StatCard label="Error Rate" value={`${properties.traffic.error_rate}%`} color={properties.traffic.error_rate > 0.3 ? '#FF003C' : '#00B074'} icon={TrendingUp} />
          </div>
        )}
        {properties && (
          <div className="rounded-[12px] border border-white/[0.05] p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Traffic Metrics</span>
            </div>
            <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Requests/min</span><span className="text-[11px] font-semibold" style={{ color: '#3B82F6' }}>{properties.traffic.rpm.toLocaleString()}</span></div>
            <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Avg Latency</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.traffic.avg_latency_ms} ms</span></div>
            <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>P95 Latency</span><span className="text-[11px] font-semibold" style={{ color: '#FFB100' }}>{properties.traffic.p95_latency_ms} ms</span></div>
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 px-1 py-2">
            <Eye className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Monitoring Nodes</span>
          </div>
          <div className="space-y-2">
            {obsNodes.length === 0 ? (
              <p className="text-[11px] px-3 py-4 text-center" style={{ color: '#667085' }}>No observability nodes</p>
            ) : (
              obsNodes.map((node, i) => (
                <motion.div key={node.id} {...fade(i * 0.02)}>
                  <NodeRow node={node} onClick={() => onSelectNode(node.id)} />
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Security Panel ──────────────────────────────────────────────────────────────

export function SecurityPanel({ nodes, properties, onSelectNode }: {
  nodes: DTNode[]; properties: DTProperties | null; onSelectNode: (id: string) => void;
}) {
  const secNodes = nodes.filter((n) => n.type === 'SECURITY');
  return (
    <div className={PANEL_STYLE}>
      <PanelHeader icon={ShieldCheck} title="Security" subtitle="Security posture & compliance" />
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Vault Status" value={nodes.find((n) => n.vault_status)?.vault_status || 'N/A'} color="#00B074" icon={Lock} />
          <StatCard label="Secrets" value={nodes.reduce((acc, n) => acc + (n.secrets_count || 0), 0)} color="#FFB100" icon={KeyRound} />
          <StatCard label="Cert Expiry" value={nodes.find((n) => n.cert_expiry)?.cert_expiry || 'N/A'} color="#3B82F6" icon={FileCheck} />
        </div>
        {properties && (
          <div className="rounded-[12px] border border-white/[0.05] p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Access & Compliance</span>
            </div>
            <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Owner</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.owner}</span></div>
            <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>Support Team</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.support_team}</span></div>
            <div className="flex items-center justify-between"><span className="text-[10px]" style={{ color: '#667085' }}>CI/CD</span><span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{properties.ci_cd}</span></div>
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 px-1 py-2">
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Security Nodes</span>
          </div>
          <div className="space-y-2">
            {secNodes.length === 0 ? (
              <p className="text-[11px] px-3 py-4 text-center" style={{ color: '#667085' }}>No security nodes</p>
            ) : (
              secNodes.map((node, i) => (
                <motion.div key={node.id} {...fade(i * 0.02)}>
                  <NodeRow node={node} onClick={() => onSelectNode(node.id)} />
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Knowledge Graph Full Panel ─────────────────────────────────────────────────

export function KnowledgeFullPanel({ nodes, edges, selectedNodeId, impactedNodeIds, onSelectNode }: {
  nodes: DTNode[]; edges: DTEdge[]; selectedNodeId: string | null;
  impactedNodeIds: string[]; onSelectNode: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <PanelHeader icon={Network} title="Knowledge Graph" subtitle={`${nodes.length} nodes · ${edges.length} edges`} />
      <div className="flex-1 overflow-hidden">
        <KnowledgeGraphPanel
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          impactedNodeIds={impactedNodeIds}
          onSelectNode={onSelectNode}
        />
      </div>
    </div>
  );
}

// Re-export for convenience
import { KnowledgeGraphPanel } from '@/components/digital-twin/KnowledgeGraphPanel';
