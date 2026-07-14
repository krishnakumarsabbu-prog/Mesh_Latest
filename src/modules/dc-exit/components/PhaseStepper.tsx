/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * PhaseStepper - horizontal phase navigation showing the five
 * workflow phases (Discover → Analyze → Decide → Execute → Validate)
 * with completion state, active highlight, and click-to-navigate.
 *
 * Enterprise, minimal style. No gradients.
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DC_EXIT_PHASES, type DcExitStepId } from '@/modules/dc-exit/types';

interface PhaseStepperProps {
  currentStep: DcExitStepId;
  completedSteps?: DcExitStepId[];
  className?: string;
}

export function PhaseStepper({ currentStep, completedSteps = [], className }: PhaseStepperProps) {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const completedSet = new Set(completedSteps);

  return (
    <div
      className={cn('flex items-stretch w-full', className)}
      role="tablist"
      aria-label="Workflow phases"
    >
      {DC_EXIT_PHASES.map((phase, idx) => {
        const isComplete = completedSet.has(phase.id);
        const isActive = currentStep === phase.id;
        const isLast = idx === DC_EXIT_PHASES.length - 1;
        const Icon = phase.icon;

        const stateStyles: React.CSSProperties = isActive
          ? { background: 'var(--accent)', color: '#FFFFFF', borderColor: 'var(--accent)' }
          : isComplete
          ? { background: 'rgba(0,176,116,0.08)', color: '#00B074', borderColor: 'rgba(0,176,116,0.22)' }
          : { background: 'var(--app-bg-subtle)', color: 'var(--text-muted)', borderColor: 'var(--app-border)' };

        const handleNavigate = () => {
          if (sessionId) navigate(`/dc-exit/${sessionId}/${phase.path}`);
        };

        return (
          <React.Fragment key={phase.id}>
            <button
              role="tab"
              aria-selected={isActive}
              aria-controls={`phase-panel-${phase.id}`}
              onClick={handleNavigate}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 rounded-[6px] transition-all duration-150',
                'focus:outline-none focus-visible:ring-2',
              )}
              style={{ border: '1px solid', ...stateStyles, flex: '1 1 0%', minWidth: 0 }}
              onMouseEnter={(e) => {
                if (!isActive && !isComplete) {
                  e.currentTarget.style.borderColor = 'var(--app-border-strong)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive && !isComplete) {
                  e.currentTarget.style.borderColor = 'var(--app-border)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }
              }}
            >
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 text-[11px] font-bold"
                style={{
                  background: isActive
                    ? 'rgba(255,255,255,0.20)'
                    : isComplete
                    ? 'rgba(0,176,116,0.12)'
                    : 'var(--app-surface)',
                  color: isActive ? '#FFFFFF' : isComplete ? '#00B074' : 'var(--text-muted)',
                }}
              >
                {isComplete ? <Check className="w-3 h-3" strokeWidth={2.5} /> : phase.shortLabel}
              </span>
              <span className="flex flex-col items-start min-w-0">
                <span className="text-[12px] font-semibold leading-tight truncate">{phase.label}</span>
                <span
                  className="text-[10px] leading-tight truncate hidden sm:block"
                  style={{ opacity: isActive ? 0.8 : 0.7 }}
                >
                  {phase.description}
                </span>
              </span>
            </button>

            {!isLast && (
              <div
                className="flex items-center flex-shrink-0 w-6 sm:w-8"
                aria-hidden="true"
              >
                <div
                  className="h-px w-full"
                  style={{
                    background: isComplete ? '#00B074' : 'var(--app-border)',
                    opacity: isComplete ? 0.5 : 1,
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
