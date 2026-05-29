import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Clock, Activity, Users, TrendingUp, TrendingDown,
  TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Minus,
  Shield, Database, EyeOff, Settings, Star,
  ChartBar as BarChart2,
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { teamDashboardAssignmentApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import {
  TeamLiveDashboardResponse, TeamLiveWidgetData, TeamResolvedMetric, TeamSummary,
} from '@/types';
import { cn } from '@/lib/utils';

const GRID_COLS = 12;
const CELL_H = 80;
const GAP = 8;

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

function getThresholdColor(value: number | null | undefined, thresholds?: Record<string, unknown> | null): string {
  if (value === null || value === undefined || !thresholds) return '#0A84FF';
  const warn = thresholds.warning as number | undefined;
  const crit = thresholds.critical as number | undefined;
  if (crit !== undefined && value >= crit) return '#FF453A';
  if (warn !== undefined && value >= warn) return '#FF9F0A';
  return '#30D158';
}

function healthScoreColor(score: number): string {
  if (score >= 80) return '#30D158';
  if (score >= 50) return '#FF9F0A';
  return '#FF453A';
}

export function TeamLiveDashboardPage() {
  const { teamId, assignmentId } = useParams<{ teamId: string; assignmentId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();

  const [dashboard, setDashboard] = useState<TeamLiveDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [overrideMode, setOverrideMode] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!teamId || !assignmentId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await teamDashboardAssignmentApi.render(teamId, assignmentId);
      setDashboard(res.data);
      setCountdown(res.data.refresh_interval_seconds);

      setPageTitle(res.data.dashboard_name);
      setBreadcrumbs([
        { label: 'Teams', href: '/teams' },
        { label: res.data.team_summary?.team_name || 'Team', href: `/teams/${teamId}` },
        { label: 'Dashboards', href: `/teams/${teamId}/dashboards` },
        { label: res.data.dashboard_name },
      ]);
    } catch {
      if (!silent) notify.error('Failed to load team dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, assignmentId]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    const interval = dashboard.refresh_interval_seconds;
    setCountdown(interval);

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchDashboard(true);
          return interval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [dashboard?.refresh_interval_seconds, fetchDashboard]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [loading]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-neutral-100 rounded-xl w-96" />
        <div className="h-32 bg-neutral-100 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-neutral-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Database className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500">Dashboard not found</p>
          <button
            onClick={() => navigate(`/teams/${teamId}/dashboards`)}
            className="mt-3 text-sm text-primary-600 hover:underline"
          >
            Back to dashboards
          </button>
        </div>
      </div>
    );
  }

  const visibleWidgets = dashboard.widgets
    .filter(w => !w.is_hidden)
    .sort((a, b) => a.sort_order - b.sort_order || a.layout_y - b.layout_y || a.layout_x - b.layout_x);

  const hiddenCount = dashboard.widgets.filter(w => w.is_hidden).length;

  const cellWidth = containerWidth > 0
    ? (containerWidth - GAP * (GRID_COLS - 1)) / GRID_COLS
    : 0;

  const maxRow = visibleWidgets.reduce((max, w) => Math.max(max, w.layout_y + w.height), 0);
  const gridHeight = maxRow * (CELL_H + GAP) - GAP;

  const summary = dashboard.team_summary;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/teams/${teamId}/dashboards`)}
          className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {summary?.team_color && (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: summary.team_color + '20' }}
            >
              <Activity className="w-4 h-4" style={{ color: summary.team_color }} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-neutral-900 truncate">{dashboard.dashboard_name}</h1>
            <p className="text-xs text-neutral-400 truncate">
              {summary?.team_name} · Team Dashboard · {dashboard.template_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100 text-neutral-500 text-xs">
              <EyeOff className="w-3.5 h-3.5" />
              {hiddenCount} hidden
            </div>
          )}

          <button
            onClick={() => setOverrideMode(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
              overrideMode
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Override
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-500">
            <Clock className="w-3.5 h-3.5" />
            {countdown}s
          </div>

          <button
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:text-primary-600 hover:border-primary-300 transition-all"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {summary && <TeamSummaryBar summary={summary} />}

      {visibleWidgets.length === 0 ? (
        <div className="flex items-center justify-center h-64 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
          <div className="text-center">
            <BarChart2 className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-400">No visible widgets in this dashboard</p>
          </div>
        </div>
      ) : (
        <div ref={gridRef} className="relative" style={{ height: cellWidth > 0 ? gridHeight : 'auto' }}>
          {cellWidth > 0 && visibleWidgets.map(widget => {
            const left = widget.layout_x * (cellWidth + GAP);
            const top = widget.layout_y * (CELL_H + GAP);
            const width = widget.width * (cellWidth + GAP) - GAP;
            const height = widget.height * (CELL_H + GAP) - GAP;

            return (
              <motion.div
                key={widget.widget_id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ position: 'absolute', left, top, width, height }}
                className={cn(
                  'rounded-2xl overflow-hidden',
                  overrideMode && 'ring-2 ring-primary-300 ring-offset-1 cursor-pointer'
                )}
                onClick={() => overrideMode && setSelectedWidgetId(
                  selectedWidgetId === widget.widget_id ? null : widget.widget_id
                )}
              >
                <TeamWidgetCard widget={widget} isOverrideMode={overrideMode} />
              </motion.div>
            );
          })}

          {cellWidth === 0 && (
            <div className="grid grid-cols-3 gap-4">
              {visibleWidgets.map(widget => (
                <div key={widget.widget_id} className="rounded-2xl overflow-hidden" style={{ height: CELL_H * widget.height }}>
                  <TeamWidgetCard widget={widget} isOverrideMode={false} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-100">
        <span>Rendered at {new Date(dashboard.rendered_at).toLocaleTimeString()}</span>
        <span>
          {summary?.metrics_computed_at
            ? `Metrics computed ${new Date(summary.metrics_computed_at).toLocaleString()}`
            : 'Metrics not yet computed for this team'}
        </span>
      </div>
    </div>
  );
}

function TeamSummaryBar({ summary }: { summary: TeamSummary }) {
  const healthColor = healthScoreColor(summary.avg_project_health);

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-50 flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: summary.team_color || '#30D158' }}
        />
        <span className="text-sm font-semibold text-neutral-800">{summary.team_name}</span>
        <span className="text-xs text-neutral-400">· Team Executive Summary</span>
        {summary.metrics_computed_at && (
          <span className="ml-auto text-xs text-neutral-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(summary.metrics_computed_at).toLocaleString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x divide-neutral-50">
        {[
          {
            label: 'Avg Health',
            value: `${summary.avg_project_health.toFixed(1)}%`,
            color: healthColor,
            icon: Activity,
          },
          {
            label: 'Projects',
            value: summary.project_count,
            color: '#0A84FF',
            icon: BarChart2,
          },
          {
            label: 'Healthy',
            value: summary.healthy_projects,
            color: '#30D158',
            icon: CheckCircle,
          },
          {
            label: 'Warning',
            value: summary.warning_projects,
            color: '#FF9F0A',
            icon: AlertTriangle,
          },
          {
            label: 'Critical',
            value: summary.critical_projects,
            color: '#FF453A',
            icon: AlertTriangle,
          },
          {
            label: 'Availability',
            value: `${summary.avg_availability.toFixed(1)}%`,
            color: summary.avg_availability >= 99 ? '#30D158' : summary.avg_availability >= 95 ? '#FF9F0A' : '#FF453A',
            icon: Shield,
          },
          {
            label: 'Alerts',
            value: summary.total_alerts,
            color: summary.total_alerts === 0 ? '#30D158' : '#FF9F0A',
            icon: AlertTriangle,
          },
          {
            label: 'SLA Breaches',
            value: summary.sla_breach_count,
            color: summary.sla_breach_count === 0 ? '#30D158' : '#FF453A',
            icon: Shield,
          },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="px-4 py-3 flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
              <span className="text-xs text-neutral-400 truncate">{label}</span>
            </div>
            <span className="text-base font-bold" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamWidgetCard({ widget, isOverrideMode }: { widget: TeamLiveWidgetData; isOverrideMode: boolean }) {
  const primary = widget.resolved_metrics[0] as TeamResolvedMetric | undefined;
  const hasData = widget.has_data;

  return (
    <div className={cn(
      'relative h-full w-full bg-white border border-neutral-100 rounded-2xl overflow-hidden transition-all',
      isOverrideMode && 'hover:border-primary-300'
    )}>
      <WidgetContent widget={widget} primary={primary} hasData={hasData} />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-2xl z-10">
          <div className="text-center">
            <Database className="w-5 h-5 text-neutral-300 mx-auto mb-1" />
            <p className="text-xs text-neutral-400">No aggregate data</p>
            <p className="text-xs text-neutral-300 mt-0.5">Run team aggregation to populate</p>
          </div>
        </div>
      )}
    </div>
  );
}

function WidgetContent({
  widget,
  primary,
  hasData,
}: {
  widget: TeamLiveWidgetData;
  primary: TeamResolvedMetric | undefined;
  hasData: boolean;
}) {
  const type = widget.widget_type;
  const thresholds = widget.threshold_config;
  const color = primary?.color || getThresholdColor(primary?.value, thresholds);

  const allValues = widget.resolved_metrics
    .filter(m => m.value !== null && m.value !== undefined)
    .map(m => ({ name: m.label, value: m.value as number }));

  switch (type) {
    case 'kpi_card': {
      const val = primary?.value;
      const trendArr = primary?.trend ?? [];
      const prev = trendArr.length >= 2 ? trendArr[trendArr.length - 2]?.v : undefined;
      const change = val !== undefined && val !== null && prev !== undefined
        ? ((val - prev) / Math.abs(prev)) * 100
        : null;
      const accentColor = getThresholdColor(val, thresholds);

      return (
        <div className="flex flex-col justify-between h-full p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500 truncate">{widget.title}</p>
              {widget.subtitle && <p className="text-xs text-neutral-400 truncate">{widget.subtitle}</p>}
            </div>
            {change !== null && (
              <div className={cn('flex items-center gap-0.5 text-xs', change > 0 ? 'text-success-600' : change < 0 ? 'text-danger-500' : 'text-neutral-400')}>
                {change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                {Math.abs(change).toFixed(1)}%
              </div>
            )}
          </div>
          <div>
            <p className="text-3xl font-bold leading-none" style={{ color: accentColor }}>
              {formatValue(val, primary?.unit)}
            </p>
            {primary?.last_computed_at && (
              <p className="text-xs text-neutral-400 mt-1">
                {new Date(primary.last_computed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      );
    }

    case 'gauge': {
      const val = Math.min(100, Math.max(0, primary?.value ?? 0));
      const angle = -180 + (val / 100) * 180;
      const gColor = getThresholdColor(val, thresholds);
      return (
        <div className="flex flex-col justify-between h-full p-4">
          <p className="text-xs font-medium text-neutral-500 truncate">{widget.title}</p>
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="relative w-24 h-14 overflow-hidden">
              <div className="absolute bottom-0 left-0 w-24 h-12 rounded-t-full border-4 border-neutral-100" />
              <div
                className="absolute bottom-0 left-0 w-24 h-12 rounded-t-full border-4 border-transparent"
                style={{
                  borderTopColor: gColor,
                  borderLeftColor: angle > -90 ? gColor : 'transparent',
                  borderRightColor: angle < -90 ? 'transparent' : gColor,
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: 'bottom center',
                  transition: 'transform 0.6s ease',
                }}
              />
              <p className="absolute bottom-0 left-0 right-0 text-center text-sm font-bold" style={{ color: gColor }}>
                {val.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      );
    }

    case 'line_chart':
    case 'area_chart': {
      const seriesData = hasData
        ? widget.resolved_metrics.map((m, idx) => ({
            key: m.metric_key,
            label: m.label,
            color: m.color || ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A'][idx % 4],
            data: m.trend?.map(p => ({ name: new Date(p.t).toLocaleTimeString(), v: p.v })) ||
              [{ name: 'Current', v: m.value ?? 0 }],
          }))
        : [];

      const mergedData = seriesData.length > 0
        ? seriesData[0].data.map((p, i) => {
            const obj: Record<string, unknown> = { name: p.name };
            seriesData.forEach(s => { obj[s.key] = s.data[i]?.v; });
            return obj;
          })
        : [];

      return (
        <div className="flex flex-col h-full p-3">
          <p className="text-xs font-medium text-neutral-500 mb-2 truncate">{widget.title}</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              {type === 'area_chart' ? (
                <AreaChart data={mergedData}>
                  <XAxis dataKey="name" hide tick={{ fontSize: 9 }} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  {seriesData.map(s => (
                    <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} fill={s.color + '20'} dot={false} />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={mergedData}>
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  {seriesData.map(s => (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} dot={false} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'bar_chart':
    case 'stacked_bar': {
      return (
        <div className="flex flex-col h-full p-3">
          <p className="text-xs font-medium text-neutral-500 mb-2 truncate">{widget.title}</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allValues}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis hide />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'pie_donut': {
      const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#636366'];
      return (
        <div className="flex flex-col h-full p-3">
          <p className="text-xs font-medium text-neutral-500 mb-1 truncate">{widget.title}</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={allValues} dataKey="value" innerRadius="40%" outerRadius="70%" paddingAngle={2}>
                  {allValues.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'sla_card': {
      const val = primary?.value ?? 0;
      const target = (thresholds?.target as number) ?? 99.9;
      const met = val >= target;
      return (
        <div className="flex flex-col justify-between h-full p-4">
          <div>
            <p className="text-xs font-medium text-neutral-500 truncate">{widget.title}</p>
            <p className="text-xs text-neutral-400">Target: {target}%</p>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-bold" style={{ color: met ? '#30D158' : '#FF453A' }}>
              {val.toFixed(2)}%
            </p>
            {met
              ? <CheckCircle className="w-6 h-6 text-success-500" />
              : <AlertTriangle className="w-6 h-6 text-danger-500" />}
          </div>
        </div>
      );
    }

    case 'alert_panel': {
      const count = primary?.value ?? 0;
      return (
        <div className="flex flex-col h-full p-4">
          <p className="text-xs font-medium text-neutral-500 truncate mb-2">{widget.title}</p>
          <div className={cn(
            'flex-1 flex flex-col items-center justify-center gap-2 rounded-xl',
            count === 0 ? 'bg-success-50' : 'bg-danger-50'
          )}>
            {count === 0
              ? <CheckCircle className="w-7 h-7 text-success-500" />
              : <AlertTriangle className="w-7 h-7 text-danger-500" />}
            <p className="text-2xl font-bold" style={{ color: count === 0 ? '#30D158' : '#FF453A' }}>
              {count}
            </p>
            <p className="text-xs text-neutral-500">{count === 0 ? 'No alerts' : 'Active alerts'}</p>
          </div>
        </div>
      );
    }

    case 'health_distribution': {
      const healthy = (widget.resolved_metrics.find(m => m.metric_key === 'healthy_projects_count')?.value ?? 0) as number;
      const warning = (widget.resolved_metrics.find(m => m.metric_key === 'warning_projects_count')?.value ?? 0) as number;
      const critical = (widget.resolved_metrics.find(m => m.metric_key === 'critical_projects_count')?.value ?? 0) as number;
      const total = healthy + warning + critical || 1;
      const dist = [
        { name: 'Healthy', value: healthy, fill: '#30D158' },
        { name: 'Warning', value: warning, fill: '#FF9F0A' },
        { name: 'Critical', value: critical, fill: '#FF453A' },
      ].filter(d => d.value > 0);

      return (
        <div className="flex flex-col h-full p-3">
          <p className="text-xs font-medium text-neutral-500 mb-1 truncate">{widget.title}</p>
          <div className="flex items-center gap-3 flex-1 min-h-0">
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dist} dataKey="value" innerRadius="35%" outerRadius="65%" paddingAngle={2}>
                    {dist.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-xs flex-shrink-0">
              {[
                { label: 'Healthy', color: '#30D158', count: healthy },
                { label: 'Warning', color: '#FF9F0A', count: warning },
                { label: 'Critical', color: '#FF453A', count: critical },
              ].map(({ label, color: c, count }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                  <span className="text-neutral-600">{label}</span>
                  <span className="font-semibold text-neutral-800 ml-auto pl-2">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'comparison_grid': {
      const metrics = widget.resolved_metrics.slice(0, 4);
      return (
        <div className="h-full p-3">
          <p className="text-xs font-medium text-neutral-500 mb-2 truncate">{widget.title}</p>
          <div className="grid grid-cols-2 gap-2 h-[calc(100%-24px)]">
            {metrics.map((m, i) => (
              <div key={i} className="bg-neutral-50 rounded-xl p-2 flex flex-col justify-between">
                <p className="text-xs text-neutral-400 truncate">{m.label}</p>
                <p className="text-lg font-bold" style={{ color: m.color || '#0A84FF' }}>
                  {formatValue(m.value, m.unit)}
                </p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'table_widget': {
      return (
        <div className="flex flex-col h-full p-3">
          <p className="text-xs font-medium text-neutral-500 mb-2 truncate">{widget.title}</p>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left py-1 text-neutral-400 font-medium">Metric</th>
                  <th className="text-right py-1 text-neutral-400 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {widget.resolved_metrics.map((m, i) => (
                  <tr key={i} className="border-b border-neutral-50">
                    <td className="py-1 text-neutral-600 truncate max-w-[120px]">{m.label}</td>
                    <td className="py-1 text-right font-semibold" style={{ color: m.color || '#0A84FF' }}>
                      {formatValue(m.value, m.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    default: {
      return (
        <div className="flex flex-col justify-between h-full p-4">
          <div>
            <p className="text-xs font-medium text-neutral-500 truncate">{widget.title}</p>
            {widget.subtitle && <p className="text-xs text-neutral-400 truncate">{widget.subtitle}</p>}
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color }}>
              {formatValue(primary?.value, primary?.unit)}
            </p>
            {primary?.label && (
              <p className="text-xs text-neutral-400 mt-0.5">{primary.label}</p>
            )}
          </div>
        </div>
      );
    }
  }
}
