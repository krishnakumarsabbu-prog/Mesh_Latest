import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import { ConnectorPerformanceMetrics, ConnectorPerformanceTrendPoint } from '@/types';

function ChartTooltip({ active, payload, label, unit = '' }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs min-w-[140px]"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {p.value != null ? `${typeof p.value === 'number' ? p.value.toFixed(1) : p.value}${unit}` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

interface ResponseTimeChartProps {
  connectors: ConnectorPerformanceMetrics[];
  height?: number;
}

export function ConnectorResponseTimeChart({ connectors, height = 220 }: ResponseTimeChartProps) {
  const sorted = [...connectors]
    .filter(c => c.avg_response_time_ms != null)
    .sort((a, b) => (a.avg_response_time_ms || 0) - (b.avg_response_time_ms || 0));

  const formatted = sorted.map(c => ({
    name: c.connector_name.length > 14 ? c.connector_name.slice(0, 12) + '…' : c.connector_name,
    fullName: c.connector_name,
    avg: Math.round(c.avg_response_time_ms || 0),
    p95: Math.round(c.p95_response_time_ms || 0),
  }));

  const barColor = '#0A84FF';
  const p95Color = '#FF9F0A';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}ms`} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-xl px-3.5 py-3 text-xs" style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
                <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{d.fullName}</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: barColor }} /><span style={{ color: 'var(--text-secondary)' }}>Avg</span></span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{d.avg}ms</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: p95Color }} /><span style={{ color: 'var(--text-secondary)' }}>P95</span></span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{d.p95}ms</span>
                  </div>
                </div>
              </div>
            );
          }}
          cursor={{ fill: 'var(--app-border)', fillOpacity: 0.2 }}
        />
        <Bar dataKey="avg" name="Avg Response" fill={barColor} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
        <Bar dataKey="p95" name="P95 Response" fill={p95Color} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ConnectorSuccessRateChartProps {
  connectors: ConnectorPerformanceMetrics[];
  height?: number;
}

export function ConnectorSuccessRateChart({ connectors, height = 220 }: ConnectorSuccessRateChartProps) {
  const sorted = [...connectors].sort((a, b) => a.success_rate - b.success_rate);
  const formatted = sorted.map(c => ({
    name: c.connector_name.length > 14 ? c.connector_name.slice(0, 12) + '…' : c.connector_name,
    rate: c.success_rate,
    color: c.success_rate >= 95 ? '#30D158' : c.success_rate >= 80 ? '#FF9F0A' : '#FF453A',
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={32} tickFormatter={v => `${v}%`} />
        <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: 'var(--app-border)', fillOpacity: 0.2 }} />
        <Bar dataKey="rate" name="Success Rate" radius={[6, 6, 0, 0]}>
          {formatted.map((entry, i) => (
            <Cell key={i} fill={entry.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ConnectorTrendMiniChartProps {
  data: ConnectorPerformanceTrendPoint[];
  metric?: 'success_rate' | 'avg_response_time_ms' | 'avg_score';
  color?: string;
  height?: number;
}

export function ConnectorTrendMiniChart({ data, metric = 'success_rate', color = '#0A84FF', height = 80 }: ConnectorTrendMiniChartProps) {
  const formatted = data.map(d => ({
    ...d,
    label: d.timestamp.slice(0, 10),
    value: d[metric],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 4, right: 4, left: -36, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
