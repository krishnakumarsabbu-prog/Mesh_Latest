import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from 'recharts';
import { AnalyticsProjectSummary } from '@/types';

const DEFAULT_COLORS = [
  '#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2',
  '#5AC8FA', '#FFD60A', '#FF6961', '#9BDE7E', '#FF8C00',
];

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs min-w-[160px]"
      style={{
        background: 'var(--app-surface-raised)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {p.value != null ? `${typeof p.value === 'number' ? p.value.toFixed(1) : p.value}` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

interface ProjectBarComparisonProps {
  projects: AnalyticsProjectSummary[];
  metric: 'avg_health_score' | 'availability_pct' | 'sla_pct' | 'incident_count';
  height?: number;
}

export function ProjectBarComparison({ projects, metric, height = 220 }: ProjectBarComparisonProps) {
  const labels: Record<string, string> = {
    avg_health_score: 'Health Score',
    availability_pct: 'Availability %',
    sla_pct: 'SLA %',
    incident_count: 'Incidents',
  };

  const formatted = projects.map((p, i) => ({
    name: p.project_name.length > 14 ? p.project_name.slice(0, 12) + '…' : p.project_name,
    fullName: p.project_name,
    value: p[metric] ?? 0,
    color: p.project_color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div
                className="rounded-xl px-3.5 py-3 text-xs"
                style={{ background: 'var(--app-surface-raised)', border: '1px solid var(--app-border)', boxShadow: 'var(--shadow-xl)' }}
              >
                <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{d.fullName}</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{labels[metric]}</span>
                  <span className="font-bold ml-auto" style={{ color: 'var(--text-primary)' }}>
                    {typeof d.value === 'number' ? d.value.toFixed(1) : d.value}
                  </span>
                </div>
              </div>
            );
          }}
          cursor={{ fill: 'var(--app-border)', fillOpacity: 0.2 }}
        />
        <Bar dataKey="value" name={labels[metric]} radius={[6, 6, 0, 0]}>
          {formatted.map((entry, i) => (
            <Cell key={i} fill={entry.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ProjectScoreTrendComparisonProps {
  projects: AnalyticsProjectSummary[];
  height?: number;
}

export function ProjectScoreTrendComparison({ projects, height = 240 }: ProjectScoreTrendComparisonProps) {
  const allTimestamps = Array.from(
    new Set(projects.flatMap(p => p.score_trend.map(d => d.timestamp)))
  ).sort();

  const chartData = allTimestamps.map(ts => {
    const point: Record<string, number | string> = { ts: ts.slice(0, 10) };
    for (const proj of projects) {
      const match = proj.score_trend.find(d => d.timestamp === ts);
      if (match?.score != null) point[proj.project_id] = match.score;
    }
    return point;
  });

  if (!chartData.length) return (
    <div className="flex items-center justify-center" style={{ height }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trend data available</p>
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} tickLine={false} axisLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--app-border)', strokeWidth: 1 }} />
        <Legend
          formatter={(value) => {
            const proj = projects.find(p => p.project_id === value);
            return <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{proj?.project_name || value}</span>;
          }}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ paddingTop: 8 }}
        />
        {projects.map((proj, i) => (
          <Line
            key={proj.project_id}
            type="monotone"
            dataKey={proj.project_id}
            name={proj.project_id}
            stroke={proj.project_color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--app-surface-raised)' }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
