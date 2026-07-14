/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Analyze step page. Renders a tabbed analysis surface with three
 * tabs: Impact Analysis (metric cards + dependency breakdown),
 * Dependencies (interactive XYFlow graph with type filter), and
 * Business Impact (capability cards). A Continue button advances
 * to the Decide phase.
 *
 * Mock data only — no backend.
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ImpactAnalysisTab } from '@/modules/dc-exit/components/ImpactAnalysisTab';
import { DependenciesTab } from '@/modules/dc-exit/components/DependenciesTab';
import { BusinessImpactTab } from '@/modules/dc-exit/components/BusinessImpactTab';

const TABS: AnalyzeTabDef[] = [
  { id: 'impact', label: 'Impact Analysis' },
  { id: 'dependencies', label: 'Dependencies' },
  { id: 'business', label: 'Business Impact' },
];

export function AnalyzePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<string>('impact');

  const handleContinue = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/decide`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* === Tab bar === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* === Tab body === */}
      {activeTab === 'impact' && <ImpactAnalysisTab />}
      {activeTab === 'dependencies' && <DependenciesTab />}
      {activeTab === 'business' && <BusinessImpactTab />}

      {/* === Continue === */}
      <div className="flex items-center justify-end pt-1">
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          iconRight={<ArrowRight className="w-4 h-4" />}
        >
          Continue to Decide
        </Button>
      </div>
    </div>
  );
}
