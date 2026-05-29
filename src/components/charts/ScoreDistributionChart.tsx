import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ScoreDistributionChartProps {
  distribution: { excellent: number; good: number; fair: number; poor: number };
  height?: number;
}

const DIST_CONFIG = [
  { key: 'excellent', label: 'Excellent', color: '#30D158', range: '≥90%' },
  { key: 'good', label: 'Good', color: '#0A84FF', range: '70-89%' },
  { key: 'fair', label: 'Fair', color: '#FF9F0A', range: '50-69%' },
  { key: 'poor', label: 'Poor', color: '#FF453A', range: '<50%' },
];

function DistTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; range: string; value: number; color: string } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
      <p className="font-semibold mb-1" style={{ color: d.color }}>{d.label}</p>
      <p style={{ color: 'var(--text-muted)' }}>{d.range}</p>
      <p className="font-bold tabular-nums text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{d.value} runs</p>
    </div>
  );
}

export function ScoreDistributionChart({ distribution, height = 160 }: ScoreDistributionChartProps) {
  const data = DIST_CONFIG.map((c) => ({
    label: c.label,
    range: c.range,
    value: distribution[c.key as keyof typeof distribution] || 0,
    color: c.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <Tooltip content={<DistTooltip />} cursor={{ fill: 'var(--app-border)', opacity: 0.2 }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={52}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
