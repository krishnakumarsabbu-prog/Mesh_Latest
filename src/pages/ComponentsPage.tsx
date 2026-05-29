import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Layers, Trash2, Pencil, Search, X, ChevronRight, FolderOpen, RefreshCw, Box,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { componentApi, teamApi, lobApi } from '@/lib/api';
import { Component, Team, Lob } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { canManageProjects } from '@/lib/permissions';
import { HierarchyMap } from '@/components/charts/HierarchyMap';

const PRESET_COLORS = [
  '#A855F7', '#EC4899', '#3B82F6', '#10B981',
  '#EF4444', '#F59E0B', '#06B6D4', '#6366F1', '#14B8A6', '#8B5CF6',
];

export function ComponentsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamIdFilter = searchParams.get('team_id');
  const canCreate = user ? canManageProjects(user.role) : false;

  const [components, setComponents] = useState<Component[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [loading, setLoading] = useState(true);

  const search = searchParams.get('search') || '';
  const teamFilter = searchParams.get('team') || teamIdFilter || '';
  const lobFilter = searchParams.get('lob') || '';

  const setSearch = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('search', value);
      else next.delete('search');
      return next;
    }, { replace: true });
  };

  const setTeamFilter = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('team', value);
      else next.delete('team');
      return next;
    }, { replace: true });
  };

  const setLobFilter = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('lob', value);
      else next.delete('lob');
      return next;
    }, { replace: true });
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Component | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Component | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', slug: '', description: '', team_id: teamIdFilter || '', color: '#A855F7', icon: 'layers',
  });
  const [editForm, setEditForm] = useState({
    name: '', description: '', color: '#A855F7', icon: 'layers', is_active: true,
  });

  useEffect(() => {
    setPageTitle('Projects');
    setBreadcrumbs([{ label: 'Projects' }]);
    fetchData();
  }, [teamIdFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [compRes, teamRes, lobRes] = await Promise.all([
        componentApi.list(),
        teamApi.list(),
        lobApi.list(),
      ]);
      setComponents(compRes.data);
      setTeams(teamRes.data);
      setLobs(lobRes.data);
    } catch {
      notify.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = [...components];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
      );
    }
    if (teamFilter) result = result.filter(c => c.team_id === teamFilter);
    if (lobFilter) result = result.filter(c => c.lob_id === lobFilter);
    return result;
  }, [components, search, teamFilter, lobFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const selectedTeam = teams.find(t => t.id === form.team_id);
    if (!selectedTeam) {
      notify.error('Please select a valid Team');
      setSaving(false);
      return;
    }

    try {
      await componentApi.create({
        ...form,
        lob_id: selectedTeam.lob_id,
      });
      notify.success('Project created successfully');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', team_id: teamIdFilter || '', color: '#A855F7', icon: 'layers' });
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
      await componentApi.update(editTarget.id, editForm);
      notify.success('Project updated successfully');
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
      await componentApi.delete(deleteTarget.id);
      notify.success('Project deleted successfully');
      setDeleteTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to delete project');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (comp: Component) => {
    setEditTarget(comp);
    setEditForm({
      name: comp.name,
      description: comp.description || '',
      color: comp.color,
      icon: comp.icon || 'layers',
      is_active: comp.is_active,
    });
  };

  const getTeamName = (team_id: string) => teams.find(t => t.id === team_id)?.name || team_id;
  const getLobName = (lob_id: string) => lobs.find(l => l.id === lob_id)?.name || lob_id;

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHeader
        title="Projects"
        subtitle={`${components.length} project${components.length !== 1 ? 's' : ''} organized under Teams & LOBs`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={fetchData}>Refresh</Button>
            {canCreate && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New Project</Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-7 space-y-6">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 py-2 text-[13px] rounded-xl outline-none transition-all w-56"
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-subtle)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.boxShadow = ''; }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={lobFilter}
              onChange={e => setLobFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
            >
              <option value="">All LOBs</option>
              {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>

            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 text-[13px] rounded-xl outline-none cursor-pointer"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
            >
              <option value="">All Teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            {(search || teamFilter || lobFilter) && (
              <button
                onClick={() => {
                  setSearchParams(prev => {
                    const next = new URLSearchParams();
                    if (prev.get('team_id')) next.set('team_id', prev.get('team_id')!);
                    return next;
                  }, { replace: true });
                }}
                className="text-[12px] transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={search || teamFilter || lobFilter ? 'No projects match your filters' : 'No projects yet'}
              description={search || teamFilter || lobFilter ? 'Try adjusting your search or filters.' : 'Create your first project to group and manage components.'}
              action={canCreate && !search && !teamFilter && !lobFilter ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New Project</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(comp => (
                <Card
                  key={comp.id}
                  className="group cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/components/${comp.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: comp.color + '22' }}
                      >
                        <Layers className="w-5 h-5" style={{ color: comp.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{comp.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {getTeamName(comp.team_id)} • {getLobName(comp.lob_id)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canCreate && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(comp); }}
                            className="p-1.5 rounded-lg transition-all"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(comp); }}
                            className="p-1.5 rounded-lg transition-all"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {comp.description && (
                    <p className="text-[12px] mt-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{comp.description}</p>
                  )}

                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                        {comp.project_count || 0} component{comp.project_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--app-border)' }}>
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: comp.is_active ? '#30D15822' : 'var(--app-bg-muted)',
                        color: comp.is_active ? '#30D158' : 'var(--text-muted)',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: comp.is_active ? '#30D158' : 'var(--text-muted)' }} />
                      {comp.is_active ? 'Active' : 'Inactive'}
                    </div>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-12 xl:col-span-5">
          <HierarchyMap />
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Project"
        subtitle="Organize team components into a logical project wrapper"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-project-form" loading={saving}>Create Project</Button>
          </>
        }
      >
        <form id="create-project-form" onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Associated Team"
            value={form.team_id}
            onChange={e => setForm({ ...form, team_id: e.target.value })}
            options={[{ value: '', label: 'Select a Team...' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
            required
          />
          <Input
            label="Project Name"
            placeholder="e.g., Core API Suite"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })}
            required
          />
          <Input
            label="Slug"
            placeholder="core-api-suite"
            value={form.slug}
            onChange={e => setForm({ ...form, slug: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            placeholder="Optional project description..."
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <div>
            <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn('w-7 h-7 rounded-lg border-2 transition-all', form.color === c ? 'scale-110' : 'border-transparent hover:scale-105')}
                  style={{ background: c, borderColor: form.color === c ? 'var(--text-primary)' : 'transparent' }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Project"
        subtitle="Update project metadata"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-project-form" loading={saving}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={handleEdit} className="space-y-4">
          <Input
            label="Project Name"
            value={editForm.name}
            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            value={editForm.description}
            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
          />
          <div>
            <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, color: c })}
                  className={cn('w-7 h-7 rounded-lg border-2 transition-all', editForm.color === c ? 'scale-110' : 'border-transparent hover:scale-105')}
                  style={{ background: c, borderColor: editForm.color === c ? 'var(--text-primary)' : 'transparent' }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        message={`Are you sure you want to delete project "${deleteTarget?.name}"? Components belonging to this project will be unassigned but NOT deleted.`}
        confirmLabel="Delete Project"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
