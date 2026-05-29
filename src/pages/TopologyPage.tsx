import React, { useState } from 'react';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { Network, Building2, UsersRound, FolderOpen, Plug, Search, RefreshCw } from 'lucide-react';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All', icon: Network },
  { value: 'lob', label: 'LOBs', icon: Building2 },
  { value: 'team', label: 'Teams', icon: UsersRound },
  { value: 'project', label: 'Projects', icon: FolderOpen },
  { value: 'connector', label: 'Connectors', icon: Plug },
];

export function TopologyPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const activeFilter = search.trim() ? search.trim() : filter;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--app-bg)', minHeight: 0 }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between gap-4"
        style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-200)' }}
          >
            <Network className="w-5 h-5" style={{ color: 'var(--primary)' }} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1
              className="text-[17px] font-bold leading-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              Infrastructure Topology
            </h1>
            <p className="text-[12px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              Live LOB &rarr; Team &rarr; Project &rarr; Connector hierarchy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter nodes..."
              className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg outline-none transition-all"
              style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-primary)',
                width: 160,
              }}
            />
          </div>

          {/* Type filter tabs */}
          <div
            className="flex items-center rounded-xl p-0.5 gap-0.5"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
          >
            {FILTER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = !search && filter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { setFilter(opt.value); setSearch(''); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: isActive ? 'var(--app-surface)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  <Icon className="w-3 h-3" strokeWidth={2} />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Refresh */}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{
              background: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--primary)';
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--app-border)';
            }}
            title="Refresh topology"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div
        className="flex-shrink-0 px-6 py-2 border-b flex items-center gap-5"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {[
          { color: '#0A84FF', label: 'Lines of Business' },
          { color: '#32ADE6', label: 'Teams' },
          { color: '#30D158', label: 'Projects' },
          { color: '#30D158', label: 'Healthy connector', dot: true },
          { color: '#FF9F0A', label: 'Degraded connector', dot: true },
          { color: '#FF453A', label: 'Down connector', dot: true },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            {item.dot ? (
              <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
            ) : (
              <div className="w-3 h-0.5 rounded-full" style={{ background: item.color }} />
            )}
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {item.label}
            </span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-0.5 rounded-full"
                style={{ background: '#30D158', opacity: 0.4 + i * 0.12 }}
              />
            ))}
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Animated = healthy flow
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0" key={refreshKey}>
        <TopologyCanvas filter={activeFilter} />
      </div>
    </div>
  );
}
