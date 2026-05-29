import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedConnectorConfig {
  catalogEntryId: string;
  catalogEntryName: string;
  endpointUrl: string;
  authType: string;
  // Non-secret config
  config: Record<string, string>;
  // Credentials stored as-is (in-memory/localStorage only — no server transmission)
  credentials: Record<string, string>;
  savedAt: string;
}

interface ConnectorConfigStore {
  configs: Record<string, SavedConnectorConfig>;
  save: (config: SavedConnectorConfig) => void;
  remove: (catalogEntryId: string) => void;
  get: (catalogEntryId: string) => SavedConnectorConfig | undefined;
}

export const useConnectorConfigStore = create<ConnectorConfigStore>()(
  persist(
    (set, get) => ({
      configs: {},

      save: (config) => {
        set((state) => ({
          configs: { ...state.configs, [config.catalogEntryId]: config },
        }));
      },

      remove: (catalogEntryId) => {
        set((state) => {
          const next = { ...state.configs };
          delete next[catalogEntryId];
          return { configs: next };
        });
      },

      get: (catalogEntryId) => get().configs[catalogEntryId],
    }),
    {
      name: 'healthmesh-connector-configs',
    }
  )
);
