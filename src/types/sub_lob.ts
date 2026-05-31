export interface SubLob {
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
  team_count: number;
  project_count: number;
  member_count: number;
  component_count?: number;
  total_connectors?: number;
  healthy_connectors?: number;
}

export interface SubLobMember {
  id: string;
  sub_lob_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user_email?: string;
  user_full_name?: string;
  user_avatar_url?: string;
}
