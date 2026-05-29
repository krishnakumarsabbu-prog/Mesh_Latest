import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  description?: string;
  checked?: boolean;
}

interface DropdownProps {
  trigger: React.ReactElement;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
  width?: string;
}

export function Dropdown({ trigger, items, align = 'left', className, width = 'min-w-[180px]' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  return (
    <div ref={ref} className="relative inline-flex">
      {React.cloneElement(trigger, { onClick: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'absolute top-full z-50 mt-2 py-1.5 rounded-2xl border overflow-hidden',
            'animate-dropdown-in',
            width,
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
          style={{
            background: 'var(--app-surface-raised)',
            borderColor: 'var(--app-border)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          {items.map((item, i) => {
            if (item.divider) {
              return (
                <div
                  key={`divider-${i}`}
                  className="my-1.5 mx-3"
                  style={{ borderTop: '1px solid var(--app-border)' }}
                />
              );
            }
            return (
              <button
                key={item.label}
                disabled={item.disabled}
                onClick={() => { item.onClick?.(); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-sm transition-all duration-100 text-left group',
                  'hm-dropdown-item',
                  item.danger && 'hm-dropdown-item-danger',
                  item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                )}
              >
                {item.icon && (
                  <span
                    className={cn(
                      'flex-shrink-0 transition-colors duration-100',
                      item.danger ? 'hm-dropdown-icon-danger' : 'hm-dropdown-icon',
                    )}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block font-medium leading-tight">{item.label}</span>
                  {item.description && (
                    <span
                      className="block text-xs mt-0.5 font-normal leading-tight"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {item.description}
                    </span>
                  )}
                </span>
                {item.checked && (
                  <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
