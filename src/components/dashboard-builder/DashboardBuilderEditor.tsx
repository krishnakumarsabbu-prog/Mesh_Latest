import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Eye, EyeOff, Settings2, Trash2, Copy, Grid3x3, Maximize2, Minimize2, RotateCcw, Check, Loader as Loader2 } from 'lucide-react';
import { dashboardTemplateApi } from '@/lib/api';
import { DashboardTemplate, DashboardWidgetCreate, WidgetType, WidgetTypeMeta } from '@/types';
import { Button } from '@/components/ui/Button';
import { notify } from '@/store/notificationStore';
import { cn } from '@/lib/utils';
import { WidgetPalette } from './WidgetPalette';
import { WidgetConfigPanel } from './WidgetConfigPanel';
import { DashboardWidgetRenderer } from './DashboardWidgetRenderer';

const COLS = 12;
const ROW_H = 80;
const GAP = 8;

interface LocalWidget extends DashboardWidgetCreate {
  _localId: string;
}

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2)}`;
}

export function DashboardBuilderEditor() {
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);

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
      notify.success('Layout saved');
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
    if (selectedId === localId) setSelectedId(null);
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
    dragRef.current = {
      localId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLayoutX: w.layout_x,
      startLayoutY: w.layout_y,
      colW,
      rowH: ROW_H,
    };
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
    resizeRef.current = {
      localId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWidth: w.width,
      startHeight: w.height,
      colW,
      rowH: ROW_H,
    };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  };

  const onResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current) return;
    const { localId, startMouseX, startMouseY, startWidth, startHeight, colW, rowH } = resizeRef.current;
    const dx = Math.round((e.clientX - startMouseX) / colW);
    const dy = Math.round((e.clientY - startMouseY) / rowH);
    const wm = widgetTypes.find(t => {
      const w = widgets.find(x => x._localId === localId);
      return w && t.value === w.widget_type;
    });
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

  const gridHeight = Math.max(
    6,
    widgets.reduce((m, w) => Math.max(m, w.layout_y + w.height), 0) + 2
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-50">
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b"
        style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}
      >
        <button
          onClick={() => navigate('/dashboard-builder')}
          className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {template?.name || 'Dashboard Builder'}
          </h1>
          <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
            {template?.scope} · {template?.visibility} · v{template?.version} · {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowGrid(g => !g)}
            className={cn(
              'p-1.5 rounded-xl transition-all text-sm',
              showGrid ? 'bg-neutral-200 text-neutral-700' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600',
            )}
            title="Toggle grid"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPreviewMode(p => !p)}
            className={cn(
              'p-1.5 rounded-xl transition-all',
              previewMode ? 'bg-blue-100 text-blue-600' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600',
            )}
            title={previewMode ? 'Exit preview' : 'Preview'}
          >
            {previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowPalette(p => !p)}
            className="p-1.5 rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-all"
            title="Add widget"
          >
            <Plus className="w-4 h-4" />
          </button>
          {dirty && (
            <button
              onClick={load}
              className="p-1.5 rounded-xl text-neutral-400 hover:bg-neutral-100 transition-all"
              title="Discard changes"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!dirty}
            icon={dirty ? <Save className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          >
            {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showPalette && (
          <WidgetPalette
            widgetTypes={widgetTypes}
            onAdd={addWidget}
            onClose={() => setShowPalette(false)}
          />
        )}

        <div
          className="flex-1 overflow-auto p-4"
          onClick={() => { if (!previewMode) setSelectedId(null); }}
        >
          <div
            ref={gridRef}
            className="relative w-full"
            style={{ height: gridHeight * ROW_H + (gridHeight - 1) * GAP }}
          >
            {showGrid && !previewMode && (
              <GridOverlay cols={COLS} rows={gridHeight} colW={getColWidth()} rowH={ROW_H} gap={GAP} />
            )}

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
                  className={cn(
                    'absolute rounded-2xl overflow-hidden transition-shadow select-none',
                    !previewMode && 'cursor-grab active:cursor-grabbing',
                    isSelected && !previewMode && 'ring-2 ring-primary-500 ring-offset-1',
                  )}
                  style={{
                    left, top, width, height,
                    background: 'var(--app-surface-raised)',
                    border: isSelected && !previewMode ? undefined : '1px solid var(--app-border)',
                    boxShadow: isSelected ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                    zIndex: isSelected ? 10 : 1,
                    userSelect: 'none',
                  }}
                  onMouseDown={e => startDrag(e, w._localId)}
                  onClick={e => { e.stopPropagation(); if (!previewMode) setSelectedId(w._localId); }}
                >
                  <DashboardWidgetRenderer widget={w} preview={previewMode} />

                  {!previewMode && (
                    <>
                      <div
                        className={cn(
                          'absolute top-1.5 right-1.5 flex items-center gap-0.5 transition-opacity',
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                        style={{ opacity: isSelected ? 1 : undefined }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                      >
                        <WidgetActionButton onClick={() => setSelectedId(w._localId)} title="Configure">
                          <Settings2 className="w-3 h-3" />
                        </WidgetActionButton>
                        <WidgetActionButton onClick={() => cloneWidget(w._localId)} title="Clone">
                          <Copy className="w-3 h-3" />
                        </WidgetActionButton>
                        <WidgetActionButton onClick={() => removeWidget(w._localId)} title="Remove" danger>
                          <Trash2 className="w-3 h-3" />
                        </WidgetActionButton>
                      </div>

                      <div
                        className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize opacity-40 hover:opacity-80 transition-opacity"
                        onMouseDown={e => startResize(e, w._localId)}
                        style={{ zIndex: 20 }}
                      >
                        <svg viewBox="0 0 10 10" className="w-full h-full" style={{ color: 'var(--text-muted)' }}>
                          <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {widgets.length === 0 && !previewMode && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                style={{ top: '20%' }}
              >
                <div className="text-center opacity-30">
                  <Grid3x3 className="w-12 h-12 mx-auto mb-3 text-neutral-400" />
                  <p className="text-sm font-medium text-neutral-500">Empty canvas</p>
                  <p className="text-xs text-neutral-400 mt-1">Click + to add widgets</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {!previewMode && selectedWidget && (
          <WidgetConfigPanel
            widget={selectedWidget}
            widgetTypes={widgetTypes}
            templateScope={template?.scope || 'project'}
            onChange={patch => updateWidget(selectedWidget._localId, patch)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function WidgetActionButton({ onClick, title, danger, children }: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1 rounded-lg transition-all',
        danger
          ? 'bg-white/90 text-red-400 hover:bg-red-50 hover:text-red-600'
          : 'bg-white/90 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700',
      )}
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {children}
    </button>
  );
}

function GridOverlay({ cols, rows, colW, rowH, gap }: {
  cols: number; rows: number; colW: number; rowH: number; gap: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06 }}>
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((_, col) => (
          <div
            key={`${row}-${col}`}
            className="absolute rounded-lg bg-neutral-400"
            style={{
              left: col * (colW + gap),
              top: row * (rowH + gap),
              width: colW,
              height: rowH,
            }}
          />
        ))
      )}
    </div>
  );
}
