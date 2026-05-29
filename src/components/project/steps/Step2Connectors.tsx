import React, { useEffect, useState } from 'react';
import { Search, CircleCheck as CheckCircle2, Circle, ChevronDown, ChevronUp, Loader as Loader2, Wifi, WifiOff, CircleAlert as AlertCircle, Plus, Trash2, Network, Radio, Cpu, Clock, Database, Terminal, Server, Globe, Layers, Activity, Plug } from 'lucide-react';
import { projectApi, catalogApi } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { notify } from '@/store/notificationStore';
import { Step1Data } from './Step1Source';

export interface ConnectorSelection {
  catalog_entry_id: string;
  name: string;
  config: Record<string, unknown>;
  selected: boolean;
  catalogSlug?: string;
  catalogName?: string;
  catalogIcon?: string;
  catalogColor?: string;
  configSchema?: Record<string, unknown>;
  testStatus?: 'idle' | 'testing' | 'success' | 'error';
  testError?: string;
}

interface Props {
  step1: Step1Data;
  connectors: ConnectorSelection[];
  onChange: (connectors: ConnectorSelection[]) => void;
}

interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  vendor?: string;
  category: string;
  icon?: string;
  color?: string;
  config_schema?: Record<string, unknown>;
  default_config?: Record<string, unknown>;
  is_enabled: boolean;
}

const CONNECTOR_SLUG_MAP: Record<string, string> = {
  mongodb: 'mongodb',
  appdynamics: 'appdynamics',
  splunk: 'splunk',
  'ibm-mq': 'ibm-mq',
  openshift: 'openshift',
  'oracle-oem': 'oracle-oem',
  grafana: 'grafana',
  servicenow: 'servicenow',
};

function ConnectorConfigForm({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const properties = (schema?.properties as Record<string, { type?: string; title?: string; description?: string; enum?: string[] }>) || {};

  if (Object.keys(properties).length === 0) {
    return (
      <p className="text-xs text-slate-500 italic">No configuration fields defined for this connector.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(properties).map(([key, field]) => (
        <div key={key}>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            {field.title || key}
          </label>
          {field.enum ? (
            <select
              value={(values[key] as string) || ''}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="">Select...</option>
              {field.enum.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') ? 'password' : 'text'}
              value={(values[key] as string) || ''}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              placeholder={field.description || key}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function getConnectorIcon(iconName: string | undefined, slug: string | undefined) {
  const name = (iconName || '').toLowerCase().trim();
  const slugClean = (slug || '').toLowerCase().trim();

  if (name === 'network') return <Network className="w-5 h-5 text-white" />;
  if (name === 'radio') return <Radio className="w-5 h-5 text-white" />;
  if (name === 'cpu') return <Cpu className="w-5 h-5 text-white" />;
  if (name === 'clock') return <Clock className="w-5 h-5 text-white" />;
  if (name === 'database' || name === 'mongodb') return <Database className="w-5 h-5 text-white" />;
  if (name === 'terminal') return <Terminal className="w-5 h-5 text-white" />;
  if (name === 'server' || name === 'openshift') return <Server className="w-5 h-5 text-white" />;
  if (name === 'globe') return <Globe className="w-5 h-5 text-white" />;
  if (name === 'layers') return <Layers className="w-5 h-5 text-white" />;
  if (name === 'activity' || name === 'splunk') return <Activity className="w-5 h-5 text-white" />;
  if (name === 'plug') return <Plug className="w-5 h-5 text-white" />;

  // Fallbacks by slug
  if (slugClean.includes('loadbalancer') || slugClean.includes('balancer') || slugClean.includes('alb')) {
    return <Network className="w-5 h-5 text-white" />;
  }
  if (slugClean.includes('kafka')) return <Radio className="w-5 h-5 text-white" />;
  if (slugClean.includes('appdynamics')) return <Cpu className="w-5 h-5 text-white" />;
  if (slugClean.includes('autosys')) return <Clock className="w-5 h-5 text-white" />;
  if (slugClean.includes('scom') || slugClean.includes('oem')) return <Server className="w-5 h-5 text-white" />;
  if (slugClean.includes('splunk') || slugClean.includes('traffic')) return <Activity className="w-5 h-5 text-white" />;
  if (slugClean.includes('mongodb') || slugClean.includes('db')) return <Database className="w-5 h-5 text-white" />;
  if (slugClean.includes('mq') || slugClean.includes('ibm')) return <Layers className="w-5 h-5 text-white" />;

  const fallbackChar = (slugClean[0] || '?').toUpperCase();
  return <span className="font-bold text-sm text-white">{fallbackChar}</span>;
}

function ConnectorCard({
  connector,
  onToggle,
  onConfigChange,
  onTest,
}: {
  connector: ConnectorSelection;
  onToggle: () => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  onTest: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSchema = connector.configSchema && Object.keys((connector.configSchema as Record<string, unknown>)?.properties || {}).length > 0;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        connector.selected
          ? 'border-sky-500/50 bg-sky-500/5'
          : 'border-slate-700 bg-slate-800/40'
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all"
          style={{ backgroundColor: connector.catalogColor || '#334155' }}
        >
          {getConnectorIcon(connector.catalogIcon, connector.catalogSlug)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200 truncate">{connector.name}</span>
            {connector.catalogName && connector.catalogName !== connector.name && (
              <span className="text-xs text-slate-500">({connector.catalogName})</span>
            )}
          </div>
          {connector.catalogSlug && (
            <span className="text-xs text-slate-500 font-mono">{connector.catalogSlug}</span>
          )}
        </div>

        {/* Test status */}
        {connector.selected && (
          <div className="flex-shrink-0">
            {connector.testStatus === 'testing' && (
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
            )}
            {connector.testStatus === 'success' && (
              <Wifi className="w-4 h-4 text-emerald-400" />
            )}
            {connector.testStatus === 'error' && (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
          </div>
        )}

        {/* Expand */}
        {connector.selected && hasSchema && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-400 hover:text-slate-300 flex-shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

        {/* Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className="flex-shrink-0"
        >
          {connector.selected ? (
            <CheckCircle2 className="w-5 h-5 text-sky-400" />
          ) : (
            <Circle className="w-5 h-5 text-slate-600 hover:text-slate-400" />
          )}
        </button>
      </div>

      {/* Config form */}
      {connector.selected && expanded && hasSchema && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-700/50 space-y-3">
          <div className="pt-3">
            <ConnectorConfigForm
              schema={connector.configSchema!}
              values={connector.config}
              onChange={onConfigChange}
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            {connector.testStatus === 'error' && connector.testError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {connector.testError}
              </p>
            )}
            {connector.testStatus === 'success' && (
              <p className="text-xs text-emerald-400">Connection successful</p>
            )}
            {!connector.testStatus || connector.testStatus === 'idle' ? <span /> : null}
            <Button size="sm" variant="secondary" onClick={onTest} disabled={connector.testStatus === 'testing'}>
              {connector.testStatus === 'testing' ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Testing...</>
              ) : 'Test Connection'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Step2Connectors({ step1, connectors, onChange }: Props) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState('');
  const [search, setSearch] = useState('');
  const [scannedFiles, setScannedFiles] = useState<string[]>([]);

  useEffect(() => {
    catalogApi.list({ enabled_only: true }).then((res) => {
      setCatalog(res.data);
    });
  }, []);

  useEffect(() => {
    if (step1.import_mode === 'git' && step1.repository_url && !scanned && catalog.length > 0) {
      runGitScan();
    } else if (step1.import_mode === 'manual' && catalog.length > 0 && connectors.length === 0) {
      populateFromCatalog(catalog, []);
    }
  }, [catalog]);

  const populateFromCatalog = (cat: CatalogEntry[], autoSelected: string[]) => {
    const items: ConnectorSelection[] = cat.map((entry) => ({
      catalog_entry_id: entry.id,
      name: entry.name,
      config: (entry.default_config as Record<string, unknown>) || {},
      selected: autoSelected.includes(entry.slug),
      catalogSlug: entry.slug,
      catalogName: entry.name,
      catalogIcon: entry.icon,
      catalogColor: entry.color,
      configSchema: entry.config_schema as Record<string, unknown> | undefined,
      testStatus: 'idle' as const,
    }));
    onChange(items);
  };

  const runGitScan = async () => {
    if (!step1.repository_url) return;
    setScanning(true);
    setScanError('');
    try {
      const res = await projectApi.gitScan({
        repository_url: step1.repository_url,
        branch: step1.branch || 'main',
        access_token: step1.access_token || undefined,
      });
      const { detected_connectors, config_files_scanned } = res.data;
      setScannedFiles(config_files_scanned || []);
      populateFromCatalog(catalog, detected_connectors || []);
      setScanned(true);
      if (detected_connectors?.length > 0) {
        notify.success('Scan complete', `Detected ${detected_connectors.length} connector(s)`);
      }
    } catch {
      setScanError('Failed to scan repository. You can configure connectors manually.');
      populateFromCatalog(catalog, []);
      setScanned(true);
    } finally {
      setScanning(false);
    }
  };

  const toggle = (id: string) => {
    onChange(connectors.map((c) => (c.catalog_entry_id === id ? { ...c, selected: !c.selected } : c)));
  };

  const updateConfig = (id: string, config: Record<string, unknown>) => {
    onChange(connectors.map((c) => (c.catalog_entry_id === id ? { ...c, config } : c)));
  };

  const testConnector = async (connector: ConnectorSelection) => {
    onChange(connectors.map((c) => (c.catalog_entry_id === connector.catalog_entry_id ? { ...c, testStatus: 'testing' } : c)));
    try {
      const res = await catalogApi.test(connector.catalog_entry_id, { config: connector.config });
      const success = res.data?.success;
      onChange(connectors.map((c) =>
        c.catalog_entry_id === connector.catalog_entry_id
          ? { ...c, testStatus: success ? 'success' : 'error', testError: res.data?.error }
          : c
      ));
    } catch {
      onChange(connectors.map((c) =>
        c.catalog_entry_id === connector.catalog_entry_id
          ? { ...c, testStatus: 'error', testError: 'Test request failed' }
          : c
      ));
    }
  };

  const filtered = connectors.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.catalogSlug?.includes(search.toLowerCase())
  );
  const selectedCount = connectors.filter((c) => c.selected).length;

  if (scanning) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
        <div className="text-center">
          <p className="text-slate-200 font-medium">Scanning repository...</p>
          <p className="text-sm text-slate-500 mt-1">Analyzing config files for connector signatures</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            {selectedCount > 0 ? `${selectedCount} connector(s) selected` : 'Select connectors'}
          </h3>
          {step1.import_mode === 'git' && scannedFiles.length > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              Scanned {scannedFiles.length} config file(s): {scannedFiles.slice(0, 3).join(', ')}
              {scannedFiles.length > 3 && ` +${scannedFiles.length - 3} more`}
            </p>
          )}
        </div>
        {step1.import_mode === 'git' && (
          <Button size="sm" variant="secondary" onClick={runGitScan}>
            Re-scan
          </Button>
        )}
      </div>

      {scanError && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">{scanError}</p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search connectors..."
          className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
      </div>

      {/* Connector grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No connectors found in catalog.</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {/* Auto-detected first */}
          {step1.import_mode === 'git' && filtered.some((c) => c.selected) && (
            <>
              <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider mb-2">Auto-detected</p>
              {filtered.filter((c) => c.selected).map((c) => (
                <ConnectorCard
                  key={c.catalog_entry_id}
                  connector={c}
                  onToggle={() => toggle(c.catalog_entry_id)}
                  onConfigChange={(cfg) => updateConfig(c.catalog_entry_id, cfg)}
                  onTest={() => testConnector(c)}
                />
              ))}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">Available</p>
            </>
          )}
          {filtered
            .filter((c) => step1.import_mode !== 'git' || !c.selected)
            .map((c) => (
              <ConnectorCard
                key={c.catalog_entry_id}
                connector={c}
                onToggle={() => toggle(c.catalog_entry_id)}
                onConfigChange={(cfg) => updateConfig(c.catalog_entry_id, cfg)}
                onTest={() => testConnector(c)}
              />
            ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        You can configure connector details and run health checks after project registration.
      </p>
    </div>
  );
}
