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

export const apiClient: AxiosInstance = axios.create({
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
  importAllDocs: () => apiClient.post('/runtime-location/import-all-docs'),
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
  executeFailover: (data: { application_id: string; failed_dc: string; promoted_dc: string; environment?: string }) =>
    apiClient.post('/runtime-location/failover', data),
  executeFailback: (data: { application_id: string; environment?: string }) =>
    apiClient.post('/runtime-location/failback', data),
  getSnapshots: (appId: string, environment?: string) =>
    apiClient.get(`/runtime-location/snapshots/${appId}`, { params: { environment } }),
  compareEnvs: (appId: string) =>
    apiClient.get(`/runtime-location/compare-envs/${appId}`),
};

export const digitalTwinApi = {
  getApplications: () => apiClient.get('/digital-twin/applications'),
  getGraph: (appId: string, environment: string = 'PRODUCTION') =>
    apiClient.get('/digital-twin/graph', { params: { app_id: appId, environment } }),
  getTopologySpecs: (appId: string, environment: string = 'PRODUCTION') =>
    apiClient.get(`/digital-twin/topology-specs/${appId}`, { params: { environment } }),
  simulate: (data: { app_id: string; environment?: string; scenario: string; target?: string }) =>
    apiClient.post('/digital-twin/simulate', data),
  aiQuery: (data: { app_id: string; environment?: string; question: string }) =>
    apiClient.post('/digital-twin/ai-query', data),
};

export const dcExitApi = {
  getOntologyGraph: (domain?: string) =>
    apiClient.get('/dc-exit/ontology/graph', { params: { domain } }),
  getOntologyDomains: () =>
    apiClient.get('/dc-exit/ontology/domains'),
  buildOntology: () =>
    apiClient.post('/dc-exit/ontology/build'),
};

