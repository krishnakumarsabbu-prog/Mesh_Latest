import React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'healthy' | 'degraded' | 'down' | 'unknown' | 'active' | 'inactive' | 'maintenance' | 'info' | 'default' | 'warning';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
}

/* Harness.io pipeline status signal colors */
const variantStyleMap: Record<BadgeVariant, React.CSSProperties> = {
  healthy:     { background: 'rgba(0,176,116,0.08)',   color: '#00B074', border: '1px solid rgba(0,176,116,0.22)' },
  degraded:    { background: 'rgba(255,177,0,0.08)',   color: '#FFB100', border: '1px solid rgba(255,177,0,0.22)' },
  down:        { background: 'rgba(255,0,60,0.08)',    color: '#FF003C', border: '1px solid rgba(255,0,60,0.22)' },
  unknown:     { background: 'rgba(107,122,141,0.08)', color: '#8A97A8', border: '1px solid rgba(107,122,141,0.18)' },
  active:      { background: 'rgba(0,108,255,0.08)',   color: '#006CFF', border: '1px solid rgba(0,108,255,0.22)' },
  inactive:    { background: 'rgba(107,122,141,0.07)', color: '#8A97A8', border: '1px solid rgba(107,122,141,0.15)' },
  maintenance: { background: 'rgba(255,177,0,0.08)',   color: '#FFB100', border: '1px solid rgba(255,177,0,0.22)' },
  info:        { background: 'rgba(120,0,255,0.08)',   color: '#7800FF', border: '1px solid rgba(120,0,255,0.22)' },
  default:     { background: 'var(--app-bg-subtle)',   color: 'var(--text-secondary)', border: '1px solid var(--app-border)' },
  warning:     { background: 'rgba(255,177,0,0.08)',   color: '#FFB100', border: '1px solid rgba(255,177,0,0.22)' },
};

const dotColorMap: Record<BadgeVariant, string> = {
  healthy:     '#00B074',
  degraded:    '#FFB100',
  down:        '#FF003C',
  unknown:     '#8A97A8',
  active:      '#006CFF',
  inactive:    '#8A97A8',
  maintenance: '#FFB100',
  info:        '#7800FF',
  default:     '#8A97A8',
  warning:     '#FFB100',
};

export function Badge({ variant = 'default', size = 'sm', dot = false, pulse = false, className, style, children, ...props }: BadgeProps) {
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-1 text-[12px] gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-[4px] transition-all duration-100',
        'font-mono',
        sizes[size],
        className
      )}
      style={{ ...variantStyleMap[variant], ...style }}
      {...props}
    >
      {dot && (
        <span className="relative flex-shrink-0 flex items-center justify-center" style={{ width: '6px', height: '6px' }}>
          {pulse && (
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-60"
              style={{ background: dotColorMap[variant] + '50', animationDuration: '2s' }}
            />
          )}
          <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: dotColorMap[variant] }} />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status, pulse: pulseProp, ...props }: { status: string; pulse?: boolean } & Omit<BadgeProps, 'variant'>) {
  const map: Record<string, BadgeVariant> = {
    healthy: 'healthy',
    degraded: 'degraded',
    down: 'down',
    timeout: 'down',
    error: 'down',
    active: 'active',
    inactive: 'inactive',
    maintenance: 'maintenance',
    unknown: 'unknown',
    archived: 'unknown',
  };
  const variant = map[status.toLowerCase()] || 'default';
  const shouldPulse = pulseProp ?? (variant === 'healthy' || variant === 'degraded' || variant === 'down');
  return (
    <Badge variant={variant} dot pulse={shouldPulse} {...props}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
