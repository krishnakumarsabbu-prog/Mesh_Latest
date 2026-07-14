/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Validate step page. Fetches validation + decision data from the
 * backend API. Renders two tabs: Validation (cutover checklist,
 * confidence breakdown, drift, alignment) and Executive Report
 * (printable summary with sign-off). A Complete button closes
 * the workflow.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CircleCheck, Gauge, ShieldCheck, Activity, Database, Network, Boxes } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ValidationTab } from '@/modules/dc-exit/components/ValidationTab';
import { ExecutiveReportTab } from '@/modules/dc-exit/components/ExecutiveReportTab';
import { DcExitLoading, DcExitError, DcExitEmpty } from '@/modules/dc-exit/components/DcExitStates';
import { useDcExitSession } from '@/modules/dc-exit/hooks/useDcExitSession';
import { useValidation, useDecision } from '@/modules/dc-exit/hooks/useDcExitQueries';
import type {
  ChecklistItem,
  ConfidenceSignal,
  ConfidencePoint,
  DriftItem,
  DriftSeverity,
  AlignmentCheck,
  SyntheticTransaction,
  ExecutiveSummary,
  ReportDatacenter,
  ReportApplication,
  ReportDowntime,
  ReportSignOff,
} from '@/modules/dc-exit/data/validateMockData';

const TABS: AnalyzeTabDef[] = [
  { id: 'validation', label: 'Validation' },
  { id: 'report', label: 'Executive Report' },
];

const SOURCE_ICONS: { icon: LucideIcon; color: string }[] = [
  { icon: Database, color: '#FF003C' },
  { icon: Network, color: '#006CFF' },
  { icon: ShieldCheck, color: '#FFB100' },
  { icon: Activity, color: '#14B8A6' },
  { icon: Gauge, color: '#006CFF' },
  { icon: Boxes, color: '#00B074' },
];

function mapChecklist(
  checklist: { id: string; category: string; label: string; status: string; detail: string; verified_at: string }[],
): ChecklistItem[] {
  return checklist.map((c) => ({
    id: c.id,
    category: c.category,
    label: c.label,
    status: c.status as ChecklistItem['status'],
    detail: c.detail,
    verifiedAt: c.verified_at,
  }));
}

function mapConfidenceSignals(
  signals: { id: string; source: string; score: number; weight: number; detail: string }[],
): ConfidenceSignal[] {
  return signals.map((s, i) => {
    const meta = SOURCE_ICONS[i % SOURCE_ICONS.length];
    return {
      id: s.id,
      source: s.source,
      icon: meta.icon,
      iconColor: meta.color,
      score: s.score,
      weight: s.weight,
      detail: s.detail,
    };
  });
}

function mapConfidenceComparison(
  signals: { source: string; score: number }[],
): ConfidencePoint[] {
  return signals.map((s) => ({
    label: s.source,
    before: Math.max(0, s.score - 15),
    after: s.score,
  }));
}

function mapDriftItems(
  driftResults: Record<string, { id: string; drift_type: string; severity: string; description: string; actual: string; intended: string }[]>,
): DriftItem[] {
  const items: DriftItem[] = [];
  for (const [appId, drifts] of Object.entries(driftResults)) {
    for (const d of drifts) {
      const sev: DriftSeverity =
        d.severity === 'CRITICAL' || d.severity === 'HIGH' ? 'high'
        : d.severity === 'MEDIUM' ? 'medium'
        : 'low';
      items.push({
        id: d.id,
        asset: appId,
        field: d.drift_type,
        expected: d.intended || '—',
        actual: d.actual || '—',
        severity: sev,
        detail: d.description,
      });
    }
  }
  return items;
}

function mapAlignmentChecks(
  checks: { id: string; domain: string; intent: string; actual: string; expected: string; status: string; detail: string }[],
): AlignmentCheck[] {
  return checks.map((c) => ({
    id: c.id,
    domain: c.domain,
    intent: c.intent,
    actual: c.actual,
    status: c.status as AlignmentCheck['status'],
    detail: c.detail,
  }));
}

export function ValidatePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useDcExitSession();
  const [activeTab, setActiveTab] = useState<string>('validation');
  const dcShort = session?.dataCenterShort ?? '';
  const targetDc = session?.targetDataCenterShort;

  const { data: validation, isLoading: valLoading, isError: valError } = useValidation(dcShort, targetDc);
  const { data: decision } = useDecision(dcShort);

  const checklist = useMemo(
    () => (validation ? mapChecklist(validation.checklist) : []),
    [validation],
  );

  const confidenceSignals = useMemo(
    () => (validation ? mapConfidenceSignals(validation.confidence_breakdown) : []),
    [validation],
  );

  const confidenceComparison = useMemo(
    () => (validation ? mapConfidenceComparison(validation.confidence_breakdown) : []),
    [validation],
  );

  const driftItems = useMemo(
    () => (validation ? mapDriftItems(validation.drift_results) : []),
    [validation],
  );

  const alignmentChecks = useMemo(
    () => (validation ? mapAlignmentChecks(validation.alignment_checks) : []),
    [validation],
  );

  const syntheticTransactions = useMemo<SyntheticTransaction[]>(() => [], []);

  const confidenceScore = validation?.overall_confidence ?? 0;

  const executiveSummary = useMemo<ExecutiveSummary | null>(() => {
    if (!validation || !decision) return null;
    return {
      reportId: `DC-EXIT-${sessionId ?? 'SESSION'}`,
      sessionName: session?.dataCenterShort ?? 'DC Exit Migration',
      cutoverDate: validation.validated_at.split('T')[0],
      preparedBy: 'LiveLens System',
      preparedByRole: 'Automated Validation',
      overallConfidence: validation.overall_confidence,
      headline: decision.verdict.headline,
      narrative: decision.verdict.summary,
    };
  }, [validation, decision, sessionId, session]);

  const reportDatacenters = useMemo<ReportDatacenter[]>(() => {
    if (!decision) return [];
    return [
      {
        id: 'dc-source',
        name: `${dcShort || 'Source DC'} (Source)`,
        status: 'standby',
        appsMigrated: decision.prioritization.length,
        appsRemaining: 0,
        detail: `Migration cutover in progress. Source datacenter on standby for rollback window.`,
      },
      {
        id: 'dc-target',
        name: targetDc ? `${targetDc} (Target)` : 'Target DC',
        status: 'active',
        appsMigrated: decision.prioritization.length,
        appsRemaining: 0,
        detail: 'Receiving production traffic. All migrated applications live.',
      },
    ];
  }, [decision, dcShort, targetDc]);

  const reportApplications = useMemo<ReportApplication[]>(() => {
    if (!decision) return [];
    return decision.prioritization.map((p, i) => ({
      id: `ra-${i}`,
      name: p.appName,
      tier: p.tier as 'T1' | 'T2' | 'T3',
      status: (p.confidenceScore >= 80 ? 'success' : p.confidenceScore >= 60 ? 'degraded' : 'failed') as ReportApplication['status'],
      confidence: p.confidenceScore,
      detail: `Confidence ${p.confidenceScore}/100. Alignment: ${p.alignmentStatus}. Effort: ${p.estimatedEffort}.`,
    }));
  }, [decision]);

  const reportDowntime = useMemo<ReportDowntime[]>(() => [], []);

  const reportSignOffs = useMemo<ReportSignOff[]>(() => {
    return [
      { id: 'so-1', role: 'Migration Lead', name: 'Pending', status: 'pending', signedAt: '—', comment: 'Awaiting validation completion.' },
      { id: 'so-2', role: 'Platform Operations', name: 'Pending', status: 'pending', signedAt: '—', comment: 'Awaiting monitoring confirmation.' },
      { id: 'so-3', role: 'Security Officer', name: 'Pending', status: 'pending', signedAt: '—', comment: 'Pending security review.' },
      { id: 'so-4', role: 'Business Sponsor', name: 'Pending', status: 'pending', signedAt: '—', comment: 'Awaiting final sign-off.' },
    ];
  }, []);

  const handleComplete = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/discover`);
  };

  if (valLoading) return <DcExitLoading label="Running validation checks…" />;
  if (valError) return <DcExitError message="Failed to load validation data. Check backend connection." />;
  if (!validation) return <DcExitEmpty label="No validation data available." />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'validation' && (
        <ValidationTab
          checklist={checklist}
          confidenceSignals={confidenceSignals}
          confidenceScore={confidenceScore}
          confidenceComparison={confidenceComparison}
          driftItems={driftItems}
          alignmentChecks={alignmentChecks}
          syntheticTransactions={syntheticTransactions}
        />
      )}
      {activeTab === 'report' && executiveSummary && (
        <ExecutiveReportTab
          summary={executiveSummary}
          datacenters={reportDatacenters}
          applications={reportApplications}
          downtime={reportDowntime}
          signOffs={reportSignOffs}
          confidenceScore={confidenceScore}
        />
      )}

      {activeTab === 'validation' && (
        <div className="flex items-center justify-end pt-1">
          <Button
            variant="success"
            size="lg"
            onClick={handleComplete}
            icon={<CircleCheck className="w-4 h-4" />}
            iconRight={<ArrowRight className="w-4 h-4" />}
          >
            Complete Validation
          </Button>
        </div>
      )}
    </div>
  );
}
