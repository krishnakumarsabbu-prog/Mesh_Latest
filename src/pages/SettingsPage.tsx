import React, { useEffect, useState } from 'react';
import { User, Bell, Shield, Database, Palette, Globe } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { Card, CardHeader } from '@/components/ui/Card';
import { useAuthStore } from '@/store/authStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { NotificationsSettings } from '@/components/settings/NotificationsSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { ProxySettings } from '@/components/settings/ProxySettings';
import apiClient from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'integrations' | 'appearance' | 'proxy';

const TABS = [
  { id: 'profile' as SettingsTab, icon: User, label: 'Profile' },
  { id: 'notifications' as SettingsTab, icon: Bell, label: 'Notifications' },
  { id: 'security' as SettingsTab, icon: Shield, label: 'Security' },
  { id: 'integrations' as SettingsTab, icon: Database, label: 'Integrations' },
  { id: 'appearance' as SettingsTab, icon: Palette, label: 'Appearance' },
  { id: 'proxy' as SettingsTab, icon: Globe, label: 'Proxy' },
];

function ProfileSection() {
  const { user, setAuth } = useAuthStore();
  const { add: addNotification } = useNotificationStore();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/settings/profile', { full_name: fullName, email });
      if (user) {
        setAuth({ ...user, full_name: res.data.full_name, email: res.data.email }, useAuthStore.getState().access_token || '', useAuthStore.getState().refresh_token || '');
      }
      addNotification({ type: 'success', title: 'Profile Updated', message: 'Your profile has been saved' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Error', message: err?.response?.data?.detail || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Profile Settings" subtitle="Update your personal information" />
        <div className="space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-neutral-100">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xl font-bold">{user?.full_name?.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">{user?.full_name}</p>
              <p className="text-xs text-neutral-400 capitalize">{user?.role?.replace('_', ' ')}</p>
              <Button variant="secondary" size="xs" className="mt-2">Change Avatar</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
            <Input
              label="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Platform" subtitle="Tenant and workspace settings" />
        <div className="space-y-3">
          <div className="flex items-center justify-between px-4 py-3.5 bg-neutral-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-neutral-700">Tenant ID</p>
              <p className="text-xs text-neutral-400">Your workspace identifier</p>
            </div>
            <code className="text-xs font-mono bg-white border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700">
              {user?.tenant_id || 'default'}
            </code>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 bg-neutral-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-neutral-700">Role</p>
              <p className="text-xs text-neutral-400">Your current access level</p>
            </div>
            <code className="text-xs font-mono bg-white border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 capitalize">
              {user?.role?.replace(/_/g, ' ')}
            </code>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 bg-neutral-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-neutral-700">API Version</p>
              <p className="text-xs text-neutral-400">Current backend version</p>
            </div>
            <code className="text-xs font-mono bg-white border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700">v1</code>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  useEffect(() => {
    setPageTitle('Settings');
    setBreadcrumbs([{ label: 'Settings' }]);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'profile': return <ProfileSection />;
      case 'notifications': return <NotificationsSettings />;
      case 'security': return <SecuritySettings />;
      case 'integrations': return <IntegrationsSettings />;
      case 'appearance': return <AppearanceSettings />;
      case 'proxy': return <ProxySettings />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Settings</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Manage your account and workspace preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card padding="sm">
          <nav className="space-y-0.5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </Card>

        <div className="lg:col-span-3">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
