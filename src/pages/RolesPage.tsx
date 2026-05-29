import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Save, RotateCcw, ChevronDown, ChevronRight, Eye, Users, Lock, Settings2, ChartBar as BarChart2, Layers, TriangleAlert as AlertTriangle, Check } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { rbacApi } from '@/lib/api';
import { UserRole } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/store/notificationStore';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_COLORS, ALL_ROLES, ENTITIES, ACTIONS, Action, Entity, canManageRoles, isSuperAdmin } from '@/lib/permissions';
import { PermissionMatrix } from '@/components/rbac/PermissionMatrix';
import { ScopedAssignmentsPanel } from '@/components/rbac/ScopedAssignmentsPanel';
import { cn } from '@/lib/utils';

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  super_admin: <Lock className="w-4 h-4" />,
  admin: <Settings2 className="w-4 h-4" />,
  lob_admin: <Layers className="w-4 h-4" />,
  project_admin: <Shield className="w-4 h-4" />,
  project_user: <Users className="w-4 h-4" />,
  analyst: <BarChart2 className="w-4 h-4" />,
  viewer: <Eye className="w-4 h-4" />,
};

type TabId = 'matrix' | 'edit' | 'scoped';

export function RolesPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user: currentUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabId>('matrix');
  const [selectedRole, setSelectedRole] = useState<UserRole>('lob_admin');
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [editingPerms, setEditingPerms] = useState<Set<string>>(new Set());
  const [originalPerms, setOriginalPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const canManage = currentUser ? canManageRoles(currentUser.role) : false;
  const isSA = currentUser ? isSuperAdmin(currentUser.role) : false;

  useEffect(() => {
    setPageTitle('Roles & Permissions');
    setBreadcrumbs([{ label: 'Roles & Permissions' }]);
  }, []);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rbacApi.getMatrix();
      setMatrix(res.data.matrix ?? {});
    } catch {
      notify.error('Failed to load permission matrix');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  useEffect(() => {
    if (matrix[selectedRole]) {
      const perms = new Set(matrix[selectedRole]);
      setEditingPerms(new Set(perms));
      setOriginalPerms(new Set(perms));
      setIsDirty(false);
    }
  }, [selectedRole, matrix]);

  const handleToggle = (entity: Entity, action: Action) => {
    if (!canManage) return;
    const key = `${entity}:${action}`;
    const next = new Set(editingPerms);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setEditingPerms(next);
    const orig = originalPerms;
    const changed = [...next].some((k) => !orig.has(k)) || [...orig].some((k) => !next.has(k));
    setIsDirty(changed);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await rbacApi.setRolePermissions(selectedRole, [...editingPerms]);
      notify.success(`Permissions updated for ${ROLE_LABELS[selectedRole]}`);
      fetchMatrix();
      setIsDirty(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notify.error('Failed to save permissions', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditingPerms(new Set(originalPerms));
    setIsDirty(false);
  };

  const addedCount = [...editingPerms].filter((k) => !originalPerms.has(k)).length;
  const removedCount = [...originalPerms].filter((k) => !editingPerms.has(k)).length;

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage role definitions, permission assignments, and access scoping"
      />

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--app-bg-muted)', width: 'fit-content' }}>
        {[
          { id: 'matrix' as TabId, label: 'Permission Matrix' },
          { id: 'edit' as TabId, label: 'Edit Role Permissions' },
          { id: 'scoped' as TabId, label: 'Scoped Assignments' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
            style={{
              background: activeTab === tab.id ? 'var(--app-surface)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'matrix' && (
        <Card padding="none">
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Permission Matrix — All Roles
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Overview of permissions granted per role across all entities
            </p>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'var(--app-bg-muted)' }} />
                ))}
              </div>
            ) : (
              <PermissionMatrix matrix={matrix} />
            )}
          </div>
        </Card>
      )}

      {activeTab === 'edit' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="lg:col-span-1">
            <Card padding="none">
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
                <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Roles</p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
                {ALL_ROLES.map((role) => {
                  const colors = ROLE_COLORS[role];
                  const isSelected = selectedRole === role;
                  const isLocked = role === 'super_admin' && !isSA;
                  return (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group"
                      style={{
                        background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--app-bg-muted)'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', colors.bg)}>
                        <span className={colors.text}>{ROLE_ICONS[role]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {ROLE_LABELS[role]}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {(matrix[role] ?? []).length} permissions
                        </p>
                      </div>
                      {isLocked && <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />}
                      {isSelected && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card padding="none">
              <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', ROLE_COLORS[selectedRole].bg)}>
                    <span className={ROLE_COLORS[selectedRole].text}>{ROLE_ICONS[selectedRole]}</span>
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {ROLE_LABELS[selectedRole]}
                    </h3>
                    <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {ROLE_DESCRIPTIONS[selectedRole]}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isDirty && (
                      <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {addedCount > 0 && <span style={{ color: '#10b981' }}>+{addedCount}</span>}
                        {removedCount > 0 && <span style={{ color: '#ef4444' }}>-{removedCount}</span>}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={handleReset}
                      disabled={!isDirty}
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      icon={<Save className="w-3.5 h-3.5" />}
                      onClick={handleSave}
                      loading={saving}
                      disabled={!isDirty}
                    >
                      Save Changes
                    </Button>
                  </div>
                )}
              </div>

              {!canManage && (
                <div
                  className="flex items-center gap-2 px-5 py-3 border-b"
                  style={{ borderColor: 'var(--app-border)', background: 'rgba(245,158,11,0.06)' }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
                  <p className="text-[12px]" style={{ color: '#f59e0b' }}>
                    You have read-only access to permissions. Only Super Admin and Admin can modify role permissions.
                  </p>
                </div>
              )}

              <div className="p-5">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-9 rounded animate-pulse" style={{ background: 'var(--app-bg-muted)' }} />
                    ))}
                  </div>
                ) : (
                  <PermissionMatrix
                    matrix={matrix}
                    editableRole={canManage ? selectedRole : null}
                    editingPerms={editingPerms}
                    onToggle={canManage ? handleToggle : undefined}
                  />
                )}
              </div>

              <div className="px-5 py-3 border-t flex items-center gap-4" style={{ borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded" style={{ background: 'rgba(16,185,129,0.12)', border: '1.5px solid #10b981' }}>
                    <Check className="w-2.5 h-2.5" style={{ color: '#10b981' }} />
                  </span>
                  Permission granted
                </div>
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded" style={{ background: 'var(--app-bg-muted)', border: '1.5px solid var(--app-border)' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--app-border)' }} />
                  </span>
                  Permission denied
                </div>
                {canManage && (
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Click any cell to toggle
                  </span>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'scoped' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Scoped Role Assignments
                </h3>
              </div>
              <p className="text-[12px] mb-5" style={{ color: 'var(--text-muted)' }}>
                Grant users contextual roles scoped to specific LOBs, teams, or projects, overriding their global role for that resource.
              </p>
              <ScopedAssignmentsPanel />
            </Card>
          </div>

          <div>
            <Card>
              <h3 className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Role Hierarchy
              </h3>
              <div className="space-y-2">
                {ALL_ROLES.map((role, i) => {
                  const colors = ROLE_COLORS[role];
                  return (
                    <div
                      key={role}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'var(--app-bg-muted)' }}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--app-border-medium)', color: 'var(--text-muted)' }}>
                        {ALL_ROLES.length - i}
                      </div>
                      <div className={cn('flex items-center gap-2 flex-1')}>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', colors.bg, colors.text, colors.border)}>
                          {ROLE_LABELS[role]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
