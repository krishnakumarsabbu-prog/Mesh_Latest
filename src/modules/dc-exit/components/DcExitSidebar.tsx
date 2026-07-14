/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * DcExitSidebar - a fixed left rail scoped to the dc-exit workflow.
 * Shows the module identity and the five phase links with active
 * and completion states. Mirrors the global sidebar's dark-navy
 * aesthetic and compact typography.
 */

import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Eye, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { DC_EXIT_PHASES, type DcExitStepId } from '@/modules/dc-exit/types';

interface DcExitSidebarProps {
  currentStep: DcExitStepId;
  completedSteps?: DcExitStepId[];
}

export function DcExitSidebar({ currentStep, completedSteps = [] }: DcExitSidebarProps) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const completedSet = new Set(completedSteps);

  return (
    <aside
      className="flex flex-col w-[220px] flex-shrink-0 h-full app-sidebar"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* Logo / module identity */}
      <div
        className="flex items-center h-[52px] flex-shrink-0 px-3 border-b"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <div
          className="w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0"
          style={{ background: '#006CFF' }}
        >
          <Eye className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0 ml-2 overflow-hidden">
          <p
            className="text-[12px] font-bold tracking-tight leading-tight truncate"
            style={{ color: 'var(--sidebar-logo-text)', letterSpacing: '-0.02em' }}
          >
            DC Exit
          </p>
          <p
            className="text-[9px] font-semibold tracking-[0.08em] uppercase leading-tight"
            style={{ color: 'var(--sidebar-text-muted)' }}
          >
            Digital Twin
          </p>
        </div>
      </div>

      {/* Session label */}
      {sessionId && (
        <div
          className="px-3 pt-3 pb-1.5 flex-shrink-0"
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.10em] mb-1"
            style={{ color: 'var(--sidebar-section-label)' }}
          >
            Session
          </p>
          <p
            className="text-[11.5px] font-semibold truncate font-mono"
            style={{ color: 'var(--sidebar-text)' }}
          >
            {sessionId}
          </p>
        </div>
      )}

      {/* Phase navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-2 py-2.5">
        <p
          className="text-[9.5px] font-bold uppercase tracking-[0.10em] px-2.5 mb-1 mt-0.5"
          style={{ color: 'var(--sidebar-section-label)' }}
        >
          Phases
        </p>
        <div className="space-y-px">
          {DC_EXIT_PHASES.map((phase) => {
            const isActive = currentStep === phase.id;
            const isComplete = completedSet.has(phase.id);
            const Icon = phase.icon;
            return (
              <NavLink
                key={phase.id}
                to={`/dc-exit/${sessionId ?? ''}/${phase.path}`}
                className={cn('sidebar-item group', isActive && 'active')}
              >
                <Icon className="flex-shrink-0 w-[15px] h-[15px]" strokeWidth={1.8} />
                <span className="flex-1 truncate">{phase.label}</span>
                {isComplete && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: '#00B074' }}
                    aria-label="complete"
                  />
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Back to app */}
      <div
        className="px-2 pb-2.5 pt-2 flex-shrink-0 border-t"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <Link
          to="/runtime-location"
          className="flex items-center gap-2 px-2.5 py-2 rounded-[6px] text-[11.5px] font-medium transition-all"
          style={{ color: 'var(--sidebar-text)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--sidebar-item-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '';
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Runtime
        </Link>
      </div>
    </aside>
  );
}
