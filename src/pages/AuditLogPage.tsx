import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Search, Filter, RefreshCw, Download, Clock, User, Database, Link, Box, FileText, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { auditApi } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import { cn, formatRelativeTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';

interface AuditLogEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id?: string;
  changes?: string;
  ip_address?: string;
  user_agent?: string;
  tenant_id?: string;
  created_at: string;
}

const ACTION_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  'user.login': { bg: 'rgba(59,130,246,0.12)', color: '#60A5FA', label: 'Login' },
  'user.register': { bg: 'rgba(16,185,129,0.12)', color: '#34D399', label: 'Register' },
  'user.logout': { bg: 'rgba(107,114,128,0.12)', color: '#9CA3AF', label: 'Logout' },
  'user.change_password': { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: 'Password Change' },
  'user.create': { bg: 'rgba(0,229,153,0.12)', color: '#00E599', label: 'Create User' },
  'user.update': { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: 'Update User' },
  'user.deactivate': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Deactivate User' },
  'user.role_assign': { bg: 'rgba(139,92,246,0.12)', color: '#A78BFA', label: 'Role Assign' },
  'user.role_remove': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Role Remove' },
  'connector.create': { bg: 'rgba(0,229,153,0.12)', color: '#00E599', label: 'Create' },
  'connector.update': { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: 'Update' },
  'connector.delete': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Delete' },
  'connector.health_check': { bg: 'rgba(139,92,246,0.12)', color: '#A78BFA', label: 'Health Check' },
  'project.create': { bg: 'rgba(0,229,153,0.12)', color: '#00E599', label: 'Create' },
  'project.update': { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: 'Update' },
  'project.delete': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Delete' },
  'lob.create': { bg: 'rgba(0,229,153,0.12)', color: '#00E599', label: 'Create LOB' },
  'lob.update': { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: 'Update LOB' },
  'lob.delete': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Delete LOB' },
  'lob.admin_assign': { bg: 'rgba(139,92,246,0.12)', color: '#A78BFA', label: 'Admin Assign' },
  'lob.admin_remove': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Admin Remove' },
  'rule.create': { bg: 'rgba(0,229,153,0.12)', color: '#00E599', label: 'Create Rule' },
  'rule.update': { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: 'Update Rule' },
  'rule.delete': { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Delete Rule' },
  'rule.status_change': { bg: 'rgba(139,92,246,0.12)', color: '#A78BFA', label: 'Status Change' },
};

const RESOURCE_ICONS: Record<string, React.ElementType> = {
  user: User,
  connector: Link,
  project: Box,
  health_rule: Shield,
  lob: Database,
};

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'user', label: 'Users' },
  { value: 'connector', label: 'Connectors' },
  { value: 'project', label: 'Projects' },
  { value: 'health_rule', label: 'Health Rules' },
  { value: 'lob', label: 'Lines of Business' },
];

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'user.login', label: 'Login' },
  { value: 'user.register', label: 'Register' },
  { value: 'create', label: 'Create (any)' },
  { value: 'update', label: 'Update (any)' },
  { value: 'delete', label: 'Delete (any)' },
];

function AuditLogSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3.5 shimmer-bg"
          style={{ animationDelay: `${i * 50}ms`, height: '56px' }}
        />
      ))}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const config = ACTION_COLORS[action];
  const label = config?.label || action.split('.').pop() || action;
  const bg = config?.bg || 'var(--app-bg-muted)';
  const color = config?.color || 'var(--text-secondary)';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ background: bg, color: color }}
    >
      {label}
    </span>
  );
}

export function AuditLogPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const LIMIT = 50;

  useEffect(() => {
    setPageTitle('Audit Logs');
    setBreadcrumbs([{ label: 'Admin' }, { label: 'Audit Logs' }]);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.getLogs({
        search: search || undefined,
        resource_type: resourceType || undefined,
        action: actionFilter || undefined,
        limit: LIMIT,
        offset: page * LIMIT,
      });
      setLogs(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [search, resourceType, actionFilter, page]);

  useEffect(() => {
    const timer = setTimeout(fetchLogs, 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const handleExport = useCallback(async () => {
    const win = window.open(
      `/api/v1/audit/logs/export?format=csv${resourceType ? `&resource_type=${resourceType}` : ''}${actionFilter ? `&action=${actionFilter}` : ''}`,
      '_blank'
    );
    if (!win) {
      const csv = [
        ['ID', 'Action', 'Resource Type', 'Resource ID', 'User ID', 'IP', 'Timestamp'],
        ...logs.map(l => [l.id, l.action, l.resource_type, l.resource_id || '', l.user_id || '', l.ip_address || '', l.created_at]),
      ].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [logs, resourceType, actionFilter]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHeader
        title="Audit Logs"
        subtitle={total > 0 ? `${total.toLocaleString()} total events` : 'System event trail'}
        badge={<Shield className="w-5 h-5" style={{ color: 'var(--accent)' }} />}
      />

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search actions, resources..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] outline-none focus-ring"
              style={{
                background: 'var(--app-bg-muted)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-primary)',
              }}
              aria-label="Search audit logs"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <select
              value={resourceType}
              onChange={e => { setResourceType(e.target.value); setPage(0); }}
              className="pl-9 pr-8 py-2 rounded-xl text-[13px] outline-none focus-ring appearance-none"
              style={{
                background: 'var(--app-bg-muted)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-primary)',
              }}
              aria-label="Filter by resource type"
            >
              {RESOURCE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(0); }}
              className="pl-9 pr-8 py-2 rounded-xl text-[13px] outline-none focus-ring appearance-none"
              style={{
                background: 'var(--app-bg-muted)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-primary)',
              }}
              aria-label="Filter by action"
            >
              {ACTION_FILTER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors focus-ring"
              style={{
                background: 'var(--app-bg-muted)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors focus-ring"
              style={{
                background: 'var(--accent-subtle)',
                border: '1px solid rgba(0,229,153,0.2)',
                color: 'var(--accent)',
              }}
              aria-label="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        <div className="min-h-[200px]">
          {loading ? (
            <AuditLogSkeleton />
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--app-bg-muted)' }}
              >
                <FileText className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No audit logs found</p>
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                {search || resourceType || actionFilter ? 'Try adjusting your filters' : 'Events will appear here as actions are performed'}
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--app-border-subtle)' }}>
              {logs.map((log, idx) => {
                const Icon = RESOURCE_ICONS[log.resource_type] || Shield;
                const isExpanded = expandedId === log.id;
                let parsedChanges: Record<string, unknown> | null = null;
                if (log.changes) {
                  try { parsedChanges = JSON.parse(log.changes); } catch {}
                }
                return (
                  <div
                    key={log.id}
                    className="transition-colors duration-100"
                    style={{ background: isExpanded ? 'rgba(0,229,153,0.03)' : 'transparent' }}
                  >
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                      style={{ cursor: parsedChanges ? 'pointer' : 'default' }}
                      onClick={() => parsedChanges && setExpandedId(isExpanded ? null : log.id)}
                      aria-expanded={isExpanded}
                      aria-label={`Audit event: ${log.action}`}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--app-bg-muted)' }}
                      >
                        <Icon className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <ActionBadge action={log.action} />
                          <span className="text-[12px] font-mono" style={{ color: 'var(--text-muted)' }}>
                            {log.resource_type}
                            {log.resource_id && (
                              <span style={{ color: 'var(--text-disabled)' }}> · {log.resource_id.slice(0, 8)}</span>
                            )}
                          </span>
                          {log.user_id && (
                            <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              <User className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="font-mono">{log.user_id.slice(0, 8)}</span>
                            </span>
                          )}
                        </div>
                        {log.ip_address && (
                          <p className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--text-disabled)' }}>
                            {log.ip_address}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {formatRelativeTime(log.created_at)}
                        </span>
                      </div>
                    </button>

                    {isExpanded && parsedChanges && (
                      <div
                        className="mx-4 mb-3 rounded-xl p-3 font-mono text-[12px] space-y-1"
                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--app-border)' }}
                      >
                        {Object.entries(parsedChanges).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span style={{ color: 'var(--accent)', minWidth: '80px' }}>{k}:</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()} events
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-40 focus-ring"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[13px] font-medium px-2" style={{ color: 'var(--text-primary)' }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-40 focus-ring"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
