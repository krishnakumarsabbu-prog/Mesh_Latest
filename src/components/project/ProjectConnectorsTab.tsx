import React, { useEffect, useState, useCallback } from 'react';
import { Plug, Plus, Trash2, Settings, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, CircleCheck as CheckCircle, Circle as XCircle, CircleAlert as AlertCircle, Loader, Activity, ExternalLink, Lock, Eye, EyeOff, RefreshCw, Clock, Zap, List, ChartBar as BarChart2, TrendingUp, CheckCheck, TriangleAlert as AlertTriangle, ChevronRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { projectConnectorApi, catalogApi, connectorAgentApi } from '@/lib/api';
import { ProjectConnector, ConnectorCatalogEntry, ConnectorAgentStatus, ConnectorExecutionLog } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { MetricSelectionModal } from './MetricSelectionModal';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  configured:    { label: 'Configured',   color: '#30D158', bg: 'rgba(48,209,88,0.12)',   icon: <CheckCircle className="w-3.5 h-3.5" /> },
  unconfigured:  { label: 'Unconfigured', color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)',  icon: <AlertCircle className="w-3.5 h-3.5" /> },
  error:         { label: 'Error',        color: '#FF453A', bg: 'rgba(255,69,58,0.12)',   icon: <XCircle className="w-3.5 h-3.5" /> },
  testing:       { label: 'Testing',      color: '#0A84FF', bg: 'rgba(10,132,255,0.12)',  icon: <Loader className="w-3.5 h-3.5 animate-spin" /> },
};

const AGENT_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  healthy:       { label: 'Healthy',      color: '#30D158', bg: 'rgba(48,209,88,0.10)',   dot: '#30D158' },
  degraded:      { label: 'Degraded',     color: '#FF9F0A', bg: 'rgba(255,159,10,0.10)',  dot: '#FF9F0A' },
  down:          { label: 'Down',         color: '#FF453A', bg: 'rgba(255,69,58,0.10)',   dot: '#FF453A' },
  timeout:       { label: 'Timeout',      color: '#FF6B35', bg: 'rgba(255,107,53,0.10)',  dot: '#FF6B35' },
  error:         { label: 'Error',        color: '#FF453A', bg: 'rgba(255,69,58,0.10)',   dot: '#FF453A' },
  unknown:       { label: 'Unknown',      color: '#8E8E93', bg: 'rgba(142,142,147,0.10)', dot: '#8E8E93' },
  unconfigured:  { label: 'Unconfigured', color: '#FF9F0A', bg: 'rgba(255,159,10,0.10)',  dot: '#FF9F0A' },
};

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  success:      { label: 'Success',      color: '#30D158' },
  failure:      { label: 'Failure',      color: '#FF453A' },
  timeout:      { label: 'Timeout',      color: '#FF6B35' },
  auth_error:   { label: 'Auth Error',   color: '#FF453A' },
  config_error: { label: 'Config Error', color: '#FF9F0A' },
  skipped:      { label: 'Skipped',      color: '#8E8E93' },
};

const CATEGORY_LABELS: Record<string, string> = {
  observability: 'Observability', apm: 'APM', itsm: 'ITSM',
  database: 'Database', messaging: 'Messaging', custom: 'Custom',
};

interface SyncResultData {
  success: boolean;
  health_status: string;
  response_time_ms?: number;
  message?: string;
  error?: string;
  metrics?: Array<{
    name: string;
    value: number;
    unit: string;
    description?: string;
    labels?: Record<string, string>;
    timestamp?: string;
  }>;
  connector_slug?: string;
  executed_at?: string;
  project_id?: string;
  application_name?: string;
  environment?: string;
  api_call_trace?: {
    total_calls: number;
    total_duration_ms: number;
    calls: Array<{
      call_index: number;
      purpose: string;
      connector: string;
      started_at: string;
      duration_ms: number;
      success: boolean;
      request: {
        method: string;
        url: string;
        endpoint: string;
        params?: Record<string, unknown>;
        payload?: Record<string, unknown>;
        headers_sent?: string[];
      };
      response: {
        status_code: number;
        result_count?: number;
        fields_extracted?: string[];
        metrics_produced?: string[];
        raw_preview?: Record<string, unknown>;
        error?: string | null;
      };
    }>;
  };
}

interface Props {
  projectId: string;
  canManage: boolean;
}

interface ConfigField {
  key: string;
  title: string;
  type: string;
  description?: string;
  secret?: boolean;
  required?: boolean;
  enum?: string[];
  default?: unknown;
}

function parseConfigSchema(schema: Record<string, unknown> | undefined): ConfigField[] {
  if (!schema) return [];
  const props = (schema.properties as Record<string, Record<string, unknown>>) || {};
  const required = (schema.required as string[]) || [];
  return Object.entries(props).map(([key, def]) => ({
    key,
    title: (def.title as string) || key,
    type: (def.type as string) || 'string',
    description: def.description as string | undefined,
    secret: (def.secret as boolean) || false,
    required: required.includes(key),
    enum: def.enum as string[] | undefined,
    default: def.default,
  }));
}

function ConnectorStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.unconfigured;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function AgentStatusIndicator({ agentStatus }: { agentStatus?: ConnectorAgentStatus | null }) {
  if (!agentStatus) return null;
  const meta = AGENT_STATUS_META[agentStatus.health_status] || AGENT_STATUS_META.unknown;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: meta.color, background: meta.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: meta.dot }} />
      {meta.label}
      {agentStatus.last_sync_response_ms != null && (
        <span className="opacity-60">{agentStatus.last_sync_response_ms}ms</span>
      )}
    </span>
  );
}

function ConnectorIcon({ color, name }: { color?: string; name: string }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
      style={{ background: (color || '#2563EB') + '20', color: color || '#2563EB' }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function SyncResultPanel({ result, pcName }: { result: SyncResultData; pcName: string }) {
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'metrics' | 'trace'>(
    result.metrics && result.metrics.length > 0 ? 'metrics' : 'summary'
  );
  const [expandedCalls, setExpandedCalls] = useState<Record<number, boolean>>({});

  const statusMeta = AGENT_STATUS_META[result.health_status] || AGENT_STATUS_META.unknown;
  const hasMetrics = result.metrics && result.metrics.length > 0;
  const hasTrace = !!result.api_call_trace && result.api_call_trace.calls && result.api_call_trace.calls.length > 0;

  const toggleCall = (idx: number) => {
    setExpandedCalls(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div
      className="mt-2 rounded-2xl overflow-hidden border transition-all duration-300"
      style={{
        background: 'var(--app-bg-muted)',
        borderColor: 'var(--app-border)',
        boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.2), var(--shadow-lg)'
      }}
    >
      {/* Header Deck */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-white/5"
        style={{ background: 'var(--app-surface)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ background: statusMeta.dot }}
          />
          <div>
            <h4 className="text-xs font-black text-white flex items-center gap-1.5">
              Sync Diagnostic Output
              <span 
                className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border"
                style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.color + '20' }}
              >
                {statusMeta.label}
              </span>
            </h4>
            <p className="text-[10px] text-slate-500 font-medium">
              Connector: <strong className="text-slate-400 font-semibold">{pcName}</strong> 
              {result.connector_slug && <span className="ml-1 text-slate-600 font-mono">({result.connector_slug})</span>}
            </p>
          </div>
        </div>

        {/* Tab Toggles */}
        <div className="flex items-center gap-1 bg-slate-950/40 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveSubTab('summary')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider',
              activeSubTab === 'summary' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'
            )}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveSubTab('metrics')}
            disabled={!hasMetrics}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider flex items-center gap-1',
              !hasMetrics && 'opacity-30 cursor-not-allowed',
              activeSubTab === 'metrics' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'
            )}
          >
            <TrendingUp className="w-3 h-3 text-cyan-400" />
            Metrics {hasMetrics ? `(${result.metrics!.length})` : ''}
          </button>
          <button
            onClick={() => setActiveSubTab('trace')}
            disabled={!hasTrace}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider flex items-center gap-1',
              !hasTrace && 'opacity-30 cursor-not-allowed',
              activeSubTab === 'trace' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'
            )}
          >
            <Terminal className="w-3 h-3 text-amber-400" />
            Trace {hasTrace ? `(${result.api_call_trace!.calls.length})` : ''}
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="p-3.5 space-y-3">
        {/* SUMMARY PANEL */}
        {activeSubTab === 'summary' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {[
                { label: 'Environment', value: result.environment || 'Production', color: '#AF52DE' },
                { label: 'Target Component', value: result.application_name || 'System Catalog', color: '#30D158' },
                { label: 'Sync Duration', value: result.response_time_ms ? `${result.response_time_ms}ms` : '—', color: '#FF9F0A' },
                { label: 'Total API Calls', value: result.api_call_trace ? `${result.api_call_trace.total_calls} calls` : '—', color: '#64D2FF' },
                { label: 'Trace Latency', value: result.api_call_trace ? `${result.api_call_trace.total_duration_ms}ms` : '—', color: '#BF5AF2' },
                { label: 'Timestamp', value: result.executed_at ? new Date(result.executed_at).toLocaleTimeString() : '—', color: '#FF453A' }
              ].map((item, i) => (
                <div key={i} className="bg-slate-900/40 border border-white/5 rounded-xl p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{item.label}</div>
                  <div className="text-xs font-black mt-1 truncate" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {result.message && (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400 font-medium">
                <span className="font-bold text-slate-300 block mb-0.5">Execution Log Status:</span>
                {result.message}
              </div>
            )}
            {result.error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-950/20 border border-red-500/20 text-xs text-red-400 font-medium font-mono">
                <span className="font-bold text-red-300 block mb-0.5 font-sans">Sync Error Trace:</span>
                {result.error}
              </div>
            )}
          </div>
        )}

        {/* METRICS PANEL */}
        {activeSubTab === 'metrics' && hasMetrics && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Synchronized Telemetry Variables</span>
              <span className="text-cyan-400 font-black font-mono">{result.metrics!.length} collected</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {result.metrics!.map((m, i) => (
                <div key={i} className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/50 border border-white/5 hover:border-white/10 hover:bg-slate-900/80 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-black text-slate-200 block truncate" title={m.name}>
                        {m.name}
                      </span>
                      {m.description && (
                        <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                          {m.description}
                        </span>
                      )}
                    </div>
                    <span 
                      className="px-2.5 py-1 rounded-lg text-xs font-black font-mono flex-shrink-0 flex items-baseline gap-0.5 border"
                      style={{ color: '#00E599', background: 'rgba(0,229,153,0.08)', borderColor: 'rgba(0,229,153,0.18)' }}
                    >
                      {typeof m.value === 'number' ? m.value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : m.value}
                      {m.unit && <span className="text-[8px] opacity-60 font-sans font-bold uppercase ml-0.5 text-slate-400">{m.unit}</span>}
                    </span>
                  </div>

                  {m.labels && Object.keys(m.labels).length > 0 && (
                    <div className="flex flex-wrap gap-1 border-t border-white/5 pt-2 mt-1">
                      {Object.entries(m.labels).map(([k, v]) => (
                        <span 
                          key={k} 
                          className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] text-slate-400 font-mono"
                          title={`${k}: ${v}`}
                        >
                          <strong className="text-slate-300 font-semibold">{k}:</strong> {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {m.timestamp && (
                    <div className="text-[8px] text-slate-600 font-mono self-end">
                      Telemetry: {new Date(m.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TRACE PANEL */}
        {activeSubTab === 'trace' && hasTrace && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Telemetry Request Pipeline</span>
              <span className="text-amber-400 font-black font-mono">
                {result.api_call_trace!.total_calls} calls · {result.api_call_trace!.total_duration_ms}ms
              </span>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {result.api_call_trace!.calls.map((call) => {
                const isExpanded = !!expandedCalls[call.call_index];
                return (
                  <div 
                    key={call.call_index} 
                    className="border border-white/5 bg-slate-900/30 rounded-xl overflow-hidden transition-all hover:bg-slate-900/50"
                  >
                    <div 
                      onClick={() => toggleCall(call.call_index)}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none text-xs font-semibold"
                    >
                      <span className="px-2 py-0.5 rounded font-black bg-white/5 text-slate-400 font-mono text-[10px] border border-white/5">
                        #{call.call_index}
                      </span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded font-black uppercase text-[9px] tracking-wider border',
                        call.request.method === 'GET' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        call.request.method === 'POST' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      )}>
                        {call.request.method}
                      </span>
                      <span className="font-bold text-slate-200 truncate flex-1 leading-none">{call.purpose || call.request.endpoint}</span>
                      <span className="text-slate-400 font-mono text-[10px] flex items-center gap-1 font-semibold">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {call.duration_ms}ms
                      </span>
                      <span className={cn(
                        'px-2 py-0.5 rounded-full font-bold uppercase text-[9px] border',
                        call.success ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-red-500/10 text-red-400 border-red-500/25'
                      )}>
                        {call.response.status_code || (call.success ? 'Success' : 'Error')}
                      </span>
                      <ChevronRight className={cn('w-3.5 h-3.5 text-slate-500 transition-transform duration-200', isExpanded && 'rotate-90')} />
                    </div>

                    {isExpanded && (
                      <div className="border-t border-white/5 p-3.5 space-y-3 bg-slate-950/50 text-[11px] leading-relaxed">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <p className="font-bold text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5 leading-none">
                              <Terminal className="w-3.5 h-3.5 text-cyan-400" /> Request Payload & parameters
                            </p>
                            <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 font-mono text-[11px] space-y-2 break-all max-h-52 overflow-y-auto">
                              <div>
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Endpoint URL:</span> 
                                <span className="text-slate-300 block bg-slate-950/40 p-1.5 rounded border border-white/5 mt-1 text-[10px] font-mono leading-tight">{call.request.url}</span>
                              </div>
                              {call.request.params && Object.keys(call.request.params).length > 0 && (
                                <div>
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Query Params:</span>
                                  <pre className="text-slate-400 text-[10px] mt-1 overflow-x-auto bg-slate-950/40 p-2 rounded border border-white/5">{JSON.stringify(call.request.params, null, 2)}</pre>
                                </div>
                              )}
                              {call.request.payload && Object.keys(call.request.payload).length > 0 && (
                                <div>
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Payload body:</span>
                                  <pre className="text-slate-400 text-[10px] mt-1 overflow-x-auto bg-slate-950/40 p-2 rounded border border-white/5">{JSON.stringify(call.request.payload, null, 2)}</pre>
                                </div>
                              )}
                              {call.request.headers_sent && call.request.headers_sent.length > 0 && (
                                <div>
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Headers Sent:</span>
                                  <div className="flex flex-col gap-1 mt-1">
                                    {call.request.headers_sent.map((h, hi) => (
                                      <span key={hi} className="text-[10px] bg-slate-950/50 px-2 py-1 rounded text-slate-400 font-sans border border-white/5 leading-none">{h}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <p className="font-bold text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5 leading-none">
                              <Activity className="w-3.5 h-3.5 text-amber-400" /> Response Analytics & metrics
                            </p>
                            <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 font-mono text-[11px] space-y-2 break-all max-h-52 overflow-y-auto">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">HTTP Status:</span>
                                <span className={cn(
                                  'px-2 py-0.5 rounded font-black',
                                  call.success ? 'text-emerald-400' : 'text-red-400'
                                )}>
                                  {call.response.status_code}
                                </span>
                              </div>
                              {call.response.result_count !== undefined && (
                                <div className="flex items-center justify-between border-t border-white/5 pt-1.5">
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Result Records:</span>
                                  <span className="text-slate-300 font-bold">{call.response.result_count}</span>
                                </div>
                              )}
                              {call.response.fields_extracted && call.response.fields_extracted.length > 0 && (
                                <div className="border-t border-white/5 pt-2">
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block">Extracted Fields:</span>
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {call.response.fields_extracted.map(f => (
                                      <span key={f} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-sans border border-blue-500/20">{f}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {call.response.metrics_produced && call.response.metrics_produced.length > 0 && (
                                <div className="border-t border-white/5 pt-2">
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block">Produced Metrics:</span>
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {call.response.metrics_produced.map(f => (
                                      <span key={f} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[9px] font-sans border border-purple-500/20">{f}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {call.response.raw_preview && Object.keys(call.response.raw_preview).length > 0 && (
                                <div className="border-t border-white/5 pt-2">
                                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block mb-1">Raw Preview:</span>
                                  <pre className="text-slate-300 text-[10px] overflow-x-auto bg-slate-950/50 p-2.5 rounded border border-white/5 max-h-36 overflow-y-auto">{JSON.stringify(call.response.raw_preview, null, 2)}</pre>
                                </div>
                              )}
                              {call.response.error && (
                                <div className="text-red-400 mt-2 bg-red-950/20 p-2.5 rounded border border-red-500/10 text-[10px] font-mono leading-tight">
                                  <span className="font-bold block uppercase text-[9px] text-red-300 mb-0.5">Error log:</span> 
                                  {call.response.error}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectConnectorsTab({ projectId, canManage }: Props) {
  const [connectors, setConnectors] = useState<ProjectConnector[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, ConnectorAgentStatus>>({});
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ catalog_entry_id: '', name: '', description: '', priority: 0 });
  const [assignSaving, setAssignSaving] = useState(false);

  const [configTarget, setConfigTarget] = useState<ProjectConnector | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configSaving, setConfigSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; ms?: number; details?: Record<string, unknown> } | null>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResultData>>({});

  const [logsTarget, setLogsTarget] = useState<ProjectConnector | null>(null);
  const [logs, setLogs] = useState<ConnectorExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<ProjectConnector | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  const [metricsTarget, setMetricsTarget] = useState<ProjectConnector | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, statusRes] = await Promise.all([
        projectConnectorApi.list(projectId),
        connectorAgentApi.projectStatuses(projectId).catch(() => ({ data: [] })),
      ]);
      setConnectors(connRes.data);
      const statusMap: Record<string, ConnectorAgentStatus> = {};
      (statusRes.data as ConnectorAgentStatus[]).forEach(s => {
        statusMap[s.project_connector_id] = s;
      });
      setAgentStatuses(statusMap);
    } catch {
      notify.error('Failed to load connectors');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAssign = async () => {
    try {
      const res = await catalogApi.list({ enabled_only: true });
      setCatalog(res.data);
    } catch {
      notify.error('Failed to load catalog');
    }
    setAssignForm({ catalog_entry_id: '', name: '', description: '', priority: 0 });
    setAssignOpen(true);
  };

  const handleCatalogSelect = (id: string) => {
    const entry = catalog.find(c => c.id === id);
    setAssignForm(f => ({
      ...f,
      catalog_entry_id: id,
      name: entry ? entry.name : f.name,
    }));
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignSaving(true);
    try {
      await projectConnectorApi.assign(projectId, assignForm);
      notify.success('Connector assigned to project');
      setAssignOpen(false);
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to assign connector', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setAssignSaving(false);
    }
  };

  const openConfigure = (pc: ProjectConnector) => {
    const fields = parseConfigSchema(pc.catalog_entry?.config_schema);
    const current: Record<string, string> = {};
    fields.forEach(f => {
      const storedVal = pc.config?.[f.key];
      current[f.key] = storedVal !== undefined ? String(storedVal) : (f.default !== undefined ? String(f.default) : '');
    });
    setConfigValues(current);
    setShowSecrets({});
    setTestResult(null);
    setConfigTarget(pc);
  };

  const handleConfigure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configTarget) return;
    setConfigSaving(true);
    try {
      const fields = parseConfigSchema(configTarget.catalog_entry?.config_schema);
      const config: Record<string, unknown> = {};
      const credentials: Record<string, unknown> = {};
      fields.forEach(f => {
        const val = configValues[f.key];
        if (val !== undefined && val !== '') {
          if (f.secret) credentials[f.key] = val;
          else config[f.key] = val;
        }
      });
      await projectConnectorApi.configure(projectId, configTarget.id, { config, credentials });
      notify.success('Connector configured');
      setConfigTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to save configuration');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleAgentTest = async () => {
    if (!configTarget) return;
    setTestingId(configTarget.id);
    setTestResult(null);
    try {
      const fields = parseConfigSchema(configTarget.catalog_entry?.config_schema);
      const config: Record<string, unknown> = {};
      const credentials: Record<string, unknown> = {};
      fields.forEach(f => {
        const val = configValues[f.key];
        if (val !== undefined && val !== '') {
          if (f.secret) credentials[f.key] = val;
          else config[f.key] = val;
        }
      });
      const res = await connectorAgentApi.test(projectId, configTarget.id, { config, credentials });
      const data = res.data;
      const detailParts: string[] = [];
      if (data.connector_slug) detailParts.push(`Agent: ${data.connector_slug}`);
      if (data.authenticated === true) detailParts.push('Authenticated');
      if (data.details?.version) detailParts.push(`v${data.details.version}`);
      setTestResult({
        success: data.success,
        message: data.success
          ? `Connection successful${detailParts.length ? ' — ' + detailParts.join(' · ') : ''}`
          : (data.error || 'Connection failed'),
        ms: data.response_time_ms,
        details: data.details,
      });
      if (data.success) fetchAll();
    } catch {
      setTestResult({ success: false, message: 'Agent test request failed' });
    } finally {
      setTestingId(null);
    }
  };

  const handleSync = async (pc: ProjectConnector) => {
    setSyncingId(pc.id);
    try {
      const res = await connectorAgentApi.sync(projectId, pc.id);
      const data = res.data as SyncResultData;

      // Store sync result to show inline
      setSyncResults(prev => ({ ...prev, [pc.id]: data }));

      if (data.success) {
        notify.success(`Sync complete — ${data.health_status}${data.response_time_ms ? ` (${data.response_time_ms}ms)` : ''}`);
      } else {
        notify.error('Sync failed', data.error || data.message);
      }

      // Re-fetch both connectors list and agent statuses immediately after sync
      const [connRes, statusRes] = await Promise.all([
        projectConnectorApi.list(projectId),
        connectorAgentApi.projectStatuses(projectId).catch(() => ({ data: [] })),
      ]);
      setConnectors(connRes.data);
      const statusMap: Record<string, ConnectorAgentStatus> = {};
      (statusRes.data as ConnectorAgentStatus[]).forEach(s => {
        statusMap[s.project_connector_id] = s;
      });
      setAgentStatuses(statusMap);
    } catch {
      notify.error('Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const openLogs = async (pc: ProjectConnector) => {
    setLogsTarget(pc);
    setLogs([]);
    setLogsLoading(true);
    try {
      const res = await connectorAgentApi.logs(projectId, pc.id, 30);
      setLogs(res.data);
    } catch {
      notify.error('Failed to load execution logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleToggle = async (pc: ProjectConnector) => {
    try {
      await projectConnectorApi.toggle(projectId, pc.id, !pc.is_enabled);
      setConnectors(prev => prev.map(c => c.id === pc.id ? { ...c, is_enabled: !c.is_enabled } : c));
    } catch {
      notify.error('Failed to toggle connector');
    }
  };

  const handlePriority = async (pc: ProjectConnector, direction: 'up' | 'down') => {
    const delta = direction === 'up' ? -1 : 1;
    const newPriority = Math.max(0, pc.priority + delta);
    try {
      await projectConnectorApi.configure(projectId, pc.id, { priority: newPriority });
      fetchAll();
    } catch {
      notify.error('Failed to update priority');
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveSaving(true);
    try {
      await projectConnectorApi.remove(projectId, removeTarget.id);
      notify.success('Connector removed from project');
      setRemoveTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to remove connector');
    } finally {
      setRemoveSaving(false);
    }
  };

  const alreadyAssignedIds = new Set(connectors.map(c => c.catalog_entry_id));
  const availableCatalog = catalog.filter(c => !alreadyAssignedIds.has(c.id));
  const configFields = configTarget ? parseConfigSchema(configTarget.catalog_entry?.config_schema) : [];

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-neutral-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const healthyCnt = Object.values(agentStatuses).filter(s => s.health_status === 'healthy').length;
  const downCnt = Object.values(agentStatuses).filter(s => ['down', 'error', 'timeout'].includes(s.health_status)).length;
  const degradedCnt = Object.values(agentStatuses).filter(s => s.health_status === 'degraded').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">Project Connectors</h3>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
            <span>{connectors.length} connector{connectors.length !== 1 ? 's' : ''}</span>
            {Object.keys(agentStatuses).length > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-400 font-bold">{healthyCnt} healthy</span>
                {degradedCnt > 0 && <><span>·</span><span className="text-amber-400 font-bold">{degradedCnt} degraded</span></>}
                {downCnt > 0 && <><span>·</span><span className="text-red-400 font-bold">{downCnt} down</span></>}
              </>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={fetchAll}
            >
              Refresh
            </Button>
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAssign}>
              Assign Connector
            </Button>
          </div>
        )}
      </div>

      {connectors.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No connectors assigned"
          description="Assign connectors from the global catalog to start monitoring this project."
          action={canManage ? (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAssign}>
              Assign Connector
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {connectors.map((pc, idx) => (
            <ConnectorRow
              key={pc.id}
              pc={pc}
              idx={idx}
              total={connectors.length}
              canManage={canManage}
              agentStatus={agentStatuses[pc.id] || null}
              isSyncing={syncingId === pc.id}
              syncResult={syncResults[pc.id] || null}
              onConfigure={openConfigure}
              onToggle={handleToggle}
              onPriority={handlePriority}
              onRemove={setRemoveTarget}
              onSync={handleSync}
              onLogs={openLogs}
              onMetrics={setMetricsTarget}
              onClearSyncResult={() => setSyncResults(prev => { const n = {...prev}; delete n[pc.id]; return n; })}
            />
          ))}
        </div>
      )}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign Connector"
        subtitle="Select a connector from the global catalog"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button type="submit" form="assign-form" loading={assignSaving}>Assign</Button>
          </>
        }
      >
        <form id="assign-form" onSubmit={handleAssign} className="space-y-4">
          <Select
            label="Connector"
            value={assignForm.catalog_entry_id}
            onChange={e => handleCatalogSelect(e.target.value)}
            required
            options={[
              { value: '', label: 'Select from catalog...' },
              ...availableCatalog.map(c => ({
                value: c.id,
                label: `${c.name}${c.vendor ? ` — ${c.vendor}` : ''} (${CATEGORY_LABELS[c.category] || c.category})`,
              })),
            ]}
          />
          <Input
            label="Display Name"
            value={assignForm.name}
            onChange={e => setAssignForm(f => ({ ...f, name: e.target.value }))}
            placeholder="My Connector"
            required
          />
          <Input
            label="Description"
            value={assignForm.description}
            onChange={e => setAssignForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description"
          />
          <Input
            label="Priority"
            type="number"
            min={0}
            value={String(assignForm.priority)}
            onChange={e => setAssignForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
            hint="Lower number = higher priority"
          />
          {availableCatalog.length === 0 && (
            <p className="text-xs text-neutral-400">All available connectors are already assigned to this project.</p>
          )}
        </form>
      </Modal>

      <Modal
        open={!!configTarget}
        onClose={() => setConfigTarget(null)}
        title={`Configure: ${configTarget?.name || ''}`}
        subtitle={configTarget?.catalog_entry?.vendor ? `${configTarget.catalog_entry.vendor} · ${configTarget.catalog_entry.version || ''}` : undefined}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              size="sm"
              icon={testingId === configTarget?.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              onClick={handleAgentTest}
              loading={testingId === configTarget?.id}
              disabled={testingId !== null && testingId !== configTarget?.id}
            >
              Test Connection
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfigTarget(null)}>Cancel</Button>
              <Button type="submit" form="config-form" loading={configSaving}>Save Config</Button>
            </div>
          </div>
        }
      >
        <form id="config-form" onSubmit={handleConfigure} className="space-y-4">
          {testResult && (
            <div
              className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl text-sm"
              style={{
                background: testResult.success ? 'rgba(48,209,88,0.08)' : 'rgba(255,69,58,0.08)',
                border: `1px solid ${testResult.success ? 'rgba(48,209,88,0.2)' : 'rgba(255,69,58,0.2)'}`,
              }}
            >
              <div className="flex items-center gap-2" style={{ color: testResult.success ? '#30D158' : '#FF453A' }}>
                {testResult.success
                  ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  : <XCircle className="w-4 h-4 flex-shrink-0" />}
                <span className="flex-1">{testResult.message}</span>
                {testResult.ms !== undefined && (
                  <span className="ml-auto text-xs opacity-70 flex-shrink-0">{testResult.ms}ms</span>
                )}
              </div>
              {testResult.details && Object.keys(testResult.details).length > 0 && (
                <div className="text-xs text-neutral-500 pl-6 space-y-0.5">
                  {Object.entries(testResult.details).slice(0, 4).map(([k, v]) => (
                    <div key={k}><span className="text-neutral-400">{k}:</span> {String(v)}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {configTarget?.catalog_entry?.docs_url && (
            <a
              href={configTarget.catalog_entry.docs_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View documentation
            </a>
          )}

          {configFields.length === 0 ? (
            <p className="text-sm text-neutral-400 py-4 text-center">No configuration fields defined for this connector type.</p>
          ) : (
            <div className="space-y-3">
              {configFields.map(field => (
                <ConfigFieldInput
                  key={field.key}
                  field={field}
                  value={configValues[field.key] ?? ''}
                  onChange={val => setConfigValues(prev => ({ ...prev, [field.key]: val }))}
                  showSecret={!!showSecrets[field.key]}
                  onToggleSecret={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                />
              ))}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!logsTarget}
        onClose={() => setLogsTarget(null)}
        title={`Execution Logs — ${logsTarget?.name || ''}`}
        subtitle="Last 30 agent executions, newest first"
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setLogsTarget(null)}>Close</Button>
        }
      >
        {logsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-neutral-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-400">
            No executions recorded yet. Run a test or sync to generate logs.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {logs.map(log => {
              const outcomeMeta = OUTCOME_META[log.outcome] || { label: log.outcome, color: '#8E8E93' };
              return (
                <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-neutral-50 text-xs">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: outcomeMeta.color }}
                  />
                  <span className="font-medium w-20 flex-shrink-0" style={{ color: outcomeMeta.color }}>
                    {outcomeMeta.label}
                  </span>
                  <span className="text-neutral-400 capitalize w-14 flex-shrink-0">
                    {log.triggered_by.replace('_', ' ')}
                  </span>
                  {log.response_time_ms != null && (
                    <span className="font-mono text-neutral-500 w-14 flex-shrink-0">{log.response_time_ms}ms</span>
                  )}
                  {log.error_message && (
                    <span className="text-neutral-400 truncate flex-1" title={log.error_message}>
                      {log.error_message}
                    </span>
                  )}
                  <span className="ml-auto text-neutral-400 flex-shrink-0 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatRelativeTime(log.executed_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {metricsTarget && (
        <MetricSelectionModal
          open={!!metricsTarget}
          onClose={() => setMetricsTarget(null)}
          projectId={projectId}
          pc={metricsTarget}
        />
      )}

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove Connector"
        message={`Remove "${removeTarget?.name}" from this project? Configuration will be lost.`}
        confirmLabel="Remove"
        variant="danger"
        loading={removeSaving}
      />
    </div>
  );
}

function ConfigFieldInput({
  field, value, onChange, showSecret, onToggleSecret,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
  showSecret: boolean;
  onToggleSecret: () => void;
}) {
  if (field.enum) {
    return (
      <Select
        label={field.title}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={field.required}
        hint={field.description}
        options={field.enum.map(v => ({ value: v, label: v }))}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#667085' }}>
          {field.title}
        </label>
        <Select
          value={value === '' ? String(field.default ?? 'true') : value}
          onChange={e => onChange(e.target.value)}
          options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
        />
        {field.description && <p className="text-xs leading-relaxed" style={{ color: '#667085' }}>{field.description}</p>}
      </div>
    );
  }

  if (field.type === 'integer' || field.type === 'number') {
    return (
      <Input
        label={field.title}
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={field.required}
        hint={field.description}
      />
    );
  }

  if (field.secret) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold tracking-wide uppercase flex items-center gap-1.5" style={{ color: '#667085' }}>
          <Lock className="w-3 h-3" />
          {field.title}
          {field.required && <span className="text-[10px]" style={{ color: '#EF4444' }}>*</span>}
        </label>
        <div className="relative">
          <Input
            type={showSecret ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            required={field.required}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={onToggleSecret}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-300 transition-colors"
          >
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {field.description && <p className="text-xs leading-relaxed" style={{ color: '#667085' }}>{field.description}</p>}
      </div>
    );
  }

  return (
    <Input
      label={field.title}
      value={value}
      onChange={e => onChange(e.target.value)}
      required={field.required}
      hint={field.description}
      placeholder={`Enter ${field.title.toLowerCase()}`}
    />
  );
}

function ConnectorRow({
  pc, idx, total, canManage, agentStatus, isSyncing, syncResult,
  onConfigure, onToggle, onPriority, onRemove, onSync, onLogs, onMetrics, onClearSyncResult,
}: {
  pc: ProjectConnector;
  idx: number;
  total: number;
  canManage: boolean;
  agentStatus: ConnectorAgentStatus | null;
  isSyncing: boolean;
  syncResult: SyncResultData | null;
  onConfigure: (pc: ProjectConnector) => void;
  onToggle: (pc: ProjectConnector) => void;
  onPriority: (pc: ProjectConnector, dir: 'up' | 'down') => void;
  onRemove: (pc: ProjectConnector) => void;
  onSync: (pc: ProjectConnector) => void;
  onLogs: (pc: ProjectConnector) => void;
  onMetrics: (pc: ProjectConnector) => void;
  onClearSyncResult: () => void;
}) {
  const catalog = pc.catalog_entry;
  const hasAgentStatus = !!agentStatus && agentStatus.total_executions > 0;

  return (
    <div className={cn(
      'rounded-2xl border transition-all',
      pc.is_enabled
        ? 'bg-slate-900/60 border-white/5 hover:border-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.02)]'
        : 'bg-slate-950/40 border-white/5 opacity-50',
    )}>
      <div className="flex items-center gap-3 p-3">
        <ConnectorIcon color={catalog?.color} name={catalog?.name || pc.name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white truncate">{pc.name}</span>
            <ConnectorStatusBadge status={pc.status} />
            {hasAgentStatus && <AgentStatusIndicator agentStatus={agentStatus} />}
            {!pc.is_enabled && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-slate-400">Disabled</span>
            )}
            {isSyncing && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,153,0.1)', color: '#00E599' }}>
                <Loader className="w-3 h-3 animate-spin" />
                Syncing...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
            {catalog && <span className="capitalize font-semibold">{CATEGORY_LABELS[catalog.category] || catalog.category}</span>}
            {catalog?.vendor && <><span>·</span><span>{catalog.vendor}</span></>}
            {agentStatus?.last_sync_at && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="w-2.5 h-2.5" />
                  Synced {formatRelativeTime(agentStatus.last_sync_at)}
                </span>
              </>
            )}
            {hasAgentStatus && agentStatus.uptime_percentage != null && (
              <>
                <span>·</span>
                <span className={cn(
                  'font-bold',
                  agentStatus.uptime_percentage >= 90 ? 'text-emerald-400' : agentStatus.uptime_percentage >= 70 ? 'text-amber-400' : 'text-red-400'
                )}>{agentStatus.uptime_percentage}% uptime</span>
                <span>·</span>
                <span className="text-slate-500">{agentStatus.total_executions} runs</span>
              </>
            )}
            {!hasAgentStatus && pc.last_test_at && (
              <>
                <span>·</span>
                <span className="text-slate-500">Tested {new Date(pc.last_test_at).toLocaleDateString()}</span>
              </>
            )}
          </div>
          {agentStatus?.last_error && agentStatus.health_status !== 'healthy' && (
            <p className="text-xs mt-0.5 truncate max-w-sm text-red-400">
              {agentStatus.last_error}
            </p>
          )}
          {!agentStatus && pc.last_test_error && pc.status === 'error' && (
            <p className="text-xs mt-0.5 truncate text-red-400">{pc.last_test_error}</p>
          )}
        </div>

        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onPriority(pc, 'up')}
              disabled={idx === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Increase priority"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onPriority(pc, 'down')}
              disabled={idx === total - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Decrease priority"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSync(pc)}
              disabled={isSyncing}
              className={cn(
                'p-1.5 rounded-lg transition-all',
                isSyncing
                  ? 'text-[#00E599] bg-[rgba(0,229,153,0.1)] cursor-not-allowed'
                  : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
              )}
              title="Run health sync"
            >
              {isSyncing
                ? <Loader className="w-3.5 h-3.5 animate-spin" />
                : <Activity className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onLogs(pc)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              title="View execution logs"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onToggle(pc)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              title={pc.is_enabled ? 'Disable' : 'Enable'}
            >
              {pc.is_enabled
                ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                : <ToggleLeft className="w-4 h-4" />
              }
            </button>
            <button
              onClick={() => onMetrics(pc)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
              title="Select metrics"
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onConfigure(pc)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
              title="Configure"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRemove(pc)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {syncResult && !isSyncing && (
        <div className="px-3 pb-3">
          <SyncResultPanel result={syncResult} pcName={pc.name} />
        </div>
      )}
    </div>
  );
}
