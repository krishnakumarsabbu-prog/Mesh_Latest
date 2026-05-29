import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, UsersRound, FolderOpen, Activity, LayoutDashboard, ChevronRight, Search, X, RefreshCw, TrendingUp, TrendingDown, CircleCheck as CheckCircle, CircleAlert as AlertCircle, TriangleAlert as AlertTriangle, Clock, Filter, Eye, ArrowUpRight, ChartBar as BarChart2, Shield, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { lobApi, teamApi, projectApi } from '@/lib/api';
import { Lob, Team, Project } from '@/types';
import { notify } from '@/store/notificationStore';
import { cn } from '@/lib/utils';

type ActiveTab = 'lobs' | 'teams' | 'projects';

const STATUS_HEALTH: Record<string, { color: string; label: string; bg: string }> = {
  active:      { color: '#30D158', label: 'Active',      bg: 'rgba(48,209,88,0.12)' },
  healthy:     { color: '#30D158', label: 'Healthy',     bg: 'rgba(48,209,88,0.12)' },
  degraded:    { color: '#FF9F0A', label: 'Degraded',    bg: 'rgba(255,159,10,0.12)' },
  warning:     { color: '#FF9F0A', label: 'Warning',     bg: 'rgba(255,159,10,0.12)' },
  maintenance: { color: '#FF9F0A', label: 'Maintenance', bg: 'rgba(255,159,10,0.12)' },
  down:        { color: '#FF453A', label: 'Down',        bg: 'rgba(255,69,58,0.12)' },
  critical:    { color: '#FF453A', label: 'Critical',    bg: 'rgba(255,69,58,0.12)' },
  inactive:    { color: '#8E8E93', label: 'Inactive',    bg: 'rgba(142,142,147,0.12)' },
  unknown:     { color: '#8E8E93', label: 'Unknown',     bg: 'rgba(142,142,147,0.12)' },
  archived:    { color: '#8E8E93', label: 'Archived',    bg: 'rgba(142,142,147,0.12)' },
};

function HealthBadge({ status }: { status?: string }) {
  const s = STATUS_HEALTH[status?.toLowerCase() || 'unknown'] || STATUS_HEALTH.unknown;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color, trend }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  trend?: { value: number; label: string };
}) {
  return (
    <div
      className="rounded-2xl border p-4 flex items-start gap-3 transition-all hover:shadow-md"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '18' }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-[22px] font-bold leading-tight mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {trend.value >= 0
              ? <TrendingUp className="w-3 h-3 text-emerald-500" />
              : <TrendingDown className="w-3 h-3 text-red-500" />}
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{trend.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, label, icon: Icon, count, onClick }: {
  active: boolean;
  label: string;
  icon: React.ElementType;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all relative',
      )}
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#FFFFFF' : 'var(--text-secondary)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--app-bg-muted)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon className="w-4 h-4" />
      {label}
      {count !== undefined && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
          style={{
            background: active ? 'rgba(255,255,255,0.2)' : 'var(--app-bg-muted)',
            color: active ? '#FFFFFF' : 'var(--text-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ---- LOB List ----
function LobList({ lobs, search, onNavigate }: {
  lobs: Lob[];
  search: string;
  onNavigate: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return lobs.filter(l =>
      !search || l.name.toLowerCase().includes(lower) || (l.description || '').toLowerCase().includes(lower)
    );
  }, [lobs, search]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--app-bg-muted)' }}>
          <Building2 className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
        </div>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No Lines of Business found</p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {search ? 'Try adjusting your search.' : 'Create a Line of Business to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filtered.map(lob => (
        <motion.div
          key={lob.id}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border transition-all cursor-pointer group hover:shadow-lg"
          style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
          onClick={() => onNavigate(lob.id)}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: (lob.color || '#0A84FF') + '20' }}
                >
                  <Building2 className="w-5 h-5" style={{ color: lob.color || '#0A84FF' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{lob.name}</p>
                  {lob.slug && (
                    <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{lob.slug}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" style={{ color: 'var(--text-muted)' }} />
            </div>

            {lob.description && (
              <p className="text-[12px] mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{lob.description}</p>
            )}

            <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1">
                <UsersRound className="w-3.5 h-3.5" />
                {lob.member_count ?? 0} members
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5" />
                {lob.project_count ?? 0} projects
              </span>
            </div>
          </div>

          <div
            className="px-4 py-2.5 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-muted)' }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); onNavigate(lob.id); }}
                className="text-[11px] flex items-center gap-1 font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                <Eye className="w-3 h-3" />
                View Detail
              </button>
            </div>
            <button
              onClick={e => { e.stopPropagation(); window.location.href = `/lobs/${lob.id}/dashboards`; }}
              className="text-[11px] flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg transition-all"
              style={{ background: 'var(--accent)', color: '#FFFFFF' }}
            >
              <LayoutDashboard className="w-3 h-3" />
              Dashboards
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ---- Teams List ----
function TeamList({ teams, search, lobs, onNavigate }: {
  teams: Team[];
  search: string;
  lobs: Lob[];
  onNavigate: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return teams.filter(t =>
      !search || t.name.toLowerCase().includes(lower) || (t.description || '').toLowerCase().includes(lower)
    );
  }, [teams, search]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--app-bg-muted)' }}>
          <UsersRound className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
        </div>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No Teams found</p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {search ? 'Try adjusting your search.' : 'Create a team to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filtered.map(team => (
        <motion.div
          key={team.id}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border transition-all cursor-pointer group hover:shadow-lg"
          style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
          onClick={() => onNavigate(team.id)}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: (team.color || '#30D158') + '20' }}
                >
                  <UsersRound className="w-5 h-5" style={{ color: team.color || '#30D158' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{team.name}</p>
                  {team.slug && (
                    <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{team.slug}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" style={{ color: 'var(--text-muted)' }} />
            </div>

            {team.description && (
              <p className="text-[12px] mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{team.description}</p>
            )}

            <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1">
                <UsersRound className="w-3.5 h-3.5" />
                {(team as any).member_count ?? 0} members
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5" />
                {(team as any).project_count ?? 0} projects
              </span>
              {team.lob_id && lobs.find(l => l.id === team.lob_id) && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {lobs.find(l => l.id === team.lob_id)?.name}
                </span>
              )}
            </div>
          </div>

          <div
            className="px-4 py-2.5 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-muted)' }}
          >
            <button
              onClick={e => { e.stopPropagation(); onNavigate(team.id); }}
              className="text-[11px] flex items-center gap-1 font-medium transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <Eye className="w-3 h-3" />
              View Detail
            </button>
            <button
              onClick={e => { e.stopPropagation(); window.location.href = `/teams/${team.id}/dashboards`; }}
              className="text-[11px] flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg transition-all"
              style={{ background: 'var(--accent)', color: '#FFFFFF' }}
            >
              <LayoutDashboard className="w-3 h-3" />
              Dashboards
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ---- Projects List ----
const PROJECT_STATUS_OPTIONS = ['active', 'inactive', 'maintenance', 'archived'];

function ProjectList({ projects, search, statusFilter, lobs, onNavigate }: {
  projects: Project[];
  search: string;
  statusFilter: string;
  lobs: Lob[];
  onNavigate: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return projects.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (search && !p.name.toLowerCase().includes(lower) && !(p.description || '').toLowerCase().includes(lower)) return false;
      return true;
    });
  }, [projects, search, statusFilter]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--app-bg-muted)' }}>
          <FolderOpen className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
        </div>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No Projects found</p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {search || statusFilter ? 'Try adjusting your filters.' : 'Create a project to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filtered.map(project => {
        const sh = STATUS_HEALTH[project.status || 'unknown'] || STATUS_HEALTH.unknown;
        return (
          <motion.div
            key={project.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border transition-all cursor-pointer group hover:shadow-lg"
            style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
            onClick={() => onNavigate(project.id)}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: sh.color + '20' }}
                  >
                    <FolderOpen className="w-5 h-5" style={{ color: sh.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{project.name}</p>
                    {project.environment && (
                      <p className="text-[11px] font-mono capitalize" style={{ color: 'var(--text-muted)' }}>{project.environment}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <HealthBadge status={project.status} />
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>

              {project.description && (
                <p className="text-[12px] mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{project.description}</p>
              )}

              <div className="flex items-center gap-4 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
                {project.connector_count !== undefined && (
                  <span className="flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    {project.connector_count} connectors
                  </span>
                )}
                {(project as any).member_count !== undefined && (
                  <span className="flex items-center gap-1">
                    <UsersRound className="w-3.5 h-3.5" />
                    {(project as any).member_count} members
                  </span>
                )}
                {project.lob_id && lobs.find(l => l.id === project.lob_id) && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {lobs.find(l => l.id === project.lob_id)?.name}
                  </span>
                )}
              </div>
            </div>

            <div
              className="px-4 py-2.5 border-t flex items-center justify-between"
              style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-muted)' }}
            >
              <button
                onClick={e => { e.stopPropagation(); onNavigate(project.id); }}
                className="text-[11px] flex items-center gap-1 font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                <Eye className="w-3 h-3" />
                View Detail
              </button>
              <button
                onClick={e => { e.stopPropagation(); window.location.href = `/projects/${project.id}/dashboards`; }}
                className="text-[11px] flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={{ background: 'var(--accent)', color: '#FFFFFF' }}
              >
                <LayoutDashboard className="w-3 h-3" />
                Dashboards
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function OperationsDashboardPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ActiveTab>('lobs');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lobFilter, setLobFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [lobs, setLobs] = useState<Lob[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setPageTitle('Operations');
    setBreadcrumbs([{ label: 'Operations' }]);
  }, []);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [lobsRes, teamsRes, projectsRes] = await Promise.all([
        lobApi.list(),
        teamApi.list(),
        projectApi.list(),
      ]);
      setLobs(lobsRes.data || []);
      setTeams(teamsRes.data || []);
      setProjects(projectsRes.data || []);
    } catch {
      notify.error('Failed to load operations data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Clear search/filter on tab switch
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSearch('');
    setStatusFilter('');
    setLobFilter('');
  };

  const filteredTeams = useMemo(() => {
    if (!lobFilter) return teams;
    return teams.filter(t => t.lob_id === lobFilter);
  }, [teams, lobFilter]);

  const filteredProjects = useMemo(() => {
    if (!lobFilter) return projects;
    return projects.filter(p => p.lob_id === lobFilter);
  }, [projects, lobFilter]);

  const activeProjects = projects.filter(p => p.status === 'active').length;
  const maintenanceProjects = projects.filter(p => p.status === 'maintenance').length;
  const criticalProjects = projects.filter(p => (p.down_count ?? 0) > 0).length;

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Operations Overview
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Unified view across all Lines of Business, Teams, and Projects — with direct dashboard access
          </p>
        </div>
        <button
          onClick={() => fetchAll(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[13px] font-medium transition-all"
          style={{
            background: 'var(--app-surface)',
            borderColor: 'var(--app-border)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          disabled={refreshing}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Lines of Business" value={lobs.length} icon={Building2} color="#0A84FF" />
        <StatCard label="Teams" value={teams.length} icon={UsersRound} color="#30D158" />
        <StatCard label="Total Projects" value={projects.length} icon={FolderOpen} color="#FF9F0A" />
        <StatCard label="Active Projects" value={activeProjects} icon={CheckCircle} color="#30D158" />
        <StatCard label="Maintenance" value={maintenanceProjects} icon={Clock} color="#FF9F0A" />
        <StatCard label="Critical" value={criticalProjects} icon={AlertCircle} color="#FF453A" />
      </div>

      {/* Tab Bar + Filters */}
      <div
        className="rounded-2xl border"
        style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
      >
        {/* Tab Row */}
        <div
          className="flex items-center gap-1 p-2 border-b flex-wrap"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <TabButton
            active={activeTab === 'lobs'}
            label="Lines of Business"
            icon={Building2}
            count={lobs.length}
            onClick={() => handleTabChange('lobs')}
          />
          <TabButton
            active={activeTab === 'teams'}
            label="Teams"
            icon={UsersRound}
            count={teams.length}
            onClick={() => handleTabChange('teams')}
          />
          <TabButton
            active={activeTab === 'projects'}
            label="Projects"
            icon={FolderOpen}
            count={projects.length}
            onClick={() => handleTabChange('projects')}
          />

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="pl-8 pr-7 py-2 rounded-xl text-[13px] outline-none transition-all w-48"
              style={{
                background: 'var(--app-bg-muted)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--app-border)'; }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* LOB filter (for Teams/Projects tabs) */}
          {(activeTab === 'teams' || activeTab === 'projects') && lobs.length > 0 && (
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <select
                value={lobFilter}
                onChange={e => setLobFilter(e.target.value)}
                className="appearance-none pl-7 pr-6 py-2 rounded-xl text-[13px] outline-none cursor-pointer"
                style={{
                  background: 'var(--app-bg-muted)',
                  border: '1px solid var(--app-border)',
                  color: lobFilter ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <option value="">All LOBs</option>
                {lobs.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter (for Projects tab) */}
          {activeTab === 'projects' && (
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-6 py-2 rounded-xl text-[13px] outline-none cursor-pointer"
                style={{
                  background: 'var(--app-bg-muted)',
                  border: '1px solid var(--app-border)',
                  color: statusFilter ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <option value="">All statuses</option>
                {PROJECT_STATUS_OPTIONS.map(s => (
                  <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          {(search || statusFilter || lobFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setLobFilter(''); }}
              className="text-[12px] px-2 py-1.5 rounded-lg transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--app-bg-muted)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--app-bg-muted)' }} />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'lobs' && (
                <motion.div key="lobs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <LobList lobs={lobs} search={search} onNavigate={id => navigate(`/lobs/${id}`)} />
                </motion.div>
              )}
              {activeTab === 'teams' && (
                <motion.div key="teams" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <TeamList teams={filteredTeams} search={search} lobs={lobs} onNavigate={id => navigate(`/teams/${id}`)} />
                </motion.div>
              )}
              {activeTab === 'projects' && (
                <motion.div key="projects" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ProjectList
                    projects={filteredProjects}
                    search={search}
                    statusFilter={statusFilter}
                    lobs={lobs}
                    onNavigate={id => navigate(`/projects/${id}`)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Footer hint */}
        {!loading && (
          <div
            className="px-4 py-2.5 border-t flex items-center gap-2 text-[11px] rounded-b-2xl"
            style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-muted)', color: 'var(--text-muted)' }}
          >
            <ArrowUpRight className="w-3 h-3" />
            Click any card to open detail view, or use the Dashboards button to navigate directly to assigned dashboards.
          </div>
        )}
      </div>
    </div>
  );
}
