/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Breadcrumb for the dc-exit workflow. Renders the module
 * trail: Enterprise  /  DC Exit  /  <Session>  /  <Phase>
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DcExitCrumb {
  label: string;
  href?: string;
}

interface DcExitBreadcrumbProps {
  items: DcExitCrumb[];
  className?: string;
}

export function DcExitBreadcrumb({ items, className }: DcExitBreadcrumbProps) {
  if (!items.length) return null;

  return (
    <nav className="flex items-center gap-0.5 text-[11px]" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRight
                className="w-2.5 h-2.5 flex-shrink-0 mx-0.5"
                style={{ color: 'var(--text-disabled)' }}
              />
            )}
            {item.href && !isLast ? (
              <Link
                to={item.href}
                className="transition-colors truncate max-w-[120px] hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="font-medium truncate max-w-[160px]"
                style={{ color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
