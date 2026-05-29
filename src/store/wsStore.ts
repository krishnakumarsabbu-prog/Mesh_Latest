import { create } from 'zustand';
import type { WsStatus } from '@/hooks/useWebSocket';

interface WsStore {
  globalStatus: WsStatus;
  setGlobalStatus: (status: WsStatus) => void;
}

export const useWsStore = create<WsStore>((set) => ({
  globalStatus: 'disconnected',
  setGlobalStatus: (status) => set({ globalStatus: status }),
}));
