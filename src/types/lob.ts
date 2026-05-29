export interface Lob {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color: string;
  icon: string;
  is_active: boolean;
  tenant_id: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  project_count: number;
  member_count: number;
}

export interface LobMember {
  id: string;
  lob_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user_email?: string;
  user_full_name?: string;
  user_avatar_url?: string;
}
