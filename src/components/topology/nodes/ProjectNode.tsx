import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FolderOpen, Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProjectNodeData {
  id: string;
  name: string;
  environment: string;
  status: string;
  color: string;
  connector_count: number;
  [key: string]: unknown;
}

const ENV_COLORS: Record<string, string> = {
  production: '#FF453A',
  staging: '#FF9F0A',
  development: '#30D158',
  test: '#64D2FF',
};

export function ProjectNode({ data }: NodeProps) {
  const d = data as ProjectNodeData;
  const navigate = useNavigate();
  const envColor = ENV_COLORS[d.environment] || '#636366';

  return (
    <div
      className="group relative cursor-pointer select-none"
      style={{ width: 180 }}
      onClick={() => navigate(`/projects/${d.id}`)}
    >
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200 group-hover:scale-[1.03]"
        style={{
          background: 'var(--app-surface)',
          border: `2px solid ${d.color}55`,
          boxShadow: `0 4px 20px ${d.color}18, 0 1px 4px rgba(0,0,0,0.12)`,
        }}
      >
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ background: `${d.color}15`, borderBottom: `1px solid ${d.color}25` }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: d.color }}
          >
            <FolderOpen className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: d.color }}
          >
            Project
          </span>
          <div
            className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
            style={{ background: `${envColor}22`, color: envColor }}
          >
            {d.environment}
          </div>
        </div>

        <div className="px-3 py-2.5">
          <p
            className="text-[13px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {d.name}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <Plug className="w-3 h-3" style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {d.connector_count} connector{d.connector_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        style={{ background: d.color, border: `2px solid ${d.color}`, width: 10, height: 10 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: d.color, border: `2px solid ${d.color}`, width: 10, height: 10 }}
      />
    </div>
  );
}
