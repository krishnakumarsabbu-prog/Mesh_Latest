import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';

interface AuthStore {
  user: User | null;
  access_token: string | null;
  refresh_token: string | null;
  isAuthenticated: boolean;
  _refreshTimer: ReturnType<typeof setTimeout> | null;
  setAuth: (user: User, access_token: string, refresh_token: string) => void;
  setTokens: (access_token: string, refresh_token: string) => void;
  logout: () => void;
  scheduleRefresh: () => void;
  cancelRefresh: () => void;
}

const HARDCODED_USER: User = {
  id: 'demo-user-1',
  email: 'superadmin@livelens.ai',
  full_name: 'Demo Admin',
  role: 'super_admin',
  is_active: true,
  created_at: new Date().toISOString(),
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: HARDCODED_USER,
      access_token: 'hardcoded-token',
      refresh_token: 'hardcoded-refresh-token',
      isAuthenticated: true,
      _refreshTimer: null,

      setAuth: (user, access_token, refresh_token) => {
        set({ user, access_token, refresh_token, isAuthenticated: true });
      },

      setTokens: (access_token, refresh_token) => {
        set({ access_token, refresh_token });
      },

      logout: () => {
        set({ user: HARDCODED_USER, access_token: 'hardcoded-token', refresh_token: 'hardcoded-refresh-token', isAuthenticated: true, _refreshTimer: null });
      },

      scheduleRefresh: () => {},
      cancelRefresh: () => {},
    }),
    {
      name: 'healthmesh-auth',
      partialize: (state) => ({
        access_token: state.access_token,
        refresh_token: state.refresh_token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
