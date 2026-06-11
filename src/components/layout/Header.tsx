import React, { useState, useRef, useEffect } from 'react';
import {
  Bell, LogOut, ChevronDown, Settings, User as UserIcon,
  ChevronRight, Layers, Zap, CircleCheck as CheckCircle2,
  Radio, Wifi, WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@/lib/permissions';
import { BreadcrumbItem } from '@/types';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useWsStore } from '@/store/wsStore';
import type { WsStatus } from '@/hooks/useWebSocket';

const WORKSPACES = [
  { id: 'prod',    label: 'Production',  color: '#00B074' },
  { id: 'staging', label: 'Staging',     color: '#FFB100' },
  { id: 'dev',     label: 'Development', color: '#006CFF' },
];

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;
  return (
    <nav className="flex items-center gap-0.5 text-[11px]" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <ChevronRight className="w-2.5 h-2.5 flex-shrink-0 mx-0.5" style={{ color: 'var(--text-disabled)' }} />
          )}
          {item.href ? (
            <Link
              to={item.href}
              className="transition-colors truncate max-w-[100px] hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium truncate max-w-[140px]" style={{ color: 'var(--text-secondary)' }}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function WsStatusBadge() {
  const status = useWsStore((s) => s.globalStatus);

  const config: Record<WsStatus, { label: string; color: string; pulse: boolean; Icon: React.ElementType }> = {
    connected:    { label: 'Live',         color: '#00B074', pulse: true,  Icon: Radio },
    connecting:   { label: 'Connecting',   color: '#FFB100', pulse: false, Icon: Wifi },
    reconnecting: { label: 'Reconnecting', color: '#FFB100', pulse: true,  Icon: Wifi },
    disconnected: { label: 'Offline',      color: '#FF003C', pulse: false, Icon: WifiOff },
  };

  const { label, color, pulse, Icon } = config[status];

  return (
    <div
      className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-[4px] text-[11px] font-semibold select-none"
      style={{
        background: `${color}12`,
        border: `1px solid ${color}28`,
        color,
        fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
      }}
      title={`WebSocket: ${label}`}
    >
      <span className="relative flex items-center justify-center w-3 h-3">
        <Icon className="w-3 h-3" />
        {pulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-35"
            style={{ background: color }}
          />
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(WORKSPACES[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-[11.5px] font-medium transition-all duration-100"
        style={{
          background: 'var(--app-bg-subtle)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--app-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--app-border)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        aria-label={`Environment: ${active.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active.color }} />
        <span>{active.label}</span>
        <Layers className="w-3 h-3 opacity-40" />
        <ChevronDown className={cn('w-3 h-3 opacity-40 transition-transform duration-100', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1.5 left-0 w-40 rounded-[6px] py-1 z-50 animate-expand-down"
          role="listbox"
          style={{
            background: 'var(--app-surface-raised)',
            border: '1px solid var(--app-border-medium)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.08em] px-3 py-1.5 pb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Environment
          </p>
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              role="option"
              aria-selected={active.id === ws.id}
              onClick={() => { setActive(ws); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium transition-all"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ws.color }} />
              <span className="flex-1 text-left">{ws.label}</span>
              {active.id === ws.id && <CheckCircle2 className="w-3 h-3" style={{ color: ws.color }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-7 h-7 rounded-[4px] transition-all duration-100"
        style={{
          background: open ? 'var(--app-bg-subtle)' : 'transparent',
          color: 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-bg-subtle)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-64 rounded-[6px] z-50 overflow-hidden animate-expand-down"
          role="dialog"
          aria-label="Notifications panel"
          style={{
            background: 'var(--app-surface-raised)',
            border: '1px solid var(--app-border-medium)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2.5 border-b"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</p>
          </div>
          <div className="px-3 py-6 text-center">
            <Bell className="w-5 h-5 mx-auto mb-1.5 opacity-20" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No new notifications</p>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuthStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1.5 w-52 rounded-[6px] z-50 py-1 overflow-hidden animate-scale-in"
      role="menu"
      aria-label="User menu"
      style={{
        background: 'var(--app-surface-raised)',
        border: '1px solid var(--app-border-medium)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex-shrink-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: '#006CFF' }}
            >
              <span className="text-white text-[12px] font-bold">
                {user?.full_name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
              style={{ background: '#00B074', borderColor: 'var(--app-surface-raised)' }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
              {user?.full_name}
            </p>
            <p className="text-[10.5px] truncate leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {user?.email}
            </p>
          </div>
        </div>
        <div className="mt-2">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold"
            style={{ background: 'rgba(0,108,255,0.08)', color: '#006CFF', border: '1px solid rgba(0,108,255,0.18)' }}
          >
            <Zap className="w-2.5 h-2.5" />
            {user?.role ? ROLE_LABELS[user.role] : ''}
          </span>
        </div>
      </div>

      <div className="py-0.5" role="none">
        <Link
          to="/settings"
          role="menuitem"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        >
          <UserIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          Profile
        </Link>
        <Link
          to="/settings"
          role="menuitem"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-surface-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        >
          <Settings className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          Settings
        </Link>
      </div>

      <div className="border-t pt-0.5" style={{ borderColor: 'var(--app-border)' }}>
        <button
          role="menuitem"
          onClick={() => { logout(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all"
          style={{ color: '#FF003C' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,0,60,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Header() {
  const { sidebarCollapsed, breadcrumbs, pageTitle } = useUIStore();
  const { user } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <>
      <header
        className={cn(
          'fixed top-0 right-0 z-20 flex items-center px-4 h-[52px] gap-2.5',
          'app-header transition-all duration-250 ease-out',
          sidebarCollapsed ? 'left-[52px]' : 'left-[220px]',
        )}
      >
        <div className="flex flex-col min-w-0 flex-1">
          {breadcrumbs.length > 0 ? (
            <>
              <Breadcrumbs items={breadcrumbs} />
              <h1
                className="text-[13px] font-semibold leading-tight mt-0.5 truncate"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.015em' }}
              >
                {pageTitle}
              </h1>
            </>
          ) : (
            <h1
              className="text-[14px] font-semibold truncate"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.015em' }}
            >
              {pageTitle}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <WsStatusBadge />

          <WorkspaceSwitcher />

          <ThemeSwitcher />

          <NotificationBell />

          <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ background: 'var(--app-border)' }} />

          {/* User button */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-[4px] transition-all duration-100"
              style={{ background: showUserMenu ? 'var(--app-bg-subtle)' : 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-bg-subtle)'; }}
              onMouseLeave={(e) => { if (!showUserMenu) e.currentTarget.style.background = 'transparent'; }}
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
            >
              <div className="relative">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: '#006CFF' }}
                >
                  <span className="text-white text-[10px] font-bold">
                    {user?.full_name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border"
                  style={{ background: '#00B074', borderColor: 'var(--header-bg)' }}
                />
              </div>
              <span
                className="text-[11.5px] font-medium hidden sm:block max-w-[72px] truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {user?.full_name?.split(' ')[0]}
              </span>
              <ChevronDown
                className={cn('w-3 h-3 transition-transform duration-100', showUserMenu ? 'rotate-180' : 'rotate-0')}
                style={{ color: 'var(--text-muted)' }}
              />
            </button>

            {showUserMenu && <UserMenu onClose={() => setShowUserMenu(false)} />}
          </div>
        </div>
      </header>
    </>
  );
}
