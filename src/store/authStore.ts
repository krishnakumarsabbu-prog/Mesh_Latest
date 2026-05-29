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

function parseTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function silentRefresh(refresh_token: string): Promise<{ access_token: string; refresh_token: string; user: User } | null> {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,
      _refreshTimer: null,

      setAuth: (user, access_token, refresh_token) => {
        set({ user, access_token, refresh_token, isAuthenticated: true });
        get().scheduleRefresh();
      },

      setTokens: (access_token, refresh_token) => {
        set({ access_token, refresh_token });
        get().scheduleRefresh();
      },

      logout: () => {
        get().cancelRefresh();
        set({ user: null, access_token: null, refresh_token: null, isAuthenticated: false, _refreshTimer: null });
      },

      scheduleRefresh: () => {
        const { access_token, refresh_token, cancelRefresh } = get();
        cancelRefresh();

        if (!access_token || !refresh_token) return;

        const expiry = parseTokenExpiry(access_token);
        if (!expiry) return;

        // Fire refresh 60 seconds before the token expires
        const delay = expiry - Date.now() - 60_000;
        if (delay <= 0) {
          // Already within the 60s window — refresh immediately
          silentRefresh(refresh_token).then((result) => {
            if (result) {
              get().setTokens(result.access_token, result.refresh_token);
              set({ user: result.user });
            } else {
              get().logout();
            }
          });
          return;
        }

        const timer = setTimeout(async () => {
          const { refresh_token: rt } = get();
          if (!rt) return;
          const result = await silentRefresh(rt);
          if (result) {
            get().setTokens(result.access_token, result.refresh_token);
            set({ user: result.user });
          } else {
            get().logout();
          }
        }, delay);

        set({ _refreshTimer: timer });
      },

      cancelRefresh: () => {
        const { _refreshTimer } = get();
        if (_refreshTimer) {
          clearTimeout(_refreshTimer);
          set({ _refreshTimer: null });
        }
      },
    }),
    {
      name: 'healthmesh-auth',
      partialize: (state) => ({
        access_token: state.access_token,
        refresh_token: state.refresh_token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-arm the refresh timer after page reload
        if (state?.isAuthenticated && state.access_token) {
          setTimeout(() => state.scheduleRefresh(), 0);
        }
      },
    }
  )
);
