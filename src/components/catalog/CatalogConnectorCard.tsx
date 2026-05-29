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

  return (
    <div
      className={cn(
        'glass-card rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200',
        'hover:shadow-card-hover hover:-translate-y-0.5',
        !entry.is_enabled && 'opacity-60 grayscale-[30%]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CatalogConnectorIcon icon={entry.icon} color={entry.color || '#2563EB'} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-neutral-900 truncate">{entry.name}</h3>
              {entry.is_system && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 border border-neutral-200">
                  <Lock className="w-2.5 h-2.5" />
                  System
                </span>
              )}
            </div>
            {entry.vendor && (
              <p className="text-xs text-neutral-400 mt-0.5">{entry.vendor}{entry.version ? ` · v${entry.version}` : ''}</p>
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
        <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">{entry.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 uppercase tracking-wide border border-neutral-200">
          {CATEGORY_LABELS[entry.category] || entry.category}
        </span>
        {tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-50 text-neutral-400 border border-neutral-100">
            {tag}
          </span>
        ))}
        {tags.length > 3 && (
          <span className="text-[10px] text-neutral-400">+{tags.length - 3}</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
        <div className="flex items-center gap-1">
          {canManage && (
            <>
              <button
                onClick={() => onToggle(entry)}
                className={cn(
                  'p-1.5 rounded-lg transition-all text-xs flex items-center gap-1',
                  entry.is_enabled
                    ? 'text-neutral-400 hover:text-amber-500 hover:bg-amber-50'
                    : 'text-neutral-400 hover:text-success hover:bg-success-50'
                )}
                title={entry.is_enabled ? 'Disable connector' : 'Enable connector'}
              >
                {entry.is_enabled ? (
                  <ToggleRight className="w-4 h-4 text-primary-500" />
                ) : (
                  <ToggleLeft className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => onEdit(entry)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                title="Edit connector"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              {!entry.is_system && (
                <button
                  onClick={() => onDelete(entry)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-500 hover:bg-danger-50 transition-all"
                  title="Delete connector"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
          <button
            onClick={() => onTest(entry)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-success hover:bg-success-50 transition-all"
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
              className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
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
