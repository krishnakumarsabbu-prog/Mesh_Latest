/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Mock data for the Discover step. No backend — purely static
 * inventory used to render the datacenter overview, hierarchy
 * tree, inventory cards, business capabilities and owner teams.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  Box,
  Layers,
  Database,
  Leaf,
  Flame,
  FlameKindling,
  Shield,
  Network,
  Globe,
  FileCheck,
  HardDrive,
} from 'lucide-react';

export type HealthState = 'healthy' | 'degraded' | 'down';

export interface DiscoverDatacenter {
  name: string;
  shortName: string;
  region: string;
  health: HealthState;
  healthLabel: string;
  capacity: number;
  capacityLabel: string;
  readiness: number;
  readinessLabel: string;
}

export interface HierarchyNode {
  id: string;
  name: string;
  type: 'datacenter' | 'cluster' | 'namespace' | 'application';
  status: HealthState;
  count: number;
  children?: HierarchyNode[];
}

export interface InventoryCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
}

export interface BusinessCapability {
  id: string;
  name: string;
  criticality: 'critical' | 'high' | 'medium' | 'low';
  applications: number;
  health: HealthState;
}

export interface OwnerTeam {
  id: string;
  name: string;
  applications: number;
  services: number;
  health: HealthState;
}

export const discoverDatacenter: DiscoverDatacenter = {
  name: 'Ashburn Primary',
  shortName: 'ASH-DC1',
  region: 'US-East-1 / Ashburn, VA',
  health: 'degraded',
  healthLabel: 'Degraded',
  capacity: 78,
  capacityLabel: '78% utilized',
  readiness: 64,
  readinessLabel: '64% migration-ready',
};

export const discoverHierarchy: HierarchyNode[] = [
  {
    id: 'dc-ash-1',
    name: 'Ashburn Primary (ASH-DC1)',
    type: 'datacenter',
    status: 'degraded',
    count: 4,
    children: [
      {
        id: 'cluster-prod-1',
        name: 'prod-cluster-01',
        type: 'cluster',
        status: 'healthy',
        count: 3,
        children: [
          {
            id: 'ns-payments',
            name: 'payments',
            type: 'namespace',
            status: 'healthy',
            count: 4,
            children: [
              { id: 'app-pay-svc', name: 'payment-gateway-svc', type: 'application', status: 'healthy', count: 6 },
              { id: 'app-pay-api', name: 'payment-api', type: 'application', status: 'healthy', count: 4 },
              { id: 'app-pay-batch', name: 'payment-batch-processor', type: 'application', status: 'degraded', count: 3 },
              { id: 'app-pay-web', name: 'payment-web-ui', type: 'application', status: 'healthy', count: 5 },
            ],
          },
          {
            id: 'ns-claims',
            name: 'claims',
            type: 'namespace',
            status: 'degraded',
            count: 3,
            children: [
              { id: 'app-claim-svc', name: 'claims-service', type: 'application', status: 'healthy', count: 4 },
              { id: 'app-claim-eval', name: 'claims-evaluation-engine', type: 'application', status: 'degraded', count: 3 },
              { id: 'app-claim-doc', name: 'claims-document-svc', type: 'application', status: 'healthy', count: 2 },
            ],
          },
          {
            id: 'ns-routing',
            name: 'routing',
            type: 'namespace',
            status: 'healthy',
            count: 2,
            children: [
              { id: 'app-route-engine', name: 'routing-engine', type: 'application', status: 'healthy', count: 4 },
              { id: 'app-route-notif', name: 'notification-svc', type: 'application', status: 'healthy', count: 3 },
            ],
          },
        ],
      },
      {
        id: 'cluster-prod-2',
        name: 'prod-cluster-02',
        type: 'cluster',
        status: 'degraded',
        count: 2,
        children: [
          {
            id: 'ns-policy',
            name: 'policy-admin',
            type: 'namespace',
            status: 'degraded',
            count: 3,
            children: [
              { id: 'app-policy-svc', name: 'policy-admin-svc', type: 'application', status: 'healthy', count: 5 },
              { id: 'app-policy-rules', name: 'policy-rules-engine', type: 'application', status: 'degraded', count: 3 },
              { id: 'app-policy-quote', name: 'policy-quote-svc', type: 'application', status: 'down', count: 2 },
            ],
          },
          {
            id: 'ns-billing',
            name: 'billing',
            type: 'namespace',
            status: 'healthy',
            count: 2,
            children: [
              { id: 'app-bill-svc', name: 'billing-service', type: 'application', status: 'healthy', count: 4 },
              { id: 'app-bill-inv', name: 'invoice-generator', type: 'application', status: 'healthy', count: 3 },
            ],
          },
        ],
      },
      {
        id: 'cluster-nonprod',
        name: 'nonprod-cluster-01',
        type: 'cluster',
        status: 'healthy',
        count: 2,
        children: [
          {
            id: 'ns-staging',
            name: 'staging',
            type: 'namespace',
            status: 'healthy',
            count: 3,
            children: [
              { id: 'app-stg-pay', name: 'staging-payment-svc', type: 'application', status: 'healthy', count: 3 },
              { id: 'app-stg-claim', name: 'staging-claims-svc', type: 'application', status: 'healthy', count: 2 },
              { id: 'app-stg-policy', name: 'staging-policy-svc', type: 'application', status: 'healthy', count: 2 },
            ],
          },
          {
            id: 'ns-sandbox',
            name: 'sandbox',
            type: 'namespace',
            status: 'healthy',
            count: 1,
            children: [
              { id: 'app-sandbox', name: 'sandbox-tools', type: 'application', status: 'healthy', count: 2 },
            ],
          },
        ],
      },
      {
        id: 'cluster-edge',
        name: 'edge-cluster-01',
        type: 'cluster',
        status: 'healthy',
        count: 1,
        children: [
          {
            id: 'ns-ingress',
            name: 'ingress',
            type: 'namespace',
            status: 'healthy',
            count: 2,
            children: [
              { id: 'app-edge-gw', name: 'edge-gateway', type: 'application', status: 'healthy', count: 4 },
              { id: 'app-edge-auth', name: 'auth-broker', type: 'application', status: 'healthy', count: 3 },
            ],
          },
        ],
      },
    ],
  },
];

export const discoverInventory: InventoryCategory[] = [
  { key: 'applications', label: 'Applications', icon: Boxes, iconColor: '#006CFF', iconBg: 'rgba(0,108,255,0.10)', total: 18, healthy: 14, degraded: 3, down: 1 },
  { key: 'pods', label: 'Pods', icon: Box, iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.10)', total: 62, healthy: 55, degraded: 5, down: 2 },
  { key: 'namespaces', label: 'Namespaces', icon: Layers, iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.10)', total: 8, healthy: 7, degraded: 1, down: 0 },
  { key: 'oracle', label: 'Oracle', icon: Database, iconColor: '#FF003C', iconBg: 'rgba(255,0,60,0.08)', total: 4, healthy: 3, degraded: 1, down: 0 },
  { key: 'mongo', label: 'Mongo', icon: Leaf, iconColor: '#00B074', iconBg: 'rgba(0,176,116,0.08)', total: 6, healthy: 6, degraded: 0, down: 0 },
  { key: 'mq', label: 'MQ', icon: FlameKindling, iconColor: '#FFB100', iconBg: 'rgba(255,177,0,0.08)', total: 3, healthy: 2, degraded: 1, down: 0 },
  { key: 'kafka', label: 'Kafka', icon: Flame, iconColor: '#FF6B35', iconBg: 'rgba(255,107,53,0.10)', total: 5, healthy: 4, degraded: 1, down: 0 },
  { key: 'firewall', label: 'Firewall', icon: Shield, iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.10)', total: 12, healthy: 11, degraded: 1, down: 0 },
  { key: 'vip', label: 'VIP', icon: Network, iconColor: '#006CFF', iconBg: 'rgba(0,108,255,0.08)', total: 24, healthy: 22, degraded: 2, down: 0 },
  { key: 'dns', label: 'DNS', icon: Globe, iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.08)', total: 48, healthy: 47, degraded: 1, down: 0 },
  { key: 'certificates', label: 'Certificates', icon: FileCheck, iconColor: '#FFB100', iconBg: 'rgba(255,177,0,0.08)', total: 9, healthy: 8, degraded: 1, down: 0 },
  { key: 'storage', label: 'Storage', icon: HardDrive, iconColor: '#8A97A8', iconBg: 'rgba(138,151,168,0.10)', total: 7, healthy: 6, degraded: 1, down: 0 },
];

export const discoverCapabilities: BusinessCapability[] = [
  { id: 'cap-pay', name: 'Payment Processing', criticality: 'critical', applications: 4, health: 'healthy' },
  { id: 'cap-claim', name: 'Claims Management', criticality: 'critical', applications: 3, health: 'degraded' },
  { id: 'cap-policy', name: 'Policy Administration', criticality: 'high', applications: 3, health: 'degraded' },
  { id: 'cap-billing', name: 'Billing & Invoicing', criticality: 'high', applications: 2, health: 'healthy' },
  { id: 'cap-routing', name: 'Routing & Notification', criticality: 'medium', applications: 2, health: 'healthy' },
  { id: 'cap-edge', name: 'Edge & Auth Gateway', criticality: 'high', applications: 2, health: 'healthy' },
  { id: 'cap-sandbox', name: 'Sandbox Tooling', criticality: 'low', applications: 1, health: 'healthy' },
  { id: 'cap-staging', name: 'Staging & Pre-Prod', criticality: 'low', applications: 3, health: 'healthy' },
];

export const discoverOwnerTeams: OwnerTeam[] = [
  { id: 'team-pay', name: 'Payments Platform', applications: 4, services: 6, health: 'healthy' },
  { id: 'team-claim', name: 'Claims Engineering', applications: 3, services: 5, health: 'degraded' },
  { id: 'team-policy', name: 'Policy Squad', applications: 3, services: 4, health: 'degraded' },
  { id: 'team-billing', name: 'Billing Core', applications: 2, services: 3, health: 'healthy' },
  { id: 'team-edge', name: 'Platform & Edge', applications: 2, services: 7, health: 'healthy' },
  { id: 'team-devx', name: 'Developer Experience', applications: 4, services: 5, health: 'healthy' },
];
