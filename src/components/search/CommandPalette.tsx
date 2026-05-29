import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FolderOpen, Plug, Shield, MessageSquare, Building2, ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { projectApi, connectorApi, healthRulesApi, lobApi } from '@/lib/api';

interface SearchResult {
  id: string;
  type: 'project' | 'connector' | 'rule' | 'lob' | 'page';
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ElementType;
  color?: string;
}

const STATIC_PAGES: SearchResult[] = [
  { id: 'page-dashboard', type: 'page', title: 'Dashboard', subtitle: 'System overview & metrics', href: '/dashboard', icon: Building2 },
  { id: 'page-projects', type: 'page', title: 'Projects', subtitle: 'Manage all projects', href: '/projects', icon: FolderOpen },
  { id: 'page-connectors', type: 'page', title: 'Connectors', subtitle: 'Service endpoints', href: '/connectors', icon: Plug },
  { id: 'page-rules', type: 'page', title: 'Health Rules', subtitle: 'Configurable rules engine', href: '/rules', icon: Shield },
  { id: 'page-chatbot', type: 'page', title: 'AI Assistant', subtitle: 'Tachyon AI', href: '/chatbot', icon: MessageSquare },
  { id: 'page-analytics', type: 'page', title: 'Analytics', subtitle: 'Historical trends & SLA', href: '/analytics', icon: Building2 },
];

const TYPE_LABELS: Record<string, string> = {
  project: 'Project',
  connector: 'Connector',
  rule: 'Rule',
  lob: 'Line of Business',
  page: 'Page',
};

const TYPE_COLORS: Record<string, string> = {
  project: '#3B82F6',
  connector: '#F59E0B',
  rule: '#EF4444',
  lob: '#10B981',
  page: '#6B7280',
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>(STATIC_PAGES);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('recentSearches') || '[]'); } catch { return []; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(STATIC_PAGES);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(STATIC_PAGES);
      return;
    }
    setLoading(true);
    try {
      const lower = q.toLowerCase();
      const [projectsRes, connectorsRes, rulesRes, lobsRes] = await Promise.allSettled([
        projectApi.list(),
        connectorApi.list(),
        healthRulesApi.list({ search: q, page_size: 5 }),
        lobApi.list({ search: q }),
      ]);

      const items: SearchResult[] = [];

      if (projectsRes.status === 'fulfilled') {
        const projs = Array.isArray(projectsRes.value.data) ? projectsRes.value.data : [];
        projs
          .filter((p: any) => p.name?.toLowerCase().includes(lower) || p.description?.toLowerCase().includes(lower))
          .slice(0, 4)
          .forEach((p: any) => items.push({
            id: `project-${p.id}`, type: 'project', title: p.name,
            subtitle: p.description || 'Project', href: `/projects/${p.id}`, icon: FolderOpen,
          }));
      }

      if (connectorsRes.status === 'fulfilled') {
        const conns = Array.isArray(connectorsRes.value.data) ? connectorsRes.value.data : [];
        conns
          .filter((c: any) => c.name?.toLowerCase().includes(lower))
          .slice(0, 4)
          .forEach((c: any) => items.push({
            id: `connector-${c.id}`, type: 'connector', title: c.name,
            subtitle: c.type || 'Connector', href: `/connectors`, icon: Plug,
          }));
      }

      if (rulesRes.status === 'fulfilled') {
        const ruleItems = rulesRes.value.data?.items || [];
        ruleItems.slice(0, 3).forEach((r: any) => items.push({
          id: `rule-${r.id}`, type: 'rule', title: r.name,
          subtitle: `${r.severity} • ${r.scope}`, href: `/rules`, icon: Shield,
        }));
      }

      if (lobsRes.status === 'fulfilled') {
        const lobs = Array.isArray(lobsRes.value.data) ? lobsRes.value.data : [];
        lobs.slice(0, 3).forEach((l: any) => items.push({
          id: `lob-${l.id}`, type: 'lob', title: l.name,
          subtitle: l.description || 'Line of Business', href: `/lobs/${l.id}`, icon: Building2,
        }));
      }

      const pageMatches = STATIC_PAGES.filter(p =>
        p.title.toLowerCase().includes(lower) || p.subtitle?.toLowerCase().includes(lower)
      );

      setResults([...items, ...pageMatches]);
    } catch {
      setResults(STATIC_PAGES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => performSearch(query), 280);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    const searches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(searches);
    localStorage.setItem('recentSearches', JSON.stringify(searches));
    navigate(result.href);
    onClose();
  }, [query, recentSearches, navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, activeIndex, handleSelect, onClose]);

  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.children[activeIndex] as HTMLElement;
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[8vh]"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[580px] mx-4 rounded-2xl overflow-hidden animate-modal-enter"
        style={{
          background: 'var(--app-surface-raised)',
          border: '1px solid var(--app-border-medium)',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-4 py-3.5 border-b"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {loading ? (
            <div
              className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
          ) : (
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects, connectors, rules..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: 'var(--text-primary)' }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Global search"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults(STATIC_PAGES); }}
              className="p-1 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd
            className="hidden sm:flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0"
            style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}
          >
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[380px] overflow-y-auto py-1.5">
          {!query && recentSearches.length > 0 && (
            <div className="px-3 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] px-1 py-1.5" style={{ color: 'var(--text-muted)' }}>
                Recent
              </p>
              {recentSearches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] transition-all text-left"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--app-bg-muted)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                >
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  {s}
                </button>
              ))}
              <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            </div>
          )}

          {results.length === 0 && query && (
            <div className="py-8 text-center">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No results for &quot;{query}&quot;
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="px-1.5">
              {!query && (
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>
                  Quick Navigate
                </p>
              )}
              {query && results.some(r => r.type !== 'page') && (
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>
                  Results
                </p>
              )}
              {results.map((result, i) => {
                const Icon = result.icon;
                const isActive = i === activeIndex;
                const typeColor = TYPE_COLORS[result.type];
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-all text-left"
                    style={{
                      background: isActive ? 'var(--app-bg-muted)' : 'transparent',
                    }}
                    aria-selected={isActive}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${typeColor}18` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: typeColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                        style={{ background: `${typeColor}15`, color: typeColor }}
                      >
                        {TYPE_LABELS[result.type]}
                      </span>
                      {isActive && (
                        <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-2.5 border-t"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center gap-3">
            {[
              { keys: ['↑', '↓'], label: 'navigate' },
              { keys: ['↵'], label: 'select' },
              { keys: ['ESC'], label: 'close' },
            ].map(({ keys, label }) => (
              <span key={label} className="flex items-center gap-1">
                {keys.map(k => (
                  <kbd
                    key={k}
                    className="px-1 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}
                  >
                    {k}
                  </kbd>
                ))}
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
              </span>
            ))}
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
