/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Decide step page. Fetches readiness + decision data from the
 * backend API. Renders three tabs: Readiness, Prioritization,
 * and Decision Center. A Continue button advances to Execute.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  Database, MessageSquare, Globe, Shield, HardDrive, Box,
  Network, FileCheck, RefreshCw, Activity,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ReadinessTab } from '@/modules/dc-exit/components/ReadinessTab';
import { PrioritizationTab } from '@/modules/dc-exit/components/PrioritizationTab';
import { DecisionCenterTab } from '@/modules/dc-exit/components/DecisionCenterTab';
import { DcExitLoading, DcExitError, DcExitEmpty } from '@/modules/dc-exit/components/DcExitStates';
import { useDcExitSession } from '@/modules/dc-exit/hooks/useDcExitSession';
import { useReadiness, useDecision } from '@/modules/dc-exit/hooks/useDcExitQueries';
import type {
  ReadinessCategory as MockReadinessCategory,
  ReadinessBlocker as MockReadinessBlocker,
  PriorityRow as MockPriorityRow,
  DecisionVerdict as MockDecisionVerdict,
  ReasoningStep as MockReasoningStep,
  DecisionEvidence as MockDecisionEvidence,
  DecisionBusinessImpact as MockDecisionBusinessImpact,
} from '@/modules/dc-exit/data/decideMockData';

const TABS: AnalyzeTabDef[] = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'prioritization', label: 'Prioritization' },
  { id: 'decision', label: 'Decision Center' },
];

const CATEGORY_ICON: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  database: { icon: Database, color: '#FF003C', bg: 'rgba(255,0,60,0.08)' },
  messaging: { icon: MessageSquare, color: '#FFB100', bg: 'rgba(255,177,0,0.08)' },
  dns: { icon: Globe, color: '#14B8A6', bg: 'rgba(20,184,166,0.08)' },
  firewall: { icon: Shield, color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
  storage: { icon: HardDrive, color: '#8A97A8', bg: 'rgba(138,151,168,0.10)' },
  compute: { icon: Box, color: '#14B8A6', bg: 'rgba(20,184,166,0.10)' },
  network: { icon: Network, color: '#006CFF', bg: 'rgba(0,108,255,0.08)' },
  certificates: { icon: FileCheck, color: '#FFB100', bg: 'rgba(255,177,0,0.08)' },
  secrets: { icon: Shield, color: '#FF003C', bg: 'rgba(255,0,60,0.08)' },
  replication: { icon: RefreshCw, color: '#006CFF', bg: 'rgba(0,108,255,0.08)' },
  monitoring: { icon: Activity, color: '#14B8A6', bg: 'rgba(20,184,166,0.08)' },
};

function getCategoryIcon(id: string) {
  return CATEGORY_ICON[id] ?? { icon: Shield, color: '#8A97A8', bg: 'rgba(138,151,168,0.10)' };
}

export function DecidePage() {
  const navigate = useNavigate();
  const { sessionId, session } = useDcExitSession();
  const [activeTab, setActiveTab] = useState<string>('readiness');
  const dcShort = session?.dataCenterShort ?? '';

  const { data: readiness, isLoading: readinessLoading, isError: readinessError } = useReadiness(dcShort);
  const { data: decision, isLoading: decisionLoading, isError: decisionError } = useDecision(dcShort);

  const readinessCategories = useMemo<MockReadinessCategory[]>(() => {
    if (!readiness) return [];
    return readiness.categories.map((c) => {
      const meta = getCategoryIcon(c.id);
      return {
        id: c.id,
        label: c.label,
        icon: meta.icon,
        iconColor: meta.color,
        iconBg: meta.bg,
        status: c.status as 'pass' | 'warn' | 'fail',
        score: c.score,
        total: c.total,
        detail: c.detail,
      };
    });
  }, [readiness]);

  const readinessBlockers = useMemo<MockReadinessBlocker[]>(() => {
    if (!readiness) return [];
    return readiness.blockers.map((b) => ({
      id: b.id,
      category: b.category,
      title: b.title,
      severity: b.severity,
      owner: b.owner,
      dueDate: b.due_date ?? '—',
      detail: b.detail,
    }));
  }, [readiness]);

  const priorityRows = useMemo<MockPriorityRow[]>(() => {
    if (!decision) return [];
    return decision.prioritization.map((p) => ({
      id: p.id,
      appName: p.appName,
      tier: p.tier as 'T1' | 'T2' | 'T3',
      complexity: p.complexity as 'low' | 'medium' | 'high',
      dependencies: p.dependencies,
      dependencyDetail: p.dependencyDetail,
      businessCriticality: p.businessCriticality as 'critical' | 'high' | 'medium' | 'low',
      estimatedEffort: p.estimatedEffort,
      wave: p.wave,
    }));
  }, [decision]);

  const verdict = useMemo<MockDecisionVerdict | null>(() => {
    if (!decision) return null;
    return {
      verdict: decision.verdict.verdict as 'SAFE' | 'CONDITIONAL' | 'DO_NOT_SHUTDOWN',
      headline: decision.verdict.headline,
      summary: decision.verdict.summary,
      confidence: decision.verdict.confidence,
    };
  }, [decision]);

  const reasoningTimeline = useMemo<MockReasoningStep[]>(() => {
    if (!decision) return [];
    return decision.reasoning_timeline.map((r) => ({
      id: r.id,
      phase: r.phase,
      timestamp: r.timestamp,
      title: r.title,
      detail: r.detail,
      tone: r.tone as 'positive' | 'neutral' | 'warning' | 'negative',
    }));
  }, [decision]);

  const evidence = useMemo<MockDecisionEvidence[]>(() => {
    if (!decision) return [];
    return decision.evidence.map((e) => ({
      id: e.id,
      source: e.source,
      finding: e.finding,
      weight: e.weight as 'high' | 'medium' | 'low',
    }));
  }, [decision]);

  const businessImpact = useMemo<MockDecisionBusinessImpact[]>(() => {
    if (!decision) return [];
    return decision.prioritization.slice(0, 6).map((p) => {
      const risk: 'low' | 'medium' | 'high' =
        p.confidenceScore >= 80 ? 'low' : p.confidenceScore >= 60 ? 'medium' : 'high';
      return {
        capability: p.appName,
        risk,
        customersAffected: Math.max(1, Math.round(p.confidenceScore / 2)),
        mitigation: p.alignmentStatus === 'ALIGNED'
          ? 'Dependencies replicated and verified. No disruption expected.'
          : 'Review alignment status before cutover.',
      };
    });
  }, [decision]);

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/execute`);
  };

  if (readinessLoading || decisionLoading)
    return <DcExitLoading label="Evaluating readiness and decision…" />;
  if (readinessError || decisionError)
    return <DcExitError message="Failed to load decision data. Check backend connection." />;
  if (!readiness || !decision)
    return <DcExitEmpty label="No decision data available for this data center." />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'readiness' && (
        <ReadinessTab
          score={readiness.overall_score}
          scoreLabel={`${readiness.overall_score}% migration-ready`}
          categories={readinessCategories}
          blockers={readinessBlockers}
        />
      )}
      {activeTab === 'prioritization' && (
        <PrioritizationTab rows={priorityRows} />
      )}
      {activeTab === 'decision' && (
        <DecisionCenterTab
          verdict={verdict!}
          reasoningTimeline={reasoningTimeline}
          evidence={evidence}
          businessImpact={businessImpact}
        />
      )}

      {activeTab !== 'decision' && (
        <div className="flex items-center justify-end pt-1">
          <Button
            variant="primary"
            size="lg"
            onClick={handleContinue}
            iconRight={<ArrowRight className="w-4 h-4" />}
          >
            Continue to Execute
          </Button>
        </div>
      )}
    </div>
  );
}
