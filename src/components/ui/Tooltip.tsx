import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: TooltipPlacement;
  delay?: number;
  className?: string;
}

const placementStyles: Record<TooltipPlacement, { tooltip: string; arrow: string }> = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 hm-tooltip-arrow-top',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 hm-tooltip-arrow-bottom',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 hm-tooltip-arrow-left',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 hm-tooltip-arrow-right',
  },
};

export function Tooltip({ content, children, placement = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function show() {
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }

  function hide() {
    clearTimeout(timerRef.current);
    setVisible(false);
  }

  const p = placementStyles[placement];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-50 pointer-events-none animate-fade-in',
            p.tooltip,
            className,
          )}
        >
          <div
            className="hm-tooltip text-[11px] font-medium px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-xl leading-tight"
          >
            {content}
          </div>
          <div className={cn('absolute w-0 h-0 border-4', p.arrow)} />
        </div>
      )}
    </div>
  );
}
