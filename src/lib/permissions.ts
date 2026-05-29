import { UserRole } from '@/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  lob_admin: 'LOB Admin',
  project_admin: 'Project Admin',
  project_user: 'Project User',
  admin: 'Admin',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Full platform access. Can manage all users, settings, LOBs, and data.',
  lob_admin: 'Manages assigned LOB. Can manage teams, projects, and users within the LOB.',
  project_admin: 'Manages assigned projects. Can configure connectors, dashboards, and monitoring.',
  project_user: 'Read and interact access to assigned project data and connectors.',
  admin: 'Legacy admin role with broad platform access.',
  analyst: 'Read access to analytics, dashboards, and health reports across all resources.',
  viewer: 'Read-only access to assigned resources.',
};

export const ROLE_COLORS: Record<UserRole, { bg: string; text: string; border: string }> = {
  super_admin:   { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100' },
  lob_admin:     { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100' },
  project_admin: { bg: 'bg-sky-50',     text: 'text-sky-600',     border: 'border-sky-100' },
  project_user:  { bg: 'bg-teal-50',    text: 'text-teal-600',    border: 'border-teal-100' },
  admin:         { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100' },
  analyst:       { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100' },
  viewer:        { bg: 'bg-neutral-50', text: 'text-neutral-500', border: 'border-neutral-100' },
};

export const ADMIN_ROLES: UserRole[] = ['super_admin', 'lob_admin', 'project_admin', 'admin'];
export const SUPER_ROLES: UserRole[] = ['super_admin'];
export const LOB_ADMIN_ROLES: UserRole[] = ['super_admin', 'lob_admin', 'admin'];
export const PROJECT_MANAGE_ROLES: UserRole[] = ['super_admin', 'lob_admin', 'project_admin', 'admin'];
export const READ_ONLY_ROLES: UserRole[] = ['analyst', 'viewer', 'project_user'];

export const ENTITIES = [
  'users', 'lobs', 'teams', 'projects', 'connectors',
  'metrics', 'dashboards', 'monitoring_profiles', 'analytics',
  'settings', 'roles_permissions',
] as const;

export const ACTIONS = ['create', 'read', 'update', 'delete', 'execute', 'assign', 'manage'] as const;

export type Entity = typeof ENTITIES[number];
export type Action = typeof ACTIONS[number];

export type PermissionKey = `${Entity}:${Action}`;

export function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isSuperAdmin(role: UserRole): boolean {
  return SUPER_ROLES.includes(role);
}

export function isLobAdmin(role: UserRole): boolean {
  return LOB_ADMIN_ROLES.includes(role);
}

export function canManageProjects(role: UserRole): boolean {
  return PROJECT_MANAGE_ROLES.includes(role);
}

export function canManageUsers(role: UserRole): boolean {
  return isAdmin(role);
}

export function canManageRoles(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (targetRole === 'super_admin') return isSuperAdmin(actorRole);
  return isAdmin(actorRole);
}

export function canViewAnalytics(role: UserRole): boolean {
  return !['viewer'].includes(role);
}

export function canExecuteConnectors(role: UserRole): boolean {
  return role !== 'viewer';
}

export function canCreateLobs(role: UserRole): boolean {
  return isSuperAdmin(role) || role === 'admin';
}

export function canEditLobs(role: UserRole): boolean {
  return isSuperAdmin(role) || role === 'admin';
}

export function canCreateTeams(role: UserRole): boolean {
  return isLobAdmin(role);
}

export function canCreateProjects(role: UserRole): boolean {
  return isLobAdmin(role);
}

export function canManageConnectors(role: UserRole): boolean {
  return PROJECT_MANAGE_ROLES.includes(role);
}

export function canManageDashboards(role: UserRole): boolean {
  return PROJECT_MANAGE_ROLES.includes(role);
}

export function canViewSettings(role: UserRole): boolean {
  return true;
}

export function canManageSettings(role: UserRole): boolean {
  return isSuperAdmin(role) || role === 'admin';
}

export function canViewAuditLogs(role: UserRole): boolean {
  return isAdmin(role);
}

export function hasPermission(userPermissions: string[], entity: Entity, action: Action): boolean {
  return userPermissions.includes(`${entity}:${action}`);
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 7,
  admin: 6,
  lob_admin: 5,
  project_admin: 4,
  project_user: 3,
  analyst: 2,
  viewer: 1,
};

export function getRoleHierarchyLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

export const ALL_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'lob_admin',
  'project_admin',
  'project_user',
  'analyst',
  'viewer',
];
