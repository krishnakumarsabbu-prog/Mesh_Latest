import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Plus, Star, StarOff, Trash2, GripVertical, Eye, ChevronRight, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Info, RefreshCw, Settings, ArrowLeft, X, Clock, Shield, ChartBar as BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { projectDashboardAssignmentApi, dashboardTemplateApi, projectApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import {
  AssignmentResponse, DashboardTemplate, AssignmentValidationResult, Project,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

export function ProjectDashboardsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();

  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<AssignmentResponse[]>([]);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [assignDisplayName, setAssignDisplayName] = useState('');
  const [assignRefresh, setAssignRefresh] = useState(60);
  const [assignAsDefault, setAssignAsDefault] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [validationResult, setValidationResult] = useState<AssignmentValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<AssignmentResponse | null>(null);
  const [removing, setRemoving] = useState(false);

  const [editTarget, setEditTarget] = useState<AssignmentResponse | null>(null);
  const [editName, setEditName] = useState('');
  const [editRefresh, setEditRefresh] = useState(60);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [projRes, assignRes, templatesRes] = await Promise.all([
        projectApi.get(projectId),
        projectDashboardAssignmentApi.list(projectId),
        dashboardTemplateApi.list(),
      ]);
      setProject(projRes.data);
      setAssignments(assignRes.data);
      setTemplates(templatesRes.data);

      setPageTitle(projRes.data.name + ' — Dashboards');
      setBreadcrumbs([
        { label: 'Projects', href: '/projects' },
        { label: projRes.data.name, href: `/projects/${projectId}` },
        { label: 'Dashboards' },
      ]);
    } catch {
      notify.error('Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const assignedTemplateIds = new Set(assignments.map(a => a.template_id));
  const availableTemplates = templates.filter(t => !assignedTemplateIds.has(t.id));

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setValidationResult(null);
    if (!templateId || !projectId) return;
    setValidating(true);
    try {
      const res = await projectDashboardAssignmentApi.validate(projectId, templateId);
      setValidationResult(res.data);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleAssign = async () => {
    if (!projectId || !selectedTemplateId) return;
    if (validationResult && validationResult.errors.length > 0) return;
    setAssigning(true);
    try {
      await projectDashboardAssignmentApi.assign(projectId, {
        template_id: selectedTemplateId,
        display_name: assignDisplayName || null,
        is_default: assignAsDefault,
        refresh_interval_seconds: assignRefresh,
      });
      notify.success('Dashboard assigned');
      setAssignModalOpen(false);
      setSelectedTemplateId('');
      setAssignDisplayName('');
      setAssignAsDefault(false);
      setAssignRefresh(60);
      setValidationResult(null);
      fetchAll();
    } catch {
      notify.error('Failed to assign dashboard');
    } finally {
      setAssigning(false);
    }
  };

  const handleSetDefault = async (assignment: AssignmentResponse) => {
    if (!projectId) return;
    try {
      await projectDashboardAssignmentApi.setDefault(projectId, assignment.id);
      notify.success(`"${assignment.display_name || assignment.template_name}" set as default`);
      fetchAll();
    } catch {
      notify.error('Failed to set default');
    }
  };

  const handleRemove = async () => {
    if (!projectId || !removeTarget) return;
    setRemoving(true);
    try {
      await projectDashboardAssignmentApi.remove(projectId, removeTarget.id);
      notify.success('Dashboard removed');
      setRemoveTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to remove dashboard');
    } finally {
      setRemoving(false);
    }
  };

  const handleEdit = (a: AssignmentResponse) => {
    setEditTarget(a);
    setEditName(a.display_name || '');
    setEditRefresh(a.refresh_interval_seconds);
  };

  const handleSaveEdit = async () => {
    if (!projectId || !editTarget) return;
    setSaving(true);
    try {
      await projectDashboardAssignmentApi.update(projectId, editTarget.id, {
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
    if (dragIndex === null || dragIndex === dropIndex || !projectId) return;
    const reordered = [...assignments];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setAssignments(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
    try {
      await projectDashboardAssignmentApi.reorder(projectId, reordered.map(a => a.id));
    } catch {
      notify.error('Failed to reorder');
      fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-neutral-100 rounded-xl w-80" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-neutral-100 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: (project?.color || '#0A84FF') + '20' }}
          >
            <LayoutDashboard className="w-4 h-4" style={{ color: project?.color || '#0A84FF' }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-neutral-900 truncate">{project?.name} — Dashboards</h1>
            <p className="text-xs text-neutral-400">Manage assigned dashboard templates</p>
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

      {assignments.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard className="w-8 h-8 text-neutral-300" />
            </div>
            <h3 className="text-base font-semibold text-neutral-700 mb-1">No Dashboards Assigned</h3>
            <p className="text-sm text-neutral-400 mb-6 max-w-sm mx-auto">
              Assign dashboard templates to this project to enable live metric-driven dashboards.
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
                <button
                  onClick={() => navigate('/dashboard-builder')}
                  className="text-primary-600 hover:underline"
                >
                  Create one in Dashboard Builder
                </button>
              </p>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-400 flex items-center gap-1.5">
            <GripVertical className="w-3.5 h-3.5" />
            Drag rows to reorder dashboards
          </p>
          {assignments.map((assignment, index) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              index={index}
              isDragging={dragIndex === index}
              isDragOver={dragOverIndex === index}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              onSetDefault={handleSetDefault}
              onEdit={handleEdit}
              onRemove={setRemoveTarget}
              onOpen={(a) => navigate(`/projects/${projectId}/dashboards/${a.id}`)}
              projectId={projectId!}
            />
          ))}
        </div>
      )}

      <Modal
        open={assignModalOpen}
        onClose={() => { setAssignModalOpen(false); setValidationResult(null); setSelectedTemplateId(''); }}
        title="Assign Dashboard Template"
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
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Template</label>
            {availableTemplates.length === 0 ? (
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-sm text-neutral-400 text-center">
                All templates are already assigned to this project.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1">
                {availableTemplates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateSelect(t.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-xl border transition-all',
                      selectedTemplateId === t.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SCOPE_COLORS[t.scope] || '#636366' }}
                        />
                        <span className="font-medium text-sm text-neutral-900 truncate">{t.name}</span>
                        {t.category && (
                          <span className="text-xs text-neutral-400 shrink-0">· {t.category}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 flex-shrink-0">
                        <span>{t.widget_count}w</span>
                        <span className="capitalize px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (SCOPE_COLORS[t.scope] || '#636366') + '15', color: SCOPE_COLORS[t.scope] || '#636366' }}>
                          {t.scope}
                        </span>
                      </div>
                    </div>
                    {t.description && (
                      <p className="text-xs text-neutral-400 mt-1 truncate">{t.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {validating && (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Validating template compatibility...
            </div>
          )}

          {validationResult && !validating && (
            <ValidationResultPanel result={validationResult} />
          )}

          {selectedTemplateId && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Display Name <span className="text-neutral-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  placeholder="Custom name for this dashboard..."
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
                    {REFRESH_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setAssignAsDefault(v => !v)}
                      className={cn(
                        'w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0',
                        assignAsDefault ? 'bg-primary-500' : 'bg-neutral-200'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 bg-white rounded-full shadow-sm mt-0.5 transition-transform',
                        assignAsDefault ? 'translate-x-4.5' : 'translate-x-0.5'
                      )} />
                    </div>
                    <span className="text-sm text-neutral-700">Set as default</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Dashboard Assignment"
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
              {REFRESH_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove Dashboard"
        message={`Remove "${removeTarget?.display_name || removeTarget?.template_name}" from this project? Widget overrides will also be deleted.`}
        confirmLabel="Remove"
        variant="danger"
        loading={removing}
      />
    </div>
  );
}

function AssignmentRow({
  assignment, index, isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onSetDefault, onEdit, onRemove, onOpen, projectId,
}: {
  assignment: AssignmentResponse;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  onDragEnd: () => void;
  onSetDefault: (a: AssignmentResponse) => void;
  onEdit: (a: AssignmentResponse) => void;
  onRemove: (a: AssignmentResponse) => void;
  onOpen: (a: AssignmentResponse) => void;
  projectId: string;
}) {
  const displayName = assignment.display_name || assignment.template_name || 'Unnamed Dashboard';
  const scopeColor = SCOPE_COLORS[assignment.template_scope || 'project'] || '#636366';

  return (
    <motion.div
      layout
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e as unknown as React.DragEvent, index)}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      className={cn(
        'group bg-white rounded-2xl border transition-all',
        isDragOver ? 'border-primary-400 shadow-lg scale-[1.01]' : 'border-neutral-100 shadow-sm hover:border-neutral-200 hover:shadow-md',
        isDragging ? 'opacity-40' : 'opacity-100',
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="cursor-grab active:cursor-grabbing p-1 text-neutral-300 hover:text-neutral-500 transition-colors flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>

        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: scopeColor + '15' }}
        >
          <LayoutDashboard className="w-5 h-5" style={{ color: scopeColor }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-neutral-900">{displayName}</span>
            {assignment.is_default && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium border border-amber-200">
                <Star className="w-3 h-3" />
                Default
              </span>
            )}
            {assignment.display_name && (
              <span className="text-xs text-neutral-400 font-normal">({assignment.template_name})</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <BarChart2 className="w-3 h-3" />
              {assignment.widget_count} widgets
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Refresh: {REFRESH_OPTIONS.find(o => o.value === assignment.refresh_interval_seconds)?.label || `${assignment.refresh_interval_seconds}s`}
            </span>
            <span
              className="capitalize px-1.5 py-0.5 rounded-full text-xs"
              style={{ backgroundColor: scopeColor + '15', color: scopeColor }}
            >
              {assignment.template_scope || 'project'}
            </span>
            {assignment.overrides.length > 0 && (
              <span className="flex items-center gap-1 text-neutral-400">
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
              assignment.is_default
                ? 'text-amber-400 bg-amber-50'
                : 'text-neutral-400 hover:text-amber-400 hover:bg-amber-50'
            )}
            title={assignment.is_default ? 'Default dashboard' : 'Set as default'}
          >
            {assignment.is_default ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onEdit(assignment)}
            className="p-2 rounded-xl text-neutral-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
            title="Edit settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(assignment)}
            className="p-2 rounded-xl text-neutral-400 hover:text-danger-500 hover:bg-danger-50 transition-all"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpen(assignment)}
            className="p-2 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-all flex items-center gap-1.5 text-xs font-medium px-3"
          >
            <Eye className="w-3.5 h-3.5" />
            Open
          </button>
        </div>

        <button
          onClick={() => onOpen(assignment)}
          className="p-2 rounded-xl text-neutral-300 hover:text-primary-500 transition-colors ml-1 opacity-100 group-hover:opacity-0 absolute right-4"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function ValidationResultPanel({ result }: { result: AssignmentValidationResult }) {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-success-50 rounded-xl border border-success-200 text-success-700 text-sm">
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
        <div>
          <span className="font-medium">Template is compatible.</span>
          {result.total_bindings > 0 && (
            <span className="ml-1 text-success-600">
              {result.satisfied_bindings}/{result.total_bindings} metric bindings satisfied.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {result.errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 p-3 bg-danger-50 rounded-xl border border-danger-200 text-danger-700 text-sm">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">{e.message}</span>
            {e.code === 'NO_COMPATIBLE_CONNECTORS' && result.missing_connector_types.length > 0 && (
              <p className="text-xs mt-0.5">Required: {result.missing_connector_types.join(', ')}</p>
            )}
          </div>
        </div>
      ))}
      {result.warnings.length > 0 && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
            <AlertTriangle className="w-4 h-4" />
            {result.warnings.length} metric binding{result.warnings.length > 1 ? 's' : ''} may not resolve
          </div>
          <div className="space-y-1">
            {result.warnings.slice(0, 3).map((w, i) => (
              <p key={i} className="text-xs text-amber-600">· {w.widget_title}: {w.message}</p>
            ))}
            {result.warnings.length > 3 && (
              <p className="text-xs text-amber-500">+{result.warnings.length - 3} more warnings</p>
            )}
          </div>
        </div>
      )}
      {result.errors.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Info className="w-3.5 h-3.5" />
          Dashboard can be assigned but some widgets may show no data.
        </div>
      )}
    </div>
  );
}
