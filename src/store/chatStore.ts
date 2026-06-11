import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  data?: unknown;
  isHtml?: boolean;
}

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  prefilledInput: string | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  setPrefilledInput: (input: string | null) => void;
  clearPrefilledInput: () => void;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'bot',
  content: `Hello! I'm <strong>HealthMesh AI</strong>. I can answer questions about your infrastructure.<br/><br/>Try asking:<br/>• "List all applications"<br/>• "Show datacenters for PCP"<br/>• "What is the health status of PCP?"<br/>• "List all datacenters"<br/>• "Show neighborhoods for application X"`,
  timestamp: new Date(),
  isHtml: true,
};

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  messages: [WELCOME],
  isLoading: false,
  prefilledInput: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: `${Date.now()}-${Math.random()}`, timestamp: new Date() },
      ],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  clearMessages: () => set({ messages: [{ ...WELCOME, timestamp: new Date() }] }),

  setPrefilledInput: (input) => set({ prefilledInput: input }),
  clearPrefilledInput: () => set({ prefilledInput: null }),
}));
