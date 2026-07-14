/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Analyze step page. Fetches DC exit scope + ontology graph from
 * the backend API. Renders three tabs: Impact Analysis, Dependencies,
 * and Business Impact. A Continue button advances to the Decide phase.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Users, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ImpactAnalysisTab } from '@/modules/dc-exit/components/ImpactAnalysisTab';
import { DependenciesTab } from '@/modules/dc-exit/components/DependenciesTab';
import { BusinessImpactTab } from '@/modules/dc-exit/components/BusinessImpactTab';
import { DcExitLoading, DcExitError, DcExitEmpty } from '@/modules/dc-exit/components/DcExitStates';
import { useDcExitSession } from '@/modules/dc-exit/hooks/useDcExitSession';
import { useDcExitScope, useOntologyGraph } from '@/modules/dc-exit/hooks/useDcExitQueries';
import { mapImpactMetrics } from '@/modules/dc-exit/utils/mappers';
import type {
  ImpactMetric,
  DependencyBreakdown,
  DepGraphNode,
  DepGraphEdge,
  BusinessImpactCard,
  HealthState,
  DependencyType,
} from '@/modules/dc-exit/data/analyzeMockData';
import { DEPENDENCY_TYPE_META, DEPENDENCY_TYPE_ORDER } from '@/modules/dc-exit/data/analyzeMockData';
import type { DcExitScopeResponse, OntologyGraphResponse } from '@/modules/dc-exit/services/dcExitService';

const TABS: AnalyzeTabDef[] = [
  { id: 'impact', label: 'Impact Analysis' },
  { id: 'dependencies', label: 'Dependencies' },
  { id: 'business', label: 'Business Impact' },
];

function statusToHealth(status: string): HealthState {
  const s = (status || '').toLowerCase();
  if (s === 'healthy' || s === 'active' || s === 'online') return 'healthy';
  if (s === 'degraded') return 'degraded';
  if (s === 'down' || s === 'inactive' || s === 'offline') return 'down';
  return 'healthy';
}

function mapDependencyBreakdown(scope: DcExitScopeResponse): DependencyBreakdown[] {
  const nodes = scope.impacted_nodes ?? [];
  const groups: Record<string, { total: number; healthy: number; degraded: number; down: number }> = {};

  for (const n of nodes) {
    if (n.ontology_class === 'Application') continue;
    const domainKey = n.domain;
    if (!groups[domainKey]) groups[domainKey] = { total: 0, healthy: 0, degraded: 0, down: 0 };
    const h = statusToHealth(n.status);
    groups[domainKey].total++;
    groups[domainKey][h]++;
  }

  const typeMap: Record<string, DependencyType> = {
    messaging: 'mq',
    data: 'oracle',
    compute: 'vip',
    network: 'dns',
  };

  return Object.entries(groups).map(([domain, counts]) => {
    const type = typeMap[domain] ?? 'mq';
    return {
      type,
      total: counts.total,
      healthy: counts.healthy,
      degraded: counts.degraded,
      down: counts.down,
      atRisk: counts.degraded + counts.down,
    };
  });
}

function mapGraphToDepNodes(
  graph: OntologyGraphResponse,
  dcShort: string,
): { nodes: DepGraphNode[]; edges: DepGraphEdge[] } {
  const dcNodes = graph.nodes.filter(
    (n) =>
      n.ontology_class === 'DataCenter' &&
      (n.metadata as Record<string, unknown>)?.short_name === dcShort,
  );

  const relevantNodeIds = new Set<string>();
  for (const dc of dcNodes) {
    relevantNodeIds.add(dc.id);
  }

  const childMap = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.edge_type === 'owns' || e.edge_type === 'runs_in' || e.edge_type === 'contains') {
      const arr = childMap.get(e.source) ?? [];
      arr.push(e.target);
      childMap.set(e.source, arr);
    }
  }

  for (const dcId of relevantNodeIds) {
    const stack = [...(childMap.get(dcId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (relevantNodeIds.has(id)) continue;
      relevantNodeIds.add(id);
      stack.push(...(childMap.get(id) ?? []));
    }
  }

  const filteredNodes = graph.nodes.filter((n) => relevantNodeIds.has(n.id));
  const filteredEdges = graph.edges.filter(
    (e) => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target),
  );

  const appNodes = filteredNodes.filter((n) => n.ontology_class === 'Application');
  const svcNodes = filteredNodes.filter((n) => n.ontology_class !== 'Application');

  const depNodes: DepGraphNode[] = [];
  appNodes.forEach((n, i) => {
    depNodes.push({
      id: n.id,
      type: 'depApp',
      position: { x: 0, y: i * 120 },
      data: {
        label: n.label,
        nodeType: 'app',
        health: statusToHealth(n.status),
        sublabel: ((n.metadata as Record<string, unknown>)?.confidence_label as string) ?? '',
      },
    });
  });

  svcNodes.forEach((n, i) => {
    const domain = n.domain;
    const nodeType: DependencyType =
      domain === 'messaging' ? 'mq'
      : domain === 'data' ? 'oracle'
      : domain === 'network' ? 'dns'
      : 'mq';
    depNodes.push({
      id: n.id,
      type: 'depService',
      position: { x: 320, y: i * 100 - 40 },
      data: {
        label: n.label,
        nodeType,
        health: statusToHealth(n.status),
        sublabel: n.ontology_class,
      },
    });
  });

  const depEdges: DepGraphEdge[] = filteredEdges.map((e) => {
    const depType: DependencyType =
      e.edge_type === 'owns' ? 'oracle'
      : e.edge_type === 'runs_in' ? 'vip'
      : 'mq';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      depType,
      label: e.label,
      animated: e.is_animated,
    };
  });

  return { nodes: depNodes, edges: depEdges };
}

function mapBusinessImpactCards(scope: DcExitScopeResponse): BusinessImpactCard[] {
  const nodes = (scope.impacted_nodes ?? []).filter((n) => n.ontology_class === 'Application');
  return nodes.map((n) => {
    const meta = n.metadata as Record<string, unknown> | null;
    const confidence = (meta?.confidence_score as number) ?? 50;
    const health = statusToHealth(n.status);
    const severity: BusinessImpactCard['severity'] =
      confidence >= 80 ? 'critical' : confidence >= 60 ? 'high' : confidence >= 40 ? 'medium' : 'low';
    return {
      id: n.id,
      name: n.label,
      health,
      reason: meta?.confidence_label as string ?? health,
      customerImpact: `${severity} impact`,
      affectedCustomers: Math.max(1, Math.round(confidence / 3)),
      severity,
      trend: health === 'healthy' ? 'stable' : health === 'degraded' ? 'down' : 'up',
    };
  });
}

export function AnalyzePage() {
  const navigate = useNavigate();
  const { sessionId, session } = useDcExitSession();
  const [activeTab, setActiveTab] = useState<string>('impact');
  const dcShort = session?.dataCenterShort ?? '';

  const { data: scope, isLoading, isError } = useDcExitScope(dcShort);
  const { data: graph } = useOntologyGraph(undefined, { enabled: !!dcShort });

  const metrics = useMemo(() => (scope ? mapImpactMetrics(scope) : []), [scope]);
  const depBreakdown = useMemo(() => (scope ? mapDependencyBreakdown(scope) : []), [scope]);
  const depGraph = useMemo(
    () => (graph && dcShort ? mapGraphToDepNodes(graph, dcShort) : { nodes: [] as DepGraphNode[], edges: [] as DepGraphEdge[] }),
    [graph, dcShort],
  );
  const bizCards = useMemo(() => (scope ? mapBusinessImpactCards(scope) : []), [scope]);

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/decide`);
  };

  if (isLoading) return <DcExitLoading label="Analyzing DC exit scope…" />;
  if (isError) return <DcExitError message="Failed to load impact analysis. Check backend connection." />;
  if (!scope) return <DcExitEmpty label="No scope data available for this data center." />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'impact' && (
        <ImpactAnalysisTab metrics={metrics} dependencyBreakdown={depBreakdown} />
      )}
      {activeTab === 'dependencies' && (
        <DependenciesTab nodes={depGraph.nodes} edges={depGraph.edges} />
      )}
      {activeTab === 'business' && (
        <BusinessImpactTab cards={bizCards} />
      )}

      <div className="flex items-center justify-end pt-1">
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          iconRight={<ArrowRight className="w-4 h-4" />}
        >
          Continue to Decide
        </Button>
      </div>
    </div>
  );
}
