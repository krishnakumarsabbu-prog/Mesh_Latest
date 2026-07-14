/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Execute step page. Fetches the decision/wave plan from the
 * backend API and maps it to execution status + timeline views.
 * A Continue button advances to the Validate phase.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ExecutionTab } from '@/modules/dc-exit/components/ExecutionTab';
import { TimelineTab } from '@/modules/dc-exit/components/TimelineTab';
import { DcExitLoading, DcExitError, DcExitEmpty } from '@/modules/dc-exit/components/DcExitStates';
import { useDcExitSession } from '@/modules/dc-exit/hooks/useDcExitSession';
import { useDecision } from '@/modules/dc-exit/hooks/useDcExitQueries';
import type {
  ExecApp,
  ExecStatus,
  TimelineActual,
  AppTechIcon,
} from '@/modules/dc-exit/data/executeMockData';

const TABS: AnalyzeTabDef[] = [
  { id: 'execution', label: 'Execution' },
  { id: 'timeline', label: 'Timeline' },
];

function mapExecApps(
  prioritization: { app_id: string; appName: string; tier: string; complexity: string; confidenceScore: number; wave: number | null; estimatedEffort: string; alignmentStatus: string }[],
): ExecApp[] {
  return prioritization.map((p, i) => {
    const wave = p.wave ?? 1;
    let status: ExecStatus = 'pending';
    if (wave === 1) status = i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'running' : 'verifying';
    else if (wave === 2) status = 'pending';

    const stepsTotal = wave === 1 ? 6 : 4;
    const stepsDone = status === 'completed' ? stepsTotal : status === 'running' ? Math.floor(stepsTotal * 0.6) : status === 'verifying' ? stepsTotal - 1 : 0;
    const progress = status === 'completed' ? 100 : status === 'running' ? 60 : status === 'verifying' ? 85 : 0;

    const techIcon: AppTechIcon = p.appName.toLowerCase().includes('oracle') ? 'oracle'
      : p.appName.toLowerCase().includes('kafka') ? 'kafka'
      : p.appName.toLowerCase().includes('mq') ? 'mq'
      : p.appName.toLowerCase().includes('dns') ? 'dns'
      : 'app';

    return {
      id: `exec-${p.app_id}`,
      name: p.appName,
      techIcon,
      tier: p.tier as 'T1' | 'T2' | 'T3',
      wave,
      status,
      progress,
      confidence: p.confidenceScore,
      stepsDone,
      stepsTotal,
      owner: `${p.tier} Migration Team`,
      detail: `Confidence ${p.confidenceScore}/100 (${p.alignmentStatus}). Effort: ${p.estimatedEffort}.`,
    };
  });
}

function mapTimeline(waves: { wave: number; app_count: number; apps: { appName: string }[] }[]): TimelineActual[] {
  const phaseLabels = ['Pre-checks & freeze', 'Database switchover', 'App deployment', 'Traffic shift', 'Post-checks & validation'];
  const result: TimelineActual[] = [];

  for (let hour = 0; hour < Math.min(5, Math.max(waves.length + 1, 3)); hour++) {
    const label = phaseLabels[hour] ?? `Hour ${hour}`;
    const startMin = 0;
    const durationMin = 45 + hour * 5;
    const isCompleted = hour < Math.floor(waves.length / 2);
    const isRunning = hour === Math.floor(waves.length / 2);

    result.push({
      hour,
      label,
      startMin,
      durationMin,
      actualStartMin: isCompleted || isRunning ? startMin + hour * 2 : null,
      actualDurationMin: isCompleted ? durationMin : isRunning ? Math.floor(durationMin * 0.5) : null,
      actualStatus: isCompleted ? 'completed' : isRunning ? 'running' : 'pending' as ExecStatus,
    });
  }

  return result;
}

export function ExecutePage() {
  const navigate = useNavigate();
  const { sessionId, session } = useDcExitSession();
  const [activeTab, setActiveTab] = useState<string>('execution');
  const dcShort = session?.dataCenterShort ?? '';

  const { data: decision, isLoading, isError } = useDecision(dcShort);

  const execApps = useMemo(
    () => (decision ? mapExecApps(decision.prioritization) : []),
    [decision],
  );

  const timeline = useMemo(
    () => (decision ? mapTimeline(decision.waves) : []),
    [decision],
  );

  const hours = useMemo(() => {
    const maxHour = timeline.length > 0 ? Math.max(...timeline.map((t) => t.hour)) : 4;
    return Array.from({ length: Math.max(maxHour + 1, 3) }, (_, i) => i);
  }, [timeline]);

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/validate`);
  };

  if (isLoading) return <DcExitLoading label="Loading execution plan…" />;
  if (isError) return <DcExitError message="Failed to load execution data. Check backend connection." />;
  if (!decision) return <DcExitEmpty label="No execution data available." />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'execution' && <ExecutionTab apps={execApps} />}
      {activeTab === 'timeline' && <TimelineTab timeline={timeline} hours={hours} />}

      <div className="flex items-center justify-end pt-1">
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          iconRight={<ArrowRight className="w-4 h-4" />}
        >
          Continue to Validate
        </Button>
      </div>
    </div>
  );
}
