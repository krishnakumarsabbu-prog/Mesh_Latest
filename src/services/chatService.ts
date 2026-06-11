import DOMPurify from 'dompurify';
import { runtimeApi } from '@/lib/api';

export type Intent =
  | 'GET_DATACENTERS'
  | 'GET_NEIGHBORHOODS'
  | 'GET_APPLICATIONS'
  | 'GET_HEALTH'
  | 'GET_TOPOLOGY'
  | 'GET_ENVIRONMENTS'
  | 'HELP'
  | 'UNKNOWN';

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  GET_DATACENTERS:   ['datacenter', 'data center', 'dc', 'dcs', 'datacentres', 'data centres'],
  GET_NEIGHBORHOODS: ['neighborhood', 'neighbourhoods', 'neighborhoods', 'neighbour', 'neighbors', 'subnet', 'subnets'],
  GET_APPLICATIONS:  ['application', 'applications', 'app', 'apps', 'service', 'services'],
  GET_HEALTH:        ['health', 'status', 'alert', 'alerts', 'critical', 'degraded', 'down', 'healthy'],
  GET_TOPOLOGY:      ['topology', 'flow', 'diagram', 'dependency', 'dependencies', 'map'],
  GET_ENVIRONMENTS:  ['environment', 'environments', 'env', 'prod', 'production', 'uat', 'dr', 'disaster'],
  HELP:              ['help', 'what can you do', 'commands', 'capabilities', 'features', 'how to use'],
  UNKNOWN:           [],
};

function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'UNKNOWN') continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent as Intent;
    }
  }
  return 'UNKNOWN';
}

function extractAppName(message: string): string | null {
  // Match patterns like "for PCP", "for application PCP", "of PCP", "application PCP"
  const patterns = [
    /(?:for|of)\s+application\s+([A-Z][A-Z0-9_-]+)/i,
    /(?:for|of)\s+([A-Z][A-Z0-9_-]{1,})/i,
    /application\s+([A-Z][A-Z0-9_-]+)/i,
    /app\s+([A-Z][A-Z0-9_-]+)/i,
    /\b([A-Z]{2,}[0-9]*)\b/,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function extractEnvironment(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('production') || lower.includes(' prod ') || lower.match(/\bprod\b/)) return 'PRODUCTION';
  if (lower.includes('uat')) return 'UAT';
  if (lower.includes('dr') || lower.includes('disaster')) return 'DR';
  return null;
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html);
}

function statusBadgeHtml(status: string): string {
  const statusLower = status.toLowerCase();
  let color = '#8A97A8';
  let bg = 'rgba(107,122,141,0.08)';
  let border = 'rgba(107,122,141,0.18)';
  if (statusLower === 'active' || statusLower === 'healthy') { color = '#00B074'; bg = 'rgba(0,176,116,0.08)'; border = 'rgba(0,176,116,0.22)'; }
  else if (statusLower === 'inactive' || statusLower === 'down' || statusLower === 'failed') { color = '#FF003C'; bg = 'rgba(255,0,60,0.08)'; border = 'rgba(255,0,60,0.22)'; }
  else if (statusLower === 'degraded' || statusLower === 'warning' || statusLower === 'maintenance') { color = '#FFB100'; bg = 'rgba(255,177,0,0.08)'; border = 'rgba(255,177,0,0.22)'; }
  else if (statusLower === 'standby') { color = '#006CFF'; bg = 'rgba(0,108,255,0.08)'; border = 'rgba(0,108,255,0.22)'; }
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;background:${bg};color:${color};border:1px solid ${border};">
    <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>
    ${status.charAt(0).toUpperCase() + status.slice(1)}
  </span>`;
}

function tableRow(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;vertical-align:middle;">${c}</td>`).join('')}</tr>`;
}

function tableHeader(headers: string[]): string {
  return `<tr>${headers.map((h) => `<th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#8A97A8;border-bottom:1px solid rgba(255,255,255,0.1);">${h}</th>`).join('')}</tr>`;
}

function wrapTable(header: string, rows: string[]): string {
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${header}${rows.join('')}</table>`;
}

interface AppSummary {
  application_id: string;
  name?: string;
  status?: string;
  confidence_level?: number;
  active_dc_count?: number;
  total_asset_count?: number;
  environments?: string[];
  last_seen?: string;
}

interface DataCenter {
  name: string;
  status?: string;
  region?: string;
  asset_count?: number;
  environment?: string;
}

interface AppDetail {
  application_id: string;
  name?: string;
  status?: string;
  environments?: string[];
  components?: ComponentItem[];
  data_centers?: DataCenter[];
  neighborhoods?: string[];
  confidence_level?: number;
}

interface ComponentItem {
  name?: string;
  tech_stack?: string;
  operational_state?: string;
  dc_name?: string;
  environment?: string;
  asset_type?: string;
}

async function handleGetApplications(appName: string | null): Promise<{ content: string; isHtml: boolean }> {
  const res = await runtimeApi.getApplications();
  const apps: AppSummary[] = res.data?.applications ?? res.data ?? [];

  if (appName) {
    const filtered = apps.filter((a) =>
      a.application_id?.toUpperCase().includes(appName) ||
      a.name?.toUpperCase().includes(appName)
    );
    if (filtered.length === 0) {
      return { content: `No applications found matching <strong>${appName}</strong>. Try listing all applications first.`, isHtml: true };
    }
    const app = filtered[0];
    const header = tableHeader(['Field', 'Value']);
    const rows = [
      tableRow(['ID', `<strong>${app.application_id}</strong>`]),
      tableRow(['Name', app.name || app.application_id]),
      tableRow(['Status', statusBadgeHtml(app.status || 'unknown')]),
      tableRow(['Confidence', app.confidence_level !== undefined ? `Level ${app.confidence_level}` : '—']),
      tableRow(['Active DCs', String(app.active_dc_count ?? '—')]),
      tableRow(['Total Assets', String(app.total_asset_count ?? '—')]),
      tableRow(['Environments', (app.environments ?? []).join(', ') || '—']),
    ];
    return { content: sanitize(`<strong>Application: ${app.application_id}</strong>${wrapTable(header, rows)}`), isHtml: true };
  }

  if (apps.length === 0) {
    return { content: 'No applications found in the database. Try seeding data first.', isHtml: false };
  }

  const header = tableHeader(['App ID', 'Status', 'Confidence', 'Active DCs', 'Assets']);
  const rows = apps.map((a) =>
    tableRow([
      `<strong>${a.application_id}</strong>`,
      statusBadgeHtml(a.status || 'unknown'),
      a.confidence_level !== undefined ? `L${a.confidence_level}` : '—',
      String(a.active_dc_count ?? '—'),
      String(a.total_asset_count ?? '—'),
    ])
  );
  return {
    content: sanitize(`Found <strong>${apps.length}</strong> application${apps.length !== 1 ? 's' : ''}:${wrapTable(header, rows)}`),
    isHtml: true,
  };
}

async function handleGetDatacenters(appName: string | null): Promise<{ content: string; isHtml: boolean }> {
  if (appName) {
    const res = await runtimeApi.getApplicationDetail(appName);
    const detail: AppDetail = res.data;
    const dcs: DataCenter[] = detail?.data_centers ?? [];
    if (dcs.length === 0) {
      return { content: `No datacenters found for application <strong>${appName}</strong>.`, isHtml: true };
    }
    const header = tableHeader(['Datacenter', 'Status', 'Environment', 'Assets']);
    const rows = dcs.map((dc) =>
      tableRow([
        `<strong>${dc.name}</strong>`,
        statusBadgeHtml(dc.status || 'unknown'),
        dc.environment || '—',
        String(dc.asset_count ?? '—'),
      ])
    );
    return {
      content: sanitize(`Found <strong>${dcs.length}</strong> datacenter${dcs.length !== 1 ? 's' : ''} for <strong>${appName}</strong>:${wrapTable(header, rows)}`),
      isHtml: true,
    };
  }

  const res = await runtimeApi.getDataCenters();
  const dcs: DataCenter[] = res.data?.data_centers ?? res.data ?? [];
  if (dcs.length === 0) {
    return { content: 'No datacenters found in the database.', isHtml: false };
  }
  const header = tableHeader(['Datacenter', 'Status', 'Region', 'Assets']);
  const rows = dcs.map((dc) =>
    tableRow([
      `<strong>${dc.name}</strong>`,
      statusBadgeHtml(dc.status || 'unknown'),
      dc.region || '—',
      String(dc.asset_count ?? '—'),
    ])
  );
  return {
    content: sanitize(`Found <strong>${dcs.length}</strong> datacenter${dcs.length !== 1 ? 's' : ''}:${wrapTable(header, rows)}`),
    isHtml: true,
  };
}

async function handleGetNeighborhoods(appName: string | null): Promise<{ content: string; isHtml: boolean }> {
  const targetApp = appName;
  if (!targetApp) {
    return { content: 'Please specify an application name. Example: "Show neighborhoods for PCP"', isHtml: false };
  }
  const res = await runtimeApi.getApplicationDetail(targetApp);
  const detail: AppDetail = res.data;
  const neighborhoods: string[] = detail?.neighborhoods ?? [];

  if (neighborhoods.length === 0) {
    return { content: `No neighborhoods found for application <strong>${targetApp}</strong>.`, isHtml: true };
  }
  const items = neighborhoods.map((n) => `<li style="padding:3px 0;font-size:12px;">${n}</li>`).join('');
  return {
    content: sanitize(`Found <strong>${neighborhoods.length}</strong> neighborhood${neighborhoods.length !== 1 ? 's' : ''} for <strong>${targetApp}</strong>:<ul style="margin:8px 0 0 16px;list-style:disc;">${items}</ul>`),
    isHtml: true,
  };
}

async function handleGetHealth(appName: string | null): Promise<{ content: string; isHtml: boolean }> {
  if (appName) {
    const res = await runtimeApi.getApplicationDetail(appName);
    const detail: AppDetail = res.data;
    if (!detail) {
      return { content: `Could not find health data for application <strong>${appName}</strong>.`, isHtml: true };
    }
    const header = tableHeader(['Field', 'Value']);
    const rows = [
      tableRow(['App ID', `<strong>${detail.application_id}</strong>`]),
      tableRow(['Status', statusBadgeHtml(detail.status || 'unknown')]),
      tableRow(['Confidence', detail.confidence_level !== undefined ? `Level ${detail.confidence_level}` : '—']),
      tableRow(['Environments', (detail.environments ?? []).join(', ') || '—']),
    ];
    return { content: sanitize(`<strong>Health Status: ${detail.application_id}</strong>${wrapTable(header, rows)}`), isHtml: true };
  }

  const res = await runtimeApi.getApplications();
  const apps: AppSummary[] = res.data?.applications ?? res.data ?? [];
  const degraded = apps.filter((a) => a.status?.toLowerCase() === 'degraded');
  const down = apps.filter((a) => a.status?.toLowerCase() === 'down');
  const healthy = apps.filter((a) => a.status?.toLowerCase() === 'healthy' || a.status?.toLowerCase() === 'active');

  let content = `<strong>System Health Overview</strong> (${apps.length} apps total)`;
  if (down.length > 0) {
    content += `<br/><br/>${statusBadgeHtml('down')} <strong>${down.length}</strong> app${down.length !== 1 ? 's' : ''} DOWN: ${down.map((a) => a.application_id).join(', ')}`;
  }
  if (degraded.length > 0) {
    content += `<br/><br/>${statusBadgeHtml('degraded')} <strong>${degraded.length}</strong> app${degraded.length !== 1 ? 's' : ''} DEGRADED: ${degraded.map((a) => a.application_id).join(', ')}`;
  }
  if (healthy.length > 0) {
    content += `<br/><br/>${statusBadgeHtml('active')} <strong>${healthy.length}</strong> app${healthy.length !== 1 ? 's' : ''} HEALTHY`;
  }
  if (down.length === 0 && degraded.length === 0) {
    content += `<br/><br/>All applications appear to be running normally.`;
  }
  return { content: sanitize(content), isHtml: true };
}

async function handleGetTopology(appName: string | null): Promise<{ content: string; isHtml: boolean }> {
  if (!appName) {
    return { content: 'Please specify an application name. Example: "Show topology for PCP"', isHtml: false };
  }
  const res = await runtimeApi.getApplicationDetail(appName);
  const detail: AppDetail = res.data;
  const components: ComponentItem[] = detail?.components ?? [];

  if (components.length === 0) {
    return { content: `No topology/components found for application <strong>${appName}</strong>.`, isHtml: true };
  }
  const header = tableHeader(['Component', 'Tech Stack', 'State', 'DC', 'Env']);
  const rows = components.map((c) =>
    tableRow([
      `<strong>${c.name || '—'}</strong>`,
      c.tech_stack || '—',
      statusBadgeHtml(c.operational_state || 'unknown'),
      c.dc_name || '—',
      c.environment || '—',
    ])
  );
  return {
    content: sanitize(`<strong>Topology for ${appName}</strong> — ${components.length} component${components.length !== 1 ? 's' : ''}:${wrapTable(header, rows)}`),
    isHtml: true,
  };
}

async function handleGetEnvironments(appName: string | null, env: string | null): Promise<{ content: string; isHtml: boolean }> {
  if (appName) {
    const res = await runtimeApi.getApplicationDetail(appName, env ?? undefined);
    const detail: AppDetail = res.data;
    const envs: string[] = detail?.environments ?? [];
    const items = envs.length
      ? envs.map((e) => `<li style="padding:3px 0;font-size:12px;">${statusBadgeHtml('active')} ${e}</li>`).join('')
      : '<li>No environments found</li>';
    return {
      content: sanitize(`<strong>${appName}</strong> runs in <strong>${envs.length}</strong> environment${envs.length !== 1 ? 's' : ''}:<ul style="margin:8px 0 0 16px;list-style:none;">${items}</ul>`),
      isHtml: true,
    };
  }

  const res = await runtimeApi.getApplications();
  const apps: AppSummary[] = res.data?.applications ?? res.data ?? [];
  const envMap: Record<string, string[]> = {};
  for (const a of apps) {
    for (const e of a.environments ?? []) {
      if (!envMap[e]) envMap[e] = [];
      envMap[e].push(a.application_id);
    }
  }
  const envEntries = Object.entries(envMap);
  if (envEntries.length === 0) return { content: 'No environment data found.', isHtml: false };

  const header = tableHeader(['Environment', 'Applications']);
  const rows = envEntries.map(([e, ids]) =>
    tableRow([`<strong>${e}</strong>`, ids.join(', ')])
  );
  return { content: sanitize(`<strong>Environments across all applications:</strong>${wrapTable(header, rows)}`), isHtml: true };
}

function handleHelp(): { content: string; isHtml: boolean } {
  return {
    content: sanitize(`I can answer questions about your infrastructure. Here's what I can do:<br/><br/>
<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;">
  <li>🏢 <strong>Applications</strong> — "List all applications", "Show details for PCP"</li>
  <li>🗄️ <strong>Datacenters</strong> — "List all datacenters", "Show datacenters for PCP"</li>
  <li>🔗 <strong>Neighborhoods</strong> — "Show neighborhoods for PCP"</li>
  <li>❤️ <strong>Health/Status</strong> — "What is the health status?", "Are there any critical alerts?"</li>
  <li>🗺️ <strong>Topology</strong> — "Show topology for PCP", "What are the dependencies of PCP?"</li>
  <li>🌍 <strong>Environments</strong> — "What environments does PCP run in?"</li>
</ul>`),
    isHtml: true,
  };
}

function unknownResponse(): { content: string; isHtml: boolean } {
  return {
    content: `I didn't quite understand that. Try asking about <strong>applications</strong>, <strong>datacenters</strong>, <strong>health status</strong>, <strong>topology</strong>, or <strong>neighborhoods</strong>. Type <strong>"help"</strong> for a full list of capabilities.`,
    isHtml: true,
  };
}

export async function processMessage(message: string): Promise<{ content: string; isHtml: boolean }> {
  const intent = detectIntent(message);
  const appName = extractAppName(message);
  const env = extractEnvironment(message);

  try {
    switch (intent) {
      case 'GET_APPLICATIONS':
        return await handleGetApplications(appName);
      case 'GET_DATACENTERS':
        return await handleGetDatacenters(appName);
      case 'GET_NEIGHBORHOODS':
        return await handleGetNeighborhoods(appName);
      case 'GET_HEALTH':
        return await handleGetHealth(appName);
      case 'GET_TOPOLOGY':
        return await handleGetTopology(appName);
      case 'GET_ENVIRONMENTS':
        return await handleGetEnvironments(appName, env);
      case 'HELP':
        return handleHelp();
      default:
        return unknownResponse();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Network or 404 errors — give helpful context
    if (msg.includes('404') || msg.includes('not found')) {
      return { content: `No data found${appName ? ` for <strong>${appName}</strong>` : ''}. The application may not exist or no data has been imported yet.`, isHtml: true };
    }
    return { content: `Sorry, I encountered an error fetching that data: ${msg}. Please check the backend is running.`, isHtml: false };
  }
}
