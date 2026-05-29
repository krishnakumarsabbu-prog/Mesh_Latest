import React from 'react';
import { ExternalLink, Lock, Settings2, ToggleLeft, ToggleRight, Trash2, FlaskConical } from 'lucide-react';
import { ConnectorCatalogEntry } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { CatalogConnectorIcon } from './CatalogConnectorIcon';

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

interface CatalogConnectorCardProps {
  entry: ConnectorCatalogEntry;
  canManage: boolean;
  onToggle: (entry: ConnectorCatalogEntry) => void;
  onEdit: (entry: ConnectorCatalogEntry) => void;
  onTest: (entry: ConnectorCatalogEntry) => void;
  onDelete: (entry: ConnectorCatalogEntry) => void;
}

export function CatalogConnectorCard({
  entry,
  canManage,
  onToggle,
  onEdit,
  onTest,
  onDelete,
}: CatalogConnectorCardProps) {
  const tags = entry.tags ? entry.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const color = entry.color || '#2563EB';

  return (
    <div
      className={cn(
        'rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-0.5',
        !entry.is_enabled && 'opacity-60 grayscale-[30%]',
      )}
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CatalogConnectorIcon icon={entry.icon} color={color} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{entry.name}</h3>
              {entry.is_system && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)]">
                  <Lock className="w-2.5 h-2.5" />
                  System
                </span>
              )}
            </div>
            {entry.vendor && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{entry.vendor}{entry.version ? ` · v${entry.version}` : ''}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant={entry.is_enabled ? 'active' : 'inactive'} dot size="xs">
            {entry.is_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </div>

      {entry.description && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">{entry.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide border"
          style={{ background: `${color}12`, color: color, borderColor: `${color}30` }}>
          {CATEGORY_LABELS[entry.category] || entry.category}
        </span>
        {tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--app-surface-hover)] text-[var(--text-secondary)] border border-[var(--app-border)]">
            {tag}
          </span>
        ))}
        {tags.length > 3 && (
          <span className="text-[10px] text-[var(--text-muted)]">+{tags.length - 3}</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[var(--app-border)]">
        <div className="flex items-center gap-1">
          {canManage && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(entry); }}
                className="p-1.5 rounded-lg transition-all text-xs flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)]"
                title={entry.is_enabled ? 'Disable connector' : 'Enable connector'}
              >
                {entry.is_enabled ? (
                  <ToggleRight className="w-4 h-4" style={{ color }} />
                ) : (
                  <ToggleLeft className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)] transition-all"
                title="Edit connector"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              {!entry.is_system && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(entry); }}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--app-surface-hover)] transition-all"
                  title="Delete connector"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onTest(entry); }}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-emerald-500 hover:bg-[var(--app-surface-hover)] transition-all"
            title="Test connector"
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {entry.docs_url && (
            <a
              href={entry.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)] transition-all"
              title="View documentation"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
