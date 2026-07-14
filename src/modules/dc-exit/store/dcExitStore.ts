/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Zustand store for the dc-exit workflow session state.
 */

import { create } from 'zustand';
import type { DcExitSession, DcExitStepId } from '@/modules/dc-exit/types';

interface DcExitStore {
  session: DcExitSession | null;
  activeStep: DcExitStepId;
  setSession: (session: DcExitSession | null) => void;
  setActiveStep: (step: DcExitStepId) => void;
  updateSession: (patch: Partial<DcExitSession>) => void;
}

export const useDcExitStore = create<DcExitStore>((set) => ({
  session: null,
  activeStep: 'discover',
  setSession: (session) => set({ session }),
  setActiveStep: (step) => set({ activeStep: step }),
  updateSession: (patch) =>
    set((state) =>
      state.session
        ? { session: { ...state.session, ...patch, updatedAt: new Date().toISOString() } }
        : state,
    ),
}));
