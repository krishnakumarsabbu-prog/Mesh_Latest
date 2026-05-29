import React, { useMemo, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, TriangleAlert as AlertTriangle, Database, Activity, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LiveWidgetData, ResolvedMetric } from '@/types';
import { cn } from '@/lib/utils';
import { RuntimeAppLocationWidget } from '@/components/runtime/widgets/RuntimeAppLocationWidget';
import { DataCenterHealthMapWidget } from '@/components/runtime/widgets/DataCenterHealthMapWidget';
import { FreshnessStatusWidget } from '@/components/runtime/widgets/FreshnessStatusWidget';
import { useChatStore } from '@/store/chatStore';

interface LiveWidgetRendererProps {
  widget: LiveWidgetData;
  onOverride?: (widgetId: string) => void;
  isOverrideMode?: boolean;
  projectName?: string;
}

const STATUS_COLORS = {
  healthy: '#30D158',
  degraded: '#FF9F0A',
  down: '#FF453A',
  unknown: '#636366',
  error: '#FF453A',
  timeout: '#FF9F0A',
};

function formatValue(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—';
  const formatted = value >= 1000000
    ? `${(value / 1000000).toFixed(1)}M`
    : value >= 1000
    ? `${(value / 1000).toFixed(1)}K`
    : value % 1 === 0
    ? value.toString()
    : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function getTrendIcon(trend: Array<{ t: string; v: number }>) {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1].v;
  const prev = trend[trend.length - 2].v;
  if (last > prev * 1.02) return <TrendingUp className="w-3.5 h-3.5 text-success-500" />;
  if (last < prev * 0.98) return <TrendingDown className="w-3.5 h-3.5 text-danger-500" />;
  return <Minus className="w-3.5 h-3.5 text-neutral-400" />;
}

function getThresholdColor(value: number | null | undefined, thresholds?: Record<string, unknown> | null): string {
  if (!value || !thresholds) return '#0A84FF';
  const warn = thresholds.warning as number | undefined;
  const crit = thresholds.critical as number | undefined;
  if (crit !== undefined && value >= crit) return '#FF453A';
  if (warn !== undefined && value >= warn) return '#FF9F0A';
  return '#30D158';
}

function NoDataOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
      <div className="text-center">
        <Database className="w-6 h-6 text-neutral-300 mx-auto mb-1" />
        <p className="text-xs text-neutral-400">No data</p>
      </div>
    </div>
  );
}

export function LiveWidgetRenderer({ widget, onOverride, isOverrideMode, projectName }: LiveWidgetRendererProps) {
  const primary = widget.resolved_metrics[0] as ResolvedMetric | undefined;
  const hasData = widget.has_data;
  const [showAiBtn, setShowAiBtn] = useState(false);
  const navigate = useNavigate();
  const setPrefilledInput = useChatStore(s => s.setPrefilledInput);

  const handleAskAI = (e: React.MouseEvent) => {
    e.stopPropagation();
    const thresholds = widget.threshold_config as Record<string, unknown> | null | undefined;
    const connectorsList = widget.resolved_metrics
      .map(m => m.connector)
      .filter(Boolean)
      .join(', ') || 'N/A';
    const pVal = primary?.value ?? null;
    const status = pVal !== null && pVal !== undefined && thresholds
      ? ((thresholds.critical as number | undefined) !== undefined && pVal >= (thresholds.critical as number)
          ? 'critical'
          : (thresholds.warning as number | undefined) !== undefined && pVal >= (thresholds.warning as number)
          ? 'warning'
          : 'normal')
      : 'unknown';

    const prompt = `Analyze the metric "${widget.title}"${projectName ? ` for project "${projectName}"` : ''}.
Current value: ${primary?.value !== undefined ? `${primary.value}${primary.unit ? ' ' + primary.unit : ''}` : 'N/A'}. Status: ${status}.
${thresholds?.warning !== undefined ? `Threshold warning: ${thresholds.warning}` : ''}${thresholds?.critical !== undefined ? `, critical: ${thresholds.critical}` : ''}.
Active connectors: ${connectorsList}.
What could be causing this and what actions should I take?`;

    setPrefilledInput(prompt.trim());
    navigate('/chatbot');
  };

  const containerCls = cn(
    'relative h-full w-full rounded-xl bg-white border border-neutral-100 overflow-hidden transition-all group',
    isOverrideMode && 'ring-2 ring-primary-300 ring-offset-1',
    onOverride && 'cursor-pointer hover:border-primary-300'
  );

  return (
    <div
      className={containerCls}
      onClick={() => onOverride?.(widget.widget_id)}
      onMouseEnter={() => setShowAiBtn(true)}
      onMouseLeave={() => setShowAiBtn(false)}
    >
      <WidgetContent widget={widget} primary={primary} hasData={hasData} />
      {showAiBtn && (
        <button
          onClick={handleAskAI}
          className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-white shadow-md transition-all duration-150 hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1D4ED8, #0EA5E9)' }}
          title="Analyze with AI"
        >
          <Sparkles className="w-3 h-3" />
          Ask AI
        </button>
      )}
    </div>
  );
}

function WidgetContent({ widget, primary, hasData }: {
  widget: LiveWidgetData;
  primary: ResolvedMetric | undefined;
  hasData: boolean;
}) {
  const { widget_type } = widget;
  const thresholds = widget.threshold_config;
  const accentColor = primary?.color || getAccentForType(widget_type);

  switch (widget_type) {
    case 'kpi_card':
      return <KpiCard widget={widget} primary={primary} hasData={hasData} thresholds={thresholds} accentColor={accentColor} />;
    case 'gauge':
      return <GaugeWidget widget={widget} primary={primary} hasData={hasData} thresholds={thresholds} accentColor={accentColor} />;
    case 'progress_ring':
      return <ProgressRingWidget widget={widget} primary={primary} hasData={hasData} thresholds={thresholds} accentColor={accentColor} />;
    case 'sparkline':
      return <SparklineWidget widget={widget} primary={primary} hasData={hasData} accentColor={accentColor} />;
    case 'line_chart':
      return <LineChartWidget widget={widget} hasData={hasData} accentColor={accentColor} />;
    case 'area_chart':
      return <AreaChartWidget widget={widget} hasData={hasData} accentColor={accentColor} />;
    case 'bar_chart':
    case 'stacked_bar':
      return <BarChartWidget widget={widget} hasData={hasData} accentColor={accentColor} />;
    case 'sla_card':
      return <SlaCard widget={widget} primary={primary} hasData={hasData} thresholds={thresholds} />;
    case 'alert_panel':
      return <AlertPanel widget={widget} hasData={hasData} />;
    case 'comparison_grid':
      return <ComparisonGrid widget={widget} hasData={hasData} />;
    case 'health_distribution':
      return <HealthDistributionWidget widget={widget} hasData={hasData} />;
    case 'status_timeline':
      return <StatusTimeline widget={widget} hasData={hasData} />;
    case 'pie_donut':
      return <PieDonutWidget widget={widget} hasData={hasData} accentColor={accentColor} />;
    case 'table_widget':
      return <TableWidget widget={widget} hasData={hasData} />;
    case 'heatmap':
      return <HeatmapWidget widget={widget} hasData={hasData} accentColor={accentColor} />;
    case 'runtime_app_location_summary':
      return <RuntimeAppLocationWidget widget={widget} />;
    case 'runtime_dc_health_map':
      return <DataCenterHealthMapWidget widget={widget} />;
    case 'runtime_freshness_status':
      return <FreshnessStatusWidget widget={widget} />;
    default:
      return <DefaultWidget widget={widget} primary={primary} hasData={hasData} accentColor={accentColor} />;
  }
}

function WidgetHeader({ title, subtitle, badge }: { title: string; subtitle?: string | null; badge?: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-neutral-700 truncate">{title}</p>
        {subtitle && <p className="text-xs text-neutral-400 truncate mt-0.5">{subtitle}</p>}
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
    </div>
  );
}

function KpiCard({ widget, primary, hasData, thresholds, accentColor }: {
  widget: LiveWidgetData; primary?: ResolvedMetric; hasData: boolean;
  thresholds?: Record<string, unknown> | null; accentColor: string;
}) {
  const value = primary?.value;
  const color = getThresholdColor(value, thresholds);
  const trend = primary?.trend || [];

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center px-4 pb-3 gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: accentColor + '15' }}
        >
          <Activity className="w-5 h-5" style={{ color: accentColor }} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none" style={{ color }}>
            {formatValue(value, primary?.unit)}
          </p>
          {primary?.label && (
            <p className="text-xs text-neutral-400 mt-1 truncate">{primary.label}</p>
          )}
        </div>
        <div className="ml-auto">{getTrendIcon(trend)}</div>
      </div>
    </div>
  );
}

function GaugeWidget({ widget, primary, hasData, thresholds, accentColor }: {
  widget: LiveWidgetData; primary?: ResolvedMetric; hasData: boolean;
  thresholds?: Record<string, unknown> | null; accentColor: string;
}) {
  const pct = Math.min(100, Math.max(0, primary?.value ?? 0));
  const color = getThresholdColor(pct, thresholds);
  const angle = -180 + (pct / 100) * 180;

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center justify-center pb-2">
        <div className="relative w-28 h-16">
          <svg viewBox="0 0 100 50" className="w-full h-full">
            <path d="M5,50 A45,45 0 0,1 95,50" fill="none" stroke="#F0F0F0" strokeWidth="10" strokeLinecap="round" />
            <path
              d="M5,50 A45,45 0 0,1 95,50"
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 141.3} 141.3`}
            />
          </svg>
          <div className="absolute inset-0 flex items-end justify-center pb-1">
            <span className="text-base font-bold" style={{ color }}>{hasData ? `${pct.toFixed(1)}%` : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressRingWidget({ widget, primary, hasData, thresholds, accentColor }: {
  widget: LiveWidgetData; primary?: ResolvedMetric; hasData: boolean;
  thresholds?: Record<string, unknown> | null; accentColor: string;
}) {
  const pct = Math.min(100, Math.max(0, primary?.value ?? 0));
  const color = getThresholdColor(pct, thresholds);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 70 70" className="w-full h-full -rotate-90">
            <circle cx="35" cy="35" r={r} fill="none" stroke="#F0F0F0" strokeWidth="7" />
            <circle
              cx="35" cy="35" r={r} fill="none"
              stroke={color} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold" style={{ color }}>{hasData ? `${pct.toFixed(0)}%` : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SparklineWidget({ widget, primary, hasData, accentColor }: {
  widget: LiveWidgetData; primary?: ResolvedMetric; hasData: boolean; accentColor: string;
}) {
  const trendData = useMemo(() =>
    (primary?.trend || []).map((p) => ({ v: p.v })),
    [primary]
  );

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex flex-col px-3 pb-2">
        <div className="flex items-baseline gap-1.5 mb-1 px-1">
          <span className="text-xl font-bold text-neutral-900">
            {formatValue(primary?.value, primary?.unit)}
          </span>
          {getTrendIcon(primary?.trend || [])}
        </div>
        <div className="flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sg-${widget.widget_id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={accentColor} strokeWidth={1.5} fill={`url(#sg-${widget.widget_id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function LineChartWidget({ widget, hasData, accentColor }: {
  widget: LiveWidgetData; hasData: boolean; accentColor: string;
}) {
  const allData = useMemo(() => {
    const keys: string[] = [];
    const byTimestamp: Record<string, Record<string, number>> = {};
    widget.resolved_metrics.forEach(m => {
      keys.push(m.label);
      m.trend.forEach(p => {
        if (!byTimestamp[p.t]) byTimestamp[p.t] = {};
        byTimestamp[p.t][m.label] = p.v;
      });
    });
    return { keys, data: Object.entries(byTimestamp).map(([t, vals]) => ({ t, ...vals })) };
  }, [widget.resolved_metrics]);

  const COLORS = [accentColor, '#30D158', '#FF9F0A', '#FF453A', '#64D2FF'];

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={allData.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="t" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={() => ''} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e5ea' }} />
            {allData.keys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AreaChartWidget({ widget, hasData, accentColor }: {
  widget: LiveWidgetData; hasData: boolean; accentColor: string;
}) {
  const data = useMemo(() =>
    (widget.resolved_metrics[0]?.trend || []).map(p => ({ t: p.t, v: p.v })),
    [widget.resolved_metrics]
  );

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`ag-${widget.widget_id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={() => ''} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e5ea' }} />
            <Area type="monotone" dataKey="v" stroke={accentColor} strokeWidth={1.5} fill={`url(#ag-${widget.widget_id})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BarChartWidget({ widget, hasData, accentColor }: {
  widget: LiveWidgetData; hasData: boolean; accentColor: string;
}) {
  const data = useMemo(() =>
    widget.resolved_metrics.map(m => ({ name: m.label.slice(0, 10), value: m.value ?? 0 })),
    [widget.resolved_metrics]
  );

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e5ea' }} />
            <Bar dataKey="value" fill={accentColor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SlaCard({ widget, primary, hasData, thresholds }: {
  widget: LiveWidgetData; primary?: ResolvedMetric; hasData: boolean; thresholds?: Record<string, unknown> | null;
}) {
  const sla = primary?.value ?? null;
  const target = (thresholds?.target as number) ?? 99.9;
  const color = sla !== null && sla >= target ? '#30D158' : sla !== null && sla >= target - 1 ? '#FF9F0A' : '#FF453A';

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center justify-between px-4 pb-3">
        <div>
          <p className="text-3xl font-bold" style={{ color }}>
            {sla !== null ? `${sla.toFixed(2)}%` : '—'}
          </p>
          <p className="text-xs text-neutral-400 mt-1">Target: {target}%</p>
        </div>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: color + '15' }}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            {sla !== null && sla >= target - 1 ? (
              <path d="M5 12l5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" stroke={color} strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function AlertPanel({ widget, hasData }: { widget: LiveWidgetData; hasData: boolean }) {
  const metrics = widget.resolved_metrics;

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-4 pb-3 space-y-1.5 overflow-auto">
        {metrics.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-4">No alerts</p>
        ) : (
          metrics.map((m) => {
            const severity = m.value && m.value > 10 ? 'critical' : m.value && m.value > 5 ? 'high' : 'medium';
            const sev = { critical: { color: '#FF453A', bg: '#FF453A15' }, high: { color: '#FF9F0A', bg: '#FF9F0A15' }, medium: { color: '#0A84FF', bg: '#0A84FF15' } }[severity];
            return (
              <div key={m.binding_id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: sev.bg }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sev.color }} />
                  <span className="text-xs text-neutral-700 truncate">{m.label}</span>
                </div>
                <span className="text-xs font-mono font-semibold" style={{ color: sev.color }}>
                  {formatValue(m.value, m.unit)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ComparisonGrid({ widget, hasData }: { widget: LiveWidgetData; hasData: boolean }) {
  const metrics = widget.resolved_metrics.slice(0, 4);

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 grid grid-cols-2 gap-2 px-3 pb-3">
        {metrics.map(m => {
          const color = m.color || '#0A84FF';
          return (
            <div key={m.binding_id} className="rounded-xl p-2" style={{ backgroundColor: color + '10' }}>
              <p className="text-xs text-neutral-500 truncate">{m.label}</p>
              <p className="text-lg font-bold mt-0.5" style={{ color }}>
                {formatValue(m.value, m.unit)}
              </p>
            </div>
          );
        })}
        {metrics.length === 0 && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl p-2 bg-neutral-50">
            <p className="text-xs text-neutral-300">No data</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthDistributionWidget({ widget, hasData }: { widget: LiveWidgetData; hasData: boolean }) {
  const metrics = widget.resolved_metrics;
  const healthy = metrics.find(m => m.metric_key.includes('healthy'))?.value ?? 0;
  const degraded = metrics.find(m => m.metric_key.includes('degraded'))?.value ?? 0;
  const down = metrics.find(m => m.metric_key.includes('down') || m.metric_key.includes('error'))?.value ?? 0;

  const data = [
    { name: 'Healthy', value: healthy, color: '#30D158' },
    { name: 'Degraded', value: degraded, color: '#FF9F0A' },
    { name: 'Down', value: down, color: '#FF453A' },
  ].filter(d => d.value > 0);

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center px-4 pb-3 gap-4">
        <div className="w-20 h-20 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.length > 0 ? data : [{ name: 'empty', value: 1, color: '#E5E5EA' }]} cx="50%" cy="50%" innerRadius={22} outerRadius={36} dataKey="value" strokeWidth={0}>
                {(data.length > 0 ? data : [{ color: '#E5E5EA' }]).map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5">
          {[{ label: 'Healthy', val: healthy, color: '#30D158' }, { label: 'Degraded', val: degraded, color: '#FF9F0A' }, { label: 'Down', val: down, color: '#FF453A' }].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-neutral-500">{s.label}</span>
              <span className="text-xs font-bold ml-auto" style={{ color: s.color }}>{hasData ? s.val : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusTimeline({ widget, hasData }: { widget: LiveWidgetData; hasData: boolean }) {
  const metrics = widget.resolved_metrics.slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-4 pb-3 space-y-2">
        {metrics.map(m => {
          const trend = m.trend.slice(-20);
          return (
            <div key={m.binding_id}>
              <p className="text-xs text-neutral-500 mb-1 truncate">{m.label}</p>
              <div className="flex gap-0.5">
                {trend.map((p, i) => {
                  const pct = Math.min(100, Math.max(0, p.v));
                  const c = pct >= 90 ? '#30D158' : pct >= 60 ? '#FF9F0A' : '#FF453A';
                  return <div key={i} className="flex-1 h-3 rounded-sm" style={{ backgroundColor: c, opacity: 0.8 }} />;
                })}
                {trend.length === 0 && Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="flex-1 h-3 rounded-sm bg-neutral-100" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PieDonutWidget({ widget, hasData, accentColor }: {
  widget: LiveWidgetData; hasData: boolean; accentColor: string;
}) {
  const data = widget.resolved_metrics.slice(0, 6).map(m => ({
    name: m.label, value: Math.abs(m.value ?? 0),
  }));
  const COLORS = [accentColor, '#30D158', '#FF9F0A', '#FF453A', '#64D2FF', '#636366'];

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.length > 0 ? data : [{ name: 'empty', value: 1 }]} cx="50%" cy="50%" innerRadius="35%" outerRadius="65%" dataKey="value" strokeWidth={0}>
              {(data.length > 0 ? data : [{ name: 'empty' }]).map((_, i) => (
                <Cell key={i} fill={data.length > 0 ? COLORS[i % COLORS.length] : '#E5E5EA'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableWidget({ widget, hasData }: { widget: LiveWidgetData; hasData: boolean }) {
  const metrics = widget.resolved_metrics;

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 px-3 pb-3 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-400 border-b border-neutral-100">
              <th className="text-left pb-1.5 font-medium">Metric</th>
              <th className="text-right pb-1.5 font-medium">Value</th>
              <th className="text-right pb-1.5 font-medium">Avg</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.binding_id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                <td className="py-1.5 text-neutral-700 font-medium truncate max-w-[100px]">{m.label}</td>
                <td className="py-1.5 text-right font-mono text-neutral-900">{formatValue(m.value, m.unit)}</td>
                <td className="py-1.5 text-right font-mono text-neutral-400">{formatValue(m.avg_value, m.unit)}</td>
              </tr>
            ))}
            {metrics.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-center text-neutral-300">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeatmapWidget({ widget, hasData, accentColor }: {
  widget: LiveWidgetData; hasData: boolean; accentColor: string;
}) {
  const data = widget.resolved_metrics[0]?.trend.slice(-32) || [];

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center px-4 pb-3">
        <div className="grid grid-cols-8 gap-1 w-full">
          {(data.length > 0 ? data : Array.from({ length: 32 }, (_, i) => ({ v: 0 }))).map((p, i) => {
            const intensity = Math.min(1, (p.v || 0) / 100);
            return (
              <div
                key={i}
                className="aspect-square rounded-sm"
                style={{
                  backgroundColor: data.length > 0 ? accentColor : '#E5E5EA',
                  opacity: data.length > 0 ? 0.1 + intensity * 0.9 : 0.3,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DefaultWidget({ widget, primary, hasData, accentColor }: {
  widget: LiveWidgetData; primary?: ResolvedMetric; hasData: boolean; accentColor: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <WidgetHeader title={widget.title} subtitle={widget.subtitle} />
      {!hasData && <NoDataOverlay />}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold" style={{ color: accentColor }}>
            {formatValue(primary?.value, primary?.unit)}
          </p>
          {primary?.label && <p className="text-xs text-neutral-400 mt-1">{primary.label}</p>}
        </div>
      </div>
    </div>
  );
}

function getAccentForType(type: string): string {
  const map: Record<string, string> = {
    kpi_card: '#0A84FF', gauge: '#30D158', progress_ring: '#FF9F0A',
    sparkline: '#0A84FF', line_chart: '#0A84FF', area_chart: '#30D158',
    bar_chart: '#FF9F0A', stacked_bar: '#FF9F0A', pie_donut: '#0A84FF',
    sla_card: '#30D158', alert_panel: '#FF453A', status_timeline: '#64D2FF',
    comparison_grid: '#0A84FF', table_widget: '#636366', heatmap: '#FF9F0A',
    health_distribution: '#30D158',
    runtime_app_location_summary: '#0A84FF', runtime_dc_health_map: '#30D158',
    runtime_freshness_status: '#FF9F0A',
  };
  return map[type] || '#0A84FF';
}
