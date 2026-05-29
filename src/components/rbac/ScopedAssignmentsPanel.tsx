import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Shield, ChevronDown } from 'lucide-react';
import { rbacApi, userApi } from '@/lib/api';
import { User, UserRole } from '@/types';
import { notify } from '@/store/notificationStore';
import { ROLE_LABELS, ROLE_COLORS, ALL_ROLES } from '@/lib/permissions';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

interface ScopedAssignment {
  id: string;
  user_id: string;
  role: string;
  scope_type: string;
  scope_id: string;
  granted_by?: string;
  is_active: boolean;
  created_at?: string;
}

interface AssignForm {
  user_id: string;
  role: string;
  scope_type: string;
  scope_id: string;
}

const DEFAULT_FORM: AssignForm = { user_id: '', role: 'project_user', scope_type: 'project', scope_id: '' };

const SCOPE_TYPES = ['lob', 'team', 'project', 'global'];

export function ScopedAssignmentsPanel() {
  const [assignments, setAssignments] = useState<ScopedAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssignForm>({ ...DEFAULT_FORM });
  const [scopeFilter, setScopeFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [assignRes, userRes] = await Promise.all([
        rbacApi.getScopedAssignments(scopeFilter ? { scope_type: scopeFilter } : undefined),
        userApi.list(),
      ]);
      setAssignments(assignRes.data);
      setUsers(userRes.data);
    } catch {
      notify.error('Failed to load scoped assignments');
    } finally {
      setLoading(false);
    }
  }, [scopeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.user_id || !form.scope_id) {
      notify.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      await rbacApi.createScopedAssignment(form);
      notify.success('Scoped assignment created');
      setCreateOpen(false);
      setForm({ ...DEFAULT_FORM });
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notify.error('Failed to create assignment', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await rbacApi.revokeScopedAssignment(id);
      notify.success('Assignment revoked');
      fetchData();
    } catch {
      notify.error('Failed to revoke assignment');
    }
  };

  const getUserName = (userId: string) => {
    const u = users.find((u) => u.id === userId);
    return u ? `${u.full_name} (${u.email})` : userId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-[12px] rounded-xl outline-none"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="">All Scopes</option>
            {SCOPE_TYPES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreateOpen(true)}>
          Add Assignment
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--app-bg-muted)' }} />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="py-12 text-center">
          <Shield className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No scoped assignments found</p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border overflow-hidden" style={{ borderColor: 'var(--app-border)' }}>
          {assignments.map((a) => {
            const roleColors = ROLE_COLORS[a.role as UserRole] ?? ROLE_COLORS.viewer;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 group transition-colors"
                style={{ background: 'var(--app-surface)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-bg-muted)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--app-surface)'; }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {getUserName(a.user_id)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', roleColors.bg, roleColors.text, roleColors.border)}
                    >
                      {ROLE_LABELS[a.role as UserRole] ?? a.role}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {a.scope_type} / <span style={{ color: 'var(--text-secondary)' }}>{a.scope_id.slice(0, 12)}...</span>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(a.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
                  title="Revoke assignment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Scoped Assignment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="scoped-assign-form" loading={saving}>Assign</Button>
          </>
        }
      >
        <form id="scoped-assign-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              User
            </label>
            <div className="relative">
              <select
                value={form.user_id}
                onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                required
                className="w-full appearance-none pl-3 pr-7 py-2.5 text-[13px] rounded-xl outline-none"
                style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
              >
                <option value="">Select user...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Role</label>
            <div className="relative">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full appearance-none pl-3 pr-7 py-2.5 text-[13px] rounded-xl outline-none"
                style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
              >
                {ALL_ROLES.filter((r) => r !== 'super_admin').map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Scope Type</label>
            <div className="relative">
              <select
                value={form.scope_type}
                onChange={(e) => setForm({ ...form, scope_type: e.target.value })}
                className="w-full appearance-none pl-3 pr-7 py-2.5 text-[13px] rounded-xl outline-none"
                style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
              >
                {SCOPE_TYPES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Scope ID <span style={{ color: 'var(--text-muted)' }}>(entity ID)</span>
            </label>
            <input
              type="text"
              value={form.scope_id}
              onChange={(e) => setForm({ ...form, scope_id: e.target.value })}
              placeholder="Enter the resource ID..."
              required
              className="w-full px-3 py-2.5 text-[13px] rounded-xl outline-none"
              style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
