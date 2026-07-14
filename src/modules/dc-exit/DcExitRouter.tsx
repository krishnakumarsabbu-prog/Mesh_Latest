/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Module-level router. Wraps the five workflow step routes in the
 * DcExitLayout (sidebar + header + phase stepper). The layout's
 * <Outlet /> renders the active step page.
 *
 * Mounted from App.tsx under /dc-exit/:sessionId/*.
 */

import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { DcExitLayout } from './components/DcExitLayout';

// Lazy-load step pages so each stays a separate bundle.
const DiscoverPage = React.lazy(() =>
  import('./pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })),
);
const AnalyzePage = React.lazy(() =>
  import('./pages/AnalyzePage').then((m) => ({ default: m.AnalyzePage })),
);
const DecidePage = React.lazy(() =>
  import('./pages/DecidePage').then((m) => ({ default: m.DecidePage })),
);
const ExecutePage = React.lazy(() =>
  import('./pages/ExecutePage').then((m) => ({ default: m.ExecutePage })),
);
const ValidatePage = React.lazy(() =>
  import('./pages/ValidatePage').then((m) => ({ default: m.ValidatePage })),
);

function StepSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-[6px] bg-[var(--app-bg-muted)]" />
      <div className="h-32 rounded-[8px] bg-[var(--app-bg-muted)]" />
    </div>
  );
}

/**
 * Guards the step param so only known workflow steps resolve.
 * Unknown steps redirect back to the first step of the session.
 */
function GuardedStep({ step }: { step: string }) {
  const { sessionId } = useParams();
  const known: Record<string, React.ReactNode> = {
    discover: <DiscoverPage />,
    analyze: <AnalyzePage />,
    decide: <DecidePage />,
    execute: <ExecutePage />,
    validate: <ValidatePage />,
  };
  const element = known[step];
  if (!element) {
    return <Navigate to={`/dc-exit/${sessionId ?? ''}/discover`} replace />;
  }
  return element;
}

export function DcExitRouter() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<DcExitLayout />}>
          <Route index element={<Navigate to="discover" replace />} />
          <Route path="discover" element={<GuardedStep step="discover" />} />
          <Route path="analyze" element={<GuardedStep step="analyze" />} />
          <Route path="decide" element={<GuardedStep step="decide" />} />
          <Route path="execute" element={<GuardedStep step="execute" />} />
          <Route path="validate" element={<GuardedStep step="validate" />} />
          <Route path="*" element={<Navigate to="discover" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
