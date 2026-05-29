import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Users, Trash2, Pencil, Search, X, ChevronRight, FolderOpen, RefreshCw,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { teamApi, lobApi } from '@/lib/api';
import { Team, Lob } from '@/types';
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
import { isLobAdmin } from '@/lib/permissions';
import { HierarchyMap } from '@/components/charts/HierarchyMap';

const PRESET_COLORS = [
  '#0A84FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

export function TeamsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const lobIdFilter = searchParams.get('lob_id');
  const canCreate = user ? isLobAdmin(user.role) : false;

  const [teams, setTeams] = useState<Team[]>([]);
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [loading, setLoading] = useState(true);

  const search = searchParams.get('search') || '';
  const lobFilter = searchParams.get('lob') || lobIdFilter || '';

  const setSearch = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('search', value);
      else next.delete('search');
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
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', slug: '', description: '', lob_id: lobIdFilter || '', color: '#0A84FF',
  });
  const [editForm, setEditForm] = useState({
    name: '', description: '', color: '#0A84FF', is_active: true,
  });

  useEffect(() => {
    setPageTitle('Teams');
    setBreadcrumbs([{ label: 'Teams' }]);
    fetchData();
  }, [lobIdFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, lobRes] = await Promise.all([
        teamApi.list(lobIdFilter || undefined),
        lobApi.list(),
      ]);
      setTeams(teamRes.data);
      setLobs(lobRes.data);
    } catch {
      notify.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = [...teams];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    if (lobFilter) result = result.filter(t => t.lob_id === lobFilter);
    return result;
  }, [teams, search, lobFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await teamApi.create(form);
      notify.success('Team created');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', lob_id: lobIdFilter || '', color: '#0A84FF' });
      fetchData();
    } catch (err: unknown) {
      notify.error('Failed to create team', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await teamApi.update(editTarget.id, editForm);
      notify.success('Team updated');
      setEditTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to update team');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await teamApi.delete(deleteTarget.id);
      notify.success('Team deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to delete team');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (team: Team) => {
    setEditTarget(team);
    setEditForm({ name: team.name, description: team.description || '', color: team.color, is_active: team.is_active });
  };

  const getLobName = (lob_id: string) => lobs.find(l => l.id === lob_id)?.name || lob_id;

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHeader
        title="Teams"
        subtitle={`${teams.length} team${teams.length !== 1 ? 's' : ''} across all LOBs`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={fetchData}>Refresh</Button>
            {canCreate && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New Team</Button>
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
                placeholder="Search teams..."
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

            {(search || lobFilter) && (
              <button
                onClick={() => {
                  setSearchParams(prev => {
                    const next = new URLSearchParams();
                    if (prev.get('lob_id')) next.set('lob_id', prev.get('lob_id')!);
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
              icon={Users}
              title={search || lobFilter ? 'No teams match your filters' : 'No teams yet'}
              description={search || lobFilter ? 'Try adjusting your search or filters.' : 'Create your first team to organize projects and members.'}
              action={canCreate && !search && !lobFilter ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New Team</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(team => (
                <Card
                  key={team.id}
                  className="group cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/teams/${team.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: team.color + '22' }}
                      >
                        <Users className="w-5 h-5" style={{ color: team.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{team.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{getLobName(team.lob_id)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canCreate && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(team); }}
                            className="p-1.5 rounded-lg transition-all"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(team); }}
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

                  {team.description && (
                    <p className="text-[12px] mt-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{team.description}</p>
                  )}

                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                        {team.project_count} project{team.project_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                        {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--app-border)' }}>
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: team.is_active ? '#30D15822' : 'var(--app-bg-muted)',
                        color: team.is_active ? '#30D158' : 'var(--text-muted)',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: team.is_active ? '#30D158' : 'var(--text-muted)' }} />
                      {team.is_active ? 'Active' : 'Inactive'}
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
        title="Create Team"
        subtitle="Organize projects under a team within a LOB"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-team-form" loading={saving}>Create Team</Button>
          </>
        }
      >
        <form id="create-team-form" onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Line of Business"
            value={form.lob_id}
            onChange={e => setForm({ ...form, lob_id: e.target.value })}
            options={[{ value: '', label: 'Select a LOB...' }, ...lobs.map(l => ({ value: l.id, label: l.name }))]}
            required
          />
          <Input
            label="Team Name"
            placeholder="e.g., Platform Engineering"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })}
            required
          />
          <Input
            label="Slug"
            placeholder="platform-engineering"
            value={form.slug}
            onChange={e => setForm({ ...form, slug: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            placeholder="Optional description..."
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
        title="Edit Team"
        subtitle="Update team details"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-team-form" loading={saving}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-team-form" onSubmit={handleEdit} className="space-y-4">
          <Input
            label="Team Name"
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
        title="Delete Team"
        message={`Delete "${deleteTarget?.name}"? All project assignments and member associations will be removed.`}
        confirmLabel="Delete"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
