import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Search, Filter, RefreshCw, CreditCard as Edit2, Trash2, Play, ToggleLeft, ToggleRight, ChevronDown, TriangleAlert as AlertTriangle, Zap } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useNotificationStore } from '@/store/notificationStore';
import { healthRulesApi } from '@/lib/api';
import { HealthRule, HealthRuleListResponse, RuleMetadata } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmModal } from '@/components/ui/Modal';
import { RuleBuilderModal } from '@/components/rules/RuleBuilderModal';
import { RuleTestModal } from '@/components/rules/RuleTestModal';

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
  high: { label: 'High', color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
  medium: { label: 'Medium', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  low: { label: 'Low', color: '#84CC16', bg: 'rgba(132,204,22,0.10)' },
  info: { label: 'Info', color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
};

const ACTION_LABELS: Record<string, string> = {
  apply_penalty: 'Score Penalty',
  apply_bonus: 'Score Bonus',
  override_status: 'Override Status',
  flag_incident: 'Flag Incident',
  notify: 'Notify',
};

const SCOPE_LABELS: Record<string, string> = {
  global: 'Global',
  project: 'Project',
  connector: 'Connector',
  metric: 'Metric',
};

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}
    >
      {cfg.label}
    </span>
  );
}

function RuleCard({
  rule,
  onEdit,
  onTest,
  onToggle,
  onDelete,
  toggling,
}: {
  rule: HealthRule;
  onEdit: (rule: HealthRule) => void;
  onTest: (rule: HealthRule) => void;
  onToggle: (rule: HealthRule) => void;
  onDelete: (rule: HealthRule) => void;
  toggling: boolean;
}) {
  const isActive = rule.status === 'active';
  const isSystem = rule.is_system;

  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200"
      style={{
        background: 'var(--app-surface)',
        border: `1px solid ${isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
        opacity: isActive ? 1 : 0.65,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: SEVERITY_CONFIG[rule.severity]?.bg || 'rgba(255,255,255,0.06)' }}
          >
            <Shield className="w-4 h-4" style={{ color: SEVERITY_CONFIG[rule.severity]?.color || '#98A2B3' }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {rule.name}
              </span>
              {isSystem && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(99,102,241,0.10)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.20)' }}>
                  SYSTEM
                </span>
              )}
            </div>
            {rule.description && (
              <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                {rule.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onTest(rule)}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            title="Test rule"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.10)'; (e.currentTarget as HTMLElement).style.color = '#38BDF8'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          {!isSystem && (
            <button
              onClick={() => onEdit(rule)}
              className="p-1.5 rounded-lg transition-all duration-150"
              style={{ color: 'var(--text-muted)' }}
              title="Edit rule"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onToggle(rule)}
            disabled={toggling || isSystem}
            className="p-1.5 rounded-lg transition-all duration-150 disabled:opacity-40"
            style={{ color: isActive ? '#00E599' : 'var(--text-muted)' }}
            title={isActive ? 'Disable rule' : 'Enable rule'}
            onMouseEnter={(e) => { if (!toggling && !isSystem) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          {!isSystem && (
            <button
              onClick={() => onDelete(rule)}
              className="p-1.5 rounded-lg transition-all duration-150"
              style={{ color: 'var(--text-muted)' }}
              title="Archive rule"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.10)'; (e.currentTarget as HTMLElement).style.color = '#EF4444'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={rule.severity} />
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {SCOPE_LABELS[rule.scope] || rule.scope}
        </span>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {ACTION_LABELS[rule.action] || rule.action}
          {rule.action_value !== undefined && rule.action_value !== null && rule.action === 'apply_penalty' && (
            <span style={{ color: '#EF4444' }}> −{rule.action_value}pts</span>
          )}
          {rule.action_value !== undefined && rule.action_value !== null && rule.action === 'apply_bonus' && (
            <span style={{ color: '#00E599' }}> +{rule.action_value}pts</span>
          )}
        </span>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''} · {rule.logic_group.toUpperCase()}
        </span>
        {!isActive && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,114,128,0.10)', color: '#6B7280', border: '1px solid rgba(107,114,128,0.15)' }}>
            {rule.status.charAt(0).toUpperCase() + rule.status.slice(1)}
          </span>
        )}
      </div>

      {rule.tags && (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {rule.tags.split(',').slice(0, 4).map((tag) => (
            <span
              key={tag.trim()}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {tag.trim()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RulesPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { add: addNotification } = useNotificationStore();

  const [rules, setRules] = useState<HealthRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<RuleMetadata | null>(null);

  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterScope, setFilterScope] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<HealthRule | undefined>(undefined);

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testingRule, setTestingRule] = useState<HealthRule | undefined>(undefined);

  const [deleteTarget, setDeleteTarget] = useState<HealthRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle('Health Rules');
    setBreadcrumbs([{ label: 'Health Rules' }]);
  }, [setPageTitle, setBreadcrumbs]);

  const fetchMetadata = useCallback(async () => {
    try {
      const res = await healthRulesApi.metadata();
      setMetadata(res.data);
    } catch {
    }
  }, []);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterSeverity) params.severity = filterSeverity;
      if (filterScope) params.scope = filterScope;
      if (filterStatus) params.status = filterStatus;

      const res = await healthRulesApi.list({ ...params, page_size: 100 });
      const data: HealthRuleListResponse = res.data;
      setRules(data.items);
      setTotal(data.total);
    } catch {
      addNotification({ type: 'error', title: 'Failed to load rules' });
    } finally {
      setLoading(false);
    }
  }, [search, filterSeverity, filterScope, filterStatus, addNotification]);

  useEffect(() => { fetchMetadata(); }, [fetchMetadata]);
  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggle = async (rule: HealthRule) => {
    setTogglingId(rule.id);
    const newStatus = rule.status === 'active' ? 'inactive' : 'active';
    try {
      await healthRulesApi.updateStatus(rule.id, newStatus);
      addNotification({ type: 'success', title: `Rule ${newStatus === 'active' ? 'enabled' : 'disabled'}` });
      fetchRules();
    } catch {
      addNotification({ type: 'error', title: 'Failed to update rule status' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await healthRulesApi.delete(deleteTarget.id);
      addNotification({ type: 'success', title: 'Rule archived successfully' });
      setDeleteTarget(null);
      fetchRules();
    } catch {
      addNotification({ type: 'error', title: 'Failed to archive rule' });
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = rules.filter((r) => r.status === 'active').length;
  const criticalCount = rules.filter((r) => r.severity === 'critical').length;

  const groupedRules: Record<string, HealthRule[]> = {};
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    const matching = rules.filter((r) => r.severity === sev);
    if (matching.length > 0) groupedRules[sev] = matching;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,229,153,0.12)' }}>
              <Shield className="w-4 h-4" style={{ color: '#00E599' }} />
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Health Rules
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Configurable rules that influence health scoring and status determination
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={fetchRules}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => { setEditingRule(undefined); setBuilderOpen(true); }}
          >
            New Rule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Rules', value: total, color: '#60A5FA', icon: Shield },
          { label: 'Active Rules', value: activeCount, color: '#00E599', icon: Zap },
          { label: 'Critical Severity', value: criticalCount, color: '#EF4444', icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl p-4"
            style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4" style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search rules by name, description, or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm transition-all duration-150 focus:outline-none"
              style={{
                background: 'var(--app-bg-subtle)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={{
              background: showFilters ? 'rgba(0,229,153,0.10)' : 'var(--app-bg-subtle)',
              border: `1px solid ${showFilters ? 'rgba(0,229,153,0.25)' : 'rgba(255,255,255,0.08)'}`,
              color: showFilters ? '#00E599' : 'var(--text-secondary)',
            }}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              {
                label: 'Severity',
                value: filterSeverity,
                onChange: setFilterSeverity,
                options: [
                  { value: '', label: 'All Severities' },
                  { value: 'critical', label: 'Critical' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                  { value: 'info', label: 'Info' },
                ],
              },
              {
                label: 'Scope',
                value: filterScope,
                onChange: setFilterScope,
                options: [
                  { value: '', label: 'All Scopes' },
                  { value: 'global', label: 'Global' },
                  { value: 'project', label: 'Project' },
                  { value: 'connector', label: 'Connector' },
                ],
              },
              {
                label: 'Status',
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: '', label: 'All Statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'archived', label: 'Archived' },
                ],
              },
            ].map(({ label, value, onChange, options }) => (
              <div key={label} className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <select
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: 'var(--app-bg-subtle)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#1a1d24' }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex items-end pb-0.5">
              <button
                onClick={() => { setFilterSeverity(''); setFilterScope(''); setFilterStatus(''); setSearch(''); }}
                className="text-xs px-3 py-1.5 rounded-xl transition-all duration-150"
                style={{ color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No health rules found"
          description="Create configurable rules to influence health scoring and status determination"
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => { setEditingRule(undefined); setBuilderOpen(true); }}
            >
              Create First Rule
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedRules).map(([severity, severityRules]) => (
            <div key={severity}>
              <div className="flex items-center gap-2 mb-3">
                <SeverityBadge severity={severity} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {severityRules.length} rule{severityRules.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {severityRules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onEdit={(r) => { setEditingRule(r); setBuilderOpen(true); }}
                    onTest={(r) => { setTestingRule(r); setTestModalOpen(true); }}
                    onToggle={handleToggle}
                    onDelete={setDeleteTarget}
                    toggling={togglingId === rule.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RuleBuilderModal
        open={builderOpen}
        onClose={() => { setBuilderOpen(false); setEditingRule(undefined); }}
        onSaved={fetchRules}
        editingRule={editingRule}
        metadata={metadata}
      />

      <RuleTestModal
        open={testModalOpen}
        onClose={() => { setTestModalOpen(false); setTestingRule(undefined); }}
        rule={testingRule}
        metadata={metadata}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Archive Rule"
        message={`Are you sure you want to archive "${deleteTarget?.name}"? It will no longer evaluate during health runs.`}
        confirmLabel="Archive"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
