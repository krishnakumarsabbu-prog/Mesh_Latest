import React, { useState, useEffect } from 'react';
import { Play, CircleCheck as CheckCircle, Circle as XCircle, CircleAlert as AlertCircle, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { healthRulesApi } from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';
import { HealthRule, RuleMetadata, RuleTestResponse, ConditionTestDetail } from '@/types';

interface RuleTestModalProps {
  open: boolean;
  onClose: () => void;
  rule?: HealthRule;
  metadata: RuleMetadata | null;
}

const DEFAULT_PAYLOAD = {
  project_id: 'test-project',
  connector_id: 'test-connector',
  health_status: 'degraded',
  health_score: 55,
  response_time_ms: 8500,
  availability_pct: 82.0,
  sla_pct: 78.0,
  consecutive_failures: 5,
  error_rate: 0.18,
  incident_count: 3,
  uptime_pct: 92.0,
};

function ConditionResultRow({ detail, idx }: { detail: ConditionTestDetail; idx: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${detail.matched ? 'rgba(0,229,153,0.20)' : 'rgba(239,68,68,0.15)'}`,
        background: detail.matched ? 'rgba(0,229,153,0.04)' : 'rgba(239,68,68,0.04)',
      }}
    >
      <button
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0">
          {detail.matched ? (
            <CheckCircle className="w-4 h-4" style={{ color: '#00E599' }} />
          ) : (
            <XCircle className="w-4 h-4" style={{ color: '#EF4444' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Condition {idx + 1}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              {detail.metric_type}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              {detail.operator}
            </span>
            {detail.threshold_value !== undefined && detail.threshold_value !== null && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                threshold: {detail.threshold_value}
                {detail.threshold_value_max !== undefined && ` – ${detail.threshold_value_max}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-medium" style={{ color: detail.matched ? '#00E599' : '#EF4444' }}>
            actual: {String(detail.actual_value ?? 'null')}
          </span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0">
          <div
            className="text-xs p-2.5 rounded-lg font-mono leading-relaxed"
            style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}
          >
            {detail.explanation}
          </div>
        </div>
      )}
    </div>
  );
}

export function RuleTestModal({ open, onClose, rule, metadata }: RuleTestModalProps) {
  const { add: addNotification } = useNotificationStore();

  const [payloadText, setPayloadText] = useState('');
  const [payloadError, setPayloadError] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<RuleTestResponse | null>(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setPayloadError('');
    } else {
      setPayloadText(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
      setResult(null);
    }
  }, [open]);

  const handleTest = async () => {
    if (!rule) return;
    setPayloadError('');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      setPayloadError('Invalid JSON — please fix the payload');
      return;
    }

    setTesting(true);
    try {
      const res = await healthRulesApi.test({ rule_id: rule.id, sample_payload: parsed });
      setResult(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      addNotification({ type: 'error', title: 'Test failed', message: typeof detail === 'string' ? detail : undefined });
    } finally {
      setTesting(false);
    }
  };

  const formatScoreImpact = (impact: number | undefined | null) => {
    if (impact === undefined || impact === null) return null;
    if (impact === 0) return <span style={{ color: 'var(--text-muted)' }}>No impact</span>;
    return (
      <span style={{ color: impact < 0 ? '#EF4444' : '#00E599', fontWeight: 600 }}>
        {impact > 0 ? '+' : ''}{impact.toFixed(1)} pts
      </span>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test Rule"
      subtitle={rule ? `Testing: "${rule.name}"` : 'No rule selected'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Play className="w-3.5 h-3.5" />}
            onClick={handleTest}
            loading={testing}
            disabled={!rule}
          >
            Run Test
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 max-h-[70vh]">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Sample Payload (JSON)
            </label>
            <textarea
              value={payloadText}
              onChange={(e) => { setPayloadText(e.target.value); setPayloadError(''); }}
              rows={18}
              className="w-full text-xs font-mono leading-relaxed focus:outline-none"
              style={{
                background: 'var(--app-bg-subtle)',
                border: `1px solid ${payloadError ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '12px',
                padding: '12px',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
              spellCheck={false}
            />
            {payloadError && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <AlertCircle className="w-3 h-3" style={{ color: '#EF4444' }} />
                <span className="text-xs" style={{ color: '#EF4444' }}>{payloadError}</span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)' }}>
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#38BDF8' }} />
              <div className="text-xs leading-relaxed" style={{ color: '#38BDF8' }}>
                Modify the payload values to simulate different connector states. The rule will evaluate each condition against these values.
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto">
          {!result ? (
            <div
              className="flex flex-col items-center justify-center h-48 rounded-2xl"
              style={{ background: 'var(--app-bg-subtle)', border: '1px dashed rgba(255,255,255,0.08)' }}
            >
              <Play className="w-8 h-8 mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                Run a test to see results
              </span>
              <span className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.20)' }}>
                Modify the payload and click "Run Test"
              </span>
            </div>
          ) : (
            <>
              <div
                className="rounded-2xl p-4"
                style={{
                  background: result.matched ? 'rgba(0,229,153,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${result.matched ? 'rgba(0,229,153,0.20)' : 'rgba(239,68,68,0.15)'}`,
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  {result.matched ? (
                    <CheckCircle className="w-5 h-5" style={{ color: '#00E599' }} />
                  ) : (
                    <XCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
                  )}
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Rule {result.matched ? 'TRIGGERED' : 'NOT Triggered'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {result.logic_group.toUpperCase()} logic · {result.condition_details.length} condition{result.condition_details.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] font-medium uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Score Impact</div>
                    <div className="text-sm font-bold">{formatScoreImpact(result.score_impact)}</div>
                  </div>
                  <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] font-medium uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Status Override</div>
                    <div className="text-sm font-bold" style={{ color: result.status_override ? '#F59E0B' : 'var(--text-muted)' }}>
                      {result.status_override || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
                      <span className="text-xs" style={{ color: '#F59E0B' }}>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Condition Results
                </div>
                <div className="space-y-2">
                  {result.condition_details.map((detail, idx) => (
                    <ConditionResultRow key={idx} detail={detail} idx={idx} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
