import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuthStore } from '@/store/authStore';

// Eagerly loaded — small and needed on every route
import { NotFoundPage } from '@/pages/NotFoundPage';

// Lazily loaded pages
const RuntimeLocationPage = React.lazy(() => import('./pages/RuntimeLocationPage').then(m => ({ default: m.RuntimeLocationPage })));
const ApplicationLocationDetailPage = React.lazy(() => import('./pages/ApplicationLocationDetailPage').then(m => ({ default: m.ApplicationLocationDetailPage })));

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
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
