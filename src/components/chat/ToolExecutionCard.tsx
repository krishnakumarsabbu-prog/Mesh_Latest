import React, { useState } from 'react';
import { CircleCheck as CheckCircle2, Circle as XCircle, Loader as Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolTrace } from '@/types';

export type { ToolTrace };

interface ToolExecutionCardProps {
  trace: ToolTrace;
}

function StatusIcon({ status }: { status: ToolTrace['status'] }) {
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#3B82F6' }} />;
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />;
  return <XCircle className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />;
}

function tryPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolExecutionCard({ trace }: ToolExecutionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasDetail = trace.status !== 'running' && (trace.result !== undefined || trace.error);

  return (
    <div
      className="rounded-lg overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--app-bg-subtle)',
        border: '1px solid var(--app-border)',
      }}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => hasDetail && setExpanded(v => !v)}
        disabled={!hasDetail}
      >
        <StatusIcon status={trace.status} />

        <span className="flex-1 text-xs font-mono font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>{trace.agent}.</span>
          {trace.tool}
        </span>

        {trace.duration_ms !== undefined && (
          <span className="text-[10px] flex-shrink-0 mr-1" style={{ color: 'var(--text-muted)' }}>
            {trace.duration_ms}ms
          </span>
        )}

        {hasDetail && (
          expanded
            ? <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        )}
      </button>

      {expanded && hasDetail && (
        <div
          className="px-3 pb-2.5 space-y-1.5"
          style={{ borderTop: '1px solid var(--app-border)' }}
        >
          {Object.keys(trace.args).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Args</p>
              <pre className="text-[11px] rounded p-1.5 overflow-x-auto" style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
                {tryPretty(trace.args)}
              </pre>
            </div>
          )}
          {trace.status === 'success' && trace.result !== undefined && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>Result</p>
              <pre className="text-[11px] rounded p-1.5 overflow-x-auto" style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
                {tryPretty(trace.result)}
              </pre>
            </div>
          )}
          {trace.status === 'error' && trace.error && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#EF4444' }}>Error</p>
              <p className="text-[11px]" style={{ color: '#EF4444' }}>{trace.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
