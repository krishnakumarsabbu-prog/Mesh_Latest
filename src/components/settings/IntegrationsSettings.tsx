import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, TestTube, CircleCheck as CheckCircle, Circle as XCircle, Loader, Zap, Mail, MessageSquare, Bell, Globe, TriangleAlert as AlertTriangle } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import apiClient from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';

interface Integration {
  id: string;
  name: string;
  integration_type: string;
  status: string;
  description: string | null;
  config: Record<string, any>;
  is_enabled: boolean;
  last_tested_at: string | null;
  last_test_result: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

const INTEGRATION_TYPES = [
  { value: 'slack', label: 'Slack', icon: MessageSquare, desc: 'Send alerts to Slack channels via webhooks', fields: [{ key: 'webhook_url', label: 'Webhook URL', secret: true, placeholder: 'https://hooks.slack.com/services/...' }] },
  { value: 'teams', label: 'Microsoft Teams', icon: MessageSquare, desc: 'Post notifications to Teams channels', fields: [{ key: 'webhook_url', label: 'Webhook URL', secret: true, placeholder: 'https://outlook.office.com/webhook/...' }] },
  { value: 'email_smtp', label: 'Email (SMTP)', icon: Mail, desc: 'Send email notifications via SMTP', fields: [
    { key: 'host', label: 'SMTP Host', secret: false, placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', secret: false, placeholder: '587' },
    { key: 'username', label: 'Username', secret: false, placeholder: 'user@example.com' },
    { key: 'password', label: 'Password', secret: true, placeholder: '••••••••' },
    { key: 'from_email', label: 'From Email', secret: false, placeholder: 'alerts@example.com' },
    { key: 'use_tls', label: 'Use TLS', secret: false, placeholder: 'true' },
  ]},
  { value: 'pagerduty', label: 'PagerDuty', icon: Bell, desc: 'Create incidents in PagerDuty', fields: [{ key: 'api_key', label: 'API Key', secret: true, placeholder: 'u+xxxxxxxxxxxx' }] },
  { value: 'webhook', label: 'Generic Webhook', icon: Globe, desc: 'Send POST requests to a custom endpoint', fields: [
    { key: 'url', label: 'Endpoint URL', secret: false, placeholder: 'https://your-service.com/webhook' },
    { key: 'token', label: 'Bearer Token (optional)', secret: true, placeholder: '••••••••' },
  ]},
];

const TYPE_ICONS: Record<string, React.ElementType> = {
  slack: Zap,
  teams: MessageSquare,
  email_smtp: Mail,
  pagerduty: AlertTriangle,
  webhook: Globe,
  generic: Globe,
};

type BadgeVariant = 'healthy' | 'degraded' | 'down' | 'unknown' | 'active' | 'inactive' | 'maintenance' | 'info' | 'default' | 'warning';

const STATUS_COLORS: Record<string, BadgeVariant> = {
  active: 'active',
  pending: 'warning',
  error: 'down',
  inactive: 'inactive',
};

interface FormState {
  name: string;
  integration_type: string;
  description: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
  is_enabled: boolean;
}

const emptyForm = (): FormState => ({
  name: '',
  integration_type: 'slack',
  description: '',
  config: {},
  secrets: {},
  is_enabled: true,
});

export function IntegrationsSettings() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { add: addNotification } = useNotificationStore();

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/settings/integrations');
      setIntegrations(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (integration: Integration) => {
    const typeDef = INTEGRATION_TYPES.find(t => t.value === integration.integration_type);
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};

    if (typeDef) {
      typeDef.fields.forEach(field => {
        const src = integration.config || {};
        if (!field.secret) {
          config[field.key] = src[field.key] || '';
        } else {
          secrets[field.key] = '';
        }
      });
    }

    setEditingId(integration.id);
    setForm({
      name: integration.name,
      integration_type: integration.integration_type,
      description: integration.description || '',
      config,
      secrets,
      is_enabled: integration.is_enabled,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.integration_type) {
      addNotification({ type: 'error', title: 'Validation', message: 'Name and type are required' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        integration_type: form.integration_type,
        description: form.description || null,
        config: form.config,
        secrets: form.secrets,
        is_enabled: form.is_enabled,
      };

      if (editingId) {
        await apiClient.put(`/settings/integrations/${editingId}`, payload);
        addNotification({ type: 'success', title: 'Updated', message: 'Integration updated successfully' });
      } else {
        await apiClient.post('/settings/integrations', payload);
        addNotification({ type: 'success', title: 'Created', message: 'Integration created successfully' });
      }
      setModalOpen(false);
      await loadIntegrations();
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to save integration' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiClient.post(`/settings/integrations/${id}/test`);
      if (res.data.success) {
        addNotification({ type: 'success', title: 'Test Passed', message: res.data.message });
      } else {
        addNotification({ type: 'error', title: 'Test Failed', message: res.data.message });
      }
      await loadIntegrations();
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to run integration test' });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.delete(`/settings/integrations/${id}`);
      setIntegrations(prev => prev.filter(i => i.id !== id));
      addNotification({ type: 'success', title: 'Deleted', message: 'Integration removed' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to delete integration' });
    } finally {
      setDeletingId(null);
    }
  };

  const selectedTypeDef = INTEGRATION_TYPES.find(t => t.value === form.integration_type);

  const setFieldValue = (field: { key: string; secret: boolean }, value: string) => {
    if (field.secret) {
      setForm(prev => ({ ...prev, secrets: { ...prev.secrets, [field.key]: value } }));
    } else {
      setForm(prev => ({ ...prev, config: { ...prev.config, [field.key]: value } }));
    }
  };

  const getFieldValue = (field: { key: string; secret: boolean }) => {
    if (field.secret) return form.secrets[field.key] || '';
    return form.config[field.key] || '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Platform Integrations</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Connect LiveLens to external notification and alerting services</p>
        </div>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
          Add Integration
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2].map(i => <div key={i} className="h-20 bg-neutral-100 rounded-xl animate-pulse" />)}
        </div>
      ) : integrations.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-3">
              <Globe className="w-6 h-6 text-neutral-400" />
            </div>
            <p className="text-sm font-medium text-neutral-700">No integrations configured</p>
            <p className="text-xs text-neutral-400 mt-1">Add Slack, Teams, email or webhook integrations to receive alerts</p>
            <Button size="sm" className="mt-4" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
              Add First Integration
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {integrations.map(integration => {
            const Icon = TYPE_ICONS[integration.integration_type] || Globe;
            const typeDef = INTEGRATION_TYPES.find(t => t.value === integration.integration_type);
            return (
              <Card key={integration.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-neutral-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-neutral-900">{integration.name}</p>
                        <Badge variant={STATUS_COLORS[integration.status] || 'default'} size="sm">
                          {integration.status}
                        </Badge>
                        {!integration.is_enabled && <Badge variant="default" size="sm">Disabled</Badge>}
                      </div>
                      <p className="text-xs text-neutral-500">
                        {typeDef?.label || integration.integration_type}
                        {integration.last_tested_at ? ` · Last tested ${new Date(integration.last_tested_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={testingId === integration.id ? <Loader className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                      onClick={() => handleTest(integration.id)}
                      loading={testingId === integration.id}
                    >
                      Test
                    </Button>
                    <Button variant="ghost" size="xs" icon={<Pencil className="w-3 h-3" />} onClick={() => openEdit(integration)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Trash2 className="w-3 h-3" />}
                      loading={deletingId === integration.id}
                      onClick={() => handleDelete(integration.id)}
                      className="text-red-500 hover:bg-red-50"
                    />
                  </div>
                </div>
                {integration.last_test_result && (
                  <div className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${integration.last_test_result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {integration.last_test_result.success ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {integration.last_test_result.message}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Integration' : 'Add Integration'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Integration Name"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Engineering Slack Alerts"
          />

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Integration Type</label>
            <div className="grid grid-cols-1 gap-2">
              {INTEGRATION_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, integration_type: type.value, config: {}, secrets: {} }))}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    form.integration_type === type.value
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <type.icon className={`w-4 h-4 flex-shrink-0 ${form.integration_type === type.value ? 'text-primary-600' : 'text-neutral-500'}`} />
                  <div>
                    <p className={`text-sm font-medium ${form.integration_type === type.value ? 'text-primary-800' : 'text-neutral-800'}`}>{type.label}</p>
                    <p className="text-xs text-neutral-500">{type.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedTypeDef && (
            <div className="space-y-3 pt-2 border-t border-neutral-100">
              <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Configuration</p>
              {selectedTypeDef.fields.map(field => (
                <div key={field.key}>
                  <Input
                    label={field.label + (field.secret ? ' (secret)' : '')}
                    type={field.secret ? 'password' : 'text'}
                    value={getFieldValue(field)}
                    onChange={e => setFieldValue(field, e.target.value)}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
          )}

          <Input
            label="Description (optional)"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="What is this integration used for?"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? 'Save Changes' : 'Create Integration'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
