import React from 'react';
import { Check, X } from 'lucide-react';
import { UserRole } from '@/types';
import { ROLE_LABELS, ACTIONS, ENTITIES, Action, Entity } from '@/lib/permissions';

interface Props {
  matrix: Record<string, string[]>;
  editableRole?: string | null;
  editingPerms?: Set<string>;
  onToggle?: (entity: Entity, action: Action) => void;
  compact?: boolean;
}

const ENTITY_LABELS: Record<Entity, string> = {
  users: 'Users',
  lobs: 'LOBs',
  teams: 'Teams',
  projects: 'Projects',
  connectors: 'Connectors',
  metrics: 'Metrics',
  dashboards: 'Dashboards',
  monitoring_profiles: 'Monitoring',
  analytics: 'Analytics',
  settings: 'Settings',
  roles_permissions: 'Roles & Perms',
};

const ACTION_LABELS: Record<Action, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
  execute: 'Execute',
  assign: 'Assign',
  manage: 'Manage',
};

export function PermissionMatrix({ matrix, editableRole, editingPerms, onToggle, compact = false }: Props) {
  const roles = Object.keys(matrix) as UserRole[];

  if (editableRole && editingPerms !== undefined && onToggle) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th
                className="text-left py-2 pr-4 font-semibold sticky left-0 z-10"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--app-surface)',
                  minWidth: 130,
                }}
              >
                Entity
              </th>
              {ACTIONS.map((action) => (
                <th
                  key={action}
                  className="text-center py-2 px-2 font-semibold capitalize"
                  style={{ color: 'var(--text-secondary)', minWidth: 72 }}
                >
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENTITIES.map((entity) => (
              <tr
                key={entity}
                className="border-t"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <td
                  className="py-2 pr-4 font-medium sticky left-0 z-10"
                  style={{
                    color: 'var(--text-primary)',
                    background: 'var(--app-surface)',
                  }}
                >
                  {ENTITY_LABELS[entity]}
                </td>
                {ACTIONS.map((action) => {
                  const key = `${entity}:${action}`;
                  const isGranted = editingPerms.has(key);
                  return (
                    <td key={action} className="text-center py-2 px-2">
                      <button
                        onClick={() => onToggle(entity, action)}
                        className="w-6 h-6 rounded flex items-center justify-center mx-auto transition-all"
                        style={{
                          background: isGranted ? 'rgba(16,185,129,0.12)' : 'var(--app-bg-muted)',
                          border: `1.5px solid ${isGranted ? '#10b981' : 'var(--app-border)'}`,
                        }}
                        title={`${isGranted ? 'Revoke' : 'Grant'} ${action} on ${entity}`}
                      >
                        {isGranted
                          ? <Check className="w-3 h-3" style={{ color: '#10b981' }} />
                          : <X className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        }
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th
              className="text-left py-2 pr-3 font-semibold sticky left-0 z-10"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--app-surface)',
                minWidth: compact ? 90 : 120,
              }}
            >
              Entity / Role
            </th>
            {roles.map((role) => (
              <th
                key={role}
                className="text-center py-2 px-1 font-semibold"
                style={{ color: 'var(--text-secondary)', minWidth: 80 }}
              >
                {ROLE_LABELS[role as UserRole] ?? role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ENTITIES.map((entity) => (
            <React.Fragment key={entity}>
              <tr
                className="border-t"
                style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-muted)' }}
              >
                <td
                  colSpan={roles.length + 1}
                  className="py-1.5 px-2 font-semibold text-[10px] uppercase tracking-wider sticky left-0"
                  style={{ color: 'var(--text-muted)', background: 'var(--app-bg-muted)' }}
                >
                  {ENTITY_LABELS[entity]}
                </td>
              </tr>
              {ACTIONS.map((action) => (
                <tr
                  key={`${entity}-${action}`}
                  className="border-t"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <td
                    className="py-1.5 pr-3 pl-4 sticky left-0 z-10"
                    style={{ color: 'var(--text-secondary)', background: 'var(--app-surface)' }}
                  >
                    {ACTION_LABELS[action]}
                  </td>
                  {roles.map((role) => {
                    const key = `${entity}:${action}`;
                    const has = (matrix[role] ?? []).includes(key);
                    return (
                      <td key={role} className="text-center py-1.5 px-1">
                        {has
                          ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)' }}>
                              <Check className="w-3 h-3" style={{ color: '#10b981' }} />
                            </span>
                          : <span className="inline-flex items-center justify-center w-5 h-5">
                              <X className="w-3 h-3" style={{ color: 'var(--app-border-medium)' }} />
                            </span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
