import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Search, Upload, RefreshCw, Building2, Server,
  TriangleAlert as AlertTriangle, ChevronDown, CircleCheck as CheckCircle,
  Database, Zap, Siren, LayoutList, Play, History, CircleAlert as AlertCircle,
  FileText, X, Clock,
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
import { IncidentModePanel } from '@/components/runtime/IncidentModePanel';
import { DataDiscoveryPanel } from '@/components/runtime/DataDiscoveryPanel';
import { DemoWalkthroughOverlay } from '@/components/runtime/DemoWalkthroughOverlay';
import { detectSourceType } from '@/lib/csvParser';
import type { ApplicationLocationSummary, DataSourceName } from '@/types';

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color?: string;
}) {
  const c = color ?? 'var(--primary-500)';
  return (
    <div
      className="rounded-2xl px-5 py-4 flex items-center gap-4"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${c}18` }}
      >
        <Icon className="w-5 h-5" style={{ color: c }} strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-[22px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
          {value}
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
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

function AppCard({ app }: { app: ApplicationLocationSummary }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(`/runtime-location/${app.application_id}?env=${app.environment}`)}
      className="rounded-2xl p-5 cursor-pointer flex flex-col gap-3.5"
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-500)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
      }}
    >
      {/* Name + env */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {app.application_name}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {app.application_id}
          </p>
        </div>
        <span
          className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
          style={{
            background: app.environment === 'PRODUCTION' ? 'rgba(10,132,255,0.1)' :
              app.environment === 'UAT' ? 'rgba(255,159,10,0.1)' : 'rgba(142,142,147,0.1)',
            color: app.environment === 'PRODUCTION' ? '#0A84FF' :
              app.environment === 'UAT' ? '#FF9F0A' : '#8E8E93',
          }}
        >
          {app.environment}
        </span>
      </div>

      {/* Data centers */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Data Centers
        </p>
        <div className="flex flex-wrap gap-1">
          {app.data_centers.map((dc) => (
            <DCBadge key={dc} name={dc} isPrimary={dc === app.primary_write_dc} />
          ))}
        </div>
      </div>

      {/* Primary write */}
      {app.primary_write_dc && (
        <div className="flex items-center gap-1.5">
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Primary write:</p>
          <span className="text-[11px] font-semibold" style={{ color: '#30D158' }}>
            {app.primary_write_dc}
          </span>
        </div>
      )}

      {/* Confidence + freshness divider row */}
      <div
        className="flex items-center justify-between gap-2 pt-2"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        <div className="flex items-center gap-1.5">
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Confidence:</p>
          <ConfidenceBadge level={app.overall_confidence} />
        </div>
        <FreshnessIndicator lastUpdated={app.last_updated} compact />
      </div>

      {/* Component / asset / stale counts */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {app.component_count} component{app.component_count !== 1 ? 's' : ''}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {app.asset_count} asset{app.asset_count !== 1 ? 's' : ''}
        </span>
        {app.stale_source_count > 0 && (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#FF9F0A' }}>
            <AlertTriangle className="w-3 h-3" />
            {app.stale_source_count} stale
          </span>
        )}
        {app.missing_source_count != null && app.missing_source_count > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(142,142,147,0.12)', color: '#8E8E93' }}
            title="Expected data sources that have not yet provided data"
          >
            {app.missing_source_count} missing signal{app.missing_source_count !== 1 ? 's' : ''}
          </span>
        )}
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
      add({
        type: 'success',
        title: `Import ${result.status === 'PARTIAL' ? 'Partial' : 'Complete'}`,
        message: `${result.record_count} records imported from ${result.file_name}${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`,
      });
      onClose();
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
          background: 'var(--app-surface-raised)',
          border: '1px solid var(--app-border)',
          boxShadow: 'var(--shadow-xl)',
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
            disabled={!selectedFile || !activeSource || isImporting}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--primary-500)' }}
          >
            {isImporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {isImporting ? 'Parsing & importing…' : 'Import'}
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

function TimeSimulatorSlider() {
  const { simulatedAgeOffset, setSimulatedAgeOffset } = useRuntimeLocationStore();

  const label = simulatedAgeOffset === 0 ? 'Now (live)'
    : simulatedAgeOffset < 60 ? `+${simulatedAgeOffset}m`
    : `+${(simulatedAgeOffset / 60).toFixed(1)}h`;

  const color = simulatedAgeOffset === 0 ? '#30D158'
    : simulatedAgeOffset <= 30 ? '#FF9F0A'
    : '#FF453A';

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl flex-shrink-0"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Simulate Time
          </span>
          <span className="text-[11px] font-bold" style={{ color }}>
            {label}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={240}
          step={15}
          value={simulatedAgeOffset}
          onChange={(e) => setSimulatedAgeOffset(Number(e.target.value))}
          className="w-32 accent-current"
          style={{ accentColor: color }}
        />
      </div>
      {simulatedAgeOffset > 0 && (
        <button
          onClick={() => setSimulatedAgeOffset(0)}
          className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 transition-opacity hover:opacity-70"
          style={{ background: 'rgba(255,69,58,0.1)', color: '#FF453A' }}
        >
          Reset
        </button>
      )}
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

export function RuntimeLocationPage() {
  const store = useRuntimeLocationStore();
  const {
    applications, dataCenters, isLoadingApplications, importHistory,
    environmentFilter, techStackFilter, searchQuery,
    loadApplications, loadDataCenters,
    setEnvironmentFilter, setTechStackFilter, setSearchQuery,
  } = store;

  const setGlobalStatus = useWsStore((s) => s.setGlobalStatus);

  const [showImport,    setShowImport]    = useState(false);
  const [showSeed,      setShowSeed]      = useState(false);
  const [showIncident,  setShowIncident]  = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showDemo,      setShowDemo]      = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);

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

  const filtered = selectFilteredApplications(store);
  const totalStale = applications.reduce((acc, a) => acc + a.stale_source_count, 0);
  const uniqueDCs  = new Set(applications.flatMap((a) => a.data_centers)).size;

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto">

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
        <StatCard label="Applications Tracked" value={applications.length}                                 icon={Server}        color="var(--primary-500)" />
        <StatCard label="Data Centers"          value={dataCenters.length > 0 ? dataCenters.length : uniqueDCs} icon={Building2}     color="#0A84FF" />
        <StatCard label="Stale Sources"         value={totalStale}                                         icon={AlertTriangle} color="#FF9F0A" />
        <StatCard
          label="Environments"
          value={new Set(applications.map((a) => a.environment)).size}
          icon={MapPin}
          color="#30D158"
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

      {/* Results count when filtered */}
      {(environmentFilter !== 'ALL' || techStackFilter !== 'ALL' || searchQuery) && !isLoadingApplications && (
        <p className="text-[12px] -mt-3" style={{ color: 'var(--text-muted)' }}>
          Showing {filtered.length} of {applications.length} applications
        </p>
      )}

      {/* App grid */}
      {isLoadingApplications ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl h-52 animate-pulse"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((app) => (
              <AppCard key={`${app.application_id}-${app.environment}`} app={app} />
            ))}
          </AnimatePresence>
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
    </div>
  );
}