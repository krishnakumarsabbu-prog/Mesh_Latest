import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, FolderOpen, Users, ArrowLeft, Pencil, Plus, ChevronRight, LayoutDashboard, Activity, Star, Layers, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';
import { lobApi, teamApi, componentApi, lobDashboardAssignmentApi } from '@/lib/api';
import { Lob, LobMember, Team, LobAssignmentResponse } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { isSuperAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export function LobDetailPage() {
  const { lobId } = useParams<{ lobId: string }>();
  const navigate = useNavigate();
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [lob, setLob] = useState<Lob | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dashboards, setDashboards] = useState<LobAssignmentResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lobId) return;
    fetchAll();
  }, [lobId]);

  const fetchAll = async () => {
    if (!lobId) return;
    setLoading(true);
    try {
      const [lobRes, teamsRes, dashboardsRes] = await Promise.all([
        lobApi.get(lobId),
        teamApi.list(lobId),
        lobDashboardAssignmentApi.list(lobId).catch(() => ({ data: [] })),
      ]);
      setLob(lobRes.data);
      setTeams(teamsRes.data);
      setDashboards(dashboardsRes.data);
      setPageTitle(lobRes.data.name);
      setBreadcrumbs([
        { label: 'Lines of Business', href: '/lobs' },
        { label: lobRes.data.name },
      ]);
    } catch {
      notify.error('Failed to load LOB details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-neutral-100 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-neutral-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-neutral-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!lob) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
          <p className="text-neutral-500">LOB not found</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/lobs')}>
            Back to LOBs
          </Button>
        </div>
      </div>
    );
  }

  const lobColor = lob.color || '#0A84FF';
  const teamCount = (lob as any).team_count ?? teams.length;
  const componentCount = (lob as any).component_count ?? 0;
  const projectCount = lob.project_count ?? 0;
  const totalConnectors = (lob as any).total_connectors ?? 0;
  const healthyConnectors = (lob as any).healthy_connectors ?? 0;
  const healthPct = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : null;
  const healthColor = healthPct === null ? '#8E8E93' : healthPct >= 80 ? '#30D158' : healthPct >= 60 ? '#FF9F0A' : '#FF453A';
  const healthLabel = healthPct === null ? 'No Connectors' : healthPct >= 80 ? 'Healthy' : healthPct >= 60 ? 'Degraded' : 'Critical';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back nav */}
      <button
        onClick={() => navigate('/lobs')}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Lines of Business
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
          backgroundImage: `radial-gradient(circle at 80% 20%, ${lobColor} 0%, transparent 60%)`,
        }} />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 border border-white/10"
              style={{ background: lobColor, boxShadow: `0 8px 24px ${lobColor}40` }}
            >
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-slate-100">{lob.name}</h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: healthColor + '18',
                    color: healthColor,
                    border: `1px solid ${healthColor}30`
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: healthColor }} />
                  {healthLabel}
                </span>
              </div>
              {lob.description && (
                <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">{lob.description}</p>
              )}
              <p className="text-xs text-slate-500 font-mono mt-1">{lob.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={<LayoutDashboard className="w-3.5 h-3.5" />}
              onClick={() => navigate(`/lobs/${lobId}/dashboards`)}
            >
              Dashboards
            </Button>
            {superAdmin && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil className="w-3.5 h-3.5" />}
                onClick={() => navigate('/lobs')}
              >
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Summary Stats — premium clickable situation room tiles */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { 
              label: 'Teams', 
              value: teamCount, 
              icon: Users, 
              color: '#0A84FF', 
              onClick: () => {
                const el = document.getElementById('teams-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }
            },
            { 
              label: 'Projects', 
              value: componentCount, 
              icon: Layers, 
              color: '#FF9F0A', 
              onClick: () => navigate(`/components?lob_id=${lob.id}`) 
            },
            { 
              label: 'Components', 
              value: projectCount, 
              icon: FolderOpen, 
              color: '#AF52DE', 
              onClick: () => navigate(`/projects?lob_id=${lob.id}`) 
            },
            { 
              label: 'Connectors', 
              value: totalConnectors, 
              icon: Activity, 
              color: '#64D2FF', 
              onClick: () => navigate(`/connectors?lob_id=${lob.id}`) 
            },
            { 
              label: 'Overall Health', 
              value: healthPct !== null ? `${healthPct}%` : '—', 
              icon: Heart, 
              color: healthColor, 
              onClick: () => navigate(`/lobs/${lobId}/dashboards`) 
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

      {/* Teams Section — full width, no right sidebar */}
      <div id="teams-section" className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Teams</h2>
            <p className="text-xs text-neutral-400 mt-0.5">{teams.length} team{teams.length !== 1 ? 's' : ''} in this LOB</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => navigate(`/teams?lob_id=${lob.id}`)}
          >
            View All
          </Button>
        </div>

        {teams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-100 p-8">
            <EmptyState
              icon={Users}
              title="No Teams"
              description="No teams have been added to this LOB yet."
              action={
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/teams')}>
                  Add Team
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team, i) => {
              const tColor = team.color || '#0A84FF';
              const tProjectCount = team.project_count ?? 0;
              const tComponentCount = (team as any).component_count ?? 0;
              const tTotalConn = (team as any).total_connectors ?? 0;
              const tHealthyConn = (team as any).healthy_connectors ?? 0;
              const tHealthPct = tTotalConn > 0 ? Math.round((tHealthyConn / tTotalConn) * 100) : null;
              const tHealthColor = tHealthPct === null ? '#8E8E93' : tHealthPct >= 80 ? '#30D158' : tHealthPct >= 60 ? '#FF9F0A' : '#FF453A';
              const tHealthLabel = tHealthPct === null ? 'No Data' : tHealthPct >= 80 ? 'Healthy' : tHealthPct >= 60 ? 'Degraded' : 'Critical';

              return (
                <motion.div
                  key={team.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative rounded-2xl p-5 border bg-white hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
                  style={{ borderColor: 'var(--app-border)', borderTop: `3px solid ${tColor}` }}
                  onClick={() => navigate(`/teams/${team.id}`)}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 text-white shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${tColor}, ${tColor}cc)` }}
                    >
                      {team.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-neutral-900 group-hover:text-neutral-700 truncate transition-colors">{team.name}</h3>
                      <p className="text-[10px] text-neutral-400 font-mono truncate">{team.slug}</p>
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
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                      <div className="text-sm font-bold text-neutral-800">{tProjectCount}</div>
                      <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Projects</div>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                      <div className="text-sm font-bold text-neutral-800">{tComponentCount}</div>
                      <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Components</div>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--app-bg-muted)' }}>
                      <div className="text-sm font-bold text-neutral-800">{tTotalConn}</div>
                      <div className="text-[9px] font-medium uppercase tracking-wider text-neutral-400">Connectors</div>
                    </div>
                  </div>

                  {/* Health bar */}
                  {tTotalConn > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-neutral-400">Connector Health</span>
                        <span className="text-[10px] font-bold" style={{ color: tHealthColor }}>{tHealthPct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-bg-muted)' }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tHealthPct}%`, background: tHealthColor }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--app-border-subtle)' }}>
                    <Badge variant={team.is_active ? 'active' : 'inactive'} size="xs">{team.is_active ? 'Active' : 'Inactive'}</Badge>
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dashboards Section */}
      {dashboards.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Portfolio Dashboards</h2>
              <p className="text-xs text-neutral-400 mt-0.5">{dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''} assigned</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate(`/lobs/${lobId}/dashboards`)}>
              Manage
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((d, i) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-neutral-100 hover:border-neutral-200 hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
                onClick={() => navigate(`/lobs/${lobId}/dashboards/${d.id}`)}
              >
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${lobColor}, ${lobColor}80)` }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: lobColor + '15' }}>
                        <LayoutDashboard className="w-5 h-5" style={{ color: lobColor }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-neutral-900">{d.display_name || d.template_name}</span>
                          {d.is_default && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold border border-amber-200">
                              <Star className="w-2.5 h-2.5" />
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">{d.widget_count} widgets · scope: {d.template_scope || 'lob'}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
