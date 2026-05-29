import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore, THEMES, ThemeId } from '@/store/themeStore';

interface ThemePreviewProps {
  colors: string[];
  size?: 'sm' | 'md';
}

function ThemePreview({ colors, size = 'sm' }: ThemePreviewProps) {
  const dim = size === 'sm' ? 10 : 14;
  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {colors.slice(0, 4).map((color, i) => (
        <span
          key={i}
          className="rounded-full flex-shrink-0"
          style={{ width: dim, height: dim, background: color }}
        />
      ))}
    </div>
  );
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(id: ThemeId) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-[4px] text-[11.5px] font-medium transition-all duration-100"
        style={{
          background: open ? 'var(--app-bg-subtle)' : 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid var(--app-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.background = 'var(--app-bg-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--app-border)';
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
        aria-label="Switch theme"
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Theme"
      >
        <Palette className="w-3 h-3 flex-shrink-0" />
        <ThemePreview colors={current.preview} size="sm" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-52 rounded-[6px] py-1 z-50 animate-expand-down"
          role="listbox"
          aria-label="Select theme"
          style={{
            background: 'var(--app-surface-raised)',
            border: '1px solid var(--app-border-medium)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.08em] px-3 pb-1.5 pt-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            Theme
          </p>

          {THEMES.map((t) => {
            const isActive = t.id === theme;
            return (
              <button
                key={t.id}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(t.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-all duration-100',
                )}
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
              >
                <ThemePreview colors={t.preview} size="md" />
                <div className="flex-1 text-left min-w-0">
                  <p
                    className="font-semibold leading-tight truncate text-[11.5px]"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                  >
                    {t.name}
                  </p>
                  <p
                    className="text-[10px] leading-tight mt-0.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {t.description}
                  </p>
                </div>
                {isActive && (
                  <Check
                    className="w-3 h-3 flex-shrink-0"
                    style={{ color: 'var(--accent)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
