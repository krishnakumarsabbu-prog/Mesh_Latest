import React, { useState } from 'react';
import { Search, ChevronRight, Zap, ChartBar as BarChart2, Activity, Grid2x2 as Grid, Database, Brain, Eye, X } from 'lucide-react';
import { WidgetTypeMeta } from '@/types';
import { cn } from '@/lib/utils';

const WIDGET_ICONS: Record<string, { emoji: string; color: string }> = {
  kpi_card: { emoji: '📊', color: '#0ea5e9' },
  gauge: { emoji: '🔄', color: '#06b6d4' },
  progress_ring: { emoji: '⭕', color: '#22d3ee' },
  sparkline: { emoji: '📈', color: '#10b981' },
  line_chart: { emoji: '📉', color: '#10b981' },
  area_chart: { emoji: '🌊', color: '#0284c7' },
  bar_chart: { emoji: '📊', color: '#0ea5e9' },
  stacked_bar: { emoji: '🗂', color: '#6366f1' },
  pie_donut: { emoji: '🍩', color: '#f59e0b' },
  sla_card: { emoji: '✅', color: '#10b981' },
  alert_panel: { emoji: '🚨', color: '#ef4444' },
  status_timeline: { emoji: '⏱', color: '#8b5cf6' },
  comparison_grid: { emoji: '⚖️', color: '#0ea5e9' },
  table_widget: { emoji: '📋', color: '#64748b' },
  heatmap: { emoji: '🔥', color: '#f97316' },
  health_distribution: { emoji: '💚', color: '#10b981' },
  runtime_app_location_summary: { emoji: '📍', color: '#0ea5e9' },
  runtime_dc_health_map: { emoji: '🗺️', color: '#06b6d4' },
  runtime_freshness_status: { emoji: '🔄', color: '#10b981' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  all: { label: 'All Widgets', icon: <Grid className="w-3.5 h-3.5" />, color: '#38bdf8' },
  metric: { label: 'Metrics', icon: <Zap className="w-3.5 h-3.5" />, color: '#0ea5e9' },
  chart: { label: 'Charts', icon: <BarChart2 className="w-3.5 h-3.5" />, color: '#10b981' },
  status: { label: 'Status', icon: <Activity className="w-3.5 h-3.5" />, color: '#f59e0b' },
  table: { label: 'Tables', icon: <Database className="w-3.5 h-3.5" />, color: '#8b5cf6' },
  observability: { label: 'Observability', icon: <Eye className="w-3.5 h-3.5" />, color: '#06b6d4' },
};

const CONNECTOR_PACKS: Array<{
  id: string;
  name: string;
  icon: string;
  color: string;
  widgets: Array<{ label: string; description: string }>;
}> = [
  {
    id: 'splunk',
    name: 'Splunk',
    icon: '🔍',
    color: '#f97316',
    widgets: [
      { label: 'Splunk Ingestion', description: 'Data ingestion volume' },
      { label: 'Splunk Alerts', description: 'Active alert count' },
      { label: 'Indexer Health', description: 'Indexer status' },
      { label: 'Search Latency', description: 'Query response time' },
      { label: 'Storage Metrics', description: 'Storage utilization' },
    ],
  },
  {
    id: 'appdynamics',
    name: 'AppDynamics',
    icon: '⚡',
    color: '#0ea5e9',
    widgets: [
      { label: 'JVM Metrics', description: 'Heap & GC stats' },
      { label: 'Transactions', description: 'Business transaction health' },
      { label: 'Response Time', description: 'Avg response time' },
      { label: 'Error Rate', description: 'Application error rate' },
      { label: 'App Health', description: 'Overall health score' },
    ],
  },
  {
    id: 'datadog',
    name: 'Datadog',
    icon: '🐕',
    color: '#7c3aed',
    widgets: [
      { label: 'Host Health', description: 'Host availability' },
      { label: 'Infra Monitoring', description: 'Infrastructure status' },
      { label: 'CPU Metrics', description: 'CPU utilization' },
      { label: 'Memory Metrics', description: 'Memory usage' },
      { label: 'Incident Tracking', description: 'Active incidents' },
    ],
  },
  {
    id: 'ibmmq',
    name: 'IBM MQ',
    icon: '📨',
    color: '#06b6d4',
    widgets: [
      { label: 'Queue Depth', description: 'Message queue depth' },
      { label: 'MQ Manager', description: 'Queue manager status' },
      { label: 'Channel Status', description: 'Channel health' },
    ],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    icon: '🍃',
    color: '#10b981',
    widgets: [
      { label: 'Replica Status', description: 'Replica set health' },
      { label: 'Connection Pool', description: 'Active connections' },
      { label: 'Op Metrics', description: 'Operations per second' },
    ],
  },
];

const EXTRA_CATEGORIES = [
  { id: 'lob', label: 'LOB Widgets', icon: '🏢', color: '#f59e0b', description: 'Business line analytics' },
  { id: 'team', label: 'Team Widgets', icon: '👥', color: '#10b981', description: 'Team performance metrics' },
  { id: 'project', label: 'Project Widgets', icon: '📁', color: '#0ea5e9', description: 'Project health & status' },
  { id: 'ai', label: 'AI Widgets', icon: '🤖', color: '#8b5cf6', description: 'AI-driven insights' },
  { id: 'health', label: 'Health Widgets', icon: '❤️', color: '#ef4444', description: 'System health scores' },
];

interface Props {
  widgetTypes: WidgetTypeMeta[];
  onAdd: (type: WidgetTypeMeta) => void;
  onClose: () => void;
}

export function FuturisticWidgetPalette({ widgetTypes, onAdd, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'widgets' | 'connectors' | 'categories'>('widgets');

  const filtered = widgetTypes.filter(t => {
    const matchCat = activeCategory === 'all' || t.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const grouped: Record<string, WidgetTypeMeta[]> = {};
  filtered.forEach(t => {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  });

  const availableCategories = ['all', ...Object.keys(CATEGORY_CONFIG).filter(c => c !== 'all' && widgetTypes.some(t => t.category === c))];

  return (
    <div
      className="w-72 flex-shrink-0 flex flex-col"
      style={{
        background: 'rgba(10, 15, 28, 0.95)',
        borderRight: '1px solid rgba(56, 189, 248, 0.12)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(56,189,248,0.2)' }}
          >
            <Grid className="w-3.5 h-3.5" style={{ color: '#38bdf8' }} />
          </div>
          <span className="text-sm font-bold" style={{ color: '#f1f5f9' }}>Widget Library</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-all"
          style={{ color: 'rgba(148,163,184,0.6)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.6)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'rgba(148,163,184,0.4)' }} />
          <input
            type="text"
            placeholder="Search widgets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(56,189,248,0.12)',
              color: '#f1f5f9',
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.35)'; (e.target as HTMLInputElement).style.background = 'rgba(14,165,233,0.06)'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.12)'; (e.target as HTMLInputElement).style.background = 'rgba(255,255,255,0.04)'; }}
          />
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 px-3 pb-2">
        {(['widgets', 'connectors', 'categories'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-1.5 text-[10px] font-semibold rounded-lg capitalize transition-all"
            style={
              activeTab === tab
                ? { background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }
                : { background: 'transparent', color: 'rgba(148,163,184,0.5)', border: '1px solid transparent' }
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1" style={{ scrollbarWidth: 'none' }}>
        {activeTab === 'widgets' && (
          <>
            {/* Category filters */}
            <div className="flex flex-wrap gap-1 pb-2">
              {availableCategories.map(c => {
                const cfg = CATEGORY_CONFIG[c];
                const isActive = activeCategory === c;
                return (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg transition-all"
                    style={
                      isActive
                        ? { background: `${cfg?.color || '#38bdf8'}20`, color: cfg?.color || '#38bdf8', border: `1px solid ${cfg?.color || '#38bdf8'}30` }
                        : { background: 'rgba(255,255,255,0.03)', color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(255,255,255,0.06)' }
                    }
                  >
                    {cfg?.icon}
                    {cfg?.label || c}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <p className="text-xs text-center py-6" style={{ color: 'rgba(148,163,184,0.4)' }}>No widgets found</p>
            )}

            {activeCategory === 'all'
              ? ['metric', 'chart', 'status', 'table', 'observability']
                  .filter(c => grouped[c]?.length)
                  .map(cat => (
                    <div key={cat}>
                      <p
                        className="text-[9px] font-bold uppercase tracking-widest mb-2 mt-2"
                        style={{ color: `${CATEGORY_CONFIG[cat]?.color || '#38bdf8'}80` }}
                      >
                        {CATEGORY_CONFIG[cat]?.label || cat}
                      </p>
                      {grouped[cat].map(t => (
                        <WidgetCard key={t.value} type={t} onAdd={() => onAdd(t)} />
                      ))}
                    </div>
                  ))
              : filtered.map(t => (
                  <WidgetCard key={t.value} type={t} onAdd={() => onAdd(t)} />
                ))
            }
          </>
        )}

        {activeTab === 'connectors' && (
          <div className="space-y-1.5 pt-1">
            {CONNECTOR_PACKS.map(pack => (
              <div key={pack.id}>
                <button
                  onClick={() => setExpandedConnector(expandedConnector === pack.id ? null : pack.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: expandedConnector === pack.id ? `${pack.color}12` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${expandedConnector === pack.id ? pack.color + '30' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span className="text-base">{pack.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>{pack.name}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{pack.widgets.length} widgets</p>
                  </div>
                  <div
                    className="transition-transform duration-200"
                    style={{ transform: expandedConnector === pack.id ? 'rotate(90deg)' : 'rotate(0deg)', color: pack.color }}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>

                {expandedConnector === pack.id && (
                  <div className="ml-3 mt-1 space-y-1 pl-2" style={{ borderLeft: `1px solid ${pack.color}20` }}>
                    {pack.widgets.map((w, i) => {
                      const firstType = widgetTypes[0];
                      return (
                        <button
                          key={i}
                          onClick={() => firstType && onAdd({ ...firstType, label: w.label, description: w.description })}
                          className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                          style={{ background: 'transparent', border: '1px solid transparent' }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = `${pack.color}10`;
                            (e.currentTarget as HTMLButtonElement).style.borderColor = `${pack.color}20`;
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                          }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: pack.color }} />
                          <div>
                            <p className="text-xs font-medium" style={{ color: '#e2e8f0' }}>{w.label}</p>
                            <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{w.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-1.5 pt-1">
            {EXTRA_CATEGORIES.map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background = `${cat.color}10`;
                  (e.currentTarget as HTMLDivElement).style.borderColor = `${cat.color}25`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)';
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}25` }}
                >
                  {cat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>{cat.label}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{cat.description}</p>
                </div>
                <Brain className="w-3.5 h-3.5 flex-shrink-0" style={{ color: `${cat.color}60` }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetCard({ type, onAdd }: { type: WidgetTypeMeta; onAdd: () => void }) {
  const iconConfig = WIDGET_ICONS[type.value] || { emoji: '📊', color: '#38bdf8' };

  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group mb-0.5"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = `${iconConfig.color}10`;
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${iconConfig.color}25`;
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 12px ${iconConfig.color}10`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.05)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
        style={{ background: `${iconConfig.color}15`, border: `1px solid ${iconConfig.color}20` }}
      >
        {iconConfig.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight truncate" style={{ color: '#e2e8f0' }}>{type.label}</p>
        <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>{type.description}</p>
      </div>
      <span
        className="text-[9px] font-medium flex-shrink-0"
        style={{ color: `${iconConfig.color}60` }}
      >
        {type.default_width}×{type.default_height}
      </span>
    </button>
  );
}

export { WIDGET_ICONS };
