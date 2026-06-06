import React from 'react';
import {
  Database, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  CircleAlert as AlertCircle, CircleHelp as HelpCircle, Construction,
} from 'lucide-react';
import type { DataSourceInfo, FreshnessStatus } from '@/types';
import { CONFIDENCE_LABELS } from '@/lib/runtimeLocationMock';
import { ConfidenceBadge } from './ConfidenceBadge';

const getAgeCategory = (lastImportStr: string): number => {
  const ageMs = Date.now() - new Date(lastImportStr).getTime();
  const ageMin = ageMs / (1000 * 60);
  if (ageMin <= 30) return 0; // 0-30m
  if (ageMin <= 120) return 1; // 30m-2h
  if (ageMin <= 1440) return 2; // 2h-24h
  return 3; // >24h
};

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

      {/* Freshness Heatmap */}
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--app-border)', background: 'rgba(20,20,25,0.2)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-white/60" />
            <span className="text-[13px] font-bold text-white uppercase tracking-wider">Signals Freshness Heatmap</span>
          </div>
          <span className="text-[10px] text-white/40 font-mono">Updated real-time</span>
        </div>

        <div className="p-4 overflow-x-auto">
          <div className="min-w-[650px] flex flex-col gap-3">
            {/* Headers */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 px-2 pb-1 border-b border-white/5">
              <div className="col-span-4">Source System</div>
              <div className="col-span-5 grid grid-cols-4 gap-2 text-center">
                <span>0-30m</span>
                <span>30m-2h</span>
                <span>2h-24h</span>
                <span>&gt;24h</span>
              </div>
              <div className="col-span-3 text-right">Confidence & status</div>
            </div>

            {/* Rows */}
            {dataSources.map((src) => {
              const lastImportVal = src.last_import || new Date().toISOString();
              const ageCategory = getAgeCategory(lastImportVal);
              const ageMs = Date.now() - new Date(lastImportVal).getTime();
              const ageMin = ageMs / (1000 * 60);

              let ageText = '';
              if (ageMin < 1) {
                ageText = '<1m ago';
              } else if (ageMin < 60) {
                ageText = `${Math.round(ageMin)}m ago`;
              } else if (ageMin < 1440) {
                ageText = `${(ageMin / 60).toFixed(1)}h ago`;
              } else {
                ageText = `${(ageMin / 1440).toFixed(1)}d ago`;
              }

              const statusColor = src.status === 'FRESH' ? '#30D158'
                : src.status === 'STALE' ? '#FF9F0A'
                : src.status === 'VERY_STALE' ? '#FF453A'
                : '#8E8E93';

              return (
                <div
                  key={src.source_name}
                  className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl border transition-all hover:bg-white/[0.02]"
                  style={{
                    borderColor: 'rgba(255,255,255,0.03)',
                    background: 'rgba(255,255,255,0.01)',
                  }}
                >
                  {/* Column 1: Source Info */}
                  <div className="col-span-4 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 flex-shrink-0 text-white/40" />
                      <span className="text-[12px] font-bold text-white truncate">
                        {SOURCE_DISPLAY[src.source_name] ?? src.display_name}
                      </span>
                      {WIP_SOURCES.has(src.source_name) && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20"
                        >
                          WIP
                        </span>
                      )}
                    </div>
                    {WIP_SOURCES.has(src.source_name) ? (
                      <p className="text-[9px] mt-0.5 leading-tight" style={{ color: '#FF9F0A', maxWidth: 180 }}>
                        {WIP_GAP_NOTES[src.source_name]}
                      </p>
                    ) : (
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {src.record_count.toLocaleString()} records ingested
                      </p>
                    )}
                  </div>

                  {/* Column 2: The Heatmap Cells */}
                  <div className="col-span-5 grid grid-cols-4 gap-2 h-9">
                    {[0, 1, 2, 3].map((catIndex) => {
                      const isActive = ageCategory === catIndex;
                      
                      let cellBg = 'rgba(255,255,255,0.02)';
                      let cellBorder = '1px solid rgba(255,255,255,0.05)';
                      let textStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.15)' };

                      if (isActive) {
                        cellBg = `${statusColor}15`;
                        cellBorder = `1px solid ${statusColor}50`;
                        textStyle = { color: statusColor, fontWeight: 'bold', textShadow: `0 0 8px ${statusColor}30` };
                      }

                      return (
                        <div
                          key={catIndex}
                          className="rounded-lg flex items-center justify-center text-[10px] font-mono transition-all duration-300 relative overflow-hidden"
                          style={{
                            background: cellBg,
                            border: cellBorder,
                            ...textStyle
                          }}
                        >
                          {isActive ? (
                            <>
                              <span className="z-10">{ageText}</span>
                              <span
                                className="absolute inset-0 opacity-10 animate-pulse"
                                style={{ background: statusColor }}
                              />
                            </>
                          ) : (
                            <span className="opacity-30">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Column 3: Quality Metrics */}
                  <div className="col-span-3 flex flex-col items-end gap-1">
                    <div className="flex gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] text-white/30 uppercase font-mono mb-0.5">Topo</span>
                        <ConfidenceBadge level={src.topology_confidence as 1 | 2 | 3 | 4} />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] text-white/30 uppercase font-mono mb-0.5">Traffic</span>
                        <ConfidenceBadge level={src.traffic_confidence as 1 | 2 | 3 | 4} />
                      </div>
                    </div>
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5"
                      style={{ background: `${statusColor}15`, color: statusColor }}
                    >
                      {src.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
