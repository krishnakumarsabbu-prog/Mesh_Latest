import React, { useEffect, useState, useMemo } from 'react';
import { 
  Plus, Plug, RefreshCw, Trash2, Play, Search, X, 
  ChevronDown, ChevronUp, Database, Network, Activity, 
  ArrowLeftRight, ShieldCheck, Cpu, ArrowRightLeft, Link2, ExternalLink
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { connectorApi, projectApi } from '@/lib/api';
import { Connector, Project } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { formatMs, formatRelativeTime, cn } from '@/lib/utils';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const CONNECTOR_TYPES = [
  'rest_api', 'database', 'message_queue', 'grpc', 'graphql', 'websocket', 'custom',
];

interface GroupedConnector {
  name: string;
  type: string;
  status: string;
  avg_response_time: number;
  connectors: Connector[];
  leveragingProjects: Project[];
}

export function ConnectorsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectIdFilter = searchParams.get('project_id');

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'adapters' | 'instantiations'>('adapters');
  const [expandedAdapter, setExpandedAdapter] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', type: 'rest_api', project_id: projectIdFilter || '',
    endpoint_url: '', check_interval_seconds: '60', timeout_seconds: '30',
  });

  useEffect(() => {
    setPageTitle('Observability Mesh');
    setBreadcrumbs([{ label: 'Connectors' }]);
    fetchData();
  }, [projectIdFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [connRes, projRes] = await Promise.all([
        connectorApi.list(projectIdFilter || undefined),
        projectApi.list(),
      ]);
      setConnectors(connRes.data);
      setProjects(projRes.data);
    } catch {
      notify.error('Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await connectorApi.create(form);
      notify.success('Connector created');
      setCreateOpen(false);
      setForm({ name: '', description: '', type: 'rest_api', project_id: projectIdFilter || '', endpoint_url: '', check_interval_seconds: '60', timeout_seconds: '30' });
      fetchData();
    } catch (err: unknown) {
      notify.error('Failed to create', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleHealthCheck = async (connectorId: string) => {
    setChecking(connectorId);
    try {
      await connectorApi.runHealthCheck(connectorId);
      notify.success('Health check completed');
      fetchData();
    } catch {
      notify.error('Health check failed');
    } finally {
      setChecking(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await connectorApi.delete(deleteTarget.id);
      notify.success('Connector deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      notify.error('Failed to delete connector');
    } finally {
      setSaving(false);
    }
  };

  // Grouping logic for "Observability Adapters (Grouped View)"
  const groupedAdapters = useMemo(() => {
    const groups: { [key: string]: GroupedConnector } = {};

    connectors.forEach((conn) => {
      // Group by normalized lowercase connector name
      const key = conn.name.trim().toLowerCase();
      
      const matchedProject = projects.find(p => p.id === conn.project_id);

      if (!groups[key]) {
        groups[key] = {
          name: conn.name,
          type: conn.type,
          status: conn.status,
          avg_response_time: conn.avg_response_time_ms || 0,
          connectors: [conn],
          leveragingProjects: matchedProject ? [matchedProject] : [],
        };
      } else {
        groups[key].connectors.push(conn);
        if (matchedProject && !groups[key].leveragingProjects.some(p => p.id === matchedProject.id)) {
          groups[key].leveragingProjects.push(matchedProject);
        }
        // If any connector in the group is down, the whole adapter is down or degraded
        if (conn.status === 'down') {
          groups[key].status = 'down';
        } else if (conn.status === 'degraded' && groups[key].status !== 'down') {
          groups[key].status = 'degraded';
        }
        groups[key].avg_response_time = (groups[key].avg_response_time + (conn.avg_response_time_ms || 0)) / 2;
      }
    });

    return Object.values(groups);
  }, [connectors, projects]);

  const filteredGrouped = useMemo(() => {
    const lower = search.toLowerCase();
    return groupedAdapters.filter(adapter => {
      if (search && !adapter.name.toLowerCase().includes(lower) && !adapter.type.toLowerCase().includes(lower)) return false;
      if (statusFilter && adapter.status !== statusFilter) return false;
      if (typeFilter && adapter.type !== typeFilter) return false;
      return true;
    });
  }, [groupedAdapters, search, statusFilter, typeFilter]);

  const filteredFlat = useMemo(() => {
    const lower = search.toLowerCase();
    return connectors.filter(c => {
      if (search && !c.name.toLowerCase().includes(lower) && !(c.endpoint_url || '').toLowerCase().includes(lower)) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      return true;
    });
  }, [connectors, search, statusFilter, typeFilter]);

  const getConnectorIcon = (type: string) => {
    switch (type) {
      case 'database':
        return <Database className="w-5 h-5" />;
      case 'message_queue':
        return <ArrowRightLeft className="w-5 h-5" />;
      case 'rest_api':
        return <Activity className="w-5 h-5" />;
      case 'grpc':
        return <Cpu className="w-5 h-5" />;
      default:
        return <Plug className="w-5 h-5" />;
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Connector',
      render: (val: unknown, row: Connector) => {
        const component = projects.find(p => p.id === row.project_id);
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--app-bg)] border border-[var(--app-border)]">
              <Plug className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">{row.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] font-mono">{row.endpoint_url || 'No URL configured'}</p>
              {component && (
                <div 
                  onClick={() => navigate(`/projects/${component.id}`)}
                  className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <Link2 className="w-2.5 h-2.5" />
                  Leveraged by: {component.name}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Type',
      render: (val: unknown) => (
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg uppercase tracking-wider font-bold bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--text-secondary)]">
          {String(val).replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (val: unknown) => <StatusBadge status={String(val)} />,
    },
    {
      key: 'avg_response_time_ms',
      header: 'Response Time',
      render: (val: unknown) => (
        <span className="text-[12px] font-mono font-bold text-[var(--text-primary)]">{formatMs(val as number | undefined)}</span>
      ),
    },
    {
      key: 'last_checked',
      header: 'Last Check',
      render: (val: unknown) => (
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          {val ? formatRelativeTime(String(val)) : 'Never'}
        </span>
      ),
    },
    {
      key: 'id',
      header: '',
      render: (_: unknown, row: Connector) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); handleHealthCheck(row.id); }}
            className="p-1.5 rounded-lg transition-all text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20"
            disabled={checking === row.id}
            title="Run health check"
          >
            {checking === row.id ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            className="p-1.5 rounded-lg transition-all text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
            title="Delete connector"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const hasFilters = search || statusFilter || typeFilter;

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Premium Obsidian Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-[var(--app-border)]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] font-mono flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            REVERSE OBSERVABILITY GRID
          </h2>
          <p className="text-xs text-[var(--text-secondary)] uppercase tracking-widest mt-0.5 font-bold">
            Catalog Connectors Reverse lookup architectural mapping
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={fetchData} className="border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)]">
            Sync Telemetry
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)} className="bg-gradient-to-r from-cyan-500 to-blue-600 border-none text-white shadow-lg shadow-cyan-500/20">
            Register Adapter
          </Button>
        </div>
      </div>

      {/* Modern Premium Tab Switcher */}
      <div className="flex rounded-xl border border-[var(--app-border)] p-1 bg-[var(--app-bg-muted)] w-fit shadow-sm">
        <button
          onClick={() => setActiveTab('adapters')}
          className={cn(
            "px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center gap-2",
            activeTab === 'adapters' 
              ? "bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--text-primary)] shadow-sm font-black" 
              : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Activity className="w-3.5 h-3.5" />
          Observability Adapters ({groupedAdapters.length})
        </button>
        <button
          onClick={() => setActiveTab('instantiations')}
          className={cn(
            "px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center gap-2",
            activeTab === 'instantiations' 
              ? "bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--text-primary)] shadow-sm font-black" 
              : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Plug className="w-3.5 h-3.5" />
          Active Instantiations ({connectors.length})
        </button>
      </div>

      {/* Global Observability Filter Console */}
      <Card padding="none" className="bg-[var(--app-surface)] border border-[var(--app-border)] shadow-sm backdrop-blur-md">
        <div className="px-5 py-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter adapters..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 py-2 text-[13px] rounded-xl outline-none transition-all w-56 bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--text-primary)] font-semibold focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-[13px] rounded-xl outline-none cursor-pointer bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--text-primary)] font-bold focus:border-cyan-400"
              >
                <option value="">All Health Statuses</option>
                <option value="healthy">Healthy</option>
                <option value="degraded">Degraded</option>
                <option value="down">Down</option>
                <option value="unknown">Unknown</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[var(--text-muted)]" />
            </div>

            <div className="relative">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-[13px] rounded-xl outline-none cursor-pointer bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--text-primary)] font-bold focus:border-cyan-400"
              >
                <option value="">All Adapter Types</option>
                {CONNECTOR_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[var(--text-muted)]" />
            </div>

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); }}
                className="text-xs text-rose-400 hover:text-rose-300 transition-colors font-bold uppercase tracking-wider font-mono border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5 rounded-lg"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="flex gap-4 text-[11px] font-mono font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {connectors.filter(c => c.status === 'healthy').length} healthy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {connectors.filter(c => c.status === 'degraded').length} degraded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {connectors.filter(c => c.status === 'down').length} down
            </span>
          </div>
        </div>

        {/* Display Grouped View (Observability Adapters) */}
        {activeTab === 'adapters' && (
          <div className="p-5 space-y-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-2xl shimmer-bg bg-[var(--app-surface-hover)] border border-[var(--app-border)]" />
                ))}
              </div>
            ) : filteredGrouped.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No telemetry adapters found"
                description="Adjust your search filters or register a new connector instantiation."
              />
            ) : (
              <div className="space-y-3">
                {filteredGrouped.map((adapter) => {
                  const isExpanded = expandedAdapter === adapter.name;
                  const adapterColor = 
                    adapter.status === 'down' ? '#FF453A' :
                    adapter.status === 'degraded' ? '#FF9F0A' : '#30D158';

                  return (
                    <motion.div 
                      key={adapter.name}
                      layout="position"
                      className="bg-[var(--app-surface)] border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm"
                      style={{
                        borderColor: isExpanded ? `${adapterColor}30` : 'var(--app-border)',
                        boxShadow: isExpanded ? `0 0 20px ${adapterColor}0c` : 'var(--shadow-sm)'
                      }}
                    >
                      {/* Main Card Header */}
                      <div 
                        onClick={() => setExpandedAdapter(isExpanded ? null : adapter.name)}
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--app-surface-hover)] transition-all select-none"
                      >
                        <div className="flex items-center gap-3.5">
                          {/* Sleek icon box with status border glowing */}
                          <div 
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--text-primary)]"
                            style={{ 
                              background: 'var(--app-surface)',
                              border: `2px solid ${adapterColor}40`,
                              boxShadow: `inset 0 0 10px ${adapterColor}15`
                            }}
                          >
                            {getConnectorIcon(adapter.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5">
                              <h4 className="text-sm font-bold text-[var(--text-primary)] tracking-wide">{adapter.name}</h4>
                              <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded uppercase tracking-wider text-[var(--text-secondary)] bg-[var(--app-bg)] border border-[var(--app-border)]">
                                {adapter.type.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5 mt-1 text-[11px] font-mono font-semibold text-[var(--text-secondary)]">
                              <span>Instantiated: <span className="text-[var(--text-primary)] font-bold">{adapter.connectors.length} instances</span></span>
                              <span className="w-1 h-1 rounded-full bg-[var(--app-border)]" />
                              <span>Leveraging: <span className="text-cyan-400 font-bold">{adapter.leveragingProjects.length} components</span></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-5">
                          {/* Avg Latency details */}
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest leading-none mb-1 font-bold">Avg Latency</p>
                            <p className="text-xs font-mono font-bold text-[var(--text-primary)]">{formatMs(adapter.avg_response_time)}</p>
                          </div>

                          {/* Glowing status marker */}
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2.5 h-2.5 rounded-full animate-pulse"
                              style={{ 
                                background: adapterColor,
                                boxShadow: `0 0 8px ${adapterColor}bb` 
                              }}
                            />
                            <span className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: adapterColor }}>
                              {adapter.status}
                            </span>
                          </div>

                          {/* Expansion arrow */}
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Expandable subrow details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-[var(--app-border)] bg-[var(--app-bg-subtle)] p-4"
                          >
                            <div className="space-y-4">
                              <div>
                                <h5 className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mb-2.5 font-mono">
                                  LEVERAGING INFRASTRUCTURE COMPONENTS ({adapter.leveragingProjects.length})
                                </h5>
                                
                                {adapter.leveragingProjects.length === 0 ? (
                                  <p className="text-xs font-mono text-[var(--text-muted)] uppercase">No leveraging components found.</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {adapter.leveragingProjects.map((component) => (
                                      <div 
                                        key={component.id}
                                        onClick={() => navigate(`/projects/${component.id}`)}
                                        className="p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-cyan-500/50 transition-all cursor-pointer group flex items-center justify-between"
                                      >
                                        <div>
                                          <p className="text-xs font-bold text-[var(--text-primary)] group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                                            {component.name}
                                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                          </p>
                                          <p className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wider mt-0.5">
                                            Env: <span className="text-[var(--text-primary)]">{component.environment || 'production'}</span>
                                          </p>
                                        </div>

                                        <div className="text-right">
                                          <StatusBadge status={component.status} />
                                          <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1 font-bold">Uptime: 99.98%</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div>
                                <h5 className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mb-2.5 font-mono">
                                  INSTANCES CONFIGURATION TELEMETRY ({adapter.connectors.length})
                                </h5>
                                <div className="space-y-2">
                                  {adapter.connectors.map((connector) => (
                                    <div 
                                      key={connector.id}
                                      className="p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex items-center justify-between flex-wrap gap-2 text-xs"
                                    >
                                      <div>
                                        <p className="font-bold text-[var(--text-primary)] font-mono">{connector.endpoint_url || 'No URL configured'}</p>
                                        <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-0.5">
                                          Interval: {connector.check_interval_seconds}s  •  Timeout: {connector.timeout_seconds}s
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <div className="text-right">
                                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-0.5 font-bold">Latency</p>
                                          <p className="font-mono text-[var(--text-primary)] font-bold">{formatMs(connector.avg_response_time_ms)}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-0.5 font-bold">Last Run</p>
                                          <p className="text-[var(--text-secondary)] font-medium">{connector.last_checked ? formatRelativeTime(connector.last_checked) : 'Never'}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleHealthCheck(connector.id); }}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20"
                                            disabled={checking === connector.id}
                                            title="Run health check"
                                          >
                                            {checking === connector.id ? (
                                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                              <Play className="w-3.5 h-3.5" />
                                            )}
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(connector); }}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                                            title="Delete connector"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Display Flat View (Instantiations) */}
        {activeTab === 'instantiations' && (
          <div className="p-0">
            {loading ? (
              <div className="divide-y divide-white/5">
                {Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)}
              </div>
            ) : filteredFlat.length === 0 ? (
              <EmptyState
                icon={Plug}
                title={hasFilters ? 'No connectors match your filters' : 'No connectors yet'}
                description={hasFilters ? 'Try adjusting your search or filters.' : 'Add your first connector to start monitoring service health.'}
                action={!hasFilters ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Add Connector</Button> : undefined}
              />
            ) : (
              <Table<Connector>
                data={filteredFlat}
                columns={columns}
                loading={false}
                emptyMessage="No connectors found."
              />
            )}
          </div>
        )}
      </Card>

      {/* Creation Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register Observability Adapter"
        subtitle="Configure a new service health integration adapter"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-connector-form" loading={saving}>Register Adapter</Button>
          </>
        }
      >
        <form id="create-connector-form" onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Infrastructure Component"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            options={[{ value: '', label: 'Select component...' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            required
          />
          <Input label="Adapter Name" placeholder="e.g., Payment Gateway Splunk Ingest" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select
            label="Integration Adapter Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={CONNECTOR_TYPES.map(t => ({ value: t, label: t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }))}
          />
          <Input label="Connection Endpoint URL" placeholder="https://splunk.internal.company.com/health" value={form.endpoint_url} onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Observation Interval (s)" type="number" value={form.check_interval_seconds} onChange={(e) => setForm({ ...form, check_interval_seconds: e.target.value })} />
            <Input label="Timeout (s)" type="number" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: e.target.value })} />
          </div>
          <TextArea label="Adapter Description" placeholder="Describe the purpose of this telemetry integration..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Observability Adapter"
        message={`Delete "${deleteTarget?.name}"? Connected component metrics history will be permanently deleted.`}
        confirmLabel="Remove"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
