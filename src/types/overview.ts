// Types for the Project Overview tab and related API responses

export interface ConnectorSummary {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  icon: string | null;
  color: string | null;
  is_enabled: boolean;
  priority: number;
  status: string | null;
  health_status: string;
  last_sync_at: string | null;
  last_sync_response_ms: number | null;
  uptime_percentage: number | null;
  consecutive_failures: number;
  total_executions: number;
  total_failures: number;
  last_error: string | null;
}

export interface ProjectDashboardSummary {
  project_id: string;
  project_name: string;
  project_color: string | null;
  overall_score: number | null;
  overall_health_status: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_id: string | null;
  availability_percentage: number;
  sla_percentage: number;
  incident_count: number;
  total_connectors: number;
  enabled_connectors: number;
  healthy_connectors: number;
  degraded_connectors: number;
  down_connectors: number;
  unknown_connectors: number;
  connectors: ConnectorSummary[];
}

export interface TrendPoint {
  timestamp: string;
  score?: number | null;
  status?: string | null;
  success_count?: number | null;
  failure_count?: number | null;
  duration_ms?: number | null;
}

export interface AvailabilityPoint {
  timestamp: string;
  availability: number;
}

export interface IncidentPoint {
  timestamp: string;
  incidents: number;
}

export interface ConnectorTrendPoint {
  timestamp: string;
  score: number | null;
  status: string | null;
  response_time_ms: number | null;
  outcome: string | null;
}

export interface ProjectTrendsResponse {
  time_range: string;
  hours: number;
  since: string;
  overall_trend: TrendPoint[];
  availability_trend: AvailabilityPoint[];
  incident_trend: IncidentPoint[];
  connector_trends: Record<string, ConnectorTrendPoint[]>;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  unit: string | null;
  connector: string | null;
  metric: string | null;
  description: string | null;
}

export interface MetricSeries {
  key: string;
  connector: string | null;
  metric_name: string | null;
  unit: string | null;
  description: string | null;
  data_points: MetricDataPoint[];
  latest_value: number | null;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
}

export interface ConnectorResponseTime {
  connector: string;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  samples: number;
}

export interface RunDuration {
  timestamp: string | null;
  duration_ms: number;
  score: number | null;
  status: string | null;
}

export interface ProjectMetricsResponse {
  time_range: string;
  hours: number;
  metrics: MetricSeries[];
  connector_response_times: ConnectorResponseTime[];
  run_durations: RunDuration[];
  score_distribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  total_runs: number;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export interface ProjectAlert {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'resolved';
  service: string;
  rule: string;
  current: string;
  threshold: string;
  time: string | null;
  duration: string | null;
  error: string | null;
  uptime: number | null;
  connector_id: string | null;
  connector_color: string | null;
  connector_icon: string | null;
  source: 'connector_agent' | 'health_run' | 'health_rule';
}

export interface ProjectAlertsResponse {
  project_id: string;
  alerts: ProjectAlert[];
  total: number;
  active_count: number;
  critical_count: number;
  warning_count: number;
  resolved_24h: number;
}

// ─── KPI Metrics ─────────────────────────────────────────────────────────────

export interface KpiMetricValue {
  value: number | null;
  change: string | null;
  positive: boolean;
  series: Array<{ timestamp: string; value: number }>;
}

export interface ProjectKpiMetricsResponse {
  project_id: string;
  time_range: string;
  hours: number;
  health_score: KpiMetricValue;
  availability: KpiMetricValue;
  avg_response_time_ms: KpiMetricValue;
  error_rate: KpiMetricValue;
  throughput: KpiMetricValue;
  active_alerts: KpiMetricValue;
  total_runs: number;
  success_runs: number;
  failure_runs: number;
  avg_duration_ms: number | null;
}

// ─── Activity Summary ─────────────────────────────────────────────────────────

export interface DayActivity {
  day: string;
  date: string;
  runs: number;
  errors: number;
}

export interface RunLogEntry {
  id: string;
  action: string;
  resource: string;
  status: 'success' | 'error' | 'warning';
  score: number | null;
  health_status: string | null;
  triggered_by: string;
  time: string | null;
  timestamp: string | null;
  duration_ms: number | null;
}

export interface ActivitySummaryResponse {
  project_id: string;
  days: number;
  activity: DayActivity[];
  total_runs: number;
  total_errors: number;
  avg_runs_per_day: number;
  recent_run_log: RunLogEntry[];
}

// ─── Analytics (SLA) ─────────────────────────────────────────────────────────

export interface SlaMetricItem {
  label: string;
  target_value: number;
  target_display: string;
  actual_value: number | null;
  actual_display: string | null;
  met: boolean;
  metric_key: string;
}

export interface SlaMetricsResponse {
  project_id: string;
  time_range: string;
  sla_threshold: number;
  uptime_percentage: number | null;
  availability_percentage: number | null;
  sla_met: boolean;
  sla_items?: SlaMetricItem[];
  breach_count?: number;
  total_runs?: number;
  [key: string]: unknown;
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface AuditLogItem {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: string | null;
  ip_address: string | null;
  tenant_id: string | null;
  created_at: string | null;
}

export interface AuditLogsResponse {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}
