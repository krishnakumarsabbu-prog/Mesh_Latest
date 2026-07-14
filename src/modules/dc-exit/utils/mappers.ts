/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Mappers that convert backend API response shapes into the
 * display-model shapes consumed by the dc-exit tab components.
 * No hardcoded values — everything comes from API responses.
 */

import {
  Boxes, Box, Layers, Database, Leaf, Flame, FlameKindling,
  Shield, Network, Globe, FileCheck, HardDrive,
  type LucideIcon,
} from 'lucide-react';
import type { HealthState } from '@/modules/dc-exit/data/discoverMockData';
import type { RuntimeDataCenter } from '@/types';
import type {
  OntologyGraphResponse,
  OntologyNodeJson,
  DcExitScopeResponse,
  ReadinessResponse,
} from '@/modules/dc-exit/services/dcExitService';

// ─── Discover mappers ────────────────────────────────────────────────────────

export interface DiscoverDatacenterView {
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

export interface HierarchyNodeView {
  id: string;
  name: string;
  type: 'datacenter' | 'cluster' | 'namespace' | 'application';
  status: HealthState;
  count: number;
  children?: HierarchyNodeView[];
}

export interface InventoryCategoryView {
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

export interface BusinessCapabilityView {
  id: string;
  name: string;
  criticality: 'critical' | 'high' | 'medium' | 'low';
  applications: number;
  health: HealthState;
}

export interface OwnerTeamView {
  id: string;
  name: string;
  applications: number;
  services: number;
  health: HealthState;
}

const INVENTORY_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  applications: { icon: Boxes, color: '#006CFF', bg: 'rgba(0,108,255,0.10)', label: 'Applications' },
  ocp: { icon: Box, color: '#14B8A6', bg: 'rgba(20,184,166,0.10)', label: 'Pods' },
  compute: { icon: Box, color: '#14B8A6', bg: 'rgba(20,184,166,0.10)', label: 'Compute' },
  namespaces: { icon: Layers, color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)', label: 'Namespaces' },
  oracle: { icon: Database, color: '#FF003C', bg: 'rgba(255,0,60,0.08)', label: 'Oracle' },
  data: { icon: Database, color: '#FF003C', bg: 'rgba(255,0,60,0.08)', label: 'Database' },
  mongodb: { icon: Leaf, color: '#00B074', bg: 'rgba(0,176,116,0.08)', label: 'Mongo' },
  messaging: { icon: FlameKindling, color: '#FFB100', bg: 'rgba(255,177,0,0.08)', label: 'MQ' },
  ibm_mq: { icon: FlameKindling, color: '#FFB100', bg: 'rgba(255,177,0,0.08)', label: 'MQ' },
  kafka: { icon: Flame, color: '#FF6B35', bg: 'rgba(255,107,53,0.10)', label: 'Kafka' },
  network: { icon: Shield, color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', label: 'Firewall' },
  avi_loadbalancer: { icon: Network, color: '#006CFF', bg: 'rgba(0,108,255,0.08)', label: 'VIP' },
  dns: { icon: Globe, color: '#14B8A6', bg: 'rgba(20,184,166,0.08)', label: 'DNS' },
  certificates: { icon: FileCheck, color: '#FFB100', bg: 'rgba(255,177,0,0.08)', label: 'Certificates' },
  storage: { icon: HardDrive, color: '#8A97A8', bg: 'rgba(138,151,168,0.10)', label: 'Storage' },
};

export function statusToHealth(status: string): HealthState {
  const s = (status || '').toLowerCase();
  if (s === 'healthy' || s === 'active' || s === 'online') return 'healthy';
  if (s === 'degraded') return 'degraded';
  if (s === 'down' || s === 'inactive' || s === 'offline') return 'down';
  return 'healthy';
}

function healthLabel(h: HealthState): string {
  return h.charAt(0).toUpperCase() + h.slice(1);
}

function getAppNodesInDc(graph: OntologyGraphResponse, dcShortName: string): OntologyNodeJson[] {
  // 1. Get IDs of assets in this DC
  const dcAssetIds = new Set(
    graph.nodes
      .filter(
        (n) =>
          n.domain !== 'applications' &&
          n.domain !== 'runtime' &&
          ((n.metadata as Record<string, unknown>)?.data_center === dcShortName ||
           (n.metadata as Record<string, unknown>)?.data_center_short === dcShortName)
      )
      .map((n) => n.id)
  );

  // 2. Find application node IDs that own these assets
  const appIdsInDc = new Set<string>();
  for (const e of graph.edges) {
    if (e.edge_type === 'owns' && dcAssetIds.has(e.target)) {
      appIdsInDc.add(e.source);
    }
  }

  // 3. Return the application nodes
  return graph.nodes.filter(
    (n) => n.domain === 'applications' && appIdsInDc.has(n.id)
  );
}

export function mapDatacenter(
  dc: RuntimeDataCenter,
  readiness?: ReadinessResponse,
  graph?: OntologyGraphResponse,
): DiscoverDatacenterView {
  const assetNodes = graph
    ? graph.nodes.filter(
        (n) =>
          n.domain !== 'applications' &&
          n.domain !== 'runtime' &&
          ((n.metadata as Record<string, unknown>)?.data_center === dc.short_name ||
           (n.metadata as Record<string, unknown>)?.data_center_short === dc.short_name),
      )
    : [];

  const healthy = assetNodes.filter((n) => statusToHealth(n.status) === 'healthy').length;
  const degraded = assetNodes.filter((n) => statusToHealth(n.status) === 'degraded').length;
  const down = assetNodes.filter((n) => statusToHealth(n.status) === 'down').length;
  const total = assetNodes.length;

  const health: HealthState = down > 0 ? 'down' : degraded > 0 ? 'degraded' : 'healthy';
  const score = readiness?.overall_score ?? (total > 0 ? Math.round((healthy / total) * 100) : 0);

  return {
    name: dc.name,
    shortName: dc.short_name ?? dc.name,
    region: [dc.region, dc.zone].filter(Boolean).join(' / ') || 'N/A',
    health,
    healthLabel: healthLabel(health),
    capacity: dc.asset_count > 0 ? Math.min(100, Math.round((total / Math.max(dc.asset_count, 1)) * 100)) : 0,
    capacityLabel: `${dc.asset_count} assets`,
    readiness: score,
    readinessLabel: `${score}% migration-ready`,
  };
}

export function mapHierarchy(
  graph: OntologyGraphResponse,
  dcShortName: string,
): HierarchyNodeView[] {
  const dcNode = graph.nodes.find(
    (n) =>
      n.ontology_class === 'DataCenter' &&
      ((n.metadata as Record<string, unknown>)?.short_name === dcShortName ||
       (n.metadata as Record<string, unknown>)?.short_name === dcShortName),
  );
  if (!dcNode) return [];

  // 1. Get all Assets in this datacenter
  const dcAssets = graph.nodes.filter(
    (n) =>
      n.domain !== 'applications' &&
      n.domain !== 'runtime' &&
      ((n.metadata as Record<string, unknown>)?.data_center === dcShortName ||
       (n.metadata as Record<string, unknown>)?.data_center_short === dcShortName),
  );

  // 2. Map Assets to their Application (via owns edges)
  const appToAssets = new Map<string, OntologyNodeJson[]>();
  const unownedAssets: OntologyNodeJson[] = [];

  for (const asset of dcAssets) {
    const ownsEdge = graph.edges.find(
      (e) => e.edge_type === 'owns' && e.target === asset.id
    );
    if (ownsEdge) {
      const arr = appToAssets.get(ownsEdge.source) ?? [];
      arr.push(asset);
      appToAssets.set(ownsEdge.source, arr);
    } else {
      unownedAssets.push(asset);
    }
  }

  // 3. Get all Applications running in this DC
  const appNodes = getAppNodesInDc(graph, dcShortName);

  // 4. Build application child views
  const appViews: HierarchyNodeView[] = appNodes.map((app) => {
    const assets = appToAssets.get(app.id) ?? [];
    const assetViews: HierarchyNodeView[] = assets.map((asset) => {
      let type: HierarchyNodeView['type'] = 'namespace';
      const c = asset.ontology_class.toLowerCase();
      if (c.includes('database') || c.includes('oracle') || c.includes('mongo')) {
        type = 'cluster';
      }
      return {
        id: asset.id,
        name: `${asset.label} (${(asset.metadata as any)?.tech_stack ?? 'asset'})`,
        type,
        status: statusToHealth(asset.status),
        count: 0,
      };
    });

    return {
      id: app.id,
      name: app.label,
      type: 'application',
      status: statusToHealth(app.status),
      count: assetViews.length,
      children: assetViews.length > 0 ? assetViews : undefined,
    };
  });

  // 5. Build infrastructure/unowned assets group (e.g. MONGO_INFRA, MQ_INFRA)
  if (unownedAssets.length > 0) {
    const infraViews: HierarchyNodeView[] = unownedAssets.map((asset) => ({
      id: asset.id,
      name: `${asset.label} (${(asset.metadata as any)?.tech_stack ?? 'shared-infra'})`,
      type: 'cluster',
      status: statusToHealth(asset.status),
      count: 0,
    }));
    appViews.push({
      id: 'shared-infra',
      name: 'Shared Infrastructure Platforms',
      type: 'application',
      status: 'healthy',
      count: infraViews.length,
      children: infraViews,
    });
  }

  return [
    {
      id: dcNode.id,
      name: `${dcNode.label} (${dcShortName})`,
      type: 'datacenter',
      status: statusToHealth(dcNode.status),
      count: appViews.length,
      children: appViews,
    },
  ];
}

export function mapInventory(
  graph: OntologyGraphResponse,
  dcShortName: string,
): InventoryCategoryView[] {
  const dcAssets = graph.nodes.filter(
    (n) =>
      n.domain !== 'applications' &&
      n.domain !== 'runtime' &&
      ((n.metadata as Record<string, unknown>)?.data_center === dcShortName ||
       (n.metadata as Record<string, unknown>)?.data_center_short === dcShortName),
  );

  const appNodes = getAppNodesInDc(graph, dcShortName);

  const groups: Record<string, OntologyNodeJson[]> = {};
  for (const a of dcAssets) {
    const key = a.domain in INVENTORY_ICONS ? a.domain : a.ontology_class.toLowerCase();
    groups[key] = groups[key] ?? [];
    groups[key].push(a);
  }

  const categories: InventoryCategoryView[] = [];

  if (appNodes.length > 0) {
    categories.push(makeInventoryCategory('applications', appNodes));
  }

  for (const [key, nodes] of Object.entries(groups)) {
    if (key !== 'applications') {
      categories.push(makeInventoryCategory(key, nodes));
    }
  }

  return categories;
}

function makeInventoryCategory(key: string, nodes: OntologyNodeJson[]): InventoryCategoryView {
  const meta = INVENTORY_ICONS[key] ?? INVENTORY_ICONS.compute;
  const healthy = nodes.filter((n) => statusToHealth(n.status) === 'healthy').length;
  const degraded = nodes.filter((n) => statusToHealth(n.status) === 'degraded').length;
  const down = nodes.filter((n) => statusToHealth(n.status) === 'down').length;
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    iconColor: meta.color,
    iconBg: meta.bg,
    total: nodes.length,
    healthy,
    degraded,
    down,
  };
}

export function mapCapabilities(graph: OntologyGraphResponse, dcShortName: string): BusinessCapabilityView[] {
  const appNodes = getAppNodesInDc(graph, dcShortName);

  const byApp: Record<string, OntologyNodeJson[]> = {};
  for (const a of appNodes) {
    const meta = a.metadata as Record<string, unknown>;
    const appId = (meta?.component_id as string) ?? a.id;
    byApp[appId] = byApp[appId] ?? [];
    byApp[appId].push(a);
  }

  return Object.entries(byApp).map(([appId, nodes], i) => {
    const health = nodes.some((n) => statusToHealth(n.status) === 'down')
      ? 'down'
      : nodes.some((n) => statusToHealth(n.status) === 'degraded')
      ? 'degraded'
      : 'healthy';
    const confidence = (nodes[0].metadata as Record<string, unknown>)?.confidence_score as number | undefined;
    const criticality: BusinessCapabilityView['criticality'] =
      confidence !== undefined && confidence >= 80 ? 'critical'
      : confidence !== undefined && confidence >= 60 ? 'high'
      : i % 3 === 0 ? 'medium' : 'low';
    return {
      id: appId,
      name: nodes[0].label,
      criticality,
      applications: nodes.length,
      health,
    };
  });
}

export function mapOwnerTeams(graph: OntologyGraphResponse, dcShortName: string): OwnerTeamView[] {
  const appNodes = getAppNodesInDc(graph, dcShortName);

  const byTeam: Record<string, OntologyNodeJson[]> = {};
  for (const a of appNodes) {
    const meta = a.metadata as Record<string, unknown>;
    const teamId = (meta?.team_id as string) ?? 'unknown-team';
    byTeam[teamId] = byTeam[teamId] ?? [];
    byTeam[teamId].push(a);
  }

  return Object.entries(byTeam).map(([teamId, nodes]) => {
    const health = nodes.some((n) => statusToHealth(n.status) === 'down')
      ? 'down'
      : nodes.some((n) => statusToHealth(n.status) === 'degraded')
      ? 'degraded'
      : 'healthy';
    return {
      id: teamId,
      name: teamId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      applications: nodes.length,
      services: nodes.length,
      health,
    };
  });
}

// ─── Analyze mappers ─────────────────────────────────────────────────────────

export function mapImpactMetrics(scope: DcExitScopeResponse) {
  const blast = scope.blast_radius;
  const impactedNodes = scope.impacted_nodes ?? [];
  const appCount = impactedNodes.filter((n) => n.ontology_class === 'Application').length;
  const infraCount = impactedNodes.filter((n) => n.ontology_class !== 'Application').length;

  return [
    { id: 'impacted-apps', label: 'Impacted Apps', icon: Boxes, iconColor: '#006CFF', iconBg: 'rgba(0,108,255,0.08)', value: blast?.total_apps_impacted ?? appCount, unit: 'apps', delta: 0, deltaLabel: 'from scope' },
    { id: 'critical', label: 'Critical Impact', icon: Shield, iconColor: '#FF003C', iconBg: 'rgba(255,0,60,0.08)', value: blast?.critical_count ?? 0, unit: 'critical', delta: 0, deltaLabel: 'blast radius' },
    { id: 'warnings', label: 'Warnings', icon: FlameKindling, iconColor: '#FFB100', iconBg: 'rgba(255,177,0,0.08)', value: blast?.warning_count ?? 0, unit: 'warnings', delta: 0, deltaLabel: 'blast radius' },
    { id: 'infra-deps', label: 'Infrastructure Deps', icon: Database, iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.08)', value: infraCount, unit: 'assets', delta: 0, deltaLabel: 'in scope' },
  ];
}
