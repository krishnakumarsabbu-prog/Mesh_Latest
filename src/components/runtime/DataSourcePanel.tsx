import React from 'react';
import {
  Database, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  CircleAlert as AlertCircle, CircleHelp as HelpCircle, Construction,
} from 'lucide-react';
import type { DataSourceInfo, FreshnessStatus } from '@/types';
import { CONFIDENCE_LABELS } from '@/lib/runtimeLocationMock';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FreshnessIndicator } from './FreshnessIndicator';

const SOURCE_DISPLAY: Record<string, string> = {
  ibm_mq:     'IBM MQ Prometheus',
  mongodb:    'MongoDB Prometheus',
  oracle_oem: 'Oracle OEM',
  avi_lb:     'AVI Load Balancer',
  cmdb:       'CMDB Topology',
};

// Sources that are WIP — show explicit label and confidence cap warning
const WIP_SOURCES = new Set(['oracle_oem', 'avi_lb']);

const WIP_GAP_NOTES: Record<string, string> = {
  oracle_oem: 'Oracle OEM API unavailable (WIP) — using sample CSV, confidence capped at MEDIUM',
  avi_lb:     'AVI Controller API unavailable (WIP) — using sample CSV, confidence capped at MEDIUM',
};

// confidence level → brief explanation of WHY it has this level
const TOPOLOGY_REASON: Record<string, string> = {
  ibm_mq:     'Direct from Prometheus control plane — active QMgr detection',
  mongodb:    'Direct replica set status from Prometheus',
  oracle_oem: 'OEM reads directly from DB — proprietary but accurate',
  cmdb:       'CMDB is authoritative topology record — highest confidence',
};

const TRAFFIC_REASON: Record<string, string> = {
  ibm_mq:     'Queue depth available via Prometheus metrics',
  mongodb:    'Read/write ops available via Prometheus',
  oracle_oem: 'Traffic data not standardized — proprietary OEM format',
  cmdb:       'CMDB does not track live traffic — estimated from topology',
};

function StatusIcon({ status }: { status: FreshnessStatus }) {
  if (status === 'FRESH')      return <CheckCircle  className="w-3.5 h-3.5" style={{ color: '#30D158' }} />;
  if (status === 'STALE')      return <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#FF9F0A' }} />;
  if (status === 'VERY_STALE') return <AlertCircle  className="w-3.5 h-3.5" style={{ color: '#FF453A' }} />;
  return <HelpCircle className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />;
}

function ConfidenceCell({ level, sourceName, dimension }: {
  level: number;
  sourceName: string;
  dimension: 'topology' | 'traffic';
}) {
  const reason = dimension === 'topology'
    ? TOPOLOGY_REASON[sourceName]
    : TRAFFIC_REASON[sourceName];

  return (
    <td className="px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <ConfidenceBadge level={level as 1 | 2 | 3 | 4} showLabel />
        {reason && (
          <span className="text-[9px] leading-tight" style={{ color: 'var(--text-muted)', maxWidth: 160 }}>
            {reason}
          </span>
        )}
      </div>
    </td>
  );
}

interface DataSourcePanelProps {
  dataSources: DataSourceInfo[];
}

export function DataSourcePanel({ dataSources }: DataSourcePanelProps) {
  const staleCount     = dataSources.filter((s) => s.status === 'STALE' || s.status === 'VERY_STALE').length;
  const veryStaleCount = dataSources.filter((s) => s.status === 'VERY_STALE').length;

  const minTopologyConf = dataSources.length
    ? Math.min(...dataSources.map((s) => s.topology_confidence))
    : 1;
  const minTrafficConf  = dataSources.length
    ? Math.min(...dataSources.map((s) => s.traffic_confidence))
    : 1;

  return (
    <div className="flex flex-col gap-4">

      {/* Confidence summary bar */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { dim: 'Topology Confidence', level: minTopologyConf, note: 'Minimum across all sources' },
          { dim: 'Traffic Confidence',  level: minTrafficConf,  note: 'Minimum across all sources' },
        ].map(({ dim, level, note }) => {
          const colors: Record<number, string> = { 1: '#8E8E93', 2: '#FF453A', 3: '#FF9F0A', 4: '#30D158' };
          const color = colors[level] ?? '#8E8E93';
          return (
            <div
              key={dim}
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[15px] font-bold"
                style={{ background: `${color}18`, color }}
              >
                {level}
              </div>
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {dim}
                </p>
                <p className="text-[11px]" style={{ color }}>
                  {CONFIDENCE_LABELS[level]} — {note}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {veryStaleCount > 0 && (
        <div
          className="rounded-xl p-3 flex items-start gap-2.5"
          style={{ background: 'rgba(255,69,58,0.07)', border: '1px solid rgba(255,69,58,0.25)' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FF453A' }} />
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: '#FF453A' }}>
              {veryStaleCount} source{veryStaleCount > 1 ? 's are' : ' is'} very stale (&gt;2 hours).
            </span>{' '}
            Topology may not reflect recent infrastructure changes. Manual verification recommended.
          </p>
        </div>
      )}

      {staleCount > 0 && veryStaleCount === 0 && (
        <div
          className="rounded-xl p-3 flex items-start gap-2.5"
          style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FF9F0A' }} />
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: '#FF9F0A' }}>
              {staleCount} data source{staleCount > 1 ? 's' : ''} may be stale.
            </span>{' '}
            Topology data may not reflect recent changes.
          </p>
        </div>
      )}

      {/* Source table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--app-surface)' }}>
              {['Source', 'Status', 'Records', 'Last Import', 'Topology Confidence', 'Traffic Confidence'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataSources.map((src) => (
              <tr
                key={src.source_name}
                style={{
                  borderBottom: '1px solid var(--app-border)',
                  background: src.status === 'VERY_STALE' ? 'rgba(255,69,58,0.03)'
                    : src.status === 'STALE' ? 'rgba(255,159,10,0.03)'
                    : 'transparent',
                }}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Database className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {SOURCE_DISPLAY[src.source_name] ?? src.display_name}
                    </span>
                    {WIP_SOURCES.has(src.source_name) && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: 'rgba(255,159,10,0.12)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,0.3)' }}
                      >
                        <Construction className="w-2.5 h-2.5" />
                        WIP
                      </span>
                    )}
                  </div>
                  {WIP_SOURCES.has(src.source_name) && (
                    <p className="text-[9px] mt-0.5 leading-tight" style={{ color: '#FF9F0A', maxWidth: 180 }}>
                      {WIP_GAP_NOTES[src.source_name]}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={src.status} />
                    <span
                      className="text-[11px] font-medium"
                      style={{
                        color: src.status === 'FRESH'      ? '#30D158'
                          : src.status === 'STALE'         ? '#FF9F0A'
                          : src.status === 'VERY_STALE'    ? '#FF453A'
                          : '#8E8E93',
                      }}
                    >
                      {src.status.replace('_', ' ')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {src.record_count}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <FreshnessIndicator lastUpdated={src.last_import} compact />
                </td>
                <ConfidenceCell level={src.topology_confidence} sourceName={src.source_name} dimension="topology" />
                <ConfidenceCell level={src.traffic_confidence}  sourceName={src.source_name} dimension="traffic" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Determinism legend */}
      <div
        className="rounded-xl p-3 flex items-start gap-3"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
        <div className="text-[11px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Confidence levels per the data availability specification:
          </span>
          <span><span className="font-semibold" style={{ color: '#30D158' }}>4 High</span> — Data is available and standardized (CMDB topology)</span>
          <span><span className="font-semibold" style={{ color: '#FF9F0A' }}>3 Moderate</span> — Available but not fully standardized (Prometheus, OEM topology)</span>
          <span><span className="font-semibold" style={{ color: '#FF453A' }}>2 Low</span> — Proprietary tool only, limited access (OEM traffic)</span>
          <span><span className="font-semibold" style={{ color: '#8E8E93' }}>1 Unknown</span> — No data available for this dimension</span>
        </div>
      </div>
    </div>
  );
}
