import React from 'react';
import { cn } from '@/lib/utils';
import { Loader as Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const sizes = {
    xs: 'px-2 py-1 text-[11px] gap-1 rounded-[4px]',
    sm: 'px-2.5 py-1.5 text-[12px] gap-1.5 rounded-[4px]',
    md: 'px-3 py-1.5 text-[12.5px] gap-1.5 rounded-[6px]',
    lg: 'px-4 py-2 text-[13px] gap-2 rounded-[6px]',
  };

  const variantClass =
    variant === 'primary' || variant === 'success'
      ? 'hm-btn-primary'
      : variant === 'secondary'
      ? 'hm-btn-secondary'
      : variant === 'ghost'
      ? 'hm-btn-ghost'
      : variant === 'danger'
      ? 'hm-btn-danger'
      : '';

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-100',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'focus:outline-none hm-btn-focus',
        sizes[size],
        variantClass,
        className
      )}
      style={style}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn('animate-spin', size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
      {!loading && iconRight && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  );
}
