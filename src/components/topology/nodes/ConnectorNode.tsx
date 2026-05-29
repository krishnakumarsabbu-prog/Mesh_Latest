import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Plug, Wifi, WifiOff, TriangleAlert as AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ConnectorNodeData {
  id: string;
  name: string;
  type: string;
  status: string;
  color: string;
  project_id: string;
  last_checked: string | null;
  [key: string]: unknown;
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  healthy: Wifi,
  degraded: AlertTriangle,
  down: WifiOff,
  unknown: Plug,
};

export function ConnectorNode({ data }: NodeProps) {
  const d = data as ConnectorNodeData;
  const navigate = useNavigate();
  const StatusIcon = STATUS_ICONS[d.status] || Plug;
  const isDown = d.status === 'down';
  const isHealthy = d.status === 'healthy';

  return (
    <div
      className="group relative cursor-pointer select-none"
      style={{ width: 160 }}
      onClick={() => navigate(`/connectors`)}
    >
      {/* Pulsing glow for down state */}
      {isDown && (
        <div
          className="absolute inset-0 rounded-2xl animate-ping opacity-20"
          style={{ background: d.color }}
        />
      )}

      <div
        className="relative rounded-2xl overflow-hidden transition-all duration-200 group-hover:scale-[1.04]"
        style={{
          background: 'var(--app-surface)',
          border: `2px solid ${d.color}66`,
          boxShadow: isDown
            ? `0 0 20px ${d.color}55, 0 4px 16px rgba(0,0,0,0.15)`
            : `0 4px 16px ${d.color}15, 0 1px 3px rgba(0,0,0,0.1)`,
        }}
      >
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ background: `${d.color}15`, borderBottom: `1px solid ${d.color}22` }}
        >
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isHealthy ? 'animate-pulse' : ''}`}
            style={{ background: d.color }}
          >
            <StatusIcon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest flex-1 truncate"
            style={{ color: d.color }}
          >
            {d.type?.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="px-3 py-2.5">
          <p
            className="text-[12px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {d.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'animate-pulse' : ''}`}
              style={{ background: d.color }}
            />
            <span
              className="text-[11px] font-medium capitalize"
              style={{ color: d.color }}
            >
              {d.status}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        style={{ background: d.color, border: `2px solid ${d.color}`, width: 10, height: 10 }}
      />
    </div>
  );
}
