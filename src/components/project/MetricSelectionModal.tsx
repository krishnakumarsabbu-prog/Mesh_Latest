import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp, Star, StarOff, ToggleLeft, ToggleRight, SquareCheck as CheckSquare, Square, Minus, TriangleAlert as AlertTriangle, Info, Zap, Filter, ChartBar as BarChart2, Activity, Shield, Server, Database, Globe, Clock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { notify } from '@/store/notificationStore';
import { projectConnectorMetricApi, metricTemplateApi } from '@/lib/api';
import {
  ProjectConnector,
  MetricTemplate,
  ProjectConnectorMetricBinding,
  ProjectConnectorMetricUpsert,
} from '@/types';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  logs: <BarChart2 className="w-3.5 h-3.5" />,
  performance: <Activity className="w-3.5 h-3.5" />,
  security: <Shield className="w-3.5 h-3.5" />,
  infrastructure: <Server className="w-3.5 h-3.5" />,
  application: <Globe className="w-3.5 h-3.5" />,
  apm: <Zap className="w-3.5 h-3.5" />,
  incident: <AlertTriangle className="w-3.5 h-3.5" />,
  database: <Database className="w-3.5 h-3.5" />,
  api: <Globe className="w-3.5 h-3.5" />,
};

const METRIC_TYPE_COLORS: Record<string, string> = {
  number: '#0A84FF',
  percentage: '#30D158',
  time_series: '#FF9F0A',
  duration: '#BF5AF2',
  boolean: '#32ADE6',
  status: '#FF453A',
  table: '#64D2FF',
};

interface BindingState {
  is_enabled: boolean;
  is_critical: boolean;
  threshold_warning: string;
  threshold_critical: string;
  label_override: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  pc: ProjectConnector;
}

export function MetricSelectionModal({ open, onClose, projectId, pc }: Props) {
  const [templates, setTemplates] = useState<MetricTemplate[]>([]);
  const [bindings, setBindings] = useState<ProjectConnectorMetricBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [localBindings, setLocalBindings] = useState<Record<string, BindingState>>({});

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const catalogEntryId = pc.catalog_entry_id;
      const [tmplRes, bindRes] = await Promise.all([
        metricTemplateApi.list(catalogEntryId),
        projectConnectorMetricApi.list(projectId, pc.id),
      ]);
      const tmpls: MetricTemplate[] = tmplRes.data;
      const existingBindings: ProjectConnectorMetricBinding[] = bindRes.data;

      setTemplates(tmpls);
      setBindings(existingBindings);

      const bindingMap: Record<string, ProjectConnectorMetricBinding> = {};
      existingBindings.forEach(b => { bindingMap[b.metric_template_id] = b; });

      const initial: Record<string, BindingState> = {};
      tmpls.forEach(t => {
        const existing = bindingMap[t.id];
        if (existing) {
          initial[t.id] = {
            is_enabled: existing.is_enabled,
            is_critical: existing.is_critical,
            threshold_warning: existing.threshold_warning != null ? String(existing.threshold_warning) : '',
            threshold_critical: existing.threshold_critical != null ? String(existing.threshold_critical) : '',
            label_override: existing.label_override || '',
          };
        } else {
          initial[t.id] = {
            is_enabled: t.is_enabled_by_default,
            is_critical: t.is_required,
            threshold_warning: t.threshold_warning != null ? String(t.threshold_warning) : '',
            threshold_critical: t.threshold_critical != null ? String(t.threshold_critical) : '',
            label_override: '',
          };
        }
      });
      setLocalBindings(initial);
      setDirty(false);
    } catch {
      notify.error('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [open, pc, projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const categories = useMemo(() => {
    const cats = new Set(templates.map(t => t.category || 'general'));
    return ['all', ...Array.from(cats).sort()];
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter(t => {
      const matchCat = categoryFilter === 'all' || t.category === categoryFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || t.metric_key.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [templates, categoryFilter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, MetricTemplate[]> = {};
    filtered.forEach(t => {
      const cat = t.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    Object.values(groups).forEach(g => g.sort((a, b) => a.display_order - b.display_order));
    return groups;
  }, [filtered]);

  const enabledCount = useMemo(
    () => Object.values(localBindings).filter(b => b.is_enabled).length,
    [localBindings]
  );
  const criticalCount = useMemo(
    () => Object.values(localBindings).filter(b => b.is_critical).length,
    [localBindings]
  );

  const updateBinding = (templateId: string, patch: Partial<BindingState>) => {
    setLocalBindings(prev => ({ ...prev, [templateId]: { ...prev[templateId], ...patch } }));
    setDirty(true);
  };

  const bulkToggleCategory = (cat: string, enabled: boolean) => {
    const patch: Record<string, BindingState> = { ...localBindings };
    templates.filter(t => t.category === cat).forEach(t => {
      patch[t.id] = { ...patch[t.id], is_enabled: enabled };
    });
    setLocalBindings(patch);
    setDirty(true);
  };

  const bulkToggleAll = (enabled: boolean) => {
    const patch: Record<string, BindingState> = {};
    templates.forEach(t => {
      patch[t.id] = { ...localBindings[t.id], is_enabled: enabled };
    });
    setLocalBindings(patch);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const bindingsList: ProjectConnectorMetricUpsert[] = templates.map(t => {
        const b = localBindings[t.id];
        return {
          metric_template_id: t.id,
          is_enabled: b.is_enabled,
          is_critical: b.is_critical,
          threshold_warning: b.threshold_warning !== '' ? parseFloat(b.threshold_warning) : null,
          threshold_critical: b.threshold_critical !== '' ? parseFloat(b.threshold_critical) : null,
          label_override: b.label_override || null,
          query_config_override: null,
        };
      });
      await projectConnectorMetricApi.bulkSave(projectId, pc.id, bindingsList);
      notify.success(`Metric bindings saved — ${enabledCount} enabled`);
      setDirty(false);
      onClose();
    } catch {
      notify.error('Failed to save metric bindings');
    } finally {
      setSaving(false);
    }
  };

  const allEnabled = templates.length > 0 && templates.every(t => localBindings[t.id]?.is_enabled);
  const noneEnabled = templates.every(t => !localBindings[t.id]?.is_enabled);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Metric Selection — ${pc.name}`}
      subtitle={pc.catalog_entry ? `${pc.catalog_entry.name} · ${Object.keys(grouped).length} categories · ${templates.length} available` : undefined}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {enabledCount} enabled
            </span>
            {criticalCount > 0 && (
              <span className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                {criticalCount} critical
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={!dirty}>
              Save Metric Config
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 min-h-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search metrics by name, key, or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary-400 focus:bg-white transition-all"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => bulkToggleAll(true)}
              disabled={allEnabled}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Enable All
            </button>
            <button
              onClick={() => bulkToggleAll(false)}
              disabled={noneEnabled}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Disable All
            </button>
          </div>
        </div>

        {categories.length > 2 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-full transition-all capitalize',
                  categoryFilter === cat
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                )}
              >
                {cat === 'all' ? `All (${templates.length})` : `${cat} (${templates.filter(t => t.category === cat).length})`}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 bg-neutral-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-400">
            No metrics match your search.
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto max-h-[calc(70vh-220px)] pr-1">
            {Object.entries(grouped).map(([cat, catTemplates]) => (
              <CategorySection
                key={cat}
                category={cat}
                templates={catTemplates}
                localBindings={localBindings}
                expandedId={expandedId}
                onExpand={setExpandedId}
                onUpdateBinding={updateBinding}
                onBulkToggle={bulkToggleCategory}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CategorySection({
  category, templates, localBindings, expandedId, onExpand, onUpdateBinding, onBulkToggle,
}: {
  category: string;
  templates: MetricTemplate[];
  localBindings: Record<string, BindingState>;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onUpdateBinding: (id: string, patch: Partial<BindingState>) => void;
  onBulkToggle: (cat: string, enabled: boolean) => void;
}) {
  const enabledInCat = templates.filter(t => localBindings[t.id]?.is_enabled).length;
  const allCatEnabled = enabledInCat === templates.length;
  const noneCatEnabled = enabledInCat === 0;

  return (
    <div className="border border-neutral-100 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-100">
        <span className="text-neutral-500">{CATEGORY_ICONS[category] || <BarChart2 className="w-3.5 h-3.5" />}</span>
        <span className="text-sm font-semibold text-neutral-700 capitalize flex-1">{category}</span>
        <span className="text-xs text-neutral-400">{enabledInCat}/{templates.length} enabled</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onBulkToggle(category, true)}
            disabled={allCatEnabled}
            className="p-1 rounded-md text-neutral-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Enable all in category"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onBulkToggle(category, false)}
            disabled={noneCatEnabled}
            className="p-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Disable all in category"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="divide-y divide-neutral-50">
        {templates.map(t => (
          <MetricRow
            key={t.id}
            template={t}
            binding={localBindings[t.id]}
            expanded={expandedId === t.id}
            onExpand={() => onExpand(expandedId === t.id ? null : t.id)}
            onUpdate={patch => onUpdateBinding(t.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function MetricRow({
  template, binding, expanded, onExpand, onUpdate,
}: {
  template: MetricTemplate;
  binding: BindingState;
  expanded: boolean;
  onExpand: () => void;
  onUpdate: (patch: Partial<BindingState>) => void;
}) {
  if (!binding) return null;

  const typeColor = METRIC_TYPE_COLORS[template.metric_type] || '#8E8E93';

  return (
    <div className={cn(
      'transition-all',
      !binding.is_enabled && 'opacity-50',
    )}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors group"
        onClick={onExpand}
      >
        <button
          onClick={e => { e.stopPropagation(); onUpdate({ is_enabled: !binding.is_enabled }); }}
          className="flex-shrink-0 transition-colors"
          title={binding.is_enabled ? 'Disable metric' : 'Enable metric'}
        >
          {binding.is_enabled
            ? <ToggleRight className="w-5 h-5 text-green-500" />
            : <ToggleLeft className="w-5 h-5 text-neutral-300" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-neutral-900">
              {binding.label_override || template.name}
            </span>
            {template.is_required && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Required</span>
            )}
            {template.is_enabled_by_default && !template.is_required && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Default</span>
            )}
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium capitalize"
              style={{ background: typeColor + '15', color: typeColor }}
            >
              {template.metric_type}
            </span>
            {template.unit && (
              <span className="text-xs text-neutral-400">{template.unit}</span>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-neutral-400 mt-0.5 truncate">{template.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {binding.is_critical && (
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          )}
          {(binding.threshold_warning || binding.threshold_critical) && (
            <span className="text-xs text-neutral-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {binding.threshold_warning && <span>W:{binding.threshold_warning}</span>}
              {binding.threshold_critical && <span>C:{binding.threshold_critical}</span>}
            </span>
          )}
          <span className="text-neutral-300 group-hover:text-neutral-500 transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 bg-neutral-50/50 border-t border-neutral-100">
          <div className="pt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">
                Label Override
              </label>
              <input
                type="text"
                value={binding.label_override}
                onChange={e => onUpdate({ label_override: e.target.value })}
                placeholder={template.name}
                className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg bg-white outline-none focus:border-primary-400 transition-all"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => onUpdate({ is_critical: !binding.is_critical })}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all w-full justify-center',
                  binding.is_critical
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:border-amber-200 hover:text-amber-600'
                )}
              >
                {binding.is_critical
                  ? <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                  : <StarOff className="w-4 h-4" />}
                {binding.is_critical ? 'Critical Metric' : 'Mark as Critical'}
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">
                Warning Threshold
                {template.threshold_warning != null && (
                  <span className="ml-1 font-normal normal-case text-neutral-400">(default: {template.threshold_warning})</span>
                )}
              </label>
              <input
                type="number"
                value={binding.threshold_warning}
                onChange={e => onUpdate({ threshold_warning: e.target.value })}
                placeholder={template.threshold_warning != null ? String(template.threshold_warning) : 'Not set'}
                className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg bg-white outline-none focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">
                Critical Threshold
                {template.threshold_critical != null && (
                  <span className="ml-1 font-normal normal-case text-neutral-400">(default: {template.threshold_critical})</span>
                )}
              </label>
              <input
                type="number"
                value={binding.threshold_critical}
                onChange={e => onUpdate({ threshold_critical: e.target.value })}
                placeholder={template.threshold_critical != null ? String(template.threshold_critical) : 'Not set'}
                className="w-full px-3 py-1.5 text-sm border border-red-200 rounded-lg bg-white outline-none focus:border-red-400 transition-all"
              />
            </div>
          </div>
          <div className="mt-3 p-2.5 rounded-xl bg-neutral-100/60 text-xs text-neutral-500 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Key: <code className="font-mono bg-white px-1 py-0.5 rounded">{template.metric_key}</code>
              {' · '}Aggregation: <span className="capitalize">{template.aggregation_type}</span>
              {template.unit && <span> · Unit: {template.unit}</span>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
