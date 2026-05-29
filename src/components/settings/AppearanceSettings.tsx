import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, LayoutGrid, List, Maximize2, Minimize2, Zap, ZapOff, ChevronRight, Chrome as Home } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';

interface AppearanceState {
  theme: string;
  default_dashboard_layout: string;
  density: string;
  chart_animations: boolean;
  sidebar_collapsed: boolean;
  default_landing_page: string;
  table_row_density: string;
}

const defaultState: AppearanceState = {
  theme: 'light',
  default_dashboard_layout: 'grid',
  density: 'comfortable',
  chart_animations: true,
  sidebar_collapsed: false,
  default_landing_page: '/dashboard',
  table_row_density: 'default',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-primary-500' : 'bg-neutral-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

function OptionGroup<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon?: React.ReactNode; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border text-center transition-all ${
            value === opt.value
              ? 'border-primary-300 bg-primary-50 text-primary-700'
              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          {opt.icon && <span className="opacity-80">{opt.icon}</span>}
          <span className="text-xs font-medium">{opt.label}</span>
          {opt.desc && <span className="text-xs text-neutral-400 leading-tight">{opt.desc}</span>}
        </button>
      ))}
    </div>
  );
}

export function AppearanceSettings() {
  const [appearance, setAppearance] = useState<AppearanceState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { add: addNotification } = useNotificationStore();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/settings/me');
        setAppearance({
          theme: res.data.theme || 'light',
          default_dashboard_layout: res.data.default_dashboard_layout || 'grid',
          density: res.data.density || 'comfortable',
          chart_animations: res.data.chart_animations ?? true,
          sidebar_collapsed: res.data.sidebar_collapsed ?? false,
          default_landing_page: res.data.default_landing_page || '/dashboard',
          table_row_density: res.data.table_row_density || 'default',
        });
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof AppearanceState>(key: K, value: AppearanceState[K]) =>
    setAppearance(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/settings/appearance', appearance);
      addNotification({ type: 'success', title: 'Saved', message: 'Appearance settings updated' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to save appearance settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-neutral-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Theme" subtitle="Choose your preferred color scheme" />
        <OptionGroup
          value={appearance.theme as any}
          onChange={v => set('theme', v)}
          options={[
            { value: 'light', label: 'Light', icon: <Sun className="w-5 h-5" /> },
            { value: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" /> },
            { value: 'system', label: 'System', icon: <Monitor className="w-5 h-5" /> },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Default Dashboard Layout" subtitle="Preferred layout for dashboard pages" />
        <OptionGroup
          value={appearance.default_dashboard_layout as any}
          onChange={v => set('default_dashboard_layout', v)}
          options={[
            { value: 'grid', label: 'Grid', icon: <LayoutGrid className="w-5 h-5" />, desc: 'Cards in grid' },
            { value: 'list', label: 'List', icon: <List className="w-5 h-5" />, desc: 'Vertical list' },
            { value: 'wide', label: 'Wide', icon: <Maximize2 className="w-5 h-5" />, desc: 'Full-width' },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Interface Density" subtitle="Control the spacing and compactness of the UI" />
        <OptionGroup
          value={appearance.density as any}
          onChange={v => set('density', v)}
          options={[
            { value: 'comfortable', label: 'Comfortable', desc: 'More whitespace' },
            { value: 'compact', label: 'Compact', desc: 'Denser layout' },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Table Row Density" subtitle="Adjust table row height across all tables" />
        <OptionGroup
          value={appearance.table_row_density as any}
          onChange={v => set('table_row_density', v)}
          options={[
            { value: 'spacious', label: 'Spacious', desc: 'Tall rows' },
            { value: 'default', label: 'Default', desc: 'Standard height' },
            { value: 'compact', label: 'Compact', desc: 'Minimal height' },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Default Landing Page" subtitle="Page shown after login" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { value: '/dashboard', label: 'Dashboard' },
            { value: '/lobs', label: 'LOBs' },
            { value: '/projects', label: 'Projects' },
            { value: '/teams', label: 'Teams' },
            { value: '/health', label: 'Health' },
            { value: '/analytics', label: 'Analytics' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('default_landing_page', opt.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                appearance.default_landing_page === opt.value
                  ? 'border-primary-300 bg-primary-50 text-primary-700 font-medium'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Behavior" subtitle="Toggle UI behaviors and animations" />
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                {appearance.chart_animations ? <Zap className="w-4 h-4 text-yellow-500" /> : <ZapOff className="w-4 h-4 text-neutral-400" />}
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800">Chart Animations</p>
                <p className="text-xs text-neutral-500">Animate charts when data loads</p>
              </div>
            </div>
            <Toggle checked={appearance.chart_animations} onChange={v => set('chart_animations', v)} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                {appearance.sidebar_collapsed ? <Minimize2 className="w-4 h-4 text-neutral-600" /> : <Maximize2 className="w-4 h-4 text-neutral-600" />}
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800">Default Collapsed Sidebar</p>
                <p className="text-xs text-neutral-500">Start with sidebar minimized</p>
              </div>
            </div>
            <Toggle checked={appearance.sidebar_collapsed} onChange={v => set('sidebar_collapsed', v)} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>Save Appearance</Button>
      </div>
    </div>
  );
}
