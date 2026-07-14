/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Type definitions for the dc-exit workflow.
 * Placeholder types only - no business logic yet.
 */

export type DcExitStepId = 'discover' | 'analyze' | 'decide' | 'execute' | 'validate';

export interface DcExitSession {
  sessionId: string;
  currentStep: DcExitStepId;
  createdAt: string;
  updatedAt: string;
}

export interface DcExitStepState {
  id: DcExitStepId;
  label: string;
  status: 'pending' | 'in-progress' | 'complete';
}
