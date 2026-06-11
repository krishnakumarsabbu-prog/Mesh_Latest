// Runtime Truth & Decision Intelligence — mock data

export type AuthoritySite = 'DC1' | 'DC2' | 'SPLIT' | 'UNKNOWN';
export type VerdictRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SignalType = 'deterministic' | 'inferred' | 'stale' | 'conflicting' | 'missing';
export type TimelineEventType =
  | 'TRAFFIC_SHIFT'
  | 'DB_FAILOVER'
  | 'LEADER_ELECTION'
  | 'STATE_CHANGE'
  | 'CONFLICT_DETECTED'
  | 'TELEMETRY_STALE'
  | 'RECOVERY'
  | 'PARTIAL_FAILOVER';

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
  type: 'DATABASE' | 'MESSAGING' | 'COMPUTE' | 'STORAGE' | 'LOAD_BALANCER';
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
  discoveredSignals: DiscoveredSignal[];
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

export interface TimelineEvent {
  id: string;
  timestamp: string;
  relativeTime: string;
  type: TimelineEventType;
  title: string;
  detail: string;
  dc: string;
  impact: 'INFO' | 'WARNING' | 'CRITICAL';
  authorityChange?: { from: string; to: string };
}

// ─── Base time ────────────────────────────────────────────────────────────────

const BASE_TS = new Date('2026-05-24T10:30:00Z').getTime();
function minsAgo(n: number) {
  return new Date(BASE_TS - n * 60 * 1000).toISOString();
}
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Scenario 1: Everything Healthy (PCA) ────────────────────────────────────

const PCA_COMPONENTS: ComponentAuthority[] = [
  {
    id: 'pca-api', name: 'API Gateway', type: 'COMPUTE', technology: 'OCP Pod',
    dc1Role: 'Active', dc2Role: 'Active', dc1Site: 'IBB1', dc2Site: 'SHV',
    authoritative: 'IBB1 + SHV (Active-Active)',
    canFailover: true, failoverType: 'AUTOMATIC', failoverRisk: 'Low — both sites active',
    signals: [
      { source: 'AppDynamics', technology: 'OCP', signal: 'request_rate', value: '1,240 req/s', dc: 'IBB1', type: 'deterministic', freshness: 'FRESH', confidence: 4, timestamp: minsAgo(3), detail: 'AppDynamics APM showing 94% traffic load on IBB1 nodes. Transaction health: GREEN.' },
      { source: 'AppDynamics', technology: 'OCP', signal: 'request_rate', value: '72 req/s', dc: 'SHV', type: 'deterministic', freshness: 'FRESH', confidence: 4, timestamp: minsAgo(3), detail: 'SHV receiving 6% of traffic — standby routing in effect.' },
    ],
  },
  {
    id: 'pca-oracle', name: 'Oracle Database', type: 'DATABASE', technology: 'Oracle Data Guard',
    dc1Role: 'Primary Writer', dc2Role: 'Physical Standby', dc1Site: 'IBB1', dc2Site: 'SHV',
    authoritative: 'IBB1 (Sole Write Authority)',
    canFailover: true, failoverType: 'MANUAL', failoverRisk: 'Medium — manual promotion required (~4 min RTO)',
    signals: [
      { source: 'Oracle OEM', technology: 'Oracle', signal: 'db_role', value: 'PRIMARY', dc: 'IBB1', type: 'deterministic', freshness: 'FRESH', confidence: 4, timestamp: minsAgo(8), detail: 'Oracle OEM confirms ibb1h01.corp as PRIMARY Data Guard member. rs_state=1. Applied SCN: 8,442,901.' },
      { source: 'Oracle OEM', technology: 'Oracle', signal: 'db_role', value: 'PHYSICAL STANDBY', dc: 'SHV', type: 'deterministic', freshness: 'FRESH', confidence: 4, timestamp: minsAgo(8), detail: 'shv01.corp confirmed PHYSICAL STANDBY. Lag: 0s. Apply rate: 42 MB/s. Ready for promotion.' },
    ],
  },
  {
    id: 'pca-mq', name: 'IBM MQ Messaging', type: 'MESSAGING', technology: 'IBM MQ',
    dc1Role: 'Active Queue Mgr', dc2Role: 'Active Queue Mgr', dc1Site: 'IBB1', dc2Site: 'SHV',
    authoritative: 'IBB1 + SHV (Peer-to-Peer)',
    canFailover: true, failoverType: 'AUTOMATIC', failoverRisk: 'Low — peer-to-peer replicated',
    signals: [
      { source: 'IBM MQ Prometheus', technology: 'IBM MQ', signal: 'qmgr_status', value: 'Running', dc: 'IBB1', type: 'deterministic', freshness: 'FRESH', confidence: 3, timestamp: minsAgo(5), detail: 'QM_PCA_IBB1: Status=Running, Channels=34 bound, Depth=0, Last msg: 12s ago.' },
      { source: 'IBM MQ Prometheus', technology: 'IBM MQ', signal: 'qmgr_status', value: 'Running', dc: 'SHV', type: 'deterministic', freshness: 'FRESH', confidence: 3, timestamp: minsAgo(5), detail: 'QM_PCA_SHV: Status=Running, Channels=31 bound, Depth=0, Last msg: 15s ago.' },
    ],
  },
];

const PCA_DISCOVERED: DiscoveredSignal[] = [
  { id: 'ds-oracle-dg', technology: 'Oracle', displayName: 'Oracle Data Guard', signalName: 'DB_ROLE (PRIMARY/STANDBY)', apiSource: 'Oracle OEM REST API /targets', confidence: 4, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Deterministically identifies which node owns write authority in Data Guard configuration.', shared: true, sampleValue: 'db_role=PRIMARY, host=ibb1h01.corp' },
  { id: 'ds-mq-qmgr', technology: 'IBM MQ', displayName: 'IBM MQ Queue Manager', signalName: 'QMGR_STATUS (Running/Stopped)', apiSource: 'MQ Prometheus /metrics', confidence: 3, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Queue manager running state confirms active message processing capability.', shared: true, sampleValue: 'qmgr=QM_PCA_IBB1, status=Running' },
  { id: 'ds-appdyn', technology: 'OCP', displayName: 'AppDynamics APM', signalName: 'CALL_RATE per node', apiSource: 'AppDynamics Controller /api/v1', confidence: 4, deterministic: true, category: 'TRAFFIC_FLOW', description: 'Real-time transaction call rate proves which site is actively serving traffic.', shared: false, sampleValue: 'node=IBB1-pod-01, calls_per_min=4440' },
  { id: 'ds-gslb', technology: 'Network', displayName: 'AVI / GSLB Load Balancer', signalName: 'VIRTUAL_SERVICE_ROUTING', apiSource: 'AVI Controller REST /api/virtualservice', confidence: 4, deterministic: true, category: 'TRAFFIC_FLOW', description: 'Load balancer routing table confirms which pool member is receiving new connections.', shared: false, sampleValue: 'vip=10.1.1.100, active_pool=IBB1-pool' },
  { id: 'ds-scom', technology: 'Windows', displayName: 'SCOM Replica Status', signalName: 'REPLICA_HEALTH_STATE', apiSource: 'SCOM REST /operationsManager/data', confidence: 3, deterministic: false, category: 'REPLICATION', description: 'Windows SCOM monitors MSSQL AlwaysOn replica sync state.', shared: true, sampleValue: 'replica=SHV-SQL-01, sync_state=SYNCHRONIZED' },
];

const PCA_TIMELINE: TimelineEvent[] = [
  { id: 'tl-1', timestamp: minsAgo(120), relativeTime: '2h ago', type: 'STATE_CHANGE', title: 'Routine telemetry checkpoint', detail: 'All signals confirmed healthy. IBB1 confirmed as PRIMARY write site.', dc: 'IBB1', impact: 'INFO' },
  { id: 'tl-2', timestamp: minsAgo(90), relativeTime: '90m ago', type: 'TRAFFIC_SHIFT', title: 'Traffic spike handled', detail: 'Traffic increased 340% — IBB1 auto-scaled OCP pods from 3 to 9.', dc: 'IBB1', impact: 'INFO' },
  { id: 'tl-3', timestamp: minsAgo(45), relativeTime: '45m ago', type: 'TELEMETRY_STALE', title: 'CMDB data became stale', detail: 'CMDB last import was 135 minutes ago. Topology confidence reduced from 4 to 3.', dc: 'ALL', impact: 'WARNING' },
  { id: 'tl-4', timestamp: minsAgo(8), relativeTime: '8m ago', type: 'STATE_CHANGE', title: 'Oracle OEM sync confirmed', detail: 'Oracle Data Guard replication lag: 0s. IBB1 PRIMARY, SHV PHYSICAL_STANDBY. SCN current.', dc: 'IBB1', impact: 'INFO' },
  { id: 'tl-5', timestamp: minsAgo(5), relativeTime: '5m ago', type: 'STATE_CHANGE', title: 'MQ telemetry refresh', detail: 'Both QM_PCA_IBB1 and QM_PCA_SHV confirmed Running. Peer channels active.', dc: 'IBB1 + SHV', impact: 'INFO' },
  { id: 'tl-6', timestamp: minsAgo(3), relativeTime: '3m ago', type: 'TRAFFIC_SHIFT', title: 'AppDynamics traffic confirmed', detail: 'IBB1: 94% traffic (1,240 req/s). SHV: 6% (72 req/s). Pattern nominal.', dc: 'IBB1', impact: 'INFO' },
];

const PCA_SCENARIOS: ScenarioResult[] = [
  {
    id: 's1', name: 'DC1 (IBB1) Full Failure', description: 'Simulate complete loss of IBB1 data center',
    icon: 'zap',
    outcome: 'DEGRADED',
    components: [
      { name: 'API Gateway', dc1: 'OFFLINE', dc2: 'Active (takes 100% traffic)', risk: 'Low' },
      { name: 'Oracle DB', dc1: 'OFFLINE', dc2: 'Manual promotion needed (~4 min)', risk: 'High' },
      { name: 'IBM MQ', dc1: 'OFFLINE', dc2: 'Auto-failover (peer-to-peer)', risk: 'Low' },
    ],
    expectedConfidence: 61,
    notes: 'Oracle requires manual DBA intervention to promote SHV standby to PRIMARY. MQ and API would recover automatically.',
    blockers: ['Oracle Data Guard: manual promotion required — no automatic failover configured', 'In-flight Oracle transactions may be lost during promotion window'],
  },
  {
    id: 's2', name: 'Partial Failover (Traffic Only)', description: 'Traffic moves to DC2 but database stays in DC1',
    icon: 'alert-triangle',
    outcome: 'PARTIAL',
    components: [
      { name: 'API Gateway', dc1: 'Traffic shifted away', dc2: 'Receives 100% traffic', risk: 'Low' },
      { name: 'Oracle DB', dc1: 'Still PRIMARY (writes cross-site)', dc2: 'Read replica only', risk: 'Critical' },
      { name: 'IBM MQ', dc1: 'Messages queued', dc2: 'Processing from DC2', risk: 'Medium' },
    ],
    expectedConfidence: 38,
    notes: 'CRITICAL SCENARIO: Application would degrade — all writes must traverse cross-site network to IBB1 Oracle PRIMARY. High latency, risk of data loss.',
    blockers: ['Cross-DC write latency would increase Oracle transaction time to 80-200ms', 'If IBB1 network fails, writes would fail entirely'],
  },
  {
    id: 's3', name: 'Stale CMDB + No Traffic Data', description: 'All telemetry except CMDB becomes stale',
    icon: 'clock',
    outcome: 'DEGRADED',
    components: [
      { name: 'API Gateway', dc1: 'Unknown (stale)', dc2: 'Unknown (stale)', risk: 'Medium' },
      { name: 'Oracle DB', dc1: 'CMDB says PRIMARY (unverified)', dc2: 'CMDB says STANDBY (unverified)', risk: 'High' },
      { name: 'IBM MQ', dc1: 'Unknown', dc2: 'Unknown', risk: 'Medium' },
    ],
    expectedConfidence: 22,
    notes: 'System would degrade to CMDB-only topology. Confidence drops dramatically. Do NOT take operational actions based on this state.',
    blockers: ['Cannot confirm Oracle PRIMARY without OEM signal', 'Traffic ownership unknown without AppDynamics'],
  },
  {
    id: 's4', name: 'Everything Healthy (Current State)', description: 'Baseline: current operational state',
    icon: 'check-circle',
    outcome: 'SAFE',
    components: [
      { name: 'API Gateway', dc1: 'Active (94% traffic)', dc2: 'Active (6% traffic)', risk: 'None' },
      { name: 'Oracle DB', dc1: 'PRIMARY Writer', dc2: 'Physical Standby (0s lag)', risk: 'None' },
      { name: 'IBM MQ', dc1: 'Running', dc2: 'Running', risk: 'None' },
    ],
    expectedConfidence: 94,
    notes: 'All systems nominal. IBB1 is authoritative. SHV is ready for promotion if needed.',
    blockers: [],
  },
];

// ─── Scenario 2: Split Brain (DUMPS) ─────────────────────────────────────────

const DUMPS_COMPONENTS: ComponentAuthority[] = [
  {
    id: 'dumps-mongo', name: 'MongoDB Cluster', type: 'DATABASE', technology: 'MongoDB Replica Set',
    dc1Role: 'PRIMARY', dc2Role: 'SECONDARY', dc1Site: 'AZ3', dc2Site: 'SHV',
    authoritative: 'AZ3 (MongoDB Primary)',
    canFailover: true, failoverType: 'AUTOMATIC', failoverRisk: 'Low — automatic election',
    signals: [
      { source: 'MongoDB Prometheus', technology: 'MongoDB', signal: 'rs_state', value: 'PRIMARY (1)', dc: 'AZ3', type: 'deterministic', freshness: 'FRESH', confidence: 3, timestamp: minsAgo(12), detail: 'rs_state=1 (PRIMARY) confirmed for az003-mongo-01. Oplog window: 48h. Health: 1.' },
      { source: 'MongoDB Prometheus', technology: 'MongoDB', signal: 'rs_state', value: 'SECONDARY (2)', dc: 'SHV', type: 'deterministic', freshness: 'FRESH', confidence: 3, timestamp: minsAgo(12), detail: 'rs_state=2 (SECONDARY) for az003-mongo-02. Replica lag: 0.3s.' },
    ],
  },
  {
    id: 'dumps-oracle', name: 'Oracle DUMPS DB', type: 'DATABASE', technology: 'Oracle Standalone',
    dc1Role: 'Active (Primary)', dc2Role: '—', dc1Site: 'SHV', dc2Site: '—',
    authoritative: 'SHV (Only Instance)',
    canFailover: false, failoverType: 'NONE', failoverRisk: 'Critical — no standby configured',
    signals: [
      { source: 'Oracle OEM', technology: 'Oracle', signal: 'db_role', value: 'PRIMARY', dc: 'SHV', type: 'deterministic', freshness: 'FRESH', confidence: 3, timestamp: minsAgo(8), detail: 'dumpsdb@shv02.corp: PRIMARY, no Data Guard standby detected. SPOF risk.' },
    ],
  },
];

const DUMPS_DISCOVERED: DiscoveredSignal[] = [
  { id: 'ds-mongo-rs', technology: 'MongoDB', displayName: 'MongoDB Replica Set Status', signalName: 'RS_STATE (1=PRIMARY, 2=SECONDARY)', apiSource: 'MongoDB Prometheus /metrics', confidence: 3, deterministic: true, category: 'STATE_OWNERSHIP', description: 'rs_state=1 deterministically identifies MongoDB PRIMARY replica. No ambiguity.', shared: true, sampleValue: 'member=az003-mongo-01, rs_state=1' },
  { id: 'ds-oracle-sa', technology: 'Oracle', displayName: 'Oracle Standalone', signalName: 'DB_ROLE (no Data Guard)', apiSource: 'Oracle OEM', confidence: 3, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Single Oracle instance — no replication. SPOF risk flagged.', shared: true, sampleValue: 'db=dumpsdb, mode=READ WRITE, role=PRIMARY' },
];

const DUMPS_TIMELINE: TimelineEvent[] = [
  { id: 'tl-d1', timestamp: minsAgo(180), relativeTime: '3h ago', type: 'STATE_CHANGE', title: 'MongoDB election detected', detail: 'az003-mongo-02 was PRIMARY. Election triggered. az003-mongo-01 elected new PRIMARY in 4.2s.', dc: 'AZ3', impact: 'WARNING', authorityChange: { from: 'az003-mongo-02', to: 'az003-mongo-01' } },
  { id: 'tl-d2', timestamp: minsAgo(170), relativeTime: '170m ago', type: 'RECOVERY', title: 'MongoDB cluster stable', detail: 'All 3 replicas healthy. Primary confirmed az003-mongo-01. Oplog synchronized.', dc: 'AZ3', impact: 'INFO' },
  { id: 'tl-d3', timestamp: minsAgo(12), relativeTime: '12m ago', type: 'STATE_CHANGE', title: 'Telemetry refresh: MongoDB + Oracle', detail: 'Both data sources refreshed. MongoDB PRIMARY confirmed. Oracle SHV: active, no standby.', dc: 'AZ3 + SHV', impact: 'INFO' },
];

const DUMPS_SCENARIOS: ScenarioResult[] = [
  {
    id: 'sd1', name: 'AZ3 Full Failure', description: 'Azure Zone 3 becomes unreachable',
    icon: 'cloud-off',
    outcome: 'FAILED',
    components: [
      { name: 'MongoDB Cluster', dc1: 'OFFLINE (PRIMARY lost)', dc2: 'SECONDARY cannot promote without quorum', risk: 'Critical' },
      { name: 'Oracle DUMPS DB', dc1: 'Still active in SHV', dc2: '—', risk: 'None' },
    ],
    expectedConfidence: 15,
    notes: 'CRITICAL: MongoDB has only 1 secondary in SHV — losing AZ3 primary without quorum means the replica set cannot elect a new primary. Application writes FAIL.',
    blockers: ['MongoDB requires majority quorum — 1 of 2 remaining nodes insufficient', 'Manual rs.reconfig() required to force primary election'],
  },
  {
    id: 'sd2', name: 'Kafka Leader Gap (if Kafka added)', description: 'Theoretical: Kafka with leader partitions in AZ3 only',
    icon: 'git-branch',
    outcome: 'PARTIAL',
    components: [
      { name: 'Kafka (hypothetical)', dc1: 'Leader partitions AZ3 only', dc2: 'Follower partitions SHV', risk: 'High' },
      { name: 'MongoDB Cluster', dc1: 'PRIMARY (AZ3)', dc2: 'Secondary', risk: 'Medium' },
    ],
    expectedConfidence: 48,
    notes: 'If Kafka is introduced: AZ3 would own both MongoDB PRIMARY and Kafka leader partitions — authoritative event processing solely in AZ3.',
    blockers: ['Kafka ISR disruption on AZ3 failure would cause consumer group rebalance', 'Message ordering guarantees break during leader re-election'],
  },
];

// ─── Scenario 3: Split Brain Active (PAYROLL) ────────────────────────────────

const PAYROLL_COMPONENTS: ComponentAuthority[] = [
  {
    id: 'payroll-sql', name: 'Payroll MSSQL', type: 'DATABASE', technology: 'MSSQL AlwaysOn',
    dc1Role: 'PRIMARY (CMDB)', dc2Role: 'SECONDARY (CMDB)',
    dc1Site: 'IBB1', dc2Site: 'SHV',
    authoritative: '⚠ CONFLICT: CMDB says IBB1, OEM says SHV',
    canFailover: true, failoverType: 'MANUAL', failoverRisk: 'CRITICAL — conflicting signals',
    signals: [
      { source: 'CMDB', technology: 'MSSQL', signal: 'replica_role', value: 'PRIMARY', dc: 'IBB1', type: 'conflicting', freshness: 'STALE', confidence: 2, timestamp: minsAgo(155), detail: 'CMDB shows PAYROLL-SQL-01 as PRIMARY. LAST UPDATED 155 minutes ago — data may be outdated.' },
      { source: 'Oracle OEM', technology: 'MSSQL', signal: 'replica_role', value: 'PHYSICAL_STANDBY', dc: 'IBB1', type: 'conflicting', freshness: 'FRESH', confidence: 3, timestamp: minsAgo(30), detail: 'OEM (fresher source) shows PAYROLL-SQL-01 as PHYSICAL_STANDBY. Contradicts CMDB. Manual verification required.' },
    ],
  },
  {
    id: 'payroll-ocp', name: 'Payroll OCP Pods', type: 'COMPUTE', technology: 'OpenShift',
    dc1Role: 'Active', dc2Role: '—',
    dc1Site: 'IBB1', dc2Site: '—',
    authoritative: 'IBB1 (Only Site)',
    canFailover: false, failoverType: 'NONE', failoverRisk: 'High — no OCP in SHV',
    signals: [
      { source: 'CMDB', technology: 'OCP', signal: 'pod_state', value: 'Running', dc: 'IBB1', type: 'inferred', freshness: 'STALE', confidence: 2, timestamp: minsAgo(155), detail: 'CMDB reports pod running. No live OCP metrics — inferred from topology only.' },
    ],
  },
];

const PAYROLL_TIMELINE: TimelineEvent[] = [
  { id: 'tl-p1', timestamp: minsAgo(200), relativeTime: '200m ago', type: 'STATE_CHANGE', title: 'Last known good state from CMDB', detail: 'CMDB reported PAYROLL-SQL-01 as PRIMARY. No conflicts at this point.', dc: 'IBB1', impact: 'INFO' },
  { id: 'tl-p2', timestamp: minsAgo(155), relativeTime: '155m ago', type: 'TELEMETRY_STALE', title: 'CMDB import became stale', detail: 'CMDB has not refreshed since. State accuracy now in question.', dc: 'ALL', impact: 'WARNING' },
  { id: 'tl-p3', timestamp: minsAgo(30), relativeTime: '30m ago', type: 'CONFLICT_DETECTED', title: 'CONFLICT DETECTED: Oracle OEM disagrees with CMDB', detail: 'OEM shows PAYROLL-SQL-01 as PHYSICAL_STANDBY. CMDB says PRIMARY. Confidence dropped to 42%.', dc: 'IBB1', impact: 'CRITICAL', authorityChange: { from: 'CMDB: PRIMARY', to: 'OEM: PHYSICAL_STANDBY' } },
];

const PAYROLL_SCENARIOS: ScenarioResult[] = [
  {
    id: 'sp1', name: 'Current State: CONFLICT — Do Not Act', description: 'Conflicting signals from CMDB and Oracle OEM',
    icon: 'alert-circle',
    outcome: 'FAILED',
    components: [
      { name: 'Payroll MSSQL', dc1: 'CMDB: PRIMARY (stale)', dc2: '—', risk: 'Critical' },
      { name: 'Payroll MSSQL', dc1: 'OEM: PHYSICAL_STANDBY (fresh)', dc2: '—', risk: 'Critical' },
      { name: 'Payroll OCP', dc1: 'Running (inferred)', dc2: '—', risk: 'High' },
    ],
    expectedConfidence: 42,
    notes: 'DO NOT TAKE OPERATIONAL ACTIONS. The authoritative write site is unknown. Acting on either signal could cause data loss or double-writes.',
    blockers: ['Manual DBA verification required — connect directly to PAYROLL-SQL-01 and run SELECT @@SERVERNAME, sys.dm_hadr_availability_replica_states', 'CMDB refresh required immediately'],
  },
];

// ─── Scenario 4: Active Traffic But No Writes (CLAIMS) ────────────────────────

const CLAIMS_COMPONENTS: ComponentAuthority[] = [
  {
    id: 'claims-oracle', name: 'Claims Oracle DB', type: 'DATABASE', technology: 'Oracle',
    dc1Role: 'UNKNOWN', dc2Role: '—',
    dc1Site: 'IBB1', dc2Site: '—',
    authoritative: 'UNKNOWN — telemetry too stale',
    canFailover: false, failoverType: 'NONE', failoverRisk: 'Unknown — no data',
    signals: [
      { source: 'Oracle OEM', technology: 'Oracle', signal: 'db_role', value: 'UNKNOWN', dc: 'IBB1', type: 'missing', freshness: 'MISSING', confidence: 1, timestamp: minsAgo(280), detail: 'Last OEM data is 280 minutes old. State cannot be determined. Do not assume ACTIVE.' },
    ],
  },
];

const CLAIMS_TIMELINE: TimelineEvent[] = [
  { id: 'tl-c1', timestamp: minsAgo(300), relativeTime: '5h ago', type: 'STATE_CHANGE', title: 'Last valid signal received', detail: 'Oracle OEM last reported Claims DB as UNKNOWN state.', dc: 'IBB1', impact: 'WARNING' },
  { id: 'tl-c2', timestamp: minsAgo(280), relativeTime: '280m ago', type: 'TELEMETRY_STALE', title: 'All telemetry became very stale', detail: 'MQ, MongoDB, OEM all showing VERY_STALE. System state completely unknown.', dc: 'ALL', impact: 'CRITICAL' },
];

const CLAIMS_SCENARIOS: ScenarioResult[] = [
  {
    id: 'sc1', name: 'No Data — Cannot Assess', description: 'All telemetry is 4+ hours stale',
    icon: 'help-circle',
    outcome: 'FAILED',
    components: [
      { name: 'Claims Oracle DB', dc1: 'Status: UNKNOWN', dc2: '—', risk: 'Unknown' },
    ],
    expectedConfidence: 8,
    notes: 'System is effectively blind. Assigning any state would be guessing. Refresh all telemetry sources before making any decisions.',
    blockers: ['No deterministic signals available', 'Do not assume system is operational', 'Immediate telemetry refresh required'],
  },
];

// ─── All App Verdicts ─────────────────────────────────────────────────────────

export const RUNTIME_VERDICTS: RuntimeVerdict[] = [
  {
    appId: 'PCA', appName: 'PCA', environment: 'PRODUCTION',
    authoritativeSite: 'IBB1', authoritativeSiteLabel: 'DC Birmingham IBB1',
    canServeTransactions: true,
    confidence: 94,
    confidenceBreakdown: {
      freshness: 24,
      determinism: 25,
      agreement: 23,
      coverage: 22,
      total: 94,
      explanation: [
        'Freshness (24/25): 3 of 4 sources fresh (<15 min). CMDB is stale (135 min) — minor deduction.',
        'Determinism (25/25): Oracle OEM, IBM MQ all provide directly verifiable state. No hostname inference.',
        'Agreement (23/25): All sources agree IBB1 is authoritative. Minor deduction for CMDB gap.',
        'Coverage (22/25): Oracle, MQ, AppDynamics all covered. No Kafka or file-share coverage needed.',
      ],
    },
    risk: 'LOW',
    riskReason: 'All primary signals fresh and aligned. Oracle PRIMARY confirmed. SHV standby has 0s lag.',
    stateOwner: 'IBB1 (Oracle PRIMARY, MQ Active)',
    trafficOwner: 'IBB1 (94% via AppDynamics)',
    dc2CanTakeOver: true,
    dc2ReadinessPercent: 91,
    verdictSummary: 'IBB1 is the authoritative runtime site. Oracle write authority confirmed. SHV is warm standby at 91% readiness. Safe to process customer transactions.',
    components: PCA_COMPONENTS,
    signals: PCA_COMPONENTS.flatMap(c => c.signals),
    scenarios: PCA_SCENARIOS,
    discoveredSignals: PCA_DISCOVERED,
  },
  {
    appId: 'DUMPS', appName: 'DUMPS', environment: 'PRODUCTION',
    authoritativeSite: 'AZ3', authoritativeSiteLabel: 'Azure Zone 3',
    canServeTransactions: true,
    confidence: 78,
    confidenceBreakdown: {
      freshness: 20,
      determinism: 22,
      agreement: 20,
      coverage: 16,
      total: 78,
      explanation: [
        'Freshness (20/25): MongoDB refreshed 12m ago. Oracle OEM 8m ago. No AppDynamics traffic data.',
        'Determinism (22/25): MongoDB rs_state=1 is deterministic. Oracle role confirmed.',
        'Agreement (20/25): Sources agree on MongoDB PRIMARY. Oracle has no standby — SPOF flagged.',
        'Coverage (16/25): Missing traffic telemetry (AppDynamics). No Kafka. Oracle SPOF is major gap.',
      ],
    },
    risk: 'MEDIUM',
    riskReason: 'Oracle DUMPS DB has no standby configured. Single Point of Failure if SHV is lost.',
    stateOwner: 'AZ3 (MongoDB PRIMARY) + SHV (Oracle - SPOF)',
    trafficOwner: 'AZ3 (inferred from MongoDB primary)',
    dc2CanTakeOver: false,
    dc2ReadinessPercent: 45,
    verdictSummary: 'AZ3 owns MongoDB write authority. SHV hosts Oracle with no standby — critical SPOF. Transactions can proceed but resilience is limited.',
    components: DUMPS_COMPONENTS,
    signals: DUMPS_COMPONENTS.flatMap(c => c.signals),
    scenarios: DUMPS_SCENARIOS,
    discoveredSignals: DUMPS_DISCOVERED,
  },
  {
    appId: 'PAYROLL', appName: 'Payroll System', environment: 'PRODUCTION',
    authoritativeSite: 'CONFLICT',
    authoritativeSiteLabel: 'CONFLICT — Manual Verification Required',
    canServeTransactions: false,
    confidence: 42,
    confidenceBreakdown: {
      freshness: 8,
      determinism: 12,
      agreement: 5,
      coverage: 17,
      total: 42,
      explanation: [
        'Freshness (8/25): CMDB is 155 min stale. No live transaction telemetry.',
        'Determinism (12/25): OEM signal is deterministic but conflicts with CMDB. Both penalized.',
        'Agreement (5/25): CMDB says PRIMARY, OEM says PHYSICAL_STANDBY for same asset — maximum disagreement.',
        'Coverage (17/25): SQL and OCP covered. No AppDynamics, no MQ.',
      ],
    },
    risk: 'CRITICAL',
    riskReason: 'CMDB and Oracle OEM disagree on write authority. DO NOT TAKE OPERATIONAL ACTIONS without manual DBA verification.',
    stateOwner: 'UNKNOWN — conflicting sources',
    trafficOwner: 'UNKNOWN — no traffic telemetry',
    dc2CanTakeOver: false,
    dc2ReadinessPercent: 0,
    verdictSummary: 'CRITICAL CONFLICT. Cannot determine authoritative write site. CMDB says IBB1 is PRIMARY; Oracle OEM (fresher, 30m ago) says it is PHYSICAL_STANDBY. Manual verification required before any action.',
    components: PAYROLL_COMPONENTS,
    signals: PAYROLL_COMPONENTS.flatMap(c => c.signals),
    scenarios: PAYROLL_SCENARIOS,
    discoveredSignals: [],
  },
  {
    appId: 'CLAIMS', appName: 'Claims Processing', environment: 'PRODUCTION',
    authoritativeSite: 'UNKNOWN',
    authoritativeSiteLabel: 'UNKNOWN — All Telemetry Stale',
    canServeTransactions: false,
    confidence: 8,
    confidenceBreakdown: {
      freshness: 2,
      determinism: 3,
      agreement: 0,
      coverage: 3,
      total: 8,
      explanation: [
        'Freshness (2/25): All signals are 4.5+ hours old. Cannot trust any state.',
        'Determinism (3/25): Oracle OEM would be deterministic, but data is too old to act on.',
        'Agreement (0/25): Cannot assess agreement with only 1 very-stale source.',
        'Coverage (3/25): Only Oracle covered. Missing MQ, traffic, and compute telemetry.',
      ],
    },
    risk: 'CRITICAL',
    riskReason: 'All telemetry is very stale. System state is unknown. Assume system may not be operational.',
    stateOwner: 'UNKNOWN',
    trafficOwner: 'UNKNOWN',
    dc2CanTakeOver: false,
    dc2ReadinessPercent: 0,
    verdictSummary: 'UNKNOWN state. All telemetry older than 4 hours. Cannot determine if Claims Processing is operational. Do not route critical transactions until telemetry is refreshed.',
    components: CLAIMS_COMPONENTS,
    signals: CLAIMS_COMPONENTS.flatMap(c => c.signals),
    scenarios: CLAIMS_SCENARIOS,
    discoveredSignals: [],
  },
];

export function getRuntimeVerdict(appId: string): RuntimeVerdict | undefined {
  return RUNTIME_VERDICTS.find(v => v.appId === appId);
}

export function getAllVerdicts(): RuntimeVerdict[] {
  return RUNTIME_VERDICTS;
}

export function getTimeline(appId: string): TimelineEvent[] {
  const map: Record<string, TimelineEvent[]> = {
    PCA: PCA_TIMELINE,
    DUMPS: DUMPS_TIMELINE,
    PAYROLL: PAYROLL_TIMELINE,
    CLAIMS: CLAIMS_TIMELINE,
  };
  return map[appId] ?? [];
}

// ─── Global Data Discovery Marketplace ───────────────────────────────────────

export const GLOBAL_DISCOVERED_SIGNALS: DiscoveredSignal[] = [
  ...PCA_DISCOVERED,
  ...DUMPS_DISCOVERED,
  { id: 'ds-kafka-leader', technology: 'Kafka', displayName: 'Kafka Leader Election', signalName: 'PARTITION_LEADER', apiSource: 'Kafka Admin API /admin/v2/brokers', confidence: 4, deterministic: true, category: 'STATE_OWNERSHIP', description: 'Leader partition assignment proves which broker (and DC) owns authoritative event processing for each topic partition.', shared: false, sampleValue: 'topic=payroll-events, partition=0, leader=kafka-ibb1-01' },
  { id: 'ds-netapp', technology: 'Storage', displayName: 'NetApp SnapMirror', signalName: 'VOLUME_WRITE_OWNERSHIP', apiSource: 'NetApp REST API /storage/volumes', confidence: 4, deterministic: true, category: 'STATE_OWNERSHIP', description: 'SnapMirror relationship shows which volume is RW (source) vs DP (destination). Determines file share write authority.', shared: false, sampleValue: 'volume=claims-nfs-vol, type=RW, site=IBB1' },
  { id: 'ds-gslb-2', technology: 'Network', displayName: 'F5 / AVI GSLB', signalName: 'POOL_MEMBER_ACTIVE', apiSource: 'F5 iControl REST /mgmt/tm/gtm', confidence: 4, deterministic: true, category: 'TRAFFIC_FLOW', description: 'GSLB pool member status shows which data center is actively receiving DNS-resolved connections.', shared: true, sampleValue: 'vs=pca-prod-vs, active_member=IBB1-pool-01' },
  { id: 'ds-appdyn-2', technology: 'APM', displayName: 'AppDynamics Node Health', signalName: 'TRANSACTION_RATE_PER_NODE', apiSource: 'AppDynamics /api/v1/applications', confidence: 4, deterministic: true, category: 'TRAFFIC_FLOW', description: 'Per-node call rates prove which DC\'s compute is actively processing user transactions.', shared: true, sampleValue: 'app=PCA, node=IBB1-pod-01, calls=4440/min' },
  { id: 'ds-splunk', technology: 'Log', displayName: 'Splunk App Logs', signalName: 'LOG_VOLUME_PER_DC', apiSource: 'Splunk REST API /services/search', confidence: 2, deterministic: false, category: 'TRAFFIC_FLOW', description: 'Log volume per data center can infer traffic distribution but is not authoritative — depends on logging consistency.', shared: false, sampleValue: 'dc=IBB1, events/min=12400, dc=SHV, events/min=800' },
];
