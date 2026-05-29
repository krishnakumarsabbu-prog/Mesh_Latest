import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Server, Database, MessageSquare, Cpu, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AssetNodeData {
  id: string;
  name: string;
  tech_stack: string;
  asset_type: string;
  operational_state: string;
  replication_role: string;
  color: string;
  data_center: string;
  confidence: number;
  [key: string]: unknown;
}

const TECH_ICONS: Record<string, React.ElementType> = {
  oracle: Database,
  mssql: Database,
  mongodb: Server,
  ibm_mq: MessageSquare,
  kafka: MessageSquare,
  avi: Cpu,
  vm: Server,
};

export function AssetNode({ data }: NodeProps) {
  const d = data as AssetNodeData;
  const navigate = useNavigate();
  const Icon = TECH_ICONS[d.tech_stack] || Server;

  const stateColor = d.operational_state?.toUpperCase() === 'ACTIVE' ? '#30D158' : d.operational_state?.toUpperCase() === 'STANDBY' ? '#FF9F0A' : '#FF453A';

  return (
    <div
      className="group relative cursor-pointer select-none"
      style={{ width: 200 }}
      onClick={() => navigate(`/runtime`)}
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
            <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span
            className="text-[9px] font-bold uppercase tracking-widest truncate"
            style={{ color: d.color }}
          >
            {d.tech_stack} Host
          </span>
          <div
            className="ml-auto px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase"
            style={{ background: `${stateColor}22`, color: stateColor }}
          >
            {d.operational_state}
          </div>
        </div>

        <div className="px-3 py-2.5">
          <p
            className="text-[12px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {d.name}
          </p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-neutral-400" />
              <span className="text-[10px] text-neutral-500">Conf: {d.confidence}/4</span>
            </div>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-neutral-600 bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300"
            >
              {d.data_center}
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
