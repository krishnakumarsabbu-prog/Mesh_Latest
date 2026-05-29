export type HealthRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';
export type HealthRunTrigger = 'manual' | 'scheduled' | 'api' | 'webhook';
export type RunConnectorOutcome = 'success' | 'failure' | 'timeout' | 'skipped' | 'error' | 'auth_error' | 'config_error';
export type RunHealthStatus = 'healthy' | 'degraded' | 'down' | 'timeout' | 'error' | 'unknown' | 'skipped';

export interface HealthRunConnectorResult {
  id: string;
  project_connector_id: string;
  connector_name: string;
  connector_slug?: string;
  connector_category?: string;
  outcome: RunConnectorOutcome;
  health_status: RunHealthStatus;
  health_score?: number;
  response_time_ms?: number;
  error_message?: string;
  message?: string;
  weight: number;
  is_enabled: boolean;
  priority: number;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface HealthRunSummary {
  run_id: string;
  execution_id: string;
  project_id: string;
  status: HealthRunStatus;
  overall_health_status?: RunHealthStatus;
  overall_score?: number;
  connector_count: number;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  total_duration_ms?: number;
  triggered_by: HealthRunTrigger;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface HealthRunDetail extends HealthRunSummary {
  contributing_factors: string[];
  connector_results: HealthRunConnectorResult[];
  connectors?: Array<{
    project_connector_id: string;
    connector_name: string;
    health_status: RunHealthStatus;
    outcome: RunConnectorOutcome;
    response_time_ms?: number;
    error?: string;
    message?: string;
    duration_ms?: number;
    priority: number;
    is_enabled: boolean;
  }>;
}
