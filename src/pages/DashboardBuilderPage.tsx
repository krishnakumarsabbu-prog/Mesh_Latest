import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Plus, Copy, Trash2, CreditCard as Edit3, Search, ChevronRight, Globe, Lock, Building2, FolderOpen, UsersRound, Zap, Eye, Settings } from 'lucide-react';
import { dashboardTemplateApi } from '@/lib/api';
import { DashboardTemplate, DashboardScope, DashboardVisibility } from '@/types';
import { Button } from '@/components/ui/Button';
import { notify } from '@/store/notificationStore';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

const SCOPE_META: Record<DashboardScope, { label: string; color: string; icon: React.ReactNode }> = {
  project: { label: 'Project', color: '#0A84FF', icon: <FolderOpen className="w-3.5 h-3.5" /> },
  team: { label: 'Team', color: '#30D158', icon: <UsersRound className="w-3.5 h-3.5" /> },
  lob: { label: 'LOB', color: '#FF9F0A', icon: <Building2 className="w-3.5 h-3.5" /> },
  global: { label: 'Global', color: '#BF5AF2', icon: <Zap className="w-3.5 h-3.5" /> },
};

const VISIBILITY_META: Record<DashboardVisibility, { label: string; icon: React.ReactNode }> = {
  global: { label: 'Global', icon: <Globe className="w-3 h-3" /> },
  lob: { label: 'LOB', icon: <Building2 className="w-3 h-3" /> },
  private: { label: 'Private', icon: <Lock className="w-3 h-3" /> },
};

export function DashboardBuilderPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cloneTarget, setCloneTarget] = useState<DashboardTemplate | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardTemplateApi.list();
      setTemplates(res.data);
    } catch {
      notify.error('Failed to load dashboard templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const filtered = templates.filter(t => {
    const matchScope = scopeFilter === 'all' || t.scope === scopeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    return matchScope && matchSearch;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await dashboardTemplateApi.delete(deleteTarget.id);
      notify.success('Template deleted');
      setDeleteTarget(null);
      loadTemplates();
    } catch {
      notify.error('Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) return;
    setCloning(true);
    try {
      const res = await dashboardTemplateApi.clone(cloneTarget.id, cloneName.trim());
      notify.success('Template cloned');
      setCloneTarget(null);
      setCloneName('');
      navigate(`/dashboard-builder/${res.data.id}`);
    } catch {
      notify.error('Failed to clone template');
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Dashboard Templates
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Build and manage reusable dashboard templates for Projects, Teams, and LOBs
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus className="w-4 h-4" />}>
          New Template
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary-400 focus:bg-white transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {['all', 'project', 'team', 'lob', 'global'].map(s => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-xl capitalize transition-all',
                scopeFilter === s
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
              )}
            >
              {s === 'all' ? `All (${templates.length})` : SCOPE_META[s as DashboardScope]?.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-neutral-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <LayoutTemplate className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-neutral-500">
            {search ? 'No templates match your search' : 'No dashboard templates yet'}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Create your first template to get started
          </p>
          <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
            Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => navigate(`/dashboard-builder/${t.id}`)}
              onClone={() => { setCloneTarget(t); setCloneName(`${t.name} (Copy)`); }}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      <CreateTemplateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (data) => {
          try {
            const res = await dashboardTemplateApi.create(data);
            notify.success('Template created');
            setCreateOpen(false);
            navigate(`/dashboard-builder/${res.data.id}`);
          } catch {
            notify.error('Failed to create template');
          }
        }}
      />

      <Modal
        open={!!cloneTarget}
        onClose={() => setCloneTarget(null)}
        title="Clone Template"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCloneTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={handleClone} loading={cloning} disabled={!cloneName.trim()}>Clone</Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-1.5">
            New Template Name
          </label>
          <input
            type="text"
            value={cloneName}
            onChange={e => setCloneName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary-400 transition-all"
            autoFocus
          />
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Template"
        message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

function TemplateCard({
  template, onEdit, onClone, onDelete,
}: {
  template: DashboardTemplate;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const scope = SCOPE_META[template.scope];
  const vis = VISIBILITY_META[template.visibility];

  return (
    <div
      className="group bg-white border border-neutral-100 rounded-2xl p-5 hover:border-neutral-200 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: scope.color + '15', color: scope.color }}
            >
              {scope.icon} {scope.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              {vis.icon} {vis.label}
            </span>
          </div>
          <h3 className="text-sm font-bold text-neutral-900 truncate">{template.name}</h3>
          {template.description && (
            <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{template.description}</p>
          )}
        </div>
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onClone}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
            title="Clone"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-auto pt-2 border-t border-neutral-50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span>{template.widget_count} widget{template.widget_count !== 1 ? 's' : ''}</span>
          {template.category && <span className="capitalize">{template.category}</span>}
          <span>v{template.version}</span>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-xs text-primary-600 font-medium hover:text-primary-700 transition-colors"
        >
          <Edit3 className="w-3 h-3" /> Edit
        </button>
      </div>
    </div>
  );
}

function CreateTemplateModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: object) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<DashboardScope>('project');
  const [visibility, setVisibility] = useState<DashboardVisibility>('private');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim() || null, scope, visibility, category: category || null });
      setName(''); setDescription(''); setScope('project'); setVisibility('private'); setCategory('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Dashboard Template"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} loading={saving} disabled={!name.trim()}>Create Template</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-1.5">Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Project Health Overview"
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary-400 transition-all"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe this template..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary-400 transition-all resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-1.5">Scope</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as DashboardScope)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary-400 bg-white transition-all"
            >
              <option value="project">Project</option>
              <option value="team">Team</option>
              <option value="lob">LOB</option>
              <option value="global">Global</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-1.5">Visibility</label>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value as DashboardVisibility)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary-400 bg-white transition-all"
            >
              <option value="private">Private</option>
              <option value="lob">LOB</option>
              <option value="global">Global</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-1.5">Category (optional)</label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Operations, SLA, Incident..."
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary-400 transition-all"
          />
        </div>
      </div>
    </Modal>
  );
}
