export type ConnectorType = 'rest_api' | 'database' | 'message_queue' | 'grpc' | 'graphql' | 'websocket' | 'custom';
export type ConnectorStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface Connector {
  id: string;
  name: string;
  description?: string;
  type: ConnectorType;
  project_id: string;
  endpoint_url?: string;
  config?: string;
  status: ConnectorStatus;
  is_active: boolean;
  check_interval_seconds: string;
  timeout_seconds: string;
  last_checked?: string;
  last_status_change?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  uptime_percentage?: number;
  avg_response_time_ms?: number;
}

export interface HealthCheck {
  id: string;
  connector_id: string;
  project_id: string;
  status: 'healthy' | 'degraded' | 'down' | 'timeout' | 'error';
  response_time_ms?: number;
  status_code?: number;
  error_message?: string;
  checked_at: string;
}

export type CatalogConnectorCategory = 'observability' | 'apm' | 'itsm' | 'database' | 'messaging' | 'custom';
export type CatalogConnectorStatus = 'active' | 'disabled' | 'deprecated';

export interface ConnectorCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description?: string;
  vendor?: string;
  category: CatalogConnectorCategory;
  status: CatalogConnectorStatus;
  icon?: string;
  color?: string;
  tags?: string;
  is_system: boolean;
  is_enabled: boolean;
  config_schema?: Record<string, unknown>;
  default_config?: Record<string, unknown>;
  test_definition?: Record<string, unknown>;
  docs_url?: string;
  version?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectorCatalogTestResult {
  success: boolean;
  status_code?: number;
  response_time_ms?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export type MetricType = 'number' | 'percentage' | 'time_series' | 'table' | 'status' | 'boolean' | 'duration';
export type AggregationType = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'latest';
export type ParserType = 'json_path' | 'regex' | 'xml_path' | 'csv' | 'plain_text' | 'custom';

export interface MetricTemplate {
  id: string;
  catalog_entry_id: string;
  name: string;
  metric_key: string;
  description?: string;
  category?: string;
  display_order: number;
  metric_type: MetricType;
  unit?: string;
  aggregation_type: AggregationType;
  threshold_warning?: number | null;
  threshold_critical?: number | null;
  query_config?: Record<string, unknown> | null;
  parser_type: ParserType;
  result_mapping?: Record<string, unknown> | null;
  transformation_rules?: Array<Record<string, unknown>> | null;
  is_enabled_by_default: boolean;
  is_required: boolean;
  is_custom: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MetricTemplateCreatePayload {
  name: string;
  metric_key: string;
  description?: string;
  category?: string;
  display_order?: number;
  metric_type?: MetricType;
  unit?: string;
  aggregation_type?: AggregationType;
  threshold_warning?: number | null;
  threshold_critical?: number | null;
  query_config?: Record<string, unknown> | null;
  parser_type?: ParserType;
  result_mapping?: Record<string, unknown> | null;
  transformation_rules?: Array<Record<string, unknown>> | null;
  is_enabled_by_default?: boolean;
  is_required?: boolean;
  is_custom?: boolean;
}

export interface MetricTemplateTestResult {
  success: boolean;
  raw_response?: unknown;
  parsed_value?: unknown;
  error?: string;
  response_time_ms?: number;
  status_code?: number;
  validation_errors?: string[] | null;
}

export type ProjectConnectorStatus = 'configured' | 'unconfigured' | 'testing' | 'error';

export interface ProjectConnectorCatalogSnippet {
  id: string;
  slug: string;
  name: string;
  vendor?: string;
  category: CatalogConnectorCategory;
  icon?: string;
  color?: string;
  config_schema?: Record<string, unknown>;
  default_config?: Record<string, unknown>;
  test_definition?: Record<string, unknown>;
  docs_url?: string;
  version?: string;
}

export interface ProjectConnector {
  id: string;
  project_id: string;
  catalog_entry_id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  is_enabled: boolean;
  priority: number;
  status: ProjectConnectorStatus;
  last_test_at?: string;
  last_test_success?: boolean;
  last_test_error?: string;
  last_test_response_ms?: number;
  assigned_by?: string;
  created_at: string;
  updated_at: string;
  catalog_entry?: ProjectConnectorCatalogSnippet;
}

export interface ProjectConnectorTestResult {
  success: boolean;
  response_time_ms?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export type AgentHealthStatus = 'healthy' | 'degraded' | 'down' | 'timeout' | 'error' | 'unknown' | 'unconfigured';
export type ExecutionOutcome = 'success' | 'failure' | 'timeout' | 'auth_error' | 'config_error' | 'skipped';

export interface ConnectorAgentStatus {
  project_connector_id: string;
  health_status: AgentHealthStatus;
  last_sync_at?: string;
  last_sync_outcome?: ExecutionOutcome;
  last_sync_response_ms?: number;
  last_error?: string;
  last_error_at?: string;
  consecutive_failures: number;
  total_executions: number;
  total_failures: number;
  uptime_percentage?: number;
  updated_at?: string;
}

export interface ConnectorAgentTestResult {
  success: boolean;
  response_time_ms?: number;
  status_code?: number;
  error?: string;
  details?: Record<string, unknown>;
  authenticated?: boolean;
  connector_slug?: string;
  executed_at?: string;
}

export interface ConnectorAgentSyncResult {
  success: boolean;
  health_status: AgentHealthStatus;
  response_time_ms?: number;
  message?: string;
  error?: string;
  metrics?: Array<{ name: string; value: number; unit: string }>;
  connector_slug?: string;
  executed_at?: string;
}

export interface ConnectorExecutionLog {
  id: string;
  triggered_by: 'manual' | 'scheduled' | 'api';
  outcome: ExecutionOutcome;
  response_time_ms?: number;
  http_status_code?: number;
  error_message?: string;
  executed_at: string;
}

export interface ProjectConnectorMetricTemplate {
  id: string;
  name: string;
  metric_key: string;
  description?: string;
  category?: string;
  display_order: number;
  metric_type: MetricType;
  unit?: string;
  aggregation_type: AggregationType;
  threshold_warning?: number | null;
  threshold_critical?: number | null;
  is_enabled_by_default: boolean;
  is_required: boolean;
  is_custom: boolean;
}

export interface ProjectConnectorMetricBinding {
  id: string;
  project_connector_id: string;
  metric_template_id: string;
  is_enabled: boolean;
  is_critical: boolean;
  threshold_warning?: number | null;
  threshold_critical?: number | null;
  label_override?: string | null;
  query_config_override?: Record<string, unknown> | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  metric_template?: ProjectConnectorMetricTemplate;
}

export interface ProjectConnectorMetricUpsert {
  metric_template_id: string;
  is_enabled: boolean;
  is_critical: boolean;
  threshold_warning?: number | null;
  threshold_critical?: number | null;
  label_override?: string | null;
  query_config_override?: Record<string, unknown> | null;
}
