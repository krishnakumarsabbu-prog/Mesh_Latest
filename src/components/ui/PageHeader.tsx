import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, className, badge }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h2
            className="text-xl font-bold tracking-tight leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && (
          <p
            className="text-sm mt-0.5 leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
