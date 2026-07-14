/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Type definitions for the dc-exit workflow.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Search as SearchIcon,
  Gauge as GaugeIcon,
  GitBranch as GitBranchIcon,
  Rocket as RocketIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react';

export type DcExitStepId = 'discover' | 'analyze' | 'decide' | 'execute' | 'validate';

export type DcExitStepStatus = 'pending' | 'in-progress' | 'complete';

export interface DcExitSession {
  sessionId: string;
  currentStep: DcExitStepId;
  dataCenterShort: string;
  targetDataCenterShort?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DcExitStepState {
  id: DcExitStepId;
  label: string;
  status: DcExitStepStatus;
}

export interface DcExitPhaseConfig {
  id: DcExitStepId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  path: string;
}

export const DC_EXIT_PHASES: DcExitPhaseConfig[] = [
  {
    id: 'discover',
    label: 'Discover',
    shortLabel: '1',
    description: 'Inventory assets & dependencies in scope',
    icon: SearchIcon,
    path: 'discover',
  },
  {
    id: 'analyze',
    label: 'Analyze',
    shortLabel: '2',
    description: 'Assess impact, risk & complexity',
    icon: GaugeIcon,
    path: 'analyze',
  },
  {
    id: 'decide',
    label: 'Decide',
    shortLabel: '3',
    description: 'Select migration wave & strategy',
    icon: GitBranchIcon,
    path: 'decide',
  },
  {
    id: 'execute',
    label: 'Execute',
    shortLabel: '4',
    description: 'Carry out the migration plan',
    icon: RocketIcon,
    path: 'execute',
  },
  {
    id: 'validate',
    label: 'Validate',
    shortLabel: '5',
    description: 'Confirm cutover & post-exit health',
    icon: CircleCheckIcon,
    path: 'validate',
  },
];
