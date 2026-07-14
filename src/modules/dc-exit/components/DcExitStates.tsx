/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Shared loading and empty-state components for the dc-exit tabs.
 */

import React from 'react';
import { Loader as Loader2, CircleAlert as AlertCircle, Inbox } from 'lucide-react';

export function DcExitLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
    </div>
  );
}

export function DcExitError({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3 max-w-md text-center">
        <AlertCircle className="w-6 h-6" style={{ color: '#FF003C' }} strokeWidth={2} />
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{message}</span>
      </div>
    </div>
  );
}

export function DcExitEmpty({ label = 'No data available' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Inbox className="w-6 h-6" style={{ color: 'var(--text-disabled)' }} strokeWidth={2} />
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
    </div>
  );
}
