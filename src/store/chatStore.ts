import { create } from 'zustand';

interface ChatStore {
  prefilledInput: string | null;
  setPrefilledInput: (input: string) => void;
  clearPrefilledInput: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  prefilledInput: null,
  setPrefilledInput: (input) => set({ prefilledInput: input }),
  clearPrefilledInput: () => set({ prefilledInput: null }),
}));
