/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * IncidentBanner — The critical 4-hour countdown banner that
 * appears across the top of all DC-Exit workflow pages.
 *
 * Problem Statement Context:
 * "The DC is operating normally, however WF just found that we need to
 *  failover/exit that DC in the next 4 hours."
 *
 * This banner:
 *  1. Shows a live countdown (4h from session start)
 *  2. Lets the operator select Source DC → Target DC
 *  3. Pulses red when < 1h remains
 */

import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { useDcExitStore } from '@/modules/dc-exit/store/dcExitStore';
import { runtimeApi } from '@/lib/api';
import type { RuntimeDataCenter } from '@/types';

const INCIDENT_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function IncidentBanner() {
  const { session, incidentStartedAt, updateSession } = useDcExitStore();
  const [dcs, setDcs] = useState<RuntimeDataCenter[]>([]);
  const [remaining, setRemaining] = useState<number>(INCIDENT_WINDOW_MS);

  // Load DCs
  useEffect(() => {
    runtimeApi.getDataCenters().then((r) => setDcs(r.data)).catch(() => {});
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!incidentStartedAt) return;
    const tick = () => {
      const elapsed = Date.now() - new Date(incidentStartedAt).getTime();
      setRemaining(Math.max(0, INCIDENT_WINDOW_MS - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [incidentStartedAt]);

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateSession({ dataCenterShort: e.target.value });
    },
    [updateSession],
  );

  const handleTargetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateSession({ targetDataCenterShort: e.target.value });
    },
    [updateSession],
  );

  const isCritical = remaining < 60 * 60 * 1000; // < 1h
  const isExpired = remaining === 0;

  const sourceDc = session?.dataCenterShort ?? '';
  const targetDc = session?.targetDataCenterShort ?? '';

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 flex-wrap"
      style={{
        background: isExpired
          ? 'rgba(255,0,60,0.15)'
          : isCritical
          ? 'rgba(255,77,0,0.12)'
          : 'rgba(255,177,0,0.08)',
        borderBottom: `1px solid ${isExpired ? 'rgba(255,0,60,0.35)' : isCritical ? 'rgba(255,77,0,0.3)' : 'rgba(255,177,0,0.25)'}`,
      }}
    >
      {/* Icon + Title */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <AlertTriangle
          className={`w-4 h-4 ${isCritical ? 'animate-pulse' : ''}`}
          style={{ color: isExpired ? '#FF003C' : isCritical ? '#FF4D00' : '#FFB100' }}
        />
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: isExpired ? '#FF003C' : isCritical ? '#FF4D00' : '#FFB100' }}
        >
          {isExpired ? 'INCIDENT WINDOW EXPIRED' : 'ACTIVE INCIDENT — DC FAILOVER REQUIRED'}
        </span>
      </div>

      {/* DC Selector: Source → Target */}
      <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Exit DC
        </span>
        <select
          value={sourceDc}
          onChange={handleSourceChange}
          className="text-[11px] font-mono rounded px-2 py-0.5 border focus:outline-none"
          style={{
            background: 'var(--app-surface)',
            border: '1px solid var(--app-border)',
            color: 'var(--text-primary)',
          }}
        >
          {dcs.map((dc) => (
            <option key={dc.id} value={dc.short_name ?? dc.name}>
              {dc.short_name ?? dc.name} — {dc.name}
            </option>
          ))}
        </select>

        <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />

        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Target DC
        </span>
        <select
          value={targetDc}
          onChange={handleTargetChange}
          className="text-[11px] font-mono rounded px-2 py-0.5 border focus:outline-none"
          style={{
            background: 'var(--app-surface)',
            border: '1px solid var(--app-border)',
            color: 'var(--text-primary)',
          }}
        >
          {dcs.map((dc) => (
            <option key={dc.id} value={dc.short_name ?? dc.name}>
              {dc.short_name ?? dc.name} — {dc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        <Clock
          className={`w-3.5 h-3.5 ${isCritical ? 'animate-pulse' : ''}`}
          style={{ color: isExpired ? '#FF003C' : isCritical ? '#FF4D00' : '#FFB100' }}
        />
        <span
          className="text-[13px] font-mono font-bold tabular-nums"
          style={{ color: isExpired ? '#FF003C' : isCritical ? '#FF4D00' : '#FFB100' }}
        >
          {formatCountdown(remaining)}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-disabled)' }}>
          remaining
        </span>
        <span
          className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{
            background: isExpired
              ? 'rgba(255,0,60,0.12)'
              : isCritical
              ? 'rgba(255,77,0,0.12)'
              : 'rgba(255,177,0,0.1)',
            color: isExpired ? '#FF003C' : isCritical ? '#FF4D00' : '#FFB100',
            border: `1px solid ${isExpired ? 'rgba(255,0,60,0.3)' : 'rgba(255,177,0,0.25)'}`,
          }}
        >
          {isExpired ? 'EXPIRED' : isCritical ? 'CRITICAL' : '4H WINDOW'}
        </span>
      </div>
    </div>
  );
}
