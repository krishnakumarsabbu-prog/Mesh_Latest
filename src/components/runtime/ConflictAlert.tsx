import React, { useState } from 'react';
import { TriangleAlert as AlertTriangle, GitBranch, ShieldAlert, Loader } from 'lucide-react';
import { formatRelativeTime } from '@/lib/runtimeLocationMock';
import type { SourceConflict } from '@/types';
import { runtimeApi } from '@/lib/api';

interface ConflictAlertProps {
  conflict: SourceConflict;
  onResolve?: () => void;
}

export function ConflictAlert({ conflict, onResolve }: ConflictAlertProps) {
  const [resolving, setResolving] = useState<string | null>(null);

  const handleResolve = async (authoritativeSource: string) => {
    setResolving(authoritativeSource);
    try {
      await runtimeApi.resolveConflict({
        asset_name: conflict.asset_name,
        authoritative_source: authoritativeSource,
      });
      if (onResolve) {
        onResolve();
      }
    } catch (e) {
      console.error('Failed to resolve conflict:', e);
    } finally {
      setResolving(null);
    }
  };

  return (
    <div
      className="rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
      style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.25)' }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FF453A' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold" style={{ color: '#FF453A' }}>
            Source Conflict Detected
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold">{conflict.asset_name}</span>
            {' — '}
            <span className="font-medium">{conflict.source_a.name}</span> reports{' '}
            <span className="font-semibold">{conflict.source_a.says}</span>
            {', '}
            <span className="font-medium">{conflict.source_b.name}</span> reports{' '}
            <span className="font-semibold">{conflict.source_b.says}</span>
          </p>
          <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <GitBranch className="w-3 h-3" />
            Last checked {formatRelativeTime(conflict.last_checked)} — manual verification recommended
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => handleResolve(conflict.source_a.name)}
          disabled={resolving !== null}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1 transition-all whitespace-nowrap"
          style={{ background: '#FF453A' }}
        >
          {resolving === conflict.source_a.name ? (
            <Loader className="w-3 h-3 animate-spin" />
          ) : (
            <ShieldAlert className="w-3 h-3" />
          )}
          Trust {conflict.source_a.name}
        </button>
        <button
          onClick={() => handleResolve(conflict.source_b.name)}
          disabled={resolving !== null}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1 transition-all whitespace-nowrap"
          style={{ background: '#FF453A' }}
        >
          {resolving === conflict.source_b.name ? (
            <Loader className="w-3 h-3 animate-spin" />
          ) : (
            <ShieldAlert className="w-3 h-3" />
          )}
          Trust {conflict.source_b.name}
        </button>
      </div>
    </div>
  );
}
