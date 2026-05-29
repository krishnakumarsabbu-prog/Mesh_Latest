import React from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

interface HealthEdgeData {
  status?: string;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#30D158',
  healthy: '#30D158',
  degraded: '#FF9F0A',
  down: '#FF453A',
  unknown: '#636366',
};

export function HealthEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  animated,
}: EdgeProps) {
  const d = (data as HealthEdgeData) || {};
  const status = d.status || 'active';
  const color = STATUS_COLORS[status] || '#636366';

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Shadow/glow path */}
      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeOpacity={0.1}
      />
      {/* Main edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.7}
        strokeDasharray={animated ? '6 3' : undefined}
        style={
          animated
            ? {
                animation: 'flowDash 1.5s linear infinite',
              }
            : undefined
        }
      />

      <style>{`
        @keyframes flowDash {
          from { stroke-dashoffset: 18; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </>
  );
}
