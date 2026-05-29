import React, { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, TriangleAlert as AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, subtitle, size = 'md', footer, children, noPadding = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const hasAutoFocused = useRef(false);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKey);
      if (!hasAutoFocused.current) {
        hasAutoFocused.current = true;
        setTimeout(() => {
          const focusable = dialogRef.current?.querySelector<HTMLElement>(
            'input, button, textarea, select, [tabindex]:not([tabindex="-1"])'
          );
          focusable?.focus();
        }, 80);
      }
    } else {
      document.body.style.overflow = '';
      hasAutoFocused.current = false;
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, handleKey]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 modal-backdrop animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full rounded-3xl flex flex-col animate-modal-enter',
          sizes[size],
        )}
        style={{
          background: 'var(--app-surface-raised)',
          boxShadow: 'var(--shadow-modal)',
          border: '1px solid var(--app-border)',
          maxHeight: 'calc(100vh - 2rem)',
        }}
      >
        {(title || subtitle) && (
          <div
            className="flex items-start justify-between px-6 py-5 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--app-border)' }}
          >
            <div className="flex-1 min-w-0 pr-4">
              {title && (
                <h2
                  className="text-base font-bold tracking-tight leading-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-xl transition-all duration-150 focus-ring"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-muted)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              }}
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className={cn('flex-1 overflow-y-auto', noPadding ? '' : 'px-6 py-5')}>
          {children}
        </div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2.5 px-6 py-4 flex-shrink-0"
            style={{
              borderTop: '1px solid var(--app-border)',
              background: 'var(--app-bg-subtle)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'Confirm', variant = 'primary', loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} size="sm">Cancel</Button>
          <Button variant={variant} onClick={onConfirm} loading={loading} size="sm">{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-4">
        {variant === 'danger' && (
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--danger-subtle)' }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--danger)' }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>
        </div>
      </div>
    </Modal>
  );
}
