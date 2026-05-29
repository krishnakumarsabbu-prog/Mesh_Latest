import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TeamNodeData {
  id: string;
  name: string;
  color: string;
  member_count: number;
  lob_id: string;
  [key: string]: unknown;
}

export function TeamNode({ data }: NodeProps) {
  const d = data as TeamNodeData;
  const navigate = useNavigate();

  return (
    <div
      className="group relative cursor-pointer select-none"
      style={{ width: 180 }}
      onClick={() => navigate(`/teams/${d.id}`)}
    >
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200 group-hover:scale-[1.03]"
        style={{
          background: 'var(--app-surface)',
          border: `2px solid ${d.color}44`,
          boxShadow: `0 4px 20px ${d.color}1a, 0 1px 4px rgba(0,0,0,0.12)`,
        }}
      >
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ background: `${d.color}18`, borderBottom: `1px solid ${d.color}28` }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: d.color }}
          >
            <UsersRound className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: d.color }}
          >
            Team
          </span>
        </div>

        <div className="px-3 py-2.5">
          <p
            className="text-[13px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {d.name}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {d.member_count} member{d.member_count !== 1 ? 's' : ''}
          </p>
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
