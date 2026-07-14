/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * React Query hooks for each dc-exit phase.
 * All hooks use the dcExitService to call the backend API.
 */

import {
  useQuery,
  useMutation,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { dcExitService } from '@/modules/dc-exit/services/dcExitService';
import type {
  OntologyGraphResponse,
  OntologyDomainResponse,
  OntologyBuildResponse,
  DcExitScopeResponse,
  TraversalResponse,
  DependencyPathsResponse,
  ReadinessResponse,
  ReadinessBlockersResponse,
  DecisionResponse,
  DecisionVerdictResponse,
  DecisionPrioritizationResponse,
  ValidationResponse,
  ValidationChecklistResponse,
  DriftReportResponse,
  ValidationConfidenceResponse,
  FailoverViewResponse,
  MigrationStatusResponse,
  ResidualTrafficResponse,
} from '@/modules/dc-exit/services/dcExitService';

export const dcExitKeys = {
  all: ['dc-exit'] as const,
  ontology: {
    all: ['dc-exit', 'ontology'] as const,
    graph: (domain?: string) => ['dc-exit', 'ontology', 'graph', domain ?? 'all'] as const,
    domains: () => ['dc-exit', 'ontology', 'domains'] as const,
    failoverView: (sourceDc: string, targetDc: string) => ['dc-exit', 'ontology', 'failover', sourceDc, targetDc] as const,
  },

  traversal: {
    all: ['dc-exit', 'traversal'] as const,
    scope: (dc: string) => ['dc-exit', 'traversal', 'scope', dc] as const,
    paths: (source: string, target: string) =>
      ['dc-exit', 'traversal', 'paths', source, target] as const,
    fromNode: (nodeId: string, direction: string) =>
      ['dc-exit', 'traversal', 'node', nodeId, direction] as const,
  },
  readiness: {
    all: ['dc-exit', 'readiness'] as const,
    detail: (dc: string) => ['dc-exit', 'readiness', dc] as const,
    blockers: (dc: string) => ['dc-exit', 'readiness', 'blockers', dc] as const,
  },
  decision: {
    all: ['dc-exit', 'decision'] as const,
    detail: (dc: string) => ['dc-exit', 'decision', dc] as const,
    verdict: (dc: string) => ['dc-exit', 'decision', 'verdict', dc] as const,
    prioritization: (dc: string) => ['dc-exit', 'decision', 'prioritization', dc] as const,
  },
  validation: {
    all: ['dc-exit', 'validation'] as const,
    detail: (dc: string, targetDc?: string) =>
      ['dc-exit', 'validation', dc, targetDc ?? 'none'] as const,
    checklist: (dc: string, targetDc?: string) =>
      ['dc-exit', 'validation', 'checklist', dc, targetDc ?? 'none'] as const,
    drift: (env: string) => ['dc-exit', 'validation', 'drift', env] as const,
    confidence: (dc: string) => ['dc-exit', 'validation', 'confidence', dc] as const,
    residual: (dc: string) => ['dc-exit', 'validation', 'residual', dc] as const,
  },
};

export function useOntologyGraph(
  domain?: string,
  options?: Omit<UseQueryOptions<OntologyGraphResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.ontology.graph(domain),
    queryFn: () => dcExitService.getOntologyGraph(domain),
    ...options,
  });
}

export function useOntologyDomains(
  options?: Omit<UseQueryOptions<OntologyDomainResponse[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.ontology.domains(),
    queryFn: () => dcExitService.getOntologyDomains(),
    ...options,
  });
}

export function useBuildOntologyGraph() {
  return useMutation({
    mutationFn: () => dcExitService.buildOntologyGraph(),
  });
}

export function useDcExitScope(
  dataCenterShort: string,
  options?: Omit<UseQueryOptions<DcExitScopeResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.traversal.scope(dataCenterShort),
    queryFn: () => dcExitService.computeDcExitScope(dataCenterShort),
    enabled: !!dataCenterShort,
    ...options,
  });
}

export function useTraverseFromNode(
  nodeId: string,
  direction = 'downstream',
  maxDepth = 5,
  options?: Omit<UseQueryOptions<TraversalResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.traversal.fromNode(nodeId, direction),
    queryFn: () => dcExitService.traverseFromNode({ node_id: nodeId, direction, max_depth: maxDepth }),
    enabled: !!nodeId,
    ...options,
  });
}

export function useDependencyPaths(
  sourceKey: string,
  targetKey: string,
  maxDepth = 6,
  options?: Omit<UseQueryOptions<DependencyPathsResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.traversal.paths(sourceKey, targetKey),
    queryFn: () => dcExitService.findDependencyPaths(sourceKey, targetKey, maxDepth),
    enabled: !!sourceKey && !!targetKey,
    ...options,
  });
}

export function useReadiness(
  dataCenter: string,
  options?: Omit<UseQueryOptions<ReadinessResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.readiness.detail(dataCenter),
    queryFn: () => dcExitService.getReadiness(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useReadinessBlockers(
  dataCenter: string,
  options?: Omit<UseQueryOptions<ReadinessBlockersResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.readiness.blockers(dataCenter),
    queryFn: () => dcExitService.getReadinessBlockers(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useDecision(
  dataCenter: string,
  options?: Omit<UseQueryOptions<DecisionResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.decision.detail(dataCenter),
    queryFn: () => dcExitService.getDecision(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useDecisionVerdict(
  dataCenter: string,
  options?: Omit<UseQueryOptions<DecisionVerdictResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.decision.verdict(dataCenter),
    queryFn: () => dcExitService.getDecisionVerdict(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useDecisionPrioritization(
  dataCenter: string,
  options?: Omit<UseQueryOptions<DecisionPrioritizationResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.decision.prioritization(dataCenter),
    queryFn: () => dcExitService.getDecisionPrioritization(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useValidation(
  dataCenter: string,
  targetDc?: string,
  options?: Omit<UseQueryOptions<ValidationResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.validation.detail(dataCenter, targetDc),
    queryFn: () => dcExitService.getValidation(dataCenter, targetDc),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useValidationChecklist(
  dataCenter: string,
  targetDc?: string,
  options?: Omit<UseQueryOptions<ValidationChecklistResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.validation.checklist(dataCenter, targetDc),
    queryFn: () => dcExitService.getValidationChecklist(dataCenter, targetDc),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useDriftReport(
  environment = 'PRODUCTION',
  options?: Omit<UseQueryOptions<DriftReportResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.validation.drift(environment),
    queryFn: () => dcExitService.getDriftReport(environment),
    ...options,
  });
}

export function useValidationConfidence(
  dataCenter: string,
  options?: Omit<UseQueryOptions<ValidationConfidenceResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.validation.confidence(dataCenter),
    queryFn: () => dcExitService.getValidationConfidence(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}

export function useFailoverView(
  sourceDc: string,
  targetDc: string,
  options?: Omit<UseQueryOptions<FailoverViewResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.ontology.failoverView(sourceDc, targetDc),
    queryFn: () => dcExitService.getFailoverView(sourceDc, targetDc),
    enabled: !!sourceDc && !!targetDc,
    ...options,
  });
}

export function useMigrationStatus(
  runId?: string,
  options?: Omit<UseQueryOptions<MigrationStatusResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: ['dc-exit', 'migrate', 'status', runId],
    queryFn: () => dcExitService.getMigrationStatus(runId!),
    enabled: !!runId && runId !== 'undefined',
    ...options,
  });
}

export function useStartMigration() {
  return useMutation({
    mutationFn: (body: { session_id: string; source_dc: string; target_dc: string; mode: string }) =>
      dcExitService.startMigration(body),
  });
}

export function usePauseMigration() {
  return useMutation({
    mutationFn: (runId: string) => dcExitService.pauseMigration(runId),
  });
}

export function useResumeMigration() {
  return useMutation({
    mutationFn: (runId: string) => dcExitService.resumeMigration(runId),
  });
}

export function useRollbackMigration() {
  return useMutation({
    mutationFn: (runId: string) => dcExitService.rollbackMigration(runId),
  });
}

export function useResidualTraffic(
  dataCenter: string,
  options?: Omit<UseQueryOptions<ResidualTrafficResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: dcExitKeys.validation.residual(dataCenter),
    queryFn: () => dcExitService.getResidualTraffic(dataCenter),
    enabled: !!dataCenter,
    ...options,
  });
}
