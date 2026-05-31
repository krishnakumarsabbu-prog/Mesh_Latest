import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

const SILENT_PATTERNS = ['/auth/refresh', '/auth/login', '/auth/register'];
const SILENT_METHODS = ['get'];

function shouldShowErrorToast(url: string | undefined, method: string | undefined, status: number): boolean {
  if (!url) return false;
  if (SILENT_PATTERNS.some(p => url.includes(p))) return false;
  if (method && SILENT_METHODS.includes(method.toLowerCase()) && status >= 400 && status < 500) return false;
  return status >= 400;
}

function extractErrorMessage(error: AxiosError): string {
  const data = error.response?.data as { detail?: string | object } | undefined;
  if (typeof data?.detail === 'string') return data.detail;
  if (typeof data?.detail === 'object') return JSON.stringify(data.detail);
  return error.message || 'An unexpected error occurred';
}

const BASE_URL = '/api/v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().access_token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      const refreshToken = useAuthStore.getState().refresh_token;
      if (refreshToken) {
        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
          useAuthStore.getState().setTokens(res.data.access_token, res.data.refresh_token);
          if (error.config?.headers) {
            error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          }
          return apiClient(error.config!);
        } catch {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    if (status && shouldShowErrorToast(error.config?.url, error.config?.method, status)) {
      const message = extractErrorMessage(error);
      const statusLabel = status >= 500 ? 'Server Error' : status === 403 ? 'Access Denied' : 'Request Failed';
      useNotificationStore.getState().add({
        type: status >= 500 ? 'error' : 'warning',
        title: statusLabel,
        message,
      });
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
  register: (email: string, full_name: string, password: string) =>
    apiClient.post('/auth/register', { email, full_name, password }),
  me: () => apiClient.get('/auth/me'),
  refresh: (refresh_token: string) =>
    apiClient.post('/auth/refresh', { refresh_token }),
};

export const lobApi = {
  list: (params?: { search?: string }) => apiClient.get('/lobs', { params }),
  create: (data: object) => apiClient.post('/lobs', data),
  get: (id: string) => apiClient.get(`/lobs/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/lobs/${id}`, data),
  delete: (id: string) => apiClient.delete(`/lobs/${id}`),
  getAdmins: (id: string) => apiClient.get(`/lobs/${id}/admins`),
  assignAdmin: (id: string, user_id: string) => apiClient.post(`/lobs/${id}/admins`, { user_id }),
  removeAdmin: (id: string, userId: string) => apiClient.delete(`/lobs/${id}/admins/${userId}`),
  getMembers: (id: string) => apiClient.get(`/lobs/${id}/members`),
};

export const subLobApi = {
  list: (params?: { search?: string; lob_id?: string }) => apiClient.get('/sublobs', { params }),
  create: (data: object) => apiClient.post('/sublobs', data),
  get: (id: string) => apiClient.get(`/sublobs/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/sublobs/${id}`, data),
  delete: (id: string) => apiClient.delete(`/sublobs/${id}`),
  getAdmins: (id: string) => apiClient.get(`/sublobs/${id}/admins`),
  assignAdmin: (id: string, user_id: string) => apiClient.post(`/sublobs/${id}/admins`, { user_id }),
  removeAdmin: (id: string, userId: string) => apiClient.delete(`/sublobs/${id}/admins/${userId}`),
  getMembers: (id: string) => apiClient.get(`/sublobs/${id}/members`),
};

export const projectApi = {
  list: (lob_id?: string, team_id?: string, component_id?: string) => apiClient.get('/projects', { params: { lob_id, team_id, component_id } }),
  create: (data: object) => apiClient.post('/projects', data),
  get: (id: string) => apiClient.get(`/projects/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/projects/${id}`, data),
  delete: (id: string) => apiClient.delete(`/projects/${id}`),
  getMembers: (id: string) => apiClient.get(`/projects/${id}/members`),
  addMember: (id: string, data: object) => apiClient.post(`/projects/${id}/members`, data),
  updateMember: (id: string, memberId: string, data: object) => apiClient.patch(`/projects/${id}/members/${memberId}`, data),
  removeMember: (id: string, memberId: string) => apiClient.delete(`/projects/${id}/members/${memberId}`),
  gitScan: (data: { repository_url: string; branch?: string; access_token?: string }) =>
    apiClient.post('/projects/git-scan', data),
  register: (data: object) => apiClient.post('/projects/register', data),
  gitImportFetch: (data: { git_url: string; access_token?: string }) =>
    apiClient.post('/projects/git-import/fetch', data),
  gitImportBatch: (data: {
    lob_id: string;
    team_id: string;
    environment?: string;
    projects: Array<{ name: string; description?: string; connectors: Array<{ catalog_entry_id: string; name: string }> }>;
  }) => apiClient.post('/projects/git-import/batch', data),
};

export const componentApi = {
  list: (lob_id?: string, team_id?: string) => apiClient.get('/components', { params: { lob_id, team_id } }),
  create: (data: object) => apiClient.post('/components', data),
  get: (id: string) => apiClient.get(`/components/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/components/${id}`, data),
  delete: (id: string) => apiClient.delete(`/components/${id}`),
};

export const connectorApi = {
  list: (project_id?: string) => apiClient.get('/connectors', { params: { project_id } }),
  create: (data: object) => apiClient.post('/connectors', data),
  get: (id: string) => apiClient.get(`/connectors/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/connectors/${id}`, data),
  delete: (id: string) => apiClient.delete(`/connectors/${id}`),
  runHealthCheck: (id: string) => apiClient.post(`/connectors/${id}/health-check`),
};

export const healthApi = {
  stats: () => apiClient.get('/health/stats'),
  trends: (hours?: number) => apiClient.get('/health/trends', { params: { hours } }),
};

export const chatApi = {
  message: (message: string, context?: object) =>
    apiClient.post('/chatbot/message', { message, context }),
  createSession: (data: { project_id?: string; title?: string }) =>
    apiClient.post('/chat/session', data),
  listSessions: () => apiClient.get('/chat/sessions'),
  getHistory: (sessionId: string) => apiClient.get(`/chat/history/${sessionId}`),
  deleteSession: (sessionId: string) => apiClient.delete(`/chat/session/${sessionId}`),
  suggestedPrompts: () => apiClient.get('/chat/suggested-prompts'),
  submitFeedback: (data: { session_id: string; message_id: string; rating: string; comment?: string }) =>
    apiClient.post('/chat/feedback', data),
};

export const userApi = {
  list: (params?: { search?: string; role?: string; is_active?: boolean }) =>
    apiClient.get('/users', { params }),
  create: (data: { email: string; full_name: string; password: string; role: string }) =>
    apiClient.post('/users', data),
  get: (id: string) => apiClient.get(`/users/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/users/${id}`, data),
  deactivate: (id: string) => apiClient.delete(`/users/${id}`),
  assignRole: (userId: string, data: { role: string; resource_type?: string; resource_id?: string }) =>
    apiClient.post(`/users/${userId}/roles`, data),
  removeRole: (userId: string, assignmentId: string) =>
    apiClient.delete(`/users/${userId}/roles/${assignmentId}`),
};

export default apiClient;

export const catalogApi = {
  list: (params?: { category?: string; enabled_only?: boolean }) =>
    apiClient.get('/connector-catalog', { params }),
  create: (data: object) => apiClient.post('/connector-catalog', data),
  get: (id: string) => apiClient.get(`/connector-catalog/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/connector-catalog/${id}`, data),
  enable: (id: string) => apiClient.post(`/connector-catalog/${id}/enable`),
  disable: (id: string) => apiClient.post(`/connector-catalog/${id}/disable`),
  test: (id: string, data: object) => apiClient.post(`/connector-catalog/${id}/test`, data),
  delete: (id: string) => apiClient.delete(`/connector-catalog/${id}`),
};

export const projectConnectorApi = {
  list: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/connectors`),
  assign: (projectId: string, data: { catalog_entry_id: string; name: string; description?: string; priority?: number }) =>
    apiClient.post(`/projects/${projectId}/connectors`, data),
  get: (projectId: string, pcId: string) =>
    apiClient.get(`/projects/${projectId}/connectors/${pcId}`),
  configure: (projectId: string, pcId: string, data: object) =>
    apiClient.patch(`/projects/${projectId}/connectors/${pcId}/configure`, data),
  toggle: (projectId: string, pcId: string, is_enabled: boolean) =>
    apiClient.patch(`/projects/${projectId}/connectors/${pcId}/toggle`, { is_enabled }),
  test: (projectId: string, pcId: string, data?: object) =>
    apiClient.post(`/projects/${projectId}/connectors/${pcId}/test`, data ?? {}),
  remove: (projectId: string, pcId: string) =>
    apiClient.delete(`/projects/${projectId}/connectors/${pcId}`),
};

export const healthRunApi = {
  run: (projectId: string) =>
    apiClient.post(`/health/run/${projectId}`),
  history: (projectId: string, params?: { limit?: number; offset?: number }) =>
    apiClient.get(`/health/history/${projectId}`, { params }),
  getRun: (runId: string) =>
    apiClient.get(`/health/run/${runId}`),
  latest: (projectId: string) =>
    apiClient.get(`/health/latest/${projectId}`),
};

export const connectorAgentApi = {
  test: (projectId: string, pcId: string, data?: { config?: Record<string, unknown>; credentials?: Record<string, unknown> }) =>
    apiClient.post(`/projects/${projectId}/connectors/${pcId}/agent/test`, data ?? {}),
  sync: (projectId: string, pcId: string) =>
    apiClient.post(`/projects/${projectId}/connectors/${pcId}/agent/sync`),
  status: (projectId: string, pcId: string) =>
    apiClient.get(`/projects/${projectId}/connectors/${pcId}/agent/status`),
  logs: (projectId: string, pcId: string, limit?: number) =>
    apiClient.get(`/projects/${projectId}/connectors/${pcId}/agent/logs`, { params: { limit } }),
  projectStatuses: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/connectors/agent/statuses`),
  registry: () =>
    apiClient.get('/connectors/agents/registry'),
};

export const projectDashboardApi = {
  summary: (projectId: string) =>
    apiClient.get(`/dashboard/project/${projectId}/summary`),
  trends: (projectId: string, params?: { time_range?: string; custom_hours?: number }) =>
    apiClient.get(`/dashboard/project/${projectId}/trends`, { params }),
  metrics: (projectId: string, params?: { time_range?: string; custom_hours?: number }) =>
    apiClient.get(`/dashboard/project/${projectId}/metrics`, { params }),
  connectorDrilldown: (projectId: string, connectorId: string, params?: { time_range?: string; custom_hours?: number }) =>
    apiClient.get(`/dashboard/project/${projectId}/connector/${connectorId}`, { params }),
};

export const analyticsApi = {
  projectTrends: (
    projectId: string,
    params?: { time_range?: string; granularity?: string; custom_start?: string; custom_end?: string }
  ) => apiClient.get(`/analytics/project/${projectId}/trends`, { params }),

  projectComparison: (
    projectId: string,
    params?: { time_range?: string; custom_start?: string; custom_end?: string }
  ) => apiClient.get(`/analytics/project/${projectId}/comparison`, { params }),

  multiProjectComparison: (
    projectIds: string[],
    params?: { time_range?: string; custom_start?: string; custom_end?: string }
  ) => apiClient.get('/analytics/projects/comparison', { params: { project_ids: projectIds, ...params } }),

  slaMetrics: (
    projectId: string,
    params?: { time_range?: string; sla_threshold?: number; custom_start?: string; custom_end?: string }
  ) => apiClient.get(`/analytics/project/${projectId}/sla`, { params }),

  connectorHistory: (
    projectId: string,
    params?: { time_range?: string; granularity?: string; custom_start?: string; custom_end?: string }
  ) => apiClient.get(`/analytics/project/${projectId}/connectors/history`, { params }),

  export: (
    projectId: string,
    params?: { format?: string; time_range?: string; custom_start?: string; custom_end?: string }
  ) => apiClient.get(`/analytics/project/${projectId}/export`, { params }),

  overview: (params?: { lob_id?: string; time_range?: string }) =>
    apiClient.get('/analytics/overview', { params }),
};

export const auditApi = {
  getLogs: (params?: {
    resource_type?: string;
    user_id?: string;
    action?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => apiClient.get('/audit/logs', { params }),
};

export const globalSearchApi = {
  search: (q: string) => apiClient.get('/search', { params: { q } }),
};

export const teamApi = {
  list: (lob_id?: string) => apiClient.get('/teams', { params: { lob_id } }),
  create: (data: object) => apiClient.post('/teams', data),
  get: (id: string) => apiClient.get(`/teams/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/teams/${id}`, data),
  delete: (id: string) => apiClient.delete(`/teams/${id}`),
  getMembers: (id: string) => apiClient.get(`/teams/${id}/members`),
  addMember: (id: string, data: object) => apiClient.post(`/teams/${id}/members`, data),
  removeMember: (id: string, memberId: string) => apiClient.delete(`/teams/${id}/members/${memberId}`),
  getProjects: (id: string) => apiClient.get(`/teams/${id}/projects`),
  assignProject: (id: string, project_id: string) => apiClient.post(`/teams/${id}/projects`, { project_id }),
  removeProject: (id: string, assignmentId: string) => apiClient.delete(`/teams/${id}/projects/${assignmentId}`),
};

export const metricTemplateApi = {
  list: (catalogEntryId: string, params?: { category?: string; enabled_only?: boolean }) =>
    apiClient.get(`/connector-catalog/${catalogEntryId}/metrics`, { params }),
  create: (catalogEntryId: string, data: object) =>
    apiClient.post(`/connector-catalog/${catalogEntryId}/metrics`, data),
  get: (catalogEntryId: string, templateId: string) =>
    apiClient.get(`/connector-catalog/${catalogEntryId}/metrics/${templateId}`),
  update: (catalogEntryId: string, templateId: string, data: object) =>
    apiClient.patch(`/connector-catalog/${catalogEntryId}/metrics/${templateId}`, data),
  delete: (catalogEntryId: string, templateId: string) =>
    apiClient.delete(`/connector-catalog/${catalogEntryId}/metrics/${templateId}`),
  clone: (catalogEntryId: string, templateId: string, data: object) =>
    apiClient.post(`/connector-catalog/${catalogEntryId}/metrics/${templateId}/clone`, data),
  enable: (catalogEntryId: string, templateId: string) =>
    apiClient.post(`/connector-catalog/${catalogEntryId}/metrics/${templateId}/enable`),
  disable: (catalogEntryId: string, templateId: string) =>
    apiClient.post(`/connector-catalog/${catalogEntryId}/metrics/${templateId}/disable`),
  reorder: (catalogEntryId: string, orderedIds: string[]) =>
    apiClient.post(`/connector-catalog/${catalogEntryId}/metrics/reorder`, { ordered_ids: orderedIds }),
  test: (catalogEntryId: string, templateId: string, data: object) =>
    apiClient.post(`/connector-catalog/${catalogEntryId}/metrics/${templateId}/test`, data),
};

export const projectConnectorMetricApi = {
  list: (projectId: string, pcId: string) =>
    apiClient.get(`/projects/${projectId}/connectors/${pcId}/metrics`),
  initialize: (projectId: string, pcId: string) =>
    apiClient.post(`/projects/${projectId}/connectors/${pcId}/metrics/initialize`),
  bulkSave: (projectId: string, pcId: string, bindings: object[]) =>
    apiClient.put(`/projects/${projectId}/connectors/${pcId}/metrics`, { bindings }),
  update: (projectId: string, pcId: string, bindingId: string, data: object) =>
    apiClient.put(`/projects/${projectId}/connectors/${pcId}/metrics/${bindingId}`, data),
  delete: (projectId: string, pcId: string, bindingId: string) =>
    apiClient.delete(`/projects/${projectId}/connectors/${pcId}/metrics/${bindingId}`),
};

export const dashboardTemplateApi = {
  list: (params?: { scope?: string; visibility?: string }) =>
    apiClient.get('/dashboard-templates', { params }),
  get: (id: string) =>
    apiClient.get(`/dashboard-templates/${id}`),
  create: (data: object) =>
    apiClient.post('/dashboard-templates', data),
  update: (id: string, data: object) =>
    apiClient.patch(`/dashboard-templates/${id}`, data),
  saveLayout: (id: string, data: object) =>
    apiClient.put(`/dashboard-templates/${id}/layout`, data),
  clone: (id: string, name: string) =>
    apiClient.post(`/dashboard-templates/${id}/clone`, { name }),
  delete: (id: string) =>
    apiClient.delete(`/dashboard-templates/${id}`),
  widgetTypes: () =>
    apiClient.get('/dashboard-templates/meta/widget-types'),
};

export const projectDashboardAssignmentApi = {
  list: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/dashboards`),
  assign: (projectId: string, data: object) =>
    apiClient.post(`/projects/${projectId}/dashboards`, data),
  get: (projectId: string, assignmentId: string) =>
    apiClient.get(`/projects/${projectId}/dashboards/${assignmentId}`),
  update: (projectId: string, assignmentId: string, data: object) =>
    apiClient.patch(`/projects/${projectId}/dashboards/${assignmentId}`, data),
  setDefault: (projectId: string, assignmentId: string) =>
    apiClient.post(`/projects/${projectId}/dashboards/${assignmentId}/set-default`),
  remove: (projectId: string, assignmentId: string) =>
    apiClient.delete(`/projects/${projectId}/dashboards/${assignmentId}`),
  reorder: (projectId: string, orderedIds: string[]) =>
    apiClient.post(`/projects/${projectId}/dashboards/reorder`, { ordered_assignment_ids: orderedIds }),
  validate: (projectId: string, templateId: string) =>
    apiClient.get(`/projects/${projectId}/dashboards/validate/${templateId}`),
  render: (projectId: string, assignmentId: string, timeRangeHours?: number) =>
    apiClient.get(`/projects/${projectId}/dashboards/${assignmentId}/render`, {
      params: timeRangeHours ? { time_range_hours: timeRangeHours } : undefined,
    }),
  upsertWidgetOverride: (projectId: string, assignmentId: string, widgetId: string, data: object) =>
    apiClient.put(`/projects/${projectId}/dashboards/${assignmentId}/widgets/${widgetId}/override`, data),
  deleteWidgetOverride: (projectId: string, assignmentId: string, widgetId: string) =>
    apiClient.delete(`/projects/${projectId}/dashboards/${assignmentId}/widgets/${widgetId}/override`),
};

export const teamDashboardAssignmentApi = {
  list: (teamId: string) =>
    apiClient.get(`/teams/${teamId}/dashboards`),
  assign: (teamId: string, data: object) =>
    apiClient.post(`/teams/${teamId}/dashboards`, data),
  get: (teamId: string, assignmentId: string) =>
    apiClient.get(`/teams/${teamId}/dashboards/${assignmentId}`),
  update: (teamId: string, assignmentId: string, data: object) =>
    apiClient.patch(`/teams/${teamId}/dashboards/${assignmentId}`, data),
  setDefault: (teamId: string, assignmentId: string) =>
    apiClient.post(`/teams/${teamId}/dashboards/${assignmentId}/set-default`),
  remove: (teamId: string, assignmentId: string) =>
    apiClient.delete(`/teams/${teamId}/dashboards/${assignmentId}`),
  reorder: (teamId: string, orderedIds: string[]) =>
    apiClient.post(`/teams/${teamId}/dashboards/reorder`, { ordered_assignment_ids: orderedIds }),
  validate: (teamId: string, templateId: string) =>
    apiClient.get(`/teams/${teamId}/dashboards/validate/${templateId}`),
  render: (teamId: string, assignmentId: string) =>
    apiClient.get(`/teams/${teamId}/dashboards/${assignmentId}/render`),
  upsertWidgetOverride: (teamId: string, assignmentId: string, widgetId: string, data: object) =>
    apiClient.put(`/teams/${teamId}/dashboards/${assignmentId}/widgets/${widgetId}/override`, data),
  deleteWidgetOverride: (teamId: string, assignmentId: string, widgetId: string) =>
    apiClient.delete(`/teams/${teamId}/dashboards/${assignmentId}/widgets/${widgetId}/override`),
};

export const applicationRuntimeApi = {
  listApplications: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/applications`),
  getMetrics: (appName: string, params?: { environment?: string; limit?: number }) =>
    apiClient.get(`/applications/${encodeURIComponent(appName)}/metrics`, { params }),
  getSnapshot: (appName: string, params?: { environment?: string }) =>
    apiClient.get(`/applications/${encodeURIComponent(appName)}/snapshot`, { params }),
  getHistory: (appName: string, metricKey: string, params?: { environment?: string; limit?: number }) =>
    apiClient.get(`/applications/${encodeURIComponent(appName)}/history/${encodeURIComponent(metricKey)}`, { params }),
};

export const lobDashboardAssignmentApi = {
  list: (lobId: string) =>
    apiClient.get(`/lobs/${lobId}/dashboards`),
  assign: (lobId: string, data: object) =>
    apiClient.post(`/lobs/${lobId}/dashboards`, data),
  get: (lobId: string, assignmentId: string) =>
    apiClient.get(`/lobs/${lobId}/dashboards/${assignmentId}`),
  update: (lobId: string, assignmentId: string, data: object) =>
    apiClient.patch(`/lobs/${lobId}/dashboards/${assignmentId}`, data),
  setDefault: (lobId: string, assignmentId: string) =>
    apiClient.post(`/lobs/${lobId}/dashboards/${assignmentId}/set-default`),
  remove: (lobId: string, assignmentId: string) =>
    apiClient.delete(`/lobs/${lobId}/dashboards/${assignmentId}`),
  reorder: (lobId: string, orderedIds: string[]) =>
    apiClient.post(`/lobs/${lobId}/dashboards/reorder`, { ordered_assignment_ids: orderedIds }),
  validate: (lobId: string, templateId: string) =>
    apiClient.get(`/lobs/${lobId}/dashboards/validate/${templateId}`),
  render: (lobId: string, assignmentId: string) =>
    apiClient.get(`/lobs/${lobId}/dashboards/${assignmentId}/render`),
  upsertWidgetOverride: (lobId: string, assignmentId: string, widgetId: string, data: object) =>
    apiClient.put(`/lobs/${lobId}/dashboards/${assignmentId}/widgets/${widgetId}/override`, data),
  deleteWidgetOverride: (lobId: string, assignmentId: string, widgetId: string) =>
    apiClient.delete(`/lobs/${lobId}/dashboards/${assignmentId}/widgets/${widgetId}/override`),
};

export const componentDashboardAssignmentApi = {
  list: (componentId: string) =>
    apiClient.get(`/components/${componentId}/dashboards`),
  assign: (componentId: string, data: object) =>
    apiClient.post(`/components/${componentId}/dashboards`, data),
  get: (componentId: string, assignmentId: string) =>
    apiClient.get(`/components/${componentId}/dashboards/${assignmentId}`),
  update: (componentId: string, assignmentId: string, data: object) =>
    apiClient.patch(`/components/${componentId}/dashboards/${assignmentId}`, data),
  setDefault: (componentId: string, assignmentId: string) =>
    apiClient.post(`/components/${componentId}/dashboards/${assignmentId}/set-default`),
  remove: (componentId: string, assignmentId: string) =>
    apiClient.delete(`/components/${componentId}/dashboards/${assignmentId}`),
  reorder: (componentId: string, orderedIds: string[]) =>
    apiClient.post(`/components/${componentId}/dashboards/reorder`, { ordered_assignment_ids: orderedIds }),
  validate: (componentId: string, templateId: string) =>
    apiClient.get(`/components/${componentId}/dashboards/validate/${templateId}`),
  render: (componentId: string, assignmentId: string) =>
    apiClient.get(`/components/${componentId}/dashboards/${assignmentId}/render`),
  upsertWidgetOverride: (componentId: string, assignmentId: string, widgetId: string, data: object) =>
    apiClient.put(`/components/${componentId}/dashboards/${assignmentId}/widgets/${widgetId}/override`, data),
  deleteWidgetOverride: (componentId: string, assignmentId: string, widgetId: string) =>
    apiClient.delete(`/components/${componentId}/dashboards/${assignmentId}/widgets/${widgetId}/override`),
};

export const rbacApi = {
  getPermissions: () => apiClient.get('/rbac/permissions'),
  getMatrix: () => apiClient.get('/rbac/matrix'),
  getRolePermissions: (role: string) => apiClient.get(`/rbac/roles/${role}/permissions`),
  setRolePermissions: (role: string, permissions: string[]) =>
    apiClient.put(`/rbac/roles/${role}/permissions`, { permissions }),
  getMyPermissions: () => apiClient.get('/rbac/my-permissions'),
  getScopedAssignments: (params?: { scope_type?: string; scope_id?: string }) =>
    apiClient.get('/rbac/scoped-assignments', { params }),
  getUserScopedAssignments: (userId: string) =>
    apiClient.get(`/rbac/users/${userId}/scoped-assignments`),
  createScopedAssignment: (data: { user_id: string; role: string; scope_type: string; scope_id: string }) =>
    apiClient.post('/rbac/scoped-assignments', data),
  revokeScopedAssignment: (assignmentId: string) =>
    apiClient.delete(`/rbac/scoped-assignments/${assignmentId}`),
};

export const healthRulesApi = {
  metadata: () =>
    apiClient.get('/rules/metadata'),
  list: (params?: {
    scope?: string;
    severity?: string;
    status?: string;
    project_id?: string;
    connector_id?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }) => apiClient.get('/rules', { params }),
  get: (ruleId: string) =>
    apiClient.get(`/rules/${ruleId}`),
  create: (payload: Record<string, unknown>) =>
    apiClient.post('/rules', payload),
  update: (ruleId: string, payload: Record<string, unknown>) =>
    apiClient.put(`/rules/${ruleId}`, payload),
  updateStatus: (ruleId: string, status: string) =>
    apiClient.patch(`/rules/${ruleId}/status`, { status }),
  delete: (ruleId: string) =>
    apiClient.delete(`/rules/${ruleId}`),
  validate: (payload: Record<string, unknown>) =>
    apiClient.post('/rules/validate', payload),
  test: (payload: Record<string, unknown>) =>
    apiClient.post('/rules/test', payload),
};

export const topologyApi = {
  graph: () => apiClient.get('/topology/graph'),
};

export const batchMetricsApi = {
  fetch: (projectId: string, bindings: Array<{
    id: string;
    metric_key: string;
    connector_type?: string | null;
    metric_source_scope?: string;
    aggregation_mode?: string;
    time_range?: string;
  }>) => apiClient.post(`/projects/${projectId}/metrics/batch`, { bindings }),
};

export const projectOverviewApi = {
  alerts: (
    projectId: string,
    params?: { limit?: number; include_resolved?: boolean }
  ) => apiClient.get(`/projects/${projectId}/alerts`, { params }),

  kpiMetrics: (
    projectId: string,
    params?: { time_range?: string }
  ) => apiClient.get(`/projects/${projectId}/kpi-metrics`, { params }),

  activitySummary: (
    projectId: string,
    params?: { days?: number }
  ) => apiClient.get(`/projects/${projectId}/activity-summary`, { params }),
};

export const runtimeApi = {
  getApplications: () => apiClient.get('/runtime-location/applications'),
  getApplicationDetail: (appId: string, env?: string) =>
    apiClient.get(`/runtime-location/applications/${appId}`, { params: { environment: env } }),
  getDataCenters: () => apiClient.get('/runtime-location/datacenters'),
  getImports: () => apiClient.get('/runtime-location/imports'),
  importCsv: (formData: FormData) =>
    apiClient.post('/runtime-location/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  seedData: () => apiClient.post('/runtime-location/seed'),
  resetData: () => apiClient.post('/runtime-location/reset'),
  getAuditLogs: (appId?: string) =>
    apiClient.get('/runtime-location/audit-logs', { params: { application_id: appId } }),
  getIntents: () => apiClient.get('/runtime-location/intents'),
  saveIntent: (data: object) => apiClient.post('/runtime-location/intents', data),
  deleteIntent: (appId: string) => apiClient.delete(`/runtime-location/intents/${appId}`),
  getProposals: () => apiClient.get('/runtime-location/proposals'),
  submitProposal: (data: object) => apiClient.post('/runtime-location/proposals', data),
  updateProposalStatus: (id: string, status: string) =>
    apiClient.put(`/runtime-location/proposals/${id}`, { status }),
  getDrift: (appId: string, environment?: string) =>
    apiClient.get(`/runtime-location/drift/${appId}`, { params: { environment } }),
  getAllDrifts: (environment?: string) =>
    apiClient.get('/runtime-location/drift', { params: { environment } }),
  resolveConflict: (data: { asset_name: string; authoritative_source: string }) =>
    apiClient.post('/runtime-location/conflicts/resolve', data),
  simulateFailover: (dc: string) =>
    apiClient.post('/runtime-location/simulate-failover', { dc }),
};

export const proxySettingsApi = {
  get: () => apiClient.get('/proxy-settings'),
  update: (data: {
    proxy_url?: string | null;
    proxy_strict_ssl?: boolean;
    no_proxy?: string | null;
    is_enabled?: boolean;
  }) => apiClient.put('/proxy-settings', data),
};

export const aggregationApi = {
  listLobs: () => apiClient.get('/aggregations/lobs'),
  getLob: (lobId: string) => apiClient.get(`/aggregations/lobs/${lobId}`),
  listTeams: () => apiClient.get('/aggregations/teams'),
};
