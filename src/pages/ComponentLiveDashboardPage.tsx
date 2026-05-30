import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCw, ArrowLeft, Star, LayoutDashboard, Sliders, X, Layers, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { componentDashboardAssignmentApi, componentApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import {
  LiveWidgetData, AssignmentResponse, WidgetOverrideCreate, Component,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { LiveWidgetRenderer } from '@/components/live-dashboard/LiveWidgetRenderer';
import { WidgetOverridePanel } from '@/components/live-dashboard/WidgetOverridePanel';

const COLS = 12;
const ROW_H = 80;
const GAP = 8;

export function ComponentLiveDashboardPage() {
  const { componentId, assignmentId } = useParams<{ componentId: string; assignmentId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();

  const [component, setComponent] = useState<Component | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [assignment, setAssignment] = useState<AssignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [overridePanelWidgetId, setOverridePanelWidgetId] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!componentId || !assignmentId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [renderRes, assignRes, compRes] = await Promise.all([
        componentDashboardAssignmentApi.render(componentId, assignmentId),
        componentDashboardAssignmentApi.get(componentId, assignmentId),
        componentApi.get(componentId),
      ]);
      setDashboard(renderRes.data);
      setAssignment(assignRes.data);
      setComponent(compRes.data);
      setLastRefreshed(new Date());

      const name = renderRes.data.dashboard_name;
      setPageTitle(name);
      setBreadcrumbs([
        { label: 'Components', href: '/components' },
        { label: compRes.data.name, href: `/components/${componentId}` },
        { label: 'Dashboards', href: `/components/${componentId}/dashboards` },
        { label: name },
      ]);
    } catch {
      if (!silent) notify.error('Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [componentId, assignmentId]);

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
    if (!componentId || !assignmentId) return;
    try {
      await componentDashboardAssignmentApi.upsertWidgetOverride(componentId, assignmentId, override.widget_id, override);
      notify.success('Override saved');
      loadDashboard(true);
    } catch {
      notify.error('Failed to save override');
    }
  };

  const handleDeleteWidgetOverride = async (widgetId: string) => {
    if (!componentId || !assignmentId) return;
    try {
      await componentDashboardAssignmentApi.deleteWidgetOverride(componentId, assignmentId, widgetId);
      notify.success('Override removed');
      loadDashboard(true);
    } catch {
      notify.error('Failed to remove override');
    }
  };

  const activeWidgets = (dashboard?.widgets ?? []) as LiveWidgetData[];
  const visibleWidgets = activeWidgets.filter(w => !w.is_hidden);
  const hiddenCount = activeWidgets.length - visibleWidgets.length;
  const maxY = visibleWidgets.reduce((m, w) => Math.max(m, w.layout_y + w.height), 0);
  const gridHeight = maxY * ROW_H + (maxY - 1) * GAP;
  const dashboardName = dashboard?.dashboard_name ?? '';

  const overridePanelWidget = overridePanelWidgetId
    ? activeWidgets.find(w => w.widget_id === overridePanelWidgetId) ?? null
    : null;

  const overrideData = overridePanelWidget
    ? assignment?.overrides.find(o => o.widget_id === overridePanelWidgetId) ?? null
    : null;

  const summary = dashboard?.component_summary;

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
          <Button variant="secondary" className="mt-4" onClick={() => navigate(`/components/${componentId}/dashboards`)}>
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
          onClick={() => navigate(`/components/${componentId}/dashboards`)}
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
              <Layers className="w-4 h-4 text-neutral-400" />
              <span className="font-semibold text-neutral-900 capitalize">{component?.name || 'Component'}</span>
            </div>
            <div className="w-px h-4 bg-neutral-200" />
            <StatPill label="Projects" value={String(summary.project_count)} color="#AF52DE" />
            <StatPill label="Avg Health" value={`${summary.avg_project_health.toFixed(1)}%`} color="#30D158" />
            <StatPill label="Availability" value={`${summary.avg_availability.toFixed(1)}%`} color="#0A84FF" />
            <StatPill label="Alerts" value={String(summary.total_alerts)} color="#FF453A" />
            {hiddenCount > 0 && (
              <>
                <div className="w-px h-4 bg-neutral-200" />
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <X className="w-3 h-3" />
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
                projectName={dashboardName}
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
