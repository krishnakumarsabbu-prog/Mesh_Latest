import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Zap, Building2, Server, Database, MessageSquare, HardDrive, Network, TriangleAlert as AlertTriangle, Shield, Activity, Cpu, Globe, Lock, RefreshCw, CircleCheck as CheckCircle2, Circle as XCircle, Brain, Clock, TrendingDown, Gauge, Layers } from 'lucide-react';
import type { DTSimulationResult } from '@/store/digitalTwinStore';

const SCENARIOS = [
  { id: 'shutdown_datacenter', label: 'Shutdown Data Center', icon: Building2, color: '#FF003C', needsTarget: true, targetLabel: 'DC Name', targetOptions: ['IBB1', 'SHV', 'GA-PRD', 'MA-PRD'] },
  { id: 'shutdown_cluster', label: 'Shutdown Cluster', icon: Server, color: '#FF6B35', needsTarget: true, targetLabel: 'Cluster Name' },
  { id: 'shutdown_namespace', label: 'Shutdown Namespace', icon: Layers, color: '#FF8800', needsTarget: true, targetLabel: 'Namespace' },
  { id: 'shutdown_oracle', label: 'Shutdown Oracle', icon: Database, color: '#F80000', needsTarget: false },
  { id: 'shutdown_mongo', label: 'Shutdown MongoDB', icon: Database, color: '#00ED64', needsTarget: false },
  { id: 'shutdown_kafka', label: 'Shutdown Kafka', icon: MessageSquare, color: '#231F20', needsTarget: false },
  { id: 'shutdown_mq', label: 'Shutdown IBM MQ', icon: MessageSquare, color: '#054ADA', needsTarget: false },
  { id: 'shutdown_redis', label: 'Shutdown Redis', icon: HardDrive, color: '#DC382D', needsTarget: false },
  { id: 'shutdown_api_gateway', label: 'Shutdown API Gateway', icon: Network, color: '#7800FF', needsTarget: false },
  { id: 'shutdown_f5', label: 'Shutdown F5 / GSLB', icon: Network, color: '#78BE20', needsTarget: false },
  { id: 'shutdown_dns', label: 'DNS Failure', icon: Globe, color: '#0EA5E9', needsTarget: false },
  { id: 'cert_expired', label: 'Certificate Expired', icon: Lock, color: '#FF003C', needsTarget: false },
  { id: 'pod_crash', label: 'Pod Crash', icon: AlertTriangle, color: '#FFB100', needsTarget: false },
  { id: 'high_cpu', label: 'High CPU Saturation', icon: Cpu, color: '#FF8800', needsTarget: false },
  { id: 'disk_full', label: 'Disk Full', icon: HardDrive, color: '#FF003C', needsTarget: false },
  { id: 'traffic_spike', label: 'Traffic Spike (10x)', icon: TrendingDown, color: '#3B82F6', needsTarget: false },
  { id: 'memory_leak', label: 'Memory Leak', icon: Activity, color: '#FF8800', needsTarget: false },
  { id: 'region_failure', label: 'Region Failure', icon: Globe, color: '#FF003C', needsTarget: false },
];

const riskColor = (risk: string) => {
  if (risk === 'CRITICAL') return '#FF003C';
  if (risk === 'HIGH') return '#FF6B35';
  if (risk === 'MEDIUM') return '#FFB100';
  return '#00B074';
};

export function SimulationPanel({
  appId,
  environment,
  simulating,
  simulationResult,
  onRun,
  onClear,
}: {
  appId: string;
  environment: string;
  simulating: boolean;
  simulationResult: DTSimulationResult | null;
  onRun: (scenario: string, target?: string) => void;
  onClear: () => void;
}) {
  const [selectedScenario, setSelectedScenario] = useState('shutdown_datacenter');
  const [target, setTarget] = useState('IBB1');

  const scenario = SCENARIOS.find((s) => s.id === selectedScenario) || SCENARIOS[0];

  const handleRun = () => {
    onRun(selectedScenario, scenario.needsTarget ? target : undefined);
  };

  return (
    <div className="flex h-full">
      {/* Left: Scenario picker */}
      <div className="w-[300px] flex flex-col border-r border-white/[0.04]">
        <div className="px-3 py-2.5 border-b border-white/[0.04]">
          <h3 className="text-[12px] font-bold flex items-center gap-2" style={{ color: '#E6EAF0' }}>
            <Zap className="w-4 h-4" style={{ color: '#FFB100' }} />
            What-If Simulation
          </h3>
          <p className="text-[10px] mt-1" style={{ color: '#667085' }}>
            Select a failure scenario to simulate blast radius
          </p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const isSelected = s.id === selectedScenario;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedScenario(s.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] transition-all text-left"
                style={{
                  background: isSelected ? `${s.color}12` : 'transparent',
                  border: `1px solid ${isSelected ? `${s.color}33` : 'transparent'}`,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: s.color }} strokeWidth={1.8} />
                <span
                  className="text-[11px] font-medium flex-1"
                  style={{ color: isSelected ? '#E6EAF0' : '#98A2B3' }}
                >
                  {s.label}
                </span>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: s.color }} />}
              </button>
            );
          })}
        </div>

        {/* Target input */}
        {scenario.needsTarget && (
          <div className="px-3 py-2.5 border-t border-white/[0.04]">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#667085' }}>
              {scenario.targetLabel}
            </label>
            {scenario.targetOptions ? (
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full mt-1.5 px-2.5 py-1.5 text-[11px] rounded-[8px] border border-white/[0.06] outline-none"
                style={{ background: 'rgba(255,255,255,0.02)', color: '#E6EAF0' }}
              >
                {scenario.targetOptions.map((opt) => (
                  <option key={opt} value={opt} style={{ background: '#121826' }}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full mt-1.5 px-2.5 py-1.5 text-[11px] rounded-[8px] border border-white/[0.06] outline-none"
                style={{ background: 'rgba(255,255,255,0.02)', color: '#E6EAF0' }}
              />
            )}
          </div>
        )}

        {/* Run button */}
        <div className="px-3 py-3 border-t border-white/[0.04]">
          <button
            onClick={handleRun}
            disabled={simulating || !appId}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] font-bold text-[12px] transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #FF003C 0%, #FF6B35 100%)',
              color: '#FFFFFF',
              boxShadow: '0 4px 16px rgba(255,0,60,0.25)',
            }}
          >
            {simulating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Simulating...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" fill="currentColor" />
                Run Simulation
              </>
            )}
          </button>
          {simulationResult && (
            <button
              onClick={onClear}
              className="w-full mt-2 text-[10px] font-medium py-1.5 rounded-[8px] transition-all"
              style={{ color: '#667085', background: 'rgba(255,255,255,0.02)' }}
            >
              Clear Results
            </button>
          )}
        </div>
      </div>

      {/* Right: Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait">
          {simulationResult ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-4"
            >
              {/* Risk header */}
              <div
                className="flex items-center justify-between p-4 rounded-[14px] border"
                style={{
                  background: `${riskColor(simulationResult.risk_level)}12`,
                  borderColor: `${riskColor(simulationResult.risk_level)}33`,
                }}
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#667085' }}>Scenario</p>
                  <p className="text-[15px] font-bold mt-0.5" style={{ color: '#E6EAF0' }}>{simulationResult.scenario_label}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#667085' }}>Risk Level</p>
                  <p className="text-[18px] font-black mt-0.5" style={{ color: riskColor(simulationResult.risk_level) }}>
                    {simulationResult.risk_level}
                  </p>
                </div>
              </div>

              {/* Impact metrics grid */}
              <div className="grid grid-cols-4 gap-2.5">
                <MetricBox icon={AlertTriangle} label="Assets Impacted" value={simulationResult.total_impacted_assets} color="#FF003C" />
                <MetricBox icon={Clock} label="RTO" value={`${simulationResult.rto_minutes}m`} color="#FFB100" />
                <MetricBox icon={RefreshCw} label="RPO" value={`${simulationResult.rpo_minutes}m`} color="#3B82F6" />
                <MetricBox icon={TrendingDown} label="Traffic Loss" value={`${simulationResult.traffic_loss_percent}%`} color="#FF6B35" />
              </div>

              {/* Failover status */}
              <div className="p-3 rounded-[12px] border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-2">
                  {simulationResult.has_failover ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: '#00B074' }} />
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: '#FF003C' }} />
                  )}
                  <span className="text-[12px] font-bold" style={{ color: '#E6EAF0' }}>
                    Failover: {simulationResult.has_failover ? 'Available' : 'Not Available'}
                  </span>
                </div>
                {simulationResult.failover_target && (
                  <p className="text-[11px]" style={{ color: '#98A2B3' }}>
                    Target: <span className="font-semibold" style={{ color: '#00B074' }}>{simulationResult.failover_target}</span>
                  </p>
                )}
                <p className="text-[11px] mt-1" style={{ color: '#98A2B3' }}>
                  Recovery: {simulationResult.estimated_recovery}
                </p>
                <p className="text-[11px]" style={{ color: '#98A2B3' }}>
                  Capacity remaining: <span className="font-semibold" style={{ color: '#E6EAF0' }}>{simulationResult.capacity_remaining}%</span>
                </p>
              </div>

              {/* Critical services */}
              {simulationResult.critical_services.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#667085' }}>Impacted Service Layers</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {simulationResult.critical_services.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 text-[10px] font-semibold rounded-full"
                        style={{ background: 'rgba(255,0,60,0.1)', color: '#FF6B7A', border: '1px solid rgba(255,0,60,0.15)' }}
                      >
                        {s.replace('_', ' ').toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {simulationResult.recommendations.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#00B074' }}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Recommendations
                  </h4>
                  <div className="space-y-1.5">
                    {simulationResult.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-[8px]" style={{ background: 'rgba(0,176,116,0.06)' }}>
                        <span className="text-[10px] font-bold mt-0.5" style={{ color: '#00B074' }}>{i + 1}</span>
                        <p className="text-[11px]" style={{ color: '#98A2B3' }}>{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blockers */}
              {simulationResult.blockers.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#FF003C' }}>
                    <XCircle className="w-3.5 h-3.5" />
                    Blockers
                  </h4>
                  <div className="space-y-1.5">
                    {simulationResult.blockers.map((b, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-[8px]" style={{ background: 'rgba(255,0,60,0.06)' }}>
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#FF003C' }} />
                        <p className="text-[11px]" style={{ color: '#FF6B7A' }}>{b}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Explanation */}
              <div className="p-3.5 rounded-[12px] border" style={{ background: 'rgba(168,85,247,0.06)', borderColor: 'rgba(168,85,247,0.15)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4" style={{ color: '#A855F7' }} />
                  <h4 className="text-[11px] font-bold" style={{ color: '#A855F7' }}>AI Explanation</h4>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: '#98A2B3' }}>
                  {simulationResult.ai_explanation}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full p-8 text-center"
            >
              <div
                className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-4"
                style={{ background: 'rgba(255,177,0,0.08)' }}
              >
                <Zap className="w-8 h-8" style={{ color: '#FFB100' }} />
              </div>
              <h3 className="text-[14px] font-bold mb-1" style={{ color: '#E6EAF0' }}>No Simulation Yet</h3>
              <p className="text-[11px] max-w-[280px]" style={{ color: '#667085' }}>
                Select a failure scenario from the left and click "Run Simulation" to see the blast radius analysis with AI-powered explanations.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MetricBox({
  icon: Icon, label, value, color,
}: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center p-3 rounded-[10px] border border-white/[0.05]"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <Icon className="w-4 h-4 mb-1.5" style={{ color }} strokeWidth={2} />
      <p className="text-[16px] font-black" style={{ color }}>{value}</p>
      <p className="text-[9px] font-medium uppercase tracking-wider mt-0.5" style={{ color: '#667085' }}>{label}</p>
    </div>
  );
}
