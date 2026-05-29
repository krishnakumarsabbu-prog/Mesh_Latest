import type { AggregationType } from './connector';

export type DashboardScope = 'project' | 'team' | 'lob' | 'global';
export type DashboardVisibility = 'global' | 'lob' | 'private';
export type WidgetType =
  | 'kpi_card' | 'gauge' | 'progress_ring' | 'sparkline'
  | 'line_chart' | 'area_chart' | 'bar_chart' | 'stacked_bar' | 'pie_donut'
  | 'sla_card' | 'alert_panel' | 'status_timeline' | 'comparison_grid'
  | 'table_widget' | 'heatmap' | 'health_distribution'
  | 'runtime_app_location_summary' | 'runtime_dc_health_map' | 'runtime_freshness_status';
export type MetricSourceScope = 'connector_metric' | 'team_aggregate' | 'lob_aggregate' | 'project_aggregate';
export type AggregationMode = 'latest' | 'avg' | 'sum' | 'min' | 'max' | 'count' | 'p95' | 'p99';

export interface WidgetMetricBinding {
  id: string;
  widget_id: string;
  metric_source_scope: MetricSourceScope;
  metric_key: string;
  connector_type?: string | null;
  aggregation_mode: AggregationMode;
  display_label?: string | null;
  color_override?: string | null;
  sort_order: number;
}

export interface WidgetMetricBindingCreate {
  metric_source_scope: MetricSourceScope;
  metric_key: string;
  connector_type?: string | null;
  aggregation_mode: AggregationMode;
  display_label?: string | null;
  color_override?: string | null;
  sort_order: number;
}

export interface DashboardWidget {
  id: string;
  dashboard_template_id: string;
  widget_type: WidgetType;
  title: string;
  subtitle?: string | null;
  layout_x: number;
  layout_y: number;
  width: number;
  height: number;
  chart_config?: Record<string, unknown> | null;
  threshold_config?: Record<string, unknown> | null;
  display_config?: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  metric_bindings: WidgetMetricBinding[];
}

export interface DashboardWidgetCreate {
  id?: string;
  widget_type: WidgetType;
  title: string;
  subtitle?: string | null;
  layout_x: number;
  layout_y: number;
  width: number;
  height: number;
  chart_config?: Record<string, unknown> | null;
  threshold_config?: Record<string, unknown> | null;
  display_config?: Record<string, unknown> | null;
  sort_order: number;
  metric_bindings: WidgetMetricBindingCreate[];
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description?: string | null;
  scope: DashboardScope;
  category?: string | null;
  tags?: string | null;
  visibility: DashboardVisibility;
  is_default: boolean;
  version: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  widgets: DashboardWidget[];
  widget_count: number;
}

export interface WidgetTypeMeta {
  value: WidgetType;
  label: string;
  description: string;
  default_width: number;
  default_height: number;
  min_width: number;
  min_height: number;
  category: string;
}

export interface WidgetOverrideCreate {
  widget_id: string;
  is_hidden: boolean;
  title_override?: string | null;
  sort_order_override?: number | null;
  threshold_config_override?: Record<string, unknown> | null;
  display_config_override?: Record<string, unknown> | null;
}

export interface WidgetOverrideResponse extends WidgetOverrideCreate {
  id: string;
  assignment_id: string;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCreate {
  template_id: string;
  display_name?: string | null;
  is_default?: boolean;
  refresh_interval_seconds?: number;
}

export interface AssignmentUpdate {
  display_name?: string | null;
  is_default?: boolean;
  sort_order?: number;
  refresh_interval_seconds?: number;
}

export interface AssignmentResponse {
  id: string;
  project_id: string;
  template_id: string;
  display_name?: string | null;
  sort_order: number;
  is_default: boolean;
  refresh_interval_seconds: number;
  assigned_by?: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string | null;
  template_description?: string | null;
  template_scope?: string | null;
  template_visibility?: string | null;
  template_category?: string | null;
  widget_count: number;
  overrides: WidgetOverrideResponse[];
}

export interface ValidationWarning {
  widget_id: string;
  widget_title: string;
  metric_key: string;
  connector_type?: string | null;
  message: string;
}

export interface AssignmentValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface AssignmentValidationResult {
  valid: boolean;
  errors: AssignmentValidationError[];
  warnings: ValidationWarning[];
  missing_connector_types: string[];
  missing_metric_keys: string[];
  satisfied_bindings: number;
  total_bindings: number;
}

export interface ResolvedMetric {
  binding_id: string;
  metric_key: string;
  label: string;
  connector?: string | null;
  connector_type?: string | null;
  aggregation_mode: AggregationMode;
  value?: number | null;
  latest_value?: number | null;
  avg_value?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  unit?: string | null;
  trend: Array<{ t: string; v: number }>;
  color?: string | null;
  description?: string | null;
}

export interface LiveWidgetData {
  widget_id: string;
  widget_type: WidgetType;
  title: string;
  subtitle?: string | null;
  is_hidden: boolean;
  layout_x: number;
  layout_y: number;
  width: number;
  height: number;
  sort_order: number;
  chart_config?: Record<string, unknown> | null;
  threshold_config?: Record<string, unknown> | null;
  display_config?: Record<string, unknown> | null;
  resolved_metrics: ResolvedMetric[];
  has_data: boolean;
  error?: string | null;
}

export interface LiveDashboardResponse {
  assignment_id: string;
  project_id: string;
  template_id: string;
  dashboard_name: string;
  template_name: string;
  refresh_interval_seconds: number;
  rendered_at: string;
  widgets: LiveWidgetData[];
  project_summary?: import('./topology').ProjectDashboardSummary | null;
}

export interface TeamWidgetOverrideCreate {
  widget_id: string;
  is_hidden: boolean;
  title_override?: string | null;
  sort_order_override?: number | null;
  threshold_config_override?: Record<string, unknown> | null;
  display_config_override?: Record<string, unknown> | null;
}

export interface TeamWidgetOverrideResponse extends TeamWidgetOverrideCreate {
  id: string;
  assignment_id: string;
  created_at: string;
  updated_at: string;
}

export interface TeamAssignmentCreate {
  template_id: string;
  display_name?: string | null;
  is_default?: boolean;
  refresh_interval_seconds?: number;
}

export interface TeamAssignmentUpdate {
  display_name?: string | null;
  is_default?: boolean;
  sort_order?: number;
  refresh_interval_seconds?: number;
}

export interface TeamAssignmentResponse {
  id: string;
  team_id: string;
  template_id: string;
  display_name?: string | null;
  sort_order: number;
  is_default: boolean;
  refresh_interval_seconds: number;
  assigned_by?: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string | null;
  template_description?: string | null;
  template_scope?: string | null;
  template_visibility?: string | null;
  template_category?: string | null;
  widget_count: number;
  overrides: TeamWidgetOverrideResponse[];
}

export interface TeamAssignmentValidationWarning {
  widget_id: string;
  widget_title: string;
  metric_key: string;
  message: string;
}

export interface TeamAssignmentValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface TeamAssignmentValidationResult {
  valid: boolean;
  errors: TeamAssignmentValidationError[];
  warnings: TeamAssignmentValidationWarning[];
  missing_metric_keys: string[];
  satisfied_bindings: number;
  total_bindings: number;
  available_metric_keys: string[];
}

export interface TeamResolvedMetric {
  binding_id: string;
  metric_key: string;
  label: string;
  aggregation_mode: AggregationMode;
  value?: number | null;
  unit?: string | null;
  trend: Array<{ t: string; v: number }>;
  color?: string | null;
  source: string;
  last_computed_at?: string | null;
  note?: string | null;
}

export interface TeamLiveWidgetData {
  widget_id: string;
  widget_type: WidgetType;
  title: string;
  subtitle?: string | null;
  is_hidden: boolean;
  layout_x: number;
  layout_y: number;
  width: number;
  height: number;
  sort_order: number;
  chart_config?: Record<string, unknown> | null;
  threshold_config?: Record<string, unknown> | null;
  display_config?: Record<string, unknown> | null;
  resolved_metrics: TeamResolvedMetric[];
  has_data: boolean;
  error?: string | null;
}

export interface TeamSummary {
  team_id: string;
  team_name: string;
  team_color?: string | null;
  project_count: number;
  healthy_projects: number;
  warning_projects: number;
  critical_projects: number;
  avg_project_health: number;
  total_alerts: number;
  avg_availability: number;
  sla_breach_count: number;
  metrics_computed_at?: string | null;
}

export interface TeamLiveDashboardResponse {
  assignment_id: string;
  team_id: string;
  template_id: string;
  dashboard_name: string;
  template_name: string;
  refresh_interval_seconds: number;
  rendered_at: string;
  widgets: TeamLiveWidgetData[];
  team_summary?: TeamSummary | null;
}

export interface LobWidgetOverrideCreate {
  widget_id: string;
  is_hidden: boolean;
  title_override?: string | null;
  sort_order_override?: number | null;
  threshold_config_override?: Record<string, unknown> | null;
  display_config_override?: Record<string, unknown> | null;
}

export interface LobWidgetOverrideResponse extends LobWidgetOverrideCreate {
  id: string;
  assignment_id: string;
  created_at: string;
  updated_at: string;
}

export interface LobAssignmentCreate {
  template_id: string;
  display_name?: string | null;
  is_default?: boolean;
  refresh_interval_seconds?: number;
}

export interface LobAssignmentUpdate {
  display_name?: string | null;
  is_default?: boolean;
  sort_order?: number;
  refresh_interval_seconds?: number;
}

export interface LobAssignmentResponse {
  id: string;
  lob_id: string;
  template_id: string;
  display_name?: string | null;
  sort_order: number;
  is_default: boolean;
  refresh_interval_seconds: number;
  assigned_by?: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string | null;
  template_description?: string | null;
  template_scope?: string | null;
  template_visibility?: string | null;
  template_category?: string | null;
  widget_count: number;
  overrides: LobWidgetOverrideResponse[];
}

export interface LobAssignmentValidationWarning {
  widget_id: string;
  widget_title: string;
  metric_key: string;
  message: string;
}

export interface LobAssignmentValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface LobAssignmentValidationResult {
  valid: boolean;
  errors: LobAssignmentValidationError[];
  warnings: LobAssignmentValidationWarning[];
  missing_metric_keys: string[];
  satisfied_bindings: number;
  total_bindings: number;
  available_metric_keys: string[];
}

export interface LobResolvedMetric {
  binding_id: string;
  metric_key: string;
  label: string;
  aggregation_mode: AggregationMode;
  value?: number | null;
  unit?: string | null;
  trend: Array<{ t: string; v: number }>;
  color?: string | null;
  source: string;
  last_computed_at?: string | null;
  note?: string | null;
}

export interface LobLiveWidgetData {
  widget_id: string;
  widget_type: WidgetType;
  title: string;
  subtitle?: string | null;
  is_hidden: boolean;
  layout_x: number;
  layout_y: number;
  width: number;
  height: number;
  sort_order: number;
  chart_config?: Record<string, unknown> | null;
  threshold_config?: Record<string, unknown> | null;
  display_config?: Record<string, unknown> | null;
  resolved_metrics: LobResolvedMetric[];
  has_data: boolean;
  error?: string | null;
}

export interface LobPortfolioSummary {
  lob_id: string;
  lob_name: string;
  lob_color?: string | null;
  team_count: number;
  total_projects: number;
  critical_projects_count: number;
  critical_teams_count: number;
  avg_team_health: number;
  avg_project_health: number;
  portfolio_availability: number;
  total_incidents: number;
  sla_breach_rate: number;
  metrics_computed_at?: string | null;
}

export interface LobLiveDashboardResponse {
  assignment_id: string;
  lob_id: string;
  template_id: string;
  dashboard_name: string;
  template_name: string;
  refresh_interval_seconds: number;
  rendered_at: string;
  widgets: LobLiveWidgetData[];
  portfolio_summary?: LobPortfolioSummary | null;
}

export interface LobAggregateMetric {
  lob_id: string;
  metric_key: string;
  numeric_value?: number | null;
  string_value?: string | null;
  compute_window_hours: number;
  last_computed_at: string;
}

// Suppress unused import warning — AggregationType is used in connector.ts domain
export type { AggregationType };
