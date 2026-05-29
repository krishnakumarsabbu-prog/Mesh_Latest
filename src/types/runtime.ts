export type AssetType = 'VM' | 'OCP_POD' | 'MQ_QMGR' | 'MONGO_NODE' | 'ORACLE_DB' | 'KAFKA_BROKER' | 'SERVER';
export type TechStack = 'ibm_mq' | 'mongodb' | 'oracle' | 'mssql' | 'kafka' | 'vm' | 'ocp';
export type AssetEnvironment = 'UAT' | 'PRODUCTION' | 'DR';
export type OperationalState = 'ACTIVE' | 'STANDBY' | 'UNKNOWN';
export type ReplicationRole = 'PRIMARY' | 'SECONDARY' | 'PHYSICAL_STANDBY' | 'NONE' | 'MONGOS' | 'CONFIG_SVR' | 'SHARD_PRIMARY' | 'SHARD_SECONDARY';
export type ConfidenceLevel = 1 | 2 | 3 | 4;
export type FreshnessStatus = 'FRESH' | 'STALE' | 'VERY_STALE' | 'UNKNOWN';
export type DataSourceName = 'ibm_mq' | 'mongodb' | 'oracle_oem' | 'cmdb' | 'mssql' | 'kafka' | 'avi_loadbalancer' | 'scom' | 'ocp' | 'batch' | 'appdynamics';
export type ImportStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface RuntimeDataCenter {
  id: string;
  name: string;
  short_name?: string;
  region?: string;
  zone?: string;
  asset_count: number;
}

export interface RuntimeAsset {
  id: string;
  name: string;
  asset_type: AssetType;
  tech_stack: TechStack;
  environment: AssetEnvironment;
  host?: string;
  port?: number;
  platform?: string;
  data_center?: RuntimeDataCenter;
  latest_confidence_level?: ConfidenceLevel;
  latest_operational_state?: OperationalState;
  latest_replication_role?: ReplicationRole;
  write_authority?: boolean;
  last_seen_at?: string;
  is_deterministic?: boolean;
  data_source?: DataSourceName;
  metadata?: Record<string, string>;
}

export interface ApplicationComponent {
  id: string;
  application_id: string;
  application_name: string;
  component_name: string;
  component_type: 'DATABASE' | 'MESSAGING' | 'COMPUTE' | 'STORAGE';
  tech_stack: TechStack;
  assets: RuntimeAsset[];
}

export type AlignmentStatus = 'ALIGNED' | 'DRIFTED' | 'UNKNOWN';
export type ConfidenceLabelStr = 'HIGH' | 'MEDIUM' | 'LOW' | 'CONFLICT' | 'UNKNOWN';

export interface ApplicationLocationSummary {
  application_id: string;
  application_name: string;
  environment: AssetEnvironment;
  data_centers: string[];
  primary_write_dc?: string;
  overall_confidence: ConfidenceLevel;
  confidence_label?: ConfidenceLabelStr;
  confidence_score?: number;
  component_count: number;
  asset_count: number;
  stale_source_count: number;
  missing_source_count?: number;
  last_updated?: string;
  tech_stacks?: TechStack[];
  alignment_status?: AlignmentStatus;
}

export interface DataSourceInfo {
  source_name: DataSourceName;
  display_name: string;
  status: FreshnessStatus;
  record_count: number;
  last_import?: string;
  topology_confidence: ConfidenceLevel;
  traffic_confidence: ConfidenceLevel;
}

export interface SourceConflict {
  asset_name: string;
  source_a: { name: string; says: string };
  source_b: { name: string; says: string };
  last_checked: string;
}

export interface ApplicationLocationDetail {
  application_id: string;
  application_name: string;
  environment: AssetEnvironment;
  overall_confidence: ConfidenceLevel;
  confidence_label?: ConfidenceLabelStr;
  confidence_score?: number;
  components: ApplicationComponent[];
  data_sources: DataSourceInfo[];
  conflicts: SourceConflict[];
}

export interface RuntimeSnapshot {
  id: string;
  asset_id: string;
  snapshot_time: string;
  operational_state: OperationalState;
  replication_role?: ReplicationRole;
  data_source: DataSourceName;
  confidence_level: ConfidenceLevel;
  is_deterministic: boolean;
}

export interface DataSourceImport {
  id: string;
  source_name: DataSourceName;
  file_name: string;
  imported_at: string;
  record_count: number;
  status: ImportStatus;
  errors: string[];
}

export type ReplicationModel = 'SINGLE_WRITER' | 'MULTI_WRITER' | 'READ_REPLICA' | 'EVENTUAL' | 'UNKNOWN';
export type FailoverType = 'AUTOMATIC' | 'MANUAL' | 'NONE';
export type DriftType = 'MISSING_DC' | 'WRONG_PRIMARY' | 'MISSING_COMPONENT' | 'EXTRA_DC' | 'ROLE_MISMATCH' | 'STALE_DATA';
export type DriftSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ApplicationIntent {
  application_id: string;
  application_name: string;
  intended_active_dcs: string[];
  intended_primary_dc: string;
  intended_environments: AssetEnvironment[];
  failover_type: FailoverType;
  replication_model: ReplicationModel;
  required_tech_stacks: TechStack[];
  alignment_status?: AlignmentStatus;
  owner?: string;
  notes?: string;
  last_review_date?: string;
  created_at: string;
  updated_at: string;
}

export interface IntentDrift {
  id: string;
  application_id: string;
  environment: AssetEnvironment;
  drift_type: DriftType;
  description: string;
  severity: DriftSeverity;
  intended: string;
  actual: string;
  detected_at: string;
}

export type AuditEventType =
  | 'IMPORT'
  | 'STATE_CHANGE'
  | 'CONFLICT_DETECTED'
  | 'INTENT_CREATED'
  | 'INTENT_UPDATED'
  | 'DRIFT_DETECTED'
  | 'PROPOSAL_SUBMITTED'
  | 'SEED_LOADED';

export interface AuditLogEntry {
  id: string;
  event_type: AuditEventType;
  application_id?: string;
  asset_name?: string;
  description: string;
  actor: string;
  source?: string;
  before_value?: string;
  after_value?: string;
  occurred_at: string;
}

export type ProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface SourceProposal {
  id: string;
  source_name: string;
  system: string;
  signal_type: string;
  tech_stack: string;
  rationale: string;
  is_deterministic_claim: boolean;
  proposed_by: string;
  proposed_at: string;
  status: ProposalStatus;
}
