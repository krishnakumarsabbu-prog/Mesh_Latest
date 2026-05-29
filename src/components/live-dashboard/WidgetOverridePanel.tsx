import React, { useState, useEffect } from 'react';
import { X, Trash2, RotateCcw, EyeOff, Eye, Shield } from 'lucide-react';
import { LiveWidgetData, WidgetOverrideCreate, WidgetOverrideResponse } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface WidgetOverridePanelProps {
  widget: LiveWidgetData;
  existingOverride: WidgetOverrideResponse | null;
  onSave: (override: WidgetOverrideCreate) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}

export function WidgetOverridePanel({
  widget, existingOverride, onSave, onDelete, onClose,
}: WidgetOverridePanelProps) {
  const [title, setTitle] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [sortOrder, setSortOrder] = useState('');
  const [warnThreshold, setWarnThreshold] = useState('');
  const [critThreshold, setCritThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingOverride) {
      setTitle(existingOverride.title_override || '');
      setIsHidden(existingOverride.is_hidden);
      setSortOrder(existingOverride.sort_order_override?.toString() || '');
      const tc = existingOverride.threshold_config_override as Record<string, unknown> | null;
      setWarnThreshold((tc?.warning as number | undefined)?.toString() || '');
      setCritThreshold((tc?.critical as number | undefined)?.toString() || '');
    } else {
      setTitle('');
      setIsHidden(false);
      setSortOrder('');
      setWarnThreshold('');
      setCritThreshold('');
    }
  }, [existingOverride, widget.widget_id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const thresholdOverride: Record<string, unknown> | null =
        warnThreshold || critThreshold
          ? {
              ...(warnThreshold ? { warning: parseFloat(warnThreshold) } : {}),
              ...(critThreshold ? { critical: parseFloat(critThreshold) } : {}),
            }
          : null;

      await onSave({
        widget_id: widget.widget_id,
        is_hidden: isHidden,
        title_override: title || null,
        sort_order_override: sortOrder ? parseInt(sortOrder) : null,
        threshold_config_override: thresholdOverride,
        display_config_override: null,
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    title !== (existingOverride?.title_override || '') ||
    isHidden !== (existingOverride?.is_hidden ?? false) ||
    sortOrder !== (existingOverride?.sort_order_override?.toString() || '');

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary-500" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Widget Override</h3>
            <p className="text-xs text-neutral-400">Project-level customization</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
        <p className="text-xs font-medium text-neutral-600 truncate">{widget.title}</p>
        <p className="text-xs text-neutral-400 capitalize">{widget.widget_type.replace(/_/g, ' ')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <ToggleField
          label="Hide Widget"
          description="Hide this widget from the dashboard view"
          value={isHidden}
          onChange={setIsHidden}
          icon={isHidden ? <EyeOff className="w-4 h-4 text-neutral-400" /> : <Eye className="w-4 h-4 text-neutral-400" />}
        />

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">
            Title Override
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={widget.title}
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
          <p className="text-xs text-neutral-400 mt-1">Original: {widget.title}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">
            Sort Order Override
          </label>
          <input
            type="number"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            placeholder={String(widget.sort_order)}
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
          <p className="text-xs text-neutral-400 mt-1">Controls display order within the dashboard</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Threshold Overrides
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Warning</label>
              <input
                type="number"
                value={warnThreshold}
                onChange={e => setWarnThreshold(e.target.value)}
                placeholder={String(widget.threshold_config?.warning || '')}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Critical</label>
              <input
                type="number"
                value={critThreshold}
                onChange={e => setCritThreshold(e.target.value)}
                placeholder={String(widget.threshold_config?.critical || '')}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-danger-400 focus:ring-2 focus:ring-danger-100"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-400 mt-1">Override warning/critical thresholds for this project only</p>
        </div>

        <div className="p-3 bg-primary-50 rounded-xl border border-primary-100">
          <p className="text-xs text-primary-700 font-medium">Project-Level Overrides</p>
          <p className="text-xs text-primary-600 mt-0.5">
            These changes only apply to this project. The master template remains unchanged.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-neutral-100 flex items-center justify-between gap-2">
        {existingOverride ? (
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-danger-500 hover:bg-danger-50 border border-danger-200 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Template
          </button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>
            Apply Override
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleField({ label, description, value, onChange, icon }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 flex-1">
        {icon && <div className="mt-0.5">{icon}</div>}
        <div>
          <p className="text-sm font-medium text-neutral-700">{label}</p>
          <p className="text-xs text-neutral-400">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 mt-0.5',
          value ? 'bg-primary-500' : 'bg-neutral-200'
        )}
        style={{ width: 36, height: 20 }}
      >
        <div
          className={cn(
            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}
