import type { RunHealthStatus, HealthRunStatus } from './health';

export interface DashboardStats {
  total_lobs: number;
  total_projects: number;
  total_connectors: number;
  healthy_connectors: number;
  degraded_connectors: number;
  down_connectors: number;
  unknown_connectors: number;
  overall_health_percentage: number;
  avg_response_time_ms?: number;
}

export interface HealthTrend {
  timestamp: string;
  healthy: number;
  degraded: number;
  down: number;
  total: number;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface ProjectDashboardConnectorSummary {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  icon?: string;
  color?: string;
  is_enabled: boolean;
  priority: number;
  status?: string;
  health_status: RunHealthStatus | 'unknown';
  last_sync_at?: string;
  last_sync_response_ms?: number;
  uptime_percentage?: number;
  consecutive_failures: number;
  total_executions: number;
  total_failures: number;
  last_error?: string;
}

export interface ProjectDashboardSummary {
  project_id: string;
  project_name: string;
  project_color?: string;
  overall_score?: number;
  overall_health_status?: RunHealthStatus;
  last_run_at?: string;
  last_run_status?: HealthRunStatus;
  last_run_id?: string;
  availability_percentage: number;
  sla_percentage: number;
  incident_count: number;
  total_connectors: number;
  enabled_connectors: number;
  healthy_connectors: number;
  degraded_connectors: number;
  down_connectors: number;
  unknown_connectors: number;
  connectors: ProjectDashboardConnectorSummary[];
}

export interface TrendDataPoint {
  timestamp: string;
  score?: number;
  status?: RunHealthStatus;
  success_count?: number;
  failure_count?: number;
  duration_ms?: number;
}

export interface AvailabilityDataPoint {
  timestamp: string;
  availability: number;
}

export interface IncidentDataPoint {
  timestamp: string;
  incidents: number;
}

export interface ConnectorTrendDataPoint {
  timestamp: string;
  score?: number;
  status?: RunHealthStatus;
  response_time_ms?: number;
  outcome?: string;
}

export interface ProjectDashboardTrends {
  time_range: string;
  hours: number;
  since: string;
  overall_trend: TrendDataPoint[];
  availability_trend: AvailabilityDataPoint[];
  incident_trend: IncidentDataPoint[];
  connector_trends: Record<string, ConnectorTrendDataPoint[]>;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  unit?: string;
  connector?: string;
  metric?: string;
  description?: string;
}

export interface MetricSeries {
  key: string;
  connector?: string;
  metric_name?: string;
  unit?: string;
  description?: string;
  data_points: MetricDataPoint[];
  latest_value?: number;
  avg_value?: number;
  min_value?: number;
  max_value?: number;
}

export interface ConnectorResponseTime {
  connector: string;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  samples: number;
}

export interface RunDurationDataPoint {
  timestamp: string;
  duration_ms: number;
  score?: number;
  status?: RunHealthStatus;
}

export interface ProjectDashboardMetrics {
  time_range: string;
  hours: number;
  metrics: MetricSeries[];
  connector_response_times: ConnectorResponseTime[];
  run_durations: RunDurationDataPoint[];
  score_distribution: { excellent: number; good: number; fair: number; poor: number };
  total_runs: number;
}

export interface ConnectorRunHistoryEntry {
  run_id: string;
  outcome?: string;
  health_status?: RunHealthStatus;
  health_score?: number;
  response_time_ms?: number;
  error_message?: string;
  message?: string;
  duration_ms?: number;
  started_at?: string;
  completed_at?: string;
  metrics: Array<{ name: string; value: number; unit?: string }>;
}

export interface ConnectorDrilldown {
  connector_id: string;
  connector_name: string;
  connector_slug?: string;
  connector_category?: string;
  connector_icon?: string;
  connector_color?: string;
  is_enabled: boolean;
  priority: number;
  status?: string;
  current_health_status: RunHealthStatus | 'unknown';
  last_sync_at?: string;
  last_sync_response_ms?: number;
  uptime_percentage?: number;
  consecutive_failures: number;
  total_executions: number;
  total_failures: number;
  last_error?: string;
  last_error_at?: string;
  run_history: ConnectorRunHistoryEntry[];
  metrics_by_name: Record<string, Array<{ timestamp: string; value: number; unit?: string }>>;
  recent_errors: Array<{ timestamp?: string; error?: string; outcome?: string }>;
  time_range: string;
  hours: number;
}

export type AnalyticsTimeRange = '24h' | '7d' | '30d' | '90d' | 'custom';
export type AnalyticsGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface AnalyticsTrendPoint {
  timestamp: string;
  score?: number | null;
  status?: string | null;
  run_count?: number;
}

export interface AnalyticsAvailabilityPoint {
  timestamp: string;
  availability?: number | null;
}

export interface AnalyticsIncidentPoint {
  timestamp: string;
  incidents: number;
  total_runs?: number;
}

export interface AnalyticsSlaPoint {
  timestamp: string;
  sla?: number | null;
}

export interface AnalyticsConnectorTrendPoint {
  timestamp: string;
  score?: number | null;
  avg_response_time_ms?: number | null;
  success_rate?: number | null;
}

export interface AnalyticsProjectTrends {
  project_id: string;
  time_range: string;
  granularity: string;
  hours: number;
  since: string;
  until: string;
  total_runs: number;
  score_delta?: number | null;
  health_trend: AnalyticsTrendPoint[];
  availability_trend: AnalyticsAvailabilityPoint[];
  incident_trend: AnalyticsIncidentPoint[];
  sla_trend: AnalyticsSlaPoint[];
  connector_trends: Record<string, AnalyticsConnectorTrendPoint[]>;
}

export interface AnalyticsProjectSummary {
  project_id: string;
  project_name: string;
  project_color?: string;
  avg_health_score?: number | null;
  availability_pct?: number | null;
  sla_pct?: number | null;
  uptime_pct?: number | null;
  incident_count: number;
  total_runs: number;
  score_trend: Array<{ timestamp: string; score?: number | null }>;
}

export interface AnalyticsProjectComparison {
  time_range: string;
  hours: number;
  since: string;
  until: string;
  projects: AnalyticsProjectSummary[];
}

export interface ConnectorPerformanceTrendPoint {
  timestamp: string;
  success_rate?: number | null;
  avg_response_time_ms?: number | null;
  avg_score?: number | null;
  total?: number;
}

export interface ConnectorPerformanceMetrics {
  connector_id?: string;
  connector_name: string;
  connector_slug?: string;
  connector_category?: string;
  total_executions: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_response_time_ms?: number | null;
  min_response_time_ms?: number | null;
  max_response_time_ms?: number | null;
  p95_response_time_ms?: number | null;
  avg_health_score?: number | null;
  top_errors: Array<{ message: string; count: number }>;
  trend: ConnectorPerformanceTrendPoint[];
}

export interface AnalyticsConnectorHistory {
  project_id: string;
  time_range: string;
  granularity: string;
  hours: number;
  since: string;
  until: string;
  connectors: ConnectorPerformanceMetrics[];
}

export interface ConnectorSlaMetrics {
  connector_name: string;
  connector_id?: string;
  uptime_pct?: number | null;
  sla_pct?: number | null;
  breach: number;
  total_executions: number;
  success_count: number;
  failure_count: number;
}

export interface DowntimePeriod {
  timestamp?: string;
  run_id?: string;
  sla_pct: number;
  failure_count: number;
  duration_ms?: number;
}

export interface AnalyticsSlaMetrics {
  project_id: string;
  time_range: string;
  hours: number;
  since: string;
  until: string;
  sla_threshold: number;
  uptime_pct?: number | null;
  sla_pct?: number | null;
  breach_count: number;
  downtime_periods: DowntimePeriod[];
  mttr_minutes?: number | null;
  mtbf_minutes?: number | null;
  total_runs: number;
  connector_sla: ConnectorSlaMetrics[];
  sla_trend: AnalyticsSlaPoint[];
}
