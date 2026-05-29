import React from 'react';
import { cn } from '@/lib/utils';

interface SlaGaugeProps {
  value?: number | null;
  threshold?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showThreshold?: boolean;
}

function getColor(value: number, threshold: number): string {
  if (value >= threshold) return '#30D158';
  if (value >= threshold - 2) return '#FF9F0A';
  return '#FF453A';
}

function CircularGauge({ value, threshold, size = 'md' }: { value: number; threshold: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 80, md: 110, lg: 140 };
  const r_outer = sizes[size] / 2 - 8;
  const cx = sizes[size] / 2;
  const cy = sizes[size] / 2;
  const strokeWidth = size === 'sm' ? 7 : size === 'lg' ? 11 : 9;
  const r = r_outer - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;
  const clampedVal = Math.min(100, Math.max(0, value));
  const progress = (clampedVal / 100) * circumference;
  const color = getColor(value, threshold);
  const svgSize = sizes[size];

  return (
    <div className="relative flex-shrink-0" style={{ width: svgSize, height: svgSize }}>
      <svg width={svgSize} height={svgSize} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--app-border)"
          strokeWidth={strokeWidth}
          strokeOpacity={0.5}
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('font-bold tabular-nums leading-none', size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl')}
          style={{ color }}
        >
          {value.toFixed(size === 'sm' ? 1 : 2)}%
        </span>
      </div>
    </div>
  );
}

export function SlaGauge({ value, threshold = 99, label = 'SLA', size = 'md', showThreshold = true }: SlaGaugeProps) {
  if (value == null) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: size === 'sm' ? 80 : size === 'lg' ? 140 : 110,
            height: size === 'sm' ? 80 : size === 'lg' ? 140 : 110,
            border: '2px dashed var(--app-border)',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>—</span>
        </div>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
    );
  }

  const color = getColor(value, threshold);

  return (
    <div className="flex flex-col items-center gap-2">
      <CircularGauge value={value} threshold={threshold} size={size} />
      <div className="text-center">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {showThreshold && (
          <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Target: {threshold}%
          </p>
        )}
      </div>
    </div>
  );
}

interface SlaStatusBadgeProps {
  value?: number | null;
  threshold?: number;
}

export function SlaStatusBadge({ value, threshold = 99 }: SlaStatusBadgeProps) {
  if (value == null) return <span className="text-sm" style={{ color: 'var(--text-muted)' }}>—</span>;
  const color = getColor(value, threshold);
  const label = value >= threshold ? 'Met' : value >= threshold - 2 ? 'At Risk' : 'Breached';
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: `${color}20`, color }}
    >
      {label}
    </span>
  );
}
