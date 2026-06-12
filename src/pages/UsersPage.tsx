import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserPlus, Search, Shield, Filter, Eye, MoreVertical, 
  CheckCircle2, AlertCircle, ShieldCheck, Mail, MapPin, KeyRound, 
  ArrowRight, ShieldAlert, Activity
} from 'lucide-react';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SRE_DBA' | 'DEV_OPS' | 'SECURITY' | 'INFRA_LEAD';
  status: 'ACTIVE' | 'INACTIVE' | 'STANDBY';
  dcAccess: string[];
  permissions: string[];
  lastActive: string;
}

const INITIAL_USERS: UserItem[] = [
  {
    id: 'u-1',
    name: 'Sabbu (Admin)',
    email: 'sabbu.admin@live-lens.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    dcAccess: ['IBB1', 'IBB2', 'LHR1', 'HKG1'],
    permissions: ['ALL_PERMISSIONS', 'EXECUTE_FAILOVER', 'WRITE_AUTHORITY_SIM', 'USER_MANAGEMENT'],
    lastActive: 'Just now',
  },
  {
    id: 'u-2',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@live-lens.com',
    role: 'SRE_DBA',
    status: 'ACTIVE',
    dcAccess: ['IBB1', 'IBB2'],
    permissions: ['EXECUTE_FAILOVER', 'ORACLE_DG_PROMOTION', 'MONGO_RS_RECONFIG'],
    lastActive: '5 mins ago',
  },
  {
    id: 'u-3',
    name: 'Michael Chen',
    email: 'michael.chen@live-lens.com',
    role: 'DEV_OPS',
    status: 'ACTIVE',
    dcAccess: ['LHR1'],
    permissions: ['VIEW_METRICS', 'SILENCE_ALERTS', 'OCP_POD_RESTART'],
    lastActive: '1 hour ago',
  },
  {
    id: 'u-4',
    name: 'Emma Watson',
    email: 'emma.watson@live-lens.com',
    role: 'INFRA_LEAD',
    status: 'STANDBY',
    dcAccess: ['HKG1'],
    permissions: ['GSLB_ROUTING_SHIFT', 'AVI_VIP_CONFIG', 'NETAPP_SNAPMIRROR_FAILOVER'],
    lastActive: '2 days ago',
  },
  {
    id: 'u-5',
    name: 'Alex Rivera',
    email: 'alex.rivera@live-lens.com',
    role: 'SECURITY',
    status: 'ACTIVE',
    dcAccess: ['ALL'],
    permissions: ['READ_AUDIT_LOG', 'REVOKE_AUTH_TOKEN', 'DRIFT_POLICY_VERIFICATION'],
    lastActive: '24 mins ago',
  },
];

const ROLE_CONFIGS = {
  ADMIN: { label: 'Administrator', color: 'var(--danger)', bg: 'var(--danger-subtle)' },
  SRE_DBA: { label: 'SRE / DBA Lead', color: 'var(--success)', bg: 'var(--success-subtle)' },
  DEV_OPS: { label: 'DevOps Engineer', color: 'var(--accent)', bg: 'var(--accent-subtle)' },
  SECURITY: { label: 'Security Specialist', color: 'var(--info)', bg: 'var(--info-subtle)' },
  INFRA_LEAD: { label: 'Infrastructure Lead', color: 'var(--warning)', bg: 'var(--warning-subtle)' },
};

export function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserItem[]>(INITIAL_USERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'ALL' || user.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getStatusColor = (status: UserItem['status']) => {
    if (status === 'ACTIVE') return 'var(--success)';
    if (status === 'STANDBY') return 'var(--warning)';
    return 'var(--text-muted)';
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="rounded-3xl p-6 border relative overflow-hidden"
        style={{ background: 'var(--map-container-bg)', borderColor: 'var(--app-border)', boxShadow: 'var(--shadow-md)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-[var(--accent)]" />
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                Access Control & Identity
              </span>
            </div>
            <h1 className="text-[28px] font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
              User & Permissions <span style={{ color: 'var(--accent)' }}>Directory</span>
            </h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-2">
              Manage operators, grant write authorities, and customize data center access levels.
            </p>
          </div>
          <button 
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wider text-white transition-all bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
          >
            <UserPlus className="w-4 h-4" /> Add Operator
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Operators', value: users.length, icon: Users, color: 'var(--accent)' },
          { label: 'Active Sessions', value: users.filter(u => u.status === 'ACTIVE').length, icon: Activity, color: 'var(--success)' },
          { label: 'System Admins', value: users.filter(u => u.role === 'ADMIN').length, icon: ShieldAlert, color: 'var(--danger)' },
          { label: 'Authorized for Failovers', value: users.filter(u => u.permissions.includes('EXECUTE_FAILOVER')).length, icon: KeyRound, color: 'var(--warning)' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-4 flex items-center justify-between border"
            style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">{stat.label}</span>
              <p className="text-[22px] font-extrabold mt-1" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}15` }}>
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter and Table Container */}
      <div className="rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        {/* Controls header */}
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-2 min-w-[280px] px-3 py-1.5 rounded-xl border bg-[var(--app-bg-subtle)]" style={{ borderColor: 'var(--app-border)' }}>
            <Search className="w-4 h-4 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-0 outline-none text-[12px] text-[var(--text-primary)] w-full placeholder-[var(--text-muted)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setSelectedRole('ALL')}
                className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all"
                style={selectedRole === 'ALL' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)', background: 'transparent' }}
              >
                All
              </button>
              {Object.keys(ROLE_CONFIGS).map(roleKey => (
                <button 
                  key={roleKey}
                  onClick={() => setSelectedRole(roleKey)}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all"
                  style={selectedRole === roleKey ? { background: ROLE_CONFIGS[roleKey as keyof typeof ROLE_CONFIGS].color, color: '#fff' } : { color: 'var(--text-muted)', background: 'transparent' }}
                >
                  {roleKey.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--app-surface)' }}>
              {['Operator Name', 'Role', 'Status', 'Data Center Bounds', 'Access Tokens / Privileges', 'Last Active', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--app-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const rCfg = ROLE_CONFIGS[user.role];
              return (
                <tr key={user.id} className="hover:bg-[var(--app-surface-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--app-border)' }}>
                  {/* Name and Email */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-[11px]" style={{ background: 'var(--accent)' }}>
                        {user.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold text-[var(--text-primary)]">{user.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {user.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  {/* Role Badge */}
                  <td className="px-4 py-3.5">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider"
                      style={{ background: rCfg.bg, color: rCfg.color, borderColor: rCfg.color }}>
                      {rCfg.label}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: getStatusColor(user.status) }} />
                      <span className="text-[11px] font-bold uppercase" style={{ color: getStatusColor(user.status) }}>
                        {user.status}
                      </span>
                    </div>
                  </td>
                  {/* DC Bounds */}
                  <td className="px-4 py-3.5">
                    <div className="flex gap-1 flex-wrap">
                      {user.dcAccess.map(dc => (
                        <span key={dc} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-0.5"
                          style={{ background: 'var(--app-bg-muted)', color: 'var(--text-secondary)', borderColor: 'var(--app-border)' }}>
                          <MapPin className="w-2.5 h-2.5" /> {dc}
                        </span>
                      ))}
                    </div>
                  </td>
                  {/* Access Tokens / Privileges */}
                  <td className="px-4 py-3.5">
                    <div className="flex gap-1 flex-wrap max-w-xs">
                      {user.permissions.map(perm => (
                        <span key={perm} className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--app-bg-muted)] text-[var(--text-muted)]">
                          {perm.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  {/* Last Active */}
                  <td className="px-4 py-3.5">
                    <span className="text-[11px] text-[var(--text-muted)]">{user.lastActive}</span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] hover:underline">
                        Edit
                      </button>
                      <span className="text-[var(--app-border-medium)]">|</span>
                      <button 
                        onClick={() => navigate('/audit')}
                        className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Audit logs"
                      >
                        Audit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
