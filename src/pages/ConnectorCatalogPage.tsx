import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, RefreshCw, Search, Filter, Library, ToggleRight, ToggleLeft, Grid3x3 as Grid3X3, List } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { catalogApi } from '@/lib/api';
import { ConnectorCatalogEntry } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/Modal';
import { notify } from '@/store/notificationStore';
import { CatalogConnectorCard } from '@/components/catalog/CatalogConnectorCard';
import { CatalogCreateEditModal } from '@/components/catalog/CatalogCreateEditModal';
import { CatalogTestModal } from '@/components/catalog/CatalogTestModal';
import { ConnectorDetailPanel } from '@/components/catalog/ConnectorDetailPanel';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'observability', label: 'Observability' },
  { value: 'apm', label: 'APM' },
  { value: 'itsm', label: 'ITSM' },
  { value: 'database', label: 'Database' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'cloud', label: 'Cloud & Containers' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'custom', label: 'Custom' },
];

const CATALOG_MANAGE_ROLES = new Set(['super_admin', 'lob_admin', 'admin']);

export function ConnectorCatalogPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const canManage = user ? CATALOG_MANAGE_ROLES.has(user.role) : false;

  const [entries, setEntries] = useState<ConnectorCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [selectedEntry, setSelectedEntry] = useState<ConnectorCatalogEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ConnectorCatalogEntry | null>(null);
  const [testTarget, setTestTarget] = useState<ConnectorCatalogEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectorCatalogEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle('Connector Catalog');
    setBreadcrumbs([{ label: 'Connector Catalog' }]);
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await catalogApi.list();
      const data = res.data as ConnectorCatalogEntry[];
      setEntries(data);
      if (selectedEntry) {
        const updated = data.find((e) => e.id === selectedEntry.id);
        if (updated) setSelectedEntry(updated);
      }
    } catch {
      notify.error('Failed to load connector catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (entry: ConnectorCatalogEntry) => {
    setTogglingId(entry.id);
    try {
      if (entry.is_enabled) {
        await catalogApi.disable(entry.id);
        notify.success(`${entry.name} disabled`);
      } else {
        await catalogApi.enable(entry.id);
        notify.success(`${entry.name} enabled`);
      }
      fetchEntries();
    } catch {
      notify.error('Failed to update connector status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await catalogApi.delete(deleteTarget.id);
      notify.success('Connector deleted from catalog');
      if (selectedEntry?.id === deleteTarget.id) setSelectedEntry(null);
      setDeleteTarget(null);
      fetchEntries();
    } catch {
      notify.error('Cannot delete: system connectors cannot be removed');
    } finally {
      setDeleting(false);
    }
  };

  const handleCardClick = (entry: ConnectorCatalogEntry) => {
    setSelectedEntry((prev) => (prev?.id === entry.id ? null : entry));
  };

  const filtered = useMemo(() => {
    let result = entries;
    if (showEnabledOnly) result = result.filter((e) => e.is_enabled);
    if (category) result = result.filter((e) => e.category === category);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.vendor || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.tags || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, search, category, showEnabledOnly]);

  const stats = useMemo(() => ({
    total: entries.length,
    enabled: entries.filter((e) => e.is_enabled).length,
    system: entries.filter((e) => e.is_system).length,
    custom: entries.filter((e) => !e.is_system).length,
  }), [entries]);

  const categoryGroups = useMemo(() => {
    if (category || search) return null;
    const groups: Record<string, ConnectorCatalogEntry[]> = {};
    filtered.forEach((e) => {
      if (!groups[e.category]) groups[e.category] = [];
      groups[e.category].push(e);
    });
    return groups;
  }, [filtered, category, search]);

  const CATEGORY_LABELS: Record<string, string> = {
    observability: 'Observability',
    apm: 'APM',
    itsm: 'ITSM',
    database: 'Database',
    messaging: 'Messaging',
    cloud: 'Cloud & Containers',
    infrastructure: 'Infrastructure',
    custom: 'Custom',
  };

  const renderGrid = (items: ConnectorCatalogEntry[]) => (
    <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
      {items.map((entry) => (
        <div
          key={entry.id}
          onClick={() => handleCardClick(entry)}
          className={`cursor-pointer transition-all ${selectedEntry?.id === entry.id ? 'ring-2 ring-primary-400 rounded-2xl' : ''}`}
        >
          <CatalogConnectorCard
            entry={entry}
            canManage={canManage}
            onToggle={handleToggle}
            onEdit={setEditTarget}
            onTest={setTestTarget}
            onDelete={setDeleteTarget}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Connector Catalog</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {stats.total} connectors &middot; {stats.enabled} enabled &middot; {stats.system} system &middot; {stats.custom} custom
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={fetchEntries} size="sm">
            Refresh
          </Button>
          {canManage && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)} size="sm">
              New Connector
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Connectors" value={stats.total} color="#2563EB" />
        <StatCard label="Enabled" value={stats.enabled} color="#059669" />
        <StatCard label="System Built-in" value={stats.system} color="#F46800" />
        <StatCard label="Custom" value={stats.custom} color="#0891B2" />
      </div>

      <div className="bg-[var(--app-surface)] border border-[var(--app-border)] shadow-md rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            placeholder="Search connectors by name, vendor, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--text-primary)] rounded-xl outline-none focus:ring-[3px] focus:ring-primary-500/12 focus:border-primary-400 transition-all placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="pl-8 pr-8 py-2 text-sm bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--text-primary)] rounded-xl outline-none focus:ring-[3px] focus:ring-primary-500/12 focus:border-primary-400 transition-all appearance-none cursor-pointer"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[var(--app-surface)] text-[var(--text-primary)]">{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowEnabledOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
              showEnabledOnly
                ? 'bg-[var(--app-surface-active)] text-[var(--primary-color)] border-[var(--primary-color)]'
                : 'bg-[var(--app-surface)] text-[var(--text-secondary)] border-[var(--app-border)] hover:border-[var(--text-primary)]'
            }`}
          >
            {showEnabledOnly ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Enabled only
          </button>
          <div className="flex border border-[var(--app-border)] rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-all ${viewMode === 'grid' ? 'bg-[var(--app-surface-active)] text-[var(--primary-color)]' : 'bg-[var(--app-surface)] text-[var(--text-muted)] hover:bg-[var(--app-surface-hover)]'}`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-all ${viewMode === 'list' ? 'bg-[var(--app-surface-active)] text-[var(--primary-color)]' : 'bg-[var(--app-surface)] text-[var(--text-muted)] hover:bg-[var(--app-surface-hover)]'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="space-y-6">
          {loading ? (
            <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl p-5 h-48 animate-pulse">
                  <div className="flex gap-3 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--app-surface-hover)]" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-4 bg-[var(--app-surface-hover)] rounded w-2/3" />
                      <div className="h-3 bg-[var(--app-surface-hover)] rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-[var(--app-surface-hover)] rounded" />
                    <div className="h-3 bg-[var(--app-surface-hover)] rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl p-16 flex flex-col items-center justify-center text-center">
              <Library className="w-12 h-12 text-[var(--text-muted)] mb-4" />
              <p className="text-sm font-semibold text-[var(--text-secondary)]">No connectors found</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Try adjusting your search or filter criteria</p>
            </div>
          ) : categoryGroups && !search && !category ? (
            <div className="space-y-8">
              {Object.entries(categoryGroups).map(([cat, items]) => (
                <div key={cat}>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)]">{CATEGORY_LABELS[cat] || cat}</h3>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border border-[var(--app-border)]">
                      {items.length}
                    </span>
                    <div className="flex-1 h-px bg-[var(--app-border)]" />
                  </div>
                  {renderGrid(items)}
                </div>
              ))}
            </div>
          ) : (
            renderGrid(filtered)
          )}

          {!canManage && (
            <div className="bg-[var(--app-surface)] rounded-2xl p-4 flex items-center gap-3 border border-amber-500/20" style={{ background: 'rgba(245,158,11,0.04)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <Library className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-500">Read-only access</p>
                <p className="text-xs text-amber-500/80 mt-0.5">
                  Only Super Admins and LOB Admins can manage the connector catalog. Contact your administrator to add or modify connectors.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay backdrop + slide-in detail tray — portaled to body to escape transform ancestor */}
      {selectedEntry && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-[2px] animate-fade-in"
            onClick={() => setSelectedEntry(null)}
          />
          <div className="fixed top-0 right-0 h-screen w-[26rem] z-[9999] flex flex-col border-l border-[var(--app-border)] shadow-2xl bg-[var(--app-surface)] animate-tray-slide-in">
            <ConnectorDetailPanel
              entry={selectedEntry}
              canManage={canManage}
              onClose={() => setSelectedEntry(null)}
              onToggle={handleToggle}
              onEdit={setEditTarget}
              onTest={setTestTarget}
              onDelete={setDeleteTarget}
            />
          </div>
        </>,
        document.body,
      )}

      <CatalogCreateEditModal
        open={createOpen || !!editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onSaved={fetchEntries}
        entry={editTarget}
      />

      <CatalogTestModal
        open={!!testTarget}
        onClose={() => setTestTarget(null)}
        entry={testTarget}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Connector"
        message={`Remove "${deleteTarget?.name}" from the catalog? This cannot be undone and will not affect existing connector instances.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[var(--app-surface)] border border-[var(--app-border)] shadow-sm rounded-2xl p-4">
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">{label}</p>
      <div className="mt-3 h-1 rounded-full bg-[var(--app-bg-muted)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, (value / Math.max(value, 7)) * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}
