/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Validate step page. Renders a tabbed validation surface with two
 * tabs: Validation (cutover checklist, confidence breakdown, drift
 * detection, alignment, synthetic transactions, and a confidence
 * comparison chart) and Executive Report (printable summary with
 * datacenter, application, downtime, confidence, prepared-by,
 * downloadable report, and stakeholder sign-off). Mock data only.
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AnalyzeTabBar, type AnalyzeTabDef } from '@/modules/dc-exit/components/AnalyzeTabBar';
import { ValidationTab } from '@/modules/dc-exit/components/ValidationTab';
import { ExecutiveReportTab } from '@/modules/dc-exit/components/ExecutiveReportTab';

const TABS: AnalyzeTabDef[] = [
  { id: 'validation', label: 'Validation' },
  { id: 'report', label: 'Executive Report' },
];

export function ValidatePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<string>('validation');

  const handleComplete = () => {
    if (sessionId) navigate(`/dc-exit/${sessionId}/discover`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* === Tab bar === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AnalyzeTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* === Tab body === */}
      {activeTab === 'validation' && <ValidationTab />}
      {activeTab === 'report' && <ExecutiveReportTab />}

      {/* === Complete === */}
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
