import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Search, Upload, RefreshCw, Building2, Server,
  TriangleAlert as AlertTriangle, ChevronDown, CircleCheck as CheckCircle,
  Database, Zap, Siren, LayoutList, Play, History, CircleAlert as AlertCircle,
  FileText, X, Clock, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRuntimeLocationStore,
  EnvironmentFilter,
  TechStackFilter,
  selectFilteredApplications,
} from '@/store/runtimeLocationStore';
import { useNotificationStore, notify } from '@/store/notificationStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWsStore } from '@/store/wsStore';
import { ConfidenceBadge } from '@/components/runtime/ConfidenceBadge';
import { FreshnessIndicator } from '@/components/runtime/FreshnessIndicator';
import { TechStackIcon, techStackLabel } from '@/components/runtime/TechStackIcon';
import { getAppTechStacks } from '@/lib/runtimeLocationMock';
import { IncidentModePanel } from '@/components/runtime/IncidentModePanel';
import { DataDiscoveryPanel } from '@/components/runtime/DataDiscoveryPanel';
import { DemoWalkthroughOverlay } from '@/components/runtime/DemoWalkthroughOverlay';
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

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color?: string;
}) {
  const c = color ?? 'var(--primary-500)';
  const numericValue = typeof value === 'number' ? value : parseInt(value) || 0;
  const isString = typeof value === 'string' && isNaN(Number(value));

  // Determine glow card gradient background based on color
  let cardGradient = 'linear-gradient(135deg, rgba(10, 132, 255, 0.02) 0%, rgba(20, 20, 25, 0.75) 100%)';
  if (c === '#00E599') {
    cardGradient = 'linear-gradient(135deg, rgba(0, 229, 153, 0.02) 0%, rgba(20, 20, 25, 0.75) 100%)';
  } else if (c === '#FF9F0A') {
    cardGradient = 'linear-gradient(135deg, rgba(255, 159, 10, 0.02) 0%, rgba(20, 20, 25, 0.75) 100%)';
  } else if (c === '#FF453A') {
    cardGradient = 'linear-gradient(135deg, rgba(255, 69, 58, 0.02) 0%, rgba(20, 20, 25, 0.75) 100%)';
  }

  return (
    <div
      className="rounded-2xl px-5 py-4 flex items-center gap-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border backdrop-blur-md"
      style={{
        background: cardGradient,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
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
        <p className="text-[24px] font-extrabold leading-none text-white tracking-tight">
          {isString ? value : <AnimatedCounter value={numericValue} />}
        </p>
        <p className="text-[11px] mt-1.5 font-bold uppercase tracking-widest text-white/40">
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

// ─── Application Card ─────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' },
  }),
};

function AppCard({ app, index = 0 }: { app: ApplicationLocationSummary; index?: number }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const confidenceColor =
    app.overall_confidence === 4
      ? '#30D158'
      : app.overall_confidence === 3
      ? '#FF9F0A'
      : '#FF453A';

  const envBg =
    app.environment === 'PRODUCTION'
      ? 'rgba(10,132,255,0.1)'
      : app.environment === 'UAT'
      ? 'rgba(255,159,10,0.1)'
      : 'rgba(142,142,147,0.1)';
  const envFg =
    app.environment === 'PRODUCTION'
      ? '#0A84FF'
      : app.environment === 'UAT'
      ? '#FF9F0A'
      : '#8E8E93';

  const stacks = app.tech_stacks || getAppTechStacks(app.application_id);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover={{ y: -2 }}
      onClick={() => navigate(`/runtime-location/${app.application_id}?env=${app.environment}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-2xl p-5 cursor-pointer flex flex-col gap-4 relative overflow-hidden transition-all duration-300 pl-7"
      style={{
        background: 'rgba(20, 20, 25, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: hovered ? `0 0 25px ${confidenceColor}22` : '0 4px 15px rgba(0, 0, 0, 0.15)',
        borderColor: hovered ? confidenceColor : 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Left indicator strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ background: confidenceColor }}
      />

      {/* Main Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Left: App Info */}
        <div className="flex flex-col gap-1 min-w-[200px] max-w-[250px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-extrabold text-white truncate">
              {app.application_name}
            </span>
            <span
              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{ background: envBg, color: envFg }}
            >
              {app.environment}
            </span>
          </div>
          <span className="text-[10px] font-bold tracking-wider text-white/40 uppercase">
            {app.application_id}
          </span>
        </div>

        {/* Center: Mini Distribution Bar */}
        <div className="flex-1 flex flex-col gap-1 max-w-xs md:mx-auto min-w-[180px]">
          <div className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">
            Asset Distribution
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5 w-full mt-1">
            {app.data_centers.map((dc) => {
              const isPrimary = dc === app.primary_write_dc;
              const pct = isPrimary ? 60 : 40 / Math.max(1, app.data_centers.length - 1);
              return (
                <div
                  key={dc}
                  style={{ width: `${pct}%`, background: isPrimary ? '#30D158' : '#FF9F0A' }}
                  title={`${dc}: ${isPrimary ? 'Primary' : 'Standby'}`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            {app.data_centers.map((dc) => (
              <span key={dc} className="text-[9px] font-extrabold flex items-center gap-1 text-white/70">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: dc === app.primary_write_dc ? '#30D158' : '#FF9F0A' }}
                />
                {dc}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Confidence, Primary DC, Freshness */}
        <div className="flex items-center gap-6 text-right flex-shrink-0 flex-wrap md:flex-nowrap">
          <div className="flex flex-col text-left md:text-right">
            <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">
              Primary Authority
            </span>
            <span className="text-[12px] font-bold text-white mt-0.5 flex items-center gap-1 justify-start md:justify-end">
              <span className="w-2 h-2 rounded-full bg-[#30D158] animate-pulse-soft" />
              {app.primary_write_dc || 'N/A'}
            </span>
          </div>
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">
              Confidence
            </span>
            <span
              className="text-[15px] font-extrabold mt-0.5"
              style={{ color: confidenceColor }}
            >
              {app.overall_confidence}/4
            </span>
          </div>
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">
              Freshness
            </span>
            <div className="mt-1">
              <FreshnessIndicator lastUpdated={app.last_updated} compact />
            </div>
          </div>
        </div>

      </div>

      {/* Divider */}
      <div className="h-px bg-white/5 -mx-5" />

      {/* Bottom Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Tech Stack Icons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest mr-1">
            Engine Stack:
          </span>
          {stacks.map((stack) => (
            <div
              key={stack}
              className="p-1 rounded bg-white/5 flex items-center justify-center border border-white/5"
              title={techStackLabel(stack as TechStack)}
            >
              <TechStackIcon techStack={stack as TechStack} size={11} />
            </div>
          ))}
        </div>

        {/* Counts & Alerts */}
        <div className="flex items-center gap-3 text-[11px] font-medium text-white/60">
          <span>
            {app.component_count} component{app.component_count !== 1 ? 's' : ''}
          </span>
          <span>
            {app.asset_count} active resource{app.asset_count !== 1 ? 's' : ''}
          </span>
          {app.stale_source_count > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20"
            >
              <AlertTriangle className="w-3 h-3" />
              {app.stale_source_count} stale
            </span>
          )}
          {app.missing_source_count != null && app.missing_source_count > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/40"
              title="Expected data sources that have not yet provided data"
            >
              {app.missing_source_count} missing signal{app.missing_source_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </motion.div>
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

// ─── Source type labels ───────────────────────────────────────────────────────

const SOURCE_LABELS: Partial<Record<DataSourceName, string>> = {
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

const SOURCE_COLORS: Partial<Record<DataSourceName, string>> = {
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

const SOURCE_DESCRIPTIONS: Partial<Record<DataSourceName, string>> = {
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
  const { importCsv, isImporting } = useRuntimeLocationStore();
  const { add } = useNotificationStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedSource, setDetectedSource] = useState<DataSourceName | null>(null);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [manualSource, setManualSource] = useState<DataSourceName | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  function handleFileSelect(f: File) {
    setSelectedFile(f);
    const detected = detectSourceType(f.name);
    setDetectedSource(detected);
    setManualSource(null);
    // Read first few lines for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string ?? '';
      const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 4);
      setPreviewLines(lines);
    };
    reader.readAsText(f.slice(0, 4096));
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
              Import Topology CSV
            </h3>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Upload one of the 4 supported files — source is auto-detected from the filename.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Supported files legend */}
        <div className="grid grid-cols-2 gap-2">
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
              Drop CSV file here or click to browse
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Accepted: .csv files only
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.CSV"
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
                <div className="flex flex-wrap gap-1.5">
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
        <div className="flex gap-3 justify-end">
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

// ─── Seed Confirm Modal ───────────────────────────────────────────────────────

function SeedModal({ onClose }: { onClose: () => void }) {
  const { seedSampleData, isSeeding } = useRuntimeLocationStore();
  const { add } = useNotificationStore();

  async function handleSeed() {
    await seedSampleData();
    add({
      type: 'success',
      title: 'Sample Data Loaded',
      message: '4 topology files seeded: IBM MQ (44), MongoDB (22), Oracle OEM (41), CMDB (2)',
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5"
        style={{
          background: 'var(--app-surface-raised)',
          border: '1px solid var(--app-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div>
          <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Load Sample Data
          </h3>
          <p className="text-[12px] mt-2" style={{ color: 'var(--text-secondary)' }}>
            This will populate the platform with data derived from all 4 sample CSV files:
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {[
              { label: 'ibmma_qmgr_sever_status.csv', count: '44 MQ queue managers' },
              { label: 'mongodb_info.csv',             count: '22 MongoDB nodes' },
              { label: 'oem_db_role.csv',              count: '41 Oracle DB instances' },
              { label: 'business_application_topology.csv', count: '2 applications (PCA, DUMPS)' },
            ].map((f) => (
              <li key={f.label} className="flex items-start gap-2">
                <Database className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#0A84FF' }} />
                <div>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{f.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{f.count}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-3 justify-end">
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
            onClick={handleSeed}
            disabled={isSeeding}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-50"
            style={{ background: '#30D158' }}
          >
            {isSeeding && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {isSeeding ? 'Loading…' : 'Load Sample Data'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Time Simulation Slider ───────────────────────────────────────────────────

export const STAGES = [
  { step: 1, label: 'Baseline', offset: 0, desc: 'All telemetry sources aligned. Data centers reporting normal operations.', status: 'NORMAL', color: '#30D158' },
  { step: 2, label: 'MongoDB UAT Failure', offset: 60, desc: 'Ingestion failure in MongoDB UAT. 1 source reporting stale data.', status: 'WARNING', color: '#FF9F0A' },
  { step: 3, label: 'Secondary CMDB Failure', offset: 120, desc: 'Secondary CMDB failure in PRODUCTION. 2 sources reporting stale telemetry.', status: 'WARNING', color: '#FF9F0A' },
  { step: 4, label: 'Split-Brain Drift Detected', offset: 180, desc: 'Primary DC mismatch: CMDB vs OpenShift active roles disagree.', status: 'ALERT', color: '#FF453A' },
  { step: 5, label: 'Mitigation Failure (Critical)', offset: 240, desc: 'Incident state: Drift score critical, automated failover fails.', status: 'CRITICAL', color: '#FF453A' },
];

function TimeSimulatorSlider() {
  const { simulatedAgeOffset, setSimulatedAgeOffset } = useRuntimeLocationStore();

  const currentStep = simulatedAgeOffset === 0 ? 1
    : simulatedAgeOffset === 60 ? 2
    : simulatedAgeOffset === 120 ? 3
    : simulatedAgeOffset === 180 ? 4
    : 5;

  const currentStage = STAGES[currentStep - 1];

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 rounded-2xl flex-shrink-0 relative group"
      style={{
        background: 'rgba(20, 20, 25, 0.6)',
        border: `1px solid ${currentStage.color}35`,
        boxShadow: `0 0 15px ${currentStage.color}08`,
      }}
    >
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-ping"
        style={{ background: currentStage.color }}
      />
      
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/50">
            Simulate Timeline
          </span>
          <span className="text-[10px] font-extrabold font-mono" style={{ color: currentStage.color }}>
            Step {currentStep}/5: {currentStage.label}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={currentStep}
          onChange={(e) => {
            const step = Number(e.target.value);
            const offset = STAGES[step - 1].offset;
            setSimulatedAgeOffset(offset);
          }}
          className="w-36 accent-current cursor-pointer"
          style={{ accentColor: currentStage.color }}
        />
      </div>

      {/* Popover/Tooltip on hover of timeline slider */}
      <div
        className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col gap-2 p-3 rounded-2xl z-50 pointer-events-none w-72 text-left shadow-2xl backdrop-blur-md transition-all border"
        style={{
          background: 'rgba(15, 20, 28, 0.96)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-white/40 uppercase">Timeline Status</span>
          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: `${currentStage.color}15`, color: currentStage.color }}>
            {currentStage.status}
          </span>
        </div>
        <p className="text-[12px] font-extrabold text-white mt-1">
          {currentStage.label}
        </p>
        <p className="text-[10px] text-white/60 leading-relaxed">
          {currentStage.desc}
        </p>
        <div className="text-[9px] font-mono text-white/35 pt-1.5 border-t border-white/5">
          Offset: +{currentStage.offset} mins
        </div>
      </div>
    </div>
  );
}

// ─── Filter options ───────────────────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────────────────────

interface LiveFeedEvent {
  id: string;
  timestamp: string;
  type: 'import' | 'drift' | 'conflict' | 'failover' | 'info';
  message: string;
  application_id?: string;
  environment?: string;
  badgeColor?: string;
}

const getLiveEventsForStep = (step: number): LiveFeedEvent[] => {
  const now = new Date();
  const formatTime = (minutesAgo: number) => {
    return new Date(now.getTime() - minutesAgo * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const events: LiveFeedEvent[] = [];

  // Step 1 events
  events.push({
    id: 'e1',
    timestamp: formatTime(25),
    type: 'import',
    message: "Data source 'IBM MQ' imported 14 records (Freshness: 100%)",
    application_id: 'PCA',
    environment: 'PRODUCTION',
    badgeColor: '#30D158'
  });
  events.push({
    id: 'e2',
    timestamp: formatTime(22),
    type: 'import',
    message: "Data source 'CMDB' imported 150 records (Freshness: 100%)",
    application_id: 'PCA',
    environment: 'PRODUCTION',
    badgeColor: '#30D158'
  });

  if (step >= 2) {
    events.push({
      id: 'e3',
      timestamp: formatTime(15),
      type: 'info',
      message: "UAT Data source 'CMDB' decay: 1 source reported stale (Freshness: 80%)",
      application_id: 'PCA',
      environment: 'UAT',
      badgeColor: '#FF9F0A'
    });
  }

  if (step >= 3) {
    events.push({
      id: 'e4',
      timestamp: formatTime(10),
      type: 'conflict',
      message: "Conflict detected between CMDB and SCOM on PCA DB Primary roles",
      application_id: 'PCA',
      environment: 'PRODUCTION',
      badgeColor: '#FF453A'
    });
  }

  if (step >= 4) {
    events.push({
      id: 'e5',
      timestamp: formatTime(5),
      type: 'drift',
      message: "Drift detected on PCA: Active primary in IBB1, intended primary in SHV",
      application_id: 'PCA',
      environment: 'PRODUCTION',
      badgeColor: '#FF453A'
    });
  }

  if (step >= 5) {
    events.push({
      id: 'e6',
      timestamp: formatTime(1),
      type: 'failover',
      message: "Failover initiated for PCA: IBB1 -> SHV",
      application_id: 'PCA',
      environment: 'PRODUCTION',
      badgeColor: '#0A84FF'
    });
    events.push({
      id: 'e7',
      timestamp: formatTime(0.5),
      type: 'drift',
      message: "Primary write on SHV — expected IBB1 (Failover Active)",
      application_id: 'PCA',
      environment: 'PRODUCTION',
      badgeColor: '#FF453A'
    });
  }

  return events.reverse();
};

export function RuntimeLocationPage() {
  const navigate = useNavigate();
  const store = useRuntimeLocationStore();
  const {
    applications, dataCenters, isLoadingApplications, importHistory,
    environmentFilter, techStackFilter, searchQuery, simulatedAgeOffset, setSimulatedAgeOffset,
    loadApplications, loadDataCenters,
    setEnvironmentFilter, setTechStackFilter, setSearchQuery,
    confidenceFilters, freshnessFilters, statusFilters,
    setConfidenceFilters, setFreshnessFilters, setStatusFilters,
  } = store;

  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'heatmap'>('list');

  const setGlobalStatus = useWsStore((s) => s.setGlobalStatus);

  const [showImport,    setShowImport]    = useState(false);
  const [showSeed,      setShowSeed]      = useState(false);
  const [showIncident,  setShowIncident]  = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showDemo,      setShowDemo]      = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [showLiveFeed,  setShowLiveFeed]  = useState(true);
  const [liveEvents,    setLiveEvents]    = useState<LiveFeedEvent[]>([]);

  const currentStep = simulatedAgeOffset === 0 ? 1
    : simulatedAgeOffset === 60 ? 2
    : simulatedAgeOffset === 120 ? 3
    : simulatedAgeOffset === 180 ? 4
    : 5;

  const currentStage = STAGES[currentStep - 1];

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; application_id?: string; application_name?: string; drift_type?: string; detected_dc?: string; expected_dc?: string };
    if (msg.type === 'drift_detected') {
      const appName = msg.application_name ?? msg.application_id ?? 'Unknown app';
      const driftLabel = msg.drift_type === 'WRONG_PRIMARY'
        ? `Primary write on ${msg.detected_dc ?? '?'} — expected ${msg.expected_dc ?? '?'}`
        : msg.drift_type ?? 'Drift detected';
      notify.error(`Drift: ${appName}`, driftLabel);
      loadApplications();

      // Add to live events feed
      setLiveEvents(prev => [
        {
          id: `ws-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          type: 'drift',
          message: `Drift: ${appName} - ${driftLabel}`,
          application_id: msg.application_id,
          environment: 'PRODUCTION',
          badgeColor: '#FF453A'
        },
        ...prev
      ]);
    } else if (msg.type === 'asset_updated') {
      loadApplications();
      setLiveEvents(prev => [
        {
          id: `ws-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          type: 'info',
          message: `Asset updated for ${msg.application_name || 'application'}`,
          application_id: msg.application_id,
          environment: 'PRODUCTION',
          badgeColor: '#30D158'
        },
        ...prev
      ]);
    }
  }, [loadApplications]);

  const handleEventClick = useCallback((event: LiveFeedEvent) => {
    if (event.application_id) {
      navigate(`/runtime-location/detail/${event.application_id}?env=${event.environment || 'PRODUCTION'}`);
    }
  }, [navigate]);

  useWebSocket('/api/v1/runtime-location/ws', {
    onMessage: handleWsMessage,
    onStatusChange: setGlobalStatus,
  });

  useEffect(() => {
    loadApplications();
    loadDataCenters();
  }, []);

  useEffect(() => {
    setLiveEvents(getLiveEventsForStep(currentStep));
  }, [currentStep]);

  const simulatedApps = useMemo(() => {
    return applications.map((app) => {
      let staleCount = app.stale_source_count || 0;
      if (simulatedAgeOffset >= 60 && app.environment === 'UAT' && app.application_id === 'PCA') {
        staleCount += 1;
      }
      if (simulatedAgeOffset >= 120 && app.environment === 'PRODUCTION' && app.application_id === 'PCA') {
        staleCount += 1;
      }

      let status = app.alignment_status;
      if (simulatedAgeOffset >= 180 && app.application_id === 'PCA' && app.environment === 'PRODUCTION') {
        status = 'DRIFTED';
      }

      return {
        ...app,
        alignment_status: status,
        stale_source_count: staleCount,
      };
    });
  }, [applications, simulatedAgeOffset]);

  const filtered = useMemo(() => {
    return simulatedApps.filter((app) => {
      if (environmentFilter !== 'ALL' && app.environment !== environmentFilter) return false;
      if (techStackFilter !== 'ALL') {
        const realStacks = app.tech_stacks ?? [];
        const mockStacks = realStacks.length === 0 ? getAppTechStacks(app.application_id) : [];
        const stacks = realStacks.length > 0 ? realStacks : mockStacks;
        if (stacks.length > 0 && !stacks.includes(techStackFilter)) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!app.application_name.toLowerCase().includes(q) &&
            !app.application_id.toLowerCase().includes(q)) return false;
      }

      // Confidence filters (multi-select)
      if (confidenceFilters && confidenceFilters.length > 0) {
        const label = app.overall_confidence === 4 ? 'HIGH'
          : app.overall_confidence === 3 ? 'MEDIUM'
          : app.overall_confidence === 2 ? 'LOW'
          : 'UNKNOWN';
        if (!confidenceFilters.includes(label)) return false;
      }

      // Freshness filters (multi-select)
      if (freshnessFilters && freshnessFilters.length > 0) {
        const freshLabel = app.stale_source_count === 0 ? 'FRESH'
          : app.stale_source_count === 1 ? 'STALE'
          : 'VERY_STALE';
        if (!freshnessFilters.includes(freshLabel)) return false;
      }

      // Status filters (multi-select)
      if (statusFilters && statusFilters.length > 0) {
        const hasDrift = app.alignment_status === 'DRIFTED';
        const hasConflict = app.confidence_label === 'CONFLICT';
        
        const matchesDrift = statusFilters.includes('DRIFTED') && hasDrift;
        const matchesConflict = statusFilters.includes('CONFLICT') && hasConflict;
        
        if (!matchesDrift && !matchesConflict) return false;
      }

      return true;
    });
  }, [simulatedApps, environmentFilter, techStackFilter, searchQuery, confidenceFilters, freshnessFilters, statusFilters]);

  const totalStale = useMemo(() => {
    return simulatedApps.reduce((acc, a) => acc + (a.stale_source_count > 0 ? 1 : 0), 0);
  }, [simulatedApps]);

  const uniqueDCs  = useMemo(() => {
    return new Set(simulatedApps.flatMap((a) => a.data_centers)).size;
  }, [simulatedApps]);

  return (
    <div className="flex gap-6 px-6 py-6 max-w-[1600px] mx-auto min-h-[calc(100vh-100px)]">
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(10,132,255,0.1)' }}
          >
            <MapPin className="w-5 h-5" style={{ color: 'var(--primary-500)' }} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Runtime Location
            </h1>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Where is your application running?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { loadApplications(); loadDataCenters(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all"
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
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--primary-500)',
            }}
          >
            <LayoutList className="w-3.5 h-3.5" />
            Data Coverage
          </button>
          <button
            onClick={() => setShowIncident(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold"
            style={{
              background: 'rgba(255,69,58,0.08)',
              border: '1px solid rgba(255,69,58,0.3)',
              color: '#FF453A',
            }}
          >
            <Siren className="w-3.5 h-3.5" />
            Incident Mode
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all"
            style={{
              background: showHistory ? 'var(--app-surface-raised)' : 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-secondary)',
            }}
          >
            <History className="w-3.5 h-3.5" />
            History
            {importHistory.length > 0 && (
              <span
                className="text-[9px] font-bold px-1 py-0.5 rounded-full"
                style={{ background: 'var(--primary-500)', color: '#fff' }}
              >
                {importHistory.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowDemo(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold"
            style={{
              background: 'rgba(10,132,255,0.08)',
              border: '1px solid rgba(10,132,255,0.3)',
              color: 'var(--primary-500)',
            }}
          >
            <Play className="w-3.5 h-3.5" />
            Demo
          </button>
          <button
            onClick={() => setShowLiveFeed((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all relative"
            style={{
              background: showLiveFeed ? 'rgba(10,132,255,0.08)' : 'var(--app-surface)',
              border: `1px solid ${showLiveFeed ? 'rgba(10,132,255,0.3)' : 'var(--app-border)'}`,
              color: showLiveFeed ? 'var(--primary-500)' : 'var(--text-secondary)',
            }}
          >
            <Activity className="w-3.5 h-3.5" />
            Live Feed
            {currentStep >= 3 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#FF453A] border-2 border-[#1E1E24] rounded-full animate-pulse animate-ping" />
            )}
          </button>
          <button
            onClick={() => setShowSeed(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              color: '#30D158',
            }}
          >
            <Zap className="w-3.5 h-3.5" />
            Seed
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: 'var(--primary-500)' }}
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Applications" value={applications.length}                                 icon={Server}        color="var(--primary-500)" />
        <StatCard label="Data Centers"          value={dataCenters.length > 0 ? dataCenters.length : uniqueDCs} icon={Building2}     color="#00E599" />
        <StatCard label="Stale Sources"         value={totalStale}                                         icon={AlertTriangle} color="#FF9F0A" />
        <StatCard
          label="Drifts Detected"
          value={applications.filter((a) => a.alignment_status === 'DRIFTED').length}
          icon={AlertCircle}
          color="#FF453A"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <FilterSelect
          value={environmentFilter}
          onChange={setEnvironmentFilter}
          options={ENV_OPTIONS}
          label="Environment"
        />
        <FilterSelect
          value={techStackFilter}
          onChange={setTechStackFilter}
          options={STACK_OPTIONS}
          label="Tech Stack"
        />
        <div
          className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl px-3 py-2"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search applications…"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <TimeSimulatorSlider />

        {/* View Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/5 flex-shrink-0">
          {[
            { id: 'list', label: 'List', icon: LayoutList },
            { id: 'kanban', label: 'Kanban', icon: Server },
            { id: 'heatmap', label: 'Heatmap', icon: MapPin },
          ].map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id as any)}
                className="p-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 transition-all"
                style={viewMode === mode.id ? {
                  background: 'var(--primary-500)',
                  color: '#fff',
                } : {
                  color: 'rgba(255,255,255,0.4)',
                }}
                title={`${mode.label} View`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Filter Chips Row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1.5 py-1 mb-2">
        
        {/* Confidence Group */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">Confidence:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map((lvl) => {
              const active = confidenceFilters.includes(lvl);
              const color = lvl === 'HIGH' ? '#30D158' : lvl === 'MEDIUM' ? '#FF9F0A' : lvl === 'LOW' ? '#FF453A' : '#8E8E93';
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
                  className="px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all"
                  style={{
                    background: active ? `${color}15` : 'rgba(255,255,255,0.02)',
                    borderColor: active ? `${color}60` : 'rgba(255,255,255,0.06)',
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">Freshness:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['FRESH', 'STALE', 'VERY_STALE'].map((lvl) => {
              const active = freshnessFilters.includes(lvl);
              const color = lvl === 'FRESH' ? '#30D158' : lvl === 'STALE' ? '#FF9F0A' : '#FF453A';
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
                  className="px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all"
                  style={{
                    background: active ? `${color}15` : 'rgba(255,255,255,0.02)',
                    borderColor: active ? `${color}60` : 'rgba(255,255,255,0.06)',
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">Status:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['DRIFTED', 'CONFLICT'].map((lvl) => {
              const active = statusFilters.includes(lvl);
              const color = lvl === 'DRIFTED' ? '#FF453A' : '#FF3B30';
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
                  className="px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all"
                  style={{
                    background: active ? `${color}15` : 'rgba(255,255,255,0.02)',
                    borderColor: active ? `${color}60` : 'rgba(255,255,255,0.06)',
                    color: active ? color : 'var(--text-muted)',
                  }}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reset Filters button if any are active */}
        {(confidenceFilters.length > 0 || freshnessFilters.length > 0 || statusFilters.length > 0) && (
          <button
            onClick={() => {
              setConfidenceFilters([]);
              setFreshnessFilters([]);
              setStatusFilters([]);
            }}
            className="text-[10px] font-semibold text-white/40 hover:text-white transition-colors ml-auto"
          >
            Clear Active Filters
          </button>
        )}

      </div>

      {/* Import history log */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
            >
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--app-border)' }}
              >
                <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Import History
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {importHistory.length} import{importHistory.length !== 1 ? 's' : ''}
                </p>
              </div>
              {importHistory.length === 0 ? (
                <div className="px-5 py-6 flex flex-col items-center gap-2">
                  <History className="w-7 h-7" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    No imports yet — use Import CSV or Seed to load topology data
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
                  {importHistory.slice(0, 8).map((item) => (
                    <div key={item.id} className="px-5 py-3 flex items-center gap-4">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background: item.status === 'SUCCESS' ? 'rgba(48,209,88,0.1)' :
                            item.status === 'PARTIAL' ? 'rgba(255,159,10,0.1)' : 'rgba(255,69,58,0.1)',
                        }}
                      >
                        {item.status === 'SUCCESS' ? (
                          <CheckCircle className="w-3.5 h-3.5" style={{ color: '#30D158' }} />
                        ) : item.status === 'PARTIAL' ? (
                          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#FF9F0A' }} />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" style={{ color: '#FF453A' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {item.file_name}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
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

      {simulatedAgeOffset > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-2xl p-4 flex items-start gap-3 border relative overflow-hidden backdrop-blur-md mb-2"
          style={{
            background: `${currentStage.color}08`,
            borderColor: `${currentStage.color}30`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-ping"
            style={{ background: currentStage.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: `${currentStage.color}15`, color: currentStage.color }}>
                {currentStage.status}
              </span>
              <h4 className="text-[12px] font-bold text-white uppercase tracking-wider">
                Simulation Step {currentStep}/5: {currentStage.label}
              </h4>
            </div>
            <p className="text-[11px] text-white/70 mt-1">
              {currentStage.desc}
            </p>
          </div>
          <button
            onClick={() => setSimulatedAgeOffset(0)}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex-shrink-0 hover:bg-white/5 transition-colors"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'rgba(255,255,255,0.08)',
              color: '#fff',
            }}
          >
            End Simulation
          </button>
        </motion.div>
      )}

      {/* Results count when filtered */}
      {(environmentFilter !== 'ALL' || techStackFilter !== 'ALL' || searchQuery) && !isLoadingApplications && (
        <p className="text-[12px] -mt-3" style={{ color: 'var(--text-muted)' }}>
          Showing {filtered.length} of {applications.length} applications
        </p>
      )}

      {/* App grid */}
      {isLoadingApplications ? (
        <div className="flex flex-col gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl h-24 animate-pulse"
              style={{ background: 'var(--app-surface)' }}
            />
          ))}
        </div>
      ) : filtered.length === 0 && applications.length === 0 ? (
        <div
          className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
          style={{ border: '2px dashed var(--app-border)', background: 'var(--app-surface)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(10,132,255,0.08)' }}
          >
            <MapPin className="w-7 h-7" style={{ color: 'var(--primary-500)' }} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
              No topology data yet
            </p>
            <p className="text-[12px] mt-1.5 max-w-sm" style={{ color: 'var(--text-muted)' }}>
              Import one of the 4 CSV files to see where your applications are running,
              or load the sample dataset to explore the full feature.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSeed(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold"
              style={{ background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.3)', color: '#30D158' }}
            >
              <Zap className="w-3.5 h-3.5" />
              Load Sample Data
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: 'var(--primary-500)' }}
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {['ibmma_qmgr_sever_status.csv', 'mongodb_info.csv', 'oem_db_role.csv', 'business_application_topology.csv'].map((f) => (
              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-muted)' }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <MapPin className="w-10 h-10" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <p className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            No applications match your filters
          </p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Try adjusting the environment or tech stack filters
          </p>
        </div>
      ) : (
        <div>
          {viewMode === 'list' && (
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {filtered.map((app, i) => (
                  <AppCard key={`${app.application_id}-${app.environment}`} app={app} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {(['PRODUCTION', 'UAT', 'DR'] as const).map((env) => {
                const envApps = filtered.filter((a) => a.environment === env);
                return (
                  <div
                    key={env}
                    className="rounded-2xl p-4 flex flex-col gap-3.5"
                    style={{
                      background: 'rgba(20, 20, 25, 0.4)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="flex items-center justify-between px-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-white/50">
                        {env}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60 font-mono font-bold">
                        {envApps.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
                      {envApps.map((app, i) => (
                        <AppCard key={`${app.application_id}-${app.environment}`} app={app} index={i} />
                      ))}
                      {envApps.length === 0 && (
                        <div className="text-center py-12 text-[11px] text-white/30 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                          No deployments found
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'heatmap' && (
            <div
              className="rounded-2xl p-6 flex flex-col gap-4"
              style={{
                background: 'rgba(20, 20, 25, 0.65)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div>
                <h3 className="text-[14px] font-extrabold text-white uppercase tracking-wider">
                  Confidence Heatmap Grid
                </h3>
                <p className="text-[11px] text-white/40 mt-1">
                  A high-density health grid indicating relative confidence of all tracked application deployments.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 pt-3">
                {filtered.map((app) => {
                  const conf = app.overall_confidence;
                  const color = conf === 4 ? '#30D158' : conf === 3 ? '#FF9F0A' : '#FF453A';
                  return (
                    <motion.div
                      key={`${app.application_id}-${app.environment}`}
                      whileHover={{ scale: 1.1, zIndex: 10 }}
                      onClick={() => navigate(`/runtime-location/${app.application_id}?env=${app.environment}`)}
                      className="w-14 h-14 rounded-xl cursor-pointer relative group flex flex-col items-center justify-center border transition-all"
                      style={{
                        background: `${color}15`,
                        borderColor: `${color}40`,
                        boxShadow: `0 0 10px ${color}10`,
                      }}
                    >
                      <span className="text-[10px] font-mono font-extrabold" style={{ color }}>
                        {app.application_id.slice(0, 4).toUpperCase()}
                      </span>
                      <span className="text-[8px] font-bold opacity-60 text-white/70 uppercase">
                        {app.environment.slice(0, 4)}
                      </span>

                      {/* Tooltip */}
                      <div
                        className="absolute bottom-full mb-2.5 hidden group-hover:flex flex-col gap-1.5 p-3 rounded-xl z-50 pointer-events-none w-52 text-left shadow-xl backdrop-blur-md"
                        style={{
                          background: 'rgba(15, 20, 28, 0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        <p className="text-[11px] font-extrabold text-white truncate">
                          {app.application_name}
                        </p>
                        <p className="text-[9px] text-white/50 font-bold uppercase tracking-wider">
                          {app.application_id} · {app.environment}
                        </p>
                        <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-white/5 text-[10px]">
                          <span className="text-white/40">Confidence Level:</span>
                          <span className="font-extrabold text-[11px]" style={{ color }}>
                            {conf}/4
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-white/40">Primary Authority:</span>
                          <span className="font-bold text-white">
                            {app.primary_write_dc || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-white/40">Active DCs:</span>
                          <span className="font-medium text-white">
                            {app.data_centers.join(', ')}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals + Panels */}
      <AnimatePresence>
        {showImport    && <ImportModal        onClose={() => setShowImport(false)} />}
        {showSeed      && <SeedModal          onClose={() => setShowSeed(false)} />}
        {showIncident  && <IncidentModePanel  onClose={() => setShowIncident(false)} />}
        {showDiscovery && <DataDiscoveryPanel onClose={() => setShowDiscovery(false)} />}
      </AnimatePresence>

      {/* Demo walkthrough (rendered outside AnimatePresence for z-index) */}
      <AnimatePresence>
        {showDemo && (
          <DemoWalkthroughOverlay
            onClose={() => setShowDemo(false)}
            onNavigateTo={(step) => {
              // Steps 7 and 8 correlate to Incident Mode and Data Discovery panels
              if (step === 6) { setShowIncident(true); setShowDiscovery(false); }
              else if (step === 7) { setShowDiscovery(true); setShowIncident(false); }
              else { setShowIncident(false); setShowDiscovery(false); }
            }}
          />
        )}
      </AnimatePresence>
      </div> {/* Close Main Content Area */}

      {/* Sliding sidebar */}
      <AnimatePresence>
        {showLiveFeed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 hidden lg:flex flex-col rounded-2xl border overflow-hidden"
            style={{
              background: 'rgba(20, 20, 25, 0.45)',
              borderColor: 'var(--app-border)',
              height: 'calc(100vh - 120px)',
              position: 'sticky',
              top: '90px',
            }}
          >
            {/* Sidebar Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface-raised)' }}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF453A] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF453A]"></span>
                </span>
                <span className="text-[12px] font-bold text-white uppercase tracking-wider">
                  Live Operations Feed
                </span>
              </div>
              <button
                onClick={() => setShowLiveFeed(false)}
                className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sidebar Feed Container */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
              {liveEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-center text-white/30">
                  <Activity className="w-6 h-6 animate-pulse" />
                  <span className="text-[11px] font-semibold">No operational events yet</span>
                </div>
              ) : (
                liveEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={() => handleEventClick(evt)}
                    className="p-3 rounded-xl border flex flex-col gap-1.5 cursor-pointer transition-all hover:translate-x-1"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderColor: 'rgba(255,255,255,0.05)',
                    }}
                    title={evt.application_id ? `Click to view detail for ${evt.application_id}` : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: evt.badgeColor ? `${evt.badgeColor}15` : 'rgba(255,255,255,0.05)',
                          color: evt.badgeColor || 'var(--text-muted)',
                        }}
                      >
                        {evt.type.toUpperCase()}
                      </span>
                      <span className="text-[9px] font-mono text-white/30">{evt.timestamp}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/80 font-medium">
                      {evt.message}
                    </p>
                    {evt.application_id && (
                      <div className="flex items-center gap-1 mt-0.5 text-[9px] font-semibold text-[#0A84FF] group hover:underline transition-all">
                        <span>Investigate {evt.application_id}</span>
                        <span className="transition-transform group-hover:translate-x-0.5"> →</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}