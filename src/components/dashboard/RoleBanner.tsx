import React from 'react';
import { Shield, Crown, Building2, FolderOpen, ChartBar as BarChart2, Eye, Users, Sparkles } from 'lucide-react';
import { UserRole } from '@/types';
import { cn } from '@/lib/utils';

interface RoleBannerConfig {
  icon: React.ElementType;
  label: string;
  description: string;
  accentColor: string;
  capabilities: string[];
}

const ROLE_CONFIGS: Record<UserRole, RoleBannerConfig> = {
  super_admin: {
    icon: Crown,
    label: 'Super Admin',
    description: 'Full platform access — manage users, all LOBs, projects, connectors, and system settings.',
    accentColor: '#FF453A',
    capabilities: ['Manage all users & roles', 'Full LOB & project control', 'System configuration', 'Audit log access'],
  },
  admin: {
    icon: Shield,
    label: 'Admin',
    description: 'Broad platform access to manage LOBs, projects, connectors and users.',
    accentColor: '#FF9F0A',
    capabilities: ['Manage users', 'All LOBs & projects', 'Connector management', 'Health monitoring'],
  },
  lob_admin: {
    icon: Building2,
    label: 'LOB Admin',
    description: 'Manage a Line of Business, its projects, and members within your assigned scope.',
    accentColor: '#FF9F0A',
    capabilities: ['Manage LOB settings', 'Add & remove members', 'Oversee projects', 'Monitor LOB health'],
  },
  project_admin: {
    icon: FolderOpen,
    label: 'Project Admin',
    description: 'Manage connectors, health checks, and members within your assigned projects.',
    accentColor: '#0A84FF',
    capabilities: ['Manage project connectors', 'Configure health checks', 'Project member access', 'View project reports'],
  },
  analyst: {
    icon: BarChart2,
    label: 'Analyst',
    description: 'Read access to analytics, health reports, trends and dashboards.',
    accentColor: '#0D9488',
    capabilities: ['View all health data', 'Access trend reports', 'Export analytics', 'Monitor connectors'],
  },
  viewer: {
    icon: Eye,
    label: 'Viewer',
    description: 'Read-only access to resources assigned to you.',
    accentColor: '#A1A1AA',
    capabilities: ['View assigned resources', 'Read-only dashboard', 'Monitor connector status'],
  },
  project_user: {
    icon: Users,
    label: 'Project User',
    description: 'Interact with data and connectors within your assigned projects.',
    accentColor: '#30D158',
    capabilities: ['Interact with project data', 'View connector status', 'Submit chatbot queries', 'Monitor assigned projects'],
  },
};

export function RoleBanner({ role, name }: { role: UserRole; name: string }) {
  const config = ROLE_CONFIGS[role];
  const Icon = config.icon;
  const firstName = name?.split(' ')[0] || 'there';

  return (
    <div
      className="relative rounded-2xl overflow-hidden p-5 flex items-start gap-4"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: config.accentColor }}
      />
      <div
        className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${config.accentColor}10 0%, transparent 70%)`,
        }}
      />

      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: `${config.accentColor}14`,
          border: `1px solid ${config.accentColor}25`,
        }}
      >
        <Icon className="w-5 h-5" style={{ color: config.accentColor }} />
      </div>

      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h2
            className="text-[15px] font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Welcome back, {firstName}
          </h2>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${config.accentColor}14`,
              color: config.accentColor,
              border: `1px solid ${config.accentColor}25`,
            }}
          >
            <Sparkles className="w-2.5 h-2.5" />
            {config.label}
          </span>
        </div>
        <p className="text-[13px] leading-snug mb-3" style={{ color: 'var(--text-muted)' }}>
          {config.description}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {config.capabilities.map((cap) => (
            <span
              key={cap}
              className="text-[11px] font-medium px-2 py-0.5 rounded-lg"
              style={{
                background: 'var(--app-bg-muted)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
              }}
            >
              {cap}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
