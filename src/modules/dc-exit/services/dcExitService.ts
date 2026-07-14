/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Service layer for dc-exit API interactions.
 * Calls the FastAPI backend at /api/v1/dc-exit/*.
 */

import { apiClient } from '@/lib/api';

// ─── Response types ──────────────────────────────────────────────────────────

export interface OntologyNodeJson {
  id: string;
  node_key: string;
  label: string;
  domain: string;
  ontology_class: string;
  sub_class_of: string | null;
  icon: string | null;
  color: string | null;
  status: string;
  is_root: boolean;
  parent_id: string | null;
  properties: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface OntologyEdgeJson {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  label: string;
  is_animated: boolean;
  weight: number;
  properties: Record<string, unknown> | null;
}

export interface OntologyGraphResponse {
  nodes: OntologyNodeJson[];
  edges: OntologyEdgeJson[];
  node_count: number;
  edge_count: number;
}

export interface OntologyDomainResponse {
  domain: string;
  node_count: number;
}

export interface OntologyBuildResponse {
  tenant_id: string;
  node_count: number;
  edge_count: number;
  rebuilt_at: string;
}

export interface TraversalNode {
  id: string;
  node_key: string;
  label: string;
  domain: string;
  ontology_class: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export interface TraversalEdge {
  source: string;
  target: string;
  edge_type: string;
  label: string;
  depth: number;
}

export interface TraversalResponse {
  root_node_id: string;
  direction: string;
  max_depth: number;
  visited_node_ids: string[];
  layers: string[][];
  nodes: TraversalNode[];
  edges: TraversalEdge[];
  total_nodes: number;
  total_edges: number;
  traversed_at: string;
}

export interface DcExitScopeNode {
  id: string;
  node_key: string;
  label: string;
  domain: string;
  ontology_class: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export interface DcExitScopeResponse {
  data_center: string;
  dc_node_ids: string[];
  source_asset_count: number;
  impacted_node_count: number;
  impacted_nodes: DcExitScopeNode[];
  path_edges: TraversalEdge[];
  blast_radius: {
    total_apps_impacted: number;
    critical_count: number;
    warning_count: number;
    estimated_recovery_summary: string;
  } | null;
  computed_at: string;
}

export interface DependencyPathsResponse {
  source: string;
  target: string;
  path_count: number;
  paths: string[][];
  nodes: TraversalNode[];
  found_at: string;
  error?: string;
}

export interface ReadinessCategory {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  score: number;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  at_risk: number;
  avg_confidence: number;
  detail: string;
}

export interface ReadinessBlocker {
  id: string;
  category: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  owner: string;
  due_date: string | null;
  detail: string;
}

export interface ReadinessResponse {
  data_center: string;
  overall_score: number;
  overall_status: 'pass' | 'warn' | 'fail' | 'unknown';
  categories: ReadinessCategory[];
  blockers: ReadinessBlocker[];
  blocker_count: number;
  critical_blocker_count: number;
  assessed_at: string;
}

export interface ReadinessBlockersResponse {
  data_center: string;
  blockers: ReadinessBlocker[];
  blocker_count: number;
  critical_blocker_count: number;
}

export interface DecisionVerdict {
  verdict: 'SAFE' | 'CONDITIONAL' | 'DO_NOT_SHUTDOWN';
  headline: string;
  summary: string;
  confidence: number;
  readiness_score: number;
}

export interface PriorityRow {
  id: string;
  app_id: string;
  appName: string;
  tier: string;
  complexity: 'low' | 'medium' | 'high';
  dependencies: number;
  dependencyDetail: string;
  businessCriticality: string;
  confidenceScore: number;
  confidenceLabel: string;
  alignmentStatus: string;
  estimatedEffort: string;
  wave: number | null;
}

export interface MigrationWave {
  wave: number;
  app_count: number;
  apps: {
    app_id: string;
    appName: string;
    tier: string;
    complexity: string;
    estimatedEffort: string;
  }[];
  total_effort: number;
}

export interface DecisionEvidence {
  id: string;
  source: string;
  finding: string;
  weight: 'high' | 'medium';
}

export interface ReasoningStep {
  id: string;
  phase: string;
  timestamp: string;
  title: string;
  detail: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
}

export interface DecisionResponse {
  data_center: string;
  verdict: DecisionVerdict;
  readiness: {
    overall_score: number;
    overall_status: string;
    blocker_count: number;
    critical_blocker_count: number;
  };
  prioritization: PriorityRow[];
  waves: MigrationWave[];
  evidence: DecisionEvidence[];
  reasoning_timeline: ReasoningStep[];
  decided_at: string;
}

export interface DecisionVerdictResponse {
  data_center: string;
  verdict: DecisionVerdict;
  decided_at: string;
}

export interface DecisionPrioritizationResponse {
  data_center: string;
  prioritization: PriorityRow[];
  waves: MigrationWave[];
}

export interface ValidationChecklistItem {
  id: string;
  category: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  detail: string;
  verified_at: string;
}

export interface ValidationConfidenceSignal {
  id: string;
  source: string;
  score: number;
  weight: number;
  detail: string;
}

export interface DriftResult {
  id: string;
  drift_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  actual: string;
  intended: string;
}

export interface AlignmentCheck {
  id: string;
  domain: string;
  intent: string;
  actual: string;
  expected: string;
  status: 'aligned' | 'partial' | 'misaligned';
  detail: string;
  application_id: string | null;
}

export interface ValidationResponse {
  data_center: string;
  target_data_center: string | null;
  checklist: ValidationChecklistItem[];
  checklist_pass_count: number;
  checklist_fail_count: number;
  drift_results: Record<string, DriftResult[]>;
  alignment_checks: AlignmentCheck[];
  confidence_breakdown: ValidationConfidenceSignal[];
  overall_confidence: number;
  validated_at: string;
}

export interface ValidationChecklistResponse {
  data_center: string;
  checklist: ValidationChecklistItem[];
  pass_count: number;
  warn_count: number;
  fail_count: number;
  pending_count: number;
}

export interface DriftReportResponse {
  environment: string;
  applications_with_drift: string[];
  total_drifts: number;
  critical_drifts: number;
  results: Record<string, DriftResult[]>;
  checked_at: string;
}

export interface ValidationConfidenceResponse {
  data_center: string;
  signals: ValidationConfidenceSignal[];
  overall_confidence: number;
}

export interface FailoverViewResponse {
  source_dc: string;
  target_dc: string;
  summary: {
    total_resident_apps: number;
    total_dependent_apps: number;
    total_compute_units: number;
    total_storage_clusters: number;
    total_integration_channels: number;
    readiness_verdict: 'READY' | 'BLOCKED';
  };
  layer_1_apps: {
    resident: {
      app_id: string;
      app_name: string;
      tier: string;
      asset_count: number;
      tech_stacks: string[];
    }[];
    dependent: {
      app_id: string;
      app_name: string;
      tier: string;
      dependency_type: string;
      impact_severity: string;
    }[];
  };
  layer_2_compute: {
    units: {
      app_id: string;
      asset_id: string;
      name: string;
      source_cluster: string;
      source_namespace: string;
      replicas: number;
      target_cluster: string;
      target_namespace: string;
      cpu_cores_required: number;
      memory_gb_required: number;
      status: string;
    }[];
    capacity_check: {
      required_cpu_cores: number;
      required_memory_gb: number;
      available_cpu_cores: number;
      available_memory_gb: number;
      status: string;
      headroom_percent: number;
    };
  };
  layer_3_storage: {
    clusters: {
      db_name: string;
      tech_stack: string;
      source_node: string;
      source_role: string;
      target_node: string;
      target_role: string;
      replication_lag_seconds: number;
      status: string;
      classification: 'PROMOTE_LOCAL' | 'FAILOVER' | 'BLOCKER';
    }[];
    blockers: string[];
  };
  layer_4_integration: {
    channels: {
      type: string;
      name: string;
      source_endpoint: string;
      target_endpoint: string;
      mirror_status: string;
      consumer_group_lag: number;
      status: string;
    }[];
  };
  layer_5_config: {
    items: {
      app_id: string;
      config_type: string;
      property_key: string;
      current_value: string;
      proposed_value: string;
      file_path: string;
      remediation: string;
    }[];
  };
  layer_6_waves: {
    waves: MigrationWave[];
    total_waves: number;
  };
  timestamp: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const dcExitService = {
  getOntologyGraph: (domain?: string) =>
    apiClient
      .get<OntologyGraphResponse>('/dc-exit/ontology/graph', { params: domain ? { domain } : undefined })
      .then((r) => r.data),

  getOntologyDomains: () =>
    apiClient.get<OntologyDomainResponse[]>('/dc-exit/ontology/domains').then((r) => r.data),

  buildOntologyGraph: () =>
    apiClient.post<OntologyBuildResponse>('/dc-exit/ontology/build').then((r) => r.data),

  traverseFromNode: (body: {
    node_id: string;
    direction?: string;
    max_depth?: number;
    edge_types?: string[];
  }) => apiClient.post<TraversalResponse>('/dc-exit/traverse', body).then((r) => r.data),

  computeDcExitScope: (dataCenterShort: string) =>
    apiClient
      .post<DcExitScopeResponse>('/dc-exit/traverse/dc-scope', { data_center_short: dataCenterShort })
      .then((r) => r.data),

  findDependencyPaths: (sourceNodeKey: string, targetNodeKey: string, maxDepth = 6) =>
    apiClient
      .post<DependencyPathsResponse>('/dc-exit/traverse/paths', {
        source_node_key: sourceNodeKey,
        target_node_key: targetNodeKey,
        max_depth: maxDepth,
      })
      .then((r) => r.data),

  getReadiness: (dataCenter: string) =>
    apiClient.get<ReadinessResponse>('/dc-exit/readiness', { params: { data_center: dataCenter } }).then((r) => r.data),

  getReadinessBlockers: (dataCenter: string) =>
    apiClient
      .get<ReadinessBlockersResponse>('/dc-exit/readiness/blockers', { params: { data_center: dataCenter } })
      .then((r) => r.data),

  getDecision: (dataCenter: string) =>
    apiClient.get<DecisionResponse>('/dc-exit/decision', { params: { data_center: dataCenter } }).then((r) => r.data),

  getDecisionVerdict: (dataCenter: string) =>
    apiClient
      .get<DecisionVerdictResponse>('/dc-exit/decision/verdict', { params: { data_center: dataCenter } })
      .then((r) => r.data),

  getDecisionPrioritization: (dataCenter: string) =>
    apiClient
      .get<DecisionPrioritizationResponse>('/dc-exit/decision/prioritization', {
        params: { data_center: dataCenter },
      })
      .then((r) => r.data),

  getValidation: (dataCenter: string, targetDc?: string) =>
    apiClient
      .get<ValidationResponse>('/dc-exit/validation', {
        params: { data_center: dataCenter, target_dc: targetDc },
      })
      .then((r) => r.data),

  getValidationChecklist: (dataCenter: string, targetDc?: string) =>
    apiClient
      .get<ValidationChecklistResponse>('/dc-exit/validation/checklist', {
        params: { data_center: dataCenter, target_dc: targetDc },
      })
      .then((r) => r.data),

  getDriftReport: (environment = 'PRODUCTION') =>
    apiClient
      .get<DriftReportResponse>('/dc-exit/validation/drift', { params: { environment } })
      .then((r) => r.data),

  getValidationConfidence: (dataCenter: string) =>
    apiClient
      .get<ValidationConfidenceResponse>('/dc-exit/validation/confidence', {
        params: { data_center: dataCenter },
      })
      .then((r) => r.data),

  getFailoverView: (sourceDc: string, targetDc: string) =>
    apiClient
      .get<FailoverViewResponse>('/dc-exit/failover-view', {
        params: { source_dc: sourceDc, target_dc: targetDc },
      })
      .then((r) => r.data),

  startMigration: (body: { session_id: string; source_dc: string; target_dc: string; mode: string }) =>
    apiClient.post<{ run_id: string; status: string }>('/dc-exit/migrate/start', null, { params: body }).then((r) => r.data),

  getMigrationStatus: (runId: string) =>
    apiClient.get<MigrationStatusResponse>(`/dc-exit/migrate/status/${runId}`).then((r) => r.data),

  pauseMigration: (runId: string) =>
    apiClient.post<{ success: boolean }>(`/dc-exit/migrate/pause/${runId}`).then((r) => r.data),

  resumeMigration: (runId: string) =>
    apiClient.post<{ success: boolean }>(`/dc-exit/migrate/resume/${runId}`).then((r) => r.data),

  rollbackMigration: (runId: string) =>
    apiClient.post<{ success: boolean }>(`/dc-exit/migrate/rollback/${runId}`).then((r) => r.data),

  getResidualTraffic: (dataCenter: string) =>
    apiClient
      .get<ResidualTrafficResponse>('/dc-exit/validation/residual-traffic', {
        params: { data_center: dataCenter },
      })
      .then((r) => r.data),
};

export interface MigrationWaveStatus {
  id: string;
  wave_number: number;
  status: string;
}

export interface AppMigrationStatus {
  app_id: string;
  app_name: string;
  status: string;
  current_phase: string;
  progress: number;
  error?: string;
  wave_id?: string;
}

export interface AdapterAuditLog {
  id: string;
  app_id?: string;
  adapter_name: string;
  operation: string;
  target?: string;
  status: string;
  error_message?: string;
  timestamp: string;
}

export interface MigrationStatusResponse {
  run_id: string;
  status: string;
  mode: string;
  source_dc: string;
  target_dc: string;
  start_time?: string;
  end_time?: string;
  waves: MigrationWaveStatus[];
  apps: AppMigrationStatus[];
  audit_logs: AdapterAuditLog[];
}

// ─── Phase 6: Residual Traffic (Post-Cutover Verification) ───────────────────

export interface ResidualAsset {
  id: string;
  name: string;
  tech_stack: string;
  active_connections: number;
  asset_type: string;
}

export interface ResidualTrafficResponse {
  source_dc: string;
  status: 'clean' | 'residual_detected';
  residual_connection_count: number;
  offending_assets: ResidualAsset[];
  scanned_at: string;
}
