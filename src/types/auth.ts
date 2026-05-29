export type UserRole = 'super_admin' | 'lob_admin' | 'project_admin' | 'project_user' | 'admin' | 'analyst' | 'viewer';

export interface RoleAssignment {
  id: string;
  user_id: string;
  role: UserRole;
  resource_type?: string;
  resource_id?: string;
  granted_by?: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  tenant_id?: string;
  last_login?: string;
  created_at: string;
  role_assignments?: RoleAssignment[];
}

export interface AuthState {
  user: User | null;
  access_token: string | null;
  refresh_token: string | null;
  isAuthenticated: boolean;
}
