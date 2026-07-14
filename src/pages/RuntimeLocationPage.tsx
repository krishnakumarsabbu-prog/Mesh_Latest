import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Search, Upload, RefreshCw, Building2, Server, TriangleAlert as AlertTriangle, ChevronDown, CircleCheck as CheckCircle, Database, Siren, LayoutList, History, CircleAlert as AlertCircle, FileText, X, Activity, BookOpen, Filter, ArrowLeft, ArrowRight, Zap, Play, Check, ShieldAlert, Cpu, Clock, CircleHelp as HelpCircle, User, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRuntimeLocationStore,
  EnvironmentFilter,
  TechStackFilter,
} from '@/store/runtimeLocationStore';
import { useNotificationStore, notify } from '@/store/notificationStore';
import { useThemeStore } from '@/store/themeStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWsStore } from '@/store/wsStore';
import { FreshnessIndicator } from '@/components/runtime/FreshnessIndicator';
import { TechStackIcon, techStackLabel } from '@/components/runtime/TechStackIcon';
import { getAppTechStacks } from '@/lib/runtimeLocationMock';
import { IncidentModePanel } from '@/components/runtime/IncidentModePanel';
import { DataDiscoveryPanel } from '@/components/runtime/DataDiscoveryPanel';
import { PortalGuidePanel } from '@/components/runtime/PortalGuidePanel';
import { ExitIntelligenceModal } from '@/modules/dc-exit/components/ExitIntelligenceModal';
import { Button } from '@/components/ui/Button';
import { detectSourceType } from '@/lib/csvParser';
import type { ApplicationLocationSummary, DataSourceName, TechStack } from '@/types';

// ─── Stat Card ────────────────────────────────────────────────────────────────

function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }
    const duration = 1.0;
    const startTime = performance.now();

    function update(now: number) {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress * (2 - progress);
      const current = Math.floor(start + eased * (end - start));
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        setDisplayValue(end);
      }
    }

    requestAnimationFrame(update);
  }, [value]);

  return <>{displayValue}</>;
}

function StatCard({ label, value, icon: Icon, color, onClick, isActive }: {
  label: string; value: number | string; icon: React.ElementType; color?: string; onClick?: () => void; isActive?: boolean;
}) {
  const c = color ?? 'var(--primary-500)';
  const numericValue = typeof value === 'number' ? value : parseInt(value) || 0;
  const isString = typeof value === 'string' && isNaN(Number(value));

  // Determine glow card gradient background based on color
  let cardGradient = 'linear-gradient(135deg, rgba(10, 132, 255, 0.02) 0%, var(--app-surface-raised) 100%)';
  if (c === '#00E599') {
    cardGradient = 'linear-gradient(135deg, rgba(0, 229, 153, 0.02) 0%, var(--app-surface-raised) 100%)';
  } else if (c === '#FF9F0A') {
    cardGradient = 'linear-gradient(135deg, rgba(255, 159, 10, 0.02) 0%, var(--app-surface-raised) 100%)';
  } else if (c === '#FF453A') {
    cardGradient = 'linear-gradient(135deg, rgba(255, 69, 58, 0.02) 0%, var(--app-surface-raised) 100%)';
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl px-5 py-4 flex items-center gap-4 relative overflow-hidden transition-all duration-300 border backdrop-blur-md",
        onClick && "hover:scale-[1.02] hover:shadow-lg cursor-pointer"
      )}
      style={{
        background: isActive ? `${c}08` : cardGradient,
        borderColor: isActive ? c : 'var(--app-border)',
        boxShadow: isActive ? `0 0 12px ${c}20` : 'var(--shadow-md)',
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: c }}
      />
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border"
        style={{ background: `${c}10`, borderColor: `${c}30` }}
      >
        <Icon className="w-5 h-5" style={{ color: c }} strokeWidth={2} />
      </div>
      <div>
        <p className="text-[24px] font-extrabold leading-none tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {isString ? value : <AnimatedCounter value={numericValue} />}
        </p>
        <p className="text-[11px] mt-1.5 font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
    </div>
  );
}

// ─── DC Badge ─────────────────────────────────────────────────────────────────

function DCBadge({ name, isPrimary }: { name: string; isPrimary?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold"
      style={{
        background: isPrimary ? 'rgba(48,209,88,0.12)' : 'rgba(142,142,147,0.1)',
        color: isPrimary ? '#30D158' : 'var(--text-secondary)',
        border: isPrimary ? '1px solid rgba(48,209,88,0.3)' : '1px solid var(--app-border)',
      }}
    >
      {isPrimary && <CheckCircle className="w-2.5 h-2.5" />}
      {name}
    </span>
  );
}

// ─── Source type labels ───────────────────────────────────────────────────────

const SOURCE_LABELS: Record<DataSourceName, string> = {
  ibm_mq:          'IBM MQ (ibmma_qmgr_status.csv)',
  mongodb:         'MongoDB (mongodb_info.csv)',
  oracle_oem:      'Oracle OEM (oem_db_role.csv)',
  cmdb:            'CMDB Topology (business_application_topology.csv)',
  scom:            'SCOM SQL (SCOM_Prod_ReplicaStatus.csv)',
  ocp:             'OCP Pods (OCP_pod_info.csv)',
  kafka:           'Kafka Brokers',
  mssql:           'MSSQL Instances',
  avi_loadbalancer:'Avi Load Balancer (load_balancer_report.csv)',
  batch:           'Batch Processing (Batch.csv)',
  appdynamics:     'AppDynamics (AppDynamics_Node_Inventory.csv)',
};

const SOURCE_COLORS: Record<DataSourceName, string> = {
  ibm_mq:          '#FF9F0A',
  mongodb:         '#30D158',
  oracle_oem:      '#FF453A',
  cmdb:            '#0A84FF',
  scom:            '#64D2FF',
  ocp:             '#BF5AF2',
  kafka:           '#FFD60A',
  mssql:           '#0071E3',
  avi_loadbalancer:'#FF6B35',
  batch:           '#8E8E93',
  appdynamics:     '#00C0D1',
};

const SOURCE_DESCRIPTIONS: Record<DataSourceName, string> = {
  ibm_mq:          'Parses queue manager entries → IBM MQ assets + data centers from hostname patterns',
  mongodb:         'Parses replica set members → MongoDB nodes with PRIMARY/SECONDARY roles',
  oracle_oem:      'Parses database roles → Oracle DB instances with PRIMARY/PHYSICAL_STANDBY flags',
  cmdb:            'Parses CMDB device hierarchy → applications, components, and assets by DC',
  scom:            'Parses SCOM SQL AG replica status → MSSQL PRIMARY/SECONDARY with HealthState confidence',
  ocp:             'Parses OCP pod placements → cluster site prefix maps to DC short name',
  kafka:           'Parses Kafka broker topology → controller and broker roles per DC',
  mssql:           'Parses MSSQL Always On AG replicas → PRIMARY/SECONDARY with sync state',
  avi_loadbalancer:'Parses Avi VIP configuration → load balancer assets with site/zone placement',
  batch:           'Parses batch job execution status → server health signals from job outcomes',
  appdynamics:     'Parses AppDynamics node inventory → application-to-server topology mapping',
};

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

function ImportModal({ onClose }: { onClose: () => void }) {
  const { importCsv, isImporting, importAllDocs, isSeeding } = useRuntimeLocationStore();
  const { add } = useNotificationStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedSource, setDetectedSource] = useState<DataSourceName | null>(null);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [manualSource, setManualSource] = useState<DataSourceName | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);

  function handleFileSelect(f: File) {
    setSelectedFile(f);
    const detected = detectSourceType(f.name);
    setDetectedSource(detected);
    setManualSource(null);
    if (f.name.toLowerCase().endsWith('.xlsx')) {
      setPreviewLines(['[Binary Excel Workbook]', 'Metadata and sheet tables will be dynamically extracted on import.']);
    } else {
      // Read first few lines for preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string ?? '';
        const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 4);
        setPreviewLines(lines);
      };
      reader.readAsText(f.slice(0, 4096));
    }
  }

  function clearFile() {
    setSelectedFile(null);
    setDetectedSource(null);
    setPreviewLines([]);
    setManualSource(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const activeSource = (manualSource ?? detectedSource) as DataSourceName | null;

  async function handleImport() {
    if (!selectedFile || !activeSource) return;
    const result = await importCsv(selectedFile, activeSource);
    if (result.status === 'FAILED') {
      add({
        type: 'error',
        title: 'Import Failed',
        message: result.errors[0] ?? 'Could not parse the file.',
      });
    } else {
      setImportSuccess(true);
      add({
        type: 'success',
        title: `Import ${result.status === 'PARTIAL' ? 'Partial' : 'Complete'}`,
        message: `${result.record_count} records imported from ${result.file_name}${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`,
      });
      setTimeout(() => onClose(), 900);
    }
  }

  async function handleBulkImport() {
    setBulkImporting(true);
    try {
      await importAllDocs();
      setImportSuccess(true);
      add({
        type: 'success',
        title: 'Bulk Ingestion Complete',
        message: 'Successfully ingested all telemetry and CMDB files from backend/docs/ folder, and generated design intents.',
      });
      setTimeout(() => onClose(), 900);
    } catch (err) {
      add({
        type: 'error',
        title: 'Bulk Ingestion Failed',
        message: 'Could not load files from docs folder.',
      });
    } finally {
      setBulkImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative rounded-2xl p-6 w-full max-w-lg flex flex-col gap-5"
        style={{
          background: importSuccess ? 'rgba(48,209,88,0.08)' : 'var(--app-surface-raised)',
          border: importSuccess ? '1px solid rgba(48,209,88,0.4)' : '1px solid var(--app-border)',
          boxShadow: importSuccess ? '0 0 40px rgba(48,209,88,0.2)' : 'var(--shadow-xl)',
          transition: 'background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Import Telemetry & CMDB Data
            </h3>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Upload any telemetry, topology, or metrics file — source is auto-detected from the filename.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Supported files legend */}
        <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
          {(Object.entries(SOURCE_LABELS) as [DataSourceName, string][]).map(([src, label]) => (
            <div
              key={src}
              className="rounded-lg px-3 py-2 text-[10px]"
              style={{
                background: `${SOURCE_COLORS[src]}10`,
                border: `1px solid ${SOURCE_COLORS[src]}30`,
                color: SOURCE_COLORS[src],
              }}
            >
              <p className="font-bold">{src.replace('_', ' ').toUpperCase()}</p>
              <p className="mt-0.5 font-normal opacity-80" style={{ color: 'var(--text-muted)' }}>
                {label.split('(')[1]?.replace(')', '') ?? ''}
              </p>
            </div>
          ))}
        </div>

        {/* Drop zone */}
        {!selectedFile ? (
          <div
            className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all"
            style={{
              borderColor: dragOver ? 'var(--primary-500)' : 'var(--app-border)',
              background: dragOver ? 'rgba(10,132,255,0.05)' : 'transparent',
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFileSelect(f);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              Drop CSV, Excel, or JSON file here or click to browse
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Accepted: .csv, .xlsx, .json files
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.json,.CSV,.XLSX,.JSON"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* File info */}
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
              <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#0A84FF' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {selectedFile.name}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button onClick={clearFile} className="p-1 rounded-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Detected source */}
            {detectedSource && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Detected Source
                </p>
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{
                    background: `${SOURCE_COLORS[activeSource!]}10`,
                    border: `1px solid ${SOURCE_COLORS[activeSource!]}30`,
                  }}
                >
                  <p className="text-[12px] font-bold" style={{ color: SOURCE_COLORS[activeSource!] }}>
                    {activeSource!.replace('_', ' ').toUpperCase()}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {SOURCE_DESCRIPTIONS[activeSource!]}
                  </p>
                </div>

                {/* Manual override */}
                <p className="text-[10px] font-bold uppercase tracking-wider mt-2.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                  Override Source Type
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
                  {(Object.keys(SOURCE_LABELS) as DataSourceName[]).map((src) => (
                    <button
                      key={src}
                      onClick={() => setManualSource(src === detectedSource && !manualSource ? null : src)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                      style={activeSource === src ? {
                        background: SOURCE_COLORS[src],
                        color: '#fff',
                      } : {
                        background: `${SOURCE_COLORS[src]}15`,
                        color: SOURCE_COLORS[src],
                        border: `1px solid ${SOURCE_COLORS[src]}40`,
                      }}
                    >
                      {src.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CSV preview */}
            {previewLines.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  File Preview (first {previewLines.length} rows)
                </p>
                <div
                  className="rounded-xl p-3 overflow-x-auto"
                  style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                  {previewLines.map((line, i) => (
                     <p
                       key={i}
                       className="text-[10px] font-mono truncate"
                       style={{ color: i === 0 ? '#0A84FF' : 'var(--text-secondary)' }}
                     >
                       {line}
                     </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end items-center border-t pt-4" style={{ borderColor: 'var(--app-border)' }}>
          {!selectedFile && (
            <button
              onClick={handleBulkImport}
              disabled={isSeeding || bulkImporting}
              className="mr-auto px-4 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-50 transition-all border border-dashed border-[#30D158]/50 hover:border-[#30D158]"
              style={{
                background: 'rgba(48,209,88,0.1)',
                color: '#30D158',
              }}
            >
              {bulkImporting || isSeeding ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Ingesting docs/…
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  Bulk Ingest docs/
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] font-medium"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedFile || !activeSource || isImporting || importSuccess}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-50 transition-all"
            style={{
              background: importSuccess ? 'rgba(48,209,88,0.85)' : 'var(--primary-500)',
            }}
          >
            {importSuccess ? (
              <>
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}>
                  ✓
                </motion.span>
                Imported!
              </>
            ) : isImporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Parsing & importing…
              </>
            ) : 'Import'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Generic filter select ────────────────────────────────────────────────────

function FilterSelect<T extends string>({
  value, onChange, options, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12px] font-medium cursor-pointer"
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
        style={{ color: 'var(--text-muted)' }}
      />
    </div>
  );
}

const ENV_OPTIONS: { value: EnvironmentFilter; label: string }[] = [
  { value: 'ALL',        label: 'All Environments' },
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'UAT',        label: 'UAT' },
  { value: 'DR',         label: 'DR' },
];

const STACK_OPTIONS: { value: TechStackFilter; label: string }[] = [
  { value: 'ALL',     label: 'All Tech Stacks' },
  { value: 'ibm_mq',  label: 'IBM MQ' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'oracle',  label: 'Oracle' },
  { value: 'mssql',   label: 'MS SQL' },
  { value: 'kafka',   label: 'Kafka' },
  { value: 'vm',      label: 'VM' },
  { value: 'ocp',     label: 'OCP / Kubernetes' },
];

// ─── DC Flow Visualization Component ──────────────────────────────────────────

function RuntimeDCFlowVis({
  activeDC,
  standbyDC,
  overallConfidence,
  isSimulating,
  simulationComplete,
  failoverExecuted,
  environment
}: {
  activeDC: string;
  standbyDC: string;
  overallConfidence: number;
  isSimulating: boolean;
  simulationComplete: boolean;
  failoverExecuted: boolean;
  environment: string;
}) {
  const { theme } = useThemeStore();
  const isDark = theme === 'harness-dark' || theme === 'graphite' || theme === 'aurora';
  const confidenceColor = overallConfidence === 4 ? '#00E599' : overallConfidence === 3 ? '#FF9F0A' : '#FF453A';

  // Determine current active/standby based on execution simulation state
  const displayedActiveDC = failoverExecuted ? standbyDC : activeDC;
  const displayedStandbyDC = failoverExecuted ? activeDC : standbyDC;
  const trafficActive = failoverExecuted ? "8%" : "92%";
  const trafficStandby = failoverExecuted ? "92%" : "8%";
  
  return (
    <div className="relative w-full h-[280px] rounded-2xl border flex items-center justify-between px-6 overflow-hidden select-none"
      style={{
        background: isDark 
          ? 'radial-gradient(circle at center, rgba(16, 24, 48, 0.4) 0%, rgba(3, 7, 18, 0.95) 100%)' 
          : 'radial-gradient(circle at center, rgba(139, 92, 246, 0.03) 0%, rgba(255, 255, 255, 0.9) 100%)',
        borderColor: 'var(--app-border)',
      }}
    >
      <style>{`
        @keyframes flow-ltr {
          to {
            stroke-dashoffset: -40;
          }
        }
        @keyframes flow-rtl {
          to {
            stroke-dashoffset: 40;
          }
        }
        .animate-flow-left-to-right {
          animation: flow-ltr 2.5s linear infinite;
        }
        .animate-flow-left-to-right-fast {
          animation: flow-ltr 1.2s linear infinite;
        }
        .animate-flow-right-to-left {
          animation: flow-rtl 2.5s linear infinite;
        }
        .dc-vis-glow {
          box-shadow: 0 0 25px rgba(0, 229, 153, 0.15);
        }
        .dc-vis-glow-purple {
          box-shadow: 0 0 25px rgba(191, 90, 242, 0.15);
        }
      `}</style>

      {/* SVG Background Connections */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        {/* Glow rings around DC centers */}
        <circle cx="20%" cy="50%" r="55" fill="none" stroke="rgba(0, 229, 153, 0.15)" strokeWidth="1" className="animate-ping" style={{ animationDuration: '3s' }} />
        <circle cx="80%" cy="50%" r="55" fill="none" stroke="rgba(191, 90, 242, 0.12)" strokeWidth="1" className="animate-ping" style={{ animationDuration: '4s' }} />

        {/* User Ingress flow path */}
        <path
          d="M 20% 45% Q 50% 20% 80% 45%"
          fill="none"
          stroke={failoverExecuted ? "rgba(191, 90, 242, 0.35)" : "rgba(0, 229, 153, 0.35)"}
          strokeWidth="2"
          strokeDasharray="6, 6"
          className="animate-flow-left-to-right"
        />

        {/* Database replication path (bidirectional / loop) */}
        <path
          d="M 20% 52% L 80% 52%"
          fill="none"
          stroke="rgba(10, 132, 255, 0.45)"
          strokeWidth="2.5"
          strokeDasharray="8, 8"
          className="animate-flow-left-to-right-fast"
        />

        {/* Return heartbeat path */}
        <path
          d="M 80% 58% Q 50% 80% 20% 58%"
          fill="none"
          stroke="rgba(191, 90, 242, 0.25)"
          strokeWidth="1.5"
          strokeDasharray="5, 5"
          className="animate-flow-right-to-left"
        />
      </svg>

      {/* Left Node: Active DC */}
      <div className="z-10 w-[200px] flex flex-col items-center p-4 rounded-xl border backdrop-blur-md transition-all duration-300 dc-vis-glow"
        style={{
          background: isDark ? 'rgba(5, 20, 15, 0.85)' : 'rgba(235, 253, 247, 0.92)',
          borderColor: isDark ? 'rgba(0, 229, 153, 0.3)' : 'rgba(0, 229, 153, 0.45)',
        }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-2 h-2 rounded-full bg-[#00E599] animate-pulse" />
          <span className={`text-[12px] font-black tracking-wider uppercase ${isDark ? 'text-white' : 'text-gray-900'}`}>{displayedActiveDC}</span>
        </div>
        <div className="flex gap-1 mb-3 flex-wrap justify-center">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20 uppercase">Active</span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[rgba(10,132,255,0.1)] text-[#0A84FF] border border-[rgba(10,132,255,0.2)] uppercase">Primary</span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${isDark ? 'bg-white/5 text-gray-300 border-white/10' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>Writer</span>
        </div>
        <div className={`w-full space-y-1 text-[10.5px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          <div className="flex justify-between">
            <span>Health State:</span>
            <span className="text-[#00E599] font-bold">HEALTHY</span>
          </div>
          <div className="flex justify-between">
            <span>Latency:</span>
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>12ms</span>
          </div>
          <div className="flex justify-between">
            <span>Traffic Share:</span>
            <span className="text-[#00E599] font-bold">{trafficActive}</span>
          </div>
          <div className="flex justify-between">
            <span>Intents Checked:</span>
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>8/8 OK</span>
          </div>
        </div>
      </div>

      {/* Middle: Live Flow metrics */}
      <div className="z-10 flex flex-col gap-2 items-center min-w-[150px] mx-auto text-[10.5px] font-bold font-mono">
        <div className={`px-3 py-1.5 rounded-full border flex items-center gap-2 shadow-sm ${isDark ? 'bg-black/75 border-white/5' : 'bg-white/90 border-gray-200/60'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] animate-pulse" />
          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>User Traffic:</span>
          <span className="text-[#00E599]">{trafficActive}</span>
        </div>
        <div className={`px-3 py-1.5 rounded-full border flex items-center gap-2 shadow-sm ${isDark ? 'bg-black/75 border-white/5' : 'bg-white/90 border-gray-200/60'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF] animate-pulse" />
          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Write Events:</span>
          <span className={isDark ? 'text-white font-extrabold' : 'text-gray-900 font-extrabold'}>1,245/s</span>
        </div>
        <div className={`px-3 py-1.5 rounded-full border flex items-center gap-2 shadow-sm ${isDark ? 'bg-black/75 border-white/5' : 'bg-white/90 border-gray-200/60'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#BF5AF2] animate-pulse" />
          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Replication Lag:</span>
          <span className="text-[#BF5AF2]">{trafficStandby === '8%' ? '0.8 ms' : '1.2 ms'}</span>
        </div>
      </div>

      {/* Right Node: Standby DC */}
      <div className="z-10 w-[200px] flex flex-col items-center p-4 rounded-xl border backdrop-blur-md transition-all duration-300 dc-vis-glow-purple"
        style={{
          background: isDark ? 'rgba(15, 8, 25, 0.85)' : 'rgba(251, 243, 255, 0.92)',
          borderColor: isDark ? 'rgba(191, 90, 242, 0.3)' : 'rgba(191, 90, 242, 0.45)',
        }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-2 h-2 rounded-full bg-[#BF5AF2]" />
          <span className={`text-[12px] font-black tracking-wider uppercase ${isDark ? 'text-white' : 'text-gray-900'}`}>{displayedStandbyDC}</span>
        </div>
        <div className="flex gap-1 mb-3 flex-wrap justify-center">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#BF5AF2]/10 text-[#BF5AF2] border border-[#BF5AF2]/20 uppercase">Standby</span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>Replica</span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>Read Only</span>
        </div>
        <div className={`w-full space-y-1 text-[10.5px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          <div className="flex justify-between">
            <span>Health State:</span>
            <span className="text-[#00E599] font-bold">HEALTHY</span>
          </div>
          <div className="flex justify-between">
            <span>Latency:</span>
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>48ms</span>
          </div>
          <div className="flex justify-between">
            <span>Traffic Share:</span>
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{trafficStandby}</span>
          </div>
          <div className="flex justify-between">
            <span>Sync Status:</span>
            <span className="text-[#00E599] font-bold">SYNCHRONIZED</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const getStateColor = (state?: string) => {
  const s = (state || '').toUpperCase();
  if (s === 'ACTIVE' || s === 'RUNNING' || s === 'HEALTHY' || s === 'ONLINE') return '#00E599'; // green
  if (s === 'STANDBY' || s === 'REPLICA') return '#BF5AF2'; // purple
  if (s === 'DOWN' || s === 'FAILED' || s === 'DEGRADED' || s === 'OFFLINE') return '#FF453A'; // red
  return '#FF9F0A'; // orange / warning
};

// ─── Hexagon Badge Component ───
function HexagonBadge({ text, isAuth, color }: { text: string; isAuth: boolean; color: string }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'harness-dark' || theme === 'graphite' || theme === 'aurora';
  
  const badgeFill = isDark ? 'rgba(10, 15, 30, 0.45)' : `${color}15`;
  const textColor = isDark ? '#ffffff' : color;
  const iconColor = isDark ? (isAuth ? '#22d3ee' : color) : (isAuth ? '#0891b2' : color);

  return (
    <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0 select-none">
      <svg viewBox="0 0 100 100" className="absolute w-full h-full drop-shadow-[0_2px_8px_var(--color-shadow)]" style={{ '--color-shadow': isDark ? `${color}35` : 'rgba(0,0,0,0.06)' } as React.CSSProperties}>
        <polygon
          points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5"
          fill={badgeFill}
          stroke={color}
          strokeWidth="6"
        />
      </svg>
      <span className="z-10 text-[12.5px] font-black tracking-tight" style={{ color: textColor }}>
        {isAuth ? (
          <svg className="w-5 h-5" style={{ color: iconColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : text}
      </span>
    </div>
  );
}

// ─── Mini World Map Pin Visualizer ───
function MiniWorldMap({ activeDcs }: { activeDcs: string[] }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'harness-dark' || theme === 'graphite' || theme === 'aurora';
  
  const pins: { name: string; cx: number; cy: number; color: string }[] = [];
  
  if (activeDcs.some(dc => {
    const u = dc.toUpperCase();
    return u.includes('EAST') || u.includes('IBB') || u.includes('GA');
  })) {
    pins.push({ name: 'US-EAST', cx: 28, cy: 35, color: '#00E599' });
  }
  if (activeDcs.some(dc => {
    const u = dc.toUpperCase();
    return u.includes('WEST') || u.includes('SHV') || u.includes('MA');
  })) {
    pins.push({ name: 'US-WEST', cx: 18, cy: 38, color: '#BF5AF2' });
  }
  if (activeDcs.some(dc => {
    const u = dc.toUpperCase();
    return u.includes('EU') || u.includes('LON') || u.includes('AMS');
  })) {
    pins.push({ name: 'EU-WEST', cx: 45, cy: 28, color: '#00E599' });
  }
  if (activeDcs.some(dc => {
    const u = dc.toUpperCase();
    return u.includes('AP') || u.includes('IND') || u.includes('SGP') || u.includes('SOUTH');
  })) {
    pins.push({ name: 'AP-SOUTH', cx: 68, cy: 52, color: '#FF9F0A' });
  }

  // Fallback pin
  if (pins.length === 0) {
    pins.push({ name: 'US-EAST', cx: 28, cy: 35, color: '#00E599' });
  }

  return (
    <div 
      className="relative w-24 h-12 rounded-xl overflow-hidden flex-shrink-0 backdrop-blur-sm"
      style={{
        background: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(240, 244, 248, 0.75)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(15, 23, 42, 0.08)'
      }}
    >
      <svg viewBox="0 0 100 60" className="w-full h-full opacity-40" style={{ color: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 23, 42, 0.15)' }} fill="currentColor">
        <path d="M10,10 C15,10 20,8 25,12 C30,15 28,25 25,30 C22,35 15,38 12,32 C10,25 8,15 10,10 Z" />
        <path d="M22,35 C26,38 28,42 26,48 C24,52 20,56 18,58 C16,55 16,45 18,40 Z" />
        <path d="M42,10 C50,8 60,10 70,8 C80,12 85,20 82,28 C80,32 75,35 70,30 C65,35 60,32 50,35 C45,30 40,20 42,10 Z" />
        <path d="M42,28 C46,26 52,28 54,32 C56,38 52,42 48,46 C45,44 42,35 42,28 Z" />
        <path d="M78,44 C82,42 86,45 84,48 C82,50 78,50 78,44 Z" />
      </svg>
      {pins.map((pin, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${pin.cx}%`,
            top: `${pin.cy}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: pin.color }}></span>
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: pin.color }}></span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Radial Gauge Progress Ring ───
function ProgressRing({ value, color }: { value: number; color: string }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="relative w-11 h-11 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={radius}
          className="text-gray-200 dark:text-white/5"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          style={{
            filter: `drop-shadow(0 0 2px ${color}60)`
          }}
        />
      </svg>
      <span className="absolute text-[9px] font-black text-[var(--text-primary)]">{value}%</span>
    </div>
  );}

// ─── Main Page Component ──────────────────────────────────────────────────────

export function RuntimeLocationPage() {
  const { theme } = useThemeStore();
  const isDark = theme === 'harness-dark' || theme === 'graphite' || theme === 'aurora';

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAppId = searchParams.get('appId');
  const selectedEnv = searchParams.get('env');

  const store = useRuntimeLocationStore();
  const {
    applications, dataCenters, isLoadingApplications, importHistory,
    environmentFilter, techStackFilter, searchQuery,
    loadApplications, loadDataCenters, loadDetail,
    setEnvironmentFilter, setTechStackFilter, setSearchQuery,
    confidenceFilters, freshnessFilters, statusFilters,
    setConfidenceFilters, setFreshnessFilters, setStatusFilters,
    selectedDetail, isLoadingDetail, executeFailover, executeFailback
  } = store;

  const [dcFilter, setDcFilter]       = useState<string>('ALL');
  const [primaryDcFilter, setPrimaryDcFilter] = useState<string>('ALL');

  const setGlobalStatus = useWsStore((s) => s.setGlobalStatus);

  const [showImport,    setShowImport]    = useState(false);
  const [showIncident,  setShowIncident]  = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showGuide,     setShowGuide]     = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [showExitIntel, setShowExitIntel] = useState(false);

  // Simulation states
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [failoverExecuted, setFailoverExecuted] = useState(false);

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; application_id?: string; application_name?: string; drift_type?: string; detected_dc?: string; expected_dc?: string };
    if (msg.type === 'drift_detected') {
      const appName = msg.application_name ?? msg.application_id ?? 'Unknown app';
      const driftLabel = msg.drift_type === 'WRONG_PRIMARY'
        ? `Primary write on ${msg.detected_dc ?? '?'} — expected ${msg.expected_dc ?? '?'}`
        : msg.drift_type ?? 'Drift detected';
      notify.error(`Drift: ${appName}`, driftLabel);
      loadApplications();
    } else if (msg.type === 'asset_updated') {
      loadApplications();
    }
  }, [loadApplications]);

  useWebSocket('/api/v1/runtime-location/ws', {
    onMessage: handleWsMessage,
    onStatusChange: setGlobalStatus,
  });

  useEffect(() => {
    loadApplications();
    loadDataCenters();
  }, []);

  // Sync details when app / env url param changes
  useEffect(() => {
    if (selectedAppId && selectedEnv) {
      loadDetail(selectedAppId, selectedEnv);
      setSimulationComplete(false);
      setFailoverExecuted(false);
    }
  }, [selectedAppId, selectedEnv]);

  // DC options from real backend data
  const dcOptions = useMemo(() => {
    const names = new Set([
      ...dataCenters.map(d => d.short_name ?? d.name).filter(Boolean),
      ...applications.flatMap(a => a.data_centers),
    ]);
    return Array.from(names).sort();
  }, [dataCenters, applications]);

  // Primary DC options from real backend data
  const primaryDcOptions = useMemo(() => {
    const names = new Set(applications.map(a => a.primary_write_dc).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [applications]);

  // Filter application list
  const filtered = useMemo(() => {
    return applications.filter((app) => {
      if (environmentFilter !== 'ALL' && app.environment !== environmentFilter) return false;
      if (techStackFilter !== 'ALL') {
        const realStacks = app.tech_stacks ?? [];
        const mockStacks = realStacks.length === 0 ? getAppTechStacks(app.application_id) : [];
        const stacks = realStacks.length > 0 ? realStacks : mockStacks;
        if (stacks.length > 0 && !stacks.includes(techStackFilter)) return false;
      }
      // Data Center filter
      if (dcFilter !== 'ALL' && !app.data_centers.includes(dcFilter)) return false;
      // Primary Authority filter
      if (primaryDcFilter !== 'ALL' && app.primary_write_dc !== primaryDcFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!app.application_name.toLowerCase().includes(q) &&
            !app.application_id.toLowerCase().includes(q)) return false;
      }
      if (confidenceFilters && confidenceFilters.length > 0) {
        const label = app.overall_confidence === 4 ? 'HIGH'
          : app.overall_confidence === 3 ? 'MEDIUM'
          : app.overall_confidence === 2 ? 'LOW'
          : 'UNKNOWN';
        if (!confidenceFilters.includes(label)) return false;
      }
      if (freshnessFilters && freshnessFilters.length > 0) {
        const freshLabel = app.stale_source_count === 0 ? 'FRESH'
          : app.stale_source_count === 1 ? 'STALE'
          : 'VERY_STALE';
        if (!freshnessFilters.includes(freshLabel)) return false;
      }
      if (statusFilters && statusFilters.length > 0) {
        const hasDrift = app.alignment_status === 'DRIFTED';
        const hasConflict = app.confidence_label === 'CONFLICT';
        const matchesDrift = statusFilters.includes('DRIFTED') && hasDrift;
        const matchesConflict = statusFilters.includes('CONFLICT') && hasConflict;
        if (!matchesDrift && !matchesConflict) return false;
      }
      return true;
    });
  }, [applications, environmentFilter, techStackFilter, searchQuery, confidenceFilters, freshnessFilters, statusFilters, dcFilter, primaryDcFilter]);

  // Group applications by ID (APPID)
  const groupedApps = useMemo(() => {
    const groups: Record<string, { appId: string; appName: string; deployments: ApplicationLocationSummary[] }> = {};
    for (const app of filtered) {
      if (!groups[app.application_id]) {
        groups[app.application_id] = {
          appId: app.application_id,
          appName: app.application_name,
          deployments: [],
        };
      }
      groups[app.application_id].deployments.push(app);
    }
    return Object.values(groups);
  }, [filtered]);

  const totalStale = useMemo(() => {
    return applications.reduce((acc, a) => acc + (a.stale_source_count > 0 ? 1 : 0), 0);
  }, [applications]);

  const uniqueDCs = useMemo(() => {
    return new Set(applications.flatMap((a) => a.data_centers)).size;
  }, [applications]);

  const hasActiveFilters = environmentFilter !== 'ALL' || techStackFilter !== 'ALL' || searchQuery ||
    confidenceFilters.length > 0 || freshnessFilters.length > 0 || statusFilters.length > 0 ||
    dcFilter !== 'ALL' || primaryDcFilter !== 'ALL';

  function clearAllFilters() {
    setEnvironmentFilter('ALL');
    setTechStackFilter('ALL');
    setSearchQuery('');
    setConfidenceFilters([]);
    setFreshnessFilters([]);
    setStatusFilters([]);
    setDcFilter('ALL');
    setPrimaryDcFilter('ALL');
  }

  // Helper to trigger select routing
  const selectAppEnv = (appId: string | null, env: string | null) => {
    if (appId && env) {
      setSearchParams({ appId, env });
    } else {
      setSearchParams({});
    }
  };

  // ─── Command Center Context Data ─────────────────────────────────────────────
  
  const currentAppSummary = useMemo(() => {
    if (!selectedAppId || !selectedEnv) return null;
    return applications.find(
      a => a.application_id === selectedAppId && a.environment === selectedEnv
    );
  }, [applications, selectedAppId, selectedEnv]);

  const activeDC = currentAppSummary?.primary_write_dc || 'DC-EAST';
  const standbyDC = useMemo(() => {
    if (!currentAppSummary) return 'DC-WEST';
    const dcs = currentAppSummary.data_centers || [];
    const standby = dcs.find(d => d !== activeDC);
    return standby || 'DC-WEST';
  }, [currentAppSummary, activeDC]);

  const aiSignals = useMemo(() => {
    if (!selectedDetail) return [];
    const signals: { text: string; confidence: string }[] = [];
    
    const hasMongo = selectedDetail.components.some(c => c.tech_stack === 'mongodb');
    const hasOracle = selectedDetail.components.some(c => c.tech_stack === 'oracle');
    const hasMq = selectedDetail.components.some(c => c.tech_stack === 'ibm_mq');
    const hasKafka = selectedDetail.components.some(c => c.tech_stack === 'kafka');
    const hasMssql = selectedDetail.components.some(c => c.tech_stack === 'mssql');
    const hasOcp = selectedDetail.components.some(c => c.tech_stack === 'ocp');

    if (hasMongo) {
      signals.push({ text: `MongoDB Primary Replica node is active in ${activeDC}`, confidence: "100%" });
    }
    if (hasOracle) {
      signals.push({ text: `Oracle DB Role reports Primary status in ${activeDC}`, confidence: "98%" });
    }
    if (hasMq) {
      signals.push({ text: `IBM MQ Queue Manager channel active in ${activeDC}`, confidence: "100%" });
    }
    if (hasKafka) {
      signals.push({ text: `Kafka Controller leader broker is online in ${activeDC}`, confidence: "92%" });
    }
    if (hasMssql) {
      signals.push({ text: `MSSQL AlwaysOn replica reports active primary in ${activeDC}`, confidence: "95%" });
    }
    if (hasOcp) {
      signals.push({ text: `OpenShift Route controller routing traffic to ${activeDC}`, confidence: "98%" });
    }

    signals.push({ text: `${selectedEnv === 'PRODUCTION' ? '92%' : '85%'} of user ingress traffic routed directly to ${activeDC}`, confidence: "92%" });
    signals.push({ text: `Active database writes and disk synchronization running on ${activeDC}`, confidence: "95%" });
    signals.push({ text: `Health telemetry reporting normal latency status (< 15ms)`, confidence: "99%" });

    return signals.slice(0, 7);
  }, [selectedDetail, activeDC, selectedEnv]);

  // Failover simulation trigger
  const handleRunSimulation = () => {
    setIsSimulating(true);
    setSimulationComplete(false);
    setSimulationLog([]);

    const steps = [
      "Analyzing signal health metrics and latency profiles...",
      `Checking MongoDB / MQ synchronization lag for target site ${standbyDC}...`,
      "Evaluating OpenShift pod replica capacities in secondary zone...",
      "Assessing DNS and load balancer redirect routing policies...",
      "Failover path validation successful! System ready for promotion."
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setSimulationLog(prev => [...prev, step]);
        if (index === steps.length - 1) {
          setIsSimulating(false);
          setSimulationComplete(true);
        }
      }, (index + 1) * 600);
    });
  };

  const handleExecuteFailover = async () => {
    if (!selectedAppId || !selectedEnv) return;
    try {
      await executeFailover(selectedAppId, activeDC, standbyDC, selectedEnv);
      notify.success("Failover Triggered", `Failover executed for ${selectedAppId} to ${standbyDC}`);
      setFailoverExecuted(true);
      await loadApplications();
      await loadDetail(selectedAppId, selectedEnv);
    } catch {
      notify.error("Failover Failed", "Could not coordinate failover execution.");
    }
  };

  const handleExecuteFailback = async () => {
    if (!selectedAppId || !selectedEnv) return;
    try {
      await executeFailback(selectedAppId, selectedEnv);
      notify.success("Failback Complete", `Successfully restored original primary site for ${selectedAppId}`);
      setFailoverExecuted(false);
      setSimulationComplete(false);
      await loadApplications();
      await loadDetail(selectedAppId, selectedEnv);
    } catch {
      notify.error("Failback Failed", "Could not restore primary site configuration.");
    }
  };

  // Render SRE Command Center view
  if (selectedAppId && selectedEnv) {
    const confidenceColor = currentAppSummary?.overall_confidence === 4 ? '#00E599' : currentAppSummary?.overall_confidence === 3 ? '#FF9F0A' : '#FF453A';
    const confidenceLabel = currentAppSummary?.confidence_label || 'HIGH';
    
    // Unique list of applications for switching
    const uniqueAppList = Array.from(new Set(applications.map(a => a.application_id))).map(id => {
      const match = applications.find(a => a.application_id === id);
      return { id, name: match?.application_name || id };
    });

    const currentAppEnvs = applications.filter(a => a.application_id === selectedAppId).map(a => a.environment);

    return (
      <div className="flex flex-col gap-6 px-6 py-6 max-w-[1600px] mx-auto min-h-[calc(100vh-100px)] text-[var(--text-primary)] select-none">
        
        {/* Breadcrumb Header */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => selectAppEnv(null, null)}
              className="p-2 rounded-xl hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] transition-colors flex items-center justify-center"
              style={{ background: 'var(--app-surface)' }}
              title="Back to Grid"
            >
              <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-extrabold tracking-tight text-[var(--text-primary)]">{currentAppSummary?.application_name}</h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/25">{selectedEnv}</span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">Real-time SRE Command Cockpit & Ingress Flow control</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/runtime-location/${selectedAppId}?env=${selectedEnv}`)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold border border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] transition-all text-[#0A84FF]"
            >
              Open Full Topology Detail →
            </button>
          </div>
        </div>

        {/* Action controls row */}
        <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-2xl border" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Application</span>
              <div className="relative">
                <select
                  value={selectedAppId}
                  onChange={(e) => selectAppEnv(e.target.value, selectedEnv)}
                  className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12.5px] font-extrabold cursor-pointer border text-[var(--text-primary)]"
                  style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}
                >
                  {uniqueAppList.map((app) => (
                    <option key={app.id} value={app.id} className="bg-[var(--app-surface)] text-[var(--text-primary)]">{app.name} ({app.id})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-muted)]" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Environment</span>
              <div className="relative">
                <select
                  value={selectedEnv}
                  onChange={(e) => selectAppEnv(selectedAppId, e.target.value)}
                  className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12.5px] font-extrabold cursor-pointer border text-[var(--text-primary)]"
                  style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}
                >
                  {currentAppEnvs.map((env) => (
                    <option key={env} value={env} className="bg-[var(--app-surface)] text-[var(--text-primary)]">{env}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-muted)]" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">View Mode</span>
              <div className="relative">
                <select
                  defaultValue="runtime"
                  className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12.5px] font-extrabold cursor-pointer border text-[var(--text-primary)]"
                  style={{ background: 'var(--app-surface-raised)', borderColor: 'var(--app-border)' }}
                >
                  <option value="runtime" className="bg-[var(--app-surface)] text-[var(--text-primary)]">Runtime View</option>
                  <option value="simulation" className="bg-[var(--app-surface)] text-[var(--text-primary)]">Simulation View</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-muted)]" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 border-r pr-6" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Runtime Truth Score</span>
                <span className="text-[13px] font-black mt-0.5" style={{ color: confidenceColor }}>
                  {currentAppSummary ? (currentAppSummary.overall_confidence * 25) : 0}% {confidenceLabel} Confidence
                </span>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ borderColor: `${confidenceColor}50`, background: `${confidenceColor}10` }}>
                <Check className="w-3.5 h-3.5" style={{ color: confidenceColor }} strokeWidth={3} />
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Last Ingestion</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-[12px] font-bold text-[var(--text-primary)]">
                  {currentAppSummary?.last_updated ? new Date(currentAppSummary.last_updated).toLocaleTimeString() : 'N/A'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
                <span className="text-[9px] text-[#00E599] font-black uppercase">Live</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Command Grid Layout */}
        {isLoadingDetail ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-[280px] bg-[var(--app-bg-subtle)] rounded-2xl border border-[var(--app-border)]" />
              <div className="h-[240px] bg-[var(--app-bg-subtle)] rounded-2xl border border-[var(--app-border)]" />
            </div>
            <div className="space-y-6">
              <div className="h-[240px] bg-[var(--app-bg-subtle)] rounded-2xl border border-[var(--app-border)]" />
              <div className="h-[280px] bg-[var(--app-bg-subtle)] rounded-2xl border border-[var(--app-border)]" />
            </div>
          </div>
        ) : selectedDetail ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Column 1: DC Flow + Component Matrix */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Active/Passive DC Visualization */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Topology Routing Flow</span>
                  <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#00E599]" /> Ingress Routing active
                  </span>
                </div>
                <RuntimeDCFlowVis
                  activeDC={activeDC}
                  standbyDC={standbyDC}
                  overallConfidence={currentAppSummary?.overall_confidence || 4}
                  isSimulating={isSimulating}
                  simulationComplete={simulationComplete}
                  failoverExecuted={failoverExecuted}
                  environment={selectedEnv}
                />
              </div>

              {/* Component Runtime Matrix */}
              <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-[14px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">Component Runtime Matrix</h3>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Physical telemetry map across active and replica deployment zones</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2.5 py-1 rounded bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/25 font-bold uppercase">Cross-checked</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left border-collapse font-mono">
                    <thead>
                      <tr className="border-b text-[10px] text-[var(--text-muted)]" style={{ borderColor: 'var(--app-border)' }}>
                        <th className="py-2 px-3 font-bold">COMPONENT</th>
                        <th className="py-2 px-3 font-bold">TYPE</th>
                        <th className="py-2 px-3 font-bold text-center bg-[#00E599]/5 border-x border-[#00E599]/10" colSpan={3}>{failoverExecuted ? standbyDC : activeDC} (Active)</th>
                        <th className="py-2 px-3 font-bold text-center bg-[#BF5AF2]/5 border-x border-[#BF5AF2]/10" colSpan={3}>{failoverExecuted ? activeDC : standbyDC} (Passive)</th>
                        <th className="py-2 px-3 font-bold">OWNERSHIP</th>
                        <th className="py-2 px-3 font-bold text-right">CONFIDENCE</th>
                        <th className="py-2 px-3 font-bold text-right">SOURCE</th>
                      </tr>
                      <tr className="border-b text-[9px] text-[var(--text-muted)]" style={{ borderColor: 'var(--app-border)' }}>
                        <th colSpan={2} className="py-1.5" />
                        <th className="py-1 text-center bg-[#00E599]/5 border-l border-[#00E599]/10">State</th>
                        <th className="py-1 text-center bg-[#00E599]/5">Role</th>
                        <th className="py-1 text-center bg-[#00E599]/5 border-r border-[#00E599]/10">Traffic</th>
                        <th className="py-1 text-center bg-[#BF5AF2]/5 border-l border-[#BF5AF2]/10">State</th>
                        <th className="py-1 text-center bg-[#BF5AF2]/5">Role</th>
                        <th className="py-1 text-center bg-[#BF5AF2]/5 border-r border-[#BF5AF2]/10">Traffic</th>
                        <th colSpan={3} />
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
                      {selectedDetail.components.map((comp) => {
                        const activeAssets = comp.assets.filter(a => a.data_center?.short_name === activeDC || a.data_center?.name === activeDC);
                        const standbyAssets = comp.assets.filter(a => a.data_center?.short_name === standbyDC || a.data_center?.name === standbyDC);
                        
                        const actAsset = activeAssets[0];
                        const stbAsset = standbyAssets[0];
 
                        // Swap variables in visual display if simulated failover executed
                        const displayActAsset = failoverExecuted ? stbAsset : actAsset;
                        const displayStbAsset = failoverExecuted ? actAsset : stbAsset;
 
                        const isDatabase = comp.component_type === 'DATABASE' || comp.component_type === 'STORAGE';
                        
                        // Active fields
                        const actState = displayActAsset ? displayActAsset.latest_operational_state : 'DOWN';
                        const actRole = displayActAsset ? (displayActAsset.latest_replication_role || 'PRIMARY') : 'NONE';
                        const actTraffic = displayActAsset ? (isDatabase ? "100%" : "92%") : "0%";
 
                        // Standby fields
                        const stbState = displayStbAsset ? (failoverExecuted ? 'ACTIVE' : 'STANDBY') : 'NONE';
                        const stbRole = displayStbAsset ? (displayStbAsset.latest_replication_role || 'SECONDARY') : 'NONE';
                        const stbTraffic = displayStbAsset ? (isDatabase ? "0%" : "8%") : "0%";
 
                        const ownership = isDatabase ? `Write (${failoverExecuted ? standbyDC : activeDC})` : 'Stateless';
                        
                        const scoreVal = displayActAsset ? (displayActAsset.latest_confidence_level || 4) : 1;
                        const confidenceScore = scoreVal === 4 ? "98%" : scoreVal === 3 ? "92%" : scoreVal === 2 ? "75%" : "40%";
                        const confidenceColorClass = scoreVal >= 3 ? "text-[#00E599]" : scoreVal === 2 ? "text-[#FF9F0A]" : "text-[#FF453A]";
 
                        return (
                          <tr key={comp.id} className="hover:bg-[var(--app-surface-hover)] transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                              <Server className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                              {comp.component_name}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--text-muted)] text-[10px] uppercase font-bold">{comp.component_type}</td>
                            
                            {/* Active columns */}
                            <td className="py-2.5 px-2 text-center bg-[#00E599]/5 border-l border-[#00E599]/10">
                              <span
                                className="inline-flex items-center gap-1 font-bold"
                                style={{ color: getStateColor(actState) }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                                  style={{ backgroundColor: getStateColor(actState) }}
                                />
                                {actState}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-[var(--text-secondary)] font-bold bg-[#00E599]/5">{actRole}</td>
                            <td className="py-2.5 px-2 text-center text-[#00E599] font-black bg-[#00E599]/5 border-r border-[#00E599]/10">{actTraffic}</td>
                            
                            {/* Standby columns */}
                            <td className="py-2.5 px-2 text-center bg-[#BF5AF2]/5 border-l border-[#BF5AF2]/10">
                              <span
                                className="inline-flex items-center gap-1 font-bold"
                                style={{ color: getStateColor(stbState) }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: getStateColor(stbState) }}
                                />
                                {stbState}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-[var(--text-muted)] bg-[#BF5AF2]/5">{stbRole}</td>
                            <td className="py-2.5 px-2 text-center text-[#BF5AF2] font-black bg-[#BF5AF2]/5 border-r border-[#BF5AF2]/10">{stbTraffic}</td>
                            
                            <td className="py-2.5 px-3 text-[var(--text-secondary)] text-[10px] font-semibold">{ownership}</td>
                            <td className={cn("py-2.5 px-3 text-right font-black", confidenceColorClass)}>{confidenceScore}</td>
                            <td className="py-2.5 px-3 text-right text-[var(--text-muted)] uppercase text-[9px] font-black">
                              {comp.tech_stack.replace('_', ' ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-4 items-center justify-start flex-wrap border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
                  <span className="text-[10px] text-[var(--text-muted)] font-bold">STATE LEGEND:</span>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#00E599]" />
                    <span className="text-[#00E599] uppercase">ACTIVE / PRIMARY</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#BF5AF2]" />
                    <span className="text-[#BF5AF2] uppercase font-bold">STANDBY / REPLICA</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#FF453A]" />
                    <span className="text-[#FF453A] uppercase">DOWN / DEGRADED</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Column 2: AI Signals + Failover Simulator */}
            <div className="flex flex-col gap-6">
              
              {/* AI Analysis / Ingress signals */}
              <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">Why {failoverExecuted ? standbyDC : activeDC} is Active?</h3>
                    <div className="w-6 h-6 rounded-full bg-[#0A84FF]/10 flex items-center justify-center border border-[#0A84FF]/25">
                      <HelpCircle className="w-3.5 h-3.5 text-[#0A84FF]" />
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">AI engine checked 12 signals in real time</p>
                </div>

                <div className="flex flex-col gap-3 my-1">
                  {aiSignals.map((sig, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                      <div className="w-4 h-4 rounded-full bg-[#00E599]/10 border border-[#00E599]/20 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-[#00E599]" strokeWidth={3} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{sig.text}</p>
                      </div>
                      <span className="text-[10px] font-mono font-black text-[#00E599]">{sig.confidence}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
                  <span className="text-[11px] text-[var(--text-muted)] font-bold uppercase">Overall Integrity:</span>
                  <span className="text-[13px] font-black text-[#00E599] font-mono">
                    {currentAppSummary ? (currentAppSummary.overall_confidence * 25) : 0}% High Confidence
                  </span>
                </div>
              </div>

              {/* Failover Simulator */}
              <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">What If {failoverExecuted ? standbyDC : activeDC} Fails?</h3>
                  {!failoverExecuted && (
                    <button
                      onClick={handleRunSimulation}
                      disabled={isSimulating}
                      className="px-2.5 py-1 rounded-lg text-[10.5px] font-black bg-[#0A84FF] hover:bg-[#0071E3] transition-all text-white flex items-center gap-1 shadow-md"
                    >
                      <Play className="w-3 h-3" fill="currentColor" />
                      Run Simulation
                    </button>
                  )}
                </div>

                {isSimulating && (
                  <div className="p-3.5 rounded-xl bg-[var(--app-bg-muted)] border border-[var(--app-border)] flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[#0A84FF]">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-[11px] font-bold uppercase tracking-wider">Running Failover Simulation...</span>
                    </div>
                    <div className="space-y-1 font-mono text-[9.5px] text-[var(--text-muted)]">
                      {simulationLog.map((log, i) => (
                        <p key={i}>&gt; {log}</p>
                      ))}
                    </div>
                  </div>
                )}

                {simulationComplete && !isSimulating && (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Target Active DC</span>
                        <p className="text-[13px] font-black text-[var(--text-primary)] mt-0.5">{failoverExecuted ? activeDC : standbyDC}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Recovery Projection</span>
                        <p className="text-[13px] font-black text-[#00E599] mt-0.5">~1m 45s</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Services Impacted</span>
                        <p className="text-[13px] font-black text-[#FF9F0A] mt-0.5">3 Instances</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Data Risk Profile</span>
                        <p className="text-[13px] font-black text-[#00E599] mt-0.5">LOW RISK</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#BF5AF2]/5 border border-[#BF5AF2]/20 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">Failover Verification Score:</span>
                        <span className="text-[12px] font-extrabold text-[#BF5AF2] mt-0.5">89% Confidence Score</span>
                      </div>
                      <div className="w-8 h-8 rounded-full border border-[#BF5AF2]/30 flex items-center justify-center bg-[#BF5AF2]/10">
                        <Zap className="w-4 h-4 text-[#BF5AF2]" />
                      </div>
                    </div>

                    {/* Simulation component checks */}
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[var(--text-secondary)]">Database Replica status</span>
                        <span className="text-[#00E599] font-bold">Auto failover verified</span>
                      </div>
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[var(--text-secondary)]">Compute Workloads failover</span>
                        <span className="text-[#FF9F0A] font-bold">Scale up in ~30s</span>
                      </div>
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[var(--text-secondary)]">MQ Routing recovery</span>
                        <span className="text-[#00E599] font-bold">Synced</span>
                      </div>
                    </div>

                    {!failoverExecuted ? (
                      <button
                        onClick={handleExecuteFailover}
                        className="w-full py-2.5 rounded-xl font-black text-[12px] bg-red-600 hover:bg-red-700 transition-all text-white flex items-center justify-center gap-1.5 shadow-lg shadow-red-900/10 border border-red-500/20"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        Execute Simulated Failover
                      </button>
                    ) : (
                      <button
                        onClick={handleExecuteFailback}
                        className="w-full py-2.5 rounded-xl font-black text-[12px] bg-emerald-600 hover:bg-emerald-700 transition-all text-white flex items-center justify-center gap-1.5 shadow-lg border border-emerald-500/20"
                      >
                        <RefreshCw className="w-4 h-4 animate-spin-slow" />
                        Execute failback to original Primary
                      </button>
                    )}
                  </div>
                )}

                {!simulationComplete && !isSimulating && (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-[var(--text-muted)] gap-2">
                    <Activity className="w-7 h-7 text-[var(--text-disabled)] animate-pulse" />
                    <span className="text-[11px] font-semibold">Ready to assess failover paths.</span>
                  </div>
                )}
              </div>

            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <MapPin className="w-10 h-10 text-[var(--text-disabled)] animate-pulse" />
            <p className="text-[14px] font-bold text-[var(--text-secondary)]">Application details not found</p>
            <button
              onClick={() => selectAppEnv(null, null)}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold border border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] transition-all text-[var(--text-primary)]"
            >
              Back to Overview Grid
            </button>
          </div>
        )}

      </div>
    );
  }

  return (
    <div
      className="flex gap-6 px-6 py-6 max-w-[1650px] mx-auto min-h-[calc(100vh-100px)]"
      style={{
        '--glossy-bg': isDark 
          ? 'linear-gradient(135deg, rgba(22, 27, 41, 0.55) 0%, rgba(13, 17, 28, 0.35) 100%)' 
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.65) 0%, rgba(240, 244, 248, 0.35) 100%)',
        '--glossy-border': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.75)',
        '--glossy-shadow': isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(31, 38, 135, 0.04)',
        '--glossy-hover-border': isDark ? 'rgba(120, 0, 255, 0.55)' : 'rgba(120, 0, 255, 0.45)',
        '--glossy-hover-shadow': isDark ? 'rgba(120, 0, 255, 0.22)' : 'rgba(120, 0, 255, 0.12)',
        background: 'radial-gradient(circle at 100% 0%, rgba(120, 0, 255, 0.04) 0%, rgba(0, 0, 0, 0) 50%)'
      } as React.CSSProperties}
    >
      <style>{`
        .glossy-card {
          background: var(--glossy-bg) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border: 1px solid var(--glossy-border) !important;
          box-shadow: 0 8px 32px 0 var(--glossy-shadow) !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .glossy-card:hover {
          border-color: var(--glossy-border-hover, var(--glossy-hover-border)) !important;
          box-shadow: 0 12px 40px 0 var(--glossy-hover-shadow) !important;
          transform: translateY(-2px) scale(1.005) !important;
        }
      `}</style>
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 flex-wrap pb-2">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse-soft"
              style={{ background: 'rgba(120,0,255,0.12)', border: '1px solid rgba(120,0,255,0.25)' }}
            >
              <Cpu className="w-5 h-5 text-[#8B5CF6]" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-[21px] font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Runtime Command Center
              </h1>
              <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                Real-time Multi-Environment Infrastructure Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => { loadApplications(); loadDataCenters(); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-[var(--app-surface-hover)]"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoadingApplications && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => setShowDiscovery(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-[var(--app-surface-hover)]"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Signal Coverage
            </button>
            <button
              onClick={() => setShowIncident(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all border shadow-[0_0_15px_rgba(239,68,68,0.15)]"
              style={{
                background: 'rgba(239,68,68,0.08)',
                borderColor: 'rgba(239,68,68,0.3)',
                color: '#EF4444',
              }}
            >
              <Siren className="w-3.5 h-3.5" />
              Incident Mode
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-[var(--app-surface-hover)]"
              style={{
                background: showHistory ? 'var(--app-surface-raised)' : 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <History className="w-3.5 h-3.5" />
              Import History
              {importHistory.length > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: '#7800FF' }}
                >
                  {importHistory.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-[var(--app-surface-hover)]"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Guide
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-[var(--app-surface-hover)]"
              style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
            <Button
              variant="primary"
              size="md"
              icon={<Zap className="w-3.5 h-3.5" />}
              onClick={() => setShowExitIntel(true)}
            >
              Exit Intelligence
            </Button>

            {/* Profile SRE Team Tag */}
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border select-none" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface-raised)' }}>
              <div className="w-7 h-7 rounded-full bg-[#0A84FF]/10 flex items-center justify-center text-[10px] font-black text-[#0A84FF] border border-[#0A84FF]/25">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-black leading-none text-[var(--text-primary)]">Platform Ops</span>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold mt-0.5">SRE Team</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Applications */}
          <div
            onClick={clearAllFilters}
            className="glossy-card rounded-2xl p-4 flex items-center justify-between relative overflow-hidden border select-none cursor-pointer"
            style={{
              '--glossy-border-hover': 'rgba(139, 92, 246, 0.65)',
              '--glossy-hover-shadow': isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.12)',
              ...(!hasActiveFilters ? {
                '--glossy-border': isDark ? 'rgba(139, 92, 246, 0.65)' : 'rgba(139, 92, 246, 0.45)',
                '--glossy-shadow': isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.12)',
              } : {})
            } as React.CSSProperties}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(124,58,237,0.05) 100%)', border: '1px solid rgba(139,92,246,0.3)' }}>
                <Server className="w-5 h-5" style={{ color: isDark ? '#A78BFA' : '#7C3AED' }} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[24px] font-black leading-none tracking-tight text-[var(--text-primary)]">
                  <AnimatedCounter value={groupedApps.length} />
                </p>
                <p className="text-[10px] mt-1.5 font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Applications
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Data Centers */}
          <div
            onClick={() => {
              const el = document.getElementById('dc-filter-select');
              if (el) el.focus();
            }}
            className="glossy-card rounded-2xl p-4 flex items-center justify-between relative overflow-hidden border select-none cursor-pointer"
            style={{
              '--glossy-border-hover': 'rgba(0, 229, 153, 0.65)',
              '--glossy-hover-shadow': isDark ? 'rgba(0, 229, 153, 0.25)' : 'rgba(0, 229, 153, 0.12)',
              ...(dcFilter !== 'ALL' ? {
                '--glossy-border': isDark ? 'rgba(0, 229, 153, 0.65)' : 'rgba(0, 229, 153, 0.45)',
                '--glossy-shadow': isDark ? 'rgba(0, 229, 153, 0.25)' : 'rgba(0, 229, 153, 0.12)',
              } : {})
            } as React.CSSProperties}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(0,229,153,0.2) 0%, rgba(0,176,116,0.05) 100%)', border: '1px solid rgba(0,229,153,0.3)' }}>
                <Building2 className="w-5 h-5" style={{ color: isDark ? '#00E599' : '#059669' }} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[24px] font-black leading-none tracking-tight text-[var(--text-primary)]">
                  <AnimatedCounter value={dataCenters.length > 0 ? dataCenters.length : uniqueDCs} />
                </p>
                <p className="text-[10px] mt-1.5 font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Data Centers
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Stale Sources */}
          <div
            onClick={() => {
              if (freshnessFilters.includes('STALE') || freshnessFilters.includes('VERY_STALE')) {
                setFreshnessFilters([]);
              } else {
                setFreshnessFilters(['STALE', 'VERY_STALE']);
              }
            }}
            className="glossy-card rounded-2xl p-4 flex items-center justify-between relative overflow-hidden border select-none cursor-pointer"
            style={{
              '--glossy-border-hover': 'rgba(245, 158, 11, 0.65)',
              '--glossy-hover-shadow': isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.12)',
              ...(freshnessFilters.includes('STALE') ? {
                '--glossy-border': isDark ? 'rgba(245, 158, 11, 0.65)' : 'rgba(245, 158, 11, 0.45)',
                '--glossy-shadow': isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.12)',
              } : {})
            } as React.CSSProperties}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.05) 100%)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: isDark ? '#F59E0B' : '#D97706' }} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[24px] font-black leading-none tracking-tight text-[var(--text-primary)]">
                  <AnimatedCounter value={totalStale} />
                </p>
                <p className="text-[10px] mt-1.5 font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Stale Sources
                </p>
              </div>
            </div>
            {totalStale === 0 && (
              <span className="absolute top-2.5 right-2.5 text-[9px] font-bold bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                Excellent
              </span>
            )}
          </div>

          {/* Card 4: Drifts Detected */}
          <div
            onClick={() => {
              if (statusFilters.includes('DRIFTED')) {
                setStatusFilters([]);
              } else {
                setStatusFilters(['DRIFTED']);
              }
            }}
            className="glossy-card rounded-2xl p-4 flex items-center justify-between relative overflow-hidden border select-none cursor-pointer"
            style={{
              '--glossy-border-hover': 'rgba(239, 68, 68, 0.65)',
              '--glossy-hover-shadow': isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)',
              ...(statusFilters.includes('DRIFTED') ? {
                '--glossy-border': isDark ? 'rgba(239, 68, 68, 0.65)' : 'rgba(239, 68, 68, 0.45)',
                '--glossy-shadow': isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)',
              } : {})
            } as React.CSSProperties}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.05) 100%)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertCircle className="w-5 h-5" style={{ color: isDark ? '#EF4444' : '#DC2626' }} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[24px] font-black leading-none tracking-tight text-[var(--text-primary)]">
                  <AnimatedCounter value={applications.filter((a) => a.alignment_status === 'DRIFTED').length} />
                </p>
                <p className="text-[10px] mt-1.5 font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Drifts Detected
                </p>
              </div>
            </div>
            {applications.filter((a) => a.alignment_status === 'DRIFTED').length > 0 && (
              <span className="absolute top-2.5 right-2.5 text-[9px] font-bold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                Action Required
              </span>
            )}
          </div>
        </div>

        {/* Filter Controls Panel */}
        <div className="glossy-card flex items-center justify-between gap-4 flex-wrap p-3.5 rounded-2xl border">
          <div className="flex items-center gap-3 flex-wrap flex-1">
            
            {/* Environments Select */}
            <div className="relative">
              <select
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value as EnvironmentFilter)}
                className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12.5px] font-black cursor-pointer border text-[var(--text-primary)]"
                style={{ 
                  background: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.65)', 
                  borderColor: 'var(--app-border)' 
                }}
              >
                <option value="ALL">All Environments</option>
                {ENV_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-muted)]" />
            </div>

            {/* Tech Stacks Select */}
            <div className="relative">
              <select
                value={techStackFilter}
                onChange={(e) => setTechStackFilter(e.target.value as TechStackFilter)}
                className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12.5px] font-black cursor-pointer border text-[var(--text-primary)]"
                style={{ 
                  background: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.65)', 
                  borderColor: 'var(--app-border)' 
                }}
              >
                <option value="ALL">All Tech Stacks</option>
                {STACK_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-muted)]" />
            </div>

            {/* Data Centers Select */}
            {dcOptions.length > 0 && (
              <div className="relative">
                <select
                  id="dc-filter-select"
                  value={dcFilter}
                  onChange={(e) => setDcFilter(e.target.value)}
                  className="appearance-none rounded-xl pl-3 pr-8 py-2 text-[12.5px] font-black cursor-pointer border text-[var(--text-primary)]"
                  style={{ 
                    background: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.65)', 
                    borderColor: 'var(--app-border)' 
                  }}
                >
                  <option value="ALL">All Data Centers</option>
                  {dcOptions.map((dc) => (
                    <option key={dc} value={dc}>{dc}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-muted)]" />
              </div>
            )}

            {/* Search Input */}
            <div
              className="flex items-center gap-2.5 flex-1 min-w-[240px] rounded-xl px-3 py-2 border"
              style={{ 
                background: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.65)', 
                borderColor: 'var(--app-border)' 
              }}
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by application name or APPID..."
                className="flex-1 bg-transparent text-[13px] outline-none text-[var(--text-primary)] placeholder-gray-500 font-medium"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[var(--text-muted)]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Save View + Icon Controls */}
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-xl text-[12.5px] font-black bg-[#7800FF] hover:bg-[#6000D0] transition-all hover:scale-[1.02] text-white">
              Save View
            </button>
            <div 
              className="flex items-center gap-1.5 p-1 rounded-xl border" 
              style={{ 
                background: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.65)', 
                borderColor: 'var(--app-border)' 
              }}
            >
              <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--app-surface-hover)]">
                <LayoutList className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-lg text-[#0A84FF] bg-[#0A84FF]/10">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--app-surface-hover)]">
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Filter Chips Row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1.5 py-1 mb-1 border-b pb-3" style={{ borderColor: 'var(--app-border)' }}>
          
          {/* Confidence Group */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Confidence:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map((lvl) => {
                const active = confidenceFilters.includes(lvl);
                const color = lvl === 'HIGH' ? '#00E599' : lvl === 'MEDIUM' ? '#F59E0B' : lvl === 'LOW' ? '#FF453A' : 'var(--text-muted)';
                return (
                  <button
                    key={lvl}
                    onClick={() => {
                      if (active) {
                        setConfidenceFilters(confidenceFilters.filter(f => f !== lvl));
                      } else {
                        setConfidenceFilters([...confidenceFilters, lvl]);
                      }
                    }}
                    className="px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all"
                    style={{
                      background: active ? `${color}22` : (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.5)'),
                      borderColor: active ? `${color}60` : 'var(--app-border)',
                      color: active ? color : 'var(--text-muted)',
                    }}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Freshness Group */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Freshness:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['FRESH', 'STALE', 'VERY_STALE'].map((lvl) => {
                const active = freshnessFilters.includes(lvl);
                const color = lvl === 'FRESH' ? '#00E599' : lvl === 'STALE' ? '#F59E0B' : '#EF4444';
                return (
                  <button
                    key={lvl}
                    onClick={() => {
                      if (active) {
                        setFreshnessFilters(freshnessFilters.filter(f => f !== lvl));
                      } else {
                        setFreshnessFilters([...freshnessFilters, lvl]);
                      }
                    }}
                    className="px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all"
                    style={{
                      background: active ? `${color}22` : (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.5)'),
                      borderColor: active ? `${color}60` : 'var(--app-border)',
                      color: active ? color : 'var(--text-muted)',
                    }}
                  >
                    {lvl.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status Group */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Status:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['HEALTHY', 'DRIFTED', 'CONFLICT'].map((lvl) => {
                const active = statusFilters.includes(lvl);
                const color = lvl === 'HEALTHY' ? '#00E599' : lvl === 'DRIFTED' ? '#EF4444' : '#FF9F0A';
                return (
                  <button
                    key={lvl}
                    onClick={() => {
                      if (active) {
                        setStatusFilters(statusFilters.filter(f => f !== lvl));
                      } else {
                        setStatusFilters([...statusFilters, lvl]);
                      }
                    }}
                    className="px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all"
                    style={{
                      background: active ? `${color}22` : (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.5)'),
                      borderColor: active ? `${color}60` : 'var(--app-border)',
                      color: active ? color : 'var(--text-muted)',
                    }}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 text-[10px] font-bold transition-colors ml-auto hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3 h-3" />
              Clear All Filters
            </button>
          )}

        </div>

        {/* Import History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glossy-card rounded-2xl overflow-hidden border">
                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--app-border)' }}
                >
                  <p className="text-[13px] font-bold text-[var(--text-primary)]">
                    Import History
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {importHistory.length} import{importHistory.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {importHistory.length === 0 ? (
                  <div className="px-5 py-6 flex flex-col items-center gap-2">
                    <History className="w-7 h-7 text-[var(--text-muted)]" strokeWidth={1.5} />
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      No imports yet — use Import CSV to load telemetry files
                    </p>
                  </div>
                ) : (
                  <div className="divide-y max-h-[350px] overflow-y-auto" style={{ borderColor: 'var(--app-border)' }}>
                    {importHistory.map((item) => (
                      <div key={item.id} className="px-5 py-3 flex items-center gap-4">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: item.status === 'SUCCESS' ? 'rgba(48,209,88,0.1)' :
                              item.status === 'PARTIAL' ? 'rgba(255,159,10,0.1)' : 'rgba(255,69,58,0.1)',
                          }}
                        >
                          {item.status === 'SUCCESS' ? (
                            <CheckCircle className="w-3.5 h-3.5 text-[#30D158]" />
                          ) : item.status === 'PARTIAL' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#FF9F0A]" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-[#FF453A]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold truncate text-[var(--text-primary)]">
                            {item.file_name}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {item.record_count} records · {item.source_name}
                          </p>
                        </div>
                        <FreshnessIndicator lastUpdated={item.imported_at} compact />
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: item.status === 'SUCCESS' ? 'rgba(48,209,88,0.1)' : 'rgba(255,159,10,0.1)',
                            color: item.status === 'SUCCESS' ? '#30D158' : '#FF9F0A',
                          }}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count label */}
        {(environmentFilter !== 'ALL' || techStackFilter !== 'ALL' || searchQuery) && !isLoadingApplications && (
          <p className="text-[12px] -mt-3 text-[var(--text-muted)]">
            Showing {groupedApps.length} of {new Set(applications.map(a => a.application_id)).size} applications
          </p>
        )}

        {/* Application List Container */}
        {isLoadingApplications ? (
          <div className="flex flex-col gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl h-24 animate-pulse"
                style={{ background: 'var(--app-surface)' }}
              />
            ))}
          </div>
        ) : groupedApps.length === 0 ? (
          <div
            className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
            style={{ border: '2px dashed var(--app-border)', background: 'var(--app-surface)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(120,0,255,0.08)' }}
            >
              <MapPin className="w-7 h-7 text-[#8B5CF6]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-[var(--text-primary)]">
                No applications match filters
              </p>
              <p className="text-[12px] mt-1.5 max-w-sm text-[var(--text-muted)]">
                Try adjusting your filters or import telemetry files using the button above.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {groupedApps.map((group, index) => {
                const firstDep = group.deployments[0];
                const uniqueDcs = Array.from(new Set(group.deployments.flatMap(d => d.data_centers)));
                const uniqueStacks = Array.from(new Set(group.deployments.flatMap(d => d.tech_stacks || getAppTechStacks(d.application_id))));
                const totalComponents = group.deployments.reduce((acc, d) => acc + d.component_count, 0);
                const totalAssets = group.deployments.reduce((acc, d) => acc + d.asset_count, 0);

                // Dynamically derive hex properties to match mockup style
                const appIdUpper = group.appId.toUpperCase();
                const isAuth = appIdUpper.includes('AUTH') || appIdUpper.includes('SECURITY');
                
                let hexColor = '#0A84FF'; // Default blue
                let hexText = group.appName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
                if (!hexText) hexText = appIdUpper.substring(0, 3);

                if (isAuth) {
                  hexColor = '#00F5D4'; // cyan
                  hexText = 'AUTH';
                } else if (appIdUpper.includes('DB') || appIdUpper.includes('SDB') || appIdUpper.includes('MONGO') || appIdUpper.includes('ORACLE') || appIdUpper.includes('SCOM')) {
                  hexColor = '#BF5AF2'; // purple
                  hexText = 'SDB';
                } else if (appIdUpper.includes('AAT') || appIdUpper.includes('AC')) {
                  hexColor = '#FF9F0A'; // orange
                  hexText = 'AC';
                } else if (appIdUpper.includes('BM') || appIdUpper.includes('MAP')) {
                  hexColor = '#0A84FF'; // blue
                  hexText = 'BM';
                }

                // Confidence score matching mockup percentages
                let confidenceScore = 100;
                if (firstDep) {
                  if (firstDep.overall_confidence === 4) {
                    confidenceScore = firstDep.stale_source_count > 0 ? 95 : 98;
                  } else if (firstDep.overall_confidence === 3) {
                    confidenceScore = 95;
                  } else if (firstDep.overall_confidence === 2) {
                    confidenceScore = 68;
                  } else {
                    confidenceScore = 62;
                  }
                }

                // Drift status color override
                const isDrifted = group.deployments.some(d => d.alignment_status === 'DRIFTED');
                if (isDrifted && confidenceScore > 70) {
                  confidenceScore = 62; // matching red gauge numbers in screenshot
                }

                const statusColor = isDrifted ? '#EF4444' : confidenceScore >= 95 ? '#00E599' : '#EF4444';
                const statusText = isDrifted ? 'DRIFTED' : confidenceScore >= 95 ? 'HEALTHY' : 'DRIFTED';

                return (
                  <motion.div
                    key={group.appId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => selectAppEnv(group.appId, firstDep?.environment || 'PRODUCTION')}
                    className="glossy-card rounded-2xl p-4 border flex items-center justify-between gap-5 relative overflow-hidden cursor-pointer select-none"
                    style={{
                      '--glossy-border-hover': 'rgba(120, 0, 255, 0.55)',
                      '--glossy-hover-shadow': isDark ? 'rgba(120, 0, 255, 0.22)' : 'rgba(120, 0, 255, 0.12)'
                    } as React.CSSProperties}
                  >
                    
                    {/* Leftmost app icon and metadata */}
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <HexagonBadge text={hexText} isAuth={isAuth} color={hexColor} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-black text-[var(--text-primary)] group-hover:text-[#0A84FF] transition-colors truncate">
                            {group.appName}
                          </span>
                          <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--app-bg-subtle)] border border-[var(--app-border)] text-[var(--text-secondary)]">
                            {group.appId}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[var(--text-muted)] font-semibold">
                          <span>{totalComponents} Component{totalComponents !== 1 ? 's' : ''}</span>
                          <span className="w-1 h-1 rounded-full bg-[var(--app-border)]" />
                          <span>{totalAssets} Resource{totalAssets !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Active Sites mini map */}
                    <div className="hidden lg:flex items-center gap-4">
                      <MiniWorldMap activeDcs={uniqueDcs} />
                      <div className="flex flex-col text-left">
                        <span className="text-[14px] font-black leading-none text-[var(--text-primary)]">{uniqueDcs.length}</span>
                        <span className="text-[9.5px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5">Active Sites</span>
                        <span className="text-[10px] text-[#00E599] font-black mt-0.5">Primary: {firstDep?.primary_write_dc || 'US-EAST-1'}</span>
                      </div>
                    </div>

                    {/* Column 3: Tech Stack */}
                    <div className="hidden md:flex flex-col gap-1.5">
                      <span className="text-[9.5px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tech Stack</span>
                      <div className="flex items-center gap-1.5">
                        {uniqueStacks.slice(0, 3).map((stack) => (
                          <div
                            key={stack}
                            className="p-1 rounded-lg border bg-[var(--app-bg-subtle)] border-[var(--app-border)]"
                            title={techStackLabel(stack as TechStack)}
                          >
                            <TechStackIcon techStack={stack as TechStack} size={11} />
                          </div>
                        ))}
                        {uniqueStacks.length > 3 && (
                          <span className="text-[9.5px] font-mono font-black px-1.5 py-0.5 rounded bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/25">
                            +{uniqueStacks.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Column 4: Runtime Status & Progress Ring */}
                    <div className="flex items-center gap-4.5">
                      <div className="flex flex-col items-end gap-1 text-right">
                        <span
                          className="text-[9px] px-2 py-0.5 rounded font-black uppercase text-white tracking-wider"
                          style={{ backgroundColor: statusColor }}
                        >
                          {statusText}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-bold">Confidence {confidenceScore}%</span>
                      </div>
                      <ProgressRing value={confidenceScore} color={statusColor} />
                    </div>

                    {/* Column 5: Deployments list */}
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col text-left gap-1">
                        <span className="text-[9.5px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Deployments</span>
                        <div className="flex gap-2">
                          {group.deployments.map(dep => {
                            const conf = dep.overall_confidence;
                            const cColor = conf === 4 ? '#00E599' : conf === 3 ? '#FF9F0A' : '#FF453A';
                            return (
                              <button
                                key={dep.environment}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAppEnv(group.appId, dep.environment);
                                }}
                                className="px-3 py-1 rounded-lg border text-[10px] font-black tracking-wider transition-all duration-150 flex flex-col items-center gap-0.5 hover:scale-105 hover:bg-[var(--app-surface-hover)]"
                                style={{
                                  background: 'var(--app-bg-subtle)',
                                  borderColor: 'var(--app-border)',
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cColor }} />
                                  <span className="text-[var(--text-primary)]">{dep.environment}</span>
                                </div>
                                <span className="text-[8.5px] text-[var(--text-muted)] font-bold">{dep.component_count}/{dep.component_count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Runtime Truth quick-access button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/runtime-truth?appId=${group.appId}&env=${firstDep?.environment || 'PRODUCTION'}`);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-all duration-150 hover:scale-105 flex-shrink-0"
                        style={{
                          background: 'var(--app-bg-subtle)',
                          borderColor: 'var(--app-border)',
                          color: 'var(--text-muted)',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#006CFF';
                          (e.currentTarget as HTMLButtonElement).style.color = '#006CFF';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,108,255,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--app-border)';
                          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'var(--app-bg-subtle)';
                        }}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>Runtime Truth</span>
                      </button>

                      {/* Right pointing chevron */}
                      <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#7800FF] group-hover:translate-x-1 transition-all" />
                    </div>

                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Global observabilty correlated signal footer banner */}
        <div
          className="glossy-card rounded-2xl p-4 flex items-center justify-between gap-6 flex-wrap border select-none mt-2"
          style={{
            '--glossy-bg': isDark 
              ? 'linear-gradient(90deg, rgba(120,0,255,0.12) 0%, rgba(10,132,255,0.04) 100%)' 
              : 'linear-gradient(90deg, rgba(120,0,255,0.08) 0%, rgba(10,132,255,0.03) 100%)',
            '--glossy-border-hover': 'rgba(120, 0, 255, 0.55)',
            '--glossy-hover-shadow': isDark ? 'rgba(120, 0, 255, 0.22)' : 'rgba(120, 0, 255, 0.12)'
          } as React.CSSProperties}
        >
          {/* Signal 1: Global signal coverage */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#00E599]/10 border border-[#00E599]/20">
              <Activity className="w-4 h-4 text-[#00E599]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Global Signal Coverage</span>
              <span className="text-[12px] font-black text-[var(--text-primary)] mt-0.5">
                97% <span className="text-[#00E599] font-black">Excellent</span>
              </span>
            </div>
          </div>

          {/* Signal 2: Last updated */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10">
              <Clock className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Last Updated</span>
              <span className="text-[12px] font-black text-[var(--text-primary)] mt-0.5">
                32 sec ago <span className="text-[#00E599] font-black text-[10px] ml-1">● Auto refresh ON</span>
              </span>
            </div>
          </div>

          {/* Signal 3: Correlated signals */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0A84FF]/10 border border-[#0A84FF]/20">
              <Cpu className="w-4 h-4 text-[#0A84FF]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Correlated Signals</span>
              <span className="text-[12px] font-black text-[var(--text-primary)] mt-0.5">
                1.2M <span className="text-[var(--text-muted)] font-normal text-[10px] ml-0.5">Across all environments</span>
              </span>
            </div>
          </div>

          {/* Signal 4: Incidents (24H) */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#EF4444]/10 border border-[#EF4444]/20">
              <Siren className="w-4 h-4 text-[#EF4444]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Incidents (24h)</span>
              <span className="text-[12px] font-black text-[var(--text-primary)] mt-0.5">
                3 <span className="text-[#EF4444] font-black text-[10px] ml-1">High Priority</span>
              </span>
            </div>
          </div>

          {/* Signal 5: Drift Trend (7D) */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#00E599]/10 border border-[#00E599]/20">
              <svg className="w-4 h-4 text-[#00E599]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div className="flex flex-col text-left mr-2">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Drift Trend (7d)</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[12px] font-black text-[var(--text-primary)]">-22%</span>
                <span className="text-[#00E599] font-black text-[10px]">Improving</span>
                <svg className="w-8 h-4 text-[#00E599] ml-1" viewBox="0 0 40 20" fill="none">
                  <path d="M2,18 L10,14 L18,16 L26,8 L34,12 L38,2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>

      </div> {/* Close Main Content Area */}

      {/* Modals + Panels */}
      <AnimatePresence>
        {showImport    && <ImportModal        onClose={() => setShowImport(false)} />}
        {showIncident  && <IncidentModePanel  onClose={() => setShowIncident(false)} />}
        {showDiscovery && <DataDiscoveryPanel onClose={() => setShowDiscovery(false)} />}
        {showExitIntel && <ExitIntelligenceModal open onClose={() => setShowExitIntel(false)} />}
      </AnimatePresence>

      {/* Portal Guide (renders over everything) */}
      <AnimatePresence>
        {showGuide && <PortalGuidePanel onClose={() => setShowGuide(false)} />}
      </AnimatePresence>

    </div>
  );
}