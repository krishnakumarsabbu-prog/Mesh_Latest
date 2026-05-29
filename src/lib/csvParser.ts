/**
 * Real CSV parser for all 4 topology file formats.
 * Parses uploaded files and builds RuntimeAsset / ApplicationLocationSummary data.
 */
import {
  RuntimeAsset,
  RuntimeDataCenter,
  ApplicationComponent,
  ApplicationLocationSummary,
  ApplicationLocationDetail,
  DataSourceInfo,
  DataSourceImport,
  DataSourceName,
  ConfidenceLevel,
  AssetType,
  TechStack,
} from '@/types';

// ─── Utility ─────────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return row;
  });
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveDCFromMQHostname(hostname: string): { name: string; short_name: string } {
  const h = hostname.toLowerCase();
  if (h.startsWith('mq4uprdga') || h.includes('prdga')) return { name: 'DC Georgia Production', short_name: 'GA-PRD' };
  if (h.startsWith('mq4uprdma') || h.includes('prdma')) return { name: 'DC Maryland Production', short_name: 'MA-PRD' };
  if (h.startsWith('mq4uatga') || h.includes('uatga'))  return { name: 'DC Georgia UAT',         short_name: 'GA-UAT' };
  if (h.startsWith('mq4uatma') || h.includes('uatma'))  return { name: 'DC Maryland UAT',         short_name: 'MA-UAT' };
  if (h.includes('prd') || h.includes('prod'))           return { name: 'DC Production',           short_name: 'PRD'    };
  if (h.includes('uat'))                                 return { name: 'DC UAT',                  short_name: 'UAT'    };
  return { name: 'DC Unknown (Inferred)',                short_name: 'UNK' };
}

function resolveDCFromMongoHostname(hostname: string): { name: string; short_name: string } {
  const h = hostname.toLowerCase();
  const az = h.match(/az(\d+)/);
  if (az) return { name: `Azure Zone ${az[1]}`, short_name: `AZ${az[1]}` };
  if (h.includes('prod') || h.includes('prd')) return { name: 'DC Production', short_name: 'PRD' };
  if (h.includes('uat'))                        return { name: 'DC UAT',        short_name: 'UAT' };
  return { name: 'DC Cloud (Inferred)', short_name: 'CLD' };
}

function resolveDCFromOracleHostname(hostname: string): { name: string; short_name: string } {
  const h = hostname.toLowerCase();
  if (h.includes('ibb1'))  return { name: 'DC Birmingham IBB1', short_name: 'IBB1' };
  if (h.includes('shv'))   return { name: 'DC Shoreview',        short_name: 'SHV'  };
  if (h.includes('uat'))   return { name: 'DC UAT',              short_name: 'UAT'  };
  if (h.includes('prod') || h.includes('prd')) return { name: 'DC Production', short_name: 'PRD' };
  return { name: 'DC Unknown (Inferred)', short_name: 'UNK' };
}

function parseOracleTarget(target: string): { host: string; dbName: string } {
  if (target.includes('@')) {
    const [db, host] = target.split('@', 2);
    return { host: host.trim(), dbName: db.trim() };
  }
  if (target.includes('_')) {
    const parts = target.split('_');
    return { host: parts[parts.length - 1], dbName: parts.slice(0, -1).join('_') };
  }
  return { host: target, dbName: target };
}

function getOrCreateDC(
  dcMap: Map<string, RuntimeDataCenter>,
  info: { name: string; short_name: string },
): RuntimeDataCenter {
  const key = info.short_name;
  if (!dcMap.has(key)) {
    dcMap.set(key, { id: `dc-${key.toLowerCase()}`, name: info.name, short_name: info.short_name, asset_count: 0 });
  }
  return dcMap.get(key)!;
}

// ─── Parsed result ────────────────────────────────────────────────────────────

export interface ParsedCSVResult {
  import: DataSourceImport;
  assets: RuntimeAsset[];
  dataCenters: RuntimeDataCenter[];
  /** For CMDB: application-level data */
  applications?: ApplicationLocationSummary[];
  components?: ApplicationComponent[];
  detail?: ApplicationLocationDetail;
}

// ─── IBM MQ Parser ────────────────────────────────────────────────────────────
// Expected columns: hostname, qmgr, env, platform, port

export function parseIBMMQ(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const hostname     = row['hostname']      || row['HOSTNAME']      || '';
      const qmgr         = row['qmgr']          || row['QMGR']          || hostname;
      const env          = (row['env']          || row['ENV']           || 'UAT').toUpperCase();
      const platform     = row['platform']      || row['PLATFORM']      || 'UNIX';
      const port         = parseInt(row['port'] || row['PORT']          || '1414', 10) || 1414;
      const cluster      = row['cluster']       || '';
      const exportedQmgr = row['exported_qmgr'] || '';
      const mqNamespace  = row['mq_namespace']  || '';

      if (!hostname) { errors.push(`Row missing hostname: ${JSON.stringify(row)}`); continue; }

      const dcInfo = resolveDCFromMQHostname(hostname);
      const dc = getOrCreateDC(dcMap, dcInfo);
      dc.asset_count++;

      const assetEnv = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' :
                       env === 'DR' ? 'DR' : 'UAT';

      // Cluster membership signals multi-DC participation — confidence 4 if cluster is set
      const isClusterMember = cluster.length > 0;
      const confidenceLevel: ConfidenceLevel = isClusterMember ? 4 : 3;

      assets.push({
        id: uid(),
        name: qmgr || hostname,
        asset_type: 'MQ_QMGR',
        tech_stack: 'ibm_mq',
        environment: assetEnv,
        host: hostname,
        port,
        platform,
        data_center: dc,
        latest_confidence_level: confidenceLevel,
        latest_operational_state: 'ACTIVE',
        latest_replication_role: 'NONE',
        write_authority: true,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'ibm_mq',
        metadata: {
          cluster,
          exported_qmgr: exportedQmgr,
          mq_namespace: mqNamespace,
          cluster_role: isClusterMember ? 'CLUSTER_MEMBER' : 'STANDALONE',
        },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(),
      source_name: 'ibm_mq',
      file_name: fileName,
      imported_at: new Date().toISOString(),
      record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED',
      errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── MongoDB Parser ───────────────────────────────────────────────────────────
// Expected columns: cluster, role, env, hostname, replica_state_name, rs_nm

export function parseMongoDB(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const hostname      = row['hostname']            || row['HOSTNAME']            || '';
      const replicaState  = (row['replica_state_name'] || row['REPLICA_STATE_NAME'] || 'SECONDARY').toUpperCase();
      const rsNm          = row['rs_nm']               || row['RS_NM']               || '';
      const env           = (row['env']                || row['ENV']                || 'UAT').toUpperCase();
      const cluster       = row['cluster']             || row['CLUSTER']             || '';
      const role          = (row['cl_role']            || row['role']               || row['ROLE'] || '').toLowerCase();
      const orgId         = row['org_id']              || '';
      const groupId       = row['group_id']            || '';
      const mongoVersion  = row['mongodb_version']     || '';
      const processType   = row['process_type']        || '';
      // Value column: 1=primary, 2=secondary (authoritative integer state)
      const valueInt      = parseInt(row['Value'] || row['value'] || '0', 10);

      if (!hostname) { errors.push(`Row missing hostname: ${JSON.stringify(row)}`); continue; }

      const dcInfo = resolveDCFromMongoHostname(hostname);
      const dc = getOrCreateDC(dcMap, dcInfo);
      dc.asset_count++;

      const isPrimaryText  = replicaState === 'PRIMARY';
      const isPrimaryInt   = valueInt === 1;
      const isMongos       = role === 'mongos' || processType === 'mongos';
      const isConfigSvr    = role.includes('config') || processType === 'config';
      const assetEnv       = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' :
                             env === 'DR' ? 'DR' : 'UAT';

      // Cross-validate text vs integer — if they disagree, lower confidence
      const textAndIntAgree = (isPrimaryText === isPrimaryInt) || isMongos || isConfigSvr;
      const confidenceLevel: ConfidenceLevel = textAndIntAgree ? 3 : 2;
      const hasInternalConflict = !textAndIntAgree && replicaState !== 'NONE' && valueInt !== 0;

      // Use integer (more deterministic) when they disagree
      const isPrimary = hasInternalConflict ? isPrimaryInt : isPrimaryText;

      const replicationRole = isMongos ? 'MONGOS' :
                              isConfigSvr ? 'CONFIG_SVR' :
                              isPrimary ? 'PRIMARY' : 'SECONDARY';

      assets.push({
        id: uid(),
        name: hostname,
        asset_type: 'MONGO_NODE',
        tech_stack: 'mongodb',
        environment: assetEnv,
        host: hostname,
        platform: 'LINUX',
        data_center: dc,
        latest_confidence_level: confidenceLevel,
        latest_operational_state: isPrimary || isMongos ? 'ACTIVE' : 'STANDBY',
        latest_replication_role: replicationRole,
        write_authority: isPrimary,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'mongodb',
        metadata: {
          rs_nm: rsNm,
          cluster,
          org_id: orgId,
          group_id: groupId,
          mongodb_version: mongoVersion,
          process_type: processType,
          value_int: String(valueInt),
          internal_conflict: hasInternalConflict ? `text=${replicaState} vs int=${valueInt}` : '',
        },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(),
      source_name: 'mongodb',
      file_name: fileName,
      imported_at: new Date().toISOString(),
      record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED',
      errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── Oracle OEM Parser ────────────────────────────────────────────────────────
// Expected columns: role_name, target_name, env

export function parseOracleOEM(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const roleName   = (row['role_name']   || row['ROLE_NAME']   || '').toUpperCase();
      const targetName =  row['target_name'] || row['TARGET_NAME'] || '';
      const env        = (row['env']         || row['ENV']         || 'uat').toUpperCase();

      if (!targetName) { errors.push(`Row missing target_name: ${JSON.stringify(row)}`); continue; }

      const { host, dbName } = parseOracleTarget(targetName);
      const dcInfo = resolveDCFromOracleHostname(host || targetName);
      const dc = getOrCreateDC(dcMap, dcInfo);
      dc.asset_count++;

      const isStandby    = roleName.includes('STANDBY');
      const assetEnv     = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' :
                           env === 'DR' ? 'DR' : 'UAT';

      assets.push({
        id: uid(),
        name: dbName || targetName,
        asset_type: 'ORACLE_DB',
        tech_stack: 'oracle',
        environment: assetEnv,
        host: host || targetName,
        platform: 'UNIX',
        data_center: dc,
        latest_confidence_level: 3,
        latest_operational_state: isStandby ? 'STANDBY' : 'ACTIVE',
        latest_replication_role: isStandby ? 'PHYSICAL_STANDBY' : 'PRIMARY',
        write_authority: !isStandby,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'oracle_oem',
        metadata: { role_name: roleName, target_name: targetName },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(),
      source_name: 'oracle_oem',
      file_name: fileName,
      imported_at: new Date().toISOString(),
      record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED',
      errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── CMDB Topology Parser ─────────────────────────────────────────────────────
// Expected columns: APPLICATION_NAME, APPLICATION_ID, ENVIRONMENT,
//                   DEVICE_NAME, DEVICE_TYPE, DATA_CENTER  (+ hierarchy cols)

function classifyTechStack(deviceType: string): TechStack {
  const t = deviceType.toUpperCase();
  if (t.includes('MQ') || t.includes('QUEUE'))       return 'ibm_mq';
  if (t.includes('MONGO'))                            return 'mongodb';
  if (t.includes('ORACLE') || t.includes('ORA'))     return 'oracle';
  if (t.includes('SQL') || t.includes('MSSQL'))      return 'mssql';
  if (t.includes('KAFKA'))                            return 'kafka';
  if (t.includes('OCP') || t.includes('OPENSHIFT') || t.includes('KUBE') || t.includes('POD')) return 'ocp';
  return 'vm';
}

function classifyAssetType(deviceType: string): AssetType {
  const t = deviceType.toUpperCase();
  if (t.includes('MQ') || t.includes('QUEUE'))   return 'MQ_QMGR';
  if (t.includes('MONGO'))                        return 'MONGO_NODE';
  if (t.includes('ORACLE'))                       return 'ORACLE_DB';
  if (t.includes('OCP') || t.includes('POD'))    return 'OCP_POD';
  if (t.includes('SERVER') || t.includes('HOST')) return 'SERVER';
  return 'VM';
}

function classifyComponentType(deviceType: string): ApplicationComponent['component_type'] {
  const t = deviceType.toUpperCase();
  if (t.includes('DB') || t.includes('DATABASE') || t.includes('ORACLE') || t.includes('SQL') || t.includes('MONGO')) return 'DATABASE';
  if (t.includes('MQ') || t.includes('QUEUE') || t.includes('KAFKA') || t.includes('MSG')) return 'MESSAGING';
  if (t.includes('STORAGE') || t.includes('NAS') || t.includes('SAN'))  return 'STORAGE';
  return 'COMPUTE';
}

export function parseCMDB(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  // Group by application
  const appMap = new Map<string, {
    appId: string; appName: string; env: string;
    assets: RuntimeAsset[]; deviceTypes: Set<string>;
  }>();

  for (const row of rows) {
    try {
      const appName    = row['APPLICATION_NAME'] || row['application_name'] || '';
      const appId      = row['APPLICATION_ID']   || row['application_id']   || appName.split(' ')[0].toUpperCase();
      const env        = (row['ENVIRONMENT']     || row['environment']     || 'UAT').toUpperCase();
      const deviceName = row['DEVICE_NAME']      || row['device_name']     || '';
      const deviceType = row['DEVICE_TYPE']      || row['device_type']     || 'SERVER';
      const dcName     = row['DATA_CENTER']      || row['data_center']     || '';

      // Capture full DEVICE hierarchy chain (LVL1→LVL4 = catalog→instance→server)
      const lvl1Name = row['DEVICE_LVL1_NAME'] || '';
      const lvl1Type = row['DEVICE_LVL1_TYPE'] || '';
      const lvl2Name = row['DEVICE_LVL2_NAME'] || '';
      const lvl2Type = row['DEVICE_LVL2_TYPE'] || '';
      const lvl3Name = row['DEVICE_LVL3_NAME'] || '';
      const lvl3Type = row['DEVICE_LVL3_TYPE'] || '';
      const lvl4Name = row['DEVICE_LVL4_NAME'] || '';
      const lvl4Type = row['DEVICE_LVL4_TYPE'] || '';

      if (!deviceName || !appName) {
        errors.push(`Row missing required fields: ${JSON.stringify(row)}`);
        continue;
      }

      // Resolve DC from DATA_CENTER column (CMDB is authoritative)
      const dcShortName = dcName.replace(/^DC\s+/i, '').replace(/\s+/g, '-').toUpperCase().slice(0, 8) || 'UNK';
      const dc = getOrCreateDC(dcMap, { name: dcName || 'Unknown DC', short_name: dcShortName });
      dc.asset_count++;

      const assetEnv   = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' :
                         env === 'DR' ? 'DR' : 'UAT';
      const techStack  = classifyTechStack(deviceType);
      const assetType  = classifyAssetType(deviceType);

      // Infer replication role from device hierarchy: Oracle catalog → instance reveals HA
      let inferredRole: RuntimeAsset['latest_replication_role'] = 'NONE';
      const isOracleHierarchy = lvl1Type.toUpperCase().includes('CATALOG') || lvl2Type.toUpperCase().includes('INSTANCE');
      if (isOracleHierarchy && assetType === 'ORACLE_DB') {
        // If LVL2 is an instance and LVL3 is the server, we can infer this is an Oracle RAC or Data Guard node
        inferredRole = 'PRIMARY'; // CMDB alone can't say standby — OEM enriches this
      }

      const asset: RuntimeAsset = {
        id: uid(),
        name: deviceName,
        asset_type: assetType,
        tech_stack: techStack,
        environment: assetEnv,
        host: deviceName,
        data_center: dc,
        latest_confidence_level: 4,
        latest_operational_state: 'ACTIVE',
        latest_replication_role: inferredRole,
        write_authority: false,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'cmdb',
        metadata: {
          device_type: deviceType,
          data_center: dcName,
          lvl1: lvl1Name ? `${lvl1Name}(${lvl1Type})` : '',
          lvl2: lvl2Name ? `${lvl2Name}(${lvl2Type})` : '',
          lvl3: lvl3Name ? `${lvl3Name}(${lvl3Type})` : '',
          lvl4: lvl4Name ? `${lvl4Name}(${lvl4Type})` : '',
          device_chain: [lvl1Name, lvl2Name, lvl3Name, lvl4Name].filter(Boolean).join(' → '),
        },
      };
      assets.push(asset);

      // Group for application building
      const key = `${appId}-${assetEnv}`;
      if (!appMap.has(key)) {
        appMap.set(key, { appId, appName, env: assetEnv, assets: [], deviceTypes: new Set() });
      }
      appMap.get(key)!.assets.push(asset);
      appMap.get(key)!.deviceTypes.add(deviceType);
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  // Build ApplicationLocationSummary + ApplicationLocationDetail for each app
  const applications: ApplicationLocationSummary[] = [];
  const allComponents: ApplicationComponent[] = [];

  for (const [, app] of appMap) {
    const dcSet = new Set<string>();
    app.assets.forEach((a) => {
      if (a.data_center?.short_name) dcSet.add(a.data_center.short_name);
    });

    // Group assets into components by device type
    const compMap = new Map<string, RuntimeAsset[]>();
    app.assets.forEach((a) => {
      const compType = classifyComponentType(a.metadata?.device_type ?? a.asset_type);
      const compKey  = `${app.appId}-${compType}`;
      if (!compMap.has(compKey)) compMap.set(compKey, []);
      compMap.get(compKey)!.push(a);
    });

    const components: ApplicationComponent[] = Array.from(compMap.entries()).map(([key, compAssets]) => {
      const compType = key.split('-').slice(1).join('-') as ApplicationComponent['component_type'];
      const techStacks = [...new Set(compAssets.map((a) => a.tech_stack))];
      return {
        id: uid(),
        application_id: app.appId,
        application_name: app.appName,
        component_name: `${app.appName} ${compType.charAt(0) + compType.slice(1).toLowerCase()} Tier`,
        component_type: compType,
        tech_stack: techStacks[0] ?? 'vm',
        assets: compAssets,
      };
    });
    allComponents.push(...components);

    applications.push({
      application_id: app.appId,
      application_name: app.appName,
      environment: app.env as 'PRODUCTION' | 'UAT' | 'DR',
      data_centers: Array.from(dcSet),
      overall_confidence: 4,
      component_count: components.length,
      asset_count: app.assets.length,
      stale_source_count: 0,
      last_updated: new Date().toISOString(),
    });
  }

  return {
    import: {
      id: uid(),
      source_name: 'cmdb',
      file_name: fileName,
      imported_at: new Date().toISOString(),
      record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED',
      errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
    applications,
    components: allComponents,
  };
}

// ─── Kafka Parser ─────────────────────────────────────────────────────────────
// Expected columns: broker_id, hostname, cluster_name, rack, env, is_controller

export function parseKafka(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const hostname      = row['hostname']      || row['HOSTNAME']      || row['host'] || '';
      const brokerId      = row['broker_id']     || row['BROKER_ID']     || '';
      const clusterName   = row['cluster_name']  || row['CLUSTER_NAME']  || '';
      const rack          = row['rack']          || row['RACK']          || '';
      const env           = (row['env']          || row['ENV']           || 'PRODUCTION').toUpperCase();
      const isController  = (row['is_controller'] || '').toLowerCase() === 'true';

      if (!hostname) { errors.push(`Row missing hostname: ${JSON.stringify(row)}`); continue; }

      // Kafka rack often encodes DC: 'ibb1-a' → IBB1, 'shv-b' → SHV
      let dcInfo: { name: string; short_name: string };
      const rackDC = rack.split('-')[0].toUpperCase();
      if (rackDC && rackDC.length <= 6) {
        dcInfo = { name: `DC ${rackDC}`, short_name: rackDC };
      } else {
        dcInfo = resolveDCFromMQHostname(hostname); // fallback to hostname pattern
      }

      const dc = getOrCreateDC(dcMap, dcInfo);
      dc.asset_count++;

      const assetEnv = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' : env === 'DR' ? 'DR' : 'UAT';

      assets.push({
        id: uid(),
        name: hostname,
        asset_type: 'KAFKA_BROKER',
        tech_stack: 'kafka',
        environment: assetEnv,
        host: hostname,
        platform: 'LINUX',
        data_center: dc,
        latest_confidence_level: 3,
        latest_operational_state: 'ACTIVE',
        latest_replication_role: isController ? 'PRIMARY' : 'SECONDARY',
        write_authority: isController,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'cmdb',
        metadata: { broker_id: brokerId, cluster_name: clusterName, rack },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(), source_name: 'cmdb', file_name: fileName,
      imported_at: new Date().toISOString(), record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED', errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── MS SQL Parser ────────────────────────────────────────────────────────────
// Expected columns: instance_name, hostname, env, role (PRIMARY/SECONDARY/MIRROR/STANDALONE)

export function parseMSSQL(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const hostname     = row['hostname']      || row['HOSTNAME']      || row['server_name'] || '';
      const instanceName = row['instance_name'] || row['INSTANCE_NAME'] || row['db_name'] || hostname;
      const role         = (row['role']         || row['ROLE']         || 'STANDALONE').toUpperCase();
      const env          = (row['env']          || row['ENV']          || 'PRODUCTION').toUpperCase();
      const dc           = row['data_center']   || row['DATA_CENTER']   || '';

      if (!hostname) { errors.push(`Row missing hostname: ${JSON.stringify(row)}`); continue; }

      let dcInfo: { name: string; short_name: string };
      if (dc) {
        const s = dc.replace(/^DC\s+/i, '').replace(/\s+/g, '-').toUpperCase().slice(0, 8);
        dcInfo = { name: dc, short_name: s };
      } else {
        dcInfo = resolveDCFromOracleHostname(hostname);
      }

      const dcObj = getOrCreateDC(dcMap, dcInfo);
      dcObj.asset_count++;

      const assetEnv    = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' : env === 'DR' ? 'DR' : 'UAT';
      const isPrimary   = role === 'PRIMARY' || role === 'STANDALONE';
      const isStandby   = role === 'SECONDARY' || role === 'MIRROR';

      assets.push({
        id: uid(),
        name: instanceName,
        asset_type: 'SERVER',
        tech_stack: 'mssql',
        environment: assetEnv,
        host: hostname,
        platform: 'WINDOWS',
        data_center: dcObj,
        latest_confidence_level: 3,
        latest_operational_state: isPrimary ? 'ACTIVE' : isStandby ? 'STANDBY' : 'UNKNOWN',
        latest_replication_role: isPrimary ? 'PRIMARY' : isStandby ? 'SECONDARY' : 'NONE',
        write_authority: isPrimary,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'cmdb',
        metadata: { role, instance_name: instanceName },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(), source_name: 'cmdb', file_name: fileName,
      imported_at: new Date().toISOString(), record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED', errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── OCP / Kubernetes Parser ──────────────────────────────────────────────────
// Expected columns: pod_name, namespace, node_name, cluster, env

export function parseOCP(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const podName   = row['pod_name']   || row['POD_NAME']   || row['name'] || '';
      const nodeName  = row['node_name']  || row['NODE_NAME']  || '';
      const namespace = row['namespace']  || row['NAMESPACE']  || '';
      const cluster   = row['cluster']    || row['CLUSTER']    || '';
      const env       = (row['env']       || row['ENV']        || 'PRODUCTION').toUpperCase();
      const dc        = row['data_center']|| row['DATA_CENTER']|| row['zone'] || '';

      if (!podName && !nodeName) { errors.push(`Row missing pod/node name`); continue; }

      const name = podName || nodeName;
      let dcInfo: { name: string; short_name: string };
      if (dc) {
        const s = dc.replace(/^DC\s+/i, '').replace(/\s+/g, '-').toUpperCase().slice(0, 8);
        dcInfo = { name: dc, short_name: s };
      } else if (cluster) {
        dcInfo = { name: `Cluster ${cluster}`, short_name: cluster.slice(0, 6).toUpperCase() };
      } else {
        dcInfo = resolveDCFromMongoHostname(name);
      }

      const dcObj    = getOrCreateDC(dcMap, dcInfo);
      dcObj.asset_count++;
      const assetEnv = env === 'PRODUCTION' || env === 'PROD' ? 'PRODUCTION' : env === 'DR' ? 'DR' : 'UAT';

      assets.push({
        id: uid(),
        name,
        asset_type: 'OCP_POD',
        tech_stack: 'ocp',
        environment: assetEnv,
        host: nodeName || name,
        platform: 'LINUX',
        data_center: dcObj,
        latest_confidence_level: 4, // Prometheus OCP metrics are standardized
        latest_operational_state: 'ACTIVE',
        latest_replication_role: 'NONE',
        write_authority: false,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'cmdb',
        metadata: { namespace, cluster, node_name: nodeName },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(), source_name: 'cmdb', file_name: fileName,
      imported_at: new Date().toISOString(), record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED', errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── Auto-detect source type from filename ────────────────────────────────────

export function detectSourceType(fileName: string): DataSourceName {
  const f = fileName.toLowerCase();
  if (f.includes('ibmma') || f.includes('qmgr') || (f.includes('mq') && !f.includes('mongo'))) return 'ibm_mq';
  if (f.includes('mongodb') || f.includes('mongo_info') || f.includes('mongo')) return 'mongodb';
  if (f.includes('oem') || f.includes('oracle') || f.includes('db_role')) return 'oracle_oem';
  if (f.includes('scom') || f.includes('replica_status') || f.includes('replicastatus')) return 'scom';
  if (f.includes('kafka') || f.includes('kees')) return 'kafka';
  if (f.includes('mssql') || f.includes('dblens')) return 'mssql';
  if (f.includes('ocp') || f.includes('pod_info') || f.includes('openshift') || f.includes('kube')) return 'ocp';
  if (f.includes('batch') || f.includes('batch_processing')) return 'batch';
  if (f.includes('appdynamic') || f.includes('node_inventory') || f.includes('traffic_sample')) return 'appdynamics';
  if (f.includes('loadbalancer') || f.includes('load_balancer') || f.includes('avi')) return 'avi_loadbalancer';
  if (f.includes('topology') || f.includes('cmdb') || f.includes('application') || f.includes('business')) return 'cmdb';
  return 'cmdb';
}

// ─── SCOM Parser ──────────────────────────────────────────────────────────────
// Expected columns: ReplicaName, Role, HealthState

export function parseSCOM(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const replicaName = row['ReplicaName'] || row['replica_name'] || '';
      const role = (row['Role'] || row['role'] || 'Secondary').trim();
      const healthState = (row['HealthState'] || row['health_state'] || 'Success').trim();

      if (!replicaName) { errors.push(`Row missing ReplicaName: ${JSON.stringify(row)}`); continue; }

      const host = replicaName.includes('\\') ? replicaName.split('\\')[0] : replicaName;
      const dcInfo = resolveDCFromOracleHostname(host);
      const dc = getOrCreateDC(dcMap, dcInfo);
      dc.asset_count++;

      const isPrimary = role.toLowerCase() === 'primary';
      const isHealthy = healthState.toLowerCase() === 'success';
      const confidenceLevel: ConfidenceLevel = isPrimary && isHealthy ? 4 : isHealthy ? 3 : 2;

      assets.push({
        id: uid(),
        name: replicaName,
        asset_type: 'SERVER',
        tech_stack: 'mssql',
        environment: 'PRODUCTION',
        host,
        platform: 'WINDOWS',
        data_center: dc,
        latest_confidence_level: confidenceLevel,
        latest_operational_state: isPrimary ? 'ACTIVE' : 'STANDBY',
        latest_replication_role: isPrimary ? 'PRIMARY' : 'SECONDARY',
        write_authority: isPrimary,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'scom',
        metadata: { replica_name: replicaName, role, health_state: healthState },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(), source_name: 'scom', file_name: fileName,
      imported_at: new Date().toISOString(), record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED', errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── OCP Pod Parser ───────────────────────────────────────────────────────────
// Expected columns: cluster, env, lob, namespace, neighborhood, pod

export function parseOCPPods(content: string, fileName: string): ParsedCSVResult {
  const rows = parseCSV(content);
  const dcMap = new Map<string, RuntimeDataCenter>();
  const assets: RuntimeAsset[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const pod = row['pod'] || row['POD'] || row['pod_name'] || '';
      const cluster = row['cluster'] || row['CLUSTER'] || '';
      const envRaw = (row['env'] || row['ENV'] || 'prod').toLowerCase();
      const namespace = row['namespace'] || row['NAMESPACE'] || '';
      const lob = row['lob'] || row['LOB'] || '';
      const neighborhood = row['neighborhood'] || row['NEIGHBORHOOD'] || '';

      if (!pod && !cluster) { errors.push(`Row missing pod/cluster: ${JSON.stringify(row)}`); continue; }

      // Derive DC short name from cluster name prefix (e.g. "dcglnh01ocp" → "DCGL")
      let dcShort = 'UNK';
      let dcName = 'Unknown DC';
      if (cluster) {
        dcShort = cluster.slice(0, 4).toUpperCase();
        dcName = `DC ${dcShort}`;
      } else if (neighborhood) {
        dcShort = neighborhood.slice(0, 6).toUpperCase();
        dcName = `DC ${neighborhood}`;
      }

      const dc = getOrCreateDC(dcMap, { name: dcName, short_name: dcShort });
      dc.asset_count++;

      const assetEnv = envRaw === 'prod' || envRaw === 'production' ? 'PRODUCTION' : envRaw === 'dr' ? 'DR' : 'UAT';
      const name = pod || `${namespace}-pod`;

      assets.push({
        id: uid(),
        name,
        asset_type: 'OCP_POD',
        tech_stack: 'ocp',
        environment: assetEnv,
        host: cluster || name,
        platform: 'LINUX',
        data_center: dc,
        latest_confidence_level: 4,
        latest_operational_state: 'ACTIVE',
        latest_replication_role: 'NONE',
        write_authority: false,
        last_seen_at: new Date().toISOString(),
        is_deterministic: true,
        data_source: 'ocp',
        metadata: { namespace, cluster, lob, neighborhood },
      });
    } catch (e) {
      errors.push(`Parse error: ${e}`);
    }
  }

  return {
    import: {
      id: uid(), source_name: 'ocp', file_name: fileName,
      imported_at: new Date().toISOString(), record_count: assets.length,
      status: errors.length === 0 ? 'SUCCESS' : assets.length > 0 ? 'PARTIAL' : 'FAILED', errors,
    },
    assets,
    dataCenters: Array.from(dcMap.values()),
  };
}

// ─── Master parser dispatcher ─────────────────────────────────────────────────

export function parseTopologyCSV(
  content: string,
  fileName: string,
  sourceType?: DataSourceName,
): ParsedCSVResult {
  const f = fileName.toLowerCase();
  // Filename-based detection takes precedence for unambiguous formats
  if (f.includes('scom') || f.includes('replica_status') || f.includes('replicastatus')) return parseSCOM(content, fileName);
  if (f.includes('ocp') || f.includes('pod_info') || f.includes('openshift') || f.includes('kube')) return parseOCPPods(content, fileName);
  if (f.includes('kafka') || f.includes('kees')) return parseKafka(content, fileName);
  if (f.includes('mssql') || f.includes('dblens') || f.includes('sql_server')) return parseMSSQL(content, fileName);

  const source = sourceType ?? detectSourceType(fileName);
  switch (source) {
    case 'ibm_mq':       return parseIBMMQ(content, fileName);
    case 'mongodb':      return parseMongoDB(content, fileName);
    case 'oracle_oem':   return parseOracleOEM(content, fileName);
    case 'scom':         return parseSCOM(content, fileName);
    case 'ocp':          return parseOCPPods(content, fileName);
    case 'kafka':        return parseKafka(content, fileName);
    case 'mssql':        return parseMSSQL(content, fileName);
    case 'cmdb':         return parseCMDB(content, fileName);
    default:             return parseCMDB(content, fileName);
  }
}

// ─── Build ApplicationLocationSummary from raw assets ────────────────────────
// Used to synthesize app summaries from MQ / MongoDB / Oracle assets

export function buildApplicationSummaries(
  existingApps: ApplicationLocationSummary[],
  newAssets: RuntimeAsset[],
  source: DataSourceName,
): ApplicationLocationSummary[] {
  if (newAssets.length === 0) return existingApps;

  // Group new assets by environment
  const envGroups = new Map<string, RuntimeAsset[]>();
  newAssets.forEach((a) => {
    const key = a.environment;
    if (!envGroups.has(key)) envGroups.set(key, []);
    envGroups.get(key)!.push(a);
  });

  const sourceDisplayMap: Partial<Record<DataSourceName, string>> = {
    ibm_mq: 'IBM MQ Infrastructure',
    mongodb: 'MongoDB Infrastructure',
    oracle_oem: 'Oracle Infrastructure',
    cmdb: 'CMDB Topology',
    scom: 'SCOM SQL Replicas',
    ocp: 'OpenShift Pods',
    kafka: 'Kafka Brokers',
    mssql: 'MSSQL Instances',
    avi_loadbalancer: 'Avi Load Balancer',
    batch: 'Batch Processing',
    appdynamics: 'AppDynamics APM',
  };
  const appName = sourceDisplayMap[source] ?? source.toUpperCase();
  const appId   = source.toUpperCase().replace(/_/g, '-');

  const newSummaries: ApplicationLocationSummary[] = [];
  for (const [env, envAssets] of envGroups) {
    const dcSet = new Set<string>();
    let primaryWriteDC: string | undefined;
    envAssets.forEach((a) => {
      const dc = a.data_center?.short_name ?? a.data_center?.name;
      if (dc) dcSet.add(dc);
      if (a.write_authority && !primaryWriteDC) primaryWriteDC = dc;
    });

    const confidences: ConfidenceLevel[] = envAssets
      .map((a) => a.latest_confidence_level)
      .filter((c): c is ConfidenceLevel => c != null);
    const minConf: ConfidenceLevel = (confidences.length > 0 ? Math.min(...confidences) : 3) as ConfidenceLevel;

    newSummaries.push({
      application_id: appId,
      application_name: appName,
      environment: env as 'PRODUCTION' | 'UAT' | 'DR',
      data_centers: Array.from(dcSet),
      primary_write_dc: primaryWriteDC,
      overall_confidence: minConf,
      component_count: 1,
      asset_count: envAssets.length,
      stale_source_count: 0,
      last_updated: new Date().toISOString(),
    });
  }

  // Merge: replace existing summaries with same appId+env, keep others
  const merged = existingApps.filter(
    (a) => !newSummaries.some((n) => n.application_id === a.application_id && n.environment === a.environment),
  );
  return [...merged, ...newSummaries];
}

// ─── Build DataSourceInfo from a parsed result ────────────────────────────────

export function buildDataSourceInfo(result: ParsedCSVResult): DataSourceInfo {
  const source = result.import.source_name;
  const displayNames: Partial<Record<DataSourceName, string>> = {
    ibm_mq:          'IBM MQ Prometheus',
    mongodb:         'MongoDB Prometheus',
    oracle_oem:      'Oracle OEM',
    cmdb:            'CMDB Topology',
    scom:            'SCOM SQL Replicas',
    ocp:             'OpenShift Pod Info',
    kafka:           'Kafka Brokers',
    mssql:           'MSSQL Instances',
    avi_loadbalancer:'Avi Load Balancer',
    batch:           'Batch Processing',
    appdynamics:     'AppDynamics APM',
  };
  const topologyConf: Partial<Record<DataSourceName, ConfidenceLevel>> = {
    ibm_mq: 3, mongodb: 3, oracle_oem: 3, cmdb: 4,
    scom: 3, ocp: 4, kafka: 3, mssql: 3, avi_loadbalancer: 3, batch: 2, appdynamics: 2,
  };
  const trafficConf: Partial<Record<DataSourceName, ConfidenceLevel>> = {
    ibm_mq: 3, mongodb: 3, oracle_oem: 2, cmdb: 3,
    scom: 2, ocp: 3, kafka: 3, mssql: 2, avi_loadbalancer: 3, batch: 2, appdynamics: 3,
  };
  return {
    source_name: source,
    display_name: displayNames[source] ?? source,
    status: 'FRESH',
    record_count: result.import.record_count,
    last_import: result.import.imported_at,
    topology_confidence: (topologyConf[source] ?? 3) as ConfidenceLevel,
    traffic_confidence: (trafficConf[source] ?? 3) as ConfidenceLevel,
  };
}
