import React, { useState } from 'react';
import { 
  FileText, Search, ShieldAlert, ShieldCheck, Filter, Download, 
  Trash2, AlertTriangle, CheckCircle2, AlertCircle, Clock, 
  User, Database, Globe, Network, ArrowRight
} from 'lucide-react';

interface AuditEvent {
  id: string;
  timestamp: string;
  operator: string;
  category: 'INGEST' | 'FAILOVER_SIM' | 'SECURITY' | 'DRIFT' | 'ROUTING_SHIFT';
  event: string;
  details: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  location: string;
}

const INITIAL_EVENTS: AuditEvent[] = [
  {
    id: 'aud-1',
    timestamp: 'Just now',
    operator: 'Sabbu (Admin)',
    category: 'SECURITY',
    event: 'User Session Authentication',
    details: 'Successful administrator login from IP 10.231.14.90 (active tokens active)',
    severity: 'INFO',
    location: 'HKG1',
  },
  {
    id: 'aud-2',
    timestamp: '10 mins ago',
    operator: 'System Ingestion',
    category: 'INGEST',
    event: 'Telemetry Import Complete',
    details: 'Parsed file PB3_jobs_application_machine_timestamp.csv: 45 records loaded successfully',
    severity: 'INFO',
    location: 'SYSTEM',
  },
  {
    id: 'aud-3',
    timestamp: '12 mins ago',
    operator: 'Sarah Jenkins',
    category: 'FAILOVER_SIM',
    event: 'Failover Scenario Simulated',
    details: 'Initiated simulated outage scenario "IBB1 Full Outage" for PCA: Outcome was DEGRADED, expected confidence 55%',
    severity: 'WARNING',
    location: 'IBB1',
  },
  {
    id: 'aud-4',
    timestamp: '35 mins ago',
    operator: 'System Ingestion',
    category: 'INGEST',
    event: 'Synthetic Placeholders Injected',
    details: 'Injected 14 active DB and MQ assets for BILLING and CLAIMS to cover missing raw telemetry sheets',
    severity: 'INFO',
    location: 'SYSTEM',
  },
  {
    id: 'aud-5',
    timestamp: '45 mins ago',
    operator: 'Drift Engine',
    category: 'DRIFT',
    event: 'Active-Active Drift Detected',
    details: 'Detected active-active primary node drift in app BILLING. Both DC1 (primary) and DC2 (primary) claim active write authority.',
    severity: 'CRITICAL',
    location: 'ALL',
  },
  {
    id: 'aud-6',
    timestamp: '1 hour ago',
    operator: 'Emma Watson',
    category: 'ROUTING_SHIFT',
    event: 'Ingress GSLB Target Modified',
    details: 'Shifted ingress AVI virtual service routing weight: IBB1 pool weight changed from 50% to 10%',
    severity: 'WARNING',
    location: 'IBB1',
  },
  {
    id: 'aud-7',
    timestamp: '2 hours ago',
    operator: 'System Startup',
    category: 'SECURITY',
    event: 'In-Memory SQLite Schema Init',
    details: 'Database table schema initialized successfully. Active connection pool created at sqlite+aiosqlite:///:memory:',
    severity: 'INFO',
    location: 'SYSTEM',
  },
];

const SEVERITY_CONFIGS = {
  INFO: { color: 'var(--success)', bg: 'var(--success-subtle)', icon: CheckCircle2 },
  WARNING: { color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: AlertTriangle },
  CRITICAL: { color: 'var(--danger)', bg: 'var(--danger-subtle)', icon: AlertCircle },
};

const CATEGORY_COLORS = {
  INGEST: 'var(--accent)',
  FAILOVER_SIM: 'var(--info)',
  SECURITY: 'var(--text-primary)',
  DRIFT: 'var(--danger)',
  ROUTING_SHIFT: 'var(--warning)',
};

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>(INITIAL_EVENTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.operator.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          evt.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = selectedSeverity === 'ALL' || evt.severity === selectedSeverity;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="rounded-3xl p-6 border relative overflow-hidden"
        style={{ background: 'var(--map-container-bg)', borderColor: 'var(--app-border)', boxShadow: 'var(--shadow-md)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-[var(--accent)]" />
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                System Operations Trail
              </span>
            </div>
            <h1 className="text-[28px] font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
              Operational <span style={{ color: 'var(--accent)' }}>Audit Trail</span>
            </h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-2">
              Trace all telemetry uploads, failover events, drift reports, and user administrative activity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-extrabold uppercase tracking-wider border transition-all text-[var(--text-primary)] border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] bg-[var(--app-surface)]"
            >
              <Download className="w-4 h-4" /> Download JSON
            </button>
            <button 
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-extrabold uppercase tracking-wider text-red-500 border border-red-500/20 hover:bg-red-500/5 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Clear Logs
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Events Logged', value: events.length, icon: FileText, color: 'var(--accent)' },
          { label: 'Critical Alerts Raised', value: events.filter(e => e.severity === 'CRITICAL').length, icon: AlertCircle, color: 'var(--danger)' },
          { label: 'Telemetry Ingestions', value: events.filter(e => e.category === 'INGEST').length, icon: Database, color: 'var(--success)' },
          { label: 'Active Warning Logs', value: events.filter(e => e.severity === 'WARNING').length, icon: AlertTriangle, color: 'var(--warning)' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-4 flex items-center justify-between border"
            style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">{stat.label}</span>
              <p className="text-[22px] font-extrabold mt-1" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}15` }}>
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        {/* Controls */}
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-2 min-w-[280px] px-3 py-1.5 rounded-xl border bg-[var(--app-bg-subtle)]" style={{ borderColor: 'var(--app-border)' }}>
            <Search className="w-4 h-4 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search audit trail..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-0 outline-none text-[12px] text-[var(--text-primary)] w-full placeholder-[var(--text-muted)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setSelectedSeverity('ALL')}
                className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all"
                style={selectedSeverity === 'ALL' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)', background: 'transparent' }}
              >
                All
              </button>
              {['INFO', 'WARNING', 'CRITICAL'].map(sev => {
                const sCfg = SEVERITY_CONFIGS[sev as keyof typeof SEVERITY_CONFIGS];
                return (
                  <button 
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all"
                    style={selectedSeverity === sev ? { background: sCfg.color, color: '#fff' } : { color: 'var(--text-muted)', background: 'transparent' }}
                  >
                    {sev}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--app-surface)' }}>
              {['Time', 'Operator / Source', 'Severity', 'Category', 'Action / Event', 'Detail Description', 'Data Center'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map(evt => {
              const sCfg = SEVERITY_CONFIGS[evt.severity];
              const SevIcon = sCfg.icon;
              return (
                <tr key={evt.id} className="hover:bg-[var(--app-surface-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--app-border)' }}>
                  {/* Time */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {evt.timestamp}
                    </span>
                  </td>
                  {/* Operator */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-[12px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[var(--accent)]" /> {evt.operator}
                    </span>
                  </td>
                  {/* Severity */}
                  <td className="px-4 py-3.5">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1 w-fit"
                      style={{ background: sCfg.bg, color: sCfg.color, borderColor: sCfg.color }}>
                      <SevIcon className="w-2.5 h-2.5" /> {evt.severity}
                    </span>
                  </td>
                  {/* Category */}
                  <td className="px-4 py-3.5">
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider"
                      style={{ color: CATEGORY_COLORS[evt.category], background: `${CATEGORY_COLORS[evt.category]}12`, borderColor: `${CATEGORY_COLORS[evt.category]}20` }}>
                      {evt.category.replace('_', ' ')}
                    </span>
                  </td>
                  {/* Event */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{evt.event}</span>
                  </td>
                  {/* Details */}
                  <td className="px-4 py-3.5 max-w-sm">
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{evt.details}</p>
                  </td>
                  {/* Location */}
                  <td className="px-4 py-3.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)]">
                      {evt.location}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
