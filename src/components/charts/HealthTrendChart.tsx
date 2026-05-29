import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { HealthTrend } from '@/types';

interface HealthTrendChartProps {
  data: HealthTrend[];
  height?: number;
}

const SERIES = [
  { key: 'healthy', color: '#30D158', label: 'Healthy' },
  { key: 'degraded', color: '#FF9F0A', label: 'Degraded' },
  { key: 'down', color: '#FF453A', label: 'Down' },
];

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs min-w-[130px]"
      style={{
        background: 'var(--app-surface-raised)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wider mb-2.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="capitalize font-medium" style={{ color: 'var(--text-secondary)' }}>
              {p.name}
            </span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload?.length) return null;
  return (
    <div className="flex items-center justify-center gap-5 pt-3">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          <span className="w-2.5 h-1.5 rounded-full" style={{ background: entry.color }} />
          <span className="text-[11px] font-medium capitalize" style={{ color: 'var(--text-muted)' }}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HealthTrendChart({ data, height = 280 }: HealthTrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`grad_${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="85%" stopColor={s.color} stopOpacity={0.03} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--app-border)"
          strokeOpacity={0.6}
          vertical={false}
        />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Legend content={<CustomLegend />} />
        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#grad_${s.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--app-surface-raised)', fill: s.color }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
