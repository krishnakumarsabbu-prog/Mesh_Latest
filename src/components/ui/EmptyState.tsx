import React from 'react';
import { cn } from '@/lib/utils';
import type { LucideProps } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ComponentType<LucideProps>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-10 px-6' : 'py-20 px-8',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'rounded-2xl flex items-center justify-center mb-4 transition-transform duration-200 hover:scale-105',
            compact ? 'w-10 h-10' : 'w-14 h-14',
          )}
          style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)' }}
        >
          <Icon
            className={cn(compact ? 'w-5 h-5' : 'w-6 h-6')}
            style={{ color: 'var(--text-muted)' }}
            strokeWidth={1.5}
          />
        </div>
      )}
      <p
        className={cn('font-semibold tracking-tight', compact ? 'text-sm' : 'text-base')}
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn('mt-1.5 max-w-xs leading-relaxed', compact ? 'text-xs' : 'text-sm')}
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
