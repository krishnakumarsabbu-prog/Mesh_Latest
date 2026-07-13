import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuthStore } from '@/store/authStore';
import { ChatWidget } from '@/components/chat/ChatWidget';

// Eagerly loaded — small and needed on every route
import { NotFoundPage } from '@/pages/NotFoundPage';

// Lazily loaded pages
const RuntimeLocationPage = React.lazy(() => import('./pages/RuntimeLocationPage').then(m => ({ default: m.RuntimeLocationPage })));
const LOBViewPage = React.lazy(() => import('./pages/LOBViewPage').then(m => ({ default: m.LOBViewPage })));
const NeighbourhoodViewPage = React.lazy(() => import('./pages/NeighbourhoodViewPage').then(m => ({ default: m.NeighbourhoodViewPage })));
const ApplicationLocationDetailPage = React.lazy(() => import('./pages/ApplicationLocationDetailPage').then(m => ({ default: m.ApplicationLocationDetailPage })));
const RuntimeTruthPage = React.lazy(() => import('./pages/RuntimeTruthPage').then(m => ({ default: m.RuntimeTruthPage })));
const UsersPage = React.lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const AuditPage = React.lazy(() => import('./pages/AuditPage').then(m => ({ default: m.AuditPage })));
const OntologyExplorerPage = React.lazy(() => import('./pages/OntologyExplorerPage').then(m => ({ default: m.OntologyExplorerPage })));


function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 bg-white/10 rounded-xl w-64" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white/10 rounded-2xl" />
        ))}
      </div>
      <div className="h-64 bg-white/10 rounded-2xl" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/runtime-location" replace />} />
            <Route path="runtime-location" element={<Lazy><RuntimeLocationPage /></Lazy>} />
            <Route path="runtime-location/:appId" element={<Lazy><ApplicationLocationDetailPage /></Lazy>} />
            <Route path="runtime-truth" element={<Lazy><RuntimeTruthPage /></Lazy>} />
            <Route path="lob-view" element={<Lazy><LOBViewPage /></Lazy>} />
            <Route path="neighbourhood-view" element={<Lazy><NeighbourhoodViewPage /></Lazy>} />
            <Route path="ontology-explorer" element={<Lazy><OntologyExplorerPage /></Lazy>} />
            <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
            <Route path="audit" element={<Lazy><AuditPage /></Lazy>} />

          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ChatWidget />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
