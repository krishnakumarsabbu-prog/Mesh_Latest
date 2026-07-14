/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Execute step page. Renders a tabbed execution surface with two
 * tabs: Execution (application list grouped by status with a live
 * confidence counter) and Timeline (Gantt-style Planned vs Actual
 * tracks across Hour 0-4). A Continue button advances to the
 * Validate phase.
 *
 * Mock data only — no backend.
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ExecutionTab } from '@/modules/dc-exit/components/ExecutionTab';
import { TimelineTab } from '@/modules/dc-exit/components/TimelineTab';

const TABS: AnalyzeTabDef[] = [
  { id: 'execution', label: 'Execution' },
  { id: 'timeline', label: 'Timeline' },
];

export function ExecutePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<string>('execution');

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/validate`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* === Tab bar === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* === Tab body === */}
      {activeTab === 'execution' && <ExecutionTab />}
      {activeTab === 'timeline' && <TimelineTab />}

      {/* === Continue === */}
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
