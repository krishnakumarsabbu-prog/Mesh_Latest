import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { WidgetTypeMeta } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER = ['metric', 'chart', 'status', 'table', 'observability'];
const CATEGORY_LABELS: Record<string, string> = {
  metric: 'Metrics',
  chart: 'Charts',
  status: 'Status',
  table: 'Tables',
  observability: 'Observability',
};

const WIDGET_ICONS: Record<string, string> = {
  kpi_card: '📊',
  gauge: '🔄',
  progress_ring: '⭕',
  sparkline: '📈',
  line_chart: '📉',
  area_chart: '🌊',
  bar_chart: '📊',
  stacked_bar: '🗂',
  pie_donut: '🍩',
  sla_card: '✅',
  alert_panel: '🚨',
  status_timeline: '⏱',
  comparison_grid: '⚖️',
  table_widget: '📋',
  heatmap: '🔥',
  health_distribution: '💚',
  runtime_app_location_summary: '📍',
  runtime_dc_health_map: '🗺️',
  runtime_freshness_status: '🔄',
};

export function WidgetPalette({
  widgetTypes, onAdd, onClose,
}: {
  widgetTypes: WidgetTypeMeta[];
  onAdd: (type: WidgetTypeMeta) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filtered = widgetTypes.filter(t => {
    const matchCat = activeCategory === 'all' || t.category === activeCategory;
    const matchSearch = !search || t.label.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped: Record<string, WidgetTypeMeta[]> = {};
  filtered.forEach(t => {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  });

  const categories = ['all', ...CATEGORY_ORDER.filter(c => widgetTypes.some(t => t.category === c))];

  return (
    <div
      className="w-64 flex-shrink-0 border-r flex flex-col"
      style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Add Widget</span>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search widgets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary-400 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 py-2 flex-wrap">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={cn(
              'px-2 py-0.5 text-[10px] font-medium rounded-full capitalize transition-all',
              activeCategory === c
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
            )}
          >
            {c === 'all' ? 'All' : CATEGORY_LABELS[c] || c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {activeCategory === 'all'
          ? CATEGORY_ORDER.filter(c => grouped[c]).map(cat => (
            <div key={cat}>
              <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">{CATEGORY_LABELS[cat] || cat}</p>
              <div className="space-y-1">
                {grouped[cat].map(t => (
                  <WidgetTypeCard key={t.value} type={t} onAdd={() => onAdd(t)} />
                ))}
              </div>
            </div>
          ))
          : (
            <div className="space-y-1 pt-1">
              {filtered.map(t => (
                <WidgetTypeCard key={t.value} type={t} onAdd={() => onAdd(t)} />
              ))}
            </div>
          )
        }
        {filtered.length === 0 && (
          <p className="text-xs text-neutral-400 text-center py-4">No widgets found</p>
        )}
      </div>
    </div>
  );
}

function WidgetTypeCard({ type, onAdd }: { type: WidgetTypeMeta; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-neutral-50 border border-transparent hover:border-neutral-100 transition-all group"
    >
      <span className="text-base leading-none flex-shrink-0">{WIDGET_ICONS[type.value] || '📊'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-neutral-800 leading-tight">{type.label}</p>
        <p className="text-[10px] text-neutral-400 leading-tight mt-0.5 truncate">{type.description}</p>
      </div>
      <span className="text-[9px] text-neutral-300 group-hover:text-primary-400 font-medium transition-colors flex-shrink-0">
        {type.default_width}×{type.default_height}
      </span>
    </button>
  );
}
