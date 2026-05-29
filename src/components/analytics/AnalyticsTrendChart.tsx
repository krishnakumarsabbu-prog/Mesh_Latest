import React from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { AnalyticsTrendPoint, AnalyticsAvailabilityPoint, AnalyticsSlaPoint } from '@/types';

function formatLabel(ts: string, granularity: string): string {
  try {
    const d = new Date(ts);
    if (granularity === 'hourly') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (granularity === 'monthly') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (granularity === 'weekly') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return ts;
  }
}

function ChartTooltip({ active, payload, label, valueLabel, unit = '', color }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  valueLabel?: string;
  unit?: string;
  color?: string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs min-w-[130px]"
      style={{
        background: 'var(--app-surface-raised)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: color || payload[0]?.color }} />
          <span style={{ color: 'var(--text-secondary)' }}>{valueLabel || payload[0]?.name}</span>
        </div>
        <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {val != null ? `${typeof val === 'number' ? val.toFixed(val % 1 === 0 ? 0 : 1) : val}${unit}` : '—'}
        </span>
      </div>
    </div>
  );
}

interface HealthScoreTrendChartProps {
  data: AnalyticsTrendPoint[];
  granularity: string;
  height?: number;
  color?: string;
}

export function HealthScoreTrendChart({ data, granularity, height = 240, color = '#0A84FF' }: HealthScoreTrendChartProps) {
  const formatted = data.map(d => ({
    ...d,
    label: formatLabel(d.timestamp, granularity),
    score: d.score != null ? Math.round(d.score * 10) / 10 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="85%" stopColor={color} stopOpacity={0.03} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={32} tickFormatter={v => `${v}`} />
        <ReferenceLine y={90} stroke="#30D158" strokeDasharray="4 2" strokeOpacity={0.4} />
        <ReferenceLine y={60} stroke="#FF9F0A" strokeDasharray="4 2" strokeOpacity={0.4} />
        <Tooltip content={<ChartTooltip valueLabel="Score" unit="" color={color} />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="score" name="Score" stroke={color} strokeWidth={2} fill="url(#scoreGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--app-surface-raised)', fill: color }} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface AvailabilityTrendChartProps {
  data: AnalyticsAvailabilityPoint[];
  granularity: string;
  height?: number;
}

export function AvailabilityTrendChart({ data, granularity, height = 240 }: AvailabilityTrendChartProps) {
  const color = '#30D158';
  const formatted = data.map(d => ({
    ...d,
    label: formatLabel(d.timestamp, granularity),
    availability: d.availability != null ? Math.round(d.availability * 100) / 100 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="availGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="85%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} />
        <ReferenceLine y={99} stroke={color} strokeDasharray="4 2" strokeOpacity={0.4} />
        <Tooltip content={<ChartTooltip valueLabel="Availability" unit="%" color={color} />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="availability" name="Availability" stroke={color} strokeWidth={2} fill="url(#availGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--app-surface-raised)', fill: color }} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface SlaTrendChartProps {
  data: AnalyticsSlaPoint[];
  granularity: string;
  threshold?: number;
  height?: number;
}

export function SlaTrendChart({ data, granularity, threshold = 99, height = 200 }: SlaTrendChartProps) {
  const color = '#FF9F0A';
  const formatted = data.map(d => ({
    ...d,
    label: formatLabel(d.timestamp, granularity),
    sla: d.sla != null ? Math.round(d.sla * 100) / 100 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[Math.min(90, (data.reduce((min, d) => Math.min(min, d.sla ?? 100), 100)) - 2), 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} />
        <ReferenceLine y={threshold} stroke="#FF453A" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: `${threshold}%`, position: 'right', fontSize: 9, fill: '#FF453A' }} />
        <Tooltip content={<ChartTooltip valueLabel="SLA" unit="%" color={color} />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Line type="monotone" dataKey="sla" name="SLA" stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--app-surface-raised)', fill: color }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
