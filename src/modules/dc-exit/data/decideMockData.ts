/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Mock data for the Decide step. No backend — purely static
 * readiness checks, prioritization table, and decision center
 * evidence used to render the three Decide tabs.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Database as DatabaseIcon,
  Flame as KafkaIcon,
  FlameKindling as MqIcon,
  Globe as DnsIcon,
  Shield as FirewallIcon,
  FileCheck as CertIcon,
  HardDrive as StorageIcon,
  KeyRound as SecretsIcon,
  RefreshCw as ReplicationIcon,
  Activity as MonitoringIcon,
} from 'lucide-react';

export type ReadinessStatus = 'pass' | 'warn' | 'fail';

export type HealthState = 'healthy' | 'degraded' | 'down';

export const READINESS_SCORE = 72;
export const READINESS_SCORE_LABEL = 'Migration Readiness';

export const READINESS_SCORE_META: Record<
  'safe' | 'conditional' | 'blocked',
  { color: string; bg: string; border: string }
> = {
  safe:        { color: '#00B074', bg: 'rgba(0,176,116,0.08)',  border: 'rgba(0,176,116,0.22)' },
  conditional: { color: '#FFB100', bg: 'rgba(255,177,0,0.08)',  border: 'rgba(255,177,0,0.22)' },
  blocked:     { color: '#FF003C', bg: 'rgba(255,0,60,0.08)',   border: 'rgba(255,0,60,0.22)' },
};

export interface ReadinessCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  status: ReadinessStatus;
  score: number;
  total: number;
  detail: string;
}

export const readinessCategories: ReadinessCategory[] = [
  {
    id: 'database',
    label: 'Database',
    icon: DatabaseIcon,
    iconColor: '#FF003C',
    iconBg: 'rgba(255,0,60,0.08)',
    status: 'warn',
    score: 4,
    total: 5,
    detail: 'ORA-CLAIMDB-02 standby lag exceeds 30s; Data Guard sync pending.',
  },
  {
    id: 'kafka',
    label: 'Kafka',
    icon: KafkaIcon,
    iconColor: '#FF6B35',
    iconBg: 'rgba(255,107,53,0.10)',
    status: 'pass',
    score: 5,
    total: 5,
    detail: 'All topics replicated to target cluster. Consumer group offsets verified.',
  },
  {
    id: 'mq',
    label: 'MQ',
    icon: MqIcon,
    iconColor: '#FFB100',
    iconBg: 'rgba(255,177,0,0.08)',
    status: 'warn',
    score: 2,
    total: 3,
    detail: 'MQ-BILLING-QM queue manager in degraded state; 1 channel unreachable.',
  },
  {
    id: 'dns',
    label: 'DNS',
    icon: DnsIcon,
    iconColor: '#14B8A6',
    iconBg: 'rgba(20,184,166,0.08)',
    status: 'pass',
    score: 47,
    total: 48,
    detail: 'Zone transfers complete. 1 stale record pending TTL expiry.',
  },
  {
    id: 'firewall',
    label: 'Firewall',
    icon: FirewallIcon,
    iconColor: '#3B82F6',
    iconBg: 'rgba(59,130,246,0.10)',
    status: 'warn',
    score: 10,
    total: 12,
    detail: '2 egress rules reference retired subnets; cleanup required before cutover.',
  },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: CertIcon,
    iconColor: '#FFB100',
    iconBg: 'rgba(255,177,0,0.08)',
    status: 'warn',
    score: 8,
    total: 9,
    detail: 'edge-gateway TLS cert expires in 21 days — renew before migration window.',
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: StorageIcon,
    iconColor: '#8A97A8',
    iconBg: 'rgba(138,151,168,0.10)',
    status: 'pass',
    score: 6,
    total: 7,
    detail: 'Persistent volumes mapped to target storage class. 1 stale snapshot.',
  },
  {
    id: 'secrets',
    label: 'Secrets',
    icon: SecretsIcon,
    iconColor: '#7800FF',
    iconBg: 'rgba(120,0,255,0.08)',
    status: 'fail',
    score: 3,
    total: 6,
    detail: '3 application secrets not synced to target vault; rotation required.',
  },
  {
    id: 'replication',
    label: 'Replication',
    icon: ReplicationIcon,
    iconColor: '#006CFF',
    iconBg: 'rgba(0,108,255,0.08)',
    status: 'warn',
    score: 4,
    total: 5,
    detail: 'Oracle Data Guard lag on standby; Kafka mirror-maker 2 healthy.',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: MonitoringIcon,
    iconColor: '#00B074',
    iconBg: 'rgba(0,176,116,0.08)',
    status: 'pass',
    score: 5,
    total: 5,
    detail: 'Dashboards and alerting cloned to target observability stack.',
  },
];

export interface ReadinessBlocker {
  id: string;
  category: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  owner: string;
  dueDate: string;
  detail: string;
}

export const readinessBlockers: ReadinessBlocker[] = [
  {
    id: 'blk-1',
    category: 'Secrets',
    title: '3 vault secrets not synced to target',
    severity: 'critical',
    owner: 'Platform Security',
    dueDate: '2026-07-16',
    detail: 'payment-gateway-svc, claims-service, and billing-service reference secrets absent in the target vault. Cutover will fail at pod startup.',
  },
  {
    id: 'blk-2',
    category: 'Database',
    title: 'ORA-CLAIMDB-02 standby lag exceeds 30s',
    severity: 'high',
    owner: 'Database Ops',
    dueDate: '2026-07-17',
    detail: 'Data Guard sync lag blocks zero-downtime switchover. Resolve gap and verify apply-on before the cutover window.',
  },
  {
    id: 'blk-3',
    category: 'MQ',
    title: 'MQ-BILLING-QM channel unreachable',
    severity: 'high',
    owner: 'Messaging Team',
    dueDate: '2026-07-18',
    detail: 'SVRCONN channel to billing queue manager is down. Card authorization path depends on this channel.',
  },
  {
    id: 'blk-4',
    category: 'Firewall',
    title: '2 egress rules reference retired subnets',
    severity: 'medium',
    owner: 'Network Engineering',
    dueDate: '2026-07-19',
    detail: 'Retired-subnet rules will cause asymmetric routing post-migration. Cleanup required before traffic shifting.',
  },
];

// ─── Prioritization ─────────────────────────────────────────────────────────

export type ComplexityLevel = 'low' | 'medium' | 'high';
export type AppTier = 'T1' | 'T2' | 'T3';

export interface PriorityRow {
  id: string;
  appName: string;
  tier: AppTier;
  complexity: ComplexityLevel;
  dependencies: number;
  dependencyDetail: string;
  businessCriticality: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort: string;
  wave: number | null;
}

export const priorityRows: PriorityRow[] = [
  {
    id: 'pr-1',
    appName: 'payment-gateway-svc',
    tier: 'T1',
    complexity: 'high',
    dependencies: 6,
    dependencyDetail: 'Oracle, Kafka, VIP, DNS, Secrets, Firewall',
    businessCriticality: 'critical',
    estimatedEffort: '14 days',
    wave: 1,
  },
  {
    id: 'pr-2',
    appName: 'claims-service',
    tier: 'T1',
    complexity: 'high',
    dependencies: 5,
    dependencyDetail: 'Oracle, MQ, VIP, DNS, Secrets',
    businessCriticality: 'critical',
    estimatedEffort: '12 days',
    wave: 1,
  },
  {
    id: 'pr-3',
    appName: 'policy-admin-svc',
    tier: 'T1',
    complexity: 'medium',
    dependencies: 4,
    dependencyDetail: 'Mongo, VIP, DNS, Secrets',
    businessCriticality: 'high',
    estimatedEffort: '9 days',
    wave: 2,
  },
  {
    id: 'pr-4',
    appName: 'billing-service',
    tier: 'T2',
    complexity: 'medium',
    dependencies: 3,
    dependencyDetail: 'Oracle, MQ, Secrets',
    businessCriticality: 'high',
    estimatedEffort: '7 days',
    wave: 2,
  },
  {
    id: 'pr-5',
    appName: 'routing-engine',
    tier: 'T2',
    complexity: 'low',
    dependencies: 2,
    dependencyDetail: 'Kafka, DNS',
    businessCriticality: 'medium',
    estimatedEffort: '4 days',
    wave: 3,
  },
  {
    id: 'pr-6',
    appName: 'notification-svc',
    tier: 'T3',
    complexity: 'low',
    dependencies: 1,
    dependencyDetail: 'Kafka',
    businessCriticality: 'low',
    estimatedEffort: '3 days',
    wave: 3,
  },
  {
    id: 'pr-7',
    appName: 'invoice-generator',
    tier: 'T3',
    complexity: 'low',
    dependencies: 1,
    dependencyDetail: 'Oracle',
    businessCriticality: 'low',
    estimatedEffort: '2 days',
    wave: 3,
  },
];

// ─── Decision Center ─────────────────────────────────────────────────────────

export type Verdict = 'SAFE' | 'CONDITIONAL' | 'DO_NOT_SHUTDOWN';

export interface DecisionVerdict {
  verdict: Verdict;
  headline: string;
  summary: string;
  confidence: number;
}

export const decisionVerdict: DecisionVerdict = {
  verdict: 'CONDITIONAL',
  headline: 'Conditional Go — resolve 4 blockers before cutover',
  summary:
    'Migration readiness is strong overall, but 1 critical and 3 high/medium blockers remain in the Secrets, Database, MQ, and Firewall categories. Proceed once blockers are cleared; do not shut down the source datacenter until post-cutover validation completes.',
  confidence: 74,
};

export interface ReasoningStep {
  id: string;
  phase: string;
  timestamp: string;
  title: string;
  detail: string;
  tone: 'positive' | 'neutral' | 'warning' | 'negative';
}

export const reasoningTimeline: ReasoningStep[] = [
  {
    id: 'rs-1',
    phase: 'Discovery',
    timestamp: '2026-07-14 09:12',
    title: 'Inventory complete — 18 applications in scope',
    detail:
      '4 clusters, 8 namespaces, 62 pods enumerated. Ownership mapped to 6 teams across 8 business capabilities.',
    tone: 'positive',
  },
  {
    id: 'rs-2',
    phase: 'Impact Analysis',
    timestamp: '2026-07-14 10:34',
    title: '6 Tier 1 applications identified — 142 customers affected',
    detail:
      'Payment Processing and Claims Management are the highest-criticality capabilities in scope. Wire transfers already failing.',
    tone: 'warning',
  },
  {
    id: 'rs-3',
    phase: 'Dependency Mapping',
    timestamp: '2026-07-14 11:05',
    title: 'Cross-domain dependencies resolved',
    detail:
      '90 dependency edges across MQ, Kafka, Oracle, Mongo, VIP, and DNS. 10 assets flagged at-risk.',
    tone: 'neutral',
  },
  {
    id: 'rs-4',
    phase: 'Readiness Scoring',
    timestamp: '2026-07-14 12:18',
    title: 'Readiness 72/100 — 1 critical blocker found',
    detail:
      'Secrets category failed: 3 of 6 application secrets missing in the target vault. 4 categories warn.',
    tone: 'negative',
  },
  {
    id: 'rs-5',
    phase: 'Prioritization',
    timestamp: '2026-07-14 13:41',
    title: '3-wave migration plan proposed',
    detail:
      'Wave 1: Tier 1 critical apps. Wave 2: Tier 1/2 high. Wave 3: low-complexity Tier 2/3. Total effort ~51 days.',
    tone: 'neutral',
  },
  {
    id: 'rs-6',
    phase: 'Verdict',
    timestamp: '2026-07-14 14:02',
    title: 'Conditional Go recommended',
    detail:
      'Proceed after clearing 4 blockers. Confidence 74% — improves to 90%+ once Secrets and Database sync complete.',
    tone: 'warning',
  },
];

export interface DecisionEvidence {
  id: string;
  source: string;
  finding: string;
  weight: 'high' | 'medium' | 'low';
}

export const decisionEvidence: DecisionEvidence[] = [
  {
    id: 'ev-1',
    source: 'Oracle Data Guard — ORA-CLAIMDB-02',
    finding: 'Standby apply lag 34s (threshold 30s). Switchover not safe until <5s.',
    weight: 'high',
  },
  {
    id: 'ev-2',
    source: 'Vault sync report',
    finding: '3/6 application secrets absent in target vault namespace.',
    weight: 'high',
  },
  {
    id: 'ev-3',
    source: 'Kafka MirrorMaker 2',
    finding: 'All 5 topics replicated. Offset checkpoints match source within 200ms.',
    weight: 'high',
  },
  {
    id: 'ev-4',
    source: 'MQ channel status — MQ-BILLING-QM',
    finding: 'SVRCONN channel down since 2026-07-13 22:10 UTC.',
    weight: 'medium',
  },
  {
    id: 'ev-5',
    source: 'DNS zone diff',
    finding: '47/48 records transferred; 1 stale record pending TTL (600s).',
    weight: 'low',
  },
  {
    id: 'ev-6',
    source: 'Certificate inventory',
    finding: 'edge-gateway TLS cert expires 2026-08-04 (21 days remaining).',
    weight: 'medium',
  },
];

export interface DecisionBusinessImpact {
  capability: string;
  risk: 'low' | 'medium' | 'high';
  customersAffected: number;
  mitigation: string;
}

export const decisionBusinessImpact: DecisionBusinessImpact[] = [
  {
    capability: 'Payments',
    risk: 'low',
    customersAffected: 48,
    mitigation: 'Replicated Oracle primary + Kafka failover verified. No disruption expected.',
  },
  {
    capability: 'Claims',
    risk: 'high',
    customersAffected: 36,
    mitigation: 'Database standby lag + MQ channel down. Hold cutover until cleared.',
  },
  {
    capability: 'Cards',
    risk: 'high',
    customersAffected: 36,
    mitigation: 'Depends on degraded MQ billing queue. Authorization delays possible.',
  },
  {
    capability: 'Policy Admin',
    risk: 'medium',
    customersAffected: 22,
    mitigation: 'Mongo replica set healthy. Stale DNS may cause brief lookup delays.',
  },
  {
    capability: 'Wire Transfers',
    risk: 'high',
    customersAffected: 24,
    mitigation: 'Already failing on source. Fallback to manual processing engaged.',
  },
  {
    capability: 'Billing',
    risk: 'low',
    customersAffected: 18,
    mitigation: 'Healthy on source; dependencies replicated to target.',
  },
];
