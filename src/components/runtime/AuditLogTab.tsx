import React from 'react';
import { ClipboardList, Upload, GitBranch, TriangleAlert as AlertTriangle, Target, Zap, FileText, Database } from 'lucide-react';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import type { AuditEventType, AuditLogEntry } from '@/types';

const EVENT_CONFIG: Record<AuditEventType, { icon: React.ElementType; color: string; bg: string }> = {
  IMPORT:             { icon: Upload,       color: '#0A84FF', bg: 'rgba(10,132,255,0.12)' },
  STATE_CHANGE:       { icon: GitBranch,    color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)' },
  CONFLICT_DETECTED:  { icon: AlertTriangle,color: '#FF453A', bg: 'rgba(255,69,58,0.12)'  },
  INTENT_CREATED:     { icon: Target,       color: '#30D158', bg: 'rgba(48,209,88,0.12)'  },
  INTENT_UPDATED:     { icon: Target,       color: '#0A84FF', bg: 'rgba(10,132,255,0.12)' },
  DRIFT_DETECTED:     { icon: Zap,          color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)' },
  PROPOSAL_SUBMITTED: { icon: FileText,     color: '#64D2FF', bg: 'rgba(100,210,255,0.12)'},
  SEED_LOADED:        { icon: Database,     color: '#30D158', bg: 'rgba(48,209,88,0.12)'  },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const cfg = EVENT_CONFIG[entry.event_type] ?? { icon: ClipboardList, color: '#8E8E93', bg: 'rgba(142,142,147,0.1)' };
  const Icon = cfg.icon;
  return (
    <tr style={{ borderBottom: '1px solid var(--app-border)' }}>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg }}
          >
            <Icon className="w-3 h-3" style={{ color: cfg.color }} />
          </div>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {entry.event_type.replace(/_/g, ' ')}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{entry.description}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{entry.actor}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          {formatTime(entry.occurred_at)}
        </span>
      </td>
    </tr>
  );
}

export function AuditLogTab() {
  const { auditLog } = useRuntimeLocationStore();

  if (auditLog.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <ClipboardList className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          No audit events yet
        </p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Import data or define intent to see audit entries
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
          Audit Log
        </p>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(10,132,255,0.1)', color: '#0A84FF' }}
        >
          {auditLog.length} events
        </span>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--app-surface)' }}>
              {['Event', 'Description', 'Actor', 'Time'].map((h) => (
                <th key={h}
                  className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {auditLog.map((entry) => <AuditRow key={entry.id} entry={entry} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
