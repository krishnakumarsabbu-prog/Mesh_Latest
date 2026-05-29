import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: string;
  animate?: boolean;
}

export function Skeleton({ width, height, rounded = 'rounded-lg', animate = true, className, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('shimmer-bg', rounded, className)}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-start justify-between mb-5">
        <Skeleton height={10} width={80} rounded="rounded-full" />
        <Skeleton height={32} width={32} rounded="rounded-xl" />
      </div>
      <Skeleton height={30} width={72} className="mb-2" rounded="rounded-lg" />
      <Skeleton height={12} width={140} rounded="rounded-full" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton height={14} width={i === 0 ? 140 : 80} />
        </td>
      ))}
    </tr>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height }}>
      <div className="shimmer-bg w-full h-full rounded-xl" />
      <div className="absolute inset-0 flex items-end gap-1.5 px-4 pb-6 opacity-20">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-lg"
            style={{
              height: `${30 + Math.sin(i * 0.8) * 25 + Math.random() * 20}%`,
              background: 'var(--accent)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
