import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, FolderOpen, Plug, CircleCheck as CheckCircle,
  TriangleAlert as AlertTriangle, CircleAlert as AlertCircle,
  Trash2, Pencil, LayoutGrid, List, Table as TableIcon,
  Search, X, Users, ChevronRight, ArrowUpDown,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { projectApi, lobApi, teamApi } from '@/lib/api';
import { Project, Lob, Team } from '@/types';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { isLobAdmin } from '@/lib/permissions';
import { RegistrationWizard } from '@/components/project/RegistrationWizard';
import { HierarchyMap } from '@/components/charts/HierarchyMap';

type ViewMode = 'card' | 'list' | 'table';
type SortField = 'name' | 'status' | 'connector_count' | 'member_count' | 'created_at';

const STATUS_OPTIONS = ['active', 'inactive', 'maintenance', 'archived'];
const ENV_OPTIONS = ['production', 'staging', 'development', 'testing'];

export function ProjectsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lobIdFilter = searchParams.get('lob_id');
  const canCreate = user ? isLobAdmin(user.role) : false;

  const [projects, setProjects] = useState<Project[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsForForm, setTeamsForForm] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const envFilter = searchParams.get('env') || '';
  const lobFilter = searchParams.get('lob') || lobIdFilter || '';
  const teamFilter = searchParams.get('team') || '';

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const setSearch = (value: string) => setFilter('search', value);
  const setStatusFilter = (value: string) => setFilter('status', value);
  const setEnvFilter = (value: string) => setFilter('env', value);
  const setLobFilter = (value: string) => { setFilter('lob', value); setFilter('team', ''); };
  const setTeamFilter = (value: string) => setFilter('team', value);

  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', description: '', lob_id: lobIdFilter || '',
    team_id: '', environment: 'production', color: '#30D158',
  });
  const [editForm, setEditForm] = useState({
    name: '', description: '', status: 'active', environment: 'production', color: '#30D158',
  });

  useEffect(() => {
    setPageTitle('Components');
    setBreadcrumbs([{ label: 'Components' }]);
    fetchData();
  }, [lobIdFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, lobRes, teamRes] = await Promise.all([
        projectApi.list(lobIdFilter || undefined),
        lobApi.list(),
        teamApi.list(),
      ]);
      setProjects(projRes.data);
      setLobs(lobRes.data);
      setTeams(teamRes.data);
    } catch {
      notify.error('Failed to load components');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = [...projects];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter(p => p.status === statusFilter);
    if (envFilter) result = result.filter(p => p.environment === envFilter);
    if (lobFilter) result = result.filter(p => p.lob_id === lobFilter);
    if (teamFilter) result = result.filter(p => p.team_id === teamFilter);

    result.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortField === 'name') { av = a.name; bv = b.name; }
      else if (sortField === 'status') { av = a.status; bv = b.status; }
      else if (sortField === 'connector_count') { av = a.connector_count; bv = b.connector_count; }
      else if (sortField === 'member_count') { av = a.member_count; bv = b.member_count; }
      else if (sortField === 'created_at') { av = a.created_at; bv = b.created_at; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [projects, search, statusFilter, envFilter, lobFilter, teamFilter, sortField, sortDir]);

  const getLobName = (id: string) => lobs.find(l => l.id === id)?.name || id;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.team_id) {
      notify.error('Please select a team for this project');
      return;
    }
    setSaving(true);
    try {
      await projectApi.create({ ...form });
      notify.success('Project created');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', lob_id: '', team_id: '', environment: 'production', color: '#30D158' });
      fetchData();
    } catch (err: unknown) {
      notify.error('Failed to create project', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await projectApi.update(editTarget.id, editForm);
      notify.success('Project updated');
      setEditTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await projectApi.delete(deleteTarget.id);
      notify.success('Project deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to delete project');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (p: Project) => {
    setEditForm({ name: p.name, description: p.description || '', status: p.status, environment: p.environment, color: p.color });
    setEditTarget(p);
  };

  const hasFilters = search || statusFilter || envFilter || (lobFilter && !lobIdFilter) || teamFilter;

  const clearFilters = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams();
      if (prev.get('lob_id')) next.set('lob_id', prev.get('lob_id')!);
      return next;
    }, { replace: true });
  };

  const filteredTeamsForLob = form.lob_id
    ? teams.filter(t => t.lob_id === form.lob_id)
    : [];

  const filterSelectStyle: React.CSSProperties = {
    background: 'var(--app-bg-muted)',
    border: '1px solid var(--app-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Components"
        subtitle={`${filtered.length} of ${projects.length} component${projects.length !== 1 ? 's' : ''}${lobIdFilter ? ` in ${getLobName(lobIdFilter)}` : ''}`}
        actions={
          canCreate ? (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setWizardOpen(true)}>
              New Component
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-7 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search components..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl outline-none focus-ring transition-all"
                style={filterSelectStyle}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!lobIdFilter && (
              <select
                value={lobFilter}
                onChange={e => { setLobFilter(e.target.value); setTeamFilter(''); }}
                className="text-sm rounded-xl px-3 py-2 outline-none focus-ring appearance-none transition-all"
                style={filterSelectStyle}
              >
                <option value="">All LOBs</option>
                {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}

            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="text-sm rounded-xl px-3 py-2 outline-none focus-ring appearance-none transition-all"
              style={filterSelectStyle}
            >
              <option value="">All Teams</option>
              {(lobFilter ? teams.filter(t => t.lob_id === lobFilter) : teams).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm rounded-xl px-3 py-2 outline-none focus-ring appearance-none transition-all"
              style={filterSelectStyle}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>

            <select
              value={envFilter}
              onChange={e => setEnvFilter(e.target.value)}
              className="text-sm rounded-xl px-3 py-2 outline-none focus-ring appearance-none transition-all"
              style={filterSelectStyle}
            >
              <option value="">All Environments</option>
              {ENV_OPTIONS.map(e => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}

            <div
              className="ml-auto flex items-center gap-1 rounded-xl p-1"
              style={{ border: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
            >
              {(['card', 'list', 'table'] as ViewMode[]).map((m) => {
                const Icon = m === 'card' ? LayoutGrid : m === 'list' ? List : TableIcon;
                return (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className="p-1.5 rounded-lg transition-all"
                    style={viewMode === m
                      ? { background: 'var(--accent)', color: '#fff' }
                      : { color: 'var(--text-muted)' }
                    }
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl shimmer-bg" />
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div
              className="rounded-2xl p-8"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
              <EmptyState
                icon={FolderOpen}
                title={hasFilters ? 'No matching components' : 'No Components'}
                description={hasFilters ? 'Try adjusting your filters.' : 'Create your first component to start adding connectors.'}
                action={
                  !hasFilters && canCreate ? (
                    <Button icon={<Plus className="w-4 h-4" />} onClick={() => setWizardOpen(true)}>
                      Create Component
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : viewMode === 'card' ? (
            <ProjectCardGrid
              projects={filtered}
              lobs={lobs}
              canCreate={canCreate}
              onNavigate={id => navigate(`/projects/${id}`)}
              onEdit={openEdit}
              onDelete={p => setDeleteTarget(p)}
            />
          ) : viewMode === 'list' ? (
            <ProjectListView
              projects={filtered}
              lobs={lobs}
              canCreate={canCreate}
              onNavigate={id => navigate(`/projects/${id}`)}
              onEdit={openEdit}
              onDelete={p => setDeleteTarget(p)}
            />
          ) : (
            <ProjectTableView
              projects={filtered}
              lobs={lobs}
              canCreate={canCreate}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              onNavigate={id => navigate(`/projects/${id}`)}
              onEdit={openEdit}
              onDelete={p => setDeleteTarget(p)}
            />
          )}
        </div>

        <div className="col-span-12 xl:col-span-5">
          <HierarchyMap />
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Component"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-project-form" loading={saving}>Create Component</Button>
          </>
        }
      >
        <form id="create-project-form" onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Line of Business"
            value={form.lob_id}
            onChange={e => setForm({ ...form, lob_id: e.target.value, team_id: '' })}
            options={[{ value: '', label: 'Select a LOB...' }, ...lobs.map(l => ({ value: l.id, label: l.name }))]}
            required
          />
          <Select
            label="Team"
            value={form.team_id}
            onChange={e => setForm({ ...form, team_id: e.target.value })}
            options={[
              { value: '', label: form.lob_id ? 'Select a team...' : 'Select a LOB first...' },
              ...filteredTeamsForLob.map(t => ({ value: t.id, label: t.name })),
            ]}
            required
          />
          <Input
            label="Name"
            placeholder="e.g., Payment Gateway"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })}
            required
          />
          <Input
            label="Slug"
            placeholder="auto-generated"
            value={form.slug}
            onChange={e => setForm({ ...form, slug: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            placeholder="Optional..."
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Environment"
              value={form.environment}
              onChange={e => setForm({ ...form, environment: e.target.value })}
              options={ENV_OPTIONS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
            />
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Color</label>
              <input
                type="color"
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-full h-9 rounded-xl cursor-pointer"
                style={{ border: '1px solid var(--app-border)' }}
              />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Component"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-project-form" loading={saving}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={handleEdit} className="space-y-4">
          <Input
            label="Name"
            value={editForm.name}
            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            value={editForm.description}
            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              value={editForm.status}
              onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              options={STATUS_OPTIONS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
            />
            <Select
              label="Environment"
              value={editForm.environment}
              onChange={e => setEditForm({ ...editForm, environment: e.target.value })}
              options={ENV_OPTIONS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Color</label>
            <input
              type="color"
              value={editForm.color}
              onChange={e => setEditForm({ ...editForm, color: e.target.value })}
              className="w-full h-9 rounded-xl cursor-pointer"
              style={{ border: '1px solid var(--app-border)' }}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Component"
        message={`Delete "${deleteTarget?.name}"? This will also remove all associated connectors.`}
        confirmLabel="Delete"
        variant="danger"
        loading={saving}
      />

      {wizardOpen && (
        <RegistrationWizard
          initialLobId={lobIdFilter || undefined}
          onClose={() => setWizardOpen(false)}
          onSuccess={(projectId) => {
            setWizardOpen(false);
            fetchData();
            navigate(`/projects/${projectId}`);
          }}
        />
      )}
    </div>
  );
}

function ProjectCardGrid({ projects, lobs, canCreate, onNavigate, onEdit, onDelete }: {
  projects: Project[]; lobs: Lob[]; canCreate: boolean;
  onNavigate: (id: string) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const getLobName = (id: string) => lobs.find(l => l.id === id)?.name || id;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map(proj => {
        const total = proj.connector_count;
        const pct = total > 0 ? Math.round((proj.healthy_count / total) * 100) : 100;
        return (
          <div
            key={proj.id}
            className="group relative rounded-2xl cursor-pointer transition-all duration-200"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              boxShadow: 'var(--shadow-sm)',
              padding: '1.25rem',
            }}
            onClick={() => onNavigate(proj.id)}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-lg)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border-strong)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
              (e.currentTarget as HTMLElement).style.transform = '';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
            }}
          >
            {canCreate && (
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  onClick={e => { e.stopPropagation(); onEdit(proj); }}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(proj); }}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: (proj.color || '#30D158') + '20' }}
              >
                <FolderOpen className="w-5 h-5" style={{ color: proj.color || '#30D158' }} />
              </div>
              <div className="flex-1 min-w-0 pr-12">
                <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{proj.name}</h3>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {getLobName(proj.lob_id)}{proj.team_name ? ` · ${proj.team_name}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <StatusBadge status={proj.status} size="xs" />
              <span
                className="text-xs px-2 py-0.5 rounded-full capitalize"
                style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
              >
                {proj.environment}
              </span>
            </div>

            {total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>Health</span>
                  <span className="font-medium">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A',
                    }}
                  />
                </div>
              </div>
            )}

            <div
              className="flex items-center gap-3 text-xs pt-3 border-t"
              style={{ borderColor: 'var(--app-border-subtle)', color: 'var(--text-muted)' }}
            >
              <div className="flex items-center gap-1">
                <Plug className="w-3 h-3" /> <span>{proj.connector_count}</span>
              </div>
              <div className="flex items-center gap-1" style={{ color: '#30D158' }}>
                <CheckCircle className="w-3 h-3" /> <span>{proj.healthy_count}</span>
              </div>
              {proj.degraded_count > 0 && (
                <div className="flex items-center gap-1" style={{ color: '#FF9F0A' }}>
                  <AlertTriangle className="w-3 h-3" /> <span>{proj.degraded_count}</span>
                </div>
              )}
              {proj.down_count > 0 && (
                <div className="flex items-center gap-1" style={{ color: '#FF453A' }}>
                  <AlertCircle className="w-3 h-3" /> <span>{proj.down_count}</span>
                </div>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <Users className="w-3 h-3" /> <span>{proj.member_count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectListView({ projects, lobs, canCreate, onNavigate, onEdit, onDelete }: {
  projects: Project[]; lobs: Lob[]; canCreate: boolean;
  onNavigate: (id: string) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const getLobName = (id: string) => lobs.find(l => l.id === id)?.name || id;
  return (
    <div className="space-y-2">
      {projects.map(proj => {
        const total = proj.connector_count;
        const pct = total > 0 ? Math.round((proj.healthy_count / total) * 100) : 100;
        return (
          <div
            key={proj.id}
            className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all cursor-pointer group"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            onClick={() => onNavigate(proj.id)}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border-strong)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
              (e.currentTarget as HTMLElement).style.boxShadow = '';
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: (proj.color || '#30D158') + '20' }}
            >
              <FolderOpen className="w-4 h-4" style={{ color: proj.color || '#30D158' }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{proj.name}</p>
                <StatusBadge status={proj.status} size="xs" />
              </div>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {getLobName(proj.lob_id)}{proj.team_name ? ` · ${proj.team_name}` : ''} · {proj.environment}
              </p>
            </div>

            <div className="hidden md:flex items-center gap-2 w-32">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A',
                  }}
                />
              </div>
              <span className="text-xs w-8 text-right" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
            </div>

            <div className="hidden md:flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1"><Plug className="w-3 h-3" />{proj.connector_count}</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{proj.member_count}</span>
            </div>

            {canCreate && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); onEdit(proj); }}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(proj); }}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <ChevronRight className="w-4 h-4 flex-shrink-0 transition-colors" style={{ color: 'var(--text-disabled)' }} />
          </div>
        );
      })}
    </div>
  );
}

function ProjectTableView({ projects, lobs, canCreate, sortField, sortDir, onSort, onNavigate, onEdit, onDelete }: {
  projects: Project[]; lobs: Lob[]; canCreate: boolean;
  sortField: SortField; sortDir: 'asc' | 'desc';
  onSort: (f: SortField) => void;
  onNavigate: (id: string) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const getLobName = (id: string) => lobs.find(l => l.id === id)?.name || id;

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-medium transition-colors"
      style={{ color: 'var(--text-secondary)' }}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" style={{ color: sortField === field ? 'var(--accent)' : 'var(--text-disabled)' }} />
    </button>
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-subtle)' }}>
              <th className="text-left px-4 py-3"><SortHeader field="name" label="Component" /></th>
              <th className="text-left px-4 py-3 hidden md:table-cell">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>LOB / Team</span>
              </th>
              <th className="text-left px-4 py-3"><SortHeader field="status" label="Status" /></th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Environment</span>
              </th>
              <th className="text-left px-4 py-3 hidden lg:table-cell"><SortHeader field="connector_count" label="Connectors" /></th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Health</span>
              </th>
              <th className="text-left px-4 py-3 hidden xl:table-cell"><SortHeader field="member_count" label="Members" /></th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((proj, idx) => {
              const total = proj.connector_count;
              const pct = total > 0 ? Math.round((proj.healthy_count / total) * 100) : 100;
              return (
                <tr
                  key={proj.id}
                  className={cn(
                    'cursor-pointer transition-colors group',
                    idx !== projects.length - 1 && 'border-b'
                  )}
                  style={{ borderColor: 'var(--app-border-subtle)' }}
                  onClick={() => onNavigate(proj.id)}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-subtle)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: (proj.color || '#30D158') + '20' }}
                      >
                        <FolderOpen className="w-3.5 h-3.5" style={{ color: proj.color || '#30D158' }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{proj.name}</p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{proj.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div>
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{getLobName(proj.lob_id)}</span>
                      {proj.team_name && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{proj.team_name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={proj.status} size="xs" />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full capitalize"
                      style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)' }}
                    >
                      {proj.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{proj.connector_count}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2 w-24">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 90 ? '#30D158' : pct >= 70 ? '#FF9F0A' : '#FF453A',
                          }}
                        />
                      </div>
                      <span className="text-xs w-8 text-right" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{proj.member_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canCreate && (
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); onEdit(proj); }}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(proj); }}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
