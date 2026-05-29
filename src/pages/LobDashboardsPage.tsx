import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Plus, Star, StarOff, Trash2, GripVertical, Eye,
  ChevronRight, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle,
  Info, RefreshCw, Settings, ArrowLeft, X, Clock, Shield,
  Building2, TrendingUp, Activity, Layers, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { lobDashboardAssignmentApi, dashboardTemplateApi, lobApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import {
  LobAssignmentResponse, DashboardTemplate, LobAssignmentValidationResult, Lob,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

const REFRESH_OPTIONS = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
];

const SCOPE_COLORS: Record<string, string> = {
  project: '#0A84FF',
  team: '#30D158',
  lob: '#FF9F0A',
  global: '#636366',
};

const LOB_AGGREGATE_KEYS = [
  'avg_team_health', 'avg_project_health', 'total_projects',
  'critical_projects_count', 'critical_teams_count', 'portfolio_availability',
  'total_incidents', 'sla_breach_rate', 'team_count',
];

export function LobDashboardsPage() {
  const { lobId } = useParams<{ lobId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();

  const [lob, setLob] = useState<Lob | null>(null);
  const [assignments, setAssignments] = useState<LobAssignmentResponse[]>([]);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [assignDisplayName, setAssignDisplayName] = useState('');
  const [assignRefresh, setAssignRefresh] = useState(300);
  const [assignAsDefault, setAssignAsDefault] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [validationResult, setValidationResult] = useState<LobAssignmentValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<LobAssignmentResponse | null>(null);
  const [removing, setRemoving] = useState(false);

  const [editTarget, setEditTarget] = useState<LobAssignmentResponse | null>(null);
  const [editName, setEditName] = useState('');
  const [editRefresh, setEditRefresh] = useState(300);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!lobId) return;
    setLoading(true);
    try {
      const [lobRes, assignRes, allTemplatesRes] = await Promise.all([
        lobApi.get(lobId),
        lobDashboardAssignmentApi.list(lobId),
        dashboardTemplateApi.list(),
      ]);
      setLob(lobRes.data);
      setAssignments(assignRes.data);
      setTemplates(allTemplatesRes.data);
      setPageTitle(lobRes.data.name + ' — Dashboards');
      setBreadcrumbs([
        { label: 'LOBs', href: '/lobs' },
        { label: lobRes.data.name, href: `/lobs/${lobId}` },
        { label: 'Dashboards' },
      ]);
    } catch {
      notify.error('Failed to load LOB dashboards');
    } finally {
      setLoading(false);
    }
  }, [lobId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const assignedTemplateIds = new Set(assignments.map(a => a.template_id));
  const availableTemplates = templates.filter(t => !assignedTemplateIds.has(t.id));
  const lobScopedTemplates = availableTemplates.filter(t => t.scope === 'lob' || t.scope === 'global');
  const otherTemplates = availableTemplates.filter(t => t.scope !== 'lob' && t.scope !== 'global');

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setValidationResult(null);
    if (!templateId || !lobId) return;
    setValidating(true);
    try {
      const res = await lobDashboardAssignmentApi.validate(lobId, templateId);
      setValidationResult(res.data);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleAssign = async () => {
    if (!lobId || !selectedTemplateId) return;
    if (validationResult && validationResult.errors.length > 0) return;
    setAssigning(true);
    try {
      await lobDashboardAssignmentApi.assign(lobId, {
        template_id: selectedTemplateId,
        display_name: assignDisplayName || null,
        is_default: assignAsDefault,
        refresh_interval_seconds: assignRefresh,
      });
      notify.success('Dashboard assigned to LOB');
      setAssignModalOpen(false);
      setSelectedTemplateId('');
      setAssignDisplayName('');
      setAssignAsDefault(false);
      setAssignRefresh(300);
      setValidationResult(null);
      fetchAll();
    } catch {
      notify.error('Failed to assign dashboard');
    } finally {
      setAssigning(false);
    }
  };

  const handleSetDefault = async (assignment: LobAssignmentResponse) => {
    if (!lobId) return;
    try {
      await lobDashboardAssignmentApi.setDefault(lobId, assignment.id);
      notify.success(`"${assignment.display_name || assignment.template_name}" set as default`);
      fetchAll();
    } catch {
      notify.error('Failed to set default');
    }
  };

  const handleRemove = async () => {
    if (!lobId || !removeTarget) return;
    setRemoving(true);
    try {
      await lobDashboardAssignmentApi.remove(lobId, removeTarget.id);
      notify.success('Dashboard removed');
      setRemoveTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to remove dashboard');
    } finally {
      setRemoving(false);
    }
  };

  const handleEdit = (a: LobAssignmentResponse) => {
    setEditTarget(a);
    setEditName(a.display_name || '');
    setEditRefresh(a.refresh_interval_seconds);
  };

  const handleSaveEdit = async () => {
    if (!lobId || !editTarget) return;
    setSaving(true);
    try {
      await lobDashboardAssignmentApi.update(lobId, editTarget.id, {
        display_name: editName || null,
        refresh_interval_seconds: editRefresh,
      });
      notify.success('Dashboard updated');
      setEditTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to update dashboard');
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = async (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex || !lobId) return;
    const reordered = [...assignments];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setAssignments(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
    try {
      await lobDashboardAssignmentApi.reorder(lobId, reordered.map(a => a.id));
    } catch {
      notify.error('Failed to reorder');
      fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-24 bg-neutral-100 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-neutral-100 rounded-2xl animate-pulse" />)}
        </div>
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-neutral-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  const lobColor = lob?.color || '#FF9F0A';
  const defaultAssignment = assignments.find(a => a.is_default);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/lobs/${lobId}`)}
          className="p-2 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div
          className="flex items-center gap-4 flex-1 px-5 py-3 rounded-2xl"
          style={{ background: lobColor + '10', border: `1px solid ${lobColor}20` }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: lobColor }}
          >
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-neutral-900 truncate">{lob?.name} — Portfolio Dashboards</h1>
            <p className="text-xs text-neutral-500">Executive roll-up dashboards rendered from LOB aggregate metrics</p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAssignModalOpen(true)}
          disabled={availableTemplates.length === 0}
        >
          Assign Template
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'Assigned Dashboards', value: assignments.length, icon: LayoutDashboard, color: '#0A84FF',
            sub: assignments.length === 0 ? 'None assigned' : `${assignments.length} total`,
          },
          {
            label: 'Default Dashboard',
            value: defaultAssignment?.display_name || defaultAssignment?.template_name || 'None set',
            icon: Star, color: '#FF9F0A',
            sub: defaultAssignment ? 'Active default' : 'Set one as default',
            isText: true,
          },
          {
            label: 'LOB Scope Templates', value: templates.filter(t => t.scope === 'lob').length,
            icon: Layers, color: lobColor,
            sub: `${templates.filter(t => t.scope === 'global').length} global templates`,
          },
        ].map(({ label, value, icon: Icon, color, sub, isText }) => (
          <div key={label} className="bg-white rounded-2xl border border-neutral-100 p-5 flex items-center gap-4 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: color + '15' }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              {isText ? (
                <p className="text-sm font-semibold text-neutral-900 truncate">{value}</p>
              ) : (
                <p className="text-2xl font-bold text-neutral-900">{value}</p>
              )}
              <p className="text-xs text-neutral-400 mt-0.5">{label}</p>
              <p className="text-[10px] text-neutral-300 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Aggregate metrics hint */}
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: lobColor + '08', border: `1px solid ${lobColor}20` }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: lobColor + '18' }}>
          <Sparkles className="w-4 h-4" style={{ color: lobColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-1" style={{ color: lobColor }}>Available LOB Portfolio Aggregate Metrics</p>
          <div className="flex flex-wrap gap-1.5">
            {LOB_AGGREGATE_KEYS.map(k => (
              <code key={k} className="text-xs px-2 py-0.5 rounded-lg font-mono" style={{ background: lobColor + '15', color: lobColor }}>
                {k}
              </code>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: lobColor + 'aa' }}>
            Widget metric bindings with scope <code style={{ background: lobColor + '20' }} className="px-1 rounded">lob_aggregate</code> resolve against these pre-computed portfolio rollup values.
          </p>
        </div>
      </div>

      {/* Assignments */}
      {assignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-16 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: lobColor + '12' }}
          >
            <LayoutDashboard className="w-8 h-8" style={{ color: lobColor }} />
          </div>
          <h3 className="text-base font-semibold text-neutral-700 mb-2">No LOB Dashboards Assigned</h3>
          <p className="text-sm text-neutral-400 mb-6 max-w-sm mx-auto leading-relaxed">
            Assign dashboard templates scoped to this LOB. Widgets bound to{' '}
            <code className="px-1.5 py-0.5 bg-neutral-100 rounded text-xs">lob_aggregate</code>{' '}
            metrics will render live portfolio/executive roll-up data across all teams and projects.
          </p>
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setAssignModalOpen(true)}
            disabled={availableTemplates.length === 0}
          >
            Assign Template
          </Button>
          {availableTemplates.length === 0 && (
            <p className="text-xs text-neutral-400 mt-3">
              No templates available.{' '}
              <button onClick={() => navigate('/dashboard-builder')} className="text-primary-600 hover:underline">
                Create an LOB-scoped template in Dashboard Builder
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400 flex items-center gap-1.5">
              <GripVertical className="w-3.5 h-3.5" />
              Drag to reorder dashboards
            </p>
            <p className="text-xs text-neutral-400">{assignments.length} dashboard{assignments.length !== 1 ? 's' : ''}</p>
          </div>
          <AnimatePresence>
            {assignments.map((assignment, index) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                index={index}
                lobColor={lobColor}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                onSetDefault={handleSetDefault}
                onEdit={handleEdit}
                onRemove={setRemoveTarget}
                onOpen={(a) => navigate(`/lobs/${lobId}/dashboards/${a.id}`)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Assign Modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => { setAssignModalOpen(false); setValidationResult(null); setSelectedTemplateId(''); }}
        title="Assign LOB Portfolio Dashboard Template"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAssignModalOpen(false); setValidationResult(null); setSelectedTemplateId(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              loading={assigning}
              disabled={!selectedTemplateId || (validationResult?.errors.length ?? 0) > 0}
            >
              Assign Dashboard
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="p-3 rounded-xl border text-xs flex items-start gap-2" style={{ background: lobColor + '08', borderColor: lobColor + '25', color: lobColor }}>
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              LOB dashboards render widgets using <strong>LOB aggregate metrics</strong> computed as portfolio roll-ups across
              all teams and projects. Use templates with{' '}
              <code className="px-1 rounded" style={{ background: lobColor + '20' }}>lob_aggregate</code>{' '}
              metric bindings for best results.
            </span>
          </div>

          {lobScopedTemplates.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Recommended — LOB / Global Scope</label>
              <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
                {lobScopedTemplates.map(t => (
                  <TemplateOption key={t.id} template={t} selected={selectedTemplateId === t.id} onSelect={handleTemplateSelect} />
                ))}
              </div>
            </div>
          )}

          {otherTemplates.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Other Templates</label>
              <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto pr-1">
                {otherTemplates.map(t => (
                  <TemplateOption key={t.id} template={t} selected={selectedTemplateId === t.id} onSelect={handleTemplateSelect} />
                ))}
              </div>
            </div>
          )}

          {availableTemplates.length === 0 && (
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-sm text-neutral-400 text-center">
              All templates are already assigned to this LOB.
            </div>
          )}

          {validating && (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Validating template against LOB aggregate metrics...
            </div>
          )}

          {validationResult && !validating && (
            <LobValidationResultPanel result={validationResult} />
          )}

          {selectedTemplateId && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Display Name <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  placeholder="Custom name for this LOB dashboard..."
                  value={assignDisplayName}
                  onChange={e => setAssignDisplayName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Auto-Refresh Interval</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400"
                    value={assignRefresh}
                    onChange={e => setAssignRefresh(Number(e.target.value))}
                  >
                    {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setAssignAsDefault(v => !v)}
                      className={cn('w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0', assignAsDefault ? 'bg-primary-500' : 'bg-neutral-200')}
                    >
                      <div className={cn('w-4 h-4 bg-white rounded-full shadow-sm mt-0.5 transition-transform', assignAsDefault ? 'translate-x-4.5' : 'translate-x-0.5')} />
                    </div>
                    <span className="text-sm text-neutral-700">Set as default</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit LOB Dashboard Assignment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button loading={saving} onClick={handleSaveEdit}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Display Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder={editTarget?.template_name || 'Dashboard name...'}
              value={editName}
              onChange={e => setEditName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Auto-Refresh Interval</label>
            <select
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400"
              value={editRefresh}
              onChange={e => setEditRefresh(Number(e.target.value))}
            >
              {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove LOB Dashboard"
        message={`Remove "${removeTarget?.display_name || removeTarget?.template_name}" from this LOB? Widget overrides will also be deleted.`}
        confirmLabel="Remove"
        variant="danger"
        loading={removing}
      />
    </div>
  );
}

function TemplateOption({ template, selected, onSelect }: {
  template: DashboardTemplate;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const scopeColor = SCOPE_COLORS[template.scope] || '#636366';
  return (
    <button
      onClick={() => onSelect(template.id)}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all',
        selected ? 'border-primary-400 bg-primary-50 shadow-sm' : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: scopeColor }} />
          <span className="font-medium text-sm text-neutral-900 truncate">{template.name}</span>
          {template.category && <span className="text-xs text-neutral-400 shrink-0">· {template.category}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400 flex-shrink-0">
          <span>{template.widget_count}w</span>
          <span className="capitalize px-1.5 py-0.5 rounded-full" style={{ backgroundColor: scopeColor + '15', color: scopeColor }}>
            {template.scope}
          </span>
        </div>
      </div>
      {template.description && <p className="text-xs text-neutral-400 mt-1 truncate">{template.description}</p>}
    </button>
  );
}

function AssignmentCard({
  assignment, index, lobColor, isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onSetDefault, onEdit, onRemove, onOpen,
}: {
  assignment: LobAssignmentResponse;
  index: number;
  lobColor: string;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  onDragEnd: () => void;
  onSetDefault: (a: LobAssignmentResponse) => void;
  onEdit: (a: LobAssignmentResponse) => void;
  onRemove: (a: LobAssignmentResponse) => void;
  onOpen: (a: LobAssignmentResponse) => void;
}) {
  const displayName = assignment.display_name || assignment.template_name || 'Unnamed Dashboard';
  const scopeColor = SCOPE_COLORS[assignment.template_scope || 'lob'] || lobColor;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e as unknown as React.DragEvent, index)}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      className={cn(
        'group bg-white rounded-2xl border transition-all overflow-hidden',
        isDragOver ? 'border-primary-400 shadow-xl scale-[1.01]' : 'border-neutral-100 shadow-sm hover:border-neutral-200 hover:shadow-md',
        isDragging ? 'opacity-40' : 'opacity-100',
      )}
    >
      <div
        className="h-1 w-full transition-all"
        style={{ background: assignment.is_default ? `linear-gradient(90deg, ${scopeColor}, ${scopeColor}60)` : 'transparent' }}
      />
      <div className="flex items-center gap-3 p-4">
        <div className="cursor-grab active:cursor-grabbing p-1.5 text-neutral-200 hover:text-neutral-400 transition-colors flex-shrink-0 rounded-lg hover:bg-neutral-50">
          <GripVertical className="w-4 h-4" />
        </div>

        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ background: scopeColor + '15' }}
        >
          <Activity className="w-5 h-5" style={{ color: scopeColor }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-neutral-900">{displayName}</span>
            {assignment.is_default && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold border border-amber-200">
                <Star className="w-2.5 h-2.5" />
                Default
              </span>
            )}
            {assignment.display_name && (
              <span className="text-xs text-neutral-400 font-normal">({assignment.template_name})</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400 flex-wrap">
            <span className="flex items-center gap-1">
              <LayoutDashboard className="w-3 h-3" />
              {assignment.widget_count} widgets
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {REFRESH_OPTIONS.find(o => o.value === assignment.refresh_interval_seconds)?.label || `${assignment.refresh_interval_seconds}s`}
            </span>
            <span
              className="capitalize px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: scopeColor + '15', color: scopeColor }}
            >
              {assignment.template_scope || 'lob'}
            </span>
            {assignment.overrides.length > 0 && (
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {assignment.overrides.length} override{assignment.overrides.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onSetDefault(assignment)}
            className={cn(
              'p-2 rounded-xl transition-all',
              assignment.is_default ? 'text-amber-400 bg-amber-50' : 'text-neutral-300 hover:text-amber-400 hover:bg-amber-50'
            )}
            title={assignment.is_default ? 'Default dashboard' : 'Set as default'}
          >
            {assignment.is_default ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onEdit(assignment)}
            className="p-2 rounded-xl text-neutral-300 hover:text-primary-500 hover:bg-primary-50 transition-all"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(assignment)}
            className="p-2 rounded-xl text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpen(assignment)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold transition-all shadow-sm"
            style={{ background: lobColor, boxShadow: `0 2px 8px ${lobColor}40` }}
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
        </div>

        <button
          onClick={() => onOpen(assignment)}
          className="p-2 rounded-xl text-neutral-200 hover:text-neutral-400 transition-colors ml-1 group-hover:opacity-0 opacity-100"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function LobValidationResultPanel({ result }: { result: LobAssignmentValidationResult }) {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 text-sm">
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
        <div>
          <span className="font-medium">Template is compatible with LOB aggregate metrics.</span>
          {result.total_bindings > 0 && (
            <span className="ml-1 text-emerald-600">{result.satisfied_bindings}/{result.total_bindings} bindings satisfied.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {result.errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">{e.message}</span>
            {e.code === 'NO_RESOLVABLE_BINDINGS' && result.missing_metric_keys.length > 0 && (
              <p className="text-xs mt-0.5">Missing keys: {result.missing_metric_keys.join(', ')}</p>
            )}
          </div>
        </div>
      ))}

      {result.warnings.length > 0 && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
            <AlertTriangle className="w-4 h-4" />
            {result.warnings.length} binding{result.warnings.length > 1 ? 's' : ''} have scope notes
          </div>
          {result.warnings.slice(0, 4).map((w, i) => (
            <p key={i} className="text-xs text-amber-600">· {w.widget_title}: {w.message}</p>
          ))}
          {result.warnings.length > 4 && <p className="text-xs text-amber-500">+{result.warnings.length - 4} more</p>}
        </div>
      )}

      {result.errors.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Info className="w-3.5 h-3.5" />
          Dashboard can be assigned. Some widgets may show no data if bindings are non-LOB scoped.
        </div>
      )}
    </div>
  );
}
