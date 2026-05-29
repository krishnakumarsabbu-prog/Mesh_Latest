import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AvailabilityDataPoint } from '@/types';

interface AvailabilityChartProps {
  data: AvailabilityDataPoint[];
  height?: number;
}

function AvailTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <span className="font-bold text-sm" style={{ color: '#0A84FF' }}>{val?.toFixed(1)}%</span>
    </div>
  );
}

export function AvailabilityChart({ data, height = 140 }: AvailabilityChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    availability: d.availability != null ? Math.round(d.availability * 10) / 10 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="availGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#0A84FF" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => v + '%'} />
        <Tooltip content={<AvailTooltip />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="availability" stroke="#0A84FF" strokeWidth={2} fill="url(#availGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--app-surface-raised)', fill: '#0A84FF' }} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}
