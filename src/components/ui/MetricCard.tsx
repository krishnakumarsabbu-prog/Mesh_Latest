import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideProps } from 'lucide-react';

type IconComponent = React.ComponentType<LucideProps>;

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: IconComponent;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label: string };
  className?: string;
  accent?: string;
  glowColor?: string;
  animate?: boolean;
}

function useAnimatedCounter(target: number, duration = 900, enabled = true) {
  const [count, setCount] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || target === 0) { setCount(target); return; }
    startRef.current = null;

    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(ease * target));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, enabled]);

  return count;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
  className,
  accent,
  glowColor,
  animate = true,
}: MetricCardProps) {
  const isNumeric = typeof value === 'number';
  const animated = useAnimatedCounter(isNumeric ? (value as number) : 0, 900, isNumeric && animate);
  const displayValue = isNumeric ? animated : value;
  const isPositive = trend && trend.value >= 0;

  return (
    <div
      className={cn('metric-card group relative overflow-hidden', className)}
      style={glowColor ? { '--glow': glowColor } as React.CSSProperties : undefined}
    >
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
          style={{ background: accent }}
        />
      )}

      {accent && (
        <div
          className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)` }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.1em] mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </p>
          <p
            className="text-[28px] font-bold tracking-tight leading-none tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {displayValue}
          </p>
          {subtitle && (
            <p
              className="text-[12px] mt-1.5 leading-snug"
              style={{ color: 'var(--text-muted)' }}
            >
              {subtitle}
            </p>
          )}
          {trend && (
            <div
              className="inline-flex items-center gap-1 mt-2.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: isPositive ? 'rgba(0,229,153,0.12)' : 'rgba(239,68,68,0.10)',
                color: isPositive ? '#00E599' : '#EF4444',
              }}
            >
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{Math.abs(trend.value)}%</span>
              <span className="font-normal hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                {trend.label}
              </span>
            </div>
          )}
        </div>

        {Icon && (
          <div
            className="p-2.5 rounded-xl flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={
              iconBg
                ? { background: iconBg }
                : accent
                ? { background: accent + '15', border: `1px solid ${accent}25` }
                : { background: 'rgba(255,255,255,0.06)' }
            }
          >
            <Icon
              className="w-5 h-5"
              style={{ color: iconColor || accent || '#00E599' }}
              strokeWidth={1.75}
            />
          </div>
        )}
      </div>
    </div>
  );
}
