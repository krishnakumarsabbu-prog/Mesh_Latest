import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCw, Settings, ArrowLeft, Clock, Eye, EyeOff, Star, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, LayoutDashboard, ChevronDown, FileSliders as Sliders, ZoomIn, ZoomOut, Maximize2, X, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { projectDashboardAssignmentApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import {
  LiveDashboardResponse, LiveWidgetData, AssignmentResponse,
  WidgetOverrideCreate,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { LiveWidgetRenderer } from '@/components/live-dashboard/LiveWidgetRenderer';
import { WidgetOverridePanel } from '@/components/live-dashboard/WidgetOverridePanel';
import { useProjectStream } from '@/hooks/useProjectStream';

const COLS = 12;
const ROW_H = 80;
const GAP = 8;

type TimeRange = '1h' | '6h' | '24h' | '7d';
const TIME_RANGES: { value: TimeRange; label: string; hours: number }[] = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: '7d', label: '7 Days', hours: 168 },
];

export function LiveDashboardPage() {
  const { projectId, assignmentId } = useParams<{ projectId: string; assignmentId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();

  const [dashboard, setDashboard] = useState<LiveDashboardResponse | null>(null);
  const [assignment, setAssignment] = useState<AssignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [showTimeRangeDropdown, setShowTimeRangeDropdown] = useState(false);
  const [overridePanelWidgetId, setOverridePanelWidgetId] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!projectId || !assignmentId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const hours = TIME_RANGES.find(t => t.value === timeRange)?.hours ?? 24;
      const [renderRes, assignRes] = await Promise.all([
        projectDashboardAssignmentApi.render(projectId, assignmentId, hours),
        projectDashboardAssignmentApi.get(projectId, assignmentId),
      ]);
      setDashboard(renderRes.data);
      setAssignment(assignRes.data);
      setLastRefreshed(new Date());

      const name = renderRes.data.dashboard_name;
      setPageTitle(name);
      setBreadcrumbs([
        { label: 'Projects', href: '/projects' },
        { label: renderRes.data.project_id, href: `/projects/${projectId}` },
        { label: 'Dashboards', href: `/projects/${projectId}/dashboards` },
        { label: name },
      ]);
    } catch {
      if (!silent) notify.error('Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, assignmentId, timeRange]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!assignment) return;
    const interval = assignment.refresh_interval_seconds;
    setCountdown(interval);

    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    refreshTimerRef.current = setInterval(() => { loadDashboard(true); setCountdown(interval); }, interval * 1000);
    countdownTimerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [assignment, loadDashboard]);

  const handleManualRefresh = () => {
    loadDashboard(true);
    setCountdown(assignment?.refresh_interval_seconds ?? 60);
  };

  const handleWidgetOverrideChange = async (override: WidgetOverrideCreate) => {
    if (!projectId || !assignmentId) return;
    try {
      await projectDashboardAssignmentApi.upsertWidgetOverride(projectId, assignmentId, override.widget_id, override);
      notify.success('Override saved');
      loadDashboard(true);
    } catch {
      notify.error('Failed to save override');
    }
  };

  const handleDeleteWidgetOverride = async (widgetId: string) => {
    if (!projectId || !assignmentId) return;
    try {
      await projectDashboardAssignmentApi.deleteWidgetOverride(projectId, assignmentId, widgetId);
      notify.success('Override removed');
      loadDashboard(true);
    } catch {
      notify.error('Failed to remove override');
    }
  };

  const streamHours = TIME_RANGES.find(t => t.value === timeRange)?.hours ?? 24;
  const { widgets: streamWidgets, connected: wsConnected, lastUpdated: wsLastUpdated } = useProjectStream(
    projectId,
    assignmentId,
    streamHours,
    !!dashboard
  );

  const activeWidgets = streamWidgets.length > 0 ? streamWidgets : (dashboard?.widgets ?? []);
  const visibleWidgets = activeWidgets.filter(w => !w.is_hidden);
  const hiddenCount = activeWidgets.length - visibleWidgets.length;
  const maxY = visibleWidgets.reduce((m, w) => Math.max(m, w.layout_y + w.height), 0);
  const gridHeight = maxY * ROW_H + (maxY - 1) * GAP;
  const projectName = dashboard?.dashboard_name ?? '';

  const overridePanelWidget = overridePanelWidgetId
    ? dashboard?.widgets.find(w => w.widget_id === overridePanelWidgetId) ?? null
    : null;

  const overrideData = overridePanelWidget
    ? assignment?.overrides.find(o => o.widget_id === overridePanelWidgetId) ?? null
    : null;

  const summary = dashboard?.project_summary;

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 animate-pulse space-y-4 p-6">
          <div className="h-14 bg-neutral-100 rounded-2xl w-full" />
          <div className="h-20 bg-neutral-100 rounded-2xl w-full" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-40 bg-neutral-100 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LayoutDashboard className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
          <p className="text-neutral-500">Dashboard not found</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate(`/projects/${projectId}/dashboards`)}>
            Back to Dashboards
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-neutral-50 -m-6 p-0">
      <div className="bg-white border-b border-neutral-100 px-6 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
        <button
          onClick={() => navigate(`/projects/${projectId}/dashboards`)}
          className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-all flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <LayoutDashboard className="w-4 h-4 text-primary-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-neutral-900 truncate">{dashboard.dashboard_name}</h1>
            {dashboard.dashboard_name !== dashboard.template_name && (
              <p className="text-xs text-neutral-400 truncate">{dashboard.template_name}</p>
            )}
          </div>
          {assignment?.is_default && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs border border-amber-100 flex-shrink-0">
              <Star className="w-2.5 h-2.5" />
              Default
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowTimeRangeDropdown(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 text-xs text-neutral-600 hover:border-neutral-300 transition-all"
            >
              <Clock className="w-3.5 h-3.5" />
              {TIME_RANGES.find(t => t.value === timeRange)?.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            <AnimatePresence>
              {showTimeRangeDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-xl z-50 overflow-hidden min-w-28"
                >
                  {TIME_RANGES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => { setTimeRange(t.value); setShowTimeRangeDropdown(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs hover:bg-neutral-50 transition-colors',
                        timeRange === t.value ? 'text-primary-600 font-semibold bg-primary-50' : 'text-neutral-700'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={() => setOverrideMode(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-all',
              overrideMode ? 'border-primary-400 bg-primary-50 text-primary-600' : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
            )}
          >
            <Sliders className="w-3.5 h-3.5" />
            Overrides {overrideMode && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 inline-block" />}
          </button>

          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-all',
              wsConnected
                ? 'bg-success-50 border-success-200 text-success-700'
                : 'bg-neutral-50 border-neutral-200 text-neutral-500'
            )}
            title={wsConnected ? `Live stream active${wsLastUpdated ? ' · ' + wsLastUpdated.toLocaleTimeString() : ''}` : 'Connecting to live stream…'}
          >
            {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{wsConnected ? 'Live' : 'Poll'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-500">
            <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
            <span>{countdown}s</span>
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />}
            onClick={handleManualRefresh}
            loading={refreshing}
          >
            Refresh
          </Button>
        </div>
      </div>

      {summary && (
        <div className="px-6 py-3 border-b border-neutral-100 bg-white">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <div className={cn(
                'w-2 h-2 rounded-full',
                summary.overall_health_status === 'healthy' ? 'bg-success-500' :
                summary.overall_health_status === 'degraded' ? 'bg-amber-400' : 'bg-danger-500'
              )} />
              <span className="font-semibold text-neutral-900 capitalize">{summary.overall_health_status || 'Unknown'}</span>
              {summary.overall_score !== undefined && summary.overall_score !== null && (
                <span className="text-neutral-400 ml-1">{summary.overall_score.toFixed(1)} score</span>
              )}
            </div>
            <div className="w-px h-4 bg-neutral-200" />
            <StatPill label="Connectors" value={`${summary.healthy_connectors}/${summary.total_connectors}`} color="#30D158" />
            <StatPill label="Availability" value={`${summary.availability_percentage.toFixed(1)}%`} color="#0A84FF" />
            <StatPill label="SLA" value={`${summary.sla_percentage.toFixed(1)}%`} color="#FF9F0A" />
            <StatPill label="Incidents" value={String(summary.incident_count)} color="#FF453A" />
            {hiddenCount > 0 && (
              <>
                <div className="w-px h-4 bg-neutral-200" />
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  {hiddenCount} hidden widget{hiddenCount > 1 ? 's' : ''}
                </span>
              </>
            )}
            {lastRefreshed && (
              <span className="text-xs text-neutral-300 ml-auto">
                Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {overrideMode && (
        <div className="px-6 py-2 bg-primary-50 border-b border-primary-100 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-primary-500" />
          <p className="text-xs text-primary-700 font-medium">Override Mode — click any widget to customize it without changing the master template</p>
          <button onClick={() => setOverrideMode(false)} className="ml-auto p-1 rounded text-primary-400 hover:text-primary-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 p-6 overflow-auto">
        {visibleWidgets.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <LayoutDashboard className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm">No visible widgets</p>
              {hiddenCount > 0 && (
                <p className="text-xs text-neutral-400 mt-1">
                  {hiddenCount} widget{hiddenCount > 1 ? 's are' : ' is'} hidden via overrides
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            className="relative"
            style={{ height: gridHeight > 0 ? gridHeight : 'auto' }}
          >
            {visibleWidgets.map(widget => (
              <WidgetCell
                key={widget.widget_id}
                widget={widget}
                overrideMode={overrideMode}
                isSelected={overridePanelWidgetId === widget.widget_id}
                projectName={projectName}
                onSelect={() => overrideMode && setOverridePanelWidgetId(prev => prev === widget.widget_id ? null : widget.widget_id)}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {overridePanelWidget && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 24, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-96 bg-white border-l border-neutral-200 shadow-2xl z-50 flex flex-col"
          >
            <WidgetOverridePanel
              widget={overridePanelWidget}
              existingOverride={overrideData}
              onSave={handleWidgetOverrideChange}
              onDelete={() => {
                handleDeleteWidgetOverride(overridePanelWidget.widget_id);
                setOverridePanelWidgetId(null);
              }}
              onClose={() => setOverridePanelWidgetId(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WidgetCell({ widget, overrideMode, isSelected, onSelect, projectName }: {
  widget: LiveWidgetData;
  overrideMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  projectName?: string;
}) {
  const colWidth = `calc((100% - ${(COLS - 1) * GAP}px) / ${COLS})`;
  const left = `calc(${widget.layout_x} * (${colWidth} + ${GAP}px))`;
  const top = widget.layout_y * (ROW_H + GAP);
  const width = `calc(${widget.width} * ${colWidth} + ${(widget.width - 1) * GAP}px)`;
  const height = widget.height * ROW_H + (widget.height - 1) * GAP;

  return (
    <motion.div
      layout
      style={{ position: 'absolute', left, top, width, height }}
      className={cn(
        'transition-shadow',
        overrideMode && 'cursor-pointer',
        isSelected && 'ring-2 ring-primary-500 ring-offset-1 rounded-xl'
      )}
      onClick={onSelect}
    >
      <div className="h-full w-full shadow-sm hover:shadow-md transition-shadow rounded-xl overflow-hidden">
        <LiveWidgetRenderer
          widget={widget}
          isOverrideMode={isSelected}
          projectName={projectName}
        />
      </div>
    </motion.div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-neutral-400">{label}:</span>
      <span className="font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}
