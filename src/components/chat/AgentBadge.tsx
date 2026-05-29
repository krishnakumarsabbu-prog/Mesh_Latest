import React from 'react';
import { cn } from '@/lib/utils';

const AGENT_META: Record<string, { label: string; color: string; bg: string }> = {
  appdynamics:  { label: 'AppDynamics', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  'ibm-mq':     { label: 'IBM MQ',      color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  openshift:    { label: 'OpenShift',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  mongodb:      { label: 'MongoDB',     color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  splunk:       { label: 'Splunk',      color: '#06B6D4', bg: 'rgba(6,182,212,0.12)'  },
};

interface AgentBadgeProps {
  slug: string;
  animated?: boolean;
}

export function AgentBadge({ slug, animated = true }: AgentBadgeProps) {
  const meta = AGENT_META[slug] ?? { label: slug, color: '#6B7280', bg: 'rgba(107,114,128,0.12)' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold',
        'border transition-all duration-300',
        animated && 'animate-fade-in'
      )}
      style={{
        color: meta.color,
        background: meta.bg,
        borderColor: meta.color + '40',
      }}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', animated && 'animate-pulse')}
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}
