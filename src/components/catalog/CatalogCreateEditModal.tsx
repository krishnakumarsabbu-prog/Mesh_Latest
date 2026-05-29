import React, { useEffect, useState } from 'react';
import { ConnectorCatalogEntry } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { catalogApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';

const CATEGORY_OPTIONS = [
  { value: 'observability', label: 'Observability' },
  { value: 'apm', label: 'APM' },
  { value: 'itsm', label: 'ITSM' },
  { value: 'database', label: 'Database' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'custom', label: 'Custom' },
];

const ICON_OPTIONS = [
  { value: 'bar-chart-2', label: 'Bar Chart (Observability)' },
  { value: 'activity', label: 'Activity (Monitoring)' },
  { value: 'cpu', label: 'CPU (APM)' },
  { value: 'git-merge', label: 'Git Merge (Integration)' },
  { value: 'clipboard-list', label: 'Clipboard (ITSM)' },
  { value: 'globe', label: 'Globe (REST/HTTP)' },
  { value: 'database', label: 'Database (SQL)' },
  { value: 'zap', label: 'Zap (Event)' },
  { value: 'server', label: 'Server (Infrastructure)' },
  { value: 'network', label: 'Network (Connectivity)' },
  { value: 'plug', label: 'Plug (Generic)' },
];

const COLOR_OPTIONS = [
  { value: '#2563EB', label: 'Blue' },
  { value: '#059669', label: 'Green' },
  { value: '#FF6B35', label: 'Orange' },
  { value: '#F46800', label: 'Amber' },
  { value: '#00C0D1', label: 'Cyan' },
  { value: '#5B6EF5', label: 'Slate Blue' },
  { value: '#62D84E', label: 'Lime' },
  { value: '#DC2626', label: 'Red' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#0891B2', label: 'Teal' },
];

interface FormState {
  name: string;
  description: string;
  vendor: string;
  category: string;
  icon: string;
  color: string;
  tags: string;
  docs_url: string;
  version: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  description: '',
  vendor: '',
  category: 'custom',
  icon: 'plug',
  color: '#2563EB',
  tags: '',
  docs_url: '',
  version: '',
};

interface CatalogCreateEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entry?: ConnectorCatalogEntry | null;
}

export function CatalogCreateEditModal({ open, onClose, onSaved, entry }: CatalogCreateEditModalProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = !!entry;

  useEffect(() => {
    if (entry) {
      setForm({
        name: entry.name,
        description: entry.description || '',
        vendor: entry.vendor || '',
        category: entry.category,
        icon: entry.icon || 'plug',
        color: entry.color || '#2563EB',
        tags: entry.tags || '',
        docs_url: entry.docs_url || '',
        version: entry.version || '',
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [entry, open]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit && entry) {
        await catalogApi.update(entry.id, form);
        notify.success('Connector updated');
      } else {
        await catalogApi.create(form);
        notify.success('Custom connector created');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notify.error(isEdit ? 'Failed to update connector' : 'Failed to create connector', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Connector' : 'Create Custom Connector'}
      subtitle={isEdit ? `Editing ${entry?.name}` : 'Add a new connector to the catalog'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="catalog-form" loading={saving}>
            {isEdit ? 'Save Changes' : 'Create Connector'}
          </Button>
        </>
      }
    >
      <form id="catalog-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          placeholder="e.g., My Custom API"
          value={form.name}
          onChange={set('name')}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Vendor"
            placeholder="e.g., Acme Corp"
            value={form.vendor}
            onChange={set('vendor')}
          />
          <Input
            label="Version"
            placeholder="e.g., 1.0"
            value={form.version}
            onChange={set('version')}
          />
        </div>
        <TextArea
          label="Description"
          placeholder="Describe what this connector does..."
          value={form.description}
          onChange={set('description')}
          rows={2}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Category"
            value={form.category}
            onChange={set('category')}
            options={CATEGORY_OPTIONS}
          />
          <Select
            label="Icon"
            value={form.icon}
            onChange={set('icon')}
            options={ICON_OPTIONS}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Color"
            value={form.color}
            onChange={set('color')}
            options={COLOR_OPTIONS}
          />
          <Input
            label="Tags"
            placeholder="e.g., rest,monitoring,api"
            value={form.tags}
            onChange={set('tags')}
            hint="Comma-separated"
          />
        </div>
        <Input
          label="Documentation URL"
          placeholder="https://docs.example.com/api"
          value={form.docs_url}
          onChange={set('docs_url')}
          type="url"
        />
      </form>
    </Modal>
  );
}
