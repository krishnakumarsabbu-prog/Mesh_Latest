import React, { useEffect, useState } from 'react';
import { Globe, Save, RefreshCw, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { proxySettingsApi } from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';

interface ProxyState {
  proxy_url: string;
  proxy_strict_ssl: boolean;
  no_proxy: string;
  is_enabled: boolean;
}

const DEFAULT_STATE: ProxyState = {
  proxy_url: '',
  proxy_strict_ssl: true,
  no_proxy: '',
  is_enabled: false,
};

export function ProxySettings() {
  const [form, setForm] = useState<ProxyState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { add: addNotification } = useNotificationStore();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await proxySettingsApi.get();
      const data = res.data;
      setForm({
        proxy_url: data.proxy_url || '',
        proxy_strict_ssl: data.proxy_strict_ssl ?? true,
        no_proxy: data.no_proxy || '',
        is_enabled: data.is_enabled ?? false,
      });
    } catch {
      // ignore — use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await proxySettingsApi.update({
        proxy_url: form.proxy_url || null,
        proxy_strict_ssl: form.proxy_strict_ssl,
        no_proxy: form.no_proxy || null,
        is_enabled: form.is_enabled,
      });
      addNotification({ type: 'success', title: 'Proxy Settings Saved', message: 'Connector agents will use these settings on next execution.' });
    } catch {
      addNotification({ type: 'error', title: 'Save Failed', message: 'Could not save proxy settings.' });
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof ProxyState>(key: K, value: ProxyState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-neutral-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Outbound Proxy"
          subtitle="Route connector HTTP requests through a corporate proxy"
        />

        <div className="space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-100">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${form.is_enabled ? 'bg-primary-100' : 'bg-neutral-100'}`}>
                <Globe className={`w-4 h-4 ${form.is_enabled ? 'text-primary-600' : 'text-neutral-400'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">Enable Proxy</p>
                <p className="text-xs text-neutral-500">All connector HTTP requests will route through the proxy</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => set('is_enabled', !form.is_enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                form.is_enabled ? 'bg-primary-500' : 'bg-neutral-200'
              }`}
              role="switch"
              aria-checked={form.is_enabled}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                  form.is_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Proxy URL */}
          <Input
            label="Proxy URL"
            placeholder="http://proxy.corp.example.com:8080"
            value={form.proxy_url}
            onChange={(e) => set('proxy_url', e.target.value)}
            hint="HTTP or HTTPS proxy URL including port"
            disabled={!form.is_enabled}
          />

          {/* No proxy */}
          <Input
            label="No Proxy (bypass list)"
            placeholder="localhost,127.0.0.1,.internal.corp"
            value={form.no_proxy}
            onChange={(e) => set('no_proxy', e.target.value)}
            hint="Comma-separated hostnames or IPs to bypass the proxy"
            disabled={!form.is_enabled}
          />

          {/* SSL verification */}
          <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
            form.is_enabled ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-50/50 border-neutral-50 opacity-60'
          }`}>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-neutral-500" />
              <div>
                <p className="text-sm font-medium text-neutral-700">Verify Proxy SSL Certificate</p>
                <p className="text-xs text-neutral-400">Disable only for proxies with self-signed certificates</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => set('proxy_strict_ssl', !form.proxy_strict_ssl)}
              disabled={!form.is_enabled}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed ${
                form.proxy_strict_ssl ? 'bg-primary-500' : 'bg-neutral-200'
              }`}
              role="switch"
              aria-checked={form.proxy_strict_ssl}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                  form.proxy_strict_ssl ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Status banner */}
          {form.is_enabled && form.proxy_url && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-primary-50 border border-primary-100">
              <CheckCircle2 className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary-700">Proxy active</p>
                <p className="text-xs text-primary-600 mt-0.5 break-all">
                  All connector requests will route via <span className="font-mono">{form.proxy_url}</span>
                  {!form.proxy_strict_ssl && ' (SSL verification disabled)'}
                </p>
              </div>
            </div>
          )}

          {form.is_enabled && !form.proxy_url && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">Proxy is enabled but no URL is configured. Enter a proxy URL above.</p>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={loadSettings}>
              Reload
            </Button>
            <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={handleSave} loading={saving}>
              Save Proxy Settings
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="How Proxy Settings Work" subtitle="Applied to all connector agent HTTP requests" />
        <div className="space-y-2.5 text-xs text-neutral-500">
          <div className="flex gap-2.5">
            <span className="text-neutral-300">1.</span>
            <p>When a connector test or health sync runs, the agent loads these settings from the database.</p>
          </div>
          <div className="flex gap-2.5">
            <span className="text-neutral-300">2.</span>
            <p>If proxy is enabled and a URL is configured, all outbound HTTP/HTTPS connector requests route through it.</p>
          </div>
          <div className="flex gap-2.5">
            <span className="text-neutral-300">3.</span>
            <p>OAuth2 token exchange requests also use the proxy when enabled.</p>
          </div>
          <div className="flex gap-2.5">
            <span className="text-neutral-300">4.</span>
            <p>Hosts in the bypass list bypass the proxy and connect directly.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
