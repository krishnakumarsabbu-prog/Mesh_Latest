import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ConnectorTrendDataPoint } from '@/types';

interface ConnectorTrendChartProps {
  data: Record<string, ConnectorTrendDataPoint[]>;
  height?: number;
  metric?: 'response_time_ms' | 'score';
}

const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#5AC8FA', '#BF5AF2', '#FF6B6B', '#4ECDC4'];

function CTTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3.5 py-3 text-xs min-w-[150px]"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="font-medium truncate max-w-[100px]" style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{p.value != null ? p.value.toFixed(0) : '-'}</span>
        </div>
      ))}
    </div>
  );
}

function CLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload?.length) return null;
  return (
    <div className="flex items-center flex-wrap justify-center gap-3 pt-2">
      {payload.map((e) => (
        <div key={e.value} className="flex items-center gap-1.5">
          <span className="w-2.5 h-1.5 rounded-full" style={{ background: e.color }} />
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ConnectorTrendChart({ data, height = 220, metric = 'response_time_ms' }: ConnectorTrendChartProps) {
  const connectorNames = Object.keys(data);

  const allTimestamps = new Set<string>();
  connectorNames.forEach((name) => {
    data[name].forEach((d) => allTimestamps.add(d.timestamp));
  });
  const sortedTs = Array.from(allTimestamps).sort();

  const mergedData = sortedTs.map((ts) => {
    const row: Record<string, string | number | null> = {
      time: new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    connectorNames.forEach((name) => {
      const pt = data[name].find((d) => d.timestamp === ts);
      row[name] = pt ? (pt[metric] ?? null) : null;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={mergedData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => metric === 'response_time_ms' ? v + 'ms' : v + '%'} />
        <Tooltip content={<CTTooltip />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Legend content={<CLegend />} />
        {connectorNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
