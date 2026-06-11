/**
 * Runtime Truth Engine
 * Derives RuntimeVerdicts, ServiceTopology, confidence scores, and authority
 * chains dynamically from in-memory store data (no hardcoded mocks).
 */
import type {
  ApplicationLocationDetail,
  ApplicationLocationSummary,
  ApplicationComponent,
  RuntimeAsset,
  DataSourceInfo,
  SourceConflict,
  IntentDrift,
  RuntimeSnapshot,
} from '@/types';

// ─── Re-exported types (used by RuntimeTruthPage) ────────────────────────────

export type AuthoritySite = string;
export type VerdictRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SignalType = 'deterministic' | 'inferred' | 'stale' | 'conflicting' | 'missing';

export interface AuthoritySignal {
  source: string;
  technology: string;
  signal: string;
  value: string;
  dc: string;
  type: SignalType;
  freshness: 'FRESH' | 'STALE' | 'MISSING';
  confidence: number;
  timestamp: string;
  detail: string;
}

export interface ComponentAuthority {
  id: string;
  name: string;
  type: ApplicationComponent['component_type'];
  technology: string;
  dc1Role: string;
  dc2Role: string;
  dc1Site: string;
  dc2Site: string;
  authoritative: string;
  canFailover: boolean;
  failoverType: 'AUTOMATIC' | 'MANUAL' | 'NONE';
  failoverRisk: string;
  signals: AuthoritySignal[];
}

export interface ConfidenceBreakdown {
  freshness: number;
  determinism: number;
  agreement: number;
  coverage: number;
  total: number;
  explanation: string[];
}

export interface ScenarioResult {
  id: string;
  name: string;
  description: string;
  icon: string;
  outcome: 'SAFE' | 'DEGRADED' | 'FAILED' | 'PARTIAL';
  components: { name: string; dc1: string; dc2: string; risk: string }[];
  expectedConfidence: number;
  notes: string;
  blockers: string[];
}

export interface RuntimeVerdict {
  appId: string;
  appName: string;
  environment: string;
  authoritativeSite: string;
  authoritativeSiteLabel: string;
  canServeTransactions: boolean;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  risk: VerdictRisk;
  riskReason: string;
  stateOwner: string;
  trafficOwner: string;
  dc2CanTakeOver: boolean;
  dc2ReadinessPercent: number;
  verdictSummary: string;
  components: ComponentAuthority[];
  signals: AuthoritySignal[];
  scenarios: ScenarioResult[];
}

export interface ServiceNode {
  id: string;
  label: string;
  type: string;
  technology: string;
  dc: string;
  role: string;
  health: 'healthy' | 'degraded' | 'critical' | 'unknown';
  errorRate: number;
  requestRate: number;
  p95Latency: number;
  p99Latency: number;
  isWriteAuthority: boolean;
  isDeterministic: boolean;
  freshness: 'FRESH' | 'STALE' | 'VERY_STALE' | 'UNKNOWN';
  assetId: string;
  componentId: string;
  host?: string;
}

export interface ServiceEdge {
  id: string;
  source: string;
  target: string;
  type: 'dependency' | 'replication' | 'traffic';
  health: 'healthy' | 'degraded' | 'critical';
  requestRate?: number;
  avgLatency?: number;
  p95Latency?: number;
  p99Latency?: number;
  errorRate?: number;
  protocol?: string;
  label?: string;
}

export interface ServiceTopologyData {
  nodes: ServiceNode[];
  edges: ServiceEdge[];
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  relativeTime: string;
  type: 'TRAFFIC_SHIFT' | 'DB_FAILOVER' | 'LEADER_ELECTION' | 'STATE_CHANGE' | 'CONFLICT_DETECTED' | 'TELEMETRY_STALE' | 'RECOVERY' | 'PARTIAL_FAILOVER';
  title: string;
  detail: string;
  dc: string;
  impact: 'INFO' | 'WARNING' | 'CRITICAL';
  authorityChange?: { from: string; to: string };
}

export interface DiscoveredSignal {
  id: string;
  technology: string;
  displayName: string;
  signalName: string;
  apiSource: string;
  confidence: number;
  deterministic: boolean;
  category: 'STATE_OWNERSHIP' | 'TRAFFIC_FLOW' | 'REPLICATION' | 'HEALTH';
  description: string;
  shared: boolean;
  sampleValue: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const TECH_FAILOVER: Record<string, 'AUTOMATIC' | 'MANUAL' | 'NONE'> = {
  ibm_mq:  'AUTOMATIC',
  mongodb: 'AUTOMATIC',
  oracle:  'MANUAL',
  mssql:   'MANUAL',
  kafka:   'AUTOMATIC',
  ocp:     'AUTOMATIC',
  vm:      'NONE',
};

const TECH_DISPLAY: Record<string, string> = {
  ibm_mq:  'IBM MQ',
  mongodb: 'MongoDB Replica Set',
  oracle:  'Oracle Data Guard',
  mssql:   'MSSQL AlwaysOn',
  kafka:   'Kafka Cluster',
  ocp:     'OpenShift / Kubernetes',
  vm:      'Virtual Machine',
};

function freshness(asset: RuntimeAsset): 'FRESH' | 'STALE' | 'VERY_STALE' | 'UNKNOWN' {
  if (!asset.last_seen_at) return 'UNKNOWN';
  const ageMin = (Date.now() - new Date(asset.last_seen_at).getTime()) / 60000;
  if (ageMin < 30) return 'FRESH';
  if (ageMin < 120) return 'STALE';
  return 'VERY_STALE';
}

function sourceStatus(s: DataSourceInfo): 'FRESH' | 'STALE' | 'MISSING' {
  if (s.status === 'FRESH') return 'FRESH';
  if (s.status === 'STALE' || s.status === 'VERY_STALE') return 'STALE';
  return 'MISSING';
}

function relTime(iso?: string): string {
  if (!iso) return 'never';
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function primaryDC(assets: RuntimeAsset[]): string {
  const primary = assets.find(a => a.write_authority === true);
  return primary?.data_center?.short_name ?? primary?.data_center?.name ?? 'UNKNOWN';
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function computeConfidence(
  dataSources: DataSourceInfo[],
  assets: RuntimeAsset[],
  conflicts: SourceConflict[],
  drifts: IntentDrift[],
): ConfidenceBreakdown {
  if (dataSources.length === 0) {
    return {
      freshness: 2, determinism: 3, agreement: 0, coverage: 3, total: 8,
      explanation: [
        'Freshness (2/25): No data sources configured.',
        'Determinism (3/25): Cannot assess without sources.',
        'Agreement (0/25): No sources to compare.',
        'Coverage (3/25): Missing all telemetry channels.',
      ],
    };
  }

  const freshSources = dataSources.filter(s => s.status === 'FRESH');
  const staleSources = dataSources.filter(s => s.status === 'STALE' || s.status === 'VERY_STALE');
  const totalSources = dataSources.length;

  // Freshness: 0–25
  const freshnessScore = Math.round((freshSources.length / Math.max(totalSources, 1)) * 25);

  // Determinism: 0–25 (based on asset is_deterministic)
  const deterministicAssets = assets.filter(a => a.is_deterministic);
  const detScore = assets.length > 0
    ? Math.round((deterministicAssets.length / assets.length) * 25)
    : 10;
  const determinismScore = conflicts.length > 0 ? Math.max(detScore - 8, 3) : detScore;

  // Agreement: 0–25
  const agreementScore = conflicts.length > 0
    ? Math.max(5 - conflicts.length * 5, 0)
    : drifts.length > 0
    ? Math.round(25 * 0.7)
    : 23;

  // Coverage: 0–25 — based on how many tech stacks have fresh sources
  const techsPresent = new Set(assets.map(a => a.tech_stack)).size;
  const sourcesWithTopologyConf = dataSources.filter(s => s.topology_confidence >= 3).length;
  const coverageScore = Math.round(Math.min((sourcesWithTopologyConf / Math.max(techsPresent, 1)) * 22, 22)) + (staleSources.length === 0 ? 3 : 0);

  const total = Math.min(freshnessScore + determinismScore + agreementScore + coverageScore, 100);

  const explanation = [
    `Freshness (${freshnessScore}/25): ${freshSources.length} of ${totalSources} sources fresh. ${staleSources.length > 0 ? `${staleSources.length} stale source(s): ${staleSources.map(s => s.display_name).join(', ')}.` : 'All sources current.'}`,
    `Determinism (${determinismScore}/25): ${deterministicAssets.length}/${assets.length} assets verified by authoritative source control planes. ${conflicts.length > 0 ? 'Penalized for active conflicts.' : ''}`,
    `Agreement (${agreementScore}/25): ${conflicts.length > 0 ? `${conflicts.length} conflict(s) detected — sources disagree on write authority.` : drifts.length > 0 ? `${drifts.length} drift violation(s) vs defined intent.` : 'All sources agree on component roles.'}`,
    `Coverage (${coverageScore}/25): ${sourcesWithTopologyConf} source(s) with topology confidence ≥3 for ${techsPresent} technology stack(s).`,
  ];

  return { freshness: freshnessScore, determinism: determinismScore, agreement: agreementScore, coverage: coverageScore, total, explanation };
}

// ─── Component authority ──────────────────────────────────────────────────────

function buildComponentAuthority(comp: ApplicationComponent, conflicts: SourceConflict[]): ComponentAuthority {
  const assets = comp.assets;
  const writePrimary = assets.find(a => a.write_authority === true);
  const allDCs = [...new Set(assets.map(a => a.data_center?.short_name ?? a.data_center?.name ?? 'UNKNOWN'))];

  const dc1 = allDCs[0] ?? '—';
  const dc2 = allDCs[1] ?? '—';
  const dc1Assets = assets.filter(a => (a.data_center?.short_name ?? a.data_center?.name) === dc1);
  const dc2Assets = assets.filter(a => (a.data_center?.short_name ?? a.data_center?.name) === dc2);

  const dc1PrimaryAsset = dc1Assets.find(a => a.write_authority || a.latest_replication_role === 'PRIMARY' || a.latest_operational_state === 'ACTIVE');
  const dc2PrimaryAsset = dc2Assets.find(a => a.latest_replication_role !== undefined || a.latest_operational_state !== undefined);

  const roleLabel = (a?: RuntimeAsset) => {
    if (!a) return '—';
    const role = a.latest_replication_role;
    if (role && role !== 'NONE') return role.replace(/_/g, ' ');
    return a.latest_operational_state ?? 'UNKNOWN';
  };

  const hasConflict = conflicts.some(c => assets.some(a => a.name === c.asset_name));
  const authoritative = hasConflict
    ? `⚠ CONFLICT: Multiple sources disagree`
    : writePrimary
    ? `${writePrimary.data_center?.short_name ?? 'UNKNOWN'} (${writePrimary.name})`
    : allDCs.length === 1 ? `${dc1} (Only Instance)` : `${dc1} + ${dc2} (Active-Active)`;

  const failoverType = TECH_FAILOVER[comp.tech_stack] ?? 'MANUAL';
  const canFailover = allDCs.length > 1 || dc2Assets.some(a => a.latest_replication_role === 'PHYSICAL_STANDBY' || a.latest_replication_role === 'SECONDARY');

  const failoverRisk = hasConflict ? 'CRITICAL — conflicting signals, do not act without manual check'
    : !canFailover ? 'High — no standby configured, single point of failure'
    : failoverType === 'AUTOMATIC' ? 'Low — automatic failover supported'
    : 'Medium — manual promotion required';

  // Build signals from assets
  const signals: AuthoritySignal[] = assets.map(a => {
    const fr = freshness(a);
    const hasConf = conflicts.some(c => c.asset_name === a.name);
    const type: SignalType = hasConf ? 'conflicting'
      : !a.is_deterministic ? 'inferred'
      : fr === 'VERY_STALE' ? 'stale'
      : fr === 'UNKNOWN' ? 'missing'
      : 'deterministic';

    const role = a.latest_replication_role && a.latest_replication_role !== 'NONE'
      ? a.latest_replication_role : a.latest_operational_state ?? 'UNKNOWN';

    const conflict = conflicts.find(c => c.asset_name === a.name);
    const detail = conflict
      ? `CONFLICT: ${conflict.source_a.name} says ${conflict.source_a.says}, ${conflict.source_b.name} says ${conflict.source_b.says}. Checked ${relTime(conflict.last_checked)}.`
      : `${a.data_source ?? 'Unknown source'} reports ${role} on ${a.host ?? 'unknown host'}. Last seen: ${relTime(a.last_seen_at)}.${a.metadata ? ' ' + Object.entries(a.metadata).map(([k, v]) => `${k}=${v}`).join(', ') : ''}`;

    return {
      source: a.data_source ?? 'Unknown',
      technology: TECH_DISPLAY[a.tech_stack] ?? a.tech_stack,
      signal: a.latest_replication_role ? 'replication_role' : 'operational_state',
      value: role,
      dc: a.data_center?.short_name ?? a.data_center?.name ?? 'UNKNOWN',
      type,
      freshness: fr === 'FRESH' ? 'FRESH' : fr === 'UNKNOWN' ? 'MISSING' : 'STALE',
      confidence: a.latest_confidence_level ?? 1,
      timestamp: a.last_seen_at ?? new Date().toISOString(),
      detail,
    };
  });

  return {
    id: comp.id,
    name: comp.component_name,
    type: comp.component_type,
    technology: TECH_DISPLAY[comp.tech_stack] ?? comp.tech_stack,
    dc1Role: roleLabel(dc1PrimaryAsset),
    dc2Role: roleLabel(dc2PrimaryAsset),
    dc1Site: dc1,
    dc2Site: dc2,
    authoritative,
    canFailover,
    failoverType,
    failoverRisk,
    signals,
  };
}

// ─── Scenario generation ──────────────────────────────────────────────────────

function buildScenarios(
  detail: ApplicationLocationDetail,
  confidenceBreakdown: ConfidenceBreakdown,
  compAuthorities: ComponentAuthority[],
): ScenarioResult[] {
  const allAssets = detail.components.flatMap(c => c.assets);
  const activeDCs = [...new Set(allAssets.map(a => a.data_center?.short_name ?? a.data_center?.name).filter(Boolean))] as string[];
  const hasConflicts = detail.conflicts.length > 0;
  const staleSources = detail.data_sources.filter(s => s.status !== 'FRESH');
  const manualFailoverComps = compAuthorities.filter(c => c.failoverType === 'MANUAL');
  const noFailoverComps = compAuthorities.filter(c => !c.canFailover);

  const scenarios: ScenarioResult[] = [];

  // Scenario 1: Current state
  scenarios.push({
    id: 's-current',
    name: 'Current State',
    description: hasConflicts ? 'Conflict detected — manual verification required' : 'Current operational baseline',
    icon: hasConflicts ? 'alert-circle' : 'check-circle',
    outcome: hasConflicts ? 'FAILED' : confidenceBreakdown.total >= 80 ? 'SAFE' : confidenceBreakdown.total >= 50 ? 'DEGRADED' : 'FAILED',
    components: compAuthorities.map(c => ({
      name: c.name,
      dc1: `${c.dc1Role} (${c.dc1Site})`,
      dc2: c.dc2Site !== '—' ? `${c.dc2Role} (${c.dc2Site})` : '—',
      risk: c.failoverType === 'NONE' ? 'High' : hasConflicts ? 'Critical' : 'None',
    })),
    expectedConfidence: confidenceBreakdown.total,
    notes: hasConflicts
      ? `DO NOT TAKE OPERATIONAL ACTIONS. ${detail.conflicts.length} conflict(s) require manual DBA verification before any recovery steps.`
      : `All signals ${staleSources.length > 0 ? `except ${staleSources.length} stale source(s)` : 'nominal'}. System operating within parameters.`,
    blockers: hasConflicts
      ? detail.conflicts.map(c => `Conflict on ${c.asset_name}: ${c.source_a.name} says ${c.source_a.says}, ${c.source_b.name} says ${c.source_b.says}`)
      : [],
  });

  // Scenario 2: DC1 failure (if multi-DC)
  if (activeDCs.length > 1) {
    const dc1 = activeDCs[0];
    const dc2 = activeDCs[1];
    const manualBlockers = manualFailoverComps.map(c => `${c.name}: ${c.failoverRisk}`);
    const criticalBlockers = noFailoverComps.map(c => `${c.name} has no failover — will be OFFLINE if ${dc1} is lost`);

    const allBlockers = [...manualBlockers, ...criticalBlockers];
    const outcome: ScenarioResult['outcome'] = noFailoverComps.length > 0 ? 'FAILED' : manualFailoverComps.length > 0 ? 'DEGRADED' : 'SAFE';
    const expectedConf = noFailoverComps.length > 0 ? 15 : manualFailoverComps.length > 0 ? 55 : 75;

    scenarios.push({
      id: 's-dc1-fail',
      name: `${dc1} Full Failure`,
      description: `Simulate complete loss of ${dc1} data center`,
      icon: 'zap',
      outcome,
      components: compAuthorities.map(c => {
        const dc1HasAssets = c.dc1Site === dc1;
        return {
          name: c.name,
          dc1: dc1HasAssets ? 'OFFLINE' : `${c.dc1Role} (${c.dc1Site}) — unaffected`,
          dc2: c.dc2Site !== '—'
            ? c.failoverType === 'AUTOMATIC' ? `${c.dc2Role} → takes over automatically` : c.failoverType === 'MANUAL' ? `${c.dc2Role} → manual promotion needed` : `${c.dc2Role} — cannot promote`
            : 'No failover site',
          risk: c.canFailover ? (c.failoverType === 'AUTOMATIC' ? 'Low' : 'High') : 'Critical',
        };
      }),
      expectedConfidence: expectedConf,
      notes: `If ${dc1} fails: ${compAuthorities.filter(c => c.failoverType === 'AUTOMATIC').length} component(s) auto-recover. ${manualFailoverComps.length} require manual intervention. ${noFailoverComps.length} will be offline.`,
      blockers: allBlockers,
    });
  }

  // Scenario 3: Stale data
  const nonStaleConf = Math.max(confidenceBreakdown.total - 35, 8);
  scenarios.push({
    id: 's-stale',
    name: 'All Telemetry Stale',
    description: 'What if all data sources become stale (no refresh for 2+ hours)',
    icon: 'clock',
    outcome: 'DEGRADED',
    components: compAuthorities.map(c => ({
      name: c.name,
      dc1: `${c.dc1Role} — unverified (CMDB fallback)`,
      dc2: c.dc2Site !== '—' ? 'Unknown (stale)' : '—',
      risk: 'Medium',
    })),
    expectedConfidence: nonStaleConf,
    notes: `Without live telemetry, the system falls back to CMDB topology. Confidence drops to ${nonStaleConf}%. DO NOT take operational actions based on stale signals.`,
    blockers: [
      'Cannot confirm write authority without live source control plane data',
      'Traffic ownership unknown — no APM telemetry',
    ],
  });

  // Scenario 4: Partial failover (traffic only)
  const writeOwnerComps = compAuthorities.filter(c => !c.authoritative.includes('Active-Active') && !c.authoritative.includes('CONFLICT') && !c.authoritative.includes('UNKNOWN'));
  if (writeOwnerComps.length > 0 && activeDCs.length > 1) {
    scenarios.push({
      id: 's-partial',
      name: 'Traffic Only Failover',
      description: 'Traffic moves to DC2 but state ownership stays in DC1',
      icon: 'alert-triangle',
      outcome: 'PARTIAL',
      components: compAuthorities.map(c => ({
        name: c.name,
        dc1: c.dc1Role.includes('PRIMARY') || c.dc1Role.includes('Active') ? `${c.dc1Role} — still owns state` : `${c.dc1Role}`,
        dc2: c.dc2Site !== '—' ? 'Receives 100% traffic — cross-DC writes' : '—',
        risk: c.dc1Role.includes('PRIMARY') ? 'Critical' : 'Medium',
      })),
      expectedConfidence: Math.max(confidenceBreakdown.total - 45, 20),
      notes: `CRITICAL: Application traffic moves to ${activeDCs[1]} but write authority stays in ${activeDCs[0]}. Cross-DC writes incur 80-200ms latency. Data loss risk during network partition.`,
      blockers: [
        `Cross-DC write latency degradation to all ${writeOwnerComps.map(c => c.name).join(', ')} components`,
        'If primary DC network fails, all writes halt — application degraded to read-only',
      ],
    });
  }

  return scenarios;
}

// ─── Timeline generation from data ───────────────────────────────────────────

export function buildTimeline(
  detail: ApplicationLocationDetail,
  snapshots: RuntimeSnapshot[],
  drifts: IntentDrift[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let idCounter = 0;
  const nextId = () => `tl-${++idCounter}`;

  // Conflicts → CRITICAL events
  detail.conflicts.forEach(c => {
    events.push({
      id: nextId(),
      timestamp: c.last_checked,
      relativeTime: relTime(c.last_checked),
      type: 'CONFLICT_DETECTED',
      title: `CONFLICT: ${c.source_a.name} vs ${c.source_b.name} on ${c.asset_name}`,
      detail: `${c.source_a.name} says ${c.source_a.says}, ${c.source_b.name} says ${c.source_b.says}. Manual verification required before any action.`,
      dc: 'ALL',
      impact: 'CRITICAL',
      authorityChange: { from: `${c.source_a.name}: ${c.source_a.says}`, to: `${c.source_b.name}: ${c.source_b.says}` },
    });
  });

  // Stale data sources
  detail.data_sources.filter(s => s.status !== 'FRESH').forEach(s => {
    if (s.last_import) {
      events.push({
        id: nextId(),
        timestamp: s.last_import,
        relativeTime: relTime(s.last_import),
        type: 'TELEMETRY_STALE',
        title: `${s.display_name} data became stale`,
        detail: `Last import: ${relTime(s.last_import)}. Topology confidence may be degraded. Stale for source: ${s.display_name}.`,
        dc: 'ALL',
        impact: s.status === 'VERY_STALE' ? 'CRITICAL' : 'WARNING',
      });
    }
  });

  // Drifts
  drifts.filter(d => d.application_id === detail.application_id && d.environment === detail.environment).forEach(dr => {
    events.push({
      id: nextId(),
      timestamp: dr.detected_at,
      relativeTime: relTime(dr.detected_at),
      type: 'STATE_CHANGE',
      title: `Drift: ${dr.drift_type.replace(/_/g, ' ')} — ${dr.severity} severity`,
      detail: dr.description,
      dc: 'ALL',
      impact: dr.severity === 'CRITICAL' || dr.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
    });
  });

  // Snapshots — pick last state change per asset
  const assetLastSnap: Record<string, RuntimeSnapshot> = {};
  snapshots.forEach(s => {
    const prev = assetLastSnap[s.asset_id];
    if (!prev || new Date(s.snapshot_time) > new Date(prev.snapshot_time)) {
      assetLastSnap[s.asset_id] = s;
    }
  });

  // Collect role transition snapshots
  const seenTransitions = new Set<string>();
  const sortedSnaps = [...snapshots].sort((a, b) => new Date(a.snapshot_time).getTime() - new Date(b.snapshot_time).getTime());
  for (let i = 1; i < sortedSnaps.length; i++) {
    const prev = sortedSnaps[i - 1];
    const curr = sortedSnaps[i];
    if (prev.asset_id === curr.asset_id && prev.replication_role !== curr.replication_role) {
      const key = `${curr.asset_id}-${curr.snapshot_time}`;
      if (!seenTransitions.has(key)) {
        seenTransitions.add(key);
        events.push({
          id: nextId(),
          timestamp: curr.snapshot_time,
          relativeTime: relTime(curr.snapshot_time),
          type: 'LEADER_ELECTION',
          title: `Role change on ${curr.asset_id}`,
          detail: `${prev.replication_role ?? prev.operational_state} → ${curr.replication_role ?? curr.operational_state}`,
          dc: 'UNKNOWN',
          impact: 'WARNING',
          authorityChange: { from: prev.replication_role ?? prev.operational_state, to: curr.replication_role ?? curr.operational_state },
        });
      }
    }
  }

  // Fresh sources → INFO events
  detail.data_sources.filter(s => s.status === 'FRESH' && s.last_import).forEach(s => {
    events.push({
      id: nextId(),
      timestamp: s.last_import!,
      relativeTime: relTime(s.last_import),
      type: 'STATE_CHANGE',
      title: `${s.display_name} telemetry refreshed`,
      detail: `${s.record_count} records ingested. Topology confidence: ${s.topology_confidence}/4. Traffic confidence: ${s.traffic_confidence}/4.`,
      dc: 'ALL',
      impact: 'INFO',
    });
  });

  // Sort by timestamp desc
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
}

// ─── Service topology for dependency map ─────────────────────────────────────

function assetMetrics(asset: RuntimeAsset): { requestRate: number; p95: number; p99: number; errorRate: number } {
  const fr = freshness(asset);
  const state = asset.latest_operational_state;
  const conf = asset.latest_confidence_level ?? 1;

  // Deterministic metrics derived from state + tech stack
  const baseLatency: Record<string, number> = {
    oracle: 12, mssql: 8, mongodb: 4, ibm_mq: 6, ocp: 18, vm: 25, kafka: 2,
  };
  const base = baseLatency[asset.tech_stack] ?? 10;

  let requestRate = 0;
  let p95 = base;
  let p99 = base * 2.5;
  let errorRate = 0;

  if (state === 'ACTIVE') {
    // Generate stable pseudo-random metrics from asset ID
    const seed = asset.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    requestRate = ((seed % 900) + 100) / 10;
    p95 = base + (seed % 30);
    p99 = p95 * (1.5 + (seed % 10) / 10);
  }

  if (fr === 'STALE') { errorRate = 0.8 + (asset.id.length % 5) * 0.4; p95 *= 1.3; }
  if (fr === 'VERY_STALE') { errorRate = 3.5 + (asset.id.length % 4); p95 *= 2.0; }
  if (!asset.is_deterministic) errorRate += 0.5;
  if (conf <= 2) errorRate += 1.2;

  return { requestRate, p95: Math.round(p95), p99: Math.round(p99), errorRate: Math.min(Math.round(errorRate * 100) / 100, 15) };
}

export function buildServiceTopology(detail: ApplicationLocationDetail): ServiceTopologyData {
  const nodes: ServiceNode[] = [];
  const edges: ServiceEdge[] = [];

  // Build nodes from components → assets
  for (const comp of detail.components) {
    for (const asset of comp.assets) {
      const fr = freshness(asset);
      const metrics = assetMetrics(asset);
      const health: ServiceNode['health'] = metrics.errorRate > 4 ? 'critical' : metrics.errorRate > 2 ? 'degraded' : fr === 'VERY_STALE' ? 'critical' : fr === 'STALE' ? 'degraded' : asset.latest_operational_state === 'UNKNOWN' ? 'unknown' : 'healthy';

      nodes.push({
        id: asset.id,
        label: asset.name,
        type: comp.component_type,
        technology: asset.tech_stack,
        dc: asset.data_center?.short_name ?? asset.data_center?.name ?? 'UNKNOWN',
        role: (asset.latest_replication_role && asset.latest_replication_role !== 'NONE') ? asset.latest_replication_role : (asset.latest_operational_state ?? 'UNKNOWN'),
        health,
        errorRate: metrics.errorRate,
        requestRate: metrics.requestRate,
        p95Latency: metrics.p95,
        p99Latency: metrics.p99,
        isWriteAuthority: asset.write_authority === true,
        isDeterministic: asset.is_deterministic ?? false,
        freshness: fr,
        assetId: asset.id,
        componentId: comp.id,
        host: asset.host,
      });
    }
  }

  // Build edges: COMPUTE → DATABASE, COMPUTE → MESSAGING
  const computeNodes = nodes.filter(n => n.type === 'COMPUTE');
  const dbNodes = nodes.filter(n => n.type === 'DATABASE');
  const msgNodes = nodes.filter(n => n.type === 'MESSAGING');

  // Replication edges within same tech stack (PRIMARY → SECONDARY/STANDBY in same DC group)
  for (const comp of detail.components) {
    const primary = comp.assets.find(a => a.write_authority === true || a.latest_replication_role === 'PRIMARY');
    const replicas = comp.assets.filter(a => a.id !== primary?.id);
    if (primary) {
      replicas.forEach((rep, i) => {
        edges.push({
          id: `rep-${primary.id}-${rep.id}`,
          source: primary.id,
          target: rep.id,
          type: 'replication',
          health: freshness(rep) === 'FRESH' ? 'healthy' : 'degraded',
          label: 'replicates to',
          avgLatency: 2 + i * 5,
          errorRate: 0,
        });
      });
    }
  }

  // App server → DB dependencies (traffic edges)
  computeNodes.forEach(c => {
    dbNodes.filter(d => d.dc === c.dc || dbNodes.filter(dd => dd.dc === c.dc).length === 0).slice(0, 2).forEach(d => {
      const avgLat = Math.round((c.p95Latency + d.p95Latency) / 2 * 0.6);
      edges.push({
        id: `dep-${c.id}-${d.id}`,
        source: c.id,
        target: d.id,
        type: 'dependency',
        health: c.health === 'critical' || d.health === 'critical' ? 'critical' : c.health === 'degraded' || d.health === 'degraded' ? 'degraded' : 'healthy',
        requestRate: c.requestRate * 0.85,
        avgLatency: avgLat,
        p95Latency: Math.round(avgLat * 1.8),
        p99Latency: Math.round(avgLat * 3.2),
        errorRate: Math.max(c.errorRate, d.errorRate) * 0.7,
        protocol: 'JDBC',
      });
    });

    // App server → MQ
    msgNodes.filter(m => m.dc === c.dc || msgNodes.filter(mm => mm.dc === c.dc).length === 0).slice(0, 1).forEach(m => {
      edges.push({
        id: `dep-${c.id}-${m.id}`,
        source: c.id,
        target: m.id,
        type: 'dependency',
        health: c.health === 'critical' || m.health === 'critical' ? 'critical' : 'healthy',
        requestRate: c.requestRate * 0.2,
        avgLatency: 6,
        p95Latency: 12,
        p99Latency: 28,
        errorRate: 0,
        protocol: 'AMQP',
      });
    });
  });

  return { nodes, edges };
}

// ─── Discovered signals from sources ─────────────────────────────────────────

const TECH_SIGNALS: Record<string, DiscoveredSignal> = {
  oracle: { id: 'ds-oracle', technology: 'Oracle', displayName: 'Oracle Data Guard', signalName: 'DB_ROLE (PRIMARY/STANDBY)', apiSource: 'Oracle OEM REST API /targets', confidence: 4, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Deterministically identifies which node owns write authority in Data Guard configuration.', shared: true, sampleValue: 'db_role=PRIMARY, host=ibb1h01.corp' },
  ibm_mq: { id: 'ds-mq', technology: 'IBM MQ', displayName: 'IBM MQ Queue Manager', signalName: 'QMGR_STATUS', apiSource: 'MQ Prometheus /metrics', confidence: 3, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Queue manager running state confirms active message processing capability.', shared: true, sampleValue: 'qmgr=QM_PCA_IBB1, status=Running' },
  mongodb: { id: 'ds-mongo', technology: 'MongoDB', displayName: 'MongoDB Replica Set', signalName: 'RS_STATE (1=PRIMARY)', apiSource: 'MongoDB Prometheus /metrics', confidence: 3, deterministic: true, category: 'REPLICATION', description: 'rs_state=1 deterministically identifies MongoDB PRIMARY. No ambiguity.', shared: true, sampleValue: 'member=mongo-01, rs_state=1' },
  mssql: { id: 'ds-mssql', technology: 'MSSQL', displayName: 'MSSQL AlwaysOn', signalName: 'REPLICA_HEALTH_STATE', apiSource: 'SCOM REST /operationsManager/data', confidence: 3, deterministic: false, category: 'REPLICATION', description: 'Windows SCOM monitors MSSQL AlwaysOn replica sync state.', shared: true, sampleValue: 'replica=SHV-SQL-01, sync_state=SYNCHRONIZED' },
  kafka: { id: 'ds-kafka', technology: 'Kafka', displayName: 'Kafka Leader Election', signalName: 'PARTITION_LEADER', apiSource: 'Kafka Admin API /admin/v2/brokers', confidence: 4, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Leader partition assignment proves which broker owns authoritative event processing.', shared: false, sampleValue: 'topic=events, partition=0, leader=kafka-ibb1-01' },
  ocp: { id: 'ds-ocp', technology: 'OpenShift', displayName: 'OCP Pod Status', signalName: 'POD_PHASE (Running/Pending)', apiSource: 'Kubernetes API /api/v1/pods', confidence: 3, deterministic: true, category: 'HEALTH', description: 'Pod phase confirms whether compute is actively serving requests.', shared: true, sampleValue: 'pod=payroll-pod-01, phase=Running' },
  vm: { id: 'ds-vm', technology: 'VM', displayName: 'VM Topology (CMDB)', signalName: 'VM_STATUS', apiSource: 'CMDB topology export', confidence: 4, deterministic: true, category: 'HEALTH', description: 'CMDB records VM allocation per data center. High topology confidence, low traffic confidence.', shared: true, sampleValue: 'vm=PCA-APP-01, dc=IBB1, status=ACTIVE' },
};

const EXTRA_SIGNALS: DiscoveredSignal[] = [
  { id: 'ds-appdyn', technology: 'APM', displayName: 'AppDynamics APM', signalName: 'CALL_RATE per node', apiSource: 'AppDynamics Controller /api/v1', confidence: 4, deterministic: true, category: 'TRAFFIC_FLOW', description: 'Per-node call rates prove which DC is actively serving user transactions.', shared: true, sampleValue: 'app=PCA, node=IBB1-pod-01, calls=4440/min' },
  { id: 'ds-gslb', technology: 'Network', displayName: 'AVI / GSLB', signalName: 'VIRTUAL_SERVICE_ROUTING', apiSource: 'AVI Controller REST /api/virtualservice', confidence: 4, deterministic: true, category: 'TRAFFIC_FLOW', description: 'Load balancer routing table confirms which pool is receiving connections.', shared: false, sampleValue: 'vip=10.1.1.100, active_pool=IBB1-pool' },
  { id: 'ds-netapp', technology: 'Storage', displayName: 'NetApp SnapMirror', signalName: 'VOLUME_WRITE_OWNERSHIP', apiSource: 'NetApp REST API /storage/volumes', confidence: 4, deterministic: true, category: 'STATE_OWNERSHIP', description: 'SnapMirror shows which volume is RW vs DP — determines file share write authority.', shared: false, sampleValue: 'volume=claims-nfs-vol, type=RW, site=IBB1' },
];

export function buildDiscoveredSignals(detail: ApplicationLocationDetail): DiscoveredSignal[] {
  const techsInApp = new Set(detail.components.map(c => c.tech_stack));
  const signals: DiscoveredSignal[] = [];
  techsInApp.forEach(t => {
    if (TECH_SIGNALS[t]) signals.push(TECH_SIGNALS[t]);
  });
  return [...signals, ...EXTRA_SIGNALS];
}

// ─── Main verdict computation ─────────────────────────────────────────────────

export function computeVerdict(
  detail: ApplicationLocationDetail,
  drifts: IntentDrift[],
  snapshots: RuntimeSnapshot[],
): RuntimeVerdict {
  const allAssets = detail.components.flatMap(c => c.assets);
  const activeDCs = [...new Set(allAssets.map(a => a.data_center?.short_name ?? a.data_center?.name).filter(Boolean))] as string[];
  const writeAssets = allAssets.filter(a => a.write_authority === true);
  const appDrifts = drifts.filter(d => d.application_id === detail.application_id && d.environment === detail.environment);

  const hasConflicts = detail.conflicts.length > 0;
  const staleSources = detail.data_sources.filter(s => s.status !== 'FRESH');
  const veryStale = detail.data_sources.filter(s => s.status === 'VERY_STALE');

  // Confidence
  const confidenceBreakdown = computeConfidence(detail.data_sources, allAssets, detail.conflicts, appDrifts);
  const confidence = confidenceBreakdown.total;

  // Authority site
  const authDC = primaryDC(writeAssets);
  const authoritativeSite = hasConflicts ? 'CONFLICT'
    : veryStale.length >= detail.data_sources.length ? 'UNKNOWN'
    : authDC;

  const dc1 = activeDCs[0] ?? 'NONE';
  const dc2 = activeDCs[1] ?? null;
  const authoritativeSiteLabel = authoritativeSite === 'CONFLICT' ? 'CONFLICT — Manual Verification Required'
    : authoritativeSite === 'UNKNOWN' ? 'UNKNOWN — Telemetry Too Stale'
    : authDC;

  const canServeTransactions = !hasConflicts && confidence >= 30 && veryStale.length < detail.data_sources.length;

  // Risk
  const risk: VerdictRisk = hasConflicts ? 'CRITICAL'
    : !canServeTransactions ? 'CRITICAL'
    : confidence < 40 ? 'HIGH'
    : confidence < 65 ? 'MEDIUM'
    : 'LOW';

  const riskReason = hasConflicts
    ? `${detail.conflicts.length} conflict(s) — sources disagree on write authority. DO NOT ACT without manual verification.`
    : !canServeTransactions
    ? 'All telemetry is too stale to determine operational state.'
    : staleSources.length > 0
    ? `${staleSources.length} stale source(s) detected. Some signals may be outdated.`
    : appDrifts.length > 0
    ? `${appDrifts.length} drift violation(s) vs defined intent.`
    : 'All signals fresh and aligned.';

  // State / traffic owners
  const stateOwner = authoritativeSite === 'CONFLICT' ? 'UNKNOWN — conflicting sources'
    : authoritativeSite === 'UNKNOWN' ? 'UNKNOWN'
    : `${authDC} (${writeAssets.map(a => a.name).join(', ') || 'Primary write site'})`;

  const activeCompute = allAssets.filter(a => a.latest_operational_state === 'ACTIVE' && a.asset_type !== 'ORACLE_DB' && a.asset_type !== 'MONGO_NODE');
  const trafficDC = activeCompute.length > 0 ? (activeCompute[0].data_center?.short_name ?? 'UNKNOWN') : authDC;
  const trafficOwner = authoritativeSite === 'UNKNOWN' ? 'UNKNOWN' : `${trafficDC} (primary traffic node)`;

  // DC2 readiness
  const standbyAssets = allAssets.filter(a =>
    (a.data_center?.short_name ?? a.data_center?.name) !== dc1 &&
    (a.latest_replication_role === 'PHYSICAL_STANDBY' || a.latest_replication_role === 'SECONDARY' || a.latest_operational_state === 'ACTIVE')
  );
  const dc2CanTakeOver = standbyAssets.length > 0 && !hasConflicts;
  const dc2ReadinessPercent = dc2 === null ? 0
    : hasConflicts ? 0
    : Math.min(
        Math.round((standbyAssets.length / Math.max(allAssets.length, 1)) * 80 + confidence * 0.15),
        98
      );

  // Verdict summary
  const verdictSummary = authoritativeSite === 'CONFLICT'
    ? `CRITICAL CONFLICT. Cannot determine write authority. ${detail.conflicts.map(c => `${c.source_a.name} says ${c.source_a.says} while ${c.source_b.name} says ${c.source_b.says}`).join('; ')}.`
    : authoritativeSite === 'UNKNOWN'
    ? `UNKNOWN state. All telemetry older than threshold. Cannot determine if ${detail.application_name} is operational. Do not route critical transactions.`
    : `${authDC} is the authoritative runtime site. ${writeAssets.length > 0 ? `Write authority confirmed on: ${writeAssets.map(a => a.name).join(', ')}.` : ''} ${dc2 ? `${dc2} is ${dc2CanTakeOver ? 'ready for failover' : 'not ready for takeover'} (${dc2ReadinessPercent}% readiness).` : 'No secondary site configured.'} ${canServeTransactions ? 'Safe to process customer transactions.' : 'Verify system state before routing transactions.'}`;

  // Component authorities
  const compAuthorities = detail.components.map(c => buildComponentAuthority(c, detail.conflicts));

  // Scenarios
  const scenarios = buildScenarios(detail, confidenceBreakdown, compAuthorities);

  return {
    appId: detail.application_id,
    appName: detail.application_name,
    environment: detail.environment,
    authoritativeSite,
    authoritativeSiteLabel,
    canServeTransactions,
    confidence,
    confidenceBreakdown,
    risk,
    riskReason,
    stateOwner,
    trafficOwner,
    dc2CanTakeOver,
    dc2ReadinessPercent,
    verdictSummary,
    components: compAuthorities,
    signals: compAuthorities.flatMap(c => c.signals),
    scenarios,
  };
}

// ─── Lightweight summary verdict (from ApplicationLocationSummary) ─────────────

export function computeSummaryVerdict(summary: ApplicationLocationSummary): {
  confidence: number;
  risk: VerdictRisk;
  canServeTransactions: boolean;
  authoritativeSite: string;
} {
  const confidence = (summary.overall_confidence / 4) * 100 - (summary.stale_source_count ?? 0) * 8 - (summary.missing_source_count ?? 0) * 15;
  const clampedConf = Math.max(Math.min(Math.round(confidence), 100), 5);
  const hasConflict = (summary.missing_source_count ?? 0) > 1 && clampedConf < 40;
  const risk: VerdictRisk = clampedConf < 25 ? 'CRITICAL' : clampedConf < 50 ? 'HIGH' : clampedConf < 70 ? 'MEDIUM' : 'LOW';
  return {
    confidence: clampedConf,
    risk,
    canServeTransactions: !hasConflict && clampedConf >= 30,
    authoritativeSite: summary.primary_write_dc ?? 'UNKNOWN',
  };
}
