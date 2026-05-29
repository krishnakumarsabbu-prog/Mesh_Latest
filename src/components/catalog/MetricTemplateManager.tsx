import React, { useEffect, useState, useMemo } from 'react';
import { MetricTemplate, ConnectorCatalogEntry } from '@/types';
import { metricTemplateApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/Modal';
import { MetricTemplateFormModal } from './MetricTemplateFormModal';
import { MetricTemplateTestModal } from './MetricTemplateTestModal';
import { Plus, RefreshCw, Search, Pencil, Trash2, Copy, FlaskConical, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, GripVertical, CircleAlert as AlertCircle, Star, Wrench, Activity, Hash, Percent, Timer, Table2, ToggleRight as StatusIcon, Binary } from 'lucide-react';

const METRIC_TYPE_ICONS: Record<string, React.ReactNode> = {
  number: <Hash className="w-3.5 h-3.5" />,
  percentage: <Percent className="w-3.5 h-3.5" />,
  time_series: <Activity className="w-3.5 h-3.5" />,
  table: <Table2 className="w-3.5 h-3.5" />,
  status: <StatusIcon className="w-3.5 h-3.5" />,
  boolean: <Binary className="w-3.5 h-3.5" />,
  duration: <Timer className="w-3.5 h-3.5" />,
};

const METRIC_TYPE_COLORS: Record<string, string> = {
  number: '#2563EB',
  percentage: '#059669',
  time_series: '#F46800',
  table: '#7C3AED',
  status: '#DC2626',
  boolean: '#0891B2',
  duration: '#D97706',
};

const CATEGORY_LABELS: Record<string, string> = {
  performance: 'Performance',
  availability: 'Availability',
  capacity: 'Capacity',
  error: 'Error Rate',
  latency: 'Latency',
  throughput: 'Throughput',
  security: 'Security',
  custom: 'Custom',
};

interface MetricTemplateManagerProps {
  entry: ConnectorCatalogEntry;
  canManage: boolean;
}

export function MetricTemplateManager({ entry, canManage }: MetricTemplateManagerProps) {
  const [templates, setTemplates] = useState<MetricTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MetricTemplate | null>(null);
  const [testTarget, setTestTarget] = useState<MetricTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MetricTemplate | null>(null);
  const [cloneTarget, setCloneTarget] = useState<MetricTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, [entry.id]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await metricTemplateApi.list(entry.id);
      setTemplates(res.data as MetricTemplate[]);
    } catch {
      notify.error('Failed to load metric templates');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (t: MetricTemplate) => {
    setTogglingId(t.id);
    try {
      if (t.is_enabled_by_default) {
        await metricTemplateApi.disable(entry.id, t.id);
        notify.success(`"${t.name}" disabled`);
      } else {
        await metricTemplateApi.enable(entry.id, t.id);
        notify.success(`"${t.name}" enabled`);
      }
      fetchTemplates();
    } catch {
      notify.error('Failed to update metric status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await metricTemplateApi.delete(entry.id, deleteTarget.id);
      notify.success('Metric template deleted');
      setDeleteTarget(null);
      fetchTemplates();
    } catch {
      notify.error('Failed to delete metric template');
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async () => {
    if (!cloneTarget) return;
    setCloning(true);
    try {
      await metricTemplateApi.clone(entry.id, cloneTarget.id, {});
      notify.success(`"${cloneTarget.name}" cloned successfully`);
      setCloneTarget(null);
      fetchTemplates();
    } catch {
      notify.error('Failed to clone metric template');
    } finally {
      setCloning(false);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === templates.length - 1) return;

    const reordered = [...templates];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setTemplates(reordered);

    try {
      await metricTemplateApi.reorder(entry.id, reordered.map((t) => t.id));
    } catch {
      notify.error('Failed to reorder metrics');
      fetchTemplates();
    }
  };

  const filtered = useMemo(() => {
    let result = templates;
    if (categoryFilter) result = result.filter((t) => t.category === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.metric_key.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [templates, search, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category).filter(Boolean) as string[]);
    return Array.from(cats);
  }, [templates]);

  const stats = useMemo(() => ({
    total: templates.length,
    enabled: templates.filter((t) => t.is_enabled_by_default).length,
    required: templates.filter((t) => t.is_required).length,
    custom: templates.filter((t) => t.is_custom).length,
  }), [templates]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm font-bold text-neutral-800">Metric Templates</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {stats.total} total &middot; {stats.enabled} enabled &middot; {stats.required} required &middot; {stats.custom} custom
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={fetchTemplates}>
            Refresh
          </Button>
          {canManage && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreateOpen(true)}>
              Add Metric
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MiniStat label="Total" value={stats.total} color="#2563EB" />
        <MiniStat label="Enabled" value={stats.enabled} color="#059669" />
        <MiniStat label="Required" value={stats.required} color="#DC2626" />
        <MiniStat label="Custom" value={stats.custom} color="#F46800" />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search metrics by name, key, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:ring-[3px] focus:ring-primary-500/12 focus:border-primary-400 transition-all"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:ring-[3px] focus:ring-primary-500/12 transition-all cursor-pointer"
          >
            <option value="">All Groups</option>
            {categories.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-neutral-50 border border-neutral-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 flex flex-col items-center justify-center text-center border border-dashed border-neutral-200 rounded-2xl">
          <Activity className="w-10 h-10 text-neutral-200 mb-3" />
          <p className="text-sm font-semibold text-neutral-400">No metric templates yet</p>
          <p className="text-xs text-neutral-300 mt-1">
            {canManage
              ? 'Click "Add Metric" to define the first metric for this connector.'
              : 'No metrics have been defined for this connector.'}
          </p>
          {canManage && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} className="mt-4" onClick={() => setCreateOpen(true)}>
              Add First Metric
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, idx) => (
            <MetricTemplateRow
              key={t.id}
              template={t}
              canManage={canManage}
              isFirst={idx === 0}
              isLast={idx === filtered.length - 1}
              toggling={togglingId === t.id}
              onToggle={() => handleToggle(t)}
              onEdit={() => setEditTarget(t)}
              onTest={() => setTestTarget(t)}
              onDelete={() => setDeleteTarget(t)}
              onClone={() => setCloneTarget(t)}
              onMoveUp={() => handleReorder(t.id, 'up')}
              onMoveDown={() => handleReorder(t.id, 'down')}
            />
          ))}
        </div>
      )}

      <MetricTemplateFormModal
        open={createOpen || !!editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onSaved={fetchTemplates}
        catalogEntryId={entry.id}
        template={editTarget}
        connectorSlug={entry.slug}
      />

      <MetricTemplateTestModal
        open={!!testTarget}
        onClose={() => setTestTarget(null)}
        template={testTarget}
        catalogEntryId={entry.id}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Metric Template"
        message={`Remove "${deleteTarget?.name}" (${deleteTarget?.metric_key})? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />

      <ConfirmModal
        open={!!cloneTarget}
        onClose={() => setCloneTarget(null)}
        onConfirm={handleClone}
        title="Clone Metric Template"
        message={`Create a copy of "${cloneTarget?.name}"? The clone will be marked as a custom metric.`}
        confirmLabel="Clone"
        loading={cloning}
      />
    </div>
  );
}

interface MetricTemplateRowProps {
  template: MetricTemplate;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  onClone: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function MetricTemplateRow({
  template,
  canManage,
  isFirst,
  isLast,
  toggling,
  onToggle,
  onEdit,
  onTest,
  onDelete,
  onClone,
  onMoveUp,
  onMoveDown,
}: MetricTemplateRowProps) {
  const typeColor = METRIC_TYPE_COLORS[template.metric_type] || '#2563EB';
  const typeIcon = METRIC_TYPE_ICONS[template.metric_type];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-xl transition-all hover:shadow-sm ${
        template.is_enabled_by_default ? 'border-neutral-200' : 'border-neutral-100 opacity-60'
      }`}
    >
      {canManage && (
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 text-neutral-300 hover:text-neutral-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 text-neutral-300 hover:text-neutral-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${typeColor}18`, color: typeColor }}
      >
        {typeIcon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-neutral-800 truncate">{template.name}</span>
          <code className="text-xs font-mono bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded-md border border-neutral-100">
            {template.metric_key}
          </code>
          {template.is_required && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
              <Star className="w-3 h-3" />Required
            </span>
          )}
          {template.is_custom && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
              <Wrench className="w-3 h-3" />Custom
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span
            className="text-xs font-medium capitalize px-1.5 py-0.5 rounded-md"
            style={{ background: `${typeColor}12`, color: typeColor }}
          >
            {template.metric_type.replace('_', ' ')}
          </span>
          <span className="text-xs text-neutral-400 capitalize">{template.aggregation_type}</span>
          {template.unit && (
            <span className="text-xs text-neutral-400">{template.unit}</span>
          )}
          {template.category && (
            <span className="text-xs text-neutral-400">{CATEGORY_LABELS[template.category] || template.category}</span>
          )}
          {template.threshold_warning != null && (
            <span className="text-xs text-amber-500">warn &ge;{template.threshold_warning}</span>
          )}
          {template.threshold_critical != null && (
            <span className="text-xs text-red-500">crit &ge;{template.threshold_critical}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onTest}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-all"
          title="Test metric"
        >
          <FlaskConical className="w-3.5 h-3.5" />
        </button>
        {canManage && (
          <>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all"
              title="Edit metric"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClone}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all"
              title="Clone metric"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggle}
              disabled={toggling}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all"
              title={template.is_enabled_by_default ? 'Disable' : 'Enable'}
            >
              {template.is_enabled_by_default ? (
                <ToggleRight className="w-4 h-4 text-primary-500" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Delete metric"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-xl p-3">
      <p className="text-lg font-bold text-neutral-900">{value}</p>
      <p className="text-xs font-medium text-neutral-400 mt-0.5">{label}</p>
      <div className="mt-2 h-0.5 rounded-full bg-neutral-50 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, value * 10)}%`, background: color }}
        />
      </div>
    </div>
  );
}
