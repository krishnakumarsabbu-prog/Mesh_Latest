import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, FolderOpen, Layers, ArrowLeft, Plus, Play, RefreshCw, Activity, UserPlus, UserMinus, ChevronRight, LayoutDashboard, CircleCheck as CheckCircle, Circle as XCircle, Clock, Wrench, Server, Database, Lock, Shield, Globe, Network, Mail, Code, Terminal, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { teamApi, projectApi, lobApi, userApi, healthRunApi, componentApi } from '@/lib/api';
import { Team, TeamMember, Component, Project, Lob, User, HealthRunDetail } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { canManageProjects } from '@/lib/permissions';
import { cn, slugify } from '@/lib/utils';

type Tab = 'components' | 'members' | 'health';

function HealthStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; bg: string; label: string }> = {
    healthy: { color: '#30D158', bg: 'rgba(48,209,88,0.12)', label: 'Healthy' },
    degraded: { color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)', label: 'Degraded' },
    down: { color: '#FF453A', bg: 'rgba(255,69,58,0.12)', label: 'Down' },
    unknown: { color: '#8E8E93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
  };
  const cfg = configs[status] || configs['unknown'];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  admin: { color: '#FF9F0A', bg: '#FF9F0A15' },
  lead: { color: '#0A84FF', bg: '#0A84FF15' },
  member: { color: '#30D158', bg: '#30D15815' },
};

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const canManage = user ? canManageProjects(user.role) : false;

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [lob, setLob] = useState<Lob | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('components');

  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);

  const [addComponentForm, setAddComponentForm] = useState({ name: '', slug: '', description: '', color: '#30D158' });
  const [addMemberForm, setAddMemberForm] = useState({ user_id: '', role: 'member' });

  const [runningProject, setRunningProject] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastRunResults, setLastRunResults] = useState<Record<string, HealthRunDetail>>({});

  useEffect(() => {
    if (!teamId) return;
    fetchAll();
  }, [teamId]);

  const fetchAll = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [teamRes, membersRes, componentsRes, projectsRes] = await Promise.all([
        teamApi.get(teamId),
        teamApi.getMembers(teamId),
        componentApi.list(undefined, teamId),
        projectApi.list(undefined, teamId),
      ]);
      const t = teamRes.data as Team;
      setTeam(t);
      setMembers(membersRes.data);
      setComponents(componentsRes.data);
      setProjects(projectsRes.data);

      const lobRes = await lobApi.get(t.lob_id);
      setLob(lobRes.data);

      setPageTitle(t.name);
      setBreadcrumbs([
        { label: 'Teams', href: '/teams' },
        { label: t.name },
      ]);
    } catch {
      notify.error('Failed to load team details');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersForAssign = async () => {
    try {
      const res = await userApi.list();
      const existingIds = new Set(members.map(m => m.user_id));
      setAllUsers((res.data as User[]).filter(u => !existingIds.has(u.id)));
    } catch {
      notify.error('Failed to load users');
    }
  };

  const handleCreateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !addComponentForm.name || !team) return;
    setSaving(true);
    try {
      await componentApi.create({
        name: addComponentForm.name,
        slug: addComponentForm.slug || slugify(addComponentForm.name),
        description: addComponentForm.description,
        color: addComponentForm.color,
        icon: 'layers',
        team_id: teamId,
        lob_id: team.lob_id,
      });
      notify.success('Project created successfully');
      setAddComponentOpen(false);
      setAddComponentForm({ name: '', slug: '', description: '', color: '#30D158' });
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to create project', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !addMemberForm.user_id) return;
    setSaving(true);
    try {
      await teamApi.addMember(teamId, addMemberForm);
      notify.success('Member added to team');
      setAddMemberOpen(false);
      setAddMemberForm({ user_id: '', role: 'member' });
      fetchAll();
    } catch (err: unknown) {
      notify.error('Failed to add member', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!teamId || !removeMemberTarget) return;
    setSaving(true);
    try {
      await teamApi.removeMember(teamId, removeMemberTarget.id);
      notify.success('Member removed from team');
      setRemoveMemberTarget(null);
      fetchAll();
    } catch {
      notify.error('Failed to remove member');
    } finally {
      setSaving(false);
    }
  };

  const handleRunProject = async (projectId: string) => {
    setRunningProject(projectId);
    try {
      const res = await healthRunApi.run(projectId);
      const runDetail = res.data as HealthRunDetail;
      setLastRunResults(prev => ({ ...prev, [projectId]: runDetail }));
      notify.success('Health run completed');
    } catch {
      notify.error('Health run failed');
    } finally {
      setRunningProject(null);
    }
  };

  const handleRunAll = async () => {
    if (projects.length === 0) return;
    setRunningAll(true);
    notify.info('Running health checks for all projects under team...');
    const results: Record<string, HealthRunDetail> = {};
    for (const p of projects) {
      try {
        const res = await healthRunApi.run(p.id);
        results[p.id] = res.data as HealthRunDetail;
      } catch {
        // continue
      }
    }
    setLastRunResults(prev => ({ ...prev, ...results }));
    setRunningAll(false);
    notify.success(`Health runs completed: ${Object.keys(results).length}/${projects.length} projects`);
    fetchAll();
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'components', label: 'Projects', icon: Layers, count: components.length },
    { key: 'members', label: 'Members', icon: Users, count: members.length },
    { key: 'health', label: 'Health Runs', icon: Activity, count: Object.keys(lastRunResults).length || undefined },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-neutral-100 dark:bg-neutral-800 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-neutral-100 dark:bg-neutral-800 rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-neutral-100 dark:bg-neutral-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-neutral-500">Team not found</p>
      </div>
    );
  }

  const teamColor = team.color || '#30D158';
  const healthyCount = projects.filter(p => p.connector_count > 0 && (p.healthy_count / p.connector_count) >= 0.8).length;
  const totalHealth = projects.length > 0 ? Math.round((healthyCount / projects.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back nav */}
      <button
        onClick={() => navigate('/teams')}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Teams
      </button>

      {/* Hero Header */}
      <div
        className="relative rounded-3xl overflow-hidden p-8"
        style={{
          background: 'linear-gradient(135deg, #090d16 0%, #0f172a 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `radial-gradient(circle at 80% 20%, ${teamColor} 0%, transparent 60%)`,
        }} />
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 border border-white/10"
              style={{ background: teamColor, boxShadow: `0 8px 24px ${teamColor}40` }}
            >
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-slate-100">{team.name}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: team.is_active ? 'rgba(48, 209, 88, 0.15)' : 'rgba(142, 142, 147, 0.15)',
                    color: team.is_active ? '#30D158' : '#8E8E93',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: team.is_active ? '#30D158' : '#8E8E93' }} />
                  {team.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {lob && (
                <div className="flex items-center gap-1.5 mb-1 text-xs">
                  <Link to={`/lobs/${lob.id}`} className="hover:underline font-medium" style={{ color: lob.color || teamColor }}>
                    {lob.name}
                  </Link>
                  <ChevronRight className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-400 font-semibold">Team</span>
                </div>
              )}
              {team.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">{team.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              icon={<LayoutDashboard className="w-4 h-4" />}
              onClick={() => navigate(`/teams/${teamId}/dashboards`)}
              variant="secondary"
              size="sm"
            >
              Dashboards
            </Button>
            {canManage && projects.length > 0 && (
              <Button
                icon={runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                onClick={handleRunAll}
                loading={runningAll}
                variant="secondary"
                size="sm"
              >
                Run All Checks
              </Button>
            )}
          </div>
        </div>

        {/* Summary Stats — premium clickable situation room tiles */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { 
              label: 'Projects', 
              value: components.length, 
              icon: Layers, 
              color: '#0A84FF', 
              onClick: () => setActiveTab('components') 
            },
            { 
              label: 'Components', 
              value: projects.length, 
              icon: FolderOpen, 
              color: '#AF52DE', 
              onClick: () => setActiveTab('components') 
            },
            { 
              label: 'Connectors', 
              value: projects.reduce((acc, p) => acc + (p.connector_count || 0), 0), 
              icon: Activity, 
              color: '#64D2FF', 
              onClick: () => navigate(`/connectors?team_id=${team.id}`) 
            },
            { 
              label: 'Healthy', 
              value: projects.filter(p => p.healthy_count > 0).length, 
              icon: CheckCircle, 
              color: '#30D158', 
              onClick: () => setActiveTab('health') 
            },
            { 
              label: 'Overall Health', 
              value: totalHealth >= 80 ? `${totalHealth}%` : `${totalHealth}%`, 
              icon: Activity, 
              color: totalHealth >= 80 ? '#30D158' : totalHealth >= 60 ? '#FF9F0A' : '#FF453A', 
              onClick: () => setActiveTab('health') 
            },
          ].map(({ label, value, icon: Icon, color, onClick }) => (
            <motion.div
              whileHover={{ scale: 1.04, y: -4 }}
              whileTap={{ scale: 0.97 }}
              key={label}
              onClick={onClick}
              className="relative rounded-2xl p-5 backdrop-blur-lg transition-all duration-300 bg-slate-900/70 border border-white/5 cursor-pointer group shadow-2xl overflow-hidden"
              style={{ 
                boxShadow: `inset 0 0 16px ${color}15, 0 12px 32px rgba(0,0,0,0.5)`, 
                borderColor: `${color}25` 
              }}
            >
              {/* Tech background mesh glow effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 70%)`
                }}
              />
              
              {/* Glowing breathing state light in the top-right */}
              <span className="absolute top-4 right-4 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
              </span>

              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" style={{ color }} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
              </div>
              <div className="text-3xl font-black tracking-tight" style={{ color }}>
                {value}
              </div>
              <div className="text-[8px] text-slate-500 mt-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                Click to explore →
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-100">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-all',
              activeTab === key ? 'border-current' : 'border-transparent text-neutral-400 hover:text-neutral-600'
            )}
            style={activeTab === key ? { borderColor: teamColor, color: teamColor } : {}}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count !== undefined && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  background: activeTab === key ? teamColor + '20' : '#f3f4f6',
                  color: activeTab === key ? teamColor : '#9ca3af',
                }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Components Tab */}
      {activeTab === 'components' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {components.length} project{components.length !== 1 ? 's' : ''} established
            </p>
            {canManage && (
              <Button
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setAddComponentOpen(true)}
                variant="secondary"
                size="sm"
              >
                Create Project
              </Button>
            )}
          </div>

          {components.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <EmptyState
                icon={Layers}
                title="No projects yet"
                description="Create a project in this team to group and organize your components."
                action={canManage ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddComponentOpen(true)}>Create Project</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AnimatePresence>
                {components.map((c, i) => {
                  const cColor = c.color || '#30D158';
                  
                  // Filter child Level 4 Components (backend projects) belonging to this Level 3 Project (backend component)
                  const childComps = projects.filter(p => p.component_id === c.id);
                  const totalConnectors = childComps.reduce((acc, curr) => acc + (curr.connector_count || 0), 0);
                  
                  // Calculate real health from child connectors
                  const healthyConns = childComps.reduce((acc, p) => acc + (p.healthy_count || 0), 0);
                  const tHealthPct = totalConnectors > 0 ? Math.round((healthyConns / totalConnectors) * 100) : null;
                  const tHealthColor = tHealthPct === null ? '#8E8E93' : tHealthPct >= 80 ? '#30D158' : tHealthPct >= 60 ? '#FF9F0A' : '#FF453A';
                  const tHealthLabel = tHealthPct === null ? 'No Data' : tHealthPct >= 80 ? 'Healthy' : tHealthPct >= 60 ? 'Degraded' : 'Critical';

                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => navigate(`/components/${c.id}`)}
                      className="relative rounded-2xl p-5 border bg-white hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
                      style={{ borderColor: 'var(--app-border)', borderTop: `3px solid ${cColor}` }}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${cColor}, ${cColor}cc)` }}
                        >
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm text-neutral-900 group-hover:text-neutral-700 truncate">{c.name}</h3>
                          <p className="text-[10px] text-neutral-400 font-mono truncate">{c.slug || team.name}</p>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0"
                          style={{ background: tHealthColor + '15', color: tHealthColor, border: `1px solid ${tHealthColor}25` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tHealthColor }} />
                          {tHealthLabel}
                        </span>
                      </div>

                      {/* Hierarchy Counts */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                          <div className="text-sm font-bold text-neutral-800">{childComps.length}</div>
                          <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Components</div>
                        </div>
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                          <div className="text-sm font-bold text-neutral-800">{totalConnectors}</div>
                          <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Connectors</div>
                        </div>
                      </div>

                      {/* Health bar */}
                      {totalConnectors > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-neutral-400">Health</span>
                            <span className="text-[10px] font-bold" style={{ color: tHealthColor }}>{tHealthPct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tHealthPct}%`, background: tHealthColor }} />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--app-border-subtle)' }}>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400 border border-neutral-200 font-medium">
                          Project
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">{members.length} member{members.length !== 1 ? 's' : ''} in this team</p>
            {canManage && (
              <Button
                icon={<UserPlus className="w-4 h-4" />}
                onClick={() => { setAddMemberOpen(true); fetchUsersForAssign(); }}
                variant="secondary"
                size="sm"
              >
                Add Member
              </Button>
            )}
          </div>

          {members.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <EmptyState
                icon={Users}
                title="No members yet"
                description="Add members to this team to grant access to its projects."
                action={canManage ? <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setAddMemberOpen(true); fetchUsersForAssign(); }}>Add Member</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence>
                {members.map((member, i) => {
                  const roleStyle = ROLE_COLORS[member.role] || ROLE_COLORS.member;
                  const initials = (member.user_full_name || member.user_email || '?').slice(0, 2).toUpperCase();
                  return (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="bg-white rounded-2xl border border-neutral-100 p-4 flex items-center gap-3 hover:border-neutral-200 hover:shadow-sm transition-all group"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm"
                        style={{ background: teamColor + '20', color: teamColor }}
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{member.user_full_name || member.user_email}</p>
                        {member.user_email && member.user_full_name && (
                          <p className="text-xs text-neutral-400 truncate">{member.user_email}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                          style={{ background: roleStyle.bg, color: roleStyle.color }}
                        >
                          {member.role}
                        </span>
                        {canManage && (
                          <button
                            onClick={() => setRemoveMemberTarget(member)}
                            className="p-1.5 rounded-lg text-neutral-200 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Health Tab */}
      {activeTab === 'health' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-700">Health Run Results</p>
              <p className="text-xs text-neutral-400">Session results for all team projects</p>
            </div>
            {canManage && projects.length > 0 && (
              <Button
                icon={runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                onClick={handleRunAll}
                loading={runningAll}
              >
                Run All Projects
              </Button>
            )}
          </div>

          {Object.keys(lastRunResults).length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <EmptyState
                icon={Activity}
                title="No health runs yet"
                description="Run health checks on individual projects or run all at once."
                action={canManage && projects.length > 0
                  ? <Button icon={<Play className="w-4 h-4" />} onClick={handleRunAll} loading={runningAll}>Run All Projects</Button>
                  : undefined
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((p) => {
                const runResult = lastRunResults[p.id];
                if (!runResult) return null;
                const score = runResult.overall_score !== undefined ? Math.round(runResult.overall_score) : null;
                const pColor = p.color || '#30D158';
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-neutral-100 overflow-hidden hover:shadow-md transition-all"
                  >
                    {score !== null && (
                      <div
                        className="h-1.5 w-full"
                        style={{
                          background: `linear-gradient(90deg, ${score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A'} ${score}%, #f3f4f6 ${score}%)`,
                        }}
                      />
                    )}
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: pColor + '20' }}>
                            <FolderOpen className="w-4.5 h-4.5" style={{ color: pColor }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
                            <p className="text-xs text-neutral-400">{runResult.connector_count} connectors</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {runResult.overall_health_status && (
                            <HealthStatusBadge status={runResult.overall_health_status} />
                          )}
                          {score !== null && (
                            <span
                              className="text-xl font-bold"
                              style={{ color: score >= 80 ? '#30D158' : score >= 60 ? '#FF9F0A' : '#FF453A' }}
                            >
                              {score}%
                            </span>
                          )}
                        </div>
                      </div>

                      {runResult.connector_results && runResult.connector_results.length > 0 && (
                        <div className="space-y-1.5">
                          {runResult.connector_results.slice(0, 5).map(cr => (
                            <div
                              key={cr.id}
                              className="flex items-center justify-between text-xs px-3 py-2 rounded-xl"
                              style={{ background: '#f9fafb' }}
                            >
                              <div className="flex items-center gap-2">
                                {cr.outcome === 'success'
                                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  : <XCircle className="w-3.5 h-3.5 text-red-500" />
                                }
                                <span className="text-neutral-600 font-medium">{cr.connector_name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-neutral-400">
                                {cr.response_time_ms !== undefined && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {cr.response_time_ms}ms
                                  </span>
                                )}
                                <span
                                  className="capitalize font-medium"
                                  style={{ color: cr.outcome === 'success' ? '#30D158' : '#FF453A' }}
                                >
                                  {cr.outcome}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {/* Create Component Modal */}
      <Modal
        open={addComponentOpen}
        onClose={() => setAddComponentOpen(false)}
        title="Create Project"
        subtitle={`Add a new project to ${team.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddComponentOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-component-form" loading={saving}>Create</Button>
          </>
        }
      >
        <form id="create-component-form" onSubmit={handleCreateComponent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Project Name *</label>
            <input
              type="text"
              value={addComponentForm.name}
              onChange={e => setAddComponentForm(prev => ({ ...prev, name: e.target.value, slug: slugify(e.target.value) }))}
              className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-400 transition-all font-medium"
              placeholder="e.g. Identity & Access Management"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Slug</label>
            <input
              type="text"
              value={addComponentForm.slug}
              onChange={e => setAddComponentForm(prev => ({ ...prev, slug: e.target.value }))}
              className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-400 transition-all font-mono"
              placeholder="identity-access-management"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={addComponentForm.description}
              onChange={e => setAddComponentForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-400 transition-all"
              placeholder="Brief description of what this project monitors..."
              rows={3}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Color Tag</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['#30D158', '#0A84FF', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF', '#FFD60A', '#FF6B35'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAddComponentForm(prev => ({ ...prev, color: c }))}
                  className={cn(
                    'w-8 h-8 rounded-full border border-neutral-200 transition-transform duration-100',
                    addComponentForm.color === c ? 'scale-110 ring-2 ring-offset-2 ring-neutral-400' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="Add Member"
        subtitle="Add a user to this team"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button type="submit" form="add-member-form" loading={saving}>Add Member</Button>
          </>
        }
      >
        <form id="add-member-form" onSubmit={handleAddMember} className="space-y-4">
          <Select
            label="User"
            value={addMemberForm.user_id}
            onChange={e => setAddMemberForm(prev => ({ ...prev, user_id: e.target.value }))}
            options={[
              { value: '', label: 'Select a user...' },
              ...allUsers.map(u => ({ value: u.id, label: u.full_name || u.email })),
            ]}
            required
          />
          <Select
            label="Role"
            value={addMemberForm.role}
            onChange={e => setAddMemberForm(prev => ({ ...prev, role: e.target.value }))}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'lead', label: 'Lead' },
              { value: 'admin', label: 'Admin' },
            ]}
            required
          />
        </form>
      </Modal>

      <ConfirmModal
        open={!!removeMemberTarget}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={handleRemoveMember}
        title="Remove Member"
        message={
          <>
            Are you sure you want to remove <strong className="text-neutral-900">{removeMemberTarget?.user_full_name || removeMemberTarget?.user_email}</strong> from this team?
          </>
        }
        confirmLabel="Remove"
        loading={saving}
      />
    </div>
  );
}
