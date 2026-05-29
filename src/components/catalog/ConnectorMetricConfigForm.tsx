import React from 'react';
import { Input, Select, TextArea } from '@/components/ui/Input';

export type ConnectorSlug =
  | 'splunk'
  | 'grafana'
  | 'appdynamics'
  | 'servicenow'
  | 'universal-rest'
  | 'universal-sql'
  | string;

export interface ConnectorQueryConfig {
  method?: string;
  path?: string;
  search?: string;
  time_range?: string;
  aggregation?: string;
  parser_rules?: string;
  datasource?: string;
  query_path?: string;
  panel_selector?: string;
  metric_path?: string;
  entity_selector?: string;
  table_selector?: string;
  filter_query?: string;
  endpoint?: string;
  headers?: string;
  body?: string;
  json_path?: string;
  sql_query?: string;
  column_mapping?: string;
  [key: string]: unknown;
}

interface ConnectorMetricConfigFormProps {
  slug: ConnectorSlug;
  value: ConnectorQueryConfig;
  onChange: (updated: ConnectorQueryConfig) => void;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

function SplunkConfigForm({
  value,
  onChange,
}: {
  value: ConnectorQueryConfig;
  onChange: (v: ConnectorQueryConfig) => void;
}) {
  const set = (key: keyof ConnectorQueryConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <Field label="Search Query" hint="SPL search string — omit the leading 'search' keyword if using raw SPL">
        <TextArea
          placeholder="index=* level=ERROR | stats count by host"
          value={(value.search as string) || ''}
          onChange={set('search')}
          rows={3}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Time Range" hint="Relative time modifier, e.g. -1h, -30m, -24h">
          <Input
            placeholder="-1h"
            value={(value.time_range as string) || ''}
            onChange={set('time_range')}
          />
        </Field>
        <Field label="Aggregation Function" hint="e.g. sum, avg, max, min, count">
          <Select
            value={(value.aggregation as string) || 'sum'}
            onChange={set('aggregation')}
            options={[
              { value: 'sum', label: 'Sum' },
              { value: 'avg', label: 'Average' },
              { value: 'max', label: 'Maximum' },
              { value: 'min', label: 'Minimum' },
              { value: 'count', label: 'Count' },
            ]}
          />
        </Field>
      </div>
      <Field label="Parser Rules" hint="Optional post-processing rules — JSON or regex pattern">
        <Input
          placeholder='e.g. {"field": "count", "cast": "int"}'
          value={(value.parser_rules as string) || ''}
          onChange={set('parser_rules')}
        />
      </Field>
    </div>
  );
}

function GrafanaConfigForm({
  value,
  onChange,
}: {
  value: ConnectorQueryConfig;
  onChange: (v: ConnectorQueryConfig) => void;
}) {
  const set = (key: keyof ConnectorQueryConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <Field label="Datasource" hint="Grafana datasource name or UID (e.g. prometheus, loki, influxdb)">
        <Input
          placeholder="prometheus"
          value={(value.datasource as string) || ''}
          onChange={set('datasource')}
        />
      </Field>
      <Field label="Query / PromQL Expression" hint="Full metric query or PromQL expression">
        <TextArea
          placeholder="rate(http_requests_total{status=~'5..'}[5m])"
          value={(value.query_path as string) || ''}
          onChange={set('query_path')}
          rows={3}
        />
      </Field>
      <Field label="Panel Selector" hint="Dashboard panel title or panel ID to scope the query">
        <Input
          placeholder="e.g. cpu-overview or panel-12"
          value={(value.panel_selector as string) || ''}
          onChange={set('panel_selector')}
        />
      </Field>
    </div>
  );
}

function AppDynamicsConfigForm({
  value,
  onChange,
}: {
  value: ConnectorQueryConfig;
  onChange: (v: ConnectorQueryConfig) => void;
}) {
  const set = (key: keyof ConnectorQueryConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <Field label="Metric Path (Metric Browser)" hint="Full AppDynamics metric path using pipe-separated hierarchy">
        <Input
          placeholder="Overall Application Performance|Average Response Time (ms)"
          value={(value.metric_path as string) || ''}
          onChange={set('metric_path')}
        />
      </Field>
      <Field label="Entity Selector" hint="AppDynamics entity type to scope the metric retrieval">
        <Select
          value={(value.entity_selector as string) || 'APPLICATION'}
          onChange={set('entity_selector')}
          options={[
            { value: 'APPLICATION', label: 'Application' },
            { value: 'APPLICATION_COMPONENT', label: 'Application Component (Tier)' },
            { value: 'APPLICATION_COMPONENT_NODE', label: 'Node' },
            { value: 'BUSINESS_TRANSACTION', label: 'Business Transaction' },
            { value: 'BACKEND', label: 'Backend' },
          ]}
        />
      </Field>
    </div>
  );
}

function ServiceNowConfigForm({
  value,
  onChange,
}: {
  value: ConnectorQueryConfig;
  onChange: (v: ConnectorQueryConfig) => void;
}) {
  const set = (key: keyof ConnectorQueryConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <Field label="Table Selector" hint="ServiceNow table name to query (e.g. incident, problem, change_request)">
        <Select
          value={(value.table_selector as string) || 'incident'}
          onChange={set('table_selector')}
          options={[
            { value: 'incident', label: 'Incident' },
            { value: 'problem', label: 'Problem' },
            { value: 'change_request', label: 'Change Request' },
            { value: 'task', label: 'Task' },
            { value: 'task_sla', label: 'Task SLA' },
            { value: 'sys_user', label: 'Users' },
            { value: 'cmdb_ci', label: 'Configuration Item (CMDB)' },
          ]}
        />
      </Field>
      <Field
        label="Filter Builder (sysparm_query)"
        hint="ServiceNow encoded query string — use ^ for AND, ^OR for OR"
      >
        <TextArea
          placeholder="priority=1^state!=6^state!=7"
          value={(value.filter_query as string) || ''}
          onChange={set('filter_query')}
          rows={3}
        />
      </Field>
    </div>
  );
}

function UniversalRestConfigForm({
  value,
  onChange,
}: {
  value: ConnectorQueryConfig;
  onChange: (v: ConnectorQueryConfig) => void;
}) {
  const set = (key: keyof ConnectorQueryConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Field label="HTTP Method">
          <Select
            value={(value.method as string) || 'GET'}
            onChange={set('method')}
            options={[
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'PATCH', label: 'PATCH' },
            ]}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Endpoint Path" hint="Path appended to the connector base URL">
            <Input
              placeholder="/api/v1/metrics"
              value={(value.endpoint as string) || ''}
              onChange={set('endpoint')}
            />
          </Field>
        </div>
      </div>
      <Field label="Custom Headers" hint="JSON object of additional request headers">
        <TextArea
          placeholder='{"X-API-Version": "2", "Accept": "application/json"}'
          value={(value.headers as string) || ''}
          onChange={set('headers')}
          rows={2}
        />
      </Field>
      <Field label="Request Body" hint="JSON body for POST/PUT requests — leave blank for GET">
        <TextArea
          placeholder='{"filter": "active", "limit": 100}'
          value={(value.body as string) || ''}
          onChange={set('body')}
          rows={2}
        />
      </Field>
      <Field label="JSON Path Expression" hint="JSONPath to extract the metric value from the response">
        <Input
          placeholder="$.data.metrics.value"
          value={(value.json_path as string) || ''}
          onChange={set('json_path')}
        />
      </Field>
    </div>
  );
}

function UniversalSqlConfigForm({
  value,
  onChange,
}: {
  value: ConnectorQueryConfig;
  onChange: (v: ConnectorQueryConfig) => void;
}) {
  const set = (key: keyof ConnectorQueryConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <Field label="SQL Query" hint="Query that returns a single numeric value or row set">
        <TextArea
          placeholder="SELECT count(*) as metric_value FROM pg_stat_activity WHERE state != 'idle'"
          value={(value.sql_query as string) || ''}
          onChange={set('sql_query')}
          rows={4}
        />
      </Field>
      <Field label="Column Mapping" hint="Column name to read the metric value from">
        <Input
          placeholder="metric_value"
          value={(value.column_mapping as string) || ''}
          onChange={set('column_mapping')}
        />
      </Field>
    </div>
  );
}

export function ConnectorMetricConfigForm({
  slug,
  value,
  onChange,
}: ConnectorMetricConfigFormProps) {
  const normalizedSlug = slug?.toLowerCase();

  if (normalizedSlug === 'splunk') {
    return <SplunkConfigForm value={value} onChange={onChange} />;
  }
  if (normalizedSlug === 'grafana') {
    return <GrafanaConfigForm value={value} onChange={onChange} />;
  }
  if (normalizedSlug === 'appdynamics') {
    return <AppDynamicsConfigForm value={value} onChange={onChange} />;
  }
  if (normalizedSlug === 'servicenow') {
    return <ServiceNowConfigForm value={value} onChange={onChange} />;
  }
  if (normalizedSlug === 'universal-rest') {
    return <UniversalRestConfigForm value={value} onChange={onChange} />;
  }
  if (normalizedSlug === 'universal-sql') {
    return <UniversalSqlConfigForm value={value} onChange={onChange} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="HTTP Method"
          value={(value.method as string) || 'GET'}
          onChange={(e) => onChange({ ...value, method: e.target.value })}
        />
        <Input
          label="Path / Endpoint"
          placeholder="/api/v1/health"
          value={(value.path as string) || ''}
          onChange={(e) => onChange({ ...value, path: e.target.value })}
        />
      </div>
    </div>
  );
}
