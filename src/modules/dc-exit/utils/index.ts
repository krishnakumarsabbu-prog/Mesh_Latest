/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Utility helpers for the dc-exit workflow.
 */

import { DC_EXIT_PHASES, type DcExitStepId, type DcExitPhaseConfig } from '@/modules/dc-exit/types';

export function getPhaseByPath(path: string): DcExitPhaseConfig | undefined {
  return DC_EXIT_PHASES.find((p) => p.path === path || p.id === path);
}

export function getPhaseById(id: DcExitStepId): DcExitPhaseConfig | undefined {
  return DC_EXIT_PHASES.find((p) => p.id === id);
}

export function getPhaseIndex(id: DcExitStepId): number {
  return DC_EXIT_PHASES.findIndex((p) => p.id === id);
}

export function isPhaseComplete(current: DcExitStepId, target: DcExitStepId): boolean {
  return getPhaseIndex(target) < getPhaseIndex(current);
}

export function isPhaseActive(current: DcExitStepId, target: DcExitStepId): boolean {
  return current === target;
}
