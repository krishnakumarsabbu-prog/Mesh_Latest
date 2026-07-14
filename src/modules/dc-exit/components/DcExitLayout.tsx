/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DcExitLayout - the overall module layout. Composes the module
 * sidebar (phase navigation), a sticky header (breadcrumb + page
 * header + status/score), a sticky phase stepper, and an outlet
 * for the step pages. Renders within the global AppLayout content
 * area, so it respects the existing fixed sidebar + header.
 *
 * Design language: Harness.io IDP — enterprise, minimal, no gradients.
 */

import React from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { DcExitSidebar } from './DcExitSidebar';
import { DcExitHeader } from './DcExitHeader';
import { PhaseStepper } from './PhaseStepper';
import { DC_EXIT_PHASES, type DcExitStepId } from '@/modules/dc-exit/types';
import { getPhaseByPath } from '@/modules/dc-exit/utils';
import { useDcExitSession } from '@/modules/dc-exit/hooks/useDcExitSession';
import type { DcExitCrumb } from './DcExitBreadcrumb';

function useCurrentStep(): DcExitStepId {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const stepSegment = segments[segments.length - 1] ?? 'discover';
  const phase = getPhaseByPath(stepSegment);
  return (phase?.id ?? 'discover') as DcExitStepId;
}

export function DcExitLayout() {
  const { sessionId } = useDcExitSession();
  const currentStep = useCurrentStep();
  const phase = getPhaseByPath(currentStep) ?? DC_EXIT_PHASES[0];

  const breadcrumbs: DcExitCrumb[] = [
    { label: 'Enterprise', href: '/runtime-location' },
    { label: 'DC Exit', href: sessionId ? `/dc-exit/${sessionId}` : undefined },
    ...(sessionId ? [{ label: sessionId }] : []),
    { label: phase.label },
  ];

  return (
    <div className="flex gap-5 -mx-6 -my-6 min-h-[calc(100vh-52px)]">
      {/* Module sidebar — sticky so it stays in view while content scrolls */}
      <div
        className="sticky top-[52px] self-start flex-shrink-0"
        style={{ height: 'calc(100vh - 52px)' }}
      >
        <DcExitSidebar currentStep={currentStep} />
      </div>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky header + stepper */}
        <div
          className="sticky top-[52px] z-10 flex flex-col gap-4 pt-5 pb-4 px-1"
          style={{
            background: 'var(--app-bg)',
            borderBottom: '1px solid var(--app-border)',
          }}
        >
          <DcExitHeader
            title={phase.label}
            subtitle={phase.description}
            breadcrumbs={breadcrumbs}
            status="in-progress"
            statusLabel="In Progress"
          />
          <PhaseStepper currentStep={currentStep} />
        </div>

        {/* Step content outlet */}
        <div className="flex-1 px-1 py-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
