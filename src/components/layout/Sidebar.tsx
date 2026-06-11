import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, FolderOpen, Plug, Activity, MessageSquare,
  Settings, ChevronLeft, ChevronRight, Users, LogOut, Shield, FileText,
  UsersRound, LayoutTemplate, ShieldCheck, MapPin, Network, Eye,
  ChartBar as BarChart2, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { isAdmin, canManageRoles, ROLE_LABELS } from '@/lib/permissions';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  description?: string;
}

const operationsNavItems: NavItem[] = [
  { label: 'Runtime Location', href: '/runtime-location', icon: MapPin, description: 'Where is my app running?' },
  { label: 'Runtime Truth', href: '/runtime-truth', icon: ShieldCheck, description: 'Can this app process transactions now?' },
];

const adminNavItems: NavItem[] = [];

const rbacNavItems: NavItem[] = [];

const systemNavItems: NavItem[] = [];

function NavTooltip({ label, description }: { label: string; description?: string }) {
  return (
    <div className="absolute left-full ml-2.5 z-[100] pointer-events-none animate-fade-in">
      <div
        className="px-2.5 py-1.5 whitespace-nowrap rounded-[6px]"
        style={{
          background: '#1C2B3A',
          color: '#FFFFFF',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <p className="text-[11.5px] font-semibold leading-tight">{label}</p>
        {description && (
          <p className="text-[10px] opacity-55 font-normal mt-0.5 leading-tight">{description}</p>
        )}
        <div
          className="absolute top-1/2 -left-[5px] -translate-y-1/2 w-2.5 h-2.5 rotate-45"
          style={{ background: '#1C2B3A', borderLeft: '1px solid rgba(255,255,255,0.10)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}
        />
      </div>
    </div>
  );
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  function handleMouseEnter() {
    if (collapsed) {
      timeoutRef.current = setTimeout(() => setShowTooltip(true), 150);
    }
  }

  function handleMouseLeave() {
    clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <NavLink
      to={item.href}
      className={({ isActive }) => cn('sidebar-item group', isActive && 'active')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Icon
        className={cn(
          'flex-shrink-0 transition-all duration-100',
          collapsed ? 'w-[16px] h-[16px]' : 'w-[15px] h-[15px]',
        )}
        strokeWidth={1.8}
      />
      {!collapsed && (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {!collapsed && item.badge && (
        <span
          className="px-1.5 py-0.5 text-[10px] font-bold rounded-[3px] leading-none"
          style={{ background: 'var(--accent)', color: '#FFFFFF' }}
        >
          {item.badge}
        </span>
      )}
      {collapsed && showTooltip && (
        <NavTooltip label={item.label} description={item.description} />
      )}
    </NavLink>
  );
}

function SidebarSection({
  label,
  items,
  collapsed,
}: {
  label?: string;
  items: NavItem[];
  collapsed: boolean;
}) {
  return (
    <div className="mb-1.5">
      {!collapsed && label && (
        <p
          className="text-[9.5px] font-bold uppercase tracking-[0.10em] px-2.5 mb-1 mt-0.5"
          style={{ color: 'var(--sidebar-section-label)' }}
        >
          {label}
        </p>
      )}
      {collapsed && label && (
        <div
          className="mx-auto my-2 h-px w-6"
          style={{ background: 'var(--sidebar-border)' }}
        />
      )}
      <div className="space-y-px">
        {items.map((item) => (
          <SidebarNavItem key={item.href} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const userIsAdmin = user ? isAdmin(user.role) : false;
  const userCanManageRoles = user ? canManageRoles(user.role) : false;

  const dynamicAdminItems = [...adminNavItems];
  if (userIsAdmin) {
    dynamicAdminItems.push(
      { label: 'Users', href: '/users', icon: Users, description: 'User management' },
      { label: 'Audit Logs', href: '/audit', icon: FileText, description: 'System event trail' }
    );
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-30 flex flex-col app-sidebar',
        'transition-all duration-250 ease-out',
        sidebarCollapsed ? 'w-[52px]' : 'w-[220px]',
      )}
    >
      {/* Logo area */}
      <div
        className={cn(
          'flex items-center h-[52px] flex-shrink-0 px-3',
          'border-b',
        )}
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <div
          className="w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0"
          style={{ background: '#006CFF' }}
        >
          <Eye className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0 ml-2 animate-fade-in overflow-hidden">
            <p
              className="text-[12.5px] font-bold tracking-tight leading-tight truncate"
              style={{ color: 'var(--sidebar-logo-text)', letterSpacing: '-0.02em' }}
            >
              LiveLens
            </p>
            <p
              className="text-[9px] font-semibold tracking-[0.08em] uppercase leading-tight"
              style={{ color: 'var(--sidebar-text-muted)' }}
            >
              Enterprise
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-2 py-2.5">
        <SidebarSection label="Operations" items={operationsNavItems} collapsed={sidebarCollapsed} />
        <SidebarSection label="Administration" items={dynamicAdminItems} collapsed={sidebarCollapsed} />
        {userCanManageRoles && (
          <SidebarSection label="Security" items={rbacNavItems} collapsed={sidebarCollapsed} />
        )}
        <SidebarSection label="System" items={systemNavItems} collapsed={sidebarCollapsed} />
      </nav>

      {/* User profile — expanded */}
      {!sidebarCollapsed && user && (
        <div
          className="px-2 pb-2.5 pt-2 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] transition-all cursor-pointer group"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-item-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
          >
            <div className="relative flex-shrink-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: '#006CFF' }}
              >
                <span className="text-white text-[10px] font-bold">
                  {user.full_name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
                style={{ background: '#00B074', borderColor: 'var(--sidebar-bg)' }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[11.5px] font-semibold truncate leading-tight"
                style={{ color: 'var(--sidebar-logo-text)' }}
              >
                {user.full_name}
              </p>
              <p className="text-[10px] leading-tight truncate" style={{ color: 'var(--sidebar-text-muted)' }}>
                {user.role ? ROLE_LABELS[user.role] : ''}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); logout(); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-[4px] transition-all"
              style={{ color: 'var(--sidebar-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#FF003C';
                e.currentTarget.style.background = 'rgba(255,0,60,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--sidebar-text-muted)';
                e.currentTarget.style.background = '';
              }}
              title="Sign out"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* User profile — collapsed */}
      {sidebarCollapsed && user && (
        <div
          className="flex justify-center px-2 pb-2.5 pt-2 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div className="relative">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: '#006CFF' }}
            >
              <span className="text-white text-[10px] font-bold">
                {user.full_name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
              style={{ background: '#00B074', borderColor: 'var(--sidebar-bg)' }}
            />
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'absolute -right-3 top-[4.25rem] w-6 h-6 rounded-full flex items-center justify-center z-10',
          'transition-all duration-150',
        )}
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border-medium)',
          boxShadow: 'var(--shadow-md)',
          color: 'var(--text-muted)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent)';
          e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-muted)';
          e.currentTarget.style.borderColor = 'var(--app-border-medium)';
        }}
      >
        {sidebarCollapsed
          ? <ChevronRight className="w-2.5 h-2.5" />
          : <ChevronLeft className="w-2.5 h-2.5" />
        }
      </button>
    </aside>
  );
}
