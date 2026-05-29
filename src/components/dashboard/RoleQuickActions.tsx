import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, FolderOpen, Plug, Activity, MessageSquare, Settings, ChartBar as BarChart2 } from 'lucide-react';
import { UserRole } from '@/types';
import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const ALL_ACTIONS: Record<string, QuickAction> = {
  users: {
    label: 'Manage Users',
    description: 'Add, edit or deactivate users',
    href: '/users',
    icon: Users,
    color: '',
    bg: '',
  },
  lobs: {
    label: 'Lines of Business',
    description: 'View and manage LOBs',
    href: '/lobs',
    icon: Building2,
    color: '',
    bg: '',
  },
  projects: {
    label: 'Projects',
    description: 'Browse all projects',
    href: '/projects',
    icon: FolderOpen,
    color: '',
    bg: '',
  },
  connectors: {
    label: 'Connectors',
    description: 'Configure service endpoints',
    href: '/connectors',
    icon: Plug,
    color: '',
    bg: '',
  },
  health: {
    label: 'Health Monitor',
    description: 'Real-time service health',
    href: '/health',
    icon: Activity,
    color: '',
    bg: '',
  },
  chatbot: {
    label: 'AI Assistant',
    description: 'Query the AI intelligence layer',
    href: '/chatbot',
    icon: MessageSquare,
    color: '',
    bg: '',
  },
  settings: {
    label: 'Settings',
    description: 'Platform configuration',
    href: '/settings',
    icon: Settings,
    color: '',
    bg: '',
  },
  analytics: {
    label: 'Analytics',
    description: 'Trends and reports',
    href: '/health',
    icon: BarChart2,
    color: '',
    bg: '',
  },
};

const ROLE_ACTIONS: Record<UserRole, string[]> = {
  super_admin: ['users', 'lobs', 'projects', 'connectors', 'health', 'chatbot', 'settings'],
  admin: ['users', 'lobs', 'projects', 'connectors', 'health', 'chatbot'],
  lob_admin: ['lobs', 'projects', 'connectors', 'health', 'chatbot'],
  project_admin: ['projects', 'connectors', 'health', 'chatbot'],
  analyst: ['analytics', 'health', 'projects', 'chatbot'],
  viewer: ['health', 'projects', 'chatbot'],
  project_user: ['projects', 'connectors', 'health', 'chatbot'],
};

export function RoleQuickActions({ role }: { role: UserRole }) {
  const actionKeys = ROLE_ACTIONS[role] || [];
  const actions = actionKeys.map((key) => ALL_ACTIONS[key]).filter(Boolean);

  return (
    <div>
      <p
        className="text-[11px] font-bold uppercase tracking-[0.1em] mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        Quick Access
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href + action.label}
              to={action.href}
              className={cn(
                'relative flex flex-col gap-3 p-4 rounded-2xl group',
                'transition-all duration-200',
              )}
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--app-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,153,0.12)';
                e.currentTarget.style.borderColor = 'rgba(0,229,153,0.20)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
                e.currentTarget.style.borderColor = 'var(--app-border)';
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                style={{ background: 'rgba(0,229,153,0.10)', border: '1px solid rgba(0,229,153,0.15)' }}
              >
                <Icon className="w-4 h-4" style={{ color: '#00E599' }} strokeWidth={1.75} />
              </div>
              <div>
                <p
                  className="text-[13px] font-semibold leading-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {action.label}
                </p>
                <p
                  className="text-[11px] mt-0.5 leading-snug"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {action.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
