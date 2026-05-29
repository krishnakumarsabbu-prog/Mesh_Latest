import React, { useEffect, useState } from 'react';
import { Bell, Mail, Smartphone, Clock, TriangleAlert as AlertTriangle } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';

interface UserSettings {
  email_notifications: boolean;
  in_app_notifications: boolean;
  alert_severity_info: boolean;
  alert_severity_warning: boolean;
  alert_severity_critical: boolean;
  digest_frequency: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const defaultSettings: UserSettings = {
  email_notifications: true,
  in_app_notifications: true,
  alert_severity_info: true,
  alert_severity_warning: true,
  alert_severity_critical: true,
  digest_frequency: 'daily',
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-primary-500' : 'bg-neutral-300'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-1'}`}
      />
    </button>
  );
}

export function NotificationsSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { add: addNotification } = useNotificationStore();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/settings/me');
        setSettings({
          email_notifications: res.data.email_notifications,
          in_app_notifications: res.data.in_app_notifications,
          alert_severity_info: res.data.alert_severity_info,
          alert_severity_warning: res.data.alert_severity_warning,
          alert_severity_critical: res.data.alert_severity_critical,
          digest_frequency: res.data.digest_frequency,
          quiet_hours_enabled: res.data.quiet_hours_enabled,
          quiet_hours_start: res.data.quiet_hours_start,
          quiet_hours_end: res.data.quiet_hours_end,
        });
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/settings/notifications', settings);
      addNotification({ type: 'success', title: 'Saved', message: 'Notification preferences updated' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to save notification preferences' });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof UserSettings, value: any) => setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-40 bg-neutral-100 rounded-xl" /><div className="h-40 bg-neutral-100 rounded-xl" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Notification Channels" subtitle="Choose how you receive notifications" />
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Mail className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800">Email Notifications</p>
                <p className="text-xs text-neutral-500">Receive alerts and digests via email</p>
              </div>
            </div>
            <Toggle checked={settings.email_notifications} onChange={v => set('email_notifications', v)} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800">In-App Notifications</p>
                <p className="text-xs text-neutral-500">Show notifications within the platform</p>
              </div>
            </div>
            <Toggle checked={settings.in_app_notifications} onChange={v => set('in_app_notifications', v)} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Alert Severity" subtitle="Select which severity levels trigger notifications" />
        <div className="space-y-3">
          {[
            { key: 'alert_severity_critical' as keyof UserSettings, label: 'Critical', desc: 'Service down or data loss risk', color: 'red' },
            { key: 'alert_severity_warning' as keyof UserSettings, label: 'Warning', desc: 'Degraded performance or threshold exceeded', color: 'yellow' },
            { key: 'alert_severity_info' as keyof UserSettings, label: 'Info', desc: 'Informational alerts and status changes', color: 'blue' },
          ].map(({ key, label, desc, color }) => (
            <div key={key} className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${color === 'red' ? 'bg-red-500' : color === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                <div>
                  <p className="text-sm font-medium text-neutral-800">{label}</p>
                  <p className="text-xs text-neutral-500">{desc}</p>
                </div>
              </div>
              <Toggle checked={settings[key] as boolean} onChange={v => set(key, v)} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Digest Frequency" subtitle="How often to receive summary emails" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['realtime', 'hourly', 'daily', 'weekly'].map(freq => (
            <button
              key={freq}
              onClick={() => set('digest_frequency', freq)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${
                settings.digest_frequency === freq
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {freq}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Quiet Hours" subtitle="Suppress non-critical notifications during specified hours" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-neutral-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800">Enable Quiet Hours</p>
                <p className="text-xs text-neutral-500">Only critical alerts will be sent during this period</p>
              </div>
            </div>
            <Toggle checked={settings.quiet_hours_enabled} onChange={v => set('quiet_hours_enabled', v)} />
          </div>
          {settings.quiet_hours_enabled && (
            <div className="grid grid-cols-2 gap-4 pt-2 pl-11">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Start Time</label>
                <input
                  type="time"
                  value={settings.quiet_hours_start}
                  onChange={e => set('quiet_hours_start', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">End Time</label>
                <input
                  type="time"
                  value={settings.quiet_hours_end}
                  onChange={e => set('quiet_hours_end', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>Save Preferences</Button>
      </div>
    </div>
  );
}
