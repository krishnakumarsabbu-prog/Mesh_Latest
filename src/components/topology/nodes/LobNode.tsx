import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Building2, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LobNodeData {
  id: string;
  name: string;
  color: string;
  project_count: number;
  status: string;
  [key: string]: unknown;
}

export function LobNode({ data }: NodeProps) {
  const d = data as LobNodeData;
  const navigate = useNavigate();

  return (
    <div
      className="group relative cursor-pointer select-none"
      style={{ width: 200 }}
      onClick={() => navigate(`/lobs/${d.id}`)}
    >
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200 group-hover:scale-[1.03]"
        style={{
          background: 'var(--app-surface)',
          border: `2px solid ${d.color}44`,
          boxShadow: `0 4px 24px ${d.color}22, 0 1px 4px rgba(0,0,0,0.15)`,
        }}
      >
        {/* Header bar */}
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ background: `${d.color}22`, borderBottom: `1px solid ${d.color}33` }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: d.color }}
          >
            <Building2 className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: d.color }}
          >
            LOB
          </span>
          <div
            className="ml-auto w-2 h-2 rounded-full"
            style={{ background: d.status === 'active' ? '#30D158' : '#636366' }}
          />
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          <p
            className="text-[13px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {d.name}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <FolderOpen className="w-3 h-3" style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {d.project_count} project{d.project_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: d.color, border: `2px solid ${d.color}`, width: 10, height: 10 }}
      />
    </div>
  );
}
