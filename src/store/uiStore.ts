import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BreadcrumbItem } from '@/types';

interface UIStore {
  sidebarCollapsed: boolean;
  breadcrumbs: BreadcrumbItem[];
  pageTitle: string;
  commandPaletteOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (val: boolean) => void;
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
  setPageTitle: (title: string) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      breadcrumbs: [],
      pageTitle: 'Dashboard',
      commandPaletteOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (val) => set({ sidebarCollapsed: val }),
      setBreadcrumbs: (items) => set({ breadcrumbs: items }),
      setPageTitle: (title) => set({ pageTitle: title }),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
    }),
    {
      name: 'healthmesh-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
