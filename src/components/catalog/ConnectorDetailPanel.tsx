import React, { useState } from 'react';
import { ConnectorCatalogEntry } from '@/types';
import { CatalogConnectorIcon } from './CatalogConnectorIcon';
import { MetricTemplateManager } from './MetricTemplateManager';
import { Badge } from '@/components/ui/Badge';
import {
  X,
  ExternalLink,
  Lock,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  FlaskConical,
  Activity,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

type TabId = 'overview' | 'metrics';

const CATEGORY_LABELS: Record<string, string> = {
  observability: 'Observability',
  apm: 'APM',
  itsm: 'ITSM',
  database: 'Database',
  messaging: 'Messaging',
  cloud: 'Cloud & Containers',
  infrastructure: 'Infrastructure',
  custom: 'Custom',
};

interface ConnectorDetailPanelProps {
  entry: ConnectorCatalogEntry;
  canManage: boolean;
  onClose: () => void;
  onToggle: (entry: ConnectorCatalogEntry) => void;
  onEdit: (entry: ConnectorCatalogEntry) => void;
  onTest: (entry: ConnectorCatalogEntry) => void;
  onDelete: (entry: ConnectorCatalogEntry) => void;
}

export function ConnectorDetailPanel({
  entry,
  canManage,
  onClose,
  onToggle,
  onEdit,
  onTest,
  onDelete,
}: ConnectorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tags = entry.tags ? entry.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Fixed header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-3 p-5 pb-0 border-b border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="flex items-center gap-3 min-w-0 pb-4">
          <CatalogConnectorIcon icon={entry.icon} color={entry.color || '#2563EB'} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate">{entry.name}</h3>
              {entry.is_system && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)] flex-shrink-0">
                  <Lock className="w-2.5 h-2.5" />System
                </span>
              )}
            </div>
            {entry.vendor && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {entry.vendor}{entry.version ? ` · v${entry.version}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          <Badge variant={entry.is_enabled ? 'active' : 'inactive'} dot size="xs">
            {entry.is_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)] transition-all"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-5 pt-0 border-b border-[var(--app-border)] bg-[var(--app-surface)]">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<Info className="w-3.5 h-3.5" />}>
          Overview
        </TabButton>
        <TabButton active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')} icon={<Activity className="w-3.5 h-3.5" />}>
          Metric Templates
        </TabButton>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-5">
          {activeTab === 'overview' && (
            <OverviewTab
              entry={entry}
              tags={tags}
              canManage={canManage}
              onToggle={onToggle}
              onEdit={onEdit}
              onTest={onTest}
              onDelete={onDelete}
            />
          )}
          {activeTab === 'metrics' && (
            <MetricTemplateManager entry={entry} canManage={canManage} />
          )}
        </div>
      </div>

      {/* Fixed footer with action buttons - always visible */}
      <div className="flex-shrink-0 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<FlaskConical className="w-3.5 h-3.5" />}
            onClick={() => onTest(entry)}
          >
            Test Connection
          </Button>
          {canManage && (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon={<Settings2 className="w-3.5 h-3.5" />}
                onClick={() => onEdit(entry)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onToggle(entry)}
                icon={entry.is_enabled ? <ToggleRight className="w-3.5 h-3.5 text-[var(--primary-color)]" /> : <ToggleLeft className="w-3.5 h-3.5" />}
              >
                {entry.is_enabled ? 'Disable' : 'Enable'}
              </Button>
              {!entry.is_system && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => onDelete(entry)}
                >
                  Delete
                </Button>
              )}
            </>
          )}
          {entry.docs_url && (
            <a
              href={entry.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-xs text-[var(--primary-color)] hover:text-[var(--primary-color)] transition-colors font-semibold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Docs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all ${
        active
          ? 'text-[var(--primary-color)] border-[var(--primary-color)] bg-[var(--app-surface-active)]'
          : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function OverviewTab({
  entry,
  tags,
  canManage: _canManage,
  onToggle: _onToggle,
  onEdit: _onEdit,
  onTest: _onTest,
  onDelete: _onDelete,
}: {
  entry: ConnectorCatalogEntry;
  tags: string[];
  canManage: boolean;
  onToggle: (entry: ConnectorCatalogEntry) => void;
  onEdit: (entry: ConnectorCatalogEntry) => void;
  onTest: (entry: ConnectorCatalogEntry) => void;
  onDelete: (entry: ConnectorCatalogEntry) => void;
 }) {
  return (
    <div className="space-y-5">
      {entry.description && (
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{entry.description}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Details</p>
        <div className="bg-[var(--app-bg-muted)] rounded-xl border border-[var(--app-border)] divide-y divide-[var(--app-border)]">
          <DetailRow label="Slug" value={entry.slug} mono />
          <DetailRow label="Category" value={CATEGORY_LABELS[entry.category] || entry.category} />
          {entry.vendor && <DetailRow label="Vendor" value={entry.vendor} />}
          {entry.version && <DetailRow label="Version" value={entry.version} />}
          <DetailRow label="Status" value={entry.status} />
          <DetailRow label="Type" value={entry.is_system ? 'System Built-in' : 'Custom'} />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-[var(--app-surface-hover)] text-[var(--text-secondary)] border border-[var(--app-border)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {entry.config_schema && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Config Schema Fields</p>
          <div className="bg-[var(--app-bg-muted)] rounded-xl border border-[var(--app-border)] divide-y divide-[var(--app-border)]">
            {Object.entries(
              (entry.config_schema as { properties?: Record<string, { title?: string; type?: string; secret?: boolean }> }).properties || {}
            ).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-mono text-[var(--text-secondary)]">{key}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--text-muted)]">{val.type || 'string'}</span>
                  {val.secret && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/12 text-amber-500 border border-amber-500/30">
                      secret
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!entry.test_definition?.description && (
        <div className="p-3 rounded-xl bg-[var(--app-surface-active)] border border-[var(--app-border)]">
          <p className="text-xs text-[var(--text-primary)] font-medium">
            Test: {String(entry.test_definition.description)}
          </p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-[var(--text-secondary)] font-medium">{label}</span>
      <span className={`text-xs font-semibold text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
