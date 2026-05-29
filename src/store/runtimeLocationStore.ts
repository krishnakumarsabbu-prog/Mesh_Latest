import { create } from 'zustand';
import {
  ApplicationLocationSummary,
  ApplicationLocationDetail,
  RuntimeDataCenter,
  RuntimeAsset,
  ApplicationComponent,
  DataSourceInfo,
  DataSourceImport,
  RuntimeSnapshot,
  AssetEnvironment,
  TechStack,
  DataSourceName,
  ApplicationIntent,
  IntentDrift,
  AuditLogEntry,
  AuditEventType,
  SourceProposal,
  ProposalStatus,
  SourceConflict,
} from '@/types';
import {
  getMockSnapshots,
  getAppTechStacks,
} from '@/lib/runtimeLocationMock';
import {
  detectSourceType,
} from '@/lib/csvParser';
import { runtimeApi } from '@/lib/api';

export type EnvironmentFilter = AssetEnvironment | 'ALL';
export type TechStackFilter = TechStack | 'ALL';

// ─── Staleness simulation offset (in minutes) ────────────────────────────────
// Allows demo to "age" data without real time passing
let simulatedAgeMinutes = 0;
export function getSimulatedNow(): Date {
  return new Date(Date.now() + simulatedAgeMinutes * 60 * 1000);
}
export function setSimulatedAge(minutes: number) {
  simulatedAgeMinutes = minutes;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Intent drift detection ───────────────────────────────────────────────────

function detectDrift(intent: ApplicationIntent, detail: ApplicationLocationDetail): IntentDrift[] {
  const drifts: IntentDrift[] = [];
  const now = new Date().toISOString();

  const allAssets = detail.components.flatMap((c) => c.assets);
  const actualDCSet = new Set(allAssets.map((a) => a.data_center?.short_name).filter(Boolean));
  const actualStacks = new Set(detail.components.map((c) => c.tech_stack));
  const primaryWriteAsset = allAssets.find((a) => a.write_authority && a.latest_operational_state === 'ACTIVE');
  const actualPrimary = primaryWriteAsset?.data_center?.short_name;

  // Check each intended DC is present
  for (const dc of intent.intended_active_dcs) {
    if (!actualDCSet.has(dc)) {
      drifts.push({
        id: uid(),
        application_id: intent.application_id,
        environment: detail.environment,
        drift_type: 'MISSING_DC',
        description: `App should have assets in ${dc} but none found`,
        severity: 'HIGH',
        intended: dc,
        actual: 'NOT FOUND',
        detected_at: now,
      });
    }
  }

  // Check extra DCs not in intent
  for (const dc of actualDCSet) {
    if (dc && !intent.intended_active_dcs.includes(dc)) {
      drifts.push({
        id: uid(),
        application_id: intent.application_id,
        environment: detail.environment,
        drift_type: 'EXTRA_DC',
        description: `Assets found in ${dc} but this DC is not in intended topology`,
        severity: 'MEDIUM',
        intended: intent.intended_active_dcs.join(', '),
        actual: dc,
        detected_at: now,
      });
    }
  }

  // Check primary DC
  if (intent.intended_primary_dc && actualPrimary && actualPrimary !== intent.intended_primary_dc) {
    drifts.push({
      id: uid(),
      application_id: intent.application_id,
      environment: detail.environment,
      drift_type: 'WRONG_PRIMARY',
      description: `Primary write DC is ${actualPrimary}, should be ${intent.intended_primary_dc}`,
      severity: 'CRITICAL',
      intended: intent.intended_primary_dc,
      actual: actualPrimary,
      detected_at: now,
    });
  }

  // Check required tech stacks
  for (const stack of intent.required_tech_stacks) {
    if (!actualStacks.has(stack)) {
      drifts.push({
        id: uid(),
        application_id: intent.application_id,
        environment: detail.environment,
        drift_type: 'MISSING_COMPONENT',
        description: `Required tech stack ${stack} has no assets found`,
        severity: 'MEDIUM',
        intended: stack,
        actual: 'NOT FOUND',
        detected_at: now,
      });
    }
  }

  return drifts;
}

// ─── State shape ──────────────────────────────────────────────────────────────

interface RuntimeLocationState {
  // Core data
  applications: ApplicationLocationSummary[];
  dataCenters: RuntimeDataCenter[];
  importHistory: DataSourceImport[];
  selectedDetail: ApplicationLocationDetail | null;
  snapshots: RuntimeSnapshot[];

  // Intent vs Actual
  intents: ApplicationIntent[];
  drifts: IntentDrift[];

  // Audit log (in-memory)
  auditLog: AuditLogEntry[];

  // Source discovery proposals (in-memory)
  proposals: SourceProposal[];

  // Staleness time simulation offset (minutes added to "now")
  simulatedAgeOffset: number;

  // Loading flags
  isLoadingApplications: boolean;
  isLoadingDetail: boolean;
  isImporting: boolean;
  isSeeding: boolean;

  // Filters
  environmentFilter: EnvironmentFilter;
  techStackFilter: TechStackFilter;
  searchQuery: string;

  // Actions
  loadApplications: () => Promise<void>;
  loadDetail: (appId: string, environment?: string) => Promise<void>;
  loadDataCenters: () => Promise<void>;
  loadSnapshots: (appId: string, environment?: string) => Promise<void>;
  setEnvironmentFilter: (env: EnvironmentFilter) => void;
  setTechStackFilter: (stack: TechStackFilter) => void;
  setSearchQuery: (q: string) => void;
  importCsv: (file: File, sourceType?: DataSourceName) => Promise<DataSourceImport>;
  seedSampleData: () => Promise<void>;
  clearDetail: () => void;
  resetToEmpty: () => Promise<void>;

  // Intent actions
  saveIntent: (intent: Omit<ApplicationIntent, 'created_at' | 'updated_at'>) => Promise<void>;
  deleteIntent: (applicationId: string) => Promise<void>;
  runDriftDetection: (appId: string, env: AssetEnvironment) => IntentDrift[];
  loadDriftFromBackend: (appId: string, env: string) => Promise<IntentDrift[]>;

  // Proposal actions
  submitProposal: (p: Omit<SourceProposal, 'id' | 'proposed_at' | 'status'>) => Promise<void>;
  updateProposalStatus: (id: string, status: ProposalStatus) => Promise<void>;

  // Simulation
  setSimulatedAgeOffset: (minutes: number) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRuntimeLocationStore = create<RuntimeLocationState>((set, get) => ({
  applications: [],
  dataCenters: [],
  importHistory: [],
  selectedDetail: null,
  snapshots: [],
  intents: [],
  drifts: [],
  auditLog: [],
  proposals: [],
  simulatedAgeOffset: 0,
  isLoadingApplications: false,
  isLoadingDetail: false,
  isImporting: false,
  isSeeding: false,
  environmentFilter: 'ALL',
  techStackFilter: 'ALL',
  searchQuery: '',

  loadApplications: async () => {
    set({ isLoadingApplications: true });
    try {
      const res = await runtimeApi.getApplications();
      const dcsRes = await runtimeApi.getDataCenters();
      const importRes = await runtimeApi.getImports();
      const intentsRes = await runtimeApi.getIntents();
      const auditRes = await runtimeApi.getAuditLogs();
      const proposalsRes = await runtimeApi.getProposals();

      set({
        applications: res.data,
        dataCenters: dcsRes.data,
        importHistory: importRes.data,
        intents: intentsRes.data,
        auditLog: auditRes.data,
        proposals: proposalsRes.data,
      });
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      set({ isLoadingApplications: false });
    }
  },

  loadDetail: async (appId, environment) => {
    set({ isLoadingDetail: true });
    try {
      const env = environment && environment !== 'ALL' ? environment : 'PRODUCTION';
      const res = await runtimeApi.getApplicationDetail(appId, env);
      set({ selectedDetail: res.data });

      // Load drift from backend if intent exists
      const intents = get().intents;
      const intent = intents.find((i) => i.application_id === appId);
      if (intent && res.data) {
        // Fire backend drift detection (non-blocking to not delay detail load)
        get().loadDriftFromBackend(appId, env).catch(() => {
          // Fallback to local drift detection
          const localDrifts = detectDrift(intent, res.data);
          set((state) => ({
            drifts: [
              ...localDrifts,
              ...state.drifts.filter((d) => !(d.application_id === appId && d.environment === env)),
            ],
          }));
        });
      }
    } catch (err) {
      console.error('Failed to load application detail:', err);
    } finally {
      set({ isLoadingDetail: false });
    }
  },

  loadSnapshots: async (appId, environment) => {
    await new Promise((r) => setTimeout(r, 100));
    const snaps = getMockSnapshots(appId, environment ?? 'PRODUCTION');
    set({ snapshots: snaps });
  },

  loadDataCenters: async () => {
    try {
      const res = await runtimeApi.getDataCenters();
      set({ dataCenters: res.data });
    } catch (err) {
      console.error('Failed to load data centers:', err);
    }
  },

  setEnvironmentFilter: (env) => set({ environmentFilter: env }),
  setTechStackFilter: (stack) => set({ techStackFilter: stack }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSimulatedAgeOffset: (minutes) => {
    setSimulatedAge(minutes);
    set({ simulatedAgeOffset: minutes });
  },

  // ─── Real CSV import ───────────────────────────────────────────────────────
  importCsv: async (file, sourceType) => {
    set({ isImporting: true });
    const formData = new FormData();
    formData.append('file', file);
    if (sourceType) {
      formData.append('source_type', sourceType);
    }

    try {
      const res = await runtimeApi.importCsv(formData);
      
      // Reload everything to synchronize backend updates
      await get().loadApplications();
      
      return res.data;
    } catch (err) {
      console.error('Failed to import CSV:', err);
      const failed: DataSourceImport = {
        id: `import-${Date.now()}`,
        source_name: sourceType || detectSourceType(file.name),
        file_name: file.name,
        imported_at: new Date().toISOString(),
        record_count: 0,
        status: 'FAILED',
        errors: [`Import failed: ${err}`],
      };
      return failed;
    } finally {
      set({ isImporting: false });
    }
  },

  // ─── Seed sample data ─────────────────────────────────────────────────────
  seedSampleData: async () => {
    set({ isSeeding: true });
    try {
      await runtimeApi.seedData();
      await get().loadApplications();
    } catch (err) {
      console.error('Failed to seed database:', err);
    } finally {
      set({ isSeeding: false });
    }
  },

  clearDetail: () => set({ selectedDetail: null, snapshots: [] }),

  resetToEmpty: async () => {
    try {
      await runtimeApi.resetData();
      set({
        applications: [],
        dataCenters: [],
        importHistory: [],
        selectedDetail: null,
        snapshots: [],
        intents: [],
        drifts: [],
        auditLog: [],
        proposals: [],
      });
    } catch (err) {
      console.error('Failed to reset system:', err);
    }
  },

  // ─── Intent management ────────────────────────────────────────────────────
  saveIntent: async (intentData) => {
    try {
      await runtimeApi.saveIntent(intentData);
      const intentsRes = await runtimeApi.getIntents();
      const auditRes = await runtimeApi.getAuditLogs();
      set({
        intents: intentsRes.data,
        auditLog: auditRes.data,
      });
      // Run backend drift detection after saving intent
      const env = intentData.intended_environments?.[0] ?? 'PRODUCTION';
      get().loadDriftFromBackend(intentData.application_id, env).catch(() => {});
    } catch (err) {
      console.error('Failed to save design intent:', err);
    }
  },

  deleteIntent: async (applicationId) => {
    try {
      await runtimeApi.deleteIntent(applicationId);
      const intentsRes = await runtimeApi.getIntents();
      set({
        intents: intentsRes.data,
        drifts: get().drifts.filter((d) => d.application_id !== applicationId),
      });
    } catch (err) {
      console.error('Failed to delete design intent:', err);
    }
  },

  runDriftDetection: (appId, env) => {
    const { intents, selectedDetail } = get();
    const intent = intents.find((i) => i.application_id === appId);
    if (!intent || !selectedDetail) return [];

    const newDrifts = detectDrift(intent, selectedDetail);

    set((state) => ({
      drifts: [
        ...newDrifts,
        ...state.drifts.filter((d) => !(d.application_id === appId && d.environment === env)),
      ],
    }));

    return newDrifts;
  },

  loadDriftFromBackend: async (appId, env) => {
    try {
      const res = await runtimeApi.getDrift(appId, env);
      const newDrifts: IntentDrift[] = res.data;

      set((state) => ({
        drifts: [
          ...newDrifts,
          ...state.drifts.filter((d) => !(d.application_id === appId && d.environment === env)),
        ],
        // Update alignment_status on matching intent
        intents: state.intents.map((i) => {
          if (i.application_id !== appId) return i;
          const alignment = newDrifts.length === 0 ? 'ALIGNED' : 'DRIFTED';
          return { ...i, alignment_status: alignment as 'ALIGNED' | 'DRIFTED' | 'UNKNOWN' };
        }),
      }));

      return newDrifts;
    } catch (err) {
      console.error('Failed to load drift from backend:', err);
      return [];
    }
  },

  // ─── Proposals ────────────────────────────────────────────────────────────
  submitProposal: async (p) => {
    try {
      await runtimeApi.submitProposal(p);
      const propsRes = await runtimeApi.getProposals();
      const auditRes = await runtimeApi.getAuditLogs();
      set({
        proposals: propsRes.data,
        auditLog: auditRes.data,
      });
    } catch (err) {
      console.error('Failed to submit signal proposal:', err);
    }
  },

  updateProposalStatus: async (id, status) => {
    try {
      await runtimeApi.updateProposalStatus(id, status);
      const propsRes = await runtimeApi.getProposals();
      set({ proposals: propsRes.data });
    } catch (err) {
      console.error('Failed to update proposal status:', err);
    }
  },
}));

// ─── Selector: filter applications list ───────────────────────────────────────

export function selectFilteredApplications(state: RuntimeLocationState): ApplicationLocationSummary[] {
  const { applications, environmentFilter, techStackFilter, searchQuery } = state;
  return applications.filter((app) => {
    if (environmentFilter !== 'ALL' && app.environment !== environmentFilter) return false;
    if (techStackFilter !== 'ALL') {
      // Use real tech_stacks from backend if available, fall back to mock map
      const realStacks = app.tech_stacks ?? [];
      const mockStacks = realStacks.length === 0 ? getAppTechStacks(app.application_id) : [];
      const stacks = realStacks.length > 0 ? realStacks : mockStacks;
      if (stacks.length > 0 && !stacks.includes(techStackFilter)) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!app.application_name.toLowerCase().includes(q) &&
          !app.application_id.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}
