/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * AnalyzeTabBar — segmented control for switching between the
 * Analyze step tabs (Impact Analysis, Dependencies, Business
 * Impact). Enterprise minimal style consistent with the module.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface AnalyzeTabDef {
  id: string;
  label: string;
}

interface AnalyzeTabBarProps {
  tabs: AnalyzeTabDef[];
  active: string;
  onChange: (id: string) => void;
}

export function AnalyzeTabBar({ tabs, active, onChange }: AnalyzeTabBarProps) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-[8px]"
      style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-[6px] text-[12px] font-semibold transition-all duration-150 select-none',
            )}
            style={{
              background: isActive ? 'var(--app-surface)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              border: isActive ? '1px solid var(--app-border)' : '1px solid transparent',
              boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
