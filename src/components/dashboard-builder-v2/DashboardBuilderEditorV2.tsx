import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, EyeOff, Grid3x3, Maximize2, Minimize2, RotateCcw, Check, Loader as Loader2, Plus, Settings2, Share2, Monitor, Smartphone, Tablet, Copy, Trash2, ZapOff } from 'lucide-react';
import { dashboardTemplateApi } from '@/lib/api';
import { DashboardTemplate, DashboardWidgetCreate, WidgetType, WidgetTypeMeta } from '@/types';
import { notify } from '@/store/notificationStore';
import { cn } from '@/lib/utils';
import { FuturisticWidgetPalette } from './FuturisticWidgetPalette';
import { FuturisticCanvasSettings } from './FuturisticCanvasSettings';
import { FuturisticEmptyCanvas } from './FuturisticEmptyCanvas';
import { DashboardWidgetRenderer } from '../dashboard-builder/DashboardWidgetRenderer';
import { WidgetConfigPanel } from '../dashboard-builder/WidgetConfigPanel';

const COLS = 12;
const ROW_H = 80;
const GAP = 8;

interface LocalWidget extends DashboardWidgetCreate {
  _localId: string;
}

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2)}`;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 0,
  tablet: 768,
  mobile: 375,
};

export function DashboardBuilderEditorV2() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<DashboardTemplate | null>(null);
  const [widgets, setWidgets] = useState<LocalWidget[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<WidgetTypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    localId: string;
    startMouseX: number;
    startMouseY: number;
    startLayoutX: number;
    startLayoutY: number;
    colW: number;
    rowH: number;
  } | null>(null);
  const resizeRef = useRef<{
    localId: string;
    startMouseX: number;
    startMouseY: number;
    startWidth: number;
    startHeight: number;
    colW: number;
    rowH: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const [tmplRes, wtRes] = await Promise.all([
        dashboardTemplateApi.get(templateId),
        dashboardTemplateApi.widgetTypes(),
      ]);
      setTemplate(tmplRes.data);
      setWidgetTypes(wtRes.data);
      const localWidgets: LocalWidget[] = (tmplRes.data.widgets || []).map((w: DashboardWidgetCreate & { id?: string }) => ({
        ...w,
        _localId: w.id || makeLocalId(),
        metric_bindings: w.metric_bindings || [],
      }));
      setWidgets(localWidgets);
      setDirty(false);
    } catch {
      notify.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  const getColWidth = useCallback(() => {
    if (!gridRef.current) return 80;
    return (gridRef.current.offsetWidth - (COLS - 1) * GAP) / COLS;
  }, []);

  const handleSave = async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      const payload = widgets.map((w, i) => ({
        id: w.id,
        widget_type: w.widget_type,
        title: w.title,
        subtitle: w.subtitle,
        layout_x: w.layout_x,
        layout_y: w.layout_y,
        width: w.width,
        height: w.height,
        chart_config: w.chart_config,
        threshold_config: w.threshold_config,
        display_config: w.display_config,
        sort_order: i,
        metric_bindings: w.metric_bindings || [],
      }));
      const res = await dashboardTemplateApi.saveLayout(templateId, { widgets: payload });
      setTemplate(res.data);
      const saved: LocalWidget[] = (res.data.widgets || []).map((w: DashboardWidgetCreate & { id?: string }) => ({
        ...w,
        _localId: w.id || makeLocalId(),
        metric_bindings: w.metric_bindings || [],
      }));
      setWidgets(saved);
      setDirty(false);
      notify.success('Dashboard saved successfully');
    } catch {
      notify.error('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const addWidget = (type: WidgetTypeMeta) => {
    const maxY = widgets.reduce((m, w) => Math.max(m, w.layout_y + w.height), 0);
    const newW: LocalWidget = {
      _localId: makeLocalId(),
      widget_type: type.value as WidgetType,
      title: type.label,
      subtitle: '',
      layout_x: 0,
      layout_y: maxY,
      width: type.default_width,
      height: type.default_height,
      chart_config: {},
      threshold_config: {},
      display_config: { show_legend: true, time_range: '1h' },
      sort_order: widgets.length,
      metric_bindings: [],
    };
    setWidgets(prev => [...prev, newW]);
    setSelectedId(newW._localId);
    setDirty(true);
    setShowPalette(false);
  };

  const removeWidget = (localId: string) => {
    setWidgets(prev => prev.filter(w => w._localId !== localId));
    if (selectedId === localId) { setSelectedId(null); setShowConfigPanel(false); }
    setDirty(true);
  };

  const cloneWidget = (localId: string) => {
    const src = widgets.find(w => w._localId === localId);
    if (!src) return;
    const cloned: LocalWidget = {
      ...src,
      id: undefined,
      _localId: makeLocalId(),
      layout_y: src.layout_y + src.height,
      layout_x: src.layout_x,
      title: `${src.title} (copy)`,
    };
    setWidgets(prev => [...prev, cloned]);
    setDirty(true);
  };

  const updateWidget = (localId: string, patch: Partial<LocalWidget>) => {
    setWidgets(prev => prev.map(w => w._localId === localId ? { ...w, ...patch } : w));
    setDirty(true);
  };

  const startDrag = (e: React.MouseEvent, localId: string) => {
    if (previewMode) return;
    e.preventDefault();
    const w = widgets.find(x => x._localId === localId);
    if (!w) return;
    const colW = getColWidth();
    dragRef.current = { localId, startMouseX: e.clientX, startMouseY: e.clientY, startLayoutX: w.layout_x, startLayoutY: w.layout_y, colW, rowH: ROW_H };
    setSelectedId(localId);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };

  const onDragMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const { localId, startMouseX, startMouseY, startLayoutX, startLayoutY, colW, rowH } = dragRef.current;
    const dx = Math.round((e.clientX - startMouseX) / colW);
    const dy = Math.round((e.clientY - startMouseY) / rowH);
    const w = widgets.find(x => x._localId === localId);
    if (!w) return;
    const newX = Math.max(0, Math.min(COLS - w.width, startLayoutX + dx));
    const newY = Math.max(0, startLayoutY + dy);
    setWidgets(prev => prev.map(x => x._localId === localId ? { ...x, layout_x: newX, layout_y: newY } : x));
  }, [widgets]);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDirty(true);
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }, [onDragMove]);

  const startResize = (e: React.MouseEvent, localId: string) => {
    if (previewMode) return;
    e.preventDefault();
    e.stopPropagation();
    const w = widgets.find(x => x._localId === localId);
    if (!w) return;
    const colW = getColWidth();
    resizeRef.current = { localId, startMouseX: e.clientX, startMouseY: e.clientY, startWidth: w.width, startHeight: w.height, colW, rowH: ROW_H };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  };

  const onResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current) return;
    const { localId, startMouseX, startMouseY, startWidth, startHeight, colW, rowH } = resizeRef.current;
    const dx = Math.round((e.clientX - startMouseX) / colW);
    const dy = Math.round((e.clientY - startMouseY) / rowH);
    const wm = widgetTypes.find(t => { const w = widgets.find(x => x._localId === localId); return w && t.value === w.widget_type; });
    const minW = wm?.min_width || 1;
    const minH = wm?.min_height || 1;
    const newW = Math.max(minW, Math.min(COLS, startWidth + dx));
    const newH = Math.max(minH, startHeight + dy);
    setWidgets(prev => prev.map(x => x._localId === localId ? { ...x, width: newW, height: newH } : x));
  }, [widgets, widgetTypes]);

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
    setDirty(true);
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  }, [onResizeMove]);

  const selectedWidget = widgets.find(w => w._localId === selectedId) || null;

  const gridHeight = Math.max(8, widgets.reduce((m, w) => Math.max(m, w.layout_y + w.height), 0) + 2);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: 'linear-gradient(135deg, #060a14 0%, #0a0f1c 100%)' }}
      >
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: 'rgba(14,165,233,0.1)',
              border: '1px solid rgba(56,189,248,0.2)',
              boxShadow: '0 0 32px rgba(14,165,233,0.15)',
            }}
          >
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#38bdf8' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'rgba(148,163,184,0.7)' }}>Loading dashboard canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: '#060a14' }}
    >
      {/* Top toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{
          background: 'rgba(10, 15, 28, 0.98)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.1)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Back + title */}
        <button
          onClick={() => navigate('/dashboard-builder')}
          className="flex items-center gap-1.5 p-1.5 rounded-xl transition-all mr-1"
          style={{ color: 'rgba(148,163,184,0.6)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.6)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div
          className="w-px h-6"
          style={{ background: 'rgba(56,189,248,0.1)' }}
        />

        <div className="flex items-center gap-2 mr-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(56,189,248,0.2)' }}
          >
            <Grid3x3 className="w-3 h-3" style={{ color: '#38bdf8' }} />
          </div>
          <div>
            <h1 className="text-sm font-bold truncate max-w-48" style={{ color: '#f1f5f9' }}>
              {template?.name || 'Dashboard Builder'}
            </h1>
            <p className="text-[10px] leading-none" style={{ color: 'rgba(148,163,184,0.4)' }}>
              {template?.scope} · v{template?.version} · {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {dirty && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Unsaved changes
          </div>
        )}

        <div className="flex-1" />

        {/* Device preview */}
        <div
          className="flex items-center gap-0.5 p-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {([['desktop', <Monitor className="w-3.5 h-3.5" key="d" />], ['tablet', <Tablet className="w-3.5 h-3.5" key="t" />], ['mobile', <Smartphone className="w-3.5 h-3.5" key="m" />]] as [DeviceMode, React.ReactNode][]).map(([mode, icon]) => (
            <button
              key={mode}
              onClick={() => setDeviceMode(mode)}
              className="p-1.5 rounded-lg transition-all"
              style={
                deviceMode === mode
                  ? { background: 'rgba(14,165,233,0.2)', color: '#38bdf8' }
                  : { color: 'rgba(148,163,184,0.4)' }
              }
              title={mode.charAt(0).toUpperCase() + mode.slice(1)}
            >
              {icon}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* Grid toggle */}
          <ToolbarButton
            onClick={() => setShowGrid(g => !g)}
            active={showGrid}
            title="Toggle grid"
          >
            <Grid3x3 className="w-3.5 h-3.5" />
          </ToolbarButton>

          {/* Preview */}
          <ToolbarButton
            onClick={() => setPreviewMode(p => !p)}
            active={previewMode}
            title={previewMode ? 'Exit preview' : 'Preview'}
            activeColor="#0ea5e9"
          >
            {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </ToolbarButton>

          {/* Fullscreen */}
          <ToolbarButton onClick={() => setIsFullscreen(f => !f)} title="Fullscreen">
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </ToolbarButton>

          {/* Discard */}
          {dirty && (
            <ToolbarButton onClick={load} title="Discard changes">
              <RotateCcw className="w-3.5 h-3.5" />
            </ToolbarButton>
          )}
        </div>

        <div className="w-px h-6" style={{ background: 'rgba(56,189,248,0.1)' }} />

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(56,189,248,0.25)'; (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.7)'; }}
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={
              dirty
                ? { background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)', color: '#fff', boxShadow: '0 0 16px rgba(14,165,233,0.3)' }
                : { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981' }
            }
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : dirty ? (
              <Save className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving...' : dirty ? 'Save Draft' : 'Saved'}
          </button>

          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.8), rgba(6,182,212,0.8))', color: '#fff' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            Publish
          </button>
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(s => !s)}
          className="p-2 rounded-xl transition-all"
          style={showSettings ? { background: 'rgba(14,165,233,0.15)', color: '#38bdf8' } : { color: 'rgba(148,163,184,0.5)' }}
          onMouseEnter={e => { if (!showSettings) { (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; } }}
          onMouseLeave={e => { if (!showSettings) { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.5)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; } }}
          title="Canvas settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Widget palette toggle button + panel */}
        {!previewMode && (
          <div
            className="flex flex-col flex-shrink-0"
            style={{ borderRight: showPalette ? 'none' : '1px solid rgba(56, 189, 248, 0.08)' }}
          >
            {!showPalette && (
              <div className="flex flex-col items-center gap-3 px-2 py-4">
                <button
                  onClick={() => setShowPalette(true)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}
                  title="Open widget library"
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(14,165,233,0.3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {!previewMode && showPalette && (
          <FuturisticWidgetPalette
            widgetTypes={widgetTypes}
            onAdd={addWidget}
            onClose={() => setShowPalette(false)}
          />
        )}

        {/* Canvas */}
        <div
          className="flex-1 overflow-auto"
          style={{ background: '#060a14' }}
          onClick={() => { if (!previewMode) { setSelectedId(null); setShowConfigPanel(false); } }}
        >
          <div
            className="min-h-full"
            style={{
              padding: isFullscreen ? 0 : 24,
              maxWidth: DEVICE_WIDTHS[deviceMode] ? DEVICE_WIDTHS[deviceMode] + 48 : '100%',
              margin: DEVICE_WIDTHS[deviceMode] ? '0 auto' : '0',
              transition: 'max-width 0.3s ease',
            }}
          >
            <div
              ref={gridRef}
              className="relative w-full"
              style={{
                minHeight: gridHeight * ROW_H + (gridHeight - 1) * GAP,
                borderRadius: 16,
                overflow: widgets.length === 0 ? 'hidden' : 'visible',
                border: widgets.length === 0 ? '1px solid rgba(56,189,248,0.1)' : 'none',
                background: widgets.length === 0 ? 'rgba(10,15,28,0.8)' : 'transparent',
              }}
            >
              {/* Grid overlay */}
              {showGrid && !previewMode && widgets.length > 0 && (
                <FuturisticGridOverlay cols={COLS} rows={gridHeight} colW={getColWidth()} rowH={ROW_H} gap={GAP} />
              )}

              {/* Empty canvas */}
              {widgets.length === 0 && !previewMode && (
                <div className="absolute inset-0" style={{ height: Math.max(480, gridHeight * ROW_H + (gridHeight - 1) * GAP) }}>
                  <FuturisticEmptyCanvas onAddFirstWidget={() => setShowPalette(true)} />
                </div>
              )}

              {/* Widgets */}
              {widgets.map(w => {
                const colW = getColWidth();
                const left = w.layout_x * (colW + GAP);
                const top = w.layout_y * (ROW_H + GAP);
                const width = w.width * colW + (w.width - 1) * GAP;
                const height = w.height * ROW_H + (w.height - 1) * GAP;
                const isSelected = selectedId === w._localId;

                return (
                  <div
                    key={w._localId}
                    className={cn('absolute select-none transition-all duration-100')}
                    style={{
                      left, top, width, height,
                      background: 'rgba(10, 15, 28, 0.9)',
                      border: isSelected && !previewMode
                        ? '1.5px solid rgba(56,189,248,0.6)'
                        : '1px solid rgba(56,189,248,0.1)',
                      borderRadius: 14,
                      boxShadow: isSelected
                        ? '0 0 0 3px rgba(14,165,233,0.12), 0 8px 32px rgba(0,0,0,0.4), 0 0 24px rgba(14,165,233,0.08)'
                        : '0 4px 16px rgba(0,0,0,0.3)',
                      zIndex: isSelected ? 10 : 1,
                      cursor: previewMode ? 'default' : 'grab',
                      backdropFilter: 'blur(8px)',
                    }}
                    onMouseDown={e => startDrag(e, w._localId)}
                    onClick={e => { e.stopPropagation(); if (!previewMode) { setSelectedId(w._localId); setShowConfigPanel(true); } }}
                    onMouseEnter={e => {
                      if (!isSelected && !previewMode) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56,189,248,0.25)';
                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 3px rgba(14,165,233,0.05), 0 8px 32px rgba(0,0,0,0.4)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected && !previewMode) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56,189,248,0.1)';
                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
                      }
                    }}
                  >
                    <DashboardWidgetRenderer widget={w} preview={previewMode} />

                    {!previewMode && isSelected && (
                      <>
                        <div
                          className="absolute top-2 right-2 flex items-center gap-0.5"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                        >
                          <WidgetActionBtn onClick={() => { setSelectedId(w._localId); setShowConfigPanel(true); }} title="Configure" color="#38bdf8">
                            <Settings2 className="w-3 h-3" />
                          </WidgetActionBtn>
                          <WidgetActionBtn onClick={() => cloneWidget(w._localId)} title="Clone" color="#10b981">
                            <Copy className="w-3 h-3" />
                          </WidgetActionBtn>
                          <WidgetActionBtn onClick={() => removeWidget(w._localId)} title="Remove" color="#ef4444">
                            <Trash2 className="w-3 h-3" />
                          </WidgetActionBtn>
                        </div>

                        <div
                          className="absolute bottom-1.5 right-1.5 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity"
                          onMouseDown={e => startResize(e, w._localId)}
                          style={{ zIndex: 20 }}
                        >
                          <svg viewBox="0 0 10 10" className="w-full h-full" style={{ color: 'rgba(56,189,248,0.7)' }}>
                            <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Preivew empty */}
              {widgets.length === 0 && previewMode && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <ZapOff className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(148,163,184,0.2)' }} />
                    <p className="text-xs" style={{ color: 'rgba(148,163,184,0.3)' }}>No widgets to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Config panel (right, widget config) */}
        {!previewMode && showConfigPanel && selectedWidget && (
          <div style={{ background: 'rgba(10, 15, 28, 0.95)', borderLeft: '1px solid rgba(56,189,248,0.1)' }}>
            <WidgetConfigPanel
              widget={selectedWidget}
              widgetTypes={widgetTypes}
              templateScope={template?.scope || 'project'}
              onChange={patch => updateWidget(selectedWidget._localId, patch)}
              onClose={() => { setShowConfigPanel(false); setSelectedId(null); }}
            />
          </div>
        )}

        {/* Canvas settings panel */}
        {showSettings && (
          <FuturisticCanvasSettings
            template={template}
            onUpdateName={(name) => {
              if (template) setTemplate({ ...template, name });
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick, active, title, activeColor = '#38bdf8', children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  activeColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 rounded-xl transition-all"
      style={active
        ? { background: `${activeColor}18`, color: activeColor, border: `1px solid ${activeColor}28` }
        : { color: 'rgba(148,163,184,0.5)', border: '1px solid transparent' }
      }
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9';
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.5)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }
      }}
    >
      {children}
    </button>
  );
}

function WidgetActionBtn({ onClick, title, color, children }: {
  onClick: () => void;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg transition-all"
      style={{
        background: 'rgba(10,15,28,0.9)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(148,163,184,0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.color = color;
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}40`;
        (e.currentTarget as HTMLButtonElement).style.background = `${color}10`;
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 8px ${color}20`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.7)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,15,28,0.9)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
}

function FuturisticGridOverlay({ cols, rows, colW, rowH, gap }: {
  cols: number; rows: number; colW: number; rowH: number; gap: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((_, col) => (
          <div
            key={`${row}-${col}`}
            className="absolute rounded-lg"
            style={{
              left: col * (colW + gap),
              top: row * (rowH + gap),
              width: colW,
              height: rowH,
              border: '1px solid rgba(56,189,248,0.05)',
              background: 'rgba(56,189,248,0.01)',
            }}
          />
        ))
      )}
    </div>
  );
}
