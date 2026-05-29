import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface StatusDonutChartProps {
  healthy: number;
  degraded: number;
  down: number;
  unknown?: number;
  size?: number;
}

const STATUS_COLORS = [
  { name: 'Healthy', color: '#30D158' },
  { name: 'Degraded', color: '#FF9F0A' },
  { name: 'Down', color: '#FF453A' },
  { name: 'Unknown', color: '#A1A1AA' },
];

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const color = STATUS_COLORS.find((s) => s.name === payload[0].name)?.color ?? '#A1A1AA';
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs"
      style={{
        background: 'var(--app-surface-raised)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {payload[0].name}:
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>{payload[0].value}</span>
      </div>
    </div>
  );
}

export function StatusDonutChart({ healthy, degraded, down, unknown = 0, size = 180 }: StatusDonutChartProps) {
  const raw = [
    { name: 'Healthy', value: healthy },
    { name: 'Degraded', value: degraded },
    { name: 'Down', value: down },
    { name: 'Unknown', value: unknown },
  ];

  const data = raw.filter((d) => d.value > 0);
  const total = healthy + degraded + down + unknown;
  const healthPct = total > 0 ? Math.round((healthy / total) * 100) : 100;
  const healthColor = healthPct >= 90 ? '#30D158' : healthPct >= 70 ? '#FF9F0A' : '#FF453A';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.length ? data : [{ name: 'No data', value: 1 }]}
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="78%"
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
            paddingAngle={data.length > 1 ? 2 : 0}
          >
            {data.length
              ? data.map((entry) => {
                  const sc = STATUS_COLORS.find((s) => s.name === entry.name);
                  return <Cell key={entry.name} fill={sc?.color ?? '#A1A1AA'} />;
                })
              : <Cell fill="var(--app-border)" />
            }
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-2xl font-bold leading-none tabular-nums"
          style={{ color: healthColor }}
        >
          {healthPct}%
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mt-1"
          style={{ color: 'var(--text-muted)' }}
        >
          Healthy
        </span>
      </div>
    </div>
  );
}
