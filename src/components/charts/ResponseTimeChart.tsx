import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ConnectorResponseTime } from '@/types';

interface ResponseTimeChartProps {
  data: ConnectorResponseTime[];
  height?: number;
}

const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#5AC8FA', '#BF5AF2', '#FF6B6B', '#4ECDC4'];

function RTTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ConnectorResponseTime }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl px-3.5 py-3 text-xs min-w-[160px]"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
      <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{d.connector}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4"><span style={{ color: 'var(--text-muted)' }}>Avg</span><span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.avg_ms}ms</span></div>
        <div className="flex justify-between gap-4"><span style={{ color: 'var(--text-muted)' }}>Min</span><span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.min_ms}ms</span></div>
        <div className="flex justify-between gap-4"><span style={{ color: 'var(--text-muted)' }}>Max</span><span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.max_ms}ms</span></div>
        <div className="flex justify-between gap-4"><span style={{ color: 'var(--text-muted)' }}>Samples</span><span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.samples}</span></div>
      </div>
    </div>
  );
}

export function ResponseTimeChart({ data, height = 200 }: ResponseTimeChartProps) {
  const sorted = [...data].sort((a, b) => b.avg_ms - a.avg_ms);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.4} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => v + 'ms'} />
        <YAxis type="category" dataKey="connector" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={90} />
        <Tooltip content={<RTTooltip />} cursor={{ fill: 'var(--app-border)', opacity: 0.3 }} />
        <Bar dataKey="avg_ms" radius={[0, 6, 6, 0]} maxBarSize={24}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
