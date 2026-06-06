import {
  ApplicationLocationSummary,
  ApplicationLocationDetail,
  RuntimeDataCenter,
  RuntimeAsset,
  ApplicationComponent,
  DataSourceInfo,
  SourceConflict,
  DataSourceImport,
  DataSourceName,
  RuntimeSnapshot,
} from '@/types';

// ─── Data Centers ─────────────────────────────────────────────────────────────

export const MOCK_DATA_CENTERS: RuntimeDataCenter[] = [
  { id: 'dc-ibb1', name: 'DC Birmingham IBB1', short_name: 'IBB1', region: 'Southeast', zone: 'prod-zone-1', asset_count: 18 },
  { id: 'dc-shv',  name: 'DC Shoreview',       short_name: 'SHV',  region: 'Midwest',   zone: 'prod-zone-2', asset_count: 14 },
  { id: 'dc-uat-ga', name: 'DC Georgia UAT',   short_name: 'GA-UAT', region: 'Southeast', zone: 'uat-zone-1', asset_count: 22 },
  { id: 'dc-uat-ma', name: 'DC Maryland UAT',  short_name: 'MA-UAT', region: 'Northeast', zone: 'uat-zone-2', asset_count: 19 },
  { id: 'dc-az3',    name: 'Azure Zone 3',     short_name: 'AZ3',   region: 'Cloud',     zone: 'az003',      asset_count: 20 },
];

// ─── Infrastructure Assets ────────────────────────────────────────────────────

const BASE_TS = new Date('2026-05-24T08:30:00Z').getTime();
function minsAgo(n: number): string {
  return new Date(BASE_TS - n * 60 * 1000).toISOString();
}

const PROD_MQ_ASSETS: RuntimeAsset[] = [
  {
    id: 'asset-mq-ibb1-01', name: 'MQ.PCA.GA.01', asset_type: 'MQ_QMGR', tech_stack: 'ibm_mq',
    environment: 'PRODUCTION', host: 'mq4uprdga01.ibb1.corp', port: 1414, platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[0],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: true, last_seen_at: minsAgo(5), is_deterministic: true, data_source: 'ibm_mq',
  },
  {
    id: 'asset-mq-shv-01', name: 'MQ.PCA.MA.01', asset_type: 'MQ_QMGR', tech_stack: 'ibm_mq',
    environment: 'PRODUCTION', host: 'mq4uprdma01.shv.corp', port: 1414, platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[1],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: true, last_seen_at: minsAgo(5), is_deterministic: true, data_source: 'ibm_mq',
  },
  {
    id: 'asset-oracle-ibb1-01', name: 'pcadb_primary', asset_type: 'ORACLE_DB', tech_stack: 'oracle',
    environment: 'PRODUCTION', host: 'ibb1h01.corp', platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[0],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'PRIMARY',
    write_authority: true, last_seen_at: minsAgo(8), is_deterministic: true, data_source: 'oracle_oem',
    metadata: { role_name: 'PRIMARY', target_name: 'pcadb@ibb1h01' },
  },
  {
    id: 'asset-oracle-shv-01', name: 'pcadb_standby', asset_type: 'ORACLE_DB', tech_stack: 'oracle',
    environment: 'PRODUCTION', host: 'shv01.corp', platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[1],
    latest_confidence_level: 3, latest_operational_state: 'STANDBY', latest_replication_role: 'PHYSICAL_STANDBY',
    write_authority: false, last_seen_at: minsAgo(8), is_deterministic: true, data_source: 'oracle_oem',
    metadata: { role_name: 'PHYSICAL STANDBY', target_name: 'pcadb@shv01' },
  },
  {
    id: 'asset-vm-ibb1-01', name: 'PCA-APP-01', asset_type: 'VM', tech_stack: 'vm',
    environment: 'PRODUCTION', host: 'pcaapp01.ibb1.corp', platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[0],
    latest_confidence_level: 4, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: false, last_seen_at: minsAgo(150), is_deterministic: true, data_source: 'cmdb',
  },
  {
    id: 'asset-vm-shv-01', name: 'PCA-APP-02', asset_type: 'VM', tech_stack: 'vm',
    environment: 'PRODUCTION', host: 'pcaapp02.shv.corp', platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[1],
    latest_confidence_level: 4, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: false, last_seen_at: minsAgo(150), is_deterministic: true, data_source: 'cmdb',
  },
];

const UAT_MQ_ASSETS: RuntimeAsset[] = [
  {
    id: 'asset-mq-uatga-01', name: 'MQ.PCA.UATGA.01', asset_type: 'MQ_QMGR', tech_stack: 'ibm_mq',
    environment: 'UAT', host: 'mq4uatga01.uat.corp', port: 1414, platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[2],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: true, last_seen_at: minsAgo(12), is_deterministic: true, data_source: 'ibm_mq',
  },
  {
    id: 'asset-mq-uatma-01', name: 'MQ.PCA.UATMA.01', asset_type: 'MQ_QMGR', tech_stack: 'ibm_mq',
    environment: 'UAT', host: 'mq4uatma01.uat.corp', port: 1414, platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[3],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: true, last_seen_at: minsAgo(12), is_deterministic: true, data_source: 'ibm_mq',
  },
];

const DUMPS_MONGO_ASSETS: RuntimeAsset[] = [
  {
    id: 'asset-mongo-az3-01', name: 'az003-mongo-01', asset_type: 'MONGO_NODE', tech_stack: 'mongodb',
    environment: 'PRODUCTION', host: 'az003-mongo-01.cloud.corp', platform: 'LINUX',
    data_center: MOCK_DATA_CENTERS[4],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'PRIMARY',
    write_authority: true, last_seen_at: minsAgo(12), is_deterministic: true, data_source: 'mongodb',
    metadata: { rs_nm: 'rs0', cluster: 'DUMPS-Cluster' },
  },
  {
    id: 'asset-mongo-az3-02', name: 'az003-mongo-02', asset_type: 'MONGO_NODE', tech_stack: 'mongodb',
    environment: 'PRODUCTION', host: 'az003-mongo-02.cloud.corp', platform: 'LINUX',
    data_center: MOCK_DATA_CENTERS[4],
    latest_confidence_level: 3, latest_operational_state: 'STANDBY', latest_replication_role: 'SECONDARY',
    write_authority: false, last_seen_at: minsAgo(12), is_deterministic: true, data_source: 'mongodb',
    metadata: { rs_nm: 'rs0', cluster: 'DUMPS-Cluster' },
  },
  {
    id: 'asset-mongo-az3-03', name: 'az003-mongo-03', asset_type: 'MONGO_NODE', tech_stack: 'mongodb',
    environment: 'PRODUCTION', host: 'az003-mongo-03.cloud.corp', platform: 'LINUX',
    data_center: MOCK_DATA_CENTERS[4],
    latest_confidence_level: 3, latest_operational_state: 'STANDBY', latest_replication_role: 'SECONDARY',
    write_authority: false, last_seen_at: minsAgo(12), is_deterministic: true, data_source: 'mongodb',
    metadata: { rs_nm: 'rs0', cluster: 'DUMPS-Cluster' },
  },
  {
    id: 'asset-oracle-shv-02', name: 'dumpsdb_primary', asset_type: 'ORACLE_DB', tech_stack: 'oracle',
    environment: 'PRODUCTION', host: 'shv02.corp', platform: 'UNIX',
    data_center: MOCK_DATA_CENTERS[1],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'PRIMARY',
    write_authority: true, last_seen_at: minsAgo(8), is_deterministic: true, data_source: 'oracle_oem',
    metadata: { role_name: 'PRIMARY', target_name: 'dumpsdb@shv02' },
  },
];

const PAYROLL_ASSETS: RuntimeAsset[] = [
  {
    id: 'asset-mssql-ibb1-01', name: 'PAYROLL-SQL-01', asset_type: 'SERVER', tech_stack: 'mssql',
    environment: 'PRODUCTION', host: 'payrollsql01.ibb1.corp', platform: 'WINDOWS',
    data_center: MOCK_DATA_CENTERS[0],
    latest_confidence_level: 4, latest_operational_state: 'ACTIVE', latest_replication_role: 'PRIMARY',
    write_authority: true, last_seen_at: minsAgo(155), is_deterministic: true, data_source: 'cmdb',
  },
  {
    id: 'asset-mssql-shv-01', name: 'PAYROLL-SQL-02', asset_type: 'SERVER', tech_stack: 'mssql',
    environment: 'PRODUCTION', host: 'payrollsql02.shv.corp', platform: 'WINDOWS',
    data_center: MOCK_DATA_CENTERS[1],
    latest_confidence_level: 4, latest_operational_state: 'STANDBY', latest_replication_role: 'SECONDARY',
    write_authority: false, last_seen_at: minsAgo(155), is_deterministic: true, data_source: 'cmdb',
  },
  {
    id: 'asset-ocp-ibb1-01', name: 'payroll-pod-01', asset_type: 'OCP_POD', tech_stack: 'ocp',
    environment: 'PRODUCTION', host: 'payroll-pod-01.ocp.ibb1.corp',
    data_center: MOCK_DATA_CENTERS[0],
    latest_confidence_level: 3, latest_operational_state: 'ACTIVE', latest_replication_role: 'NONE',
    write_authority: false, last_seen_at: minsAgo(155), is_deterministic: true, data_source: 'cmdb',
  },
];

// ─── Application Components ───────────────────────────────────────────────────

const PCA_PROD_COMPONENTS: ApplicationComponent[] = [
  {
    id: 'comp-pca-msg', application_id: 'PCA', application_name: 'PCA',
    component_name: 'PCA Messaging Layer', component_type: 'MESSAGING', tech_stack: 'ibm_mq',
    assets: PROD_MQ_ASSETS.filter((a) => a.tech_stack === 'ibm_mq'),
  },
  {
    id: 'comp-pca-db', application_id: 'PCA', application_name: 'PCA',
    component_name: 'PCA Database Tier', component_type: 'DATABASE', tech_stack: 'oracle',
    assets: PROD_MQ_ASSETS.filter((a) => a.tech_stack === 'oracle'),
  },
  {
    id: 'comp-pca-app', application_id: 'PCA', application_name: 'PCA',
    component_name: 'PCA Application Servers', component_type: 'COMPUTE', tech_stack: 'vm',
    assets: PROD_MQ_ASSETS.filter((a) => a.tech_stack === 'vm'),
  },
];

const PCA_UAT_COMPONENTS: ApplicationComponent[] = [
  {
    id: 'comp-pca-msg-uat', application_id: 'PCA', application_name: 'PCA',
    component_name: 'PCA Messaging Layer (UAT)', component_type: 'MESSAGING', tech_stack: 'ibm_mq',
    assets: UAT_MQ_ASSETS,
  },
];

const DUMPS_PROD_COMPONENTS: ApplicationComponent[] = [
  {
    id: 'comp-dumps-db', application_id: 'DUMPS', application_name: 'DUMPS',
    component_name: 'DUMPS MongoDB Cluster', component_type: 'DATABASE', tech_stack: 'mongodb',
    assets: DUMPS_MONGO_ASSETS.filter((a) => a.tech_stack === 'mongodb'),
  },
  {
    id: 'comp-dumps-oracle', application_id: 'DUMPS', application_name: 'DUMPS',
    component_name: 'DUMPS Oracle DB', component_type: 'DATABASE', tech_stack: 'oracle',
    assets: DUMPS_MONGO_ASSETS.filter((a) => a.tech_stack === 'oracle'),
  },
];

const PAYROLL_PROD_COMPONENTS: ApplicationComponent[] = [
  {
    id: 'comp-payroll-db', application_id: 'PAYROLL', application_name: 'Payroll System',
    component_name: 'Payroll MSSQL', component_type: 'DATABASE', tech_stack: 'mssql',
    assets: PAYROLL_ASSETS.filter((a) => a.tech_stack === 'mssql'),
  },
  {
    id: 'comp-payroll-app', application_id: 'PAYROLL', application_name: 'Payroll System',
    component_name: 'Payroll OCP Pods', component_type: 'COMPUTE', tech_stack: 'ocp',
    assets: PAYROLL_ASSETS.filter((a) => a.tech_stack === 'ocp'),
  },
];

// ─── Data Sources ─────────────────────────────────────────────────────────────

const DATA_SOURCES_FRESH: DataSourceInfo[] = [
  {
    source_name: 'ibm_mq', display_name: 'IBM MQ Prometheus', status: 'FRESH',
    record_count: 44, last_import: minsAgo(5),
    topology_confidence: 3, traffic_confidence: 3,
  },
  {
    source_name: 'mongodb', display_name: 'MongoDB Prometheus', status: 'FRESH',
    record_count: 22, last_import: minsAgo(12),
    topology_confidence: 3, traffic_confidence: 3,
  },
  {
    source_name: 'oracle_oem', display_name: 'Oracle OEM', status: 'FRESH',
    record_count: 41, last_import: minsAgo(8),
    topology_confidence: 3, traffic_confidence: 2,
  },
  {
    source_name: 'cmdb', display_name: 'CMDB Topology', status: 'STALE',
    record_count: 2, last_import: minsAgo(135),
    topology_confidence: 4, traffic_confidence: 3,
  },
];

// ─── Application Summary List ─────────────────────────────────────────────────

export function getMockApplications(): ApplicationLocationSummary[] {
  return [
    {
      application_id: 'PCA',
      application_name: 'PCA',
      environment: 'PRODUCTION',
      data_centers: ['IBB1', 'SHV'],
      primary_write_dc: 'IBB1',
      overall_confidence: 3,
      component_count: 3,
      asset_count: 6,
      stale_source_count: 1,
      last_updated: minsAgo(5),
    },
    {
      application_id: 'PCA',
      application_name: 'PCA',
      environment: 'UAT',
      data_centers: ['GA-UAT', 'MA-UAT'],
      primary_write_dc: 'GA-UAT',
      overall_confidence: 3,
      component_count: 1,
      asset_count: 2,
      stale_source_count: 0,
      last_updated: minsAgo(12),
    },
    {
      application_id: 'DUMPS',
      application_name: 'DUMPS',
      environment: 'PRODUCTION',
      data_centers: ['AZ3', 'SHV'],
      primary_write_dc: 'AZ3',
      overall_confidence: 3,
      component_count: 2,
      asset_count: 4,
      stale_source_count: 0,
      last_updated: minsAgo(12),
    },
    {
      application_id: 'PAYROLL',
      application_name: 'Payroll System',
      environment: 'PRODUCTION',
      data_centers: ['IBB1', 'SHV'],
      primary_write_dc: 'IBB1',
      overall_confidence: 4,
      component_count: 2,
      asset_count: 3,
      stale_source_count: 1,
      last_updated: minsAgo(155),
    },
    {
      application_id: 'CLAIMS',
      application_name: 'Claims Processing',
      environment: 'PRODUCTION',
      data_centers: ['IBB1'],
      primary_write_dc: 'IBB1',
      overall_confidence: 2,
      component_count: 1,
      asset_count: 2,
      stale_source_count: 2,
      missing_source_count: 2,
      last_updated: minsAgo(280),
    },
  ];
}

// ─── Application Detail ───────────────────────────────────────────────────────

export function getMockApplicationDetail(
  appId: string,
  environment?: string,
): ApplicationLocationDetail | null {
  const env = environment && environment !== 'ALL' ? environment : 'PRODUCTION';

  if (appId === 'PCA' && env === 'PRODUCTION') {
    return {
      application_id: 'PCA',
      application_name: 'PCA',
      environment: 'PRODUCTION',
      overall_confidence: 3,
      components: PCA_PROD_COMPONENTS,
      data_sources: DATA_SOURCES_FRESH,
      conflicts: [],
    };
  }

  if (appId === 'PCA' && env === 'UAT') {
    return {
      application_id: 'PCA',
      application_name: 'PCA',
      environment: 'UAT',
      overall_confidence: 3,
      components: PCA_UAT_COMPONENTS,
      data_sources: DATA_SOURCES_FRESH.filter((s) => s.source_name !== 'oracle_oem' && s.source_name !== 'cmdb'),
      conflicts: [],
    };
  }

  if (appId === 'DUMPS') {
    return {
      application_id: 'DUMPS',
      application_name: 'DUMPS',
      environment: 'PRODUCTION',
      overall_confidence: 3,
      components: DUMPS_PROD_COMPONENTS,
      data_sources: DATA_SOURCES_FRESH.filter((s) => s.source_name !== 'ibm_mq'),
      conflicts: [],
    };
  }

  if (appId === 'PAYROLL') {
    const conflict: SourceConflict = {
      asset_name: 'PAYROLL-SQL-01',
      source_a: { name: 'CMDB', says: 'PRIMARY' },
      source_b: { name: 'Oracle OEM', says: 'PHYSICAL_STANDBY' },
      last_checked: minsAgo(30),
    };
    return {
      application_id: 'PAYROLL',
      application_name: 'Payroll System',
      environment: 'PRODUCTION',
      overall_confidence: 3,
      components: PAYROLL_PROD_COMPONENTS,
      data_sources: DATA_SOURCES_FRESH,
      conflicts: [conflict],
    };
  }

  if (appId === 'CLAIMS') {
    return {
      application_id: 'CLAIMS',
      application_name: 'Claims Processing',
      environment: 'PRODUCTION',
      overall_confidence: 2,
      components: [
        {
          id: 'comp-claims-db', application_id: 'CLAIMS', application_name: 'Claims Processing',
          component_name: 'Claims Database', component_type: 'DATABASE', tech_stack: 'oracle',
          assets: [
            {
              id: 'asset-claims-oracle-01', name: 'claimsdb_primary', asset_type: 'ORACLE_DB', tech_stack: 'oracle',
              environment: 'PRODUCTION', host: 'ibb1h02.corp',
              data_center: MOCK_DATA_CENTERS[0],
              latest_confidence_level: 2, latest_operational_state: 'UNKNOWN',
              write_authority: undefined, last_seen_at: minsAgo(280),
              is_deterministic: false, data_source: 'oracle_oem',
            },
          ],
        },
      ],
      data_sources: DATA_SOURCES_FRESH.map((s) =>
        s.source_name === 'ibm_mq' || s.source_name === 'mongodb'
          ? { ...s, status: 'VERY_STALE' as const, last_import: minsAgo(300) }
          : s
      ),
      conflicts: [],
    };
  }

  return null;
}

// ─── Data Centers ─────────────────────────────────────────────────────────────

export function getMockDataCenters(): RuntimeDataCenter[] {
  return MOCK_DATA_CENTERS;
}

// ─── Import History ───────────────────────────────────────────────────────────

export function getMockImportHistory(): DataSourceImport[] {
  return [
    {
      id: 'import-001', source_name: 'ibm_mq', file_name: 'ibmma_qmgr_sever_status.csv',
      imported_at: minsAgo(5), record_count: 44, status: 'SUCCESS', errors: [],
    },
    {
      id: 'import-002', source_name: 'mongodb', file_name: 'mongodb_info.csv',
      imported_at: minsAgo(12), record_count: 22, status: 'SUCCESS', errors: [],
    },
    {
      id: 'import-003', source_name: 'oracle_oem', file_name: 'oem_db_role.csv',
      imported_at: minsAgo(8), record_count: 41, status: 'SUCCESS', errors: [],
    },
    {
      id: 'import-004', source_name: 'cmdb', file_name: 'business_application_topology.csv',
      imported_at: minsAgo(135), record_count: 2, status: 'SUCCESS', errors: [],
    },
  ];
}

// ─── CSV Import Simulation ────────────────────────────────────────────────────

export function simulateCsvImport(fileName: string, sourceType?: DataSourceName): DataSourceImport {
  const lower = fileName.toLowerCase();
  let source: DataSourceName = sourceType ?? 'cmdb';
  if (!sourceType) {
    if (lower.includes('ibmma') || lower.includes('mq')) source = 'ibm_mq';
    else if (lower.includes('mongodb')) source = 'mongodb';
    else if (lower.includes('oem') || lower.includes('oracle')) source = 'oracle_oem';
    else if (lower.includes('topology') || lower.includes('cmdb')) source = 'cmdb';
  }
  const recordCounts: Partial<Record<DataSourceName, number>> = {
    ibm_mq: 44, mongodb: 22, oracle_oem: 41, cmdb: 2,
    scom: 18, ocp: 35, kafka: 12, mssql: 8, avi_loadbalancer: 6, batch: 24, appdynamics: 150,
  };
  return {
    id: `import-${Date.now()}`,
    source_name: source,
    file_name: fileName,
    imported_at: new Date().toISOString(),
    record_count: recordCounts[source] ?? 0,
    status: 'SUCCESS',
    errors: [],
  };
}

// ─── Runtime Snapshots ───────────────────────────────────────────────────────

function makeSnapshots(
  assetId: string,
  source: DataSourceName,
  role: RuntimeSnapshot['replication_role'],
  state: RuntimeSnapshot['operational_state'],
  confidence: RuntimeSnapshot['confidence_level'],
  isDeterministic: boolean,
  count = 8,
): RuntimeSnapshot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `snap-${assetId}-${i}`,
    asset_id: assetId,
    snapshot_time: minsAgo(i * 15),
    operational_state: state,
    replication_role: role,
    data_source: source,
    confidence_level: confidence,
    is_deterministic: isDeterministic,
  }));
}

const PCA_PROD_SNAPSHOTS: RuntimeSnapshot[] = [
  ...makeSnapshots('asset-mq-ibb1-01',    'ibm_mq',     'NONE',             'ACTIVE',   3, true),
  ...makeSnapshots('asset-mq-shv-01',     'ibm_mq',     'NONE',             'ACTIVE',   3, true),
  ...makeSnapshots('asset-oracle-ibb1-01','oracle_oem',  'PRIMARY',          'ACTIVE',   3, true),
  ...makeSnapshots('asset-oracle-shv-01', 'oracle_oem',  'PHYSICAL_STANDBY', 'STANDBY',  3, true),
  ...makeSnapshots('asset-vm-ibb1-01',    'cmdb',        'NONE',             'ACTIVE',   4, true),
];

const PCA_UAT_SNAPSHOTS: RuntimeSnapshot[] = [
  ...makeSnapshots('asset-mq-uatga-01', 'ibm_mq', 'NONE', 'ACTIVE', 3, true),
  ...makeSnapshots('asset-mq-uatma-01', 'ibm_mq', 'NONE', 'ACTIVE', 3, true),
];

const DUMPS_SNAPSHOTS: RuntimeSnapshot[] = [
  ...makeSnapshots('asset-mongo-az3-01',  'mongodb', 'PRIMARY',   'ACTIVE',  3, true),
  ...makeSnapshots('asset-mongo-az3-02',  'mongodb', 'SECONDARY', 'STANDBY', 3, true),
  ...makeSnapshots('asset-mongo-az3-03',  'mongodb', 'SECONDARY', 'STANDBY', 3, true),
  ...makeSnapshots('asset-oracle-shv-02', 'oracle_oem', 'PRIMARY', 'ACTIVE',  3, true),
];

const PAYROLL_SNAPSHOTS: RuntimeSnapshot[] = [
  ...makeSnapshots('asset-mssql-ibb1-01', 'cmdb', 'PRIMARY',   'ACTIVE',  4, true),
  ...makeSnapshots('asset-mssql-shv-01',  'cmdb', 'SECONDARY', 'STANDBY', 4, true),
  ...makeSnapshots('asset-ocp-ibb1-01',   'cmdb', 'NONE',      'ACTIVE',  3, true),
];

const SNAPSHOTS_BY_APP: Record<string, RuntimeSnapshot[]> = {
  'PCA-PRODUCTION': PCA_PROD_SNAPSHOTS,
  'PCA-UAT':        PCA_UAT_SNAPSHOTS,
  'DUMPS-PRODUCTION': DUMPS_SNAPSHOTS,
  'PAYROLL-PRODUCTION': PAYROLL_SNAPSHOTS,
};

export function getMockSnapshots(appId: string, environment = 'PRODUCTION'): RuntimeSnapshot[] {
  return SNAPSHOTS_BY_APP[`${appId}-${environment}`] ?? [];
}

// ─── Incident / Failover Simulation ─────────────────────────────────────────

export interface FailoverImpact {
  application_id: string;
  application_name: string;
  environment: string;
  hasFailover: boolean;
  primaryDc: string;
  standbyDc?: string;
  failoverTarget?: string;
  promotionRequired?: boolean;
  criticalReason?: string;
}

const DC_ASSETS: Record<string, { appId: string; appName: string; env: string; role: string; hasStandby: boolean; standbyDc?: string; failoverTarget?: string }[]> = {
  'IBB1': [
    { appId: 'PCA',     appName: 'PCA',            env: 'PRODUCTION', role: 'PRIMARY write site', hasStandby: true,  standbyDc: 'SHV',  failoverTarget: 'pcadb_standby @ SHV (PHYSICAL STANDBY) — manual promotion required' },
    { appId: 'PAYROLL', appName: 'Payroll System',  env: 'PRODUCTION', role: 'PRIMARY write site', hasStandby: true,  standbyDc: 'SHV',  failoverTarget: 'PAYROLL-SQL-02 @ SHV (SECONDARY) — automatic failover possible' },
    { appId: 'CLAIMS',  appName: 'Claims Processing', env: 'PRODUCTION', role: 'ONLY site',       hasStandby: false },
  ],
  'SHV': [
    { appId: 'PCA',     appName: 'PCA',            env: 'PRODUCTION', role: 'STANDBY site',      hasStandby: true,  standbyDc: 'IBB1', failoverTarget: 'pcadb_primary @ IBB1 (PRIMARY) — already primary' },
    { appId: 'DUMPS',   appName: 'DUMPS',           env: 'PRODUCTION', role: 'Oracle STANDBY',    hasStandby: true,  standbyDc: 'AZ3',  failoverTarget: 'az003-mongo-01 @ AZ3 (MongoDB PRIMARY)' },
    { appId: 'PAYROLL', appName: 'Payroll System',  env: 'PRODUCTION', role: 'SECONDARY site',    hasStandby: true,  standbyDc: 'IBB1', failoverTarget: 'PAYROLL-SQL-01 @ IBB1 — already primary' },
  ],
  'AZ3': [
    { appId: 'DUMPS',   appName: 'DUMPS',           env: 'PRODUCTION', role: 'MongoDB PRIMARY',   hasStandby: false },
  ],
  'GA-UAT': [
    { appId: 'PCA',     appName: 'PCA',            env: 'UAT',        role: 'PRIMARY write site', hasStandby: true,  standbyDc: 'MA-UAT', failoverTarget: 'MQ.PCA.UATMA.01 @ MA-UAT' },
  ],
  'MA-UAT': [
    { appId: 'PCA',     appName: 'PCA',            env: 'UAT',        role: 'UAT secondary site', hasStandby: true,  standbyDc: 'GA-UAT', failoverTarget: 'MQ.PCA.UATGA.01 @ GA-UAT' },
  ],
};

export function simulateFailover(dcShortName: string): FailoverImpact[] {
  const impacts = DC_ASSETS[dcShortName] ?? [];
  return impacts.map((item) => ({
    application_id: item.appId,
    application_name: item.appName,
    environment: item.env,
    hasFailover: item.hasStandby,
    primaryDc: dcShortName,
    standbyDc: item.standbyDc,
    failoverTarget: item.failoverTarget,
    promotionRequired: item.failoverTarget?.includes('manual promotion') ?? false,
    criticalReason: item.hasStandby ? undefined : `${item.appName} has no failover site — application will be OFFLINE`,
  }));
}

export const AVAILABLE_DCS = ['IBB1', 'SHV', 'AZ3', 'GA-UAT', 'MA-UAT'];

// ─── Data Coverage Matrix ─────────────────────────────────────────────────────

export interface TechStackCoverage {
  techStack: string;
  displayName: string;
  topologySource: string | null;
  topologyConfidence: number;
  trafficSource: string | null;
  trafficConfidence: number;
  sampleAvailable: 'Yes' | 'No' | 'Partial';
}

export const TECH_STACK_COVERAGE: TechStackCoverage[] = [
  {
    techStack: 'ibm_mq',  displayName: 'IBM MQ',
    topologySource: 'ibm_mq_prometheus', topologyConfidence: 3,
    trafficSource: 'ibm_mq_prometheus',  trafficConfidence: 3,
    sampleAvailable: 'Yes',
  },
  {
    techStack: 'mongodb', displayName: 'MongoDB',
    topologySource: 'mongo_prometheus', topologyConfidence: 3,
    trafficSource: 'mongo_prometheus',  trafficConfidence: 3,
    sampleAvailable: 'Yes',
  },
  {
    techStack: 'oracle',  displayName: 'Oracle',
    topologySource: 'oracle_oem', topologyConfidence: 3,
    trafficSource: null,           trafficConfidence: 2,
    sampleAvailable: 'Yes',
  },
  {
    techStack: 'mssql',   displayName: 'MS SQL',
    topologySource: 'cmdb', topologyConfidence: 4,
    trafficSource: null,     trafficConfidence: 1,
    sampleAvailable: 'Partial',
  },
  {
    techStack: 'kafka',   displayName: 'Kafka',
    topologySource: null,   topologyConfidence: 1,
    trafficSource: null,    trafficConfidence: 1,
    sampleAvailable: 'No',
  },
  {
    techStack: 'ocp',     displayName: 'OCP / Kubernetes',
    topologySource: 'cmdb', topologyConfidence: 3,
    trafficSource: null,     trafficConfidence: 1,
    sampleAvailable: 'Partial',
  },
  {
    techStack: 'vm',      displayName: 'VM (Generic)',
    topologySource: 'cmdb', topologyConfidence: 4,
    trafficSource: null,     trafficConfidence: 1,
    sampleAvailable: 'Yes',
  },
];

// ─── Tech stack lookup per application ───────────────────────────────────────

const APP_TECH_STACKS: Record<string, string[]> = {
  'PCA':     ['ibm_mq', 'oracle', 'vm'],
  'DUMPS':   ['mongodb', 'oracle'],
  'PAYROLL': ['mssql', 'ocp'],
  'CLAIMS':  ['oracle'],
};

export function getAppTechStacks(appId: string): string[] {
  return APP_TECH_STACKS[appId] ?? [];
}

// ─── Confidence Label / Color helpers ────────────────────────────────────────

export const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Unknown', 2: 'Low', 3: 'Moderate', 4: 'High',
};

export const CONFIDENCE_COLORS: Record<number, string> = {
  1: 'var(--text-muted)',
  2: '#FF453A',
  3: '#FF9F0A',
  4: '#30D158',
};

export const FRESHNESS_THRESHOLDS = {
  stale: 30,      // minutes
  veryStale: 120, // minutes
};

export function getFreshnessStatus(lastUpdated?: string): 'FRESH' | 'STALE' | 'VERY_STALE' | 'UNKNOWN' {
  if (!lastUpdated) return 'UNKNOWN';
  const ageMinutes = (Date.now() - new Date(lastUpdated).getTime()) / 60000;
  if (ageMinutes < FRESHNESS_THRESHOLDS.stale) return 'FRESH';
  if (ageMinutes < FRESHNESS_THRESHOLDS.veryStale) return 'STALE';
  return 'VERY_STALE';
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Never';
  const ageSeconds = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (ageSeconds < 60) return 'Just now';
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h ${Math.floor((ageSeconds % 3600) / 60)}m ago`;
  return `${Math.floor(ageSeconds / 86400)}d ago`;
}

// ─── Environment Comparison ───────────────────────────────────────────────────

export type EnvComparisonStatus = 'consistent' | 'inconsistent' | 'prod_only' | 'uat_only' | 'dr_only';

export interface EnvComparisonRow {
  asset_name: string;
  tech_stack: string;
  component: string;
  prod_role?: string;
  prod_dc?: string;
  prod_confidence?: number;
  uat_role?: string;
  uat_dc?: string;
  uat_confidence?: number;
  dr_role?: string;
  dr_dc?: string;
  dr_confidence?: number;
  status: EnvComparisonStatus;
}

const PCA_ENV_COMPARISON: EnvComparisonRow[] = [
  {
    asset_name: 'MQ.PCA.GA', tech_stack: 'ibm_mq', component: 'PCA Messaging Layer',
    prod_role: 'ACTIVE', prod_dc: 'IBB1', prod_confidence: 3,
    uat_role: 'ACTIVE',  uat_dc: 'GA-UAT', uat_confidence: 3,
    dr_role: 'STANDBY',  dr_dc: 'MA-UAT',  dr_confidence: 3,
    status: 'consistent',
  },
  {
    asset_name: 'MQ.PCA.MA', tech_stack: 'ibm_mq', component: 'PCA Messaging Layer',
    prod_role: 'ACTIVE', prod_dc: 'SHV', prod_confidence: 3,
    uat_role: 'ACTIVE',  uat_dc: 'MA-UAT', uat_confidence: 3,
    dr_role: 'STANDBY',  dr_dc: 'GA-UAT',  dr_confidence: 3,
    status: 'consistent',
  },
  {
    asset_name: 'pcadb_primary', tech_stack: 'oracle', component: 'PCA Database Tier',
    prod_role: 'PRIMARY', prod_dc: 'IBB1', prod_confidence: 3,
    uat_role: undefined,  uat_dc: undefined, uat_confidence: undefined,
    dr_role: 'PHYSICAL_STANDBY', dr_dc: 'SHV', dr_confidence: 4,
    status: 'consistent',
  },
  {
    asset_name: 'pcadb_standby', tech_stack: 'oracle', component: 'PCA Database Tier',
    prod_role: 'PHYSICAL_STANDBY', prod_dc: 'SHV', prod_confidence: 3,
    uat_role: undefined,             uat_dc: undefined, uat_confidence: undefined,
    dr_role: 'PHYSICAL_STANDBY',     dr_dc: 'SHV',      dr_confidence: 4,
    status: 'consistent',
  },
  {
    asset_name: 'PCA-APP-01', tech_stack: 'vm', component: 'PCA Application Servers',
    prod_role: 'ACTIVE', prod_dc: 'IBB1', prod_confidence: 4,
    uat_role: 'ACTIVE',  uat_dc: 'GA-UAT', uat_confidence: 4,
    dr_role: 'STANDBY',  dr_dc: 'SHV',      dr_confidence: 4,
    status: 'consistent',
  },
  {
    asset_name: 'pcadb_uat_primary', tech_stack: 'oracle', component: 'PCA Database Tier (UAT)',
    prod_role: undefined, prod_dc: undefined, prod_confidence: undefined,
    uat_role: 'PRIMARY',  uat_dc: 'GA-UAT',  uat_confidence: 2,
    dr_role: undefined,   dr_dc: undefined,   dr_confidence: undefined,
    status: 'uat_only',
  },
];

const DUMPS_ENV_COMPARISON: EnvComparisonRow[] = [
  {
    asset_name: 'az003-mongo-01', tech_stack: 'mongodb', component: 'DUMPS MongoDB Cluster',
    prod_role: 'PRIMARY',   prod_dc: 'AZ3', prod_confidence: 3,
    uat_role: 'PRIMARY',    uat_dc: 'AZ3',  uat_confidence: 3,
    dr_role: 'SECONDARY',   dr_dc: 'AZ3',   dr_confidence: 3,
    status: 'consistent',
  },
  {
    asset_name: 'az003-mongo-02', tech_stack: 'mongodb', component: 'DUMPS MongoDB Cluster',
    prod_role: 'SECONDARY', prod_dc: 'AZ3', prod_confidence: 3,
    uat_role: 'PRIMARY',    uat_dc: 'AZ3',  uat_confidence: 3,
    dr_role: 'SECONDARY',   dr_dc: 'AZ3',   dr_confidence: 3,
    status: 'inconsistent',
  },
  {
    asset_name: 'dumpsdb_primary', tech_stack: 'oracle', component: 'DUMPS Oracle DB',
    prod_role: 'PRIMARY', prod_dc: 'SHV', prod_confidence: 3,
    uat_role: undefined,  uat_dc: undefined, uat_confidence: undefined,
    dr_role: 'PHYSICAL_STANDBY', dr_dc: 'SHV', dr_confidence: 3,
    status: 'consistent',
  },
];

const ENV_COMPARISON_BY_APP: Record<string, EnvComparisonRow[]> = {
  PCA:     PCA_ENV_COMPARISON,
  DUMPS:   DUMPS_ENV_COMPARISON,
};

export function getEnvComparison(appId: string): EnvComparisonRow[] {
  return ENV_COMPARISON_BY_APP[appId] ?? [];
}
