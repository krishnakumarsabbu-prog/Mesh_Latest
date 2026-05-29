export type ProjectMemberRole = 'project_admin' | 'project_user';

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  assigned_by?: string;
  joined_at: string;
  user_email?: string;
  user_full_name?: string;
  user_avatar_url?: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  lob_id: string;
  team_id?: string;
  team_name?: string;
  component_id?: string;
  component_name?: string;
  status: 'active' | 'inactive' | 'maintenance' | 'archived';
  environment: string;
  tags?: string;
  color: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  connector_count: number;
  healthy_count: number;
  degraded_count: number;
  down_count: number;
  member_count: number;
}

export interface Component {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color: string;
  icon: string;
  team_id: string;
  team_name?: string;
  lob_id: string;
  is_active: boolean;
  tenant_id: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  project_count?: number;
}
