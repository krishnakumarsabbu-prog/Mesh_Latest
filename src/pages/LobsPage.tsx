import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus, Building2, FolderOpen, Users, Trash2, Pencil,
  Search, SlidersHorizontal, LayoutGrid, List, ShieldCheck,
  UserPlus, UserMinus, ChevronRight, ArrowUpDown, X, Check
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { lobApi, userApi } from '@/lib/api';
import { Lob, LobMember, User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { isSuperAdmin } from '@/lib/permissions';
import { HierarchyMap } from '@/components/charts/HierarchyMap';

type SortKey = 'name' | 'project_count' | 'member_count' | 'created_at';
type ViewMode = 'grid' | 'table';

const PRESET_COLORS = [
  '#0A84FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

export function LobsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [lobs, setLobs] = useState<Lob[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Lob | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lob | null>(null);
  const [adminTarget, setAdminTarget] = useState<Lob | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', slug: '', description: '', color: '#0A84FF' });
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#0A84FF' });

  const [admins, setAdmins] = useState<LobMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle('Lines of Business');
    setBreadcrumbs([{ label: 'Lines of Business' }]);
    fetchLobs();
  }, []);

  const fetchLobs = async () => {
    try {
      const res = await lobApi.list();
      setLobs(res.data);
    } catch {
      notify.error('Failed to load LOBs');
    } finally {
      setLoading(false);
    }
  };

  const filteredSorted = useMemo(() => {
    let result = [...lobs];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) => l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let av: string | number = ((a as unknown as Record<string, unknown>)[sortKey] as string | number) ?? '';
      let bv: string | number = ((b as unknown as Record<string, unknown>)[sortKey] as string | number) ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [lobs, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await lobApi.create({ ...form, tenant_id: user?.tenant_id || 'default' });
      notify.success('LOB created');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', color: '#0A84FF' });
      fetchLobs();
    } catch (err: unknown) {
      notify.error('Failed to create LOB', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await lobApi.update(editTarget.id, editForm);
      notify.success('LOB updated');
      setEditTarget(null);
      fetchLobs();
    } catch (err: unknown) {
      notify.error('Failed to update LOB', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (lob: Lob, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(lob);
    setEditForm({ name: lob.name, description: lob.description || '', color: lob.color });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await lobApi.delete(deleteTarget.id);
      notify.success('LOB deleted');
      setDeleteTarget(null);
      fetchLobs();
    } catch {
      notify.error('Failed to delete LOB');
    } finally {
      setSaving(false);
    }
  };

  const openAdminModal = async (lob: Lob, e: React.MouseEvent) => {
    e.stopPropagation();
    setAdminTarget(lob);
    setAdminLoading(true);
    setAdmins([]);
    setAllUsers([]);
    setUserSearch('');
    try {
      const [adminsRes, usersRes] = await Promise.all([
        lobApi.getAdmins(lob.id),
        userApi.list(),
      ]);
      setAdmins(adminsRes.data);
      setAllUsers(usersRes.data);
    } catch {
      notify.error('Failed to load admin data');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAssignAdmin = async (userId: string) => {
    if (!adminTarget) return;
    setAssigningUserId(userId);
    try {
      await lobApi.assignAdmin(adminTarget.id, userId);
      const res = await lobApi.getAdmins(adminTarget.id);
      setAdmins(res.data);
      fetchLobs();
      notify.success('Admin assigned');
    } catch {
      notify.error('Failed to assign admin');
    } finally {
      setAssigningUserId(null);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (!adminTarget) return;
    setAssigningUserId(userId);
    try {
      await lobApi.removeAdmin(adminTarget.id, userId);
      setAdmins((prev) => prev.filter((a) => a.user_id !== userId));
      fetchLobs();
      notify.success('Admin removed');
    } catch {
      notify.error('Failed to remove admin');
    } finally {
      setAssigningUserId(null);
    }
  };

  const adminUserIds = new Set(admins.map((a) => a.user_id));

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers;
    const q = userSearch.toLowerCase();
    return allUsers.filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [allUsers, userSearch]);

  const lobCount = lobs.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Lines of Business"
        subtitle={`${lobCount} active LOB${lobCount !== 1 ? 's' : ''}`}
        actions={
          superAdmin ? (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
              New LOB
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search LOBs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl outline-none transition-all duration-150"
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 3px var(--accent-subtle)';
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--app-border)';
                  (e.currentTarget as HTMLInputElement).style.boxShadow = '';
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Sort:</span>
              </div>
              {(['name', 'project_count', 'member_count'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-all font-medium"
                  style={sortKey === key
                    ? { background: 'var(--accent-subtle)', borderColor: 'var(--accent)', color: 'var(--accent)' }
                    : { background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--text-secondary)' }
                  }
                >
                  {key === 'name' ? 'Name' : key === 'project_count' ? 'Projects' : 'Members'}
                  {sortKey === key && <ArrowUpDown className="w-3 h-3" />}
                </button>
              ))}

              <div className="w-px h-5" style={{ background: 'var(--app-border)' }} />

              <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
                <button
                  onClick={() => setViewMode('grid')}
                  className="p-1.5 transition-all"
                  style={viewMode === 'grid' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className="p-1.5 transition-all"
                  style={viewMode === 'table' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : filteredSorted.length === 0 ? (
            <Card>
              <EmptyState
                icon={Building2}
                title={search ? 'No matching LOBs' : 'No Lines of Business'}
                description={search ? `No LOBs found matching "${search}".` : 'Create your first LOB to start organizing projects.'}
                action={
                  !search && superAdmin ? (
                    <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Create LOB</Button>
                  ) : undefined
                }
              />
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredSorted.map((lob) => (
                <LobCard
                  key={lob.id}
                  lob={lob}
                  superAdmin={superAdmin}
                  onNavigate={() => navigate(`/lobs/${lob.id}`)}
                  onEdit={(e) => openEdit(lob, e)}
                  onDelete={(e) => { e.stopPropagation(); setDeleteTarget(lob); }}
                  onManageAdmins={(e) => openAdminModal(lob, e)}
                />
              ))}
            </div>
          ) : (
            <LobTable
              lobs={filteredSorted}
              superAdmin={superAdmin}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              onNavigate={(lob) => navigate(`/lobs/${lob.id}`)}
              onEdit={(lob, e) => openEdit(lob, e)}
              onDelete={(lob, e) => { e.stopPropagation(); setDeleteTarget(lob); }}
              onManageAdmins={(lob, e) => openAdminModal(lob, e)}
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
        title="New Line of Business"
        subtitle="Create a new LOB to group related projects"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-lob-form" loading={saving}>Create LOB</Button>
          </>
        }
      >
        <form id="create-lob-form" onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g., Payments Platform"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })}
            required
          />
          <Input
            label="Slug"
            placeholder="e.g., payments-platform"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            placeholder="Optional description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <ColorPicker color={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Line of Business"
        subtitle={editTarget ? `Editing ${editTarget.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-lob-form" loading={saving}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-lob-form" onSubmit={handleEdit} className="space-y-4">
          <Input
            label="Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <TextArea
            label="Description"
            placeholder="Optional description..."
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          />
          <ColorPicker color={editForm.color} onChange={(c) => setEditForm({ ...editForm, color: c })} />
        </form>
      </Modal>

      <Modal
        open={!!adminTarget}
        onClose={() => setAdminTarget(null)}
        title="Manage LOB Admins"
        subtitle={adminTarget ? `Assign or remove admins for ${adminTarget.name}` : ''}
        size="lg"
      >
        {adminLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl shimmer-bg" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {admins.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Current Admins</p>
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'rgba(255,159,10,0.2)', color: '#FF9F0A' }}>
                          {(admin.user_full_name || admin.user_email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{admin.user_full_name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{admin.user_email}</p>
                        </div>
                        <Badge variant="warning" size="xs">Admin</Badge>
                      </div>
                      {superAdmin && (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={assigningUserId === admin.user_id ? undefined : <UserMinus className="w-3.5 h-3.5" />}
                          loading={assigningUserId === admin.user_id}
                          onClick={() => handleRemoveAdmin(admin.user_id)}
                          className="text-danger-500 hover:bg-danger-50"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {admins.length === 0 && (
              <p className="text-sm text-center py-2" style={{ color: 'var(--text-muted)' }}>No admins assigned yet.</p>
            )}

            {superAdmin && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Assign New Admin</p>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-xl outline-none focus-ring"
                    style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No users found</p>
                  ) : (
                    filteredUsers.map((u) => {
                      const isAdminMember = adminUserIds.has(u.id);
                      return (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-2.5 rounded-xl border transition-all"
                          style={{
                            background: isAdminMember ? 'var(--app-bg-subtle)' : 'var(--app-surface)',
                            borderColor: 'var(--app-border)',
                            opacity: isAdminMember ? 0.6 : 1,
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                              {u.full_name[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.full_name}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                            </div>
                          </div>
                          {isAdminMember ? (
                            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#30D158' }}>
                              <Check className="w-3.5 h-3.5" /> Admin
                            </span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="xs"
                              icon={assigningUserId === u.id ? undefined : <UserPlus className="w-3 h-3" />}
                              loading={assigningUserId === u.id}
                              onClick={() => handleAssignAdmin(u.id)}
                            >
                              Assign
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete LOB"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This will deactivate the LOB and cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}

interface LobCardProps {
  lob: Lob;
  superAdmin: boolean;
  onNavigate: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onManageAdmins: (e: React.MouseEvent) => void;
}

function LobCard({ lob, superAdmin, onNavigate, onEdit, onDelete, onManageAdmins }: LobCardProps) {
  const teamCount = (lob as any).team_count ?? 0;
  const componentCount = (lob as any).component_count ?? 0;
  const totalConnectors = (lob as any).total_connectors ?? 0;
  const healthyConnectors = (lob as any).healthy_connectors ?? 0;
  const healthPct = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : null;
  const healthColor = healthPct === null ? '#8E8E93' : healthPct >= 80 ? '#30D158' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';
  const healthLabel = healthPct === null ? 'No Data' : healthPct >= 80 ? 'Healthy' : healthPct >= 60 ? 'Degraded' : 'Critical';

  return (
    <div
      className="group relative rounded-2xl cursor-pointer overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-lg)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLElement).style.transform = '';
      }}
      onClick={onNavigate}
    >
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${lob.color}, ${lob.color}88)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ backgroundColor: lob.color + '20' }}>
              <Building2 className="w-5 h-5" style={{ color: lob.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{lob.name}</h3>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{lob.slug}</p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 ml-2"
            style={{ background: healthColor + '18', color: healthColor, border: `1px solid ${healthColor}30` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: healthColor }} />
            {healthLabel}
          </span>
        </div>

        {lob.description && (
          <p className="text-xs mb-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{lob.description}</p>
        )}

        {/* Hierarchy Counts */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Teams', value: teamCount },
            { label: 'Projects', value: componentCount },
            { label: 'Components', value: lob.project_count },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border-subtle)' }}>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
              <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Connector Health Bar */}
        {totalConnectors > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Connector Health</span>
              <span className="text-[10px] font-bold" style={{ color: healthColor }}>{healthPct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${healthPct}%`, background: healthColor }} />
            </div>
            <div className="mt-1">
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{healthyConnectors}/{totalConnectors} connectors healthy</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--app-border-subtle)' }}>
          <Badge variant={lob.is_active ? 'active' : 'inactive'} size="xs">{lob.is_active ? 'Active' : 'Inactive'}</Badge>
          <div className="flex items-center gap-1">
            {superAdmin && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onEdit} className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={onManageAdmins} className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#FF9F0A'; e.currentTarget.style.background = 'rgba(255,159,10,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}><ShieldCheck className="w-3.5 h-3.5" /></button>
                <button onClick={onDelete} className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <ChevronRight className="w-3.5 h-3.5 transition-colors" style={{ color: 'var(--text-disabled)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface LobTableProps {
  lobs: Lob[];
  superAdmin: boolean;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  onNavigate: (lob: Lob) => void;
  onEdit: (lob: Lob, e: React.MouseEvent) => void;
  onDelete: (lob: Lob, e: React.MouseEvent) => void;
  onManageAdmins: (lob: Lob, e: React.MouseEvent) => void;
}

function LobTable({ lobs, superAdmin, sortKey, sortDir, onSort, onNavigate, onEdit, onDelete, onManageAdmins }: LobTableProps) {
  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      onClick={() => onSort(k)}
      className="flex items-center gap-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider hover:text-neutral-700 transition-colors"
    >
      {label}
      <ArrowUpDown className={cn('w-3 h-3', sortKey === k ? 'text-primary-500' : 'text-neutral-300')} />
    </button>
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--app-border)', background: 'var(--app-surface)' }}>
      <table className="w-full">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-subtle)' }}>
            <th className="px-5 py-3 text-left"><SortHeader label="Name" k="name" /></th>
            <th className="px-5 py-3 text-left hidden md:table-cell">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Description</span>
            </th>
            <th className="px-5 py-3 text-center"><SortHeader label="Projects" k="project_count" /></th>
            <th className="px-5 py-3 text-center"><SortHeader label="Members" k="member_count" /></th>
            <th className="px-5 py-3 text-center">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</span>
            </th>
            {superAdmin && (
              <th className="px-5 py-3 text-right">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lobs.map((lob) => (
            <tr
              key={lob.id}
              className="group transition-colors cursor-pointer border-b"
              style={{ borderColor: 'var(--app-border-subtle)' }}
              onClick={() => onNavigate(lob)}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-subtle)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: lob.color + '20' }}
                  >
                    <Building2 className="w-4 h-4" style={{ color: lob.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{lob.name}</p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{lob.slug}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 hidden md:table-cell">
                <p className="text-sm truncate max-w-xs" style={{ color: 'var(--text-secondary)' }}>{lob.description || '\u2014'}</p>
              </td>
              <td className="px-5 py-3.5 text-center">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{lob.project_count}</span>
              </td>
              <td className="px-5 py-3.5 text-center">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{lob.member_count}</span>
              </td>
              <td className="px-5 py-3.5 text-center">
                <Badge variant={lob.is_active ? 'active' : 'inactive'} size="xs">
                  {lob.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              {superAdmin && (
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(lob, e); }}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onManageAdmins(lob, e); }}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#FF9F0A'; e.currentTarget.style.background = 'rgba(255,159,10,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(lob, e); }}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

function ColorPicker({ color, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>Color</label>
      <div className="flex items-center gap-2.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'w-7 h-7 rounded-full transition-all border-2',
              color === c ? 'border-neutral-800 scale-110' : 'border-transparent hover:scale-105'
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="flex items-center gap-2 ml-1">
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded-full cursor-pointer border-2 border-transparent"
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{color}</span>
        </div>
      </div>
    </div>
  );
}
