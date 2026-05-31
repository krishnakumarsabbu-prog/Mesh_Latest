import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { isAdmin, canManageRoles } from '@/lib/permissions';

// Eagerly loaded — small and needed on every route
import { NotFoundPage } from '@/pages/NotFoundPage';

// Lazily loaded pages — split into async chunks
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const LobsPage = React.lazy(() => import('./pages/LobsPage').then(m => ({ default: m.LobsPage })));
const LobDetailPage = React.lazy(() => import('./pages/LobDetailPage').then(m => ({ default: m.LobDetailPage })));
const SubLobsPage = React.lazy(() => import('./pages/SubLobsPage').then(m => ({ default: m.SubLobsPage })));
const SubLobsDetailPage = React.lazy(() => import('./pages/SubLobsDetailPage').then(m => ({ default: m.SubLobsDetailPage })));
const LobDashboardsPage = React.lazy(() => import('./pages/LobDashboardsPage').then(m => ({ default: m.LobDashboardsPage })));
const LobLiveDashboardPage = React.lazy(() => import('./pages/LobLiveDashboardPage').then(m => ({ default: m.LobLiveDashboardPage })));
const TeamsPage = React.lazy(() => import('./pages/TeamsPage').then(m => ({ default: m.TeamsPage })));
const TeamsCommandCenterPage = React.lazy(() => import('./pages/TeamsCommandCenterPage').then(m => ({ default: m.TeamsCommandCenterPage })));
const TeamDetailPage = React.lazy(() => import('./pages/TeamDetailPage').then(m => ({ default: m.TeamDetailPage })));
const ComponentDetailPage = React.lazy(() => import('./pages/ComponentDetailPage').then(m => ({ default: m.ComponentDetailPage })));
const ComponentsPage = React.lazy(() => import('./pages/ComponentsPage').then(m => ({ default: m.ComponentsPage })));
const ComponentDashboardsPage = React.lazy(() => import('./pages/ComponentDashboardsPage').then(m => ({ default: m.ComponentDashboardsPage })));
const ComponentLiveDashboardPage = React.lazy(() => import('./pages/ComponentLiveDashboardPage').then(m => ({ default: m.ComponentLiveDashboardPage })));
const TeamDashboardsPage = React.lazy(() => import('./pages/TeamDashboardsPage').then(m => ({ default: m.TeamDashboardsPage })));
const TeamLiveDashboardPage = React.lazy(() => import('./pages/TeamLiveDashboardPage').then(m => ({ default: m.TeamLiveDashboardPage })));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const ProjectHealthDashboardPage = React.lazy(() => import('./pages/ProjectHealthDashboardPage').then(m => ({ default: m.ProjectHealthDashboardPage })));
const ProjectDashboardsPage = React.lazy(() => import('./pages/ProjectDashboardsPage').then(m => ({ default: m.ProjectDashboardsPage })));
const LiveDashboardPage = React.lazy(() => import('./pages/LiveDashboardPage').then(m => ({ default: m.LiveDashboardPage })));
const ConnectorsPage = React.lazy(() => import('./pages/ConnectorsPage').then(m => ({ default: m.ConnectorsPage })));
const ConnectorCatalogPage = React.lazy(() => import('./pages/ConnectorCatalogPage').then(m => ({ default: m.ConnectorCatalogPage })));
const HealthPage = React.lazy(() => import('./pages/HealthPage').then(m => ({ default: m.HealthPage })));
const ChatbotPage = React.lazy(() => import('./pages/ChatbotPage').then(m => ({ default: m.ChatbotPage })));
const UsersPage = React.lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const AuditLogPage = React.lazy(() => import('./pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const RulesPage = React.lazy(() => import('./pages/RulesPage').then(m => ({ default: m.RulesPage })));
const RolesPage = React.lazy(() => import('./pages/RolesPage').then(m => ({ default: m.RolesPage })));
const TopologyPage = React.lazy(() => import('./pages/TopologyPage').then(m => ({ default: m.TopologyPage })));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const RuntimeLocationPage = React.lazy(() => import('./pages/RuntimeLocationPage').then(m => ({ default: m.RuntimeLocationPage })));
const ApplicationLocationDetailPage = React.lazy(() => import('./pages/ApplicationLocationDetailPage').then(m => ({ default: m.ApplicationLocationDetailPage })));
const DashboardBuilderPage = React.lazy(() => import('./pages/DashboardBuilderPage').then(m => ({ default: m.DashboardBuilderPage })));
const DashboardBuilderEditorV2 = React.lazy(() => import('./components/dashboard-builder-v2/DashboardBuilderEditorV2').then(m => ({ default: m.DashboardBuilderEditorV2 })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const OperationsDashboardPage = React.lazy(() => import('./pages/OperationsDashboardPage').then(m => ({ default: m.OperationsDashboardPage })));
const ApplicationRuntimeMetricsPage = React.lazy(() => import('./pages/ApplicationRuntimeMetricsPage').then(m => ({ default: m.ApplicationRuntimeMetricsPage })));

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

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!isAdmin(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireRbacManage({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!canManageRoles(user.role)) return <Navigate to="/dashboard" replace />;
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
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Lazy><DashboardPage /></Lazy>} />
            <Route path="operations" element={<Lazy><OperationsDashboardPage /></Lazy>} />
            <Route path="lobs" element={<Lazy><LobsPage /></Lazy>} />
            <Route path="lobs/:lobId" element={<Lazy><LobDetailPage /></Lazy>} />
            <Route path="sublobs" element={<Lazy><SubLobsPage /></Lazy>} />
            <Route path="sublobs/:subLobId" element={<Lazy><SubLobsDetailPage /></Lazy>} />
            <Route path="lobs/:lobId/dashboards" element={<Lazy><LobDashboardsPage /></Lazy>} />
            <Route path="lobs/:lobId/dashboards/:assignmentId" element={<Lazy><LobLiveDashboardPage /></Lazy>} />
            <Route path="teams" element={<Lazy><TeamsPage /></Lazy>} />
            <Route path="teams-command-center" element={<Lazy><TeamsCommandCenterPage /></Lazy>} />
            <Route path="teams/:teamId" element={<Lazy><TeamDetailPage /></Lazy>} />
            <Route path="components/:componentId" element={<Lazy><ComponentDetailPage /></Lazy>} />
            <Route path="components" element={<Lazy><ComponentsPage /></Lazy>} />
            <Route path="components/:componentId/dashboards" element={<Lazy><ComponentDashboardsPage /></Lazy>} />
            <Route path="components/:componentId/dashboards/:assignmentId" element={<Lazy><ComponentLiveDashboardPage /></Lazy>} />
            <Route path="teams/:teamId/dashboards" element={<Lazy><TeamDashboardsPage /></Lazy>} />
            <Route path="teams/:teamId/dashboards/:assignmentId" element={<Lazy><TeamLiveDashboardPage /></Lazy>} />
            <Route path="projects" element={<Lazy><ProjectsPage /></Lazy>} />
            <Route path="projects/:projectId" element={<Lazy><ProjectDetailPage /></Lazy>} />
            <Route path="projects/:projectId/health-dashboard" element={<Lazy><ProjectHealthDashboardPage /></Lazy>} />
            <Route path="projects/:projectId/dashboards" element={<Lazy><ProjectDashboardsPage /></Lazy>} />
            <Route path="projects/:projectId/dashboards/:assignmentId" element={<Lazy><LiveDashboardPage /></Lazy>} />
            <Route path="connectors" element={<Lazy><ConnectorsPage /></Lazy>} />
            <Route path="connector-catalog" element={<Lazy><ConnectorCatalogPage /></Lazy>} />
            <Route path="health" element={<Lazy><HealthPage /></Lazy>} />
            <Route path="chatbot" element={<Lazy><ChatbotPage /></Lazy>} />
            <Route
              path="users"
              element={
                <RequireAdmin>
                  <Lazy><UsersPage /></Lazy>
                </RequireAdmin>
              }
            />
            <Route
              path="audit"
              element={
                <RequireAdmin>
                  <Lazy><AuditLogPage /></Lazy>
                </RequireAdmin>
              }
            />
            <Route path="rules" element={<Lazy><RulesPage /></Lazy>} />
            <Route
              path="roles"
              element={
                <RequireRbacManage>
                  <Lazy><RolesPage /></Lazy>
                </RequireRbacManage>
              }
            />
            <Route path="topology" element={<Lazy><TopologyPage /></Lazy>} />
            <Route path="runtime-location" element={<Lazy><RuntimeLocationPage /></Lazy>} />
            <Route path="runtime-location/:appId" element={<Lazy><ApplicationLocationDetailPage /></Lazy>} />
            <Route path="analytics" element={<Lazy><AnalyticsPage /></Lazy>} />
            <Route path="projects/:projectId/analytics" element={<Lazy><AnalyticsPage /></Lazy>} />
            <Route path="projects/:projectId/app-runtime" element={<Lazy><ApplicationRuntimeMetricsPage /></Lazy>} />
            <Route path="dashboard-builder" element={<Lazy><DashboardBuilderPage /></Lazy>} />
            <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
          </Route>
          <Route
            path="/dashboard-builder/:templateId"
            element={
              <RequireAuth>
                <Lazy><DashboardBuilderEditorV2 /></Lazy>
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
