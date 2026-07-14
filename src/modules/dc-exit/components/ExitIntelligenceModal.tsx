/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Exit Intelligence modal opened from the Runtime Location page.
 * Collects Source Datacenter, Target Datacenter, and SLA Window,
 * then starts a mock analysis session and navigates to the
 * dc-exit workflow. Mock only - no backend.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Building2, ArrowRight, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';

interface ExitIntelligenceModalProps {
  open: boolean;
  onClose: () => void;
}

const DATACENTERS = [
  { value: '', label: 'Select a datacenter…' },
  { value: 'dc-east-1', label: 'DC-East-1 (Ashburn)' },
  { value: 'dc-east-2', label: 'DC-East-2 (New Jersey)' },
  { value: 'dc-west-1', label: 'DC-West-1 (Hillsboro)' },
  { value: 'dc-central-1', label: 'DC-Central-1 (Chicago)' },
  { value: 'dc-south-1', label: 'DC-South-1 (Dallas)' },
];

const SLA_WINDOWS = [
  { value: '', label: 'Select an SLA window…' },
  { value: '4h', label: '4 hours (Critical)' },
  { value: '8h', label: '8 hours (High)' },
  { value: '24h', label: '24 hours (Standard)' },
  { value: '48h', label: '48 hours (Planned)' },
  { value: '1w', label: '1 week (Extended)' },
];

export function ExitIntelligenceModal({ open, onClose }: ExitIntelligenceModalProps) {
  const navigate = useNavigate();
  const [sourceDc, setSourceDc] = useState('');
  const [targetDc, setTargetDc] = useState('');
  const [slaWindow, setSlaWindow] = useState('');
  const [error, setError] = useState('');

  const handleStart = () => {
    if (!sourceDc || !targetDc || !slaWindow) {
      setError('All fields are required to start analysis.');
      return;
    }
    if (sourceDc === targetDc) {
      setError('Source and target datacenters must differ.');
      return;
    }
    setError('');
    // Mock only: create a temporary session and navigate to the dc-exit workflow.
    onClose();
    navigate('/dc-exit/session-001/discover');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exit Intelligence"
      subtitle="Plan and simulate a data-center exit with the Enterprise Digital Twin."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} size="sm">Cancel</Button>
          <Button variant="primary" onClick={handleStart} size="sm" icon={<Rocket className="w-3.5 h-3.5" />}>
            Start Analysis
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Source Datacenter"
          required
          options={DATACENTERS}
          value={sourceDc}
          onChange={(e) => setSourceDc(e.target.value)}
        />
        <div className="flex justify-center -my-1">
          <ArrowRight className="w-4 h-4 rotate-90" style={{ color: 'var(--text-muted)' }} />
        </div>
        <Select
          label="Target Datacenter"
          required
          options={DATACENTERS}
          value={targetDc}
          onChange={(e) => setTargetDc(e.target.value)}
        />
        <Select
          label="SLA Window"
          required
          options={SLA_WINDOWS}
          value={slaWindow}
          onChange={(e) => setSlaWindow(e.target.value)}
        />
        {error && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
            <TriangleAlert className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
        <div
          className="flex items-start gap-2.5 rounded-xl p-3 mt-1"
          style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
        >
          <Building2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Starting analysis creates a temporary workflow session. You can walk
            through Discover, Analyze, Decide, Execute, and Validate steps for
            the selected exit scope.
          </p>
        </div>
      </div>
    </Modal>
  );
}
