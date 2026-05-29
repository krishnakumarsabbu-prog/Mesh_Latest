export type RuleScope = 'global' | 'project' | 'connector' | 'metric';
export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type RuleStatus = 'active' | 'inactive' | 'draft' | 'archived';
export type RuleAction = 'override_status' | 'apply_penalty' | 'apply_bonus' | 'flag_incident' | 'notify';
export type ConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'in_range' | 'not_in_range' | 'contains' | 'not_contains' | 'is_true' | 'is_false';
export type ConditionMetricType = 'health_status' | 'health_score' | 'response_time_ms' | 'availability_pct' | 'sla_pct' | 'consecutive_failures' | 'error_rate' | 'incident_count' | 'uptime_pct' | 'custom_metric';
export type ConditionLogicGroup = 'and' | 'or';

export interface HealthRuleCondition {
  id?: string;
  rule_id?: string;
  metric_type: ConditionMetricType;
  metric_key?: string;
  operator: ConditionOperator;
  threshold_value?: number;
  threshold_value_max?: number;
  string_value?: string;
  description?: string;
  display_order?: number;
  created_at?: string;
}

export interface HealthRuleAssignment {
  id: string;
  rule_id: string;
  project_id?: string;
  connector_id?: string;
  scope_override?: string;
  is_active: boolean;
  assigned_by?: string;
  assigned_at: string;
}

export interface HealthRule {
  id: string;
  name: string;
  description?: string;
  slug: string;
  scope: RuleScope;
  severity: RuleSeverity;
  status: RuleStatus;
  action: RuleAction;
  logic_group: ConditionLogicGroup;
  action_value?: number;
  action_status_override?: string;
  action_metadata?: Record<string, unknown>;
  priority_weight: number;
  score_impact?: number;
  tags?: string;
  is_system: boolean;
  version: number;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  conditions: HealthRuleCondition[];
  assignments: HealthRuleAssignment[];
}

export interface HealthRuleListResponse {
  items: HealthRule[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ConditionTestDetail {
  condition_id?: string;
  metric_type: string;
  metric_key?: string;
  operator: string;
  threshold_value?: number;
  threshold_value_max?: number;
  actual_value: unknown;
  matched: boolean;
  explanation: string;
}

export interface RuleTestResponse {
  rule_id?: string;
  rule_name: string;
  matched: boolean;
  logic_group: string;
  score_impact?: number;
  status_override?: string;
  explanation: string;
  condition_details: ConditionTestDetail[];
  warnings: string[];
  persisted_test_run_id?: string;
}

export interface RuleValidationError {
  field: string;
  message: string;
  condition_index?: number;
}

export interface RuleValidationResponse {
  valid: boolean;
  errors: RuleValidationError[];
  warnings: string[];
}

export interface RuleMetadataOption {
  value: string;
  label: string;
  color?: string;
  description?: string;
  data_types?: string[];
  data_type?: string;
  requires_value?: boolean;
  requires_status?: boolean;
  value_label?: string;
}

export interface RuleMetadata {
  metric_types: RuleMetadataOption[];
  operators: RuleMetadataOption[];
  severities: RuleMetadataOption[];
  actions: RuleMetadataOption[];
  scopes: RuleMetadataOption[];
  statuses: RuleMetadataOption[];
  logic_groups: RuleMetadataOption[];
  health_status_values: string[];
}
