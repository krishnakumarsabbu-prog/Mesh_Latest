import React, { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  TrendingUp, TriangleAlert as AlertTriangle, ChartBar as BarChart2,
  CircleCheck as CheckCircle,
} from 'lucide-react';
import { DashboardWidgetCreate, WidgetType, WidgetMetricBindingCreate } from '@/types';
import apiClient from '@/lib/api';

const WIDGET_ACCENT: Record<WidgetType, string> = {
  kpi_card: '#0A84FF',
  gauge: '#30D158',
  progress_ring: '#FF9F0A',
  sparkline: '#0A84FF',
  line_chart: '#0A84FF',
  area_chart: '#30D158',
  bar_chart: '#FF9F0A',
  stacked_bar: '#FF9F0A',
  pie_donut: '#0A84FF',
  sla_card: '#30D158',
  alert_panel: '#FF453A',
  status_timeline: '#64D2FF',
  comparison_grid: '#0A84FF',
  table_widget: '#636366',
  heatmap: '#FF9F0A',
  health_distribution: '#30D158',
  runtime_app_location_summary: '#0A84FF',
  runtime_dc_health_map: '#30D158',
  runtime_freshness_status: '#FF9F0A',
};

const WIDGET_LABEL: Record<WidgetType, string> = {
  kpi_card: 'KPI Card',
  gauge: 'Gauge',
  progress_ring: 'Progress Ring',
  sparkline: 'Sparkline',
  line_chart: 'Line Chart',
  area_chart: 'Area Chart',
  bar_chart: 'Bar Chart',
  stacked_bar: 'Stacked Bar',
  pie_donut: 'Pie / Donut',
  sla_card: 'SLA Card',
  alert_panel: 'Alert Panel',
  status_timeline: 'Status Timeline',
  comparison_grid: 'Comparison Grid',
  table_widget: 'Table',
  heatmap: 'Heatmap',
  health_distribution: 'Health Distribution',
  runtime_app_location_summary: 'App Location Summary',
  runtime_dc_health_map: 'Data Center Health Map',
  runtime_freshness_status: 'Data Freshness Status',
};

// Generate deterministic sample data from a seed string
function seedData(key: string, len = 12): { v: number; t: string }[] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  const rng = (n: number) => { h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h ^= h >>> 11; return ((h >>> 0) / 0xffffffff * n); };
  return Array.from({ length: len }, (_, i) => ({ v: Math.round(rng(100)), t: `T${i}` }));
}

function useSampleData(bindings: WidgetMetricBindingCreate[]) {
  const [data, setData] = useState<{ v: number; t: string }[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (bindings.length === 0 || fetchedRef.current) return;
    const first = bindings[0];
    if (!first.metric_key) return;

    // Try to fetch a real sample; fall back to deterministic seed data
    const tryFetch = async () => {
      try {
        // Use health trends as a proxy — any trending data works for preview
        const res = await apiClient.get('/health/trends', { params: { hours: 6 } });
        const raw: Array<{ timestamp: string; healthy: number; total: number }> = res.data || [];
        if (raw.length > 3) {
          fetchedRef.current = true;
          setData(raw.slice(-12).map((r, i) => ({
            v: r.total > 0 ? Math.round((r.healthy / r.total) * 100) : 50,
            t: `T${i}`,
          })));
          return;
        }
      } catch { /* fall through */ }
      // Deterministic fallback so preview is stable
      setData(seedData(first.metric_key));
    };

    tryFetch();
  }, [bindings]);

  return data;
}

export function DashboardWidgetRenderer({
  widget,
  preview,
}: {
  widget: DashboardWidgetCreate & { _localId?: string };
  preview: boolean;
}) {
  const accent = WIDGET_ACCENT[widget.widget_type as WidgetType] || '#0A84FF';
  const label = WIDGET_LABEL[widget.widget_type as WidgetType] || widget.widget_type;
  const hasBindings = (widget.metric_bindings || []).length > 0;
  const sampleData = useSampleData(widget.metric_bindings || []);

  return (
    <div className="w-full h-full flex flex-col p-3 overflow-hidden">
      <div className="flex items-start justify-between mb-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {widget.title}
          </p>
          {widget.subtitle && (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {widget.subtitle}
            </p>
          )}
        </div>
        <span
          className="flex-shrink-0 ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: accent + '15', color: accent }}
        >
          {label}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <WidgetPreview
          type={widget.widget_type as WidgetType}
          hasBindings={hasBindings}
          accent={accent}
          data={sampleData}
          bindings={widget.metric_bindings || []}
        />
      </div>

      {hasBindings && (
        <div className="flex-shrink-0 mt-1.5 flex items-center gap-1 flex-wrap">
          {widget.metric_bindings.slice(0, 3).map((mb, i) => (
            <span
              key={i}
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: (mb.color_override || accent) + '15', color: mb.color_override || accent }}
            >
              {mb.display_label || mb.metric_key}
            </span>
          ))}
          {widget.metric_bindings.length > 3 && (
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>+{widget.metric_bindings.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
}

function WidgetPreview({
  type, hasBindings, accent, data, bindings,
}: {
  type: WidgetType;
  hasBindings: boolean;
  accent: string;
  data: { v: number; t: string }[];
  bindings: WidgetMetricBindingCreate[];
}) {
  const opacity = hasBindings ? 1 : 0.25;
  const chartData = data.length > 0 ? data : seedData(type, 10);
  const latestVal = chartData[chartData.length - 1]?.v ?? 76;
  const secondaryAccent = bindings[1]?.color_override || '#30D158';

  // Helper: no-data placeholder
  if (!hasBindings) {
    return (
      <div className="flex flex-col items-center gap-1.5" style={{ opacity: 0.3 }}>
        <BarChart2 className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Configure bindings</span>
      </div>
    );
  }

  switch (type) {
    case 'kpi_card':
      return (
        <div className="text-center" style={{ opacity }}>
          <div className="text-3xl font-bold mb-0.5" style={{ color: accent }}>{latestVal}%</div>
          <div className="flex items-center justify-center gap-1 text-xs" style={{ color: '#30D158' }}>
            <TrendingUp className="w-3 h-3" /> Live
          </div>
        </div>
      );

    case 'gauge':
      return (
        <div style={{ opacity }}>
          <svg viewBox="0 0 100 60" className="w-28 h-16">
            <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="var(--app-border)" strokeWidth="8" strokeLinecap="round" />
            <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round"
              strokeDasharray="125" strokeDashoffset={String(125 - (latestVal / 100) * 125)} />
            <text x="50" y="52" textAnchor="middle" fontSize="14" fontWeight="bold" fill={accent}>{latestVal}%</text>
          </svg>
        </div>
      );

    case 'progress_ring':
      return (
        <div style={{ opacity }}>
          <svg viewBox="0 0 60 60" className="w-16 h-16">
            <circle cx="30" cy="30" r="24" fill="none" stroke="var(--app-border)" strokeWidth="6" />
            <circle cx="30" cy="30" r="24" fill="none" stroke={accent} strokeWidth="6"
              strokeDasharray={`${(latestVal / 100) * 2 * Math.PI * 24} ${2 * Math.PI * 24}`}
              strokeLinecap="round" transform="rotate(-90 30 30)" />
            <text x="30" y="34" textAnchor="middle" fontSize="11" fontWeight="bold" fill={accent}>{latestVal}%</text>
          </svg>
        </div>
      );

    case 'sparkline':
      return (
        <div className="w-full px-1" style={{ opacity, height: 36 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line type="monotone" dataKey="v" stroke={accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'line_chart':
      return (
        <div className="w-full" style={{ opacity, height: '100%', minHeight: 50 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <Line type="monotone" dataKey="v" stroke={accent} strokeWidth={2} dot={false} />
              {bindings.length > 1 && (
                <Line type="monotone" dataKey="v" stroke={secondaryAccent} strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
              )}
              <Tooltip
                contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 8, fontSize: 10 }}
                itemStyle={{ color: accent }}
                labelStyle={{ display: 'none' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'area_chart':
      return (
        <div className="w-full" style={{ opacity, height: '100%', minHeight: 50 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id={`ag-${accent.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2}
                fill={`url(#ag-${accent.replace('#', '')})`} dot={false} />
              <Tooltip
                contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 8, fontSize: 10 }}
                itemStyle={{ color: accent }}
                labelStyle={{ display: 'none' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );

    case 'bar_chart':
      return (
        <div className="w-full" style={{ opacity, height: '100%', minHeight: 50 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(-8)} margin={{ top: 4, right: 4, bottom: 4, left: 4 }} barSize={8}>
              <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                {chartData.slice(-8).map((_, i) => (
                  <Cell key={i} fill={accent} fillOpacity={i === chartData.slice(-8).length - 1 ? 1 : 0.55} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'stacked_bar':
      return (
        <div className="w-full" style={{ opacity, height: '100%', minHeight: 50 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(-6)} margin={{ top: 4, right: 4, bottom: 4, left: 4 }} barSize={10}>
              <Bar dataKey="v" stackId="a" fill={accent} fillOpacity={0.85} radius={[0, 0, 0, 0]} />
              <Bar dataKey="v" stackId="a" fill={secondaryAccent} fillOpacity={0.5} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'pie_donut':
      return (
        <div style={{ opacity, width: 70, height: 70 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={[{ v: latestVal }, { v: 100 - latestVal }]} cx="50%" cy="50%"
                innerRadius={18} outerRadius={32} dataKey="v" startAngle={90} endAngle={-270}
              >
                <Cell fill={accent} />
                <Cell fill="var(--app-border)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    case 'sla_card':
      return (
        <div className="text-center" style={{ opacity }}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CheckCircle className="w-5 h-5" style={{ color: accent }} />
          </div>
          <div className="text-2xl font-bold" style={{ color: accent }}>{latestVal}.{Math.abs(latestVal - 100) < 1 ? '9' : '0'}%</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>SLA Compliance</div>
        </div>
      );

    case 'alert_panel':
      return (
        <div className="w-full space-y-1 px-1" style={{ opacity }}>
          {[['CRITICAL', '#FF453A'], ['HIGH', '#FF9F0A'], ['MEDIUM', '#FFD60A']].map(([sev, col]) => (
            <div key={sev} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: col + '10' }}>
              <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: col }} />
              <span className="text-[10px] font-medium" style={{ color: col }}>{sev}</span>
              <span className="text-[9px] ml-auto" style={{ color: 'var(--text-muted)' }}>Connector timeout</span>
            </div>
          ))}
        </div>
      );

    case 'status_timeline':
      return (
        <div className="w-full h-full px-2 flex flex-col justify-center gap-1.5" style={{ opacity }}>
          {(bindings.length > 0 ? bindings.slice(0, 2) : [{ display_label: 'Connector A', color_override: accent }, { display_label: 'Connector B', color_override: secondaryAccent }]).map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[9px] w-16 truncate flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {b.display_label || `Series ${i + 1}`}
              </span>
              <div className="flex-1 flex gap-0.5 h-3.5">
                {Array.from({ length: 20 }).map((_, j) => (
                  <div key={j} className="flex-1 rounded-sm"
                    style={{ background: (j === 8 || j === 9) ? '#FF453A' : (b.color_override || accent), opacity: 0.75 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );

    case 'comparison_grid':
      return (
        <div className="w-full" style={{ opacity }}>
          <div className="grid grid-cols-3 gap-1 text-center">
            {['Score', 'SLA', 'Uptime'].map(l => (
              <div key={l} className="py-1">
                <div className="text-xs font-bold" style={{ color: accent }}>
                  {l === 'Score' ? latestVal : l === 'SLA' ? '99.5%' : '99.8%'}
                </div>
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'table_widget':
      return (
        <div className="w-full overflow-hidden" style={{ opacity }}>
          <div className="text-[9px] grid grid-cols-3 gap-1 mb-1 font-semibold uppercase px-1" style={{ color: 'var(--text-muted)' }}>
            <span>Name</span><span>Status</span><span>Score</span>
          </div>
          {[['API Gateway', '✓', String(latestVal)], ['Auth Service', '⚠', '72'], ['DB Pool', '✓', '95']].map(([n, s, sc]) => (
            <div key={n} className="text-[9px] grid grid-cols-3 gap-1 px-1 py-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
              <span className="truncate">{n}</span>
              <span style={{ color: s === '⚠' ? '#FF9F0A' : '#30D158' }}>{s}</span>
              <span style={{ color: accent }} className="font-semibold">{sc}</span>
            </div>
          ))}
        </div>
      );

    case 'heatmap':
      return (
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)', opacity }}>
          {chartData.slice(0, 32).map((d, i) => (
            <div key={i} className="rounded-sm aspect-square"
              style={{ background: accent, opacity: 0.1 + (d.v / 100) * 0.8 }} />
          ))}
        </div>
      );

    case 'health_distribution': {
      const healthy = latestVal;
      const degraded = Math.round((100 - healthy) * 0.6);
      const down = 100 - healthy - degraded;
      const c = 2 * Math.PI * 20;
      return (
        <div className="text-center" style={{ opacity }}>
          <svg viewBox="0 0 60 60" className="w-14 h-14 mx-auto">
            <circle cx="30" cy="30" r="20" fill="none" stroke="#30D158" strokeWidth="10"
              strokeDasharray={`${(healthy / 100) * c} ${c}`} transform="rotate(-90 30 30)" />
            <circle cx="30" cy="30" r="20" fill="none" stroke="#FF9F0A" strokeWidth="10"
              strokeDasharray={`${(degraded / 100) * c} ${c}`}
              strokeDashoffset={`${-(healthy / 100) * c}`} transform="rotate(-90 30 30)" />
            <circle cx="30" cy="30" r="20" fill="none" stroke="#FF453A" strokeWidth="10"
              strokeDasharray={`${(down / 100) * c} ${c}`}
              strokeDashoffset={`${-((healthy + degraded) / 100) * c}`} transform="rotate(-90 30 30)" />
            <circle cx="30" cy="30" r="14" fill="var(--app-surface-raised)" />
          </svg>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-[9px] font-semibold" style={{ color: '#30D158' }}>{healthy}%</span>
            <span className="text-[9px] font-semibold" style={{ color: '#FF9F0A' }}>{degraded}%</span>
            <span className="text-[9px] font-semibold" style={{ color: '#FF453A' }}>{down}%</span>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="flex flex-col items-center gap-1.5" style={{ opacity: 0.3 }}>
          <BarChart2 className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Configure widget</span>
        </div>
      );
  }
}
