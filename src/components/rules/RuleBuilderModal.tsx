import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { healthRulesApi } from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';
import {
  HealthRule,
  HealthRuleCondition,
  RuleMetadata,
  RuleValidationError,
} from '@/types';

interface RuleBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingRule?: HealthRule;
  metadata: RuleMetadata | null;
}

interface ConditionDraft {
  metric_type: string;
  metric_key: string;
  operator: string;
  threshold_value: string;
  threshold_value_max: string;
  string_value: string;
  description: string;
  display_order: number;
}

function makeEmptyCondition(idx: number): ConditionDraft {
  return {
    metric_type: 'health_score',
    metric_key: '',
    operator: 'lt',
    threshold_value: '',
    threshold_value_max: '',
    string_value: '',
    description: '',
    display_order: idx,
  };
}

function ConditionRow({
  idx,
  cond,
  onChange,
  onRemove,
  canRemove,
  metadata,
  errors,
}: {
  idx: number;
  cond: ConditionDraft;
  onChange: (idx: number, field: keyof ConditionDraft, value: string) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean;
  metadata: RuleMetadata;
  errors: RuleValidationError[];
}) {
  const condErrors = errors.filter((e) => e.condition_index === idx);

  const selectedMetric = metadata.metric_types.find((m) => m.value === cond.metric_type);
  const metricDataType = selectedMetric?.data_type || 'numeric';

  const availableOps = metadata.operators.filter(
    (op) => !op.data_types || op.data_types.includes(metricDataType)
  );

  const selectedOp = metadata.operators.find((o) => o.value === cond.operator);
  const isRange = cond.operator === 'in_range' || cond.operator === 'not_in_range';
  const isStringOp = cond.operator === 'contains' || cond.operator === 'not_contains';
  const isBooleanOp = cond.operator === 'is_true' || cond.operator === 'is_false';
  const isStringMetric = cond.metric_type === 'health_status';

  const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg-subtle)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--text-primary)',
    borderRadius: '10px',
    padding: '6px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '4px' };

  return (
    <div
      className="rounded-xl p-4 relative"
      style={{ background: 'var(--app-bg-subtle)', border: `1px solid ${condErrors.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)'}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Condition {idx + 1}</span>
        {canRemove && (
          <button
            onClick={() => onRemove(idx)}
            className="p-1 rounded-lg transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.10)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Metric</label>
          <select
            value={cond.metric_type}
            onChange={(e) => {
              onChange(idx, 'metric_type', e.target.value);
              onChange(idx, 'operator', 'lt');
            }}
            style={{ ...inputStyle, appearance: 'none' }}
          >
            {metadata.metric_types.map((m) => (
              <option key={m.value} value={m.value} style={{ background: '#1a1d24' }}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Operator</label>
          <select
            value={cond.operator}
            onChange={(e) => onChange(idx, 'operator', e.target.value)}
            style={{ ...inputStyle, appearance: 'none' }}
          >
            {availableOps.map((op) => (
              <option key={op.value} value={op.value} style={{ background: '#1a1d24' }}>{op.label}</option>
            ))}
          </select>
        </div>

        {cond.metric_type === 'custom_metric' && (
          <div className="col-span-2">
            <label style={labelStyle}>Metric Key</label>
            <input
              type="text"
              placeholder="e.g. cpu_utilization, queue_depth"
              value={cond.metric_key}
              onChange={(e) => onChange(idx, 'metric_key', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {!isBooleanOp && !isStringOp && (
          isStringMetric && (cond.operator === 'eq' || cond.operator === 'neq') ? (
            <div className="col-span-2">
              <label style={labelStyle}>Status Value</label>
              <select
                value={cond.string_value}
                onChange={(e) => onChange(idx, 'string_value', e.target.value)}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="" style={{ background: '#1a1d24' }}>Select status...</option>
                {(metadata.health_status_values || []).map((s) => (
                  <option key={s} value={s} style={{ background: '#1a1d24' }}>{s}</option>
                ))}
              </select>
            </div>
          ) : isRange ? (
            <>
              <div>
                <label style={labelStyle}>Min Value</label>
                <input
                  type="number"
                  placeholder="0"
                  value={cond.threshold_value}
                  onChange={(e) => onChange(idx, 'threshold_value', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Max Value</label>
                <input
                  type="number"
                  placeholder="100"
                  value={cond.threshold_value_max}
                  onChange={(e) => onChange(idx, 'threshold_value_max', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <label style={labelStyle}>Threshold Value</label>
              <input
                type="number"
                placeholder="Enter threshold..."
                value={cond.threshold_value}
                onChange={(e) => onChange(idx, 'threshold_value', e.target.value)}
                style={inputStyle}
              />
            </div>
          )
        )}

        {isStringOp && (
          <div className="col-span-2">
            <label style={labelStyle}>Value to Check</label>
            <input
              type="text"
              placeholder="Enter string to match..."
              value={cond.string_value}
              onChange={(e) => onChange(idx, 'string_value', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {condErrors.map((err, i) => (
        <div key={i} className="flex items-center gap-1.5 mt-2">
          <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: '#EF4444' }} />
          <span className="text-xs" style={{ color: '#EF4444' }}>{err.message}</span>
        </div>
      ))}
    </div>
  );
}

export function RuleBuilderModal({ open, onClose, onSaved, editingRule, metadata }: RuleBuilderModalProps) {
  const { add: addNotification } = useNotificationStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('global');
  const [severity, setSeverity] = useState('medium');
  const [action, setAction] = useState('apply_penalty');
  const [logicGroup, setLogicGroup] = useState('and');
  const [actionValue, setActionValue] = useState('5');
  const [actionStatusOverride, setActionStatusOverride] = useState('degraded');
  const [priorityWeight, setPriorityWeight] = useState('1.0');
  const [tags, setTags] = useState('');
  const [conditions, setConditions] = useState<ConditionDraft[]>([makeEmptyCondition(0)]);

  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<RuleValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const isEdit = !!editingRule;

  useEffect(() => {
    if (!open) return;
    if (editingRule) {
      setName(editingRule.name);
      setDescription(editingRule.description || '');
      setScope(editingRule.scope);
      setSeverity(editingRule.severity);
      setAction(editingRule.action);
      setLogicGroup(editingRule.logic_group);
      setActionValue(editingRule.action_value?.toString() || '5');
      setActionStatusOverride(editingRule.action_status_override || 'degraded');
      setPriorityWeight(editingRule.priority_weight?.toString() || '1.0');
      setTags(editingRule.tags || '');
      setConditions(
        editingRule.conditions.length > 0
          ? editingRule.conditions.map((c, i) => ({
              metric_type: c.metric_type,
              metric_key: c.metric_key || '',
              operator: c.operator,
              threshold_value: c.threshold_value?.toString() || '',
              threshold_value_max: c.threshold_value_max?.toString() || '',
              string_value: c.string_value || '',
              description: c.description || '',
              display_order: c.display_order || i,
            }))
          : [makeEmptyCondition(0)]
      );
    } else {
      setName('');
      setDescription('');
      setScope('global');
      setSeverity('medium');
      setAction('apply_penalty');
      setLogicGroup('and');
      setActionValue('5');
      setActionStatusOverride('degraded');
      setPriorityWeight('1.0');
      setTags('');
      setConditions([makeEmptyCondition(0)]);
    }
    setValidationErrors([]);
    setValidationWarnings([]);
    setFormErrors({});
  }, [open, editingRule]);

  const buildPayload = useCallback(() => {
    const conditionPayloads = conditions.map((c, i) => ({
      metric_type: c.metric_type,
      metric_key: c.metric_key || undefined,
      operator: c.operator,
      threshold_value: c.threshold_value !== '' ? parseFloat(c.threshold_value) : undefined,
      threshold_value_max: c.threshold_value_max !== '' ? parseFloat(c.threshold_value_max) : undefined,
      string_value: c.string_value || undefined,
      description: c.description || undefined,
      display_order: i,
    }));

    return {
      name,
      description: description || undefined,
      scope,
      severity,
      action,
      logic_group: logicGroup,
      action_value: actionValue !== '' ? parseFloat(actionValue) : undefined,
      action_status_override: action === 'override_status' ? actionStatusOverride : undefined,
      priority_weight: parseFloat(priorityWeight) || 1.0,
      tags: tags || undefined,
      conditions: conditionPayloads,
    };
  }, [name, description, scope, severity, action, logicGroup, actionValue, actionStatusOverride, priorityWeight, tags, conditions]);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    setValidationErrors([]);
    setValidationWarnings([]);
    try {
      const res = await healthRulesApi.validate(buildPayload() as Record<string, unknown>);
      setValidationErrors(res.data.errors || []);
      setValidationWarnings(res.data.warnings || []);
      if (res.data.valid) {
        addNotification({ type: 'success', title: 'Rule definition is valid' });
      }
    } catch {
      addNotification({ type: 'error', title: 'Validation request failed' });
    } finally {
      setValidating(false);
    }
  }, [buildPayload, addNotification]);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Name is required';
    if (conditions.length === 0) errors.conditions = 'At least one condition is required';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});

    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await healthRulesApi.update(editingRule!.id, payload as Record<string, unknown>);
        addNotification({ type: 'success', title: 'Rule updated successfully' });
      } else {
        await healthRulesApi.create(payload as Record<string, unknown>);
        addNotification({ type: 'success', title: 'Rule created successfully' });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      addNotification({ type: 'error', title: isEdit ? 'Failed to update rule' : 'Failed to create rule', message: typeof detail === 'string' ? detail : undefined });
    } finally {
      setSaving(false);
    }
  };

  const addCondition = () => {
    setConditions((prev) => [...prev, makeEmptyCondition(prev.length)]);
  };

  const removeCondition = (idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, field: keyof ConditionDraft, value: string) => {
    setConditions((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg-subtle)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--text-primary)',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    display: 'block',
    marginBottom: '5px',
  };

  const selectedAction = metadata?.actions?.find((a) => a.value === action);

  const globalErrors = validationErrors.filter((e) => e.condition_index === undefined || e.condition_index === null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Rule' : 'Create Health Rule'}
      subtitle={isEdit ? `Editing "${editingRule?.name}"` : 'Define conditions and actions for health scoring'}
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleValidate} loading={validating}>
            Validate
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            {isEdit ? 'Save Changes' : 'Create Rule'}
          </Button>
        </>
      }
    >
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
        {(globalErrors.length > 0 || validationWarnings.length > 0) && (
          <div className="space-y-2">
            {globalErrors.map((err, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EF4444' }} />
                <span className="text-xs" style={{ color: '#EF4444' }}><strong>{err.field}:</strong> {err.message}</span>
              </div>
            ))}
            {validationWarnings.map((warn, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)' }}>
                <Info className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                <span className="text-xs" style={{ color: '#F59E0B' }}>{warn}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label style={labelStyle}>Rule Name *</label>
            <input
              type="text"
              placeholder="e.g. High Response Time Warning"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, borderColor: formErrors.name ? 'rgba(239,68,68,0.40)' : undefined }}
            />
            {formErrors.name && <span className="text-xs mt-1 block" style={{ color: '#EF4444' }}>{formErrors.name}</span>}
          </div>

          <div className="col-span-2">
            <label style={labelStyle}>Description</label>
            <textarea
              placeholder="Optional description of what this rule checks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Scope</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              {(metadata?.scopes || []).map((s) => (
                <option key={s.value} value={s.value} style={{ background: '#1a1d24' }}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              {(metadata?.severities || []).map((s) => (
                <option key={s.value} value={s.value} style={{ background: '#1a1d24' }}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Condition Logic</label>
            <select value={logicGroup} onChange={(e) => setLogicGroup(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              {(metadata?.logic_groups || []).map((lg) => (
                <option key={lg.value} value={lg.value} style={{ background: '#1a1d24' }}>{lg.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Priority Weight</label>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={priorityWeight}
              onChange={(e) => setPriorityWeight(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              {(metadata?.actions || []).map((a) => (
                <option key={a.value} value={a.value} style={{ background: '#1a1d24' }}>{a.label}</option>
              ))}
            </select>
          </div>

          {selectedAction?.requires_value && (
            <div>
              <label style={labelStyle}>{selectedAction.value_label || 'Value'}</label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.5"
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          {action === 'override_status' && (
            <div>
              <label style={labelStyle}>Override To Status</label>
              <select value={actionStatusOverride} onChange={(e) => setActionStatusOverride(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                {(metadata?.health_status_values || []).map((s) => (
                  <option key={s} value={s} style={{ background: '#1a1d24' }}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div className="col-span-2">
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g. latency, sla, availability"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Conditions
              </span>
              <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                · evaluated with <strong style={{ color: 'var(--text-secondary)' }}>{logicGroup.toUpperCase()}</strong> logic
              </span>
            </div>
            <Button variant="ghost" size="xs" icon={<Plus className="w-3 h-3" />} onClick={addCondition}>
              Add Condition
            </Button>
          </div>

          {formErrors.conditions && (
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
              <AlertCircle className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
              <span className="text-xs" style={{ color: '#EF4444' }}>{formErrors.conditions}</span>
            </div>
          )}

          {metadata && (
            <div className="space-y-3">
              {conditions.map((cond, idx) => (
                <ConditionRow
                  key={idx}
                  idx={idx}
                  cond={cond}
                  onChange={updateCondition}
                  onRemove={removeCondition}
                  canRemove={conditions.length > 1}
                  metadata={metadata}
                  errors={validationErrors}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
