import { create } from 'zustand';
import { digitalTwinApi } from '@/lib/api';

export interface DTNode {
  id: string;
  label: string;
  type: string;
  color: string;
  icon: string;
  status?: string;
  tech_stack?: string;
  host?: string;
  port?: number;
  environment?: string;
  operational_state?: string;
  replication_role?: string;
  write_authority?: boolean;
  confidence_level?: number;
  confidence_score?: number;
  data_source?: string;
  last_seen_at?: string;
  metadata?: Record<string, unknown>;
  criticality?: string;
  region?: string;
  cert_expiry?: string;
  secrets_count?: number;
  vault_status?: string;
}

export interface DTEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  animated: boolean;
}

export interface DTHero {
  application_id: string;
  application_name: string;
  environment: string;
  status: string;
  criticality: string;
  health_score: number;
  health_label: string;
  business_capability: string;
  lob: string;
  owner: string;
  version: string;
  deployment_status: string;
  last_deployment: string;
  traffic_rpm: number;
  confidence_score: number;
  confidence_label: string;
  runtime_truth: string;
  data_centers: string[];
  tech_stacks: string[];
  total_assets: number;
  active_assets: number;
  standby_assets: number;
  degraded_assets: number;
  alignment_status: string;
}

export interface DTOntologyNode {
  id: string;
  label: string;
  icon: string;
  count: number;
  status: string;
  children: DTOntologyNode[];
}

export interface DTTimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  actor: string;
  source: string;
  severity: string;
}

export interface DTProperties {
  node_id: string;
  node_type: string;
  name: string;
  environment: string;
  owner: string;
  support_team: string;
  version: string;
  git_repository: string;
  ci_cd: string;
  last_change: string;
  runbook: string;
  documentation: string;
  tech_stacks: string[];
  data_centers: string[];
  ports: number[];
  resources: { cpu_cores: number; memory_gb: number; storage_tb: number };
  traffic: { rpm: number; avg_latency_ms: number; p95_latency_ms: number; error_rate: number };
  health: { score: number; active_alerts: number; open_incidents: number };
  intent: {
    intended_active_dcs: string[];
    intended_primary_dc: string;
    failover_type: string;
    replication_model: string;
    alignment_status: string;
  } | null;
  tags: string[];
}

export interface DTSimulationResult {
  scenario: string;
  scenario_label: string;
  app_id: string;
  environment: string;
  target: string;
  impacted_node_ids: string[];
  total_impacted_assets: number;
  critical_services: string[];
  impacted_data_centers: string[];
  has_failover: boolean;
  failover_target: string | null;
  rto_minutes: number;
  rpo_minutes: number;
  risk_level: string;
  estimated_downtime: string;
  estimated_recovery: string;
  capacity_remaining: number;
  traffic_loss_percent: number;
  recommendations: string[];
  blockers: string[];
  ai_explanation: string;
  simulated_at: string;
}

export interface DTAIResponse {
  question: string;
  answer: string;
  suggestions: string[];
  app_id: string;
  environment: string;
  answered_at: string;
}

interface DigitalTwinState {
  loading: boolean;
  error: string | null;
  hero: DTHero | null;
  nodes: DTNode[];
  edges: DTEdge[];
  ontology: DTOntologyNode[];
  timeline: DTTimelineEvent[];
  properties: DTProperties | null;
  selectedNodeId: string | null;
  applications: { application_id: string; application_name: string; environments: string[]; asset_count: number }[];
  simulationResult: DTSimulationResult | null;
  simulating: boolean;
  aiHistory: { role: 'user' | 'assistant'; content: string; suggestions?: string[] }[];
  aiLoading: boolean;
  activeView: string;
  environment: string;

  fetchApplications: () => Promise<void>;
  fetchGraph: (appId: string, env?: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  runSimulation: (data: { app_id: string; environment?: string; scenario: string; target?: string }) => Promise<void>;
  askAI: (question: string, appId: string, env?: string) => Promise<void>;
  setActiveView: (view: string) => void;
  setEnvironment: (env: string) => void;
  clearSimulation: () => void;
}

export const useDigitalTwinStore = create<DigitalTwinState>((set, get) => ({
  loading: false,
  error: null,
  hero: null,
  nodes: [],
  edges: [],
  ontology: [],
  timeline: [],
  properties: null,
  selectedNodeId: null,
  applications: [],
  simulationResult: null,
  simulating: false,
  aiHistory: [],
  aiLoading: false,
  activeView: 'topology',
  environment: 'PRODUCTION',

  fetchApplications: async () => {
    try {
      const res = await digitalTwinApi.getApplications();
      set({ applications: res.data });
    } catch (err) {
      console.error('Failed to fetch DT applications:', err);
    }
  },

  fetchGraph: async (appId: string, env?: string) => {
    const environment = env || get().environment;
    set({ loading: true, error: null });
    try {
      const res = await digitalTwinApi.getGraph(appId, environment);
      set({
        hero: res.data.hero,
        nodes: res.data.nodes,
        edges: res.data.edges,
        ontology: res.data.ontology,
        timeline: res.data.timeline,
        properties: res.data.properties,
        loading: false,
        selectedNodeId: null,
        simulationResult: null,
      });
    } catch (err: any) {
      set({ error: err?.message || 'Failed to load graph', loading: false });
    }
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  runSimulation: async (data) => {
    set({ simulating: true });
    try {
      const res = await digitalTwinApi.simulate(data);
      set({ simulationResult: res.data, simulating: false });
    } catch (err: any) {
      set({ simulating: false, error: err?.message || 'Simulation failed' });
    }
  },

  askAI: async (question, appId, env) => {
    const environment = env || get().environment;
    set((state) => ({
      aiLoading: true,
      aiHistory: [...state.aiHistory, { role: 'user', content: question }],
    }));
    try {
      const res = await digitalTwinApi.aiQuery({ app_id: appId, environment, question });
      set((state) => ({
        aiLoading: false,
        aiHistory: [...state.aiHistory, {
          role: 'assistant',
          content: res.data.answer,
          suggestions: res.data.suggestions,
        }],
      }));
    } catch (err: any) {
      set((state) => ({
        aiLoading: false,
        aiHistory: [...state.aiHistory, {
          role: 'assistant',
          content: `Error: ${err?.message || 'Failed to get AI response'}`,
        }],
      }));
    }
  },

  setActiveView: (view) => set({ activeView: view }),
  setEnvironment: (env) => set({ environment: env }),
  clearSimulation: () => set({ simulationResult: null }),
}));
