/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * ExecutiveReportTab — the "Executive Report" tab of the Validate
 * step. Renders a printable executive summary covering datacenter
 * status, application health, downtime, confidence, prepared-by
 * metadata, downloadable report, and a stakeholder sign-off panel.
 * Mock data only.
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Printer, Download, FileText, Server, Boxes, Clock, Gauge,
  PenLine, CircleCheck, Clock as ClockIcon, Building2, CalendarDays,
  Hash, CircleUser as UserCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  DOWNTIME_IMPACT_META,
  SYNTH_TX_STATUS_META,
  type ExecutiveSummary,
  type ReportDatacenter,
  type ReportApplication,
  type ReportDowntime,
  type ReportSignOff,
} from '@/modules/dc-exit/data/validateMockData';

const DC_STATUS_META: Record<ReportDatacenter['status'], { label: string; color: string; bg: string; border: string }> = {
  exited:  { label: 'Exited',  color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)' },
  standby: { label: 'Standby', color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)' },
  active:  { label: 'Active',  color: '#00B074', bg: 'rgba(0,176,116,0.08)',   border: 'rgba(0,176,116,0.22)' },
};

function scoreTone(score: number): string {
  if (score >= 85) return '#00B074';
  if (score >= 60) return '#FFB100';
  return '#FF003C';
}

function ReportMetaRow({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
      <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Large Summary ───────────────────────────────────────────────────────────

function LargeSummary({ summary: s }: { summary: ExecutiveSummary }) {
  const tone = scoreTone(s.overallConfidence);
  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (s.overallConfidence / 100) * circ;

  return (
    <div
      className="exec-report-section rounded-[8px] p-6 flex flex-col gap-5"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      {/* Report ID + title */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] exec-print-dark" style={{ color: 'var(--text-muted)' }}>
            Executive Summary
          </span>
          <h2 className="text-[22px] font-extrabold tracking-tight leading-tight exec-print-dark" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {s.headline}
          </h2>
          <div className="flex items-center gap-4 flex-wrap mt-1">
            <ReportMetaRow icon={Hash} label="Report ID" value={s.reportId} />
            <ReportMetaRow icon={Building2} label="Session" value={s.sessionName} />
            <ReportMetaRow icon={CalendarDays} label="Cutover Date" value={s.cutoverDate} />
          </div>
        </div>

        {/* Confidence ring */}
        <div className="relative flex-shrink-0 exec-print-dark" style={{ width: 112, height: 112 }}>
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--app-bg-muted)" strokeWidth="8" />
            <circle
              cx="56" cy="56" r={radius} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight" style={{ color: tone }}>
              {s.overallConfidence}
            </span>
            <span className="text-[8px] font-mono mt-0.5" style={{ color: 'var(--text-disabled)' }}>confidence</span>
          </div>
        </div>
      </div>

      {/* Narrative */}
      <p className="text-[12.5px] leading-relaxed exec-print-dark" style={{ color: 'var(--text-secondary)' }}>
        {s.narrative}
      </p>

      {/* Prepared by */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-[6px] exec-print-dark"
        style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
      >
        <UserCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} strokeWidth={1.8} />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
            Prepared By
          </span>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {s.preparedBy}
          </span>
        </div>
        <span className="text-[11px] font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>
          {s.preparedByRole}
        </span>
      </div>
    </div>
  );
}

// ─── Datacenter section ──────────────────────────────────────────────────────

function DatacenterCard({ dc }: { dc: ReportDatacenter }) {
  const meta = DC_STATUS_META[dc.status];
  return (
    <div
      className="exec-report-section rounded-[8px] p-4 flex flex-col gap-3"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-[6px] flex-shrink-0 exec-print-dark"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
        >
          <Server className="w-4 h-4" style={{ color: meta.color }} strokeWidth={1.8} />
        </span>
        <span className="text-[13px] font-bold truncate flex-1 min-w-0 exec-print-dark" style={{ color: 'var(--text-primary)' }}>
          {dc.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0 exec-print-dark"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono exec-print-dark" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-bold tabular-nums" style={{ color: '#00B074' }}>{dc.appsMigrated}</span>
          <span style={{ color: 'var(--text-muted)' }}>migrated</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono exec-print-dark" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-bold tabular-nums" style={{ color: dc.appsRemaining > 0 ? '#FFB100' : 'var(--text-muted)' }}>{dc.appsRemaining}</span>
          <span style={{ color: 'var(--text-muted)' }}>remaining</span>
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed exec-print-dark" style={{ color: 'var(--text-muted)' }}>
        {dc.detail}
      </p>
    </div>
  );
}

// ─── Application section ─────────────────────────────────────────────────────

function ApplicationRow({ app, idx }: { app: ReportApplication; idx: number }) {
  const meta = SYNTH_TX_STATUS_META[app.status];
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 exec-print-dark"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
    >
      <Boxes className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
      <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
        {app.name}
      </span>
      <span
        className="text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
        style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
      >
        {app.tier}
      </span>
      <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0" style={{ minWidth: 70 }}>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>conf</span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color: scoreTone(app.confidence) }}>{app.confidence}</span>
      </span>
      <span
        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
      >
        {meta.label}
      </span>
    </div>
  );
}

// ─── Downtime section ────────────────────────────────────────────────────────

function DowntimeRow({ dt, idx }: { dt: ReportDowntime; idx: number }) {
  const meta = DOWNTIME_IMPACT_META[dt.impact];
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3 exec-print-dark"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} strokeWidth={1.8} />
        <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {dt.application}
        </span>
        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {dt.window}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
        >
          {dt.impact}
        </span>
      </div>
      <div className="flex items-center gap-3 pl-6 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>duration</span>
          <span className="font-bold" style={{ color: dt.duration === '0 min' ? '#00B074' : 'var(--text-primary)' }}>{dt.duration}</span>
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-muted)' }}>
        {dt.detail}
      </p>
    </div>
  );
}

// ─── Confidence summary ──────────────────────────────────────────────────────

function ConfidenceSummary({ applications, score }: { applications: ReportApplication[]; score: number }) {
  const passed = applications.filter((a) => a.status === 'success').length;
  const degraded = applications.filter((a) => a.status === 'degraded').length;
  const failed = applications.filter((a) => a.status === 'failed').length;
  const tone = scoreTone(score);

  return (
    <div
      className="exec-report-section rounded-[8px] p-5 flex items-center gap-5 flex-wrap"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="flex items-center gap-3 exec-print-dark">
        <Gauge className="w-5 h-5 flex-shrink-0" style={{ color: tone }} strokeWidth={2} />
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
            Overall Confidence
          </span>
          <span className="text-[24px] font-bold leading-none tabular-nums tracking-tight" style={{ color: tone }}>
            {score}<span className="text-[12px] font-mono" style={{ color: 'var(--text-disabled)' }}> /100</span>
          </span>
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4 flex-wrap exec-print-dark">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-bold tabular-nums" style={{ color: '#00B074' }}>{passed}</span>
          <span style={{ color: 'var(--text-muted)' }}>healthy</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-bold tabular-nums" style={{ color: '#FFB100' }}>{degraded}</span>
          <span style={{ color: 'var(--text-muted)' }}>degraded</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-bold tabular-nums" style={{ color: '#FF003C' }}>{failed}</span>
          <span style={{ color: 'var(--text-muted)' }}>failed</span>
        </span>
      </div>
    </div>
  );
}

// ─── Sign-off ────────────────────────────────────────────────────────────────

function SignOffRow({ so, idx }: { so: ReportSignOff; idx: number }) {
  const isSigned = so.status === 'signed';
  const Icon = isSigned ? CircleCheck : ClockIcon;
  const color = isSigned ? '#00B074' : '#FFB100';

  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3 exec-print-dark"
      style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)' }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} strokeWidth={2} />
        <span className="text-[12.5px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {so.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: isSigned ? 'rgba(0,176,116,0.08)' : 'rgba(255,177,0,0.08)', color, border: `1px solid ${isSigned ? 'rgba(0,176,116,0.22)' : 'rgba(255,177,0,0.22)'}` }}
        >
          {so.status}
        </span>
      </div>
      <div className="flex items-center gap-3 pl-6 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          {so.role}
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {so.signedAt}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed pl-6" style={{ color: 'var(--text-muted)' }}>
        {so.comment}
      </p>
    </div>
  );
}

function SignOffPanel({ signOffs: initialSignOffs }: { signOffs: ReportSignOff[] }) {
  const [localSignOffs, setLocalSignOffs] = useState<ReportSignOff[]>(initialSignOffs);
  const signedCount = localSignOffs.filter((s) => s.status === 'signed').length;

  const handleSign = useCallback((id: string) => {
    setLocalSignOffs((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: 'signed', signedAt: '2026-07-14 15:40 UTC', comment: s.comment === '—' ? 'Approved.' : s.comment }
          : s,
      ),
    );
  }, []);

  return (
    <section className="flex flex-col gap-3 exec-report-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4" style={{ color: 'var(--accent)' }} strokeWidth={2} />
          <h4 className="text-[13px] font-bold tracking-tight exec-print-dark" style={{ color: 'var(--text-primary)' }}>
            Stakeholder Sign-Off
          </h4>
        </div>
        <span className="text-[10px] font-mono exec-print-dark" style={{ color: 'var(--text-disabled)' }}>
          {signedCount}/{localSignOffs.length} signed
        </span>
      </div>
      <div
        className="rounded-[8px] flex flex-col overflow-hidden exec-print-dark"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      >
        {localSignOffs.map((so, idx) => (
          <SignOffRow key={so.id} so={so} idx={idx} />
        ))}
      </div>

      {/* Sign-off action buttons (hidden in print) */}
      <div className="exec-no-print flex items-center gap-2 flex-wrap pt-1">
        {localSignOffs
          .filter((s) => s.status === 'pending')
          .map((s) => (
            <Button
              key={s.id}
              variant="secondary"
              size="sm"
              icon={<PenLine className="w-3.5 h-3.5" />}
              onClick={() => handleSign(s.id)}
            >
              Sign as {s.role}
            </Button>
          ))}
        {localSignOffs.every((s) => s.status === 'signed') && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#00B074' }}>
            <CircleCheck className="w-4 h-4" strokeWidth={2} />
            All stakeholders signed off
          </span>
        )}
      </div>
    </section>
  );
}

// ─── Download ────────────────────────────────────────────────────────────────

function buildReportText(data: ReportData): string {
  const s = data.summary;
  const lines: string[] = [];
  const sep = '═'.repeat(70);
  const subsep = '─'.repeat(70);

  lines.push(sep);
  lines.push('  LIVELENS — DC EXIT EXECUTIVE REPORT');
  lines.push(sep);
  lines.push('');
  lines.push(`Report ID:       ${s.reportId}`);
  lines.push(`Session:         ${s.sessionName}`);
  lines.push(`Cutover Date:    ${s.cutoverDate}`);
  lines.push(`Prepared By:     ${s.preparedBy} (${s.preparedByRole})`);
  lines.push(`Overall Conf:    ${s.overallConfidence}/100`);
  lines.push('');
  lines.push('EXECUTIVE SUMMARY');
  lines.push(subsep);
  lines.push(s.headline);
  lines.push('');
  lines.push(s.narrative);
  lines.push('');

  lines.push('DATACENTERS');
  lines.push(subsep);
  for (const dc of data.datacenters) {
    lines.push(`  ${dc.name}`);
    lines.push(`    Status: ${dc.status}  |  Migrated: ${dc.appsMigrated}  |  Remaining: ${dc.appsRemaining}`);
    lines.push(`    ${dc.detail}`);
    lines.push('');
  }

  lines.push('APPLICATIONS');
  lines.push(subsep);
  for (const app of data.applications) {
    lines.push(`  [${app.tier}] ${app.name} — ${app.status} (conf ${app.confidence})`);
    lines.push(`    ${app.detail}`);
  }
  lines.push('');

  lines.push('DOWNTIME');
  lines.push(subsep);
  for (const dt of data.downtime) {
    lines.push(`  ${dt.application} — ${dt.duration} (${dt.window}) [impact: ${dt.impact}]`);
    lines.push(`    ${dt.detail}`);
  }
  lines.push('');

  lines.push('SIGN-OFF');
  lines.push(subsep);
  for (const so of data.signOffs) {
    lines.push(`  ${so.role}: ${so.name} — ${so.status.toUpperCase()} (${so.signedAt})`);
    lines.push(`    ${so.comment}`);
  }
  lines.push('');
  lines.push(sep);
  lines.push('  Generated by LiveLens DC Exit Validator');
  lines.push(`  ${new Date().toISOString()}`);
  lines.push(sep);

  return lines.join('\n');
}

interface ReportData {
  summary: ExecutiveSummary;
  datacenters: ReportDatacenter[];
  applications: ReportApplication[];
  downtime: ReportDowntime[];
  signOffs: ReportSignOff[];
}

function downloadReport(data: ReportData) {
  const text = buildReportText(data);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.summary.reportId}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function ReportToolbar({ summary, reportData }: { summary: ExecutiveSummary; reportData: ReportData }) {
  return (
    <div className="exec-no-print flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} strokeWidth={2} />
        <span className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Executive Report
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px]" style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}>
          {summary.reportId}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="primary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => downloadReport(reportData)}>
          Download Report
        </Button>
      </div>
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export interface ExecutiveReportTabProps {
  summary: ExecutiveSummary;
  datacenters: ReportDatacenter[];
  applications: ReportApplication[];
  downtime: ReportDowntime[];
  signOffs: ReportSignOff[];
  confidenceScore: number;
}

export function ExecutiveReportTab({
  summary,
  datacenters,
  applications,
  downtime,
  signOffs,
  confidenceScore,
}: ExecutiveReportTabProps) {
  const reportData: ReportData = { summary, datacenters, applications, downtime, signOffs };
  return (
    <div className="flex flex-col gap-5">
      <ReportToolbar summary={summary} reportData={reportData} />

      {/* Printable document container */}
      <div className="exec-report flex flex-col gap-5">
        <LargeSummary summary={summary} />

        {/* Datacenters */}
        <section className="flex flex-col gap-3 exec-report-section">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 exec-print-dark" style={{ color: 'var(--accent)' }} strokeWidth={2} />
            <h4 className="text-[13px] font-bold tracking-tight exec-print-dark" style={{ color: 'var(--text-primary)' }}>
              Datacenters
            </h4>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {datacenters.map((dc) => (
              <DatacenterCard key={dc.id} dc={dc} />
            ))}
          </div>
        </section>

        {/* Applications */}
        <section className="flex flex-col gap-3 exec-report-section">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 exec-print-dark" style={{ color: 'var(--accent)' }} strokeWidth={2} />
              <h4 className="text-[13px] font-bold tracking-tight exec-print-dark" style={{ color: 'var(--text-primary)' }}>
                Applications
              </h4>
            </div>
            <span className="text-[10px] font-mono exec-print-dark" style={{ color: 'var(--text-disabled)' }}>
              {applications.length} total
            </span>
          </div>
          <div
            className="rounded-[8px] flex flex-col overflow-hidden exec-print-dark"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
          >
            {applications.map((app, idx) => (
              <ApplicationRow key={app.id} app={app} idx={idx} />
            ))}
          </div>
        </section>

        {/* Downtime */}
        <section className="flex flex-col gap-3 exec-report-section">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 exec-print-dark" style={{ color: 'var(--accent)' }} strokeWidth={2} />
              <h4 className="text-[13px] font-bold tracking-tight exec-print-dark" style={{ color: 'var(--text-primary)' }}>
                Downtime
              </h4>
            </div>
            <span className="text-[10px] font-mono exec-print-dark" style={{ color: 'var(--text-disabled)' }}>
              {downtime.length} events
            </span>
          </div>
          <div
            className="rounded-[8px] flex flex-col overflow-hidden exec-print-dark"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
          >
            {downtime.map((dt, idx) => (
              <DowntimeRow key={dt.id} dt={dt} idx={idx} />
            ))}
          </div>
        </section>

        {/* Confidence summary */}
        <ConfidenceSummary applications={applications} score={confidenceScore} />

        {/* Sign-off */}
        <SignOffPanel signOffs={signOffs} />
      </div>
    </div>
  );
}
