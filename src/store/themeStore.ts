import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'harness' | 'harness-dark' | 'graphite' | 'aurora' | 'frost';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  preview: string[];
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'harness',
    name: 'Harness Light',
    description: 'Enterprise DevOps — Light',
    preview: ['#0F1829', '#F4F5F7', '#006CFF', '#00B074'],
  },
  {
    id: 'harness-dark',
    name: 'Harness Dark',
    description: 'Enterprise DevOps — Dark',
    preview: ['#0B0F19', '#1E2533', '#006CFF', '#00B074'],
  },
  {
    id: 'graphite',
    name: 'Graphite Neon',
    description: 'Graphite + Neon Observability',
    preview: ['#0B0F19', '#161B26', '#00E599', '#3B82F6'],
  },
  {
    id: 'aurora',
    name: 'Aurora Dark',
    description: 'Aurora Gradient Dark',
    preview: ['#0D1117', '#1A1B2E', '#7C3AED', '#00E599'],
  },
  {
    id: 'frost',
    name: 'Executive Frost',
    description: 'Pearl Glass Light',
    preview: ['#F7F8FA', '#EEF1F5', '#00B87A', '#2563EB'],
  },
];

interface ThemeStore {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'harness',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'healthmesh-theme',
    }
  )
);
