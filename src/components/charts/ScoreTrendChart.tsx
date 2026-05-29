import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendDataPoint } from '@/types';

interface ScoreTrendChartProps {
  data: TrendDataPoint[];
  height?: number;
  showReferences?: boolean;
}

function ScoreTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const score = payload[0]?.value ?? 0;
  const color = score >= 90 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A';
  return (
    <div className="rounded-xl px-3.5 py-3 text-xs min-w-[130px]"
      style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="font-bold tabular-nums text-sm" style={{ color }}>{score?.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function ScoreTrendChart({ data, height = 200, showReferences = true }: ScoreTrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    score: d.score != null ? Math.round(d.score * 10) / 10 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0A84FF" />
            <stop offset="100%" stopColor="#30D158" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => v + '%'} />
        <Tooltip content={<ScoreTooltip />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        {showReferences && <ReferenceLine y={90} stroke="#30D158" strokeDasharray="3 3" strokeOpacity={0.4} />}
        {showReferences && <ReferenceLine y={60} stroke="#FF9F0A" strokeDasharray="3 3" strokeOpacity={0.4} />}
        <Line
          type="monotone"
          dataKey="score"
          stroke="url(#scoreGrad)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--app-surface-raised)', fill: '#0A84FF' }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
