/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Mock data for the Validate step. No backend — purely static
 * cutover checklist, confidence breakdown, drift detection,
 * alignment checks, synthetic transaction results, and an
 * executive report payload used to render the two Validate tabs.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Database as DatabaseIcon,
  Network as NetworkIcon,
  Shield as ShieldIcon,
  Globe as GlobeIcon,
  Server as ServerIcon,
  Activity as ActivityIcon,
  Boxes as BoxesIcon,
  Lock as LockIcon,
} from 'lucide-react';

// ─── Validation checklist ───────────────────────────────────────────────────

export type ChecklistStatus = 'pass' | 'warn' | 'fail' | 'pending';

export const CHECKLIST_STATUS_META: Record<
  ChecklistStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  pass:    { label: 'Pass',    color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  warn:    { label: 'Warn',    color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  fail:    { label: 'Fail',    color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
  pending: { label: 'Pending', color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
};

export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
  verifiedAt: string;
}

export const validationChecklist: ChecklistItem[] = [
  {
    id: 'ck-1',
    category: 'Database',
    label: 'Oracle primary accepting writes on target',
    status: 'pass',
    detail: 'ORA-CLAIMDB-02 switched to primary role. Apply lag under 1s. 14k transactions verified.',
    verifiedAt: '2026-07-14 15:02',
  },
  {
    id: 'ck-2',
    category: 'Database',
    label: 'Data Guard standby in sync',
    status: 'pass',
    detail: 'Standby apply lag 0.8s (threshold <5s). Switchover verified safe.',
    verifiedAt: '2026-07-14 15:04',
  },
  {
    id: 'ck-3',
    category: 'Messaging',
    label: 'Kafka topic offsets match source',
    status: 'pass',
    detail: 'All 5 topics replicated. Consumer group offsets within 200ms of source.',
    verifiedAt: '2026-07-14 15:06',
  },
  {
    id: 'ck-4',
    category: 'Messaging',
    label: 'MQ channels re-established',
    status: 'warn',
    detail: 'MQ-BILLING-QM channel up, but 2 messages in backlog queue draining.',
    verifiedAt: '2026-07-14 15:08',
  },
  {
    id: 'ck-5',
    category: 'DNS',
    label: 'DNS records propagated',
    status: 'pass',
    detail: '47/48 records live. 1 stale record expired after TTL window.',
    verifiedAt: '2026-07-14 15:10',
  },
  {
    id: 'ck-6',
    category: 'Firewall',
    label: 'Egress rules cleaned up',
    status: 'pass',
    detail: 'Retired-subnet rules removed. Asymmetric routing risk cleared.',
    verifiedAt: '2026-07-14 15:12',
  },
  {
    id: 'ck-7',
    category: 'Secrets',
    label: 'Vault secrets synced to target',
    status: 'pass',
    detail: 'All 6 application secrets present in target vault namespace.',
    verifiedAt: '2026-07-14 15:14',
  },
  {
    id: 'ck-8',
    category: 'Certificates',
    label: 'TLS certificates valid on target gateway',
    status: 'warn',
    detail: 'edge-gateway cert valid but expires in 21 days — renewal recommended.',
    verifiedAt: '2026-07-14 15:16',
  },
  {
    id: 'ck-9',
    category: 'Monitoring',
    label: 'Alerting dashboards live on target',
    status: 'pass',
    detail: 'All 8 dashboards cloned. Alert rules active.',
    verifiedAt: '2026-07-14 15:18',
  },
  {
    id: 'ck-10',
    category: 'Traffic',
    label: 'Traffic shifted 100% to target',
    status: 'pass',
    detail: 'VIP failover complete. Source datacenter receiving zero production traffic.',
    verifiedAt: '2026-07-14 15:20',
  },
  {
    id: 'ck-11',
    category: 'Rollback',
    label: 'Rollback window open',
    status: 'pending',
    detail: 'Rollback window remains open until 18:00 UTC. Source infra on standby.',
    verifiedAt: '2026-07-14 15:22',
  },
  {
    id: 'ck-12',
    category: 'Application',
    label: 'Smoke tests on all Tier 1 apps',
    status: 'fail',
    detail: 'claims-service health endpoint returning 503. Investigating pod restart loop.',
    verifiedAt: '2026-07-14 15:24',
  },
];

// ─── Confidence breakdown ───────────────────────────────────────────────────

export interface ConfidenceSignal {
  id: string;
  source: string;
  icon: LucideIcon;
  iconColor: string;
  score: number;
  weight: number;
  detail: string;
}

export const confidenceSignals: ConfidenceSignal[] = [
  {
    id: 'cs-1',
    source: 'Database Sync',
    icon: DatabaseIcon,
    iconColor: '#FF003C',
    score: 98,
    weight: 25,
    detail: 'Oracle Data Guard apply lag 0.8s. Zero data loss on switchover.',
  },
  {
    id: 'cs-2',
    source: 'Traffic Verification',
    icon: NetworkIcon,
    iconColor: '#006CFF',
    score: 95,
    weight: 20,
    detail: 'VIP failover complete. 100% production traffic on target cluster.',
  },
  {
    id: 'cs-3',
    source: 'Secrets Integrity',
    icon: LockIcon,
    iconColor: '#7800FF',
    score: 100,
    weight: 15,
    detail: 'All 6 application secrets present and unexpired in target vault.',
  },
  {
    id: 'cs-4',
    source: 'DNS Resolution',
    icon: GlobeIcon,
    iconColor: '#14B8A6',
    score: 92,
    weight: 10,
    detail: '47/48 records live. 1 record expired after TTL — resolved.',
  },
  {
    id: 'cs-5',
    source: 'Application Health',
    icon: BoxesIcon,
    iconColor: '#FFB100',
    score: 71,
    weight: 20,
    detail: 'claims-service returning 503 on health endpoint. Other apps healthy.',
  },
  {
    id: 'cs-6',
    source: 'Monitoring Coverage',
    icon: ActivityIcon,
    iconColor: '#00B074',
    score: 96,
    weight: 10,
    detail: '8 dashboards live, alerting active on target observability stack.',
  },
];

export const VALIDATION_CONFIDENCE = 88;

// ─── Confidence comparison chart ────────────────────────────────────────────

export interface ConfidencePoint {
  label: string;
  before: number;
  after: number;
}

export const confidenceComparison: ConfidencePoint[] = [
  { label: 'Database', before: 72, after: 98 },
  { label: 'Messaging', before: 60, after: 85 },
  { label: 'DNS', before: 88, after: 92 },
  { label: 'Firewall', before: 70, after: 96 },
  { label: 'Secrets', before: 50, after: 100 },
  { label: 'Application', before: 64, after: 71 },
  { label: 'Monitoring', before: 80, after: 96 },
];

// ─── Drift detection ────────────────────────────────────────────────────────

export type DriftSeverity = 'low' | 'medium' | 'high';

export const DRIFT_SEVERITY_META: Record<
  DriftSeverity,
  { color: string; bg: string; border: string }
> = {
  low:    { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  medium: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  high:   { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
};

export interface DriftItem {
  id: string;
  asset: string;
  field: string;
  expected: string;
  actual: string;
  severity: DriftSeverity;
  detail: string;
}

export const driftItems: DriftItem[] = [
  {
    id: 'dr-1',
    asset: 'claims-service',
    field: 'replica count',
    expected: '4',
    actual: '3',
    severity: 'high',
    detail: 'Target deployment scaled to 3 replicas; source ran 4. One pod in CrashLoopBackOff.',
  },
  {
    id: 'dr-2',
    asset: 'payment-gateway-svc',
    field: 'JVM heap',
    expected: '4 Gi',
    actual: '4 Gi',
    severity: 'low',
    detail: 'No drift. Memory limit matches source configuration.',
  },
  {
    id: 'dr-3',
    asset: 'billing-service',
    field: 'connection pool',
    expected: '20',
    actual: '15',
    severity: 'medium',
    detail: 'Datasource max-pool-size 15 on target vs 20 on source. Under load may saturate.',
  },
  {
    id: 'dr-4',
    asset: 'routing-engine',
    field: 'Kafka consumer threads',
    expected: '8',
    actual: '8',
    severity: 'low',
    detail: 'No drift. Consumer thread count matches source.',
  },
  {
    id: 'dr-5',
    asset: 'edge-gateway',
    field: 'TLS cipher suite',
    expected: 'TLS_AES_256_GCM',
    actual: 'TLS_AES_128_GCM',
    severity: 'medium',
    detail: 'Target gateway negotiated weaker cipher. Security team flagged for remediation.',
  },
];

// ─── Alignment checks ───────────────────────────────────────────────────────

export type AlignmentStatus = 'aligned' | 'partial' | 'misaligned';

export const ALIGNMENT_STATUS_META: Record<
  AlignmentStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  aligned:     { label: 'Aligned',     color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  partial:     { label: 'Partial',     color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  misaligned:  { label: 'Misaligned',  color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
};

export interface AlignmentCheck {
  id: string;
  domain: string;
  intent: string;
  actual: string;
  status: AlignmentStatus;
  detail: string;
}

export const alignmentChecks: AlignmentCheck[] = [
  {
    id: 'al-1',
    domain: 'Compute',
    intent: '4 replicas for Tier 1 apps',
    actual: '4 replicas on target',
    status: 'aligned',
    detail: 'payment-gateway-svc and policy-admin-svc match intended replica count.',
  },
  {
    id: 'al-2',
    domain: 'Compute',
    intent: '4 replicas for claims-service',
    actual: '3 replicas on target',
    status: 'misaligned',
    detail: 'claims-service running 3/4 replicas. CrashLoopBackOff on 1 pod.',
  },
  {
    id: 'al-3',
    domain: 'Network',
    intent: 'TLS_AES_256_GCM on edge gateway',
    actual: 'TLS_AES_128_GCM negotiated',
    status: 'misaligned',
    detail: 'Cipher suite downgrade detected. Remediation ticket opened.',
  },
  {
    id: 'al-4',
    domain: 'Data',
    intent: 'Zero data loss on Oracle switchover',
    actual: '0 rows lost, apply lag 0.8s',
    status: 'aligned',
    detail: 'Data Guard switchover completed with zero data loss.',
  },
  {
    id: 'al-5',
    domain: 'Messaging',
    intent: 'Kafka offsets within 200ms',
    actual: 'Offsets within 180ms',
    status: 'aligned',
    detail: 'MirrorMaker 2 offset checkpoint verified across all topics.',
  },
  {
    id: 'al-6',
    domain: 'Security',
    intent: 'All secrets in target vault',
    actual: '6/6 secrets present',
    status: 'aligned',
    detail: 'Vault sync complete for all application secrets.',
  },
  {
    id: 'al-7',
    domain: 'Observability',
    intent: '8 dashboards + alerting on target',
    actual: '8 dashboards, 7/8 alert rules active',
    status: 'partial',
    detail: 'claims-service alert rule pending — blocked by 503 health endpoint.',
  },
];

// ─── Synthetic transactions ─────────────────────────────────────────────────

export type SynthTxStatus = 'success' | 'degraded' | 'failed';

export const SYNTH_TX_STATUS_META: Record<
  SynthTxStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  success:  { label: 'Success',  color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  degraded: { label: 'Degraded', color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  failed:   { label: 'Failed',   color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
};

export interface SyntheticTransaction {
  id: string;
  name: string;
  endpoint: string;
  status: SynthTxStatus;
  responseTimeMs: number;
  baselineMs: number;
  successRate: number;
  detail: string;
}

export const syntheticTransactions: SyntheticTransaction[] = [
  {
    id: 'st-1',
    name: 'Payment Authorization',
    endpoint: 'POST /api/v1/payments/auth',
    status: 'success',
    responseTimeMs: 142,
    baselineMs: 150,
    successRate: 100,
    detail: 'Authorization round-trip within baseline. 3 of 3 test cards approved.',
  },
  {
    id: 'st-2',
    name: 'Claims Submission',
    endpoint: 'POST /api/v1/claims',
    status: 'failed',
    responseTimeMs: 5200,
    baselineMs: 300,
    successRate: 0,
    detail: 'Claims endpoint returning 503. Pod restart loop on claims-service.',
  },
  {
    id: 'st-3',
    name: 'Policy Lookup',
    endpoint: 'GET /api/v1/policies/{id}',
    status: 'success',
    responseTimeMs: 88,
    baselineMs: 95,
    successRate: 100,
    detail: 'Policy lookup response within baseline. Mongo replica read healthy.',
  },
  {
    id: 'st-4',
    name: 'Billing Cycle Run',
    endpoint: 'POST /api/v1/billing/cycle',
    status: 'degraded',
    responseTimeMs: 4100,
    baselineMs: 2200,
    successRate: 92,
    detail: 'Billing cycle completed but 1.8x slower than baseline. Connection pool saturation suspected.',
  },
  {
    id: 'st-5',
    name: 'Notification Dispatch',
    endpoint: 'POST /api/v1/notifications/send',
    status: 'success',
    responseTimeMs: 64,
    baselineMs: 70,
    successRate: 100,
    detail: 'Notification dispatch within baseline. Kafka producer ack healthy.',
  },
  {
    id: 'st-6',
    name: 'Invoice Generation',
    endpoint: 'POST /api/v1/invoices',
    status: 'success',
    responseTimeMs: 210,
    baselineMs: 230,
    successRate: 100,
    detail: 'Invoice generation within baseline. Oracle link healthy.',
  },
];

// ─── Executive report ────────────────────────────────────────────────────────

export interface ReportDatacenter {
  id: string;
  name: string;
  status: 'exited' | 'standby' | 'active';
  appsMigrated: number;
  appsRemaining: number;
  detail: string;
}

export const reportDatacenters: ReportDatacenter[] = [
  {
    id: 'dc-1',
    name: 'DC-EAST-01 (Source)',
    status: 'standby',
    appsMigrated: 7,
    appsRemaining: 0,
    detail: 'All 7 in-scope applications migrated. Datacenter on standby for rollback window until 18:00 UTC.',
  },
  {
    id: 'dc-2',
    name: 'DC-WEST-02 (Target)',
    status: 'active',
    appsMigrated: 7,
    appsRemaining: 0,
    detail: 'Receiving 100% of production traffic. All migrated applications live.',
  },
];

export interface ReportApplication {
  id: string;
  name: string;
  tier: 'T1' | 'T2' | 'T3';
  status: SynthTxStatus;
  confidence: number;
  detail: string;
}

export const reportApplications: ReportApplication[] = [
  { id: 'ra-1', name: 'payment-gateway-svc', tier: 'T1', status: 'success', confidence: 96, detail: 'Cutover complete. Synthetic transactions passing.' },
  { id: 'ra-2', name: 'claims-service',      tier: 'T1', status: 'failed',  confidence: 61, detail: 'Health endpoint returning 503. Pod restart loop under investigation.' },
  { id: 'ra-3', name: 'policy-admin-svc',    tier: 'T1', status: 'success', confidence: 92, detail: 'Cutover complete. Mongo replica sync verified.' },
  { id: 'ra-4', name: 'billing-service',     tier: 'T2', status: 'degraded',confidence: 74, detail: 'Billing cycle running 1.8x slower than baseline.' },
  { id: 'ra-5', name: 'routing-engine',      tier: 'T2', status: 'success', confidence: 88, detail: 'Kafka consumer offsets synced. Target pods stable.' },
  { id: 'ra-6', name: 'notification-svc',    tier: 'T3', status: 'success', confidence: 90, detail: 'Notification dispatch within baseline.' },
  { id: 'ra-7', name: 'invoice-generator',   tier: 'T3', status: 'success', confidence: 91, detail: 'Invoice generation within baseline.' },
];

export interface ReportDowntime {
  id: string;
  application: string;
  duration: string;
  window: string;
  impact: 'none' | 'minimal' | 'moderate' | 'significant';
  detail: string;
}

export const reportDowntime: ReportDowntime[] = [
  {
    id: 'dt-1',
    application: 'payment-gateway-svc',
    duration: '0 min',
    window: '14:30 – 15:00 UTC',
    impact: 'none',
    detail: 'Zero-downtime cutover via VIP failover. No customer-visible interruption.',
  },
  {
    id: 'dt-2',
    application: 'claims-service',
    duration: '12 min',
    window: '15:00 – 15:12 UTC',
    impact: 'moderate',
    detail: 'Claims submission unavailable during pod restart loop. 36 customers affected.',
  },
  {
    id: 'dt-3',
    application: 'billing-service',
    duration: '0 min',
    window: '15:05 – 15:25 UTC',
    impact: 'minimal',
    detail: 'No downtime but billing cycle latency 1.8x baseline. No transactions lost.',
  },
  {
    id: 'dt-4',
    application: 'policy-admin-svc',
    duration: '0 min',
    window: '15:10 – 15:30 UTC',
    impact: 'none',
    detail: 'Zero-downtime cutover. Mongo replica failover transparent to clients.',
  },
];

export const DOWNTIME_IMPACT_META: Record<
  ReportDowntime['impact'],
  { color: string; bg: string; border: string }
> = {
  none:         { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  minimal:      { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  moderate:     { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  significant:  { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
};

export interface ReportSignOff {
  id: string;
  role: string;
  name: string;
  status: 'signed' | 'pending';
  signedAt: string;
  comment: string;
}

export const reportSignOffs: ReportSignOff[] = [
  {
    id: 'so-1',
    role: 'Migration Lead',
    name: 'Sarah Chen',
    status: 'signed',
    signedAt: '2026-07-14 15:30 UTC',
    comment: 'Cutover executed per runbook. Claims-service incident under active remediation.',
  },
  {
    id: 'so-2',
    role: 'Platform Operations',
    name: 'Marcus Webb',
    status: 'signed',
    signedAt: '2026-07-14 15:32 UTC',
    comment: 'Target cluster healthy. Monitoring and alerting confirmed live.',
  },
  {
    id: 'so-3',
    role: 'Security Officer',
    name: 'Priya Nair',
    status: 'pending',
    signedAt: '—',
    comment: 'Pending TLS cipher suite remediation review on edge-gateway.',
  },
  {
    id: 'so-4',
    role: 'Business Sponsor',
    name: 'James O’Connor',
    status: 'pending',
    signedAt: '—',
    comment: 'Awaiting claims-service restoration before final sign-off.',
  },
];

export interface ExecutiveSummary {
  reportId: string;
  sessionName: string;
  cutoverDate: string;
  preparedBy: string;
  preparedByRole: string;
  overallConfidence: number;
  headline: string;
  narrative: string;
}

export const executiveSummary: ExecutiveSummary = {
  reportId: 'DC-EXIT-2026-0714',
  sessionName: 'DC-EAST-01 → DC-WEST-02 Migration',
  cutoverDate: '2026-07-14',
  preparedBy: 'Sarah Chen',
  preparedByRole: 'Migration Lead',
  overallConfidence: 88,
  headline: 'Conditional Exit Validated — 1 application incident active',
  narrative:
    'The DC-EAST-01 to DC-WEST-02 migration cutover completed with 6 of 7 applications fully validated and passing synthetic transactions. claims-service is experiencing a pod restart loop causing a 503 on its health endpoint; this is under active remediation with an estimated 30-minute resolution. All other Tier 1 applications (payment-gateway-svc, policy-admin-svc) are healthy with zero customer-visible downtime. Overall validation confidence is 88/100. Data Guard switchover achieved zero data loss. Source datacenter remains on standby for the rollback window until 18:00 UTC. Recommend conditional exit approval pending claims-service restoration and Security Officer sign-off on the edge-gateway TLS cipher remediation.',
};
