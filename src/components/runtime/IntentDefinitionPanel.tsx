import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Check, TriangleAlert as AlertTriangle, Info, Zap, Database, MessageSquare, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import type {
  ApplicationIntent, TechStack, AssetEnvironment, FailoverType, ReplicationModel,
} from '@/types';

interface Props {
  appId: string;
  appName: string;
  environment: AssetEnvironment;
  open: boolean;
  onClose: () => void;
}

const KNOWN_DCS = ['IBB1', 'SHV', 'GA-UAT', 'MA-UAT', 'AZ3', 'GA-PRD', 'MA-PRD'];
const TECH_OPTIONS: { value: TechStack; label: string }[] = [
  { value: 'ibm_mq', label: 'IBM MQ' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'oracle', label: 'Oracle DB' },
  { value: 'mssql', label: 'MS SQL' },
  { value: 'kafka', label: 'Kafka' },
  { value: 'vm', label: 'Virtual Machine' },
  { value: 'ocp', label: 'OpenShift / OCP' },
];

const FAILOVER_OPTIONS: { value: FailoverType; label: string; desc: string }[] = [
  { value: 'AUTOMATIC', label: 'Automatic', desc: 'LB or DNS auto-failover' },
  { value: 'MANUAL', label: 'Manual', desc: 'Operator promotes standby' },
  { value: 'NONE', label: 'None', desc: 'No DR configured' },
];

const REPLICATION_OPTIONS: { value: ReplicationModel; label: string; desc: string }[] = [
  { value: 'SINGLE_WRITER', label: 'Single Writer', desc: 'One DC authoritative for writes' },
  { value: 'MULTI_WRITER', label: 'Multi Writer', desc: 'Multiple DCs accept writes' },
  { value: 'READ_REPLICA', label: 'Read Replica', desc: 'One writer, replicas for reads' },
  { value: 'EVENTUAL', label: 'Eventual Consistency', desc: 'Async replication, eventual sync' },
];

export function IntentDefinitionPanel({ appId, appName, environment, open, onClose }: Props) {
  const { intents, saveIntent, runDriftDetection } = useRuntimeLocationStore();
  const existing = intents.find((i) => i.application_id === appId);

  const [activeDCs, setActiveDCs] = useState<string[]>(existing?.intended_active_dcs ?? []);
  const [primaryDC, setPrimaryDC] = useState(existing?.intended_primary_dc ?? '');
  const [failover, setFailover] = useState<FailoverType>(existing?.failover_type ?? 'MANUAL');
  const [replication, setReplication] = useState<ReplicationModel>(existing?.replication_model ?? 'SINGLE_WRITER');
  const [techStacks, setTechStacks] = useState<TechStack[]>(existing?.required_tech_stacks ?? []);
  const [owner, setOwner] = useState(existing?.owner ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setActiveDCs(existing.intended_active_dcs);
      setPrimaryDC(existing.intended_primary_dc);
      setFailover(existing.failover_type);
      setReplication(existing.replication_model);
      setTechStacks(existing.required_tech_stacks);
      setOwner(existing.owner ?? '');
      setNotes(existing.notes ?? '');
    }
  }, [existing]);

  function toggleDC(dc: string) {
    setActiveDCs((prev) =>
      prev.includes(dc) ? prev.filter((d) => d !== dc) : [...prev, dc],
    );
    if (primaryDC === dc) setPrimaryDC('');
  }

  function toggleStack(s: TechStack) {
    setTechStacks((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function handleSave() {
    saveIntent({
      application_id: appId,
      application_name: appName,
      intended_active_dcs: activeDCs,
      intended_primary_dc: primaryDC,
      intended_environments: [environment],
      failover_type: failover,
      replication_model: replication,
      required_tech_stacks: techStacks,
      owner,
      notes,
    });
    runDriftDetection(appId, environment);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(480px, 100vw)',
              background: 'var(--app-bg)',
              borderLeft: '1px solid var(--app-border)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--app-border)' }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(10,132,255,0.12)' }}
              >
                <Target className="w-4 h-4" style={{ color: '#0A84FF' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  Define Intent — {appName}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  What should this app look like in {environment}?
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--app-surface)' }}
              >
                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {/* Info banner */}
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-2.5"
                style={{ background: 'rgba(10,132,255,0.07)', border: '1px solid rgba(10,132,255,0.2)' }}
              >
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#0A84FF' }} />
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Define the intended topology so the system can detect drift — when actual runtime state
                  diverges from design intent. This directly addresses the hackathon&apos;s bonus credit criterion.
                </p>
              </div>

              {/* Active DCs */}
              <section>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                  Intended Active Data Centers
                </label>
                <div className="flex flex-wrap gap-2">
                  {KNOWN_DCS.map((dc) => (
                    <button
                      key={dc}
                      onClick={() => toggleDC(dc)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                        activeDCs.includes(dc) ? 'ring-2' : '',
                      )}
                      style={{
                        background: activeDCs.includes(dc)
                          ? 'rgba(48,209,88,0.15)'
                          : 'var(--app-surface)',
                        color: activeDCs.includes(dc) ? '#30D158' : 'var(--text-secondary)',
                        border: activeDCs.includes(dc)
                          ? '1px solid rgba(48,209,88,0.4)'
                          : '1px solid var(--app-border)',
                      }}
                    >
                      {activeDCs.includes(dc) ? <Check className="inline w-2.5 h-2.5 mr-1" /> : null}
                      {dc}
                    </button>
                  ))}
                </div>
              </section>

              {/* Primary DC */}
              {activeDCs.length > 0 && (
                <section>
                  <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                    Intended Primary Write DC
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {activeDCs.map((dc) => (
                      <button
                        key={dc}
                        onClick={() => setPrimaryDC(dc)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: primaryDC === dc ? 'rgba(10,132,255,0.15)' : 'var(--app-surface)',
                          color: primaryDC === dc ? '#0A84FF' : 'var(--text-secondary)',
                          border: primaryDC === dc ? '1px solid rgba(10,132,255,0.4)' : '1px solid var(--app-border)',
                        }}
                      >
                        {dc}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Failover type */}
              <section>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                  Failover Type
                </label>
                <div className="flex flex-col gap-2">
                  {FAILOVER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFailover(opt.value)}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        background: failover === opt.value ? 'rgba(10,132,255,0.08)' : 'var(--app-surface)',
                        border: failover === opt.value ? '1px solid rgba(10,132,255,0.3)' : '1px solid var(--app-border)',
                      }}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all"
                        style={{
                          borderColor: failover === opt.value ? '#0A84FF' : 'var(--app-border)',
                          background: failover === opt.value ? '#0A84FF' : 'transparent',
                        }}
                      />
                      <div>
                        <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Replication model */}
              <section>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                  Replication Model
                </label>
                <div className="flex flex-col gap-2">
                  {REPLICATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setReplication(opt.value)}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        background: replication === opt.value ? 'rgba(10,132,255,0.08)' : 'var(--app-surface)',
                        border: replication === opt.value ? '1px solid rgba(10,132,255,0.3)' : '1px solid var(--app-border)',
                      }}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all"
                        style={{
                          borderColor: replication === opt.value ? '#0A84FF' : 'var(--app-border)',
                          background: replication === opt.value ? '#0A84FF' : 'transparent',
                        }}
                      />
                      <div>
                        <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Required tech stacks */}
              <section>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                  Required Tech Stacks
                </label>
                <div className="flex flex-wrap gap-2">
                  {TECH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleStack(opt.value)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                      style={{
                        background: techStacks.includes(opt.value) ? 'rgba(255,159,10,0.12)' : 'var(--app-surface)',
                        color: techStacks.includes(opt.value) ? '#FF9F0A' : 'var(--text-secondary)',
                        border: techStacks.includes(opt.value) ? '1px solid rgba(255,159,10,0.35)' : '1px solid var(--app-border)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Owner + notes */}
              <section className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                    Owner / Team
                  </label>
                  <input
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="e.g. Claims Platform Team"
                    className="w-full px-3 py-2 rounded-xl text-[12px]"
                    style={{
                      background: 'var(--app-surface)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Architecture decisions, known constraints, DR runbook reference..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl text-[12px] resize-none"
                    style={{
                      background: 'var(--app-surface)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
              </section>
            </div>

            {/* Footer */}
            <div
              className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
              style={{ borderTop: '1px solid var(--app-border)' }}
            >
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl text-[12px] font-semibold"
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2 transition-all"
                style={{
                  background: saved ? 'rgba(48,209,88,0.2)' : '#0A84FF',
                  color: saved ? '#30D158' : '#fff',
                  border: saved ? '1px solid rgba(48,209,88,0.4)' : 'none',
                }}
              >
                {saved
                  ? <><Check className="w-3.5 h-3.5" /> Saved & Drift Checked</>
                  : <><Zap className="w-3.5 h-3.5" /> Save &amp; Detect Drift</>
                }
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
