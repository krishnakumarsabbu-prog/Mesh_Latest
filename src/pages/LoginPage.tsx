import React, { useState, useEffect, memo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Zap, Eye, EyeOff, ArrowRight, Shield, Activity,
  ChevronDown, Check, Copy, Layers, Sparkles, User, Lock, Mail,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';

const FEATURES = [
  { icon: Shield, label: 'Enterprise RBAC', desc: 'Role-based access control across teams', color: '#00E599', glow: 'rgba(0,229,153,0.15)' },
  { icon: Activity, label: 'Real-time Health', desc: 'Live monitoring of all connectors', color: '#3B82F6', glow: 'rgba(59,130,246,0.15)' },
  { icon: Layers, label: 'Multi-LOB Observability', desc: 'Manage all lines of business in one place', color: '#F59E0B', glow: 'rgba(245,158,11,0.15)' },
];

interface DemoAccount {
  role: UserRole;
  label: string;
  email: string;
  password: string;
  description: string;
  accent: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'super_admin', label: 'Super Admin', email: 'superadmin@livelens.ai', password: 'superadmin123', description: 'Full platform access, manage all users & settings', accent: '#EF4444' },
  { role: 'admin', label: 'Admin', email: 'admin@livelens.ai', password: 'admin123', description: 'Broad platform access across LOBs and projects', accent: '#F59E0B' },
  { role: 'lob_admin', label: 'LOB Admin', email: 'lobadmin@livelens.ai', password: 'lobadmin123', description: 'Manages a Line of Business and its projects', accent: '#F97316' },
  { role: 'project_admin', label: 'Project Admin', email: 'projectadmin@livelens.ai', password: 'projectadmin123', description: 'Manages connectors and health within a project', accent: '#3B82F6' },
  { role: 'analyst', label: 'Analyst', email: 'analyst@livelens.ai', password: 'analyst123', description: 'Read access to analytics, health reports & dashboards', accent: '#14B8A6' },
  { role: 'viewer', label: 'Viewer', email: 'viewer@livelens.ai', password: 'viewer123', description: 'Read-only access to assigned resources', accent: '#6B7280' },
  { role: 'project_user', label: 'Project User', email: 'user@livelens.ai', password: 'user123', description: 'Interact with assigned project data and connectors', accent: '#00E599' },
];

type Mode = 'login' | 'register';

const GlowOrb = memo(function GlowOrb({ x, y, size, color, opacity }: { x: string; y: string; size: string; color: string; opacity: number }) {
  return (
    <div className="absolute rounded-full pointer-events-none" style={{ left: x, top: y, width: size, height: size, background: `radial-gradient(circle, ${color} 0%, transparent 70%)`, opacity, transform: 'translate(-50%, -50%)' }} />
  );
});

const AnimatedGrid = memo(function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id="lgrid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#lgrid)" />
      </svg>
    </div>
  );
});

const FeatureRow = memo(function FeatureRow({ feature, delay }: { feature: typeof FEATURES[0]; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const Icon = feature.icon;
  return (
    <div
      className="flex items-center gap-3.5 p-3.5 rounded-2xl transition-all duration-200 cursor-default animate-fade-in-up"
      style={{
        animationDelay: `${delay}ms`,
        background: hovered ? `radial-gradient(ellipse at left, ${feature.glow}, rgba(255,255,255,0.03) 70%)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
        transform: hovered ? 'translateX(4px)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${feature.glow}`, border: `1px solid ${feature.color}30` }}>
        <Icon className="w-4 h-4" style={{ color: feature.color }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white leading-tight">{feature.label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{feature.desc}</p>
      </div>
    </div>
  );
});

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  autoComplete?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

const Field = memo(function Field({ id, label, type, value, onChange, placeholder, required, autoComplete, icon, suffix }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: focused ? '#00E599' : 'rgba(255,255,255,0.25)', transition: 'color 150ms ease' }}>
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="w-full py-3 text-sm rounded-xl outline-none transition-all duration-150"
          style={{
            paddingLeft: icon ? '2.75rem' : '1rem',
            paddingRight: suffix ? '3rem' : '1rem',
            background: focused ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${focused ? 'rgba(0,229,153,0.45)' : 'rgba(255,255,255,0.08)'}`,
            boxShadow: focused ? '0 0 0 3px rgba(0,229,153,0.08)' : 'none',
            color: '#F9FAFB',
          }}
        />
        {suffix && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{suffix}</div>}
      </div>
    </div>
  );
});

interface RoleSelectorProps {
  selected: DemoAccount | null;
  onSelect: (a: DemoAccount) => void;
}

const RoleSelector = memo(function RoleSelector({ selected, onSelect }: RoleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.45)' }}>Quick Access</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150"
          style={{
            background: open ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${open ? 'rgba(0,229,153,0.45)' : 'rgba(255,255,255,0.08)'}`,
            boxShadow: open ? '0 0 0 3px rgba(0,229,153,0.08)' : 'none',
          }}
        >
          {selected ? (
            <>
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0" style={{ background: selected.accent + '20', color: selected.accent, border: `1px solid ${selected.accent}35` }}>{selected.label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#F9FAFB' }}>{selected.email}</p>
                <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{selected.description}</p>
              </div>
            </>
          ) : (
            <span className="text-sm flex-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Choose a demo role to auto-fill credentials</span>
          )}
          <ChevronDown className={cn('w-4 h-4 flex-shrink-0 transition-transform duration-200', open && 'rotate-180')} style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl overflow-hidden animate-dropdown-in" style={{ background: 'rgba(13,17,23,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 48px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)' }}>
            <div className="max-h-60 overflow-y-auto py-1 scrollbar-none">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => { onSelect(account); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 transition-all duration-100 text-left"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0" style={{ background: account.accent + '20', color: account.accent, border: `1px solid ${account.accent}35` }}>{account.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: '#D1D5DB' }}>{account.email}</p>
                    <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{account.description}</p>
                  </div>
                  {selected?.role === account.role && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#00E599' }} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {selected && (
        <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: selected.accent + '0F', border: `1px solid ${selected.accent}25` }}>
          <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: selected.accent + 'AA' }}>Credentials</p>
          {(['email', 'password'] as const).map((field) => (
            <div key={field} className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>{field}</p>
                <p className="text-xs font-mono font-semibold" style={{ color: selected.accent }}>{selected[field]}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(selected[field], field)}
                className="p-1.5 rounded-lg transition-all duration-150"
                style={{ color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = selected.accent; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
              >
                {copied === field ? <Check className="w-3 h-3" style={{ color: '#00E599' }} /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  label: string;
}

const SubmitButton = memo(function SubmitButton({ loading, label, ...props }: SubmitButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="relative w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
      style={{
        background: hovered ? 'linear-gradient(135deg, #00C97F 0%, #009E6A 100%)' : 'linear-gradient(135deg, #00E599 0%, #00C97F 100%)',
        boxShadow: hovered ? '0 6px 28px rgba(0,229,153,0.45)' : '0 3px 14px rgba(0,229,153,0.25)',
        color: '#0A1014',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 60%)' }} />
      {loading ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight className="w-4 h-4" style={{ transform: hovered ? 'translateX(2px)' : 'none', transition: 'transform 150ms ease' }} />
        </>
      )}
    </button>
  );
});

const ModeToggle = memo(function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="relative flex p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-250"
        style={{
          left: mode === 'login' ? '4px' : 'calc(50%)',
          background: 'rgba(255,255,255,0.09)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
      <button
        type="button"
        onClick={() => onChange('login')}
        className="relative flex-1 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 z-10"
        style={{ color: mode === 'login' ? '#F9FAFB' : 'rgba(255,255,255,0.3)' }}
      >
        Sign In
      </button>
      <button
        type="button"
        onClick={() => onChange('register')}
        className="relative flex-1 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 z-10"
        style={{ color: mode === 'register' ? '#F9FAFB' : 'rgba(255,255,255,0.3)' }}
      >
        Register
      </button>
    </div>
  );
});

export function LoginPage() {
  const { isAuthenticated, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [selectedDemo, setSelectedDemo] = useState<DemoAccount | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.documentElement.classList.add('dark');
  }, []);

  if (isAuthenticated) return <Navigate to="/runtime-location" replace />;

  const handleDemoSelect = (account: DemoAccount) => {
    setSelectedDemo(account);
    setForm((f) => ({ ...f, email: account.email, password: account.password }));
    setError('');
  };

  const handleModeChange = (m: Mode) => {
    setMode(m);
    setError('');
    setSelectedDemo(null);
    setShowPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login(form.email, form.password)
        : await authApi.register(form.email, form.full_name, form.password);
      setAuth(res.data.user, res.data.access_token, res.data.refresh_token);
      notify.success(`Welcome${res.data.user.full_name ? `, ${res.data.user.full_name.split(' ')[0]}` : ''}!`);
      navigate('/runtime-location');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Something went wrong. Please try again.';
      setError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: '#0C1018' }}>
      <div className="hidden lg:flex flex-col w-[480px] xl:w-[540px] flex-shrink-0 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(150deg, #07101A 0%, #0A1828 55%, #071420 100%)' }} />
        <GlowOrb x="65%" y="18%" size="420px" color="rgba(0,229,153,0.12)" opacity={1} />
        <GlowOrb x="15%" y="72%" size="320px" color="rgba(59,130,246,0.09)" opacity={1} />
        <GlowOrb x="88%" y="55%" size="220px" color="rgba(245,158,11,0.06)" opacity={1} />
        <AnimatedGrid />
        <div className="absolute bottom-20 right-10 pointer-events-none">
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute rounded-full border" style={{ width: `${(i + 1) * 32}px`, height: `${(i + 1) * 32}px`, borderColor: '#00E599', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0, animation: `signalPulse 3s ease-out ${i * 0.8}s infinite` }} />
          ))}
          <div className="relative w-2.5 h-2.5 rounded-full" style={{ background: '#00E599', boxShadow: '0 0 10px #00E599' }} />
        </div>
        <div className="relative z-10 flex flex-col h-full px-10 xl:px-12 py-10">
          <div className={cn('flex items-center gap-3', mounted && 'animate-fade-in-up')} style={{ animationDelay: '0ms' }}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00E599 0%, #00C97F 100%)', boxShadow: '0 4px 20px rgba(0,229,153,0.4)' }}>
              <Eye className="w-5 h-5 text-[#0A1014]" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] tracking-tight leading-tight">LiveLens</p>
              <p className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>Unified Application Health Intelligence</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center mt-8">
            <div className={cn(mounted && 'animate-fade-in-up')} style={{ animationDelay: '80ms' }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5" style={{ background: 'rgba(0,229,153,0.09)', border: '1px solid rgba(0,229,153,0.22)' }}>
                <Sparkles className="w-3 h-3" style={{ color: '#00E599' }} />
                <span className="text-[11px] font-semibold tracking-wide" style={{ color: '#00E599' }}>AI-Powered Observability</span>
              </div>
              <h2 className="font-bold text-white leading-[1.1] tracking-tight mb-4" style={{ fontSize: 'clamp(1.9rem, 3.2vw, 2.5rem)' }}>
                Enterprise Health<br />Monitoring<br />
                <span style={{ background: 'linear-gradient(135deg, #00E599 0%, #3B82F6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>at Scale</span>
              </h2>
              <p className="text-[13.5px] leading-relaxed max-w-[270px] mb-7" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Unified visibility across all your Lines of Business, projects, and service connectors.
              </p>
            </div>
            <div className="space-y-2.5">
              {FEATURES.map((f, i) => <FeatureRow key={f.label} feature={f} delay={160 + i * 70} />)}
            </div>
            <div className={cn('mt-7 rounded-2xl p-4', mounted && 'animate-fade-in-up')} style={{ animationDelay: '400ms', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Demo Roles Available</p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((a) => (
                  <span key={a.role} className="text-[10px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)' }}>{a.label}</span>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[11px] mt-6" style={{ color: 'rgba(255,255,255,0.18)' }}>&copy; {new Date().getFullYear()} LiveLens. All rights reserved.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 70% at 75% 15%, rgba(0,229,153,0.04) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 15% 85%, rgba(59,130,246,0.03) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,229,153,0.12) 35%, rgba(59,130,246,0.12) 65%, transparent 100%)' }} />

        <div className="absolute pointer-events-none" style={{ top: '5%', right: '4%', opacity: mounted ? 1 : 0, transition: 'opacity 0.8s ease 0.7s' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,229,153,0.07)', border: '1px solid rgba(0,229,153,0.16)', backdropFilter: 'blur(12px)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00E599' }} />
            <span className="text-[10px] font-semibold tracking-wide" style={{ color: '#00E599' }}>All systems operational</span>
          </div>
        </div>

        <div className={cn('relative w-full max-w-[400px]', mounted && 'animate-auth-panel-in')}>
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00E599, #00C97F)', boxShadow: '0 4px 12px rgba(0,229,153,0.3)' }}>
              <Eye className="w-4 h-4 text-[#0A1014]" strokeWidth={2.5} />
            </div>
            <p className="font-bold" style={{ color: '#F9FAFB' }}>LiveLens</p>
          </div>

          <div className="mb-6">
            <h1 className="font-bold tracking-tight leading-tight mb-1.5" style={{ fontSize: 'clamp(1.6rem, 2.8vw, 1.95rem)', color: '#F9FAFB' }}>
              {mode === 'login' ? (
                <>Welcome{' '}<span style={{ background: 'linear-gradient(135deg, #00E599 0%, #3B82F6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>back</span></>
              ) : 'Create account'}
            </h1>
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {mode === 'login' ? 'Sign in to your workspace' : 'Get started with LiveLens'}
            </p>
          </div>

          <ModeToggle mode={mode} onChange={handleModeChange} />

          <div className={cn('mt-5 rounded-2xl', shake && 'animate-error-shake')} style={{ padding: '1px', background: 'linear-gradient(135deg, rgba(0,229,153,0.18) 0%, rgba(255,255,255,0.05) 45%, rgba(59,130,246,0.12) 100%)', boxShadow: '0 28px 64px rgba(0,0,0,0.65)' }}>
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(11,16,24,0.96)', backdropFilter: 'blur(24px)' }}>
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'login' && <RoleSelector selected={selectedDemo} onSelect={handleDemoSelect} />}

                {mode === 'register' && (
                  <Field
                    id="full_name"
                    label="Full Name"
                    type="text"
                    value={form.full_name}
                    onChange={(v) => setForm({ ...form, full_name: v })}
                    placeholder="Your full name"
                    required
                    autoComplete="name"
                    icon={<User className="w-4 h-4" />}
                  />
                )}

                <Field
                  id="email"
                  label="Email Address"
                  type="email"
                  value={form.email}
                  onChange={(v) => { setForm({ ...form, email: v }); if (selectedDemo) setSelectedDemo(null); }}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  icon={<Mail className="w-4 h-4" />}
                />

                <Field
                  id="password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(v) => { setForm({ ...form, password: v }); if (selectedDemo) setSelectedDemo(null); }}
                  placeholder={mode === 'login' ? 'Your password' : 'Create a password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  icon={<Lock className="w-4 h-4" />}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="p-0.5 transition-colors duration-150"
                      style={{ color: 'rgba(255,255,255,0.28)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#9CA3AF'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)'; }}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                {error && (
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.18)' }}>
                    <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#EF4444' }}>
                      <span className="text-white text-[9px] font-bold">!</span>
                    </div>
                    <p className="text-sm leading-snug" style={{ color: '#FCA5A5' }}>{error}</p>
                  </div>
                )}

                {mode === 'login' && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      className="text-[12px] font-medium transition-colors duration-150"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#00E599'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <div className="pt-0.5">
                  <SubmitButton
                    type="submit"
                    loading={loading}
                    label={mode === 'login' ? 'Sign in to workspace' : 'Create account'}
                  />
                </div>
              </form>
            </div>
          </div>

          <p className="text-center text-[11.5px] mt-5" style={{ color: 'rgba(255,255,255,0.18)' }}>
            By continuing, you agree to our{' '}
            <span
              className="cursor-pointer transition-colors duration-150"
              style={{ color: 'rgba(255,255,255,0.32)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#00E599'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.32)'; }}
            >Terms of Service</span>
            {' '}&amp;{' '}
            <span
              className="cursor-pointer transition-colors duration-150"
              style={{ color: 'rgba(255,255,255,0.32)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#00E599'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.32)'; }}
            >Privacy Policy</span>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes signalPulse {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0.7; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
