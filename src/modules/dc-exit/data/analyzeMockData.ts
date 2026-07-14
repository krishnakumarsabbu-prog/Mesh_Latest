/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Mock data for the Analyze step. No backend — purely static
 * impact metrics, dependency graph topology, and business
 * impact assessments used to render the three Analyze tabs.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Shield as ShieldIcon,
  Users as UsersIcon,
  Boxes as BoxesIcon,
  FlameKindling as MqIcon,
  Flame as KafkaIcon,
  Database as OracleIcon,
  Leaf as MongoIcon,
  Network as VipIcon,
  Globe as DnsIcon,
} from 'lucide-react';

export type HealthState = 'healthy' | 'degraded' | 'down';

export type DependencyType = 'mq' | 'kafka' | 'oracle' | 'mongo' | 'vip' | 'dns';

export const DEPENDENCY_TYPE_META: Record<
  DependencyType,
  { label: string; icon: LucideIcon; color: string; bg: string; border: string }
> = {
  mq:     { label: 'MQ',     icon: MqIcon,     color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)' },
  kafka:  { label: 'Kafka',  icon: KafkaIcon,  color: '#FF6B35', bg: 'rgba(255,107,53,0.10)',  border: 'rgba(255,107,53,0.22)' },
  oracle: { label: 'Oracle', icon: OracleIcon, color: '#FF003C', bg: 'rgba(255,0,60,0.08)',    border: 'rgba(255,0,60,0.22)' },
  mongo:  { label: 'Mongo',  icon: MongoIcon,  color: '#00B074', bg: 'rgba(0,176,116,0.08)',   border: 'rgba(0,176,116,0.22)' },
  vip:    { label: 'VIP',    icon: VipIcon,    color: '#006CFF', bg: 'rgba(0,108,255,0.08)',   border: 'rgba(0,108,255,0.22)' },
  dns:    { label: 'DNS',    icon: DnsIcon,    color: '#14B8A6', bg: 'rgba(20,184,166,0.08)',  border: 'rgba(20,184,166,0.22)' },
};

export const DEPENDENCY_TYPE_ORDER: DependencyType[] = ['mq', 'kafka', 'oracle', 'mongo', 'vip', 'dns'];

export interface ImpactMetric {
  id: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  value: number;
  unit: string;
  delta: number;
  deltaLabel: string;
}

export const impactMetrics: ImpactMetric[] = [
  {
    id: 'tier1',
    label: 'Tier 1 Apps',
    icon: ShieldIcon,
    iconColor: '#FF003C',
    iconBg: 'rgba(255,0,60,0.08)',
    value: 6,
    unit: 'critical',
    delta: 2,
    deltaLabel: 'vs baseline',
  },
  {
    id: 'customers',
    label: 'Customers Affected',
    icon: UsersIcon,
    iconColor: '#006CFF',
    iconBg: 'rgba(0,108,255,0.08)',
    value: 142,
    unit: 'enterprise',
    delta: 18,
    deltaLabel: 'reach',
  },
  {
    id: 'applications',
    label: 'Applications in Scope',
    icon: BoxesIcon,
    iconColor: '#14B8A6',
    iconBg: 'rgba(20,184,166,0.08)',
    value: 18,
    unit: 'apps',
    delta: 0,
    deltaLabel: 'no change',
  },
];

export interface DependencyBreakdown {
  type: DependencyType;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  atRisk: number;
}

export const dependencyBreakdown: DependencyBreakdown[] = [
  { type: 'mq',     total: 3,  healthy: 2, degraded: 1, down: 0, atRisk: 1 },
  { type: 'kafka',  total: 5,  healthy: 4, degraded: 1, down: 0, atRisk: 2 },
  { type: 'oracle', total: 4,  healthy: 3, degraded: 1, down: 0, atRisk: 1 },
  { type: 'mongo',  total: 6,  healthy: 6, degraded: 0, down: 0, atRisk: 0 },
  { type: 'vip',    total: 24, healthy: 22, degraded: 2, down: 0, atRisk: 4 },
  { type: 'dns',    total: 48, healthy: 47, degraded: 1, down: 0, atRisk: 2 },
];

// ─── Dependency Graph (XYFlow) ──────────────────────────────────────────────

export type DependencyNodeType = 'app' | DependencyType;

export interface DepGraphNodeData {
  label: string;
  nodeType: DependencyNodeType;
  health: HealthState;
  count?: number;
  sublabel?: string;
}

export interface DepGraphNode {
  id: string;
  type: 'depApp' | 'depService';
  position: { x: number; y: number };
  data: DepGraphNodeData;
}

export interface DepGraphEdge {
  id: string;
  source: string;
  target: string;
  depType: DependencyType;
  label: string;
  animated?: boolean;
}

export const depGraphNodes: DepGraphNode[] = [
  // ── Center: applications ──
  { id: 'app-pay',    type: 'depApp', position: { x: 0,   y: 0 },   data: { label: 'payment-gateway-svc',    nodeType: 'app', health: 'healthy',  sublabel: 'Tier 1' } },
  { id: 'app-claim',  type: 'depApp', position: { x: 0,   y: 120 }, data: { label: 'claims-service',         nodeType: 'app', health: 'degraded', sublabel: 'Tier 1' } },
  { id: 'app-policy', type: 'depApp', position: { x: 0,   y: 240 }, data: { label: 'policy-admin-svc',       nodeType: 'app', health: 'degraded', sublabel: 'Tier 1' } },
  { id: 'app-bill',   type: 'depApp', position: { x: 0,   y: 360 }, data: { label: 'billing-service',        nodeType: 'app', health: 'healthy',  sublabel: 'Tier 2' } },
  { id: 'app-route',  type: 'depApp', position: { x: 0,   y: 480 }, data: { label: 'routing-engine',         nodeType: 'app', health: 'healthy',  sublabel: 'Tier 2' } },

  // ── Right cluster: dependencies ──
  { id: 'svc-oracle-1', type: 'depService', position: { x: 320, y: -40 },  data: { label: 'ORA-PAYDB-01',    nodeType: 'oracle', health: 'healthy',  sublabel: 'Primary' } },
  { id: 'svc-oracle-2', type: 'depService', position: { x: 320, y: 60 },   data: { label: 'ORA-CLAIMDB-02',  nodeType: 'oracle', health: 'degraded', sublabel: 'Standby' } },
  { id: 'svc-mongo-1',  type: 'depService', position: { x: 320, y: 160 },  data: { label: 'MONGO-POLICY-RS',  nodeType: 'mongo',  health: 'healthy',  sublabel: 'Replica Set' } },
  { id: 'svc-mq-1',     type: 'depService', position: { x: 320, y: 260 },  data: { label: 'MQ-BILLING-QM',    nodeType: 'mq',     health: 'degraded', sublabel: 'Queue Mgr' } },
  { id: 'svc-kafka-1',  type: 'depService', position: { x: 320, y: 360 },  data: { label: 'KAFKA-PAY-TOPIC',  nodeType: 'kafka',  health: 'healthy',  sublabel: 'Topic' } },
  { id: 'svc-vip-1',    type: 'depService', position: { x: 320, y: 460 },  data: { label: 'VIP-PAY-VIP-01',   nodeType: 'vip',    health: 'healthy',  sublabel: 'Virtual IP' } },
  { id: 'svc-dns-1',    type: 'depService', position: { x: 320, y: 560 },  data: { label: 'DNS-PAY-ZONE',     nodeType: 'dns',    health: 'healthy',  sublabel: 'Zone' } },
];

export const depGraphEdges: DepGraphEdge[] = [
  { id: 'e-pay-ora1',    source: 'app-pay',    target: 'svc-oracle-1', depType: 'oracle', label: 'JDBC',     animated: true },
  { id: 'e-pay-kafka1',  source: 'app-pay',    target: 'svc-kafka-1',  depType: 'kafka',  label: 'Produce',  animated: true },
  { id: 'e-pay-vip1',    source: 'app-pay',    target: 'svc-vip-1',    depType: 'vip',    label: 'Bind' },
  { id: 'e-pay-dns1',    source: 'app-pay',    target: 'svc-dns-1',    depType: 'dns',    label: 'Resolve' },
  { id: 'e-claim-ora2',  source: 'app-claim',  target: 'svc-oracle-2', depType: 'oracle', label: 'JDBC',     animated: true },
  { id: 'e-claim-mq1',   source: 'app-claim',  target: 'svc-mq-1',     depType: 'mq',     label: 'Listen',   animated: true },
  { id: 'e-policy-mongo',source: 'app-policy', target: 'svc-mongo-1',  depType: 'mongo',  label: 'Read/Write', animated: true },
  { id: 'e-policy-vip1', source: 'app-policy', target: 'svc-vip-1',    depType: 'vip',    label: 'Bind' },
  { id: 'e-bill-mq1',    source: 'app-bill',   target: 'svc-mq-1',     depType: 'mq',     label: 'Send',     animated: true },
  { id: 'e-bill-ora1',   source: 'app-bill',   target: 'svc-oracle-1', depType: 'oracle', label: 'JDBC' },
  { id: 'e-route-kafka1',source: 'app-route',  target: 'svc-kafka-1',  depType: 'kafka',  label: 'Consume',  animated: true },
  { id: 'e-route-dns1',  source: 'app-route',  target: 'svc-dns-1',    depType: 'dns',    label: 'Resolve' },
];

// ─── Business Impact ─────────────────────────────────────────────────────────

export interface BusinessImpactCard {
  id: string;
  name: string;
  health: HealthState;
  reason: string;
  customerImpact: string;
  affectedCustomers: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  trend: 'up' | 'down' | 'stable';
}

export const businessImpactCards: BusinessImpactCard[] = [
  {
    id: 'biz-payments',
    name: 'Payments',
    health: 'healthy',
    reason: 'Payment gateway runs on healthy cluster with replicated Oracle primary. No active incidents detected.',
    customerImpact: 'No disruption expected. All payment channels remain operational during migration window.',
    affectedCustomers: 48,
    severity: 'high',
    trend: 'stable',
  },
  {
    id: 'biz-cards',
    name: 'Cards',
    health: 'degraded',
    reason: 'Card authorization service depends on MQ billing queue manager currently in degraded state.',
    customerImpact: 'Intermittent authorization delays of 2-5s possible for card transactions during peak hours.',
    affectedCustomers: 36,
    severity: 'critical',
    trend: 'down',
  },
  {
    id: 'biz-treasury',
    name: 'Treasury',
    health: 'healthy',
    reason: 'Treasury workflows isolated from migrated workloads. Kafka topic throughput within normal bounds.',
    customerImpact: 'No impact on treasury operations or settlement processes.',
    affectedCustomers: 12,
    severity: 'medium',
    trend: 'stable',
  },
  {
    id: 'biz-mortgage',
    name: 'Mortgage',
    health: 'degraded',
    reason: 'Mortgage origination depends on claims evaluation engine running on degraded policy-rules pod.',
    customerImpact: 'Loan application processing may experience slowdowns; 3-hour SLA at risk for new applications.',
    affectedCustomers: 22,
    severity: 'high',
    trend: 'down',
  },
  {
    id: 'biz-wire',
    name: 'Wire',
    health: 'down',
    reason: 'Wire transfer service unreachable — policy-quote-svc is down and blocking the wire authorization chain.',
    customerImpact: 'Wire transfers are currently failing. Immediate fallback to manual processing required.',
    affectedCustomers: 24,
    severity: 'critical',
    trend: 'down',
  },
];
