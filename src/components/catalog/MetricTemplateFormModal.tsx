import React, { useEffect, useState } from 'react';
import { MetricTemplate, MetricTemplateCreatePayload, MetricType, AggregationType, ParserType } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { metricTemplateApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import { ConnectorMetricConfigForm, ConnectorQueryConfig, ConnectorSlug } from './ConnectorMetricConfigForm';

const METRIC_TYPE_OPTIONS: { value: MetricType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'time_series', label: 'Time Series' },
  { value: 'table', label: 'Table' },
  { value: 'status', label: 'Status' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'duration', label: 'Duration' },
];

const AGGREGATION_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'avg', label: 'Average' },
  { value: 'sum', label: 'Sum' },
  { value: 'max', label: 'Maximum' },
  { value: 'min', label: 'Minimum' },
  { value: 'count', label: 'Count' },
];

const PARSER_TYPE_OPTIONS: { value: ParserType; label: string }[] = [
  { value: 'json_path', label: 'JSON Path' },
  { value: 'regex', label: 'Regular Expression' },
  { value: 'xml_path', label: 'XML Path' },
  { value: 'csv', label: 'CSV' },
  { value: 'plain_text', label: 'Plain Text' },
  { value: 'custom', label: 'Custom' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'performance', label: 'Performance' },
  { value: 'availability', label: 'Availability' },
  { value: 'capacity', label: 'Capacity' },
  { value: 'error', label: 'Error Rate' },
  { value: 'latency', label: 'Latency' },
  { value: 'throughput', label: 'Throughput' },
  { value: 'security', label: 'Security' },
  { value: 'custom', label: 'Custom' },
];

interface FormState {
  name: string;
  metric_key: string;
  description: string;
  category: string;
  display_order: string;
  metric_type: MetricType;
  unit: string;
  aggregation_type: AggregationType;
  threshold_warning: string;
  threshold_critical: string;
  parser_type: ParserType;
  value_path: string;
  query_method: string;
  query_path: string;
  is_enabled_by_default: boolean;
  is_required: boolean;
  is_custom: boolean;
  connector_query_config: ConnectorQueryConfig;
}

const DEFAULT_FORM: FormState = {
  name: '',
  metric_key: '',
  description: '',
  category: '',
  display_order: '0',
  metric_type: 'number',
  unit: '',
  aggregation_type: 'latest',
  threshold_warning: '',
  threshold_critical: '',
  parser_type: 'json_path',
  value_path: '',
  query_method: 'GET',
  query_path: '',
  is_enabled_by_default: true,
  is_required: false,
  is_custom: false,
  connector_query_config: {},
};

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface MetricTemplateFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  catalogEntryId: string;
  template?: MetricTemplate | null;
  connectorSlug?: ConnectorSlug;
}

export function MetricTemplateFormModal({
  open,
  onClose,
  onSaved,
  catalogEntryId,
  template,
  connectorSlug,
}: MetricTemplateFormModalProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = !!template;

  useEffect(() => {
    if (template) {
      const qc = template.query_config as Record<string, unknown> | null;
      const rm = template.result_mapping as Record<string, unknown> | null;
      setForm({
        name: template.name,
        metric_key: template.metric_key,
        description: template.description || '',
        category: template.category || '',
        display_order: String(template.display_order),
        metric_type: template.metric_type,
        unit: template.unit || '',
        aggregation_type: template.aggregation_type,
        threshold_warning: template.threshold_warning != null ? String(template.threshold_warning) : '',
        threshold_critical: template.threshold_critical != null ? String(template.threshold_critical) : '',
        parser_type: template.parser_type,
        value_path: (rm?.value_path as string) || '',
        query_method: (qc?.method as string) || 'GET',
        query_path: (qc?.path as string) || '',
        is_enabled_by_default: template.is_enabled_by_default,
        is_required: template.is_required,
        is_custom: template.is_custom,
        connector_query_config: (qc as ConnectorQueryConfig) || {},
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [template, open]);

  const setField = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const setCheck = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.checked }));
    };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setForm((prev) => ({
      ...prev,
      name,
      metric_key: isEdit ? prev.metric_key : toSnakeCase(name),
    }));
  };

  const buildPayload = (): MetricTemplateCreatePayload => {
    const payload: MetricTemplateCreatePayload = {
      name: form.name,
      metric_key: form.metric_key,
      description: form.description || undefined,
      category: form.category || undefined,
      display_order: parseInt(form.display_order) || 0,
      metric_type: form.metric_type,
      unit: form.unit || undefined,
      aggregation_type: form.aggregation_type,
      threshold_warning: form.threshold_warning !== '' ? parseFloat(form.threshold_warning) : null,
      threshold_critical: form.threshold_critical !== '' ? parseFloat(form.threshold_critical) : null,
      parser_type: form.parser_type,
      is_enabled_by_default: form.is_enabled_by_default,
      is_required: form.is_required,
      is_custom: form.is_custom,
    };

    const hasConnectorConfig = connectorSlug && Object.keys(form.connector_query_config).length > 0;
    const hasGenericConfig = form.query_path || form.query_method !== 'GET';

    if (hasConnectorConfig) {
      payload.query_config = {
        method: form.query_method,
        path: form.query_path || undefined,
        ...form.connector_query_config,
      };
    } else if (hasGenericConfig) {
      payload.query_config = {
        method: form.query_method,
        path: form.query_path || undefined,
      };
    }

    if (form.value_path) {
      payload.result_mapping = { value_path: form.value_path };
    }

    return payload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.metric_key.trim()) {
      notify.error('Name and Metric Key are required');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit && template) {
        await metricTemplateApi.update(catalogEntryId, template.id, payload);
        notify.success('Metric template updated');
      } else {
        await metricTemplateApi.create(catalogEntryId, payload);
        notify.success('Metric template created');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notify.error(isEdit ? 'Failed to update metric template' : 'Failed to create metric template', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Metric Template' : 'New Metric Template'}
      subtitle={isEdit ? `Editing "${template?.name}"` : 'Define a new metric for this connector'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="metric-template-form" loading={saving}>
            {isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </>
      }
    >
      <form id="metric-template-form" onSubmit={handleSubmit} className="space-y-6">
        <Section title="Core Identity">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Metric Name"
              placeholder="e.g., CPU Utilization"
              value={form.name}
              onChange={handleNameChange}
              required
            />
            <Input
              label="Metric Key"
              placeholder="e.g., cpu_utilization"
              value={form.metric_key}
              onChange={setField('metric_key')}
              hint="Unique identifier — no spaces"
              required
            />
          </div>
          <TextArea
            label="Description"
            placeholder="What does this metric measure?"
            value={form.description}
            onChange={setField('description')}
            rows={2}
          />
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Category / Group"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORY_OPTIONS}
            />
            <Input
              label="Display Order"
              type="number"
              value={form.display_order}
              onChange={setField('display_order')}
              min={0}
            />
            <Input
              label="Unit / Format"
              placeholder="e.g., %, ms, GB"
              value={form.unit}
              onChange={setField('unit')}
            />
          </div>
        </Section>

        <Section title="Metric Definition">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Metric Type"
              value={form.metric_type}
              onChange={setField('metric_type')}
              options={METRIC_TYPE_OPTIONS}
            />
            <Select
              label="Aggregation Type"
              value={form.aggregation_type}
              onChange={setField('aggregation_type')}
              options={AGGREGATION_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Warning Threshold"
              type="number"
              placeholder="e.g., 80"
              value={form.threshold_warning}
              onChange={setField('threshold_warning')}
              hint="Leave blank to disable"
            />
            <Input
              label="Critical Threshold"
              type="number"
              placeholder="e.g., 95"
              value={form.threshold_critical}
              onChange={setField('threshold_critical')}
              hint="Leave blank to disable"
            />
          </div>
        </Section>

        <Section title="Execution Config">
          {connectorSlug ? (
            <ConnectorMetricConfigForm
              slug={connectorSlug}
              value={form.connector_query_config}
              onChange={(updated) => setForm((prev) => ({ ...prev, connector_query_config: updated }))}
            />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <Select
                label="HTTP Method"
                value={form.query_method}
                onChange={setField('query_method')}
                options={[
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                ]}
              />
              <div className="col-span-2">
                <Input
                  label="Query Path / Endpoint Suffix"
                  placeholder="e.g., /api/v1/metrics/cpu"
                  value={form.query_path}
                  onChange={setField('query_path')}
                  hint="Appended to the connector base URL"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Parser Type"
              value={form.parser_type}
              onChange={setField('parser_type')}
              options={PARSER_TYPE_OPTIONS}
            />
            <Input
              label="Value Path / Field Mapping"
              placeholder="e.g., $.data.cpu.value or data.cpu"
              value={form.value_path}
              onChange={setField('value_path')}
              hint="JSON path to extract the metric value"
            />
          </div>
        </Section>

        <Section title="Metadata">
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_enabled_by_default}
                onChange={setCheck('is_enabled_by_default')}
                className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-neutral-700">Enabled by default</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={setCheck('is_required')}
                className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-neutral-700">Required metric</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_custom}
                onChange={setCheck('is_custom')}
                className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-neutral-700">Custom metric</span>
            </label>
          </div>
        </Section>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{title}</h4>
        <div className="flex-1 h-px bg-neutral-100" />
      </div>
      {children}
    </div>
  );
}
