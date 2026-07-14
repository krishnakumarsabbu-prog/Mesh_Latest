/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Decide step page. Renders a tabbed decision surface with three
 * tabs: Readiness (large score + category checks + blockers),
 * Prioritization (priority table with complexity, tier, deps), and
 * Decision Center (large verdict + reasoning timeline + evidence +
 * business impact + proceed). A Continue button advances to the
 * Execute phase.
 *
 * Mock data only — no backend.
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ReadinessTab } from '@/modules/dc-exit/components/ReadinessTab';
import { PrioritizationTab } from '@/modules/dc-exit/components/PrioritizationTab';
import { DecisionCenterTab } from '@/modules/dc-exit/components/DecisionCenterTab';

const TABS: AnalyzeTabDef[] = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'prioritization', label: 'Prioritization' },
  { id: 'decision', label: 'Decision Center' },
];

export function DecidePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<string>('readiness');

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/execute`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* === Tab bar === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* === Tab body === */}
      {activeTab === 'readiness' && <ReadinessTab />}
      {activeTab === 'prioritization' && <PrioritizationTab />}
      {activeTab === 'decision' && <DecisionCenterTab />}

      {/* === Continue === */}
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
