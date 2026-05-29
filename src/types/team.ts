export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color: string;
  icon: string;
  lob_id: string;
  is_active: boolean;
  tenant_id: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  project_count: number;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user_email?: string;
  user_full_name?: string;
  user_avatar_url?: string;
}

export interface TeamProject {
  id: string;
  team_id: string;
  project_id: string;
  assigned_at: string;
  project_name?: string;
  project_color?: string;
  project_status?: string;
  project_environment?: string;
  connector_count: number;
  healthy_count: number;
}
