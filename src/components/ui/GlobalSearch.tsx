import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FolderOpen, Plug, Shield, ChartBar as BarChart2, Activity, MessageSquare, Users, ChevronRight, Command, ArrowUp, ArrowDown, CornerDownLeft, Building2, Library, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { globalSearchApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'project' | 'connector' | 'rule' | 'page' | 'lob';
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ElementType;
  color?: string;
}

const STATIC_PAGES: SearchResult[] = [
  { id: 'dashboard', type: 'page', title: 'Dashboard', subtitle: 'System overview', href: '/dashboard', icon: Activity, color: '#00E599' },
  { id: 'lobs', type: 'page', title: 'Lines of Business', subtitle: 'Manage LOBs', href: '/lobs', icon: Building2, color: '#0A84FF' },
  { id: 'projects', type: 'page', title: 'Projects', subtitle: 'Manage projects', href: '/projects', icon: FolderOpen, color: '#0A84FF' },
  { id: 'connectors', type: 'page', title: 'Connectors', subtitle: 'Service connectors', href: '/connectors', icon: Plug, color: '#FF9F0A' },
  { id: 'catalog', type: 'page', title: 'Connector Catalog', subtitle: 'Catalog management', href: '/connector-catalog', icon: Library, color: '#FF9F0A' },
  { id: 'health', type: 'page', title: 'Health Monitor', subtitle: 'Real-time health', href: '/health', icon: Activity, color: '#30D158' },
  { id: 'rules', type: 'page', title: 'Health Rules', subtitle: 'Rules engine', href: '/rules', icon: Shield, color: '#FF453A' },
  { id: 'analytics', type: 'page', title: 'Analytics', subtitle: 'Historical trends and SLA', href: '/analytics', icon: BarChart2, color: '#3B82F6' },
  { id: 'chatbot', type: 'page', title: 'AI Assistant', subtitle: 'Intelligence layer', href: '/chatbot', icon: MessageSquare, color: '#0A84FF' },
  { id: 'audit', type: 'page', title: 'Audit Logs', subtitle: 'System event trail', href: '/audit', icon: FileText, color: '#667085' },
  { id: 'users', type: 'page', title: 'Users', subtitle: 'User management', href: '/users', icon: Users, color: '#FF9F0A' },
];

const TYPE_ICONS: Record<string, React.ElementType> = {
  page: Activity,
  project: FolderOpen,
  connector: Plug,
  rule: Shield,
  lob: Building2,
};

const TYPE_COLORS: Record<string, string> = {
  page: '#667085',
  project: '#0A84FF',
  connector: '#FF9F0A',
  rule: '#FF453A',
  lob: '#00E599',
};

const TYPE_LABELS: Record<string, string> = {
  page: 'Pages',
  project: 'Projects',
  connector: 'Connectors',
  rule: 'Rules',
  lob: 'Lines of Business',
};

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(STATIC_PAGES);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(STATIC_PAGES);
      setActiveIdx(0);
      return;
    }
    setLoading(true);
    try {
      const lower = q.toLowerCase();
      const staticMatches = STATIC_PAGES.filter(
        p => p.title.toLowerCase().includes(lower) || (p.subtitle || '').toLowerCase().includes(lower)
      );

      let apiResults: SearchResult[] = [];
      try {
        const res = await globalSearchApi.search(q);
        const data = (res.data?.results || []) as Array<{
          type: string; id: string; title: string; subtitle?: string; href: string; color?: string;
        }>;
        apiResults = data.map(item => ({
          id: item.id,
          type: item.type as SearchResult['type'],
          title: item.title,
          subtitle: item.subtitle,
          href: item.href,
          icon: TYPE_ICONS[item.type] || Activity,
          color: item.color || TYPE_COLORS[item.type],
        }));
      } catch {
        // fallback to static only
      }

      const combined = [...staticMatches, ...apiResults].slice(0, 14);
      setResults(combined);
      setActiveIdx(0);
    } catch {
      setResults(STATIC_PAGES.filter(p => p.title.toLowerCase().includes(q.toLowerCase())));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(query), 250);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, runSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.href);
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) handleSelect(results[activeIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, activeIdx, handleSelect, onClose]);

  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIdx]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] modal-backdrop"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[12vh] left-1/2 z-[201] w-full max-w-xl -translate-x-1/2 px-4"
            style={{ filter: 'drop-shadow(0 32px 80px rgba(0,0,0,0.9))' }}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--app-surface-raised)',
                border: '1px solid var(--app-border-medium)',
                boxShadow: 'var(--shadow-modal)',
              }}
            >
              <div
                className="flex items-center gap-3 px-4 h-14 border-b"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <Search className="w-[18px] h-[18px] flex-shrink-0" style={{ color: query ? 'var(--accent)' : 'var(--text-muted)' }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search projects, connectors, rules, pages..."
                  className="flex-1 bg-transparent outline-none text-[14px] font-medium placeholder-shown:font-normal"
                  style={{ color: 'var(--text-primary)' }}
                  aria-label="Global search"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="p-1 rounded-lg transition-all"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-muted)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                      (e.currentTarget as HTMLElement).style.background = '';
                    }}
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {loading && (
                  <div
                    className="w-3.5 h-3.5 border-2 rounded-full animate-spin flex-shrink-0"
                    style={{ borderColor: 'var(--app-border)', borderTopColor: 'var(--accent)' }}
                  />
                )}
                <div
                  className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ml-1"
                  style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}
                >
                  ESC
                </div>
              </div>

              <div
                ref={listRef}
                className="max-h-[420px] overflow-y-auto py-2 scroll-area"
                role="listbox"
                aria-label="Search results"
              >
                {results.length === 0 && !loading && (
                  <div className="px-4 py-10 text-center">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No results for "{query}"</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Try a different search term</p>
                  </div>
                )}
                {(Object.entries(grouped) as [string, SearchResult[]][]).map(([type, items]) => (
                  <div key={type}>
                    <p
                      className="px-4 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {TYPE_LABELS[type] || type}
                    </p>
                    {items.map((result) => {
                      const globalIdx = results.indexOf(result);
                      const isActive = globalIdx === activeIdx;
                      const Icon = result.icon;
                      const iconColor = result.color || 'var(--text-muted)';
                      const iconBg = (result.color || '#667085') + '18';
                      return (
                        <button
                          key={result.id + result.type}
                          data-active={isActive}
                          role="option"
                          aria-selected={isActive}
                          onClick={() => handleSelect(result)}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-100',
                          )}
                          style={{
                            background: isActive ? 'var(--app-bg-muted)' : 'transparent',
                          }}
                        >
                          <div
                            className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: iconBg }}
                          >
                            <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
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
                          {isActive && (
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div
                className="flex items-center gap-4 px-4 py-2.5 border-t"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <div className="flex items-center gap-1.5">
                  <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}>
                    <ArrowUp className="w-2.5 h-2.5" /><ArrowDown className="w-2.5 h-2.5" />
                  </kbd>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}>
                    <CornerDownLeft className="w-2.5 h-2.5" />
                  </kbd>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Open</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <kbd className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--app-bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--app-border)' }}>
                    <Command className="w-2.5 h-2.5" /> K
                  </kbd>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Quick open</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
