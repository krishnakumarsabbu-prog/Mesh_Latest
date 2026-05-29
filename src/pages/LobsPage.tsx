import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Plus, Building2, Users, Trash2, Pencil, Search, LayoutGrid, List, ShieldCheck, UserPlus, UserMinus, ArrowUpDown, X, Check, Eye, Activity, TrendingUp, TriangleAlert as AlertTriangle, ChevronRight, MoveVertical as MoreVertical, Cpu, Server } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { useUIStore } from '@/store/uiStore';
import { lobApi, userApi, healthApi, teamApi } from '@/lib/api';
import { Lob, LobMember } from '@/types/lob';
import { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/store/notificationStore';
import { slugify, cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { isSuperAdmin } from '@/lib/permissions';

type SortKey = 'name' | 'project_count' | 'member_count' | 'created_at';
type ViewMode = 'grid' | 'table';

const PRESET_COLORS = [
  '#0A84FF', '#30D158', '#FF453A', '#FF9F0A',
  '#64D2FF', '#FF6B6B', '#1DB954', '#0077B6', '#F4845F', '#E63946',
];

function generateSparkData(lob: Lob & Record<string, unknown>, seed: number) {
  const healthPct = (() => {
    const total = (lob.total_connectors as number) ?? 0;
    const healthy = (lob.healthy_connectors as number) ?? 0;
    if (total === 0) return 85 + (seed % 15);
    return Math.round((healthy / total) * 100);
  })();
  const base = Math.max(60, healthPct - 15);
  return Array.from({ length: 12 }, (_, i) => ({
    i,
    v: Math.min(100, base + Math.sin((i + seed) * 0.8) * 8 + Math.cos((i + seed * 1.3) * 0.5) * 6 + (Math.random() - 0.5) * 4),
  }));
}

function generateSystemOverviewData() {
  const now = Date.now();
  return Array.from({ length: 48 }, (_, i) => ({
    t: new Date(now - (47 - i) * 30 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    v: 85 + Math.sin(i * 0.3) * 7 + Math.cos(i * 0.5) * 4 + (Math.random() - 0.5) * 3,
  }));
}

// --- Sparkline mini chart ---
function MiniSparkline({ data, color }: { data: { i: number; v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="v"
          stroke={`url(#sg-${color.replace('#', '')})`}
          strokeWidth={1.5}
          dot={(props) => {
            const { cx, cy, index } = props;
            if (index === data.length - 1) {
              return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={color} stroke={color} strokeWidth={2} />;
            }
            return <g key={`dot-${index}`} />;
          }}
          activeDot={{ r: 3, fill: color }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// --- Graph popup ---
function GraphPopup({ lob, onClose }: { lob: Lob & Record<string, unknown>; onClose: () => void }) {
  const seed = lob.name.length + (lob.slug?.length ?? 0);
  const healthPct = (() => {
    const total = (lob.total_connectors as number) ?? 0;
    const healthy = (lob.healthy_connectors as number) ?? 0;
    if (total === 0) return 85 + (seed % 15);
    return Math.round((healthy / total) * 100);
  })();
  const color = lob.color as string || '#0A84FF';
  const data = Array.from({ length: 24 }, (_, i) => ({
    t: `${String(i).padStart(2, '0')}:00`,
    health: Math.min(100, Math.max(50, healthPct - 10 + Math.sin(i * 0.5) * 8 + Math.cos(i * 0.3) * 5 + (Math.random() - 0.5) * 4)),
    connectors: Math.round((lob.total_connectors as number ?? 5) * (0.7 + Math.random() * 0.3)),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(15,22,40,0.98) 0%, rgba(20,30,55,0.98) 100%)',
          border: `1px solid ${color}40`,
          boxShadow: `0 0 40px ${color}20, 0 20px 60px rgba(0,0,0,0.6)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}25`, border: `1px solid ${color}40` }}>
              <Activity className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{lob.name}</h3>
              <p className="text-xs" style={{ color: '#8097B0' }}>24h Health Trend</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
            style={{ color: '#8097B0' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: '#8097B0' }}>Health Score</span>
            <span className="text-sm font-bold" style={{ color }}>{healthPct.toFixed(1)}%</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <defs>
                <linearGradient id={`popup-grad-${lob.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#8097B0' }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: '#8097B0' }} tickLine={false} axisLine={false} domain={[60, 100]} />
              <Tooltip
                contentStyle={{ background: 'rgba(15,22,40,0.95)', border: `1px solid ${color}40`, borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#8097B0' }}
                itemStyle={{ color }}
              />
              <Area type="monotone" dataKey="health" stroke={color} strokeWidth={2} fill={`url(#popup-grad-${lob.id})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Teams', value: (lob.team_count as number) ?? 0, icon: Users },
            { label: 'Projects', value: (lob.project_count as number) ?? 0, icon: Server },
            { label: 'Components', value: (lob.component_count as number) ?? 0, icon: Cpu },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Icon className="w-4 h-4 mx-auto mb-1" style={{ color }} />
              <div className="text-lg font-bold text-white">{value}</div>
              <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#8097B0' }}>{label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// --- Stat card at top ---
function StatCard({ label, value, icon: Icon, color, trend }: {
  label: string; value: string | number; icon: React.ElementType; color: string; trend?: number[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15,22,40,0.9) 0%, rgba(20,30,55,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div className="absolute inset-0 opacity-5" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }} />
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-white leading-none">{value}</div>
        <div className="text-xs mt-1 font-medium" style={{ color: '#8097B0' }}>{label}</div>
      </div>
      {trend && (
        <div className="w-20 h-10 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.map((v, i) => ({ i, v }))}>
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}

// --- LOB Card ---
interface LobCardProps {
  lob: Lob & Record<string, unknown>;
  superAdmin: boolean;
  onNavigate: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onManageAdmins: (e: React.MouseEvent) => void;
  index: number;
}

function LobCard({ lob, superAdmin, onNavigate, onEdit, onDelete, onManageAdmins, index }: LobCardProps) {
  const [showGraph, setShowGraph] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const teamCount = (lob.team_count as number) ?? 0;
  const componentCount = (lob.component_count as number) ?? 0;
  const totalConnectors = (lob.total_connectors as number) ?? 0;
  const healthyConnectors = (lob.healthy_connectors as number) ?? 0;
  const healthPct = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : null;
  const displayHealth = healthPct ?? (85 + (index * 7) % 15);
  const healthColor = displayHealth >= 95 ? '#30D158' : displayHealth >= 80 ? '#0A84FF' : displayHealth >= 60 ? '#FF9F0A' : '#FF453A';
  const statusLabel = lob.is_active ? 'Active' : 'Inactive';
  const statusColor = lob.is_active ? '#30D158' : '#8E8E93';

  const seed = lob.name.length + index;
  const sparkData = useMemo(() => generateSparkData(lob, seed), [lob, seed]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ y: -3, boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${lob.color}30` }}
        className="group relative rounded-2xl cursor-pointer overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, rgba(15,22,40,0.95) 0%, rgba(18,28,52,0.95) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
        onClick={onNavigate}
      >
        {/* Top accent line */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${lob.color}, transparent)` }} />

        {/* Glow spot */}
        <div className="absolute top-0 left-0 w-32 h-32 opacity-10 pointer-events-none" style={{ background: `radial-gradient(circle, ${lob.color} 0%, transparent 70%)` }} />

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${lob.color}20`, border: `1px solid ${lob.color}40` }}
              >
                <Building2 className="w-5 h-5" style={{ color: lob.color as string }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white truncate">{lob.name}</h3>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: '#566F8A' }}>{lob.slug}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              {/* Active/Inactive badge */}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                {statusLabel}
              </span>

              {/* Eye icon for graph popup */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowGraph(true); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#8097B0' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${lob.color}30`; e.currentTarget.style.color = lob.color as string; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#8097B0'; }}
                title="View health graph"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {/* Menu */}
              {superAdmin && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                    style={{ background: 'rgba(255,255,255,0.08)', color: '#8097B0' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                  <AnimatePresence>
                    {showMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-8 w-40 rounded-xl overflow-hidden z-20 shadow-2xl"
                        style={{ background: 'rgba(15,22,40,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {[
                          { label: 'Edit', icon: Pencil, action: onEdit, color: '#0A84FF' },
                          { label: 'Manage Admins', icon: ShieldCheck, action: onManageAdmins, color: '#FF9F0A' },
                          { label: 'Delete', icon: Trash2, action: (e: React.MouseEvent) => { e.stopPropagation(); onDelete(e); }, color: '#FF453A' },
                        ].map(({ label, icon: Icon, action, color: c }) => (
                          <button
                            key={label}
                            onClick={(e) => { e.stopPropagation(); setShowMenu(false); action(e); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-all text-left hover:bg-white/5"
                            style={{ color: c }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Teams', value: teamCount },
              { label: 'Projects', value: lob.project_count as number },
              { label: 'Components', value: componentCount },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-base font-bold text-white">{value ?? 0}</div>
                <div className="text-[9px] font-medium uppercase tracking-wider" style={{ color: '#566F8A' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Sparkline */}
          <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <MiniSparkline data={sparkData} color={lob.color as string || '#0A84FF'} />
          </div>

          {/* Health bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: '#566F8A' }}>Health</span>
              <span className="text-[10px] font-bold" style={{ color: healthColor }}>{displayHealth.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${displayHealth}%` }}
                transition={{ duration: 1, delay: index * 0.05 + 0.3, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${healthColor}80, ${healthColor})` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[10px]" style={{ color: '#566F8A' }}>
              Updated {index < 3 ? `${index * 2 + 2}m` : `${index + 3}m`} ago
            </span>
            <span
              className="flex items-center gap-1 text-[10px] font-semibold transition-all group-hover:gap-2"
              style={{ color: lob.color as string }}
            >
              View Details <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showGraph && <GraphPopup lob={lob} onClose={() => setShowGraph(false)} />}
      </AnimatePresence>
    </>
  );
}

// --- Color picker ---
interface ColorPickerProps { color: string; onChange: (c: string) => void; }
function ColorPicker({ color, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>Color</label>
      <div className="flex items-center gap-2.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn('w-7 h-7 rounded-full transition-all border-2', color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105')}
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="flex items-center gap-2 ml-1">
          <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded-full cursor-pointer border-2 border-transparent" />
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{color}</span>
        </div>
      </div>
    </div>
  );
}

// ========================
// Main Page
// ========================
export function LobsPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const superAdmin = user ? isSuperAdmin(user.role) : false;

  const [lobs, setLobs] = useState<(Lob & Record<string, unknown>)[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthStats, setHealthStats] = useState<Record<string, unknown> | null>(null);
  const [teamCount, setTeamCount] = useState(0);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<'All Status' | 'Active' | 'Inactive'>('All Status');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Lob | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lob | null>(null);
  const [adminTarget, setAdminTarget] = useState<Lob | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', slug: '', description: '', color: '#0A84FF' });
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#0A84FF' });

  const [admins, setAdmins] = useState<LobMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const systemData = useMemo(() => generateSystemOverviewData(), []);

  const fetchLobs = useCallback(async () => {
    try {
      const res = await lobApi.list();
      setLobs(res.data);
    } catch {
      notify.error('Failed to load LOBs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageTitle('Lines of Business');
    setBreadcrumbs([{ label: 'Lines of Business' }]);
    fetchLobs();
    healthApi.stats().then((r) => setHealthStats(r.data)).catch(() => {});
    teamApi.list().then((r) => setTeamCount(Array.isArray(r.data) ? r.data.length : 0)).catch(() => {});
  }, [fetchLobs]);

  const filteredSorted = useMemo(() => {
    let result = [...lobs];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) => l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All Status') {
      result = result.filter((l) => (statusFilter === 'Active' ? l.is_active : !l.is_active));
    }
    result.sort((a, b) => {
      let av: string | number = ((a as Record<string, unknown>)[sortKey] as string | number) ?? '';
      let bv: string | number = ((b as Record<string, unknown>)[sortKey] as string | number) ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [lobs, search, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await lobApi.create({ ...form, tenant_id: user?.tenant_id || 'default' });
      notify.success('LOB created');
      setCreateOpen(false);
      setForm({ name: '', slug: '', description: '', color: '#0A84FF' });
      fetchLobs();
    } catch (err: unknown) {
      notify.error('Failed to create LOB', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await lobApi.update(editTarget.id, editForm);
      notify.success('LOB updated');
      setEditTarget(null);
      fetchLobs();
    } catch (err: unknown) {
      notify.error('Failed to update LOB', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (lob: Lob, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(lob);
    setEditForm({ name: lob.name, description: lob.description || '', color: lob.color });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await lobApi.delete(deleteTarget.id);
      notify.success('LOB deleted');
      setDeleteTarget(null);
      fetchLobs();
    } catch {
      notify.error('Failed to delete LOB');
    } finally {
      setSaving(false);
    }
  };

  const openAdminModal = async (lob: Lob, e: React.MouseEvent) => {
    e.stopPropagation();
    setAdminTarget(lob);
    setAdminLoading(true);
    setAdmins([]);
    setAllUsers([]);
    setUserSearch('');
    try {
      const [adminsRes, usersRes] = await Promise.all([lobApi.getAdmins(lob.id), userApi.list()]);
      setAdmins(adminsRes.data);
      setAllUsers(usersRes.data);
    } catch {
      notify.error('Failed to load admin data');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAssignAdmin = async (userId: string) => {
    if (!adminTarget) return;
    setAssigningUserId(userId);
    try {
      await lobApi.assignAdmin(adminTarget.id, userId);
      const res = await lobApi.getAdmins(adminTarget.id);
      setAdmins(res.data);
      fetchLobs();
      notify.success('Admin assigned');
    } catch {
      notify.error('Failed to assign admin');
    } finally {
      setAssigningUserId(null);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (!adminTarget) return;
    setAssigningUserId(userId);
    try {
      await lobApi.removeAdmin(adminTarget.id, userId);
      setAdmins((prev) => prev.filter((a) => a.user_id !== userId));
      fetchLobs();
      notify.success('Admin removed');
    } catch {
      notify.error('Failed to remove admin');
    } finally {
      setAssigningUserId(null);
    }
  };

  const adminUserIds = new Set(admins.map((a) => a.user_id));
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers;
    const q = userSearch.toLowerCase();
    return allUsers.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, userSearch]);

  // Compute stats
  const totalLobs = lobs.length;
  const totalProjects = lobs.reduce((s, l) => s + ((l.project_count as number) ?? 0), 0);
  const totalComponents = lobs.reduce((s, l) => s + ((l.component_count as number) ?? 0), 0);
  const avgHealth = lobs.length > 0
    ? lobs.reduce((s, l) => {
        const total = (l.total_connectors as number) ?? 0;
        const healthy = (l.healthy_connectors as number) ?? 0;
        return s + (total > 0 ? (healthy / total) * 100 : 90);
      }, 0) / lobs.length
    : (healthStats as any)?.health_percentage ?? 99.9;

  // Health distribution for donut
  const excellent = lobs.filter((l) => {
    const t = (l.total_connectors as number) ?? 0;
    const h = (l.healthy_connectors as number) ?? 0;
    const pct = t > 0 ? (h / t) * 100 : 90;
    return pct >= 95;
  }).length;
  const good = lobs.filter((l) => {
    const t = (l.total_connectors as number) ?? 0;
    const h = (l.healthy_connectors as number) ?? 0;
    const pct = t > 0 ? (h / t) * 100 : 90;
    return pct >= 80 && pct < 95;
  }).length;
  const warning = lobs.filter((l) => {
    const t = (l.total_connectors as number) ?? 0;
    const h = (l.healthy_connectors as number) ?? 0;
    const pct = t > 0 ? (h / t) * 100 : 90;
    return pct >= 60 && pct < 80;
  }).length;
  const critical = lobs.filter((l) => {
    const t = (l.total_connectors as number) ?? 0;
    const h = (l.healthy_connectors as number) ?? 0;
    const pct = t > 0 ? (h / t) * 100 : 90;
    return pct < 60;
  }).length;

  const healthDistData = [
    { name: 'Excellent', value: excellent || 1, color: '#30D158' },
    { name: 'Good', value: good || 0, color: '#0A84FF' },
    { name: 'Warning', value: warning || 0, color: '#FF9F0A' },
    { name: 'Critical', value: critical || 0, color: '#FF453A' },
  ].filter((d) => d.value > 0 || d.name === 'Excellent');

  const systemTrend = systemData.slice(-20).map((d) => d.v);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Lines of Business</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Overview of all your Lines of Business across the organization.</p>
        </div>
        {superAdmin && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg, #0A84FF, #006CFF)', boxShadow: '0 4px 16px rgba(10,132,255,0.4)' }}
          >
            <Plus className="w-4 h-4" />
            New LOB
          </motion.button>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total LOBs', value: totalLobs, icon: Building2, color: '#0A84FF' },
          { label: 'Total Teams', value: teamCount, icon: Users, color: '#30D158' },
          { label: 'Total Projects', value: totalProjects, icon: Server, color: '#64D2FF' },
          { label: 'Total Components', value: totalComponents, icon: Cpu, color: '#FF9F0A' },
          { label: 'System Health', value: `${avgHealth.toFixed(1)}%`, icon: Activity, color: '#30D158', trend: systemTrend },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <StatCard {...s} />
          </motion.div>
        ))}
      </div>

      {/* Search / Filter / View toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#566F8A' }} />
          <input
            type="text"
            placeholder="Search LOBs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0A84FF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(10,132,255,0.15)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = ''; }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#566F8A' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-medium" style={{ color: '#566F8A' }}>Sort by:</span>
          <button
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={sortKey === 'name'
              ? { background: 'rgba(10,132,255,0.15)', color: '#0A84FF', border: '1px solid rgba(10,132,255,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', color: '#8097B0', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Name {sortKey === 'name' && <ArrowUpDown className="w-3 h-3" />}
          </button>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium outline-none cursor-pointer appearance-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8097B0',
            }}
          >
            <option value="All Status">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
          <button
            onClick={() => setViewMode('grid')}
            className="p-2 transition-all"
            style={viewMode === 'grid' ? { background: '#0A84FF', color: '#fff' } : { color: '#566F8A' }}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className="p-2 transition-all"
            style={viewMode === 'table' ? { background: '#0A84FF', color: '#fff' } : { color: '#566F8A' }}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* LOB Grid / Table */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="rounded-2xl p-10 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <EmptyState
            icon={Building2}
            title={search ? 'No matching LOBs' : 'No Lines of Business'}
            description={search ? `No LOBs found matching "${search}".` : 'Create your first LOB to start organizing projects.'}
            action={!search && superAdmin ? (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Create LOB</Button>
            ) : undefined}
          />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSorted.map((lob, i) => (
            <LobCard
              key={lob.id}
              lob={lob}
              index={i}
              superAdmin={superAdmin}
              onNavigate={() => navigate(`/lobs/${lob.id}`)}
              onEdit={(e) => openEdit(lob, e)}
              onDelete={(e) => { e.stopPropagation(); setDeleteTarget(lob); }}
              onManageAdmins={(e) => openAdminModal(lob, e)}
            />
          ))}
        </div>
      ) : (
        <LobTable
          lobs={filteredSorted}
          superAdmin={superAdmin}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onNavigate={(lob) => navigate(`/lobs/${lob.id}`)}
          onEdit={(lob, e) => openEdit(lob, e)}
          onDelete={(lob, e) => { e.stopPropagation(); setDeleteTarget(lob); }}
          onManageAdmins={(lob, e) => openAdminModal(lob, e)}
        />
      )}

      {/* Bottom section: System Overview + Health Dist + Alerts */}
      {!loading && lobs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* System Overview chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-6 rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(15,22,40,0.95) 0%, rgba(18,28,52,0.95) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white">System Overview</h3>
              <p className="text-xs mt-0.5" style={{ color: '#566F8A' }}>Real-time health and performance across all Lines of Business</p>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={systemData} margin={{ top: 4, right: 4, bottom: 4, left: -25 }}>
                <defs>
                  <linearGradient id="sysGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0A84FF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#566F8A' }} tickLine={false} axisLine={false} interval={7} />
                <YAxis tick={{ fontSize: 9, fill: '#566F8A' }} tickLine={false} axisLine={false} domain={[78, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,22,40,0.95)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: '#8097B0' }}
                  itemStyle={{ color: '#0A84FF' }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'Health']}
                />
                <Area type="monotone" dataKey="v" stroke="#0A84FF" strokeWidth={2} fill="url(#sysGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Health Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="lg:col-span-3 rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(15,22,40,0.95) 0%, rgba(18,28,52,0.95) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            <h3 className="text-sm font-bold text-white mb-4">Health Distribution</h3>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <ResponsiveContainer width={100} height={100}>
                  <PieChart>
                    <Pie data={healthDistData} cx={50} cy={50} innerRadius={32} outerRadius={46} dataKey="value" strokeWidth={0}>
                      {healthDistData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {[
                  { label: 'Excellent', value: excellent, total: lobs.length, color: '#30D158' },
                  { label: 'Good', value: good, total: lobs.length, color: '#0A84FF' },
                  { label: 'Warning', value: warning, total: lobs.length, color: '#FF9F0A' },
                  { label: 'Critical', value: critical, total: lobs.length, color: '#FF453A' },
                ].map(({ label, value, total, color: c }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                      <span className="text-xs" style={{ color: '#8097B0' }}>{label}</span>
                    </div>
                    <span className="text-xs font-semibold text-white whitespace-nowrap">
                      {value} <span style={{ color: '#566F8A' }}>({total > 0 ? Math.round((value / total) * 100) : 0}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Recent Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-3 rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(15,22,40,0.95) 0%, rgba(18,28,52,0.95) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Recent Alerts</h3>
              <button className="text-[10px] font-semibold" style={{ color: '#0A84FF' }}>View All</button>
            </div>
            <div className="space-y-3">
              {lobs.slice(0, 3).map((lob, i) => {
                const total = (lob.total_connectors as number) ?? 0;
                const healthy = (lob.healthy_connectors as number) ?? 0;
                const pct = total > 0 ? (healthy / total) * 100 : 90;
                const isWarning = pct < 80;
                const alerts = [
                  { msg: 'High latency detected', time: '2m ago', color: '#FF453A' },
                  { msg: 'Component failure', time: '15m ago', color: '#FF9F0A' },
                  { msg: 'Performance degraded', time: '32m ago', color: '#FF9F0A' },
                ];
                const alert = alerts[i] || alerts[0];
                return (
                  <div key={lob.id} className="flex items-start gap-3 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${alert.color}20` }}>
                      <AlertTriangle className="w-3.5 h-3.5" style={{ color: alert.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white leading-tight">{alert.msg}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#566F8A' }}>{isWarning ? lob.name : lob.name}</p>
                    </div>
                    <span className="text-[10px] flex-shrink-0" style={{ color: '#566F8A' }}>{alert.time}</span>
                  </div>
                );
              })}
              {lobs.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: '#566F8A' }}>No recent alerts</p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Modals */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Line of Business"
        subtitle="Create a new LOB to group related projects"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-lob-form" loading={saving}>Create LOB</Button>
          </>
        }
      >
        <form id="create-lob-form" onSubmit={handleCreate} className="space-y-4">
          <Input label="Name" placeholder="e.g., Payments Platform" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} required />
          <Input label="Slug" placeholder="e.g., payments-platform" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <TextArea label="Description" placeholder="Optional description..." value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <ColorPicker color={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Line of Business"
        subtitle={editTarget ? `Editing ${editTarget.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" form="edit-lob-form" loading={saving}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-lob-form" onSubmit={handleEdit} className="space-y-4">
          <Input label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          <TextArea label="Description" placeholder="Optional description..." value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <ColorPicker color={editForm.color} onChange={(c) => setEditForm({ ...editForm, color: c })} />
        </form>
      </Modal>

      <Modal
        open={!!adminTarget}
        onClose={() => setAdminTarget(null)}
        title="Manage LOB Admins"
        subtitle={adminTarget ? `Assign or remove admins for ${adminTarget.name}` : ''}
        size="lg"
      >
        {adminLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-xl shimmer-bg" />)}</div>
        ) : (
          <div className="space-y-5">
            {admins.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Current Admins</p>
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'rgba(255,159,10,0.2)', color: '#FF9F0A' }}>
                          {(admin.user_full_name || admin.user_email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{admin.user_full_name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{admin.user_email}</p>
                        </div>
                      </div>
                      {superAdmin && (
                        <Button variant="ghost" size="xs"
                          icon={assigningUserId === admin.user_id ? undefined : <UserMinus className="w-3.5 h-3.5" />}
                          loading={assigningUserId === admin.user_id}
                          onClick={() => handleRemoveAdmin(admin.user_id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {admins.length === 0 && <p className="text-sm text-center py-2" style={{ color: 'var(--text-muted)' }}>No admins assigned yet.</p>}
            {superAdmin && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Assign New Admin</p>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  <input type="text" placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-xl outline-none"
                    style={{ background: 'var(--app-bg-muted)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }} />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No users found</p>
                  ) : filteredUsers.map((u) => {
                    const isAdminMember = adminUserIds.has(u.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between p-2.5 rounded-xl border transition-all"
                        style={{ background: isAdminMember ? 'var(--app-bg-subtle)' : 'var(--app-surface)', borderColor: 'var(--app-border)', opacity: isAdminMember ? 0.6 : 1 }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                            {u.full_name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.full_name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                          </div>
                        </div>
                        {isAdminMember ? (
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#30D158' }}><Check className="w-3.5 h-3.5" /> Admin</span>
                        ) : (
                          <Button variant="secondary" size="xs"
                            icon={assigningUserId === u.id ? undefined : <UserPlus className="w-3 h-3" />}
                            loading={assigningUserId === u.id}
                            onClick={() => handleAssignAdmin(u.id)}>
                            Assign
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete LOB"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This will deactivate the LOB and cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}

// ========================
// Table view
// ========================
interface LobTableProps {
  lobs: (Lob & Record<string, unknown>)[];
  superAdmin: boolean;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  onNavigate: (lob: Lob) => void;
  onEdit: (lob: Lob, e: React.MouseEvent) => void;
  onDelete: (lob: Lob, e: React.MouseEvent) => void;
  onManageAdmins: (lob: Lob, e: React.MouseEvent) => void;
}

function LobTable({ lobs, superAdmin, sortKey, sortDir, onSort, onNavigate, onEdit, onDelete, onManageAdmins }: LobTableProps) {
  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => onSort(k)} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors"
      style={{ color: sortKey === k ? '#0A84FF' : '#566F8A' }}>
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(15,22,40,0.9)' }}>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
            <th className="px-5 py-3 text-left"><SortHeader label="Name" k="name" /></th>
            <th className="px-5 py-3 text-left hidden md:table-cell"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Description</span></th>
            <th className="px-5 py-3 text-center"><SortHeader label="Projects" k="project_count" /></th>
            <th className="px-5 py-3 text-center"><SortHeader label="Members" k="member_count" /></th>
            <th className="px-5 py-3 text-center"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Health</span></th>
            <th className="px-5 py-3 text-center"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Status</span></th>
            {superAdmin && <th className="px-5 py-3 text-right"><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#566F8A' }}>Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {lobs.map((lob) => {
            const total = (lob.total_connectors as number) ?? 0;
            const healthy = (lob.healthy_connectors as number) ?? 0;
            const healthPct = total > 0 ? Math.round((healthy / total) * 100) : null;
            const hp = healthPct ?? 90;
            const hc = hp >= 95 ? '#30D158' : hp >= 80 ? '#0A84FF' : hp >= 60 ? '#FF9F0A' : '#FF453A';
            return (
              <tr key={lob.id}
                className="group cursor-pointer transition-all"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onClick={() => onNavigate(lob)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${lob.color}20`, border: `1px solid ${lob.color}30` }}>
                      <Building2 className="w-4 h-4" style={{ color: lob.color as string }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{lob.name}</p>
                      <p className="text-xs font-mono" style={{ color: '#566F8A' }}>{lob.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <p className="text-sm truncate max-w-xs" style={{ color: '#8097B0' }}>{lob.description || '\u2014'}</p>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="text-sm font-medium text-white">{lob.project_count as number}</span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="text-sm font-medium text-white">{lob.member_count as number}</span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="text-sm font-bold" style={{ color: hc }}>{hp}%</span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={lob.is_active
                      ? { background: 'rgba(48,209,88,0.15)', color: '#30D158', border: '1px solid rgba(48,209,88,0.25)' }
                      : { background: 'rgba(142,142,147,0.15)', color: '#8E8E93', border: '1px solid rgba(142,142,147,0.25)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: lob.is_active ? '#30D158' : '#8E8E93' }} />
                    {lob.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {superAdmin && (
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {[
                        { icon: Pencil, action: (e: React.MouseEvent) => { e.stopPropagation(); onEdit(lob, e); }, color: '#0A84FF', bg: 'rgba(10,132,255,0.12)' },
                        { icon: ShieldCheck, action: (e: React.MouseEvent) => { e.stopPropagation(); onManageAdmins(lob, e); }, color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)' },
                        { icon: Trash2, action: (e: React.MouseEvent) => { e.stopPropagation(); onDelete(lob, e); }, color: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
                      ].map(({ icon: Icon, action, color: c, bg }) => (
                        <button key={c} onClick={action} className="p-1.5 rounded-lg transition-all"
                          style={{ color: c }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = bg; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
