import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentBadge } from './AgentBadge';
import { ToolExecutionCard, ToolTrace } from './ToolExecutionCard';

interface AgentTracePanelProps {
  activeAgents: string[];
  traces: ToolTrace[];
  isRunning: boolean;
}

export function AgentTracePanel({ activeAgents, traces, isRunning }: AgentTracePanelProps) {
  const [open, setOpen] = useState(false);

  if (activeAgents.length === 0 && traces.length === 0) return null;

  const runningCount = traces.filter(t => t.status === 'running').length;
  const doneCount = traces.filter(t => t.status !== 'running').length;

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden animate-fade-in"
      style={{
        background: 'var(--app-bg-subtle)',
        border: '1px solid var(--app-border)',
      }}
    >
      {/* Header row — agent badges + toggle */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <Cpu className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />

        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {activeAgents.map(slug => (
            <AgentBadge key={slug} slug={slug} animated={isRunning} />
          ))}
        </div>

        <span className="text-[11px] flex-shrink-0 mr-1" style={{ color: 'var(--text-muted)' }}>
          {isRunning && runningCount > 0
            ? `${runningCount} running…`
            : `${doneCount} tool${doneCount !== 1 ? 's' : ''}`}
        </span>

        {open
          ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        }
      </button>

      {open && traces.length > 0 && (
        <div
          className="px-3 pb-3 space-y-1.5"
          style={{ borderTop: '1px solid var(--app-border)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide pt-2 pb-0.5" style={{ color: 'var(--text-muted)' }}>
            Agent Execution Trace
          </p>
          {traces.map(trace => (
            <ToolExecutionCard key={trace.id} trace={trace} />
          ))}
        </div>
      )}
    </div>
  );
}
