import React, { useState } from 'react';
import { MetricTemplate, MetricTemplateTestResult } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { metricTemplateApi } from '@/lib/api';
import { CircleCheck as CheckCircle, Circle as XCircle, TriangleAlert as AlertTriangle, Clock, Zap, Code, ChevronDown, ChevronRight } from 'lucide-react';

interface MetricTemplateTestModalProps {
  open: boolean;
  onClose: () => void;
  template: MetricTemplate | null;
  catalogEntryId: string;
}

export function MetricTemplateTestModal({ open, onClose, template, catalogEntryId }: MetricTemplateTestModalProps) {
  const [endpointUrl, setEndpointUrl] = useState('');
  const [authType, setAuthType] = useState('none');
  const [authToken, setAuthToken] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authApiKey, setAuthApiKey] = useState('');
  const [authApiHeader, setAuthApiHeader] = useState('X-API-Key');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<MetricTemplateTestResult | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);

  const handleTest = async () => {
    if (!endpointUrl.trim() || !template) return;
    setTesting(true);
    setResult(null);
    setRawExpanded(false);
    try {
      let auth_config: Record<string, unknown> | undefined;
      if (authType === 'bearer') {
        auth_config = { type: 'bearer', token: authToken };
      } else if (authType === 'basic') {
        auth_config = { type: 'basic', username: authUsername, password: authPassword };
      } else if (authType === 'api_key') {
        auth_config = { type: 'api_key', key: authApiKey, header: authApiHeader };
      }

      const res = await metricTemplateApi.test(catalogEntryId, template.id, {
        endpoint_url: endpointUrl,
        auth_config,
      });
      setResult(res.data as MetricTemplateTestResult);
    } catch {
      setResult({ success: false, error: 'Request failed. Check connection and configuration.' });
    } finally {
      setTesting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setRawExpanded(false);
    onClose();
  };

  if (!template) return null;

  const qc = template.query_config as Record<string, unknown> | null;
  const rm = template.result_mapping as Record<string, unknown> | null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Test Metric Template"
      subtitle={`Testing "${template.name}" — ${template.metric_key}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Close</Button>
          <Button onClick={handleTest} loading={testing} icon={<Zap className="w-4 h-4" />}>
            Run Test
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 space-y-2">
          <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Template Details</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <InfoRow label="Type" value={template.metric_type} />
            <InfoRow label="Aggregation" value={template.aggregation_type} />
            <InfoRow label="Parser" value={template.parser_type} />
            {template.unit && <InfoRow label="Unit" value={template.unit} />}
            {!!qc?.method && <InfoRow label="Method" value={String(qc!.method)} />}
            {!!qc?.path && <InfoRow label="Path" value={String(qc!.path)} />}
            {!!rm?.value_path && <InfoRow label="Value Path" value={String(rm!.value_path)} />}
          </div>
          {(template.threshold_warning != null || template.threshold_critical != null) && (
            <div className="flex gap-4 mt-2 pt-2 border-t border-neutral-100">
              {template.threshold_warning != null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                  Warning &ge; {template.threshold_warning}
                </span>
              )}
              {template.threshold_critical != null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                  Critical &ge; {template.threshold_critical}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Input
            label="Connector Base URL"
            placeholder="https://api.example.com"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            hint={qc?.path ? `Full URL will be: <base>${qc.path}` : undefined}
          />
          <Select
            label="Authentication"
            value={authType}
            onChange={(e) => setAuthType(e.target.value)}
            options={[
              { value: 'none', label: 'No Authentication' },
              { value: 'bearer', label: 'Bearer Token' },
              { value: 'basic', label: 'Basic Auth' },
              { value: 'api_key', label: 'API Key Header' },
            ]}
          />
          {authType === 'bearer' && (
            <Input
              label="Bearer Token"
              type="password"
              placeholder="Enter token..."
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
            />
          )}
          {authType === 'basic' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />
              <Input label="Password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
            </div>
          )}
          {authType === 'api_key' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Header Name" placeholder="X-API-Key" value={authApiHeader} onChange={(e) => setAuthApiHeader(e.target.value)} />
              <Input label="API Key" type="password" value={authApiKey} onChange={(e) => setAuthApiKey(e.target.value)} />
            </div>
          )}
        </div>

        {result && (
          <div className={`rounded-xl border p-4 space-y-3 ${result.success ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <span className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>
                {result.success ? 'Test Passed' : 'Test Failed'}
              </span>
              {result.response_time_ms != null && (
                <span className="ml-auto flex items-center gap-1 text-xs text-neutral-500">
                  <Clock className="w-3.5 h-3.5" />
                  {result.response_time_ms.toFixed(1)}ms
                </span>
              )}
              {result.status_code != null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${result.status_code < 400 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  HTTP {result.status_code}
                </span>
              )}
            </div>

            {result.error && (
              <p className="text-sm text-red-600 bg-red-100 rounded-lg px-3 py-2">{result.error}</p>
            )}

            {result.parsed_value != null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 font-medium">Parsed Value:</span>
                <span className="text-sm font-bold text-neutral-800 bg-white px-2 py-0.5 rounded border border-neutral-200">
                  {String(result.parsed_value)}{template.unit ? ` ${template.unit}` : ''}
                </span>
              </div>
            )}

            {result.validation_errors && result.validation_errors.length > 0 && (
              <div className="space-y-1.5">
                {result.validation_errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {err}
                  </div>
                ))}
              </div>
            )}

            {result.raw_response != null && (
              <div>
                <button
                  onClick={() => setRawExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  <Code className="w-3.5 h-3.5" />
                  Raw Response
                  {rawExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {rawExpanded && (
                  <pre className="mt-2 text-xs bg-neutral-900 text-neutral-100 rounded-xl p-3 overflow-auto max-h-48 font-mono leading-relaxed">
                    {typeof result.raw_response === 'string'
                      ? result.raw_response
                      : JSON.stringify(result.raw_response, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-neutral-400 font-medium w-20 flex-shrink-0">{label}</span>
      <span className="text-neutral-700 font-semibold truncate">{value}</span>
    </div>
  );
}
