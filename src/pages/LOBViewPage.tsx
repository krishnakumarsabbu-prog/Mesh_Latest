import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, Server, Database, Siren, Layers, Cpu, ShieldCheck, 
  Search, ChevronRight, ChevronDown, Settings, Expand, ZoomIn, ZoomOut,
  RefreshCw, Download, Star, ExternalLink, Activity, AlertTriangle, 
  CheckCircle2, Info, ArrowRight, Play, Check, Network, Clock,
  Filter, HelpCircle, Laptop, ShieldAlert, Wifi, Terminal, MapPin
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/utils';

// ==========================================
// TYPES & DATA STRUCTURES
// ==========================================

interface LOBNode {
  id: string;
  name: string;
  type: 'LOB' | 'PLATFORM' | 'GROUP' | 'COMPONENT';
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  role?: string;
  stats?: {
    apps: number;
    components: number;
    dataSources: number;
    confidence: number; // percentage
  };
  children?: LOBNode[];
}

const LOB_HIERARCHY_DATA: LOBNode[] = [
  {
    id: 'retail-banking',
    name: 'Retail Banking',
    type: 'LOB',
    status: 'HEALTHY',
    stats: { apps: 6, components: 12, dataSources: 65, confidence: 98 },
    children: [
      {
        id: 'digital-banking',
        name: 'Digital Banking Platform',
        type: 'PLATFORM',
        status: 'HEALTHY',
        stats: { apps: 4, components: 9, dataSources: 32, confidence: 96 },
        children: [
          {
            id: 'cust-exp',
            name: 'Customer Experience',
            type: 'GROUP',
            status: 'HEALTHY',
            stats: { apps: 2, components: 5, dataSources: 18, confidence: 98 },
            children: [
              { id: 'web-banking', name: 'Web Banking', type: 'COMPONENT', status: 'HEALTHY', role: 'Frontend' },
              { id: 'mobile-banking', name: 'Mobile Banking', type: 'COMPONENT', status: 'HEALTHY', role: 'Mobile App' },
              { id: 'api-gateway', name: 'API Gateway', type: 'COMPONENT', status: 'HEALTHY', role: 'Gateway' },
              { id: 'auth-service', name: 'Auth Service', type: 'COMPONENT', status: 'HEALTHY', role: 'Service' },
              { id: 'notif-service', name: 'Notification Service', type: 'COMPONENT', status: 'HEALTHY', role: 'Service' }
            ]
          },
          {
            id: 'acct-mgt',
            name: 'Account Management',
            type: 'GROUP',
            status: 'HEALTHY',
            stats: { apps: 1, components: 2, dataSources: 8, confidence: 97 },
            children: [
              { id: 'acct-dash', name: 'Account Dashboard', type: 'COMPONENT', status: 'HEALTHY', role: 'Frontend' },
              { id: 'acct-service', name: 'Account Service', type: 'COMPONENT', status: 'HEALTHY', role: 'Service' }
            ]
          },
          {
            id: 'payments',
            name: 'Payments',
            type: 'GROUP',
            status: 'DEGRADED',
            stats: { apps: 1, components: 2, dataSources: 6, confidence: 97 },
            children: [
              { id: 'transfer-portal', name: 'Transfer Portal', type: 'COMPONENT', status: 'HEALTHY', role: 'Frontend' },
              { id: 'payment-service', name: 'Payment Service', type: 'COMPONENT', status: 'DEGRADED', role: 'Service' }
            ]
          },
          {
            id: 'reporting',
            name: 'Reporting',
            type: 'GROUP',
            status: 'UNKNOWN',
            stats: { apps: 0, components: 0, dataSources: 0, confidence: 0 }
          }
        ]
      }
    ]
  },
  {
    id: 'corp-banking',
    name: 'Corporate Banking',
    type: 'LOB',
    status: 'HEALTHY',
    stats: { apps: 5, components: 11, dataSources: 48, confidence: 96 }
  },
  {
    id: 'wealth-mgt',
    name: 'Wealth Management',
    type: 'LOB',
    status: 'HEALTHY',
    stats: { apps: 5, components: 10, dataSources: 42, confidence: 95 }
  },
  {
    id: 'risk-compliance',
    name: 'Risk & Compliance',
    type: 'LOB',
    status: 'HEALTHY',
    stats: { apps: 4, components: 8, dataSources: 36, confidence: 96 }
  },
  {
    id: 'ins-services',
    name: 'Insurance Services',
    type: 'LOB',
    status: 'HEALTHY',
    stats: { apps: 4, components: 9, dataSources: 39, confidence: 97 }
  }
];

// Flat structure representation for easy detail lookup
interface LOBDetail {
  id: string;
  name: string;
  parentName?: string;
  description: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  environment: string;
  region: string;
  techStack: string[];
  confidence: number;
  deployments: { active: number; total: number; status: string };
  metrics: {
    traffic: string;
    errorRate: string;
    latency: string;
    sla: string;
    freshness: string;
  };
  componentsList: Array<{ name: string; type: string; status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'; rps: string; err: string; latency: string }>;
  dataSourcesList: Array<{ name: string; type: string; status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'; latency: string; throughput: string }>;
  recentEvents: Array<{ type: 'drift' | 'deploy' | 'alert' | 'success'; text: string; time: string }>;
}

const LOB_DETAILS: Record<string, LOBDetail> = {
  'digital-banking': {
    id: 'digital-banking',
    name: 'Digital Banking Platform',
    parentName: 'Retail Banking',
    description: 'Digital-first banking platform providing seamless banking experience to customers across web, mobile and partner channels.',
    status: 'HEALTHY',
    environment: 'Production',
    region: 'US-EAST-1',
    techStack: ['java', 'spring', 'kubernetes', 'docker', 'aws'],
    confidence: 98,
    deployments: { active: 4, total: 4, status: 'Healthy' },
    metrics: {
      traffic: '12.4K',
      errorRate: '0.02%',
      latency: '220 ms',
      sla: '99.98%',
      freshness: '< 5 sec'
    },
    componentsList: [
      { name: 'Web Banking', type: 'Frontend', status: 'HEALTHY', rps: '4.2K', err: '0.01%', latency: '85ms' },
      { name: 'Mobile Banking', type: 'Mobile App', status: 'HEALTHY', rps: '3.8K', err: '0.02%', latency: '110ms' },
      { name: 'API Gateway', type: 'Gateway', status: 'HEALTHY', rps: '8.4K', err: '0.01%', latency: '12ms' },
      { name: 'Auth Service', type: 'Service', status: 'HEALTHY', rps: '1.2K', err: '0.00%', latency: '45ms' },
      { name: 'Customer Service', type: 'Service', status: 'HEALTHY', rps: '2.1K', err: '0.02%', latency: '140ms' },
      { name: 'Account Service', type: 'Service', status: 'HEALTHY', rps: '1.8K', err: '0.03%', latency: '165ms' },
      { name: 'Payment Service', type: 'Service', status: 'DEGRADED', rps: '950', err: '0.12%', latency: '310ms' },
      { name: 'Notification Service', type: 'Service', status: 'HEALTHY', rps: '640', err: '0.01%', latency: '95ms' },
      { name: 'Partner Apps', type: 'External Integration', status: 'HEALTHY', rps: '450', err: '0.05%', latency: '180ms' }
    ],
    dataSourcesList: [
      { name: 'Customer DB', type: 'MongoDB', status: 'HEALTHY', latency: '4ms', throughput: '2.5K/s' },
      { name: 'Account DB', type: 'Oracle', status: 'HEALTHY', latency: '8ms', throughput: '1.9K/s' },
      { name: 'Transaction DB', type: 'PostgreSQL', status: 'HEALTHY', latency: '6ms', throughput: '1.1K/s' },
      { name: 'Cache', type: 'Redis Cluster', status: 'HEALTHY', latency: '0.8ms', throughput: '8.5K/s' },
      { name: 'Core Banking API', type: 'Mainframe Gateway', status: 'HEALTHY', latency: '48ms', throughput: '800/s' },
      { name: 'Payment Gateway', type: 'Visa/MC Net', status: 'DEGRADED', latency: '180ms', throughput: '350/s' },
      { name: 'KYC DB', type: 'Third Party API', status: 'HEALTHY', latency: '210ms', throughput: '150/s' }
    ],
    recentEvents: [
      { type: 'drift', text: 'Configuration drift resolved', time: '2m ago' },
      { type: 'deploy', text: 'New deployment detected', time: '15m ago' },
      { type: 'alert', text: 'High latency detected', time: '32m ago' },
      { type: 'success', text: 'Failover simulation completed', time: '1h ago' }
    ]
  },
  'retail-banking': {
    id: 'retail-banking',
    name: 'Retail Banking',
    description: 'Comprehensive retail banking business unit supporting card services, checking/savings, loans, and mortgages.',
    status: 'HEALTHY',
    environment: 'Production',
    region: 'US-EAST-1',
    techStack: ['java', 'spring', 'oracle', 'kubernetes', 'aws'],
    confidence: 98,
    deployments: { active: 12, total: 12, status: 'Healthy' },
    metrics: {
      traffic: '28.1K',
      errorRate: '0.04%',
      latency: '245 ms',
      sla: '99.95%',
      freshness: '< 5 sec'
    },
    componentsList: [
      { name: 'Digital Banking Platform', type: 'Platform', status: 'HEALTHY', rps: '12.4K', err: '0.02%', latency: '220ms' },
      { name: 'Card Processing Node', type: 'Backend', status: 'HEALTHY', rps: '8.1K', err: '0.01%', latency: '180ms' },
      { name: 'Mortgage App Portal', type: 'Frontend', status: 'HEALTHY', rps: '2.5K', err: '0.06%', latency: '290ms' }
    ],
    dataSourcesList: [
      { name: 'Customer DB', type: 'MongoDB', status: 'HEALTHY', latency: '4ms', throughput: '2.5K/s' },
      { name: 'Retail Oracle DB', type: 'Oracle DB', status: 'HEALTHY', latency: '12ms', throughput: '4.2K/s' }
    ],
    recentEvents: [
      { type: 'deploy', text: 'Card Processing Node v2.4.1 deployed', time: '40m ago' },
      { type: 'success', text: 'Scheduled DB Backup completed', time: '4h ago' }
    ]
  },
  'corp-banking': {
    id: 'corp-banking',
    name: 'Corporate Banking',
    description: 'Commercial services for business accounts, trade finance, corporate treasury management, and liquidity services.',
    status: 'HEALTHY',
    environment: 'Production',
    region: 'US-EAST-1 / EU-WEST-1',
    techStack: ['net', 'sqlserver', 'kubernetes', 'azure'],
    confidence: 96,
    deployments: { active: 8, total: 8, status: 'Healthy' },
    metrics: {
      traffic: '8.9K',
      errorRate: '0.01%',
      latency: '185 ms',
      sla: '99.99%',
      freshness: '< 1 sec'
    },
    componentsList: [
      { name: 'Treasury Dashboard', type: 'Frontend', status: 'HEALTHY', rps: '2.2K', err: '0.01%', latency: '110ms' },
      { name: 'Trade Finance API', type: 'Service', status: 'HEALTHY', rps: '1.5K', err: '0.00%', latency: '145ms' }
    ],
    dataSourcesList: [
      { name: 'Corporate DB', type: 'MSSQL Instance', status: 'HEALTHY', latency: '5ms', throughput: '2.1K/s' }
    ],
    recentEvents: [
      { type: 'success', text: 'TLS certificate renewed', time: '1d ago' }
    ]
  }
};

// Default details for LOBs that are not specifically mocked in detail
const DEFAULT_DETAILS = (id: string, name: string): LOBDetail => ({
  id,
  name,
  description: `${name} operations dashboard including real-time telemetry, mapping topology, configuration drift detection, and dependencies.`,
  status: 'HEALTHY',
  environment: 'Production',
  region: 'US-EAST-1',
  techStack: ['java', 'spring', 'kubernetes', 'aws'],
  confidence: 97,
  deployments: { active: 3, total: 3, status: 'Healthy' },
  metrics: {
    traffic: '5.2K',
    errorRate: '0.05%',
    latency: '260 ms',
    sla: '99.90%',
    freshness: '< 5 sec'
  },
  componentsList: [
    { name: `${name} Core API`, type: 'Service', status: 'HEALTHY', rps: '2.8K', err: '0.04%', latency: '210ms' },
    { name: `${name} Portal`, type: 'Frontend', status: 'HEALTHY', rps: '2.4K', err: '0.06%', latency: '310ms' }
  ],
  dataSourcesList: [
    { name: `${name} Primary DB`, type: 'Oracle', status: 'HEALTHY', latency: '10ms', throughput: '1.2K/s' }
  ],
  recentEvents: [
    { type: 'deploy', text: 'Initial cluster deployment', time: '3d ago' }
  ]
});

// Helper for status styling
const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'HEALTHY': return '#00E599'; // Emerald Neon
    case 'DEGRADED': return '#FF9F0A'; // Orange/Amber
    case 'UNHEALTHY': return '#FF453A'; // Red
    case 'UNKNOWN':
    default: return '#8E8E93'; // Muted Gray
  }
};

export function LOBViewPage() {
  const { theme } = useThemeStore();
  const isDark = theme === 'harness-dark' || theme === 'graphite' || theme === 'aurora';
  
  const setBreadcrumbs = useUIStore((s) => s.setBreadcrumbs);
  const setPageTitle = useUIStore((s) => s.setPageTitle);

  // States
  const [selectedLOBId, setSelectedLOBId] = useState('digital-banking');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'retail-banking': true,
    'digital-banking': true,
    'cust-exp': true
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'arch' | 'comp' | 'data' | 'signals' | 'topo' | 'events' | 'drift'>('arch');
  
  // Custom Controls Mock State
  const [coveragePercent, setCoveragePercent] = useState(96);
  const [incidentMode, setIncidentMode] = useState(false);
  const [diagramScale, setDiagramScale] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize page headers
  useEffect(() => {
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'LOB View' }
    ]);
    setPageTitle('LOB View');
  }, [setBreadcrumbs, setPageTitle]);

  // Actions
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleExpandAll = () => {
    const allIds: Record<string, boolean> = {};
    const traverse = (nodes: LOBNode[]) => {
      nodes.forEach(n => {
        if (n.children) {
          allIds[n.id] = true;
          traverse(n.children);
        }
      });
    };
    traverse(LOB_HIERARCHY_DATA);
    setExpandedNodes(allIds);
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  // Find LOB detail
  const currentDetail = useMemo(() => {
    return LOB_DETAILS[selectedLOBId] || DEFAULT_DETAILS(selectedLOBId, selectedLOBId.replace('-', ' '));
  }, [selectedLOBId]);

  // Filter tree nodes helper
  const filterTree = (nodes: LOBNode[], search: string): LOBNode[] => {
    if (!search) return nodes;
    
    return nodes
      .map(node => {
        const matchesName = node.name.toLowerCase().includes(search.toLowerCase());
        const filteredChildren = node.children ? filterTree(node.children, search) : undefined;
        const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;
        
        if (matchesName || hasMatchingChildren) {
          return {
            ...node,
            children: filteredChildren
          };
        }
        return null;
      })
      .filter(Boolean) as LOBNode[];
  };

  const filteredHierarchy = useMemo(() => {
    return filterTree(LOB_HIERARCHY_DATA, searchTerm);
  }, [searchTerm]);

  return (
    <div className="flex flex-col gap-6 w-full select-none">
      
      {/* ── TOP CUSTOM ACTION HEADER BAR (Aligns with Page Title) ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 -mt-2 bg-[var(--app-surface)] p-3 rounded-2xl border border-[var(--app-border)] shadow-sm">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[var(--accent)]" />
          <span className="text-[12px] font-bold text-[var(--text-secondary)]">Lines of Business Runtime Control</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Signal Coverage Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold" 
            style={{ background: 'rgba(0,229,153,0.08)', border: '1px solid rgba(0,229,153,0.2)', color: '#00E599' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E599] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E599]"></span>
            </span>
            Signal Coverage: {coveragePercent}%
          </div>

          {/* Incident Mode Toggle */}
          <button 
            onClick={() => setIncidentMode(!incidentMode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all border",
              incidentMode 
                ? "bg-[#FF453A] border-[#FF453A] text-white animate-pulse" 
                : "bg-transparent border-[var(--app-border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)]"
            )}
          >
            <Siren className="w-3.5 h-3.5" />
            {incidentMode ? 'Incident Mode: ACTIVE' : 'Incident Mode'}
          </button>

          {/* Refresh Button */}
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-all active:scale-95"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </button>

          {/* Export Button */}
          <button 
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* ── TOP STAT CARDS (6-Column grid) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'LOBs', value: 5, sub: 'Healthy 5', color: '#BF5AF2', icon: Building2 },
          { label: 'Applications', value: 28, sub: 'Running 26', color: '#0A84FF', icon: Server },
          { label: 'Components', value: 156, sub: 'Healthy 142', color: '#00E599', icon: Cpu },
          { label: 'Data Sources', value: 482, sub: 'Connected 471', color: '#FF9F0A', icon: Database },
          { 
            label: 'Avg Confidence', 
            value: '95%', 
            sub: 'High', 
            color: '#00E599', 
            icon: ShieldCheck, 
            isGauge: true 
          },
          { label: 'Incidents', value: 0, sub: 'Open', color: '#FF453A', icon: Siren }
        ].map((stat, i) => (
          <div 
            key={i} 
            className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden border bg-[var(--app-surface)] shadow-xs"
            style={{ borderColor: 'var(--app-border)' }}
          >
            {/* Color Accent line */}
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: stat.color }} />
            
            {/* Gauge or Icon */}
            {stat.isGauge ? (
              <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="20" cy="20" r="16" stroke="var(--app-border)" strokeWidth="3" fill="transparent" />
                  <circle cx="20" cy="20" r="16" stroke={stat.color} strokeWidth="3" fill="transparent" 
                    strokeDasharray={100} strokeDashoffset={5} />
                </svg>
                <span className="absolute text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</span>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}20` }}>
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
            )}

            <div>
              <p className="text-[20px] font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
                {stat.isGauge ? 'High' : stat.value}
              </p>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-1">{stat.label}</p>
              <p className="text-[11px] font-bold mt-0.5" style={{ color: stat.color }}>{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN WORKSPACE PANELS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* === LEFT SIDEBAR: LOB HIERARCHY (4 cols) === */}
        <div className="lg:col-span-3 flex flex-col gap-4 p-4 rounded-2xl border bg-[var(--app-surface)]" 
          style={{ borderColor: 'var(--app-border)' }}>
          
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-[var(--text-primary)]">LOB Hierarchy</h2>
            <Settings className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" />
          </div>

          {/* Search bar & tree controls */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-[var(--app-bg-subtle)]" style={{ borderColor: 'var(--app-border)' }}>
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <input 
                type="text" 
                placeholder="Search LOB, App, Component..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-0 outline-none text-[11px] text-[var(--text-primary)] w-full placeholder-[var(--text-muted)]"
              />
            </div>
            <button 
              onClick={handleExpandAll}
              className="px-2 py-1.5 rounded-lg border border-[var(--app-border)] text-[9px] font-bold bg-[var(--app-surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Expand All
            </button>
          </div>

          {/* Hierarchy Tree Rendering */}
          <div className="flex flex-col gap-1.5 max-h-[550px] overflow-y-auto pr-1">
            {filteredHierarchy.length === 0 ? (
              <div className="text-center py-8 text-[11.5px] text-[var(--text-muted)]">
                No matching units found
              </div>
            ) : (
              filteredHierarchy.map(node => (
                <TreeItem 
                  key={node.id} 
                  node={node} 
                  selectedId={selectedLOBId} 
                  expandedNodes={expandedNodes} 
                  onSelect={setSelectedLOBId} 
                  onToggleExpand={toggleExpand} 
                  level={0}
                />
              ))
            )}
          </div>

          {/* Tree Legend */}
          <div className="border-t pt-3 flex flex-wrap gap-2.5 items-center text-[10px] font-semibold text-[var(--text-muted)]" 
            style={{ borderColor: 'var(--app-border)' }}>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#00E599' }} /> Healthy</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#FF9F0A' }} /> Degraded</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#FF453A' }} /> Unhealthy</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#8E8E93' }} /> Unknown</div>
          </div>
        </div>

        {/* === RIGHT DETAILS WORKSPACE (9 cols) === */}
        <div className="lg:col-span-9 flex flex-col gap-4">
          
          {/* Node detail header */}
          <div className="p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden"
            style={{ borderColor: 'var(--app-border)' }}>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {currentDetail.parentName && (
                  <>
                    <span className="text-[12px] font-bold text-[var(--text-muted)]">{currentDetail.parentName}</span>
                    <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                  </>
                )}
                <h1 className="text-[20px] font-extrabold text-[var(--text-primary)] tracking-tight truncate leading-tight">
                  {currentDetail.name}
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase"
                  style={{ background: `${getStatusColor(currentDetail.status)}15`, color: getStatusColor(currentDetail.status), border: `1px solid ${getStatusColor(currentDetail.status)}30` }}>
                  {currentDetail.status}
                </span>
                <button className="p-1 rounded-lg hover:bg-[var(--app-surface-hover)] text-[var(--text-muted)] hover:text-amber-400 transition-colors">
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
              
              <p className="text-[12px] text-[var(--text-muted)] mt-2 max-w-xl leading-relaxed">
                {currentDetail.description}
              </p>

              <div className="flex items-center gap-4 mt-3 flex-wrap text-[11px] font-bold text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-muted)]">Environment:</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--success-subtle)] text-[#00B074] uppercase text-[9px]">{currentDetail.environment}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] font-normal">Region:</span> {currentDetail.region}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)] font-normal">Tech Stack:</span>
                  <div className="flex items-center gap-0.5">
                    {currentDetail.techStack.map(stack => (
                      <span key={stack} className="px-1 py-0.5 rounded bg-[var(--app-bg-muted)] text-[var(--text-primary)] text-[9px] uppercase">{stack}</span>
                    ))}
                  </div>
                  <ChevronDown className="w-3 h-3 text-[var(--text-muted)] cursor-pointer" />
                </div>
              </div>
            </div>

            {/* Right side KPIs inside Header */}
            <div className="flex items-center gap-4 flex-shrink-0 border-l pl-5 border-[var(--app-border)]">
              {/* Confidence Gauge */}
              <div className="flex flex-col items-center">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Runtime Confidence</span>
                <div className="relative w-16 h-16 flex items-center justify-center mt-1">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="var(--app-border)" strokeWidth="4" fill="transparent" />
                    <circle cx="32" cy="32" r="26" stroke="#00E599" strokeWidth="4" fill="transparent" 
                      strokeDasharray={163} strokeDashoffset={163 - (163 * currentDetail.confidence) / 100} />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{currentDetail.confidence}%</span>
                    <span className="text-[7px] text-[#00E599] font-bold uppercase">Excellent</span>
                  </div>
                </div>
              </div>

              {/* Deployments timeline */}
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Deployments</span>
                <span className="text-[18px] font-extrabold text-[var(--text-primary)] mt-1">
                  {currentDetail.deployments.active} / {currentDetail.deployments.total}
                </span>
                <span className="text-[9px] font-bold text-[#00E599] uppercase">Healthy</span>
                {/* Mini bar timeline */}
                <div className="flex items-center gap-0.5 mt-1">
                  <div className="h-1 w-4 rounded bg-[#00E599]" />
                  <div className="h-1 w-4 rounded bg-[#00E599]" />
                  <div className="h-1 w-4 rounded bg-[#00E599]" />
                  <div className="h-1 w-4 rounded bg-[#00E599]" />
                </div>
              </div>
            </div>

          </div>

          {/* Navigation tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--app-border)] overflow-x-auto scrollbar-none">
            {[
              { id: 'arch', label: 'Architecture View' },
              { id: 'comp', label: `Components (${currentDetail.componentsList.length})` },
              { id: 'data', label: `Data Sources (${currentDetail.dataSourcesList.length})` },
              { id: 'signals', label: 'Runtime Signals' },
              { id: 'topo', label: 'Topology' },
              { id: 'events', label: 'Events' },
              { id: 'drift', label: 'Drift Analysis' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-2.5 text-[12px] font-bold border-b-2 whitespace-nowrap transition-all",
                  activeTab === tab.id 
                    ? "border-[var(--accent)] text-[var(--accent)]" 
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab contents */}
          <div className="min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="w-full"
              >
                {activeTab === 'arch' && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    
                    {/* Flow Diagram (9 cols) */}
                    <div className="xl:col-span-9 p-5 rounded-2xl border bg-[var(--app-surface)] relative overflow-hidden flex flex-col justify-between"
                      style={{ borderColor: 'var(--app-border)' }}>
                      
                      {/* Diagram controls */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">LEGEND</div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setDiagramScale(prev => Math.min(prev + 0.1, 1.5))} className="p-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ZoomIn className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDiagramScale(prev => Math.max(prev - 0.1, 0.5))} className="p-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ZoomOut className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDiagramScale(1)} className="p-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Expand className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <div className="flex gap-4 items-stretch relative">
                        {/* Legend Sidebar */}
                        <div className="w-[110px] flex-shrink-0 flex flex-col gap-1.5 text-[9px] font-bold text-[var(--text-muted)] border-r pr-3 border-[var(--app-border)]">
                          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500" /> Application</div>
                          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500" /> Component</div>
                          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Data Store</div>
                          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> External System</div>
                          <div className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-[var(--text-muted)]" /> Data Flow</div>
                          <div className="flex items-center gap-1"><span className="w-3 h-px border-t border-solid border-[var(--text-muted)]" /> Control Flow</div>
                          <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" /> Healthy</div>
                          <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A]" /> Degraded</div>
                          <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#FF453A]" /> Unhealthy</div>
                        </div>

                        {/* Interactive flow board */}
                        <div className="flex-1 flex flex-col gap-5 overflow-auto items-center py-2"
                          style={{ transform: `scale(${diagramScale})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}>
                          
                          {/* CHANNELS LAYER */}
                          <div className="flex items-center gap-4">
                            <span className="text-[8px] uppercase tracking-wider text-[var(--text-muted)] font-bold absolute left-4">CHANNELS</span>
                            <div className="px-4 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-bold flex items-center gap-1.5 shadow-sm">
                              <Laptop className="w-3.5 h-3.5" /> Web Banking
                            </div>
                            <div className="px-4 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-bold flex items-center gap-1.5 shadow-sm relative">
                              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#00E599]" />
                              Mobile Banking
                            </div>
                            <div className="px-4 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-bold flex items-center gap-1.5 shadow-sm">
                              Partner Apps
                            </div>
                          </div>

                          {/* Arrow spacer */}
                          <div className="h-4 w-px border-l border-dashed border-[var(--app-border-medium)]" />

                          {/* API GATEWAY */}
                          <div className="w-[180px] px-4 py-2.5 rounded-xl border border-purple-500/40 bg-purple-500/15 text-center shadow-md relative">
                            <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-[#00E599]" />
                            <div className="text-[11px] font-extrabold text-purple-300 tracking-wider">API GATEWAY</div>
                          </div>

                          {/* Arrow spacer */}
                          <div className="h-4 w-px border-l border-dashed border-[var(--app-border-medium)]" />

                          {/* CORE SERVICES LAYER */}
                          <div className="flex flex-wrap justify-center gap-3">
                            {[
                              { name: 'Auth Service', type: 'Auth' },
                              { name: 'Customer Service', type: 'Customer' },
                              { name: 'Account Service', type: 'Account' },
                              { name: 'Payment Service', type: 'Payment', status: 'DEGRADED' },
                              { name: 'Notification Service', type: 'Notification' }
                            ].map((service, i) => (
                              <div key={i} className="px-3 py-2 rounded-xl border bg-purple-500/5 text-center min-w-[90px] shadow-sm relative"
                                style={{ borderColor: service.status === 'DEGRADED' ? '#FF9F0A' : 'rgba(168,85,247,0.2)' }}>
                                <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full" 
                                  style={{ background: service.status === 'DEGRADED' ? '#FF9F0A' : '#00E599' }} />
                                <div className="text-[9px] font-extrabold text-purple-200 truncate">{service.name}</div>
                                <div className="text-[7px] text-[var(--text-muted)] mt-0.5">{service.type}</div>
                              </div>
                            ))}
                          </div>

                          {/* Arrow spacer */}
                          <div className="h-4 w-px border-l border-dashed border-[var(--app-border-medium)]" />

                          {/* DATA LAYER */}
                          <div className="flex justify-center gap-4">
                            {[
                              { name: 'Customer DB', type: 'MongoDB', color: '#00E599' },
                              { name: 'Account DB', type: 'Oracle', color: '#00E599' },
                              { name: 'Transaction DB', type: 'PostgreSQL', color: '#00E599' },
                              { name: 'Cache', type: 'Redis Cluster', color: '#00E599' }
                            ].map((db, i) => (
                              <div key={i} className="flex flex-col items-center gap-1">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center border shadow-xs"
                                  style={{ background: `${db.color}08`, borderColor: `${db.color}40` }}>
                                  <Database className="w-4 h-4" style={{ color: db.color }} />
                                </div>
                                <div className="text-[8px] font-bold text-[var(--text-primary)]">{db.name}</div>
                                <div className="text-[7px] text-[var(--text-muted)]">{db.type}</div>
                              </div>
                            ))}
                          </div>

                          {/* Arrow spacer */}
                          <div className="h-4 w-px border-l border-dashed border-[var(--app-border-medium)]" />

                          {/* EXTERNAL SYSTEMS */}
                          <div className="flex justify-center gap-3 w-full border-t pt-4 border-dashed border-[var(--app-border)]">
                            {[
                              { name: 'Core Banking', type: 'Mainframe' },
                              { name: 'Payment Network', type: 'Visa / Mastercard' },
                              { name: 'KYC Service', type: 'Third Party' },
                              { name: 'Email/SMS', type: 'Notification' }
                            ].map((ext, i) => (
                              <div key={i} className="px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-center min-w-[95px]">
                                <div className="text-[9px] font-extrabold text-amber-300">{ext.name}</div>
                                <div className="text-[7px] text-[var(--text-muted)] mt-0.5">{ext.type}</div>
                              </div>
                            ))}
                          </div>

                        </div>
                      </div>

                    </div>

                    {/* Right summary cards (3 cols) */}
                    <div className="xl:col-span-3 flex flex-col gap-4">
                      
                      {/* Application Summary */}
                      <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-3"
                        style={{ borderColor: 'var(--app-border)' }}>
                        <div className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Application Summary</div>
                        
                        <div className="flex flex-col gap-2.5 text-[11px] font-bold">
                          <div className="flex justify-between items-center">
                            <span className="text-[var(--text-muted)] font-normal">Status:</span>
                            <span className="text-[#00E599] font-extrabold">HEALTHY</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[var(--text-muted)] font-normal">Active Sites:</span>
                            <span className="text-[var(--text-primary)]">2 (US-EAST-1, US-WEST-2)</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[var(--text-muted)] font-normal">Tech Stack:</span>
                            <div className="flex items-center gap-1 text-[9px]">
                              <span className="px-1 rounded bg-[var(--app-bg-muted)]">JAVA</span>
                              <span className="px-1 rounded bg-[var(--app-bg-muted)]">SPRING</span>
                              <span className="px-1 rounded bg-[var(--app-bg-muted)]">AWS</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[var(--text-muted)] font-normal">Owner:</span>
                            <span className="text-[var(--text-primary)]">Digital Platform Team</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[var(--text-muted)] font-normal">Last Updated:</span>
                            <span className="text-[var(--text-primary)] flex items-center gap-1"><Clock className="w-3 h-3 text-[var(--text-muted)]" /> 32 sec ago</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[var(--text-muted)] font-normal">Signals Correlated:</span>
                            <span className="text-[var(--text-primary)]">1.2M</span>
                          </div>
                        </div>
                      </div>

                      {/* Key Runtime Indicators */}
                      <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-3"
                        style={{ borderColor: 'var(--app-border)' }}>
                        <div className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Key Runtime Indicators</div>
                        
                        <div className="flex flex-col gap-3">
                          {[
                            { label: 'Traffic (RPS)', value: currentDetail.metrics.traffic, spark: [10, 15, 8, 12, 14, 18, 16] },
                            { label: 'Error Rate', value: currentDetail.metrics.errorRate, spark: [2, 1, 3, 2, 1, 0.5, 0.1] },
                            { label: 'Latency (P95)', value: currentDetail.metrics.latency, spark: [180, 210, 195, 230, 220, 215, 220] },
                            { label: 'SLA Compliance', value: currentDetail.metrics.sla, spark: [99, 99.5, 99.8, 99.9, 99.98, 99.98, 99.98] }
                          ].map((kpi, i) => (
                            <div key={i} className="flex justify-between items-center text-[11px] font-bold">
                              <div>
                                <p className="text-[var(--text-muted)] font-normal">{kpi.label}</p>
                                <p className="text-[14px] font-extrabold text-[var(--text-primary)] mt-0.5">{kpi.value}</p>
                              </div>
                              {/* Mini sparkline graph */}
                              <svg className="w-16 h-8 overflow-visible">
                                <path 
                                  d={`M ${kpi.spark.map((v, idx) => `${(idx / (kpi.spark.length - 1)) * 64} ${32 - (v / Math.max(...kpi.spark)) * 24}`).join(' L ')}`}
                                  fill="none" 
                                  stroke="#00E599" 
                                  strokeWidth="1.5" 
                                />
                              </svg>
                            </div>
                          ))}
                          <div className="flex justify-between items-center text-[11px] border-t pt-2 border-[var(--app-border)] font-bold">
                            <span className="text-[var(--text-muted)] font-normal">Data Freshness:</span>
                            <span className="text-[#00E599]">{currentDetail.metrics.freshness}</span>
                          </div>
                        </div>
                      </div>

                      {/* Recent Events */}
                      <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-3"
                        style={{ borderColor: 'var(--app-border)' }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Recent Events</span>
                          <button onClick={() => setActiveTab('events')} className="text-[9px] font-bold text-[var(--accent)] hover:underline">View All</button>
                        </div>

                        <div className="flex flex-col gap-2.5 max-h-[160px] overflow-y-auto">
                          {currentDetail.recentEvents.map((evt, i) => (
                            <div key={i} className="flex items-start gap-2 text-[10.5px] font-bold">
                              {evt.type === 'drift' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />}
                              {evt.type === 'deploy' && <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />}
                              {evt.type === 'alert' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />}
                              {evt.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />}
                              
                              <div className="flex-1 min-w-0">
                                <p className="text-[var(--text-primary)] leading-tight">{evt.text}</p>
                                <p className="text-[8.5px] text-[var(--text-muted)] mt-0.5">{evt.time}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {activeTab === 'comp' && (
                  <div className="p-5 rounded-2xl border bg-[var(--app-surface)]" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[12px] font-bold text-[var(--text-primary)]">Platform Components</div>
                      <span className="px-2.5 py-1 rounded bg-[var(--app-bg-muted)] text-[var(--text-muted)] text-[10px] font-bold">Total: {currentDetail.componentsList.length}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] font-bold">
                        <thead>
                          <tr className="border-b border-[var(--app-border)] text-[var(--text-muted)]">
                            <th className="py-2.5">Component Name</th>
                            <th className="py-2.5">Type</th>
                            <th className="py-2.5">Status</th>
                            <th className="py-2.5">Traffic (RPS)</th>
                            <th className="py-2.5">Error Rate</th>
                            <th className="py-2.5">Latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentDetail.componentsList.map((comp, idx) => (
                            <tr key={idx} className="border-b border-[var(--app-border)] last:border-0 hover:bg-[var(--app-surface-hover)]">
                              <td className="py-3 text-[var(--text-primary)]">{comp.name}</td>
                              <td className="py-3 text-[var(--text-secondary)]">{comp.type}</td>
                              <td className="py-3">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider"
                                  style={{ background: `${getStatusColor(comp.status)}15`, color: getStatusColor(comp.status) }}>
                                  <span className="w-1 h-1 rounded-full" style={{ background: getStatusColor(comp.status) }} />
                                  {comp.status}
                                </span>
                              </td>
                              <td className="py-3 text-[var(--text-primary)]">{comp.rps}</td>
                              <td className="py-3 text-[var(--text-primary)]">{comp.err}</td>
                              <td className="py-3 text-[var(--text-primary)]">{comp.latency}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'data' && (
                  <div className="p-5 rounded-2xl border bg-[var(--app-surface)]" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[12px] font-bold text-[var(--text-primary)]">Data Sources & Storage integrations</div>
                      <span className="px-2.5 py-1 rounded bg-[var(--app-bg-muted)] text-[var(--text-muted)] text-[10px] font-bold">Total: {currentDetail.dataSourcesList.length}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] font-bold">
                        <thead>
                          <tr className="border-b border-[var(--app-border)] text-[var(--text-muted)]">
                            <th className="py-2.5">Data Store Name</th>
                            <th className="py-2.5">Platform Type</th>
                            <th className="py-2.5">Status</th>
                            <th className="py-2.5">Avg Latency</th>
                            <th className="py-2.5">Throughput</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentDetail.dataSourcesList.map((ds, idx) => (
                            <tr key={idx} className="border-b border-[var(--app-border)] last:border-0 hover:bg-[var(--app-surface-hover)]">
                              <td className="py-3 text-[var(--text-primary)] flex items-center gap-2">
                                <Database className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                {ds.name}
                              </td>
                              <td className="py-3 text-[var(--text-secondary)]">{ds.type}</td>
                              <td className="py-3">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider"
                                  style={{ background: `${getStatusColor(ds.status)}15`, color: getStatusColor(ds.status) }}>
                                  <span className="w-1 h-1 rounded-full" style={{ background: getStatusColor(ds.status) }} />
                                  {ds.status}
                                </span>
                              </td>
                              <td className="py-3 text-[var(--text-primary)]">{ds.latency}</td>
                              <td className="py-3 text-[var(--text-primary)]">{ds.throughput}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'signals' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { name: 'Core API Latency', value: '45 ms', rate: '-2.4%', status: 'HEALTHY', type: 'Latency' },
                      { name: 'DB Replication Lag', value: '0.8 ms', rate: '0.0%', status: 'HEALTHY', type: 'Replication' },
                      { name: 'Gateway Error Rate', value: '0.01%', rate: '-5.1%', status: 'HEALTHY', type: 'Stability' },
                      { name: 'Payment Queue Depth', value: '482', rate: '+12%', status: 'DEGRADED', type: 'Queue' },
                      { name: 'Active CPU load', value: '42%', rate: '+1.5%', status: 'HEALTHY', type: 'Compute' },
                      { name: 'GSLB Heartbeat', value: 'Online', rate: '100%', status: 'HEALTHY', type: 'Ingress' }
                    ].map((sig, idx) => (
                      <div key={idx} className="p-4 rounded-xl border bg-[var(--app-surface)] flex flex-col gap-3 relative overflow-hidden"
                        style={{ borderColor: 'var(--app-border)' }}>
                        <div className="absolute right-3 top-3 w-2 h-2 rounded-full" style={{ background: getStatusColor(sig.status) }} />
                        
                        <div>
                          <div className="text-[12px] font-extrabold text-[var(--text-primary)]">{sig.name}</div>
                          <div className="text-[8.5px] font-bold text-[var(--text-muted)] uppercase mt-0.5">{sig.type}</div>
                        </div>

                        <div className="flex justify-between items-baseline mt-2">
                          <span className="text-[18px] font-extrabold text-[var(--text-primary)]">{sig.value}</span>
                          <span className="text-[10px] font-bold" style={{ color: sig.rate.startsWith('-') ? '#00E599' : '#FF9F0A' }}>{sig.rate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'topo' && (
                  <div className="p-5 rounded-2xl border bg-[var(--app-surface)] h-[400px] flex items-center justify-center relative overflow-hidden" 
                    style={{ borderColor: 'var(--app-border)' }}>
                    
                    <div className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Interactive Topology Mesh</div>

                    {/* Simple Mock Node Mesh Visualizer */}
                    <div className="relative w-full h-full max-w-lg flex items-center justify-center">
                      <svg className="absolute w-full h-full opacity-30 pointer-events-none">
                        <line x1="15%" y1="50%" x2="40%" y2="50%" stroke="var(--text-primary)" strokeWidth="1.5" />
                        <line x1="40%" y1="50%" x2="65%" y2="25%" stroke="var(--text-primary)" strokeWidth="1.5" />
                        <line x1="40%" y1="50%" x2="65%" y2="50%" stroke="var(--text-primary)" strokeWidth="1.5" />
                        <line x1="40%" y1="50%" x2="65%" y2="75%" stroke="var(--text-primary)" strokeWidth="1.5" />
                        <line x1="65%" y1="25%" x2="85%" y2="50%" stroke="var(--text-primary)" strokeWidth="1.5" />
                        <line x1="65%" y1="50%" x2="85%" y2="50%" stroke="var(--text-primary)" strokeWidth="1.5" />
                        <line x1="65%" y1="75%" x2="85%" y2="50%" stroke="var(--text-primary)" strokeWidth="1.5" />
                      </svg>

                      {/* Web clients node */}
                      <div className="absolute left-[5%] top-[40%] flex flex-col items-center gap-1 bg-[var(--app-surface-raised)] border border-[var(--app-border)] p-2 rounded-lg">
                        <Laptop className="w-5 h-5 text-blue-500" />
                        <span className="text-[8px] font-bold">Clients</span>
                      </div>

                      {/* API Gateway node */}
                      <div className="absolute left-[30%] top-[40%] flex flex-col items-center gap-1 bg-[var(--app-surface-raised)] border border-[var(--app-border)] p-2.5 rounded-lg shadow-sm">
                        <Cpu className="w-5 h-5 text-purple-500 animate-pulse" />
                        <span className="text-[8.5px] font-bold">Gwy-Active</span>
                      </div>

                      {/* Microservices */}
                      <div className="absolute left-[55%] top-[15%] flex flex-col items-center gap-1 bg-[var(--app-surface-raised)] border border-[var(--app-border)] p-2 rounded-lg">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        <span className="text-[8px] font-bold">Auth-Svc</span>
                      </div>

                      <div className="absolute left-[55%] top-[43%] flex flex-col items-center gap-1 bg-[var(--app-surface-raised)] border border-[var(--app-border)] p-2 rounded-lg">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        <span className="text-[8px] font-bold">Acct-Svc</span>
                      </div>

                      <div className="absolute left-[55%] top-[70%] flex flex-col items-center gap-1 bg-[var(--app-surface-raised)] border border-[var(--app-border)] p-2 rounded-lg">
                        <Cpu className="w-4 h-4 text-amber-500" />
                        <span className="text-[8px] font-bold">Pay-Svc</span>
                      </div>

                      {/* DB node */}
                      <div className="absolute left-[80%] top-[40%] flex flex-col items-center gap-1 bg-[var(--app-surface-raised)] border border-[var(--app-border)] p-2.5 rounded-lg">
                        <Database className="w-5 h-5 text-emerald-500" />
                        <span className="text-[8.5px] font-bold">Databases</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'events' && (
                  <div className="p-5 rounded-2xl border bg-[var(--app-surface)]" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[12px] font-bold text-[var(--text-primary)]">Telemetry Event Trail</div>
                      <div className="flex items-center gap-1 text-[9px] font-bold text-[var(--text-muted)]">
                        <button className="px-2 py-0.5 rounded bg-[var(--accent)] text-white">All</button>
                        <button className="px-2 py-0.5 rounded hover:bg-[var(--app-bg-muted)]">Warnings</button>
                        <button className="px-2 py-0.5 rounded hover:bg-[var(--app-bg-muted)]">Drifts</button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                      {[
                        { type: 'drift', time: '11:56 AM', unit: 'API Gateway', text: 'Drift resolved: environment variables matched cluster template.' },
                        { type: 'deploy', time: '11:43 AM', unit: 'Auth Service', text: 'Automated deployment verification check: SUCCESS' },
                        { type: 'alert', time: '11:24 AM', unit: 'Payment Service', text: 'Warning: Latency exceeded SLA bounds (310ms vs 200ms target).' },
                        { type: 'success', time: '10:56 AM', unit: 'Digital Banking Platform', text: 'Regional failover simulation verification completed successfully.' },
                        { type: 'deploy', time: '10:15 AM', unit: 'Mobile Banking API', text: 'New container image build tag: release-v2.3.1 deployed to US-EAST-1.' }
                      ].map((evt, idx) => (
                        <div key={idx} className="p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] flex items-start gap-3 text-[11px] font-bold">
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 animate-pulse" 
                            style={{ background: evt.type === 'alert' ? '#FF9F0A' : evt.type === 'drift' ? '#BF5AF2' : '#00E599' }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center text-[9.5px] text-[var(--text-muted)]">
                              <span>{evt.unit}</span>
                              <span>{evt.time}</span>
                            </div>
                            <p className="text-[var(--text-primary)] mt-1">{evt.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'drift' && (
                  <div className="p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="text-[12px] font-bold text-[var(--text-primary)]">Configuration Drift Auditing</div>
                    
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-[12px] font-extrabold text-emerald-400">All environments compliant</div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                          No active configuration discrepancies detected between live Kubernetes nodes and target configuration templates.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 text-[11px] font-bold text-[var(--text-secondary)]">
                      <div className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider mt-2">Verified Policies</div>
                      <div className="flex justify-between py-1.5 border-b border-[var(--app-border)]">
                        <span>Environment Variables Integrity</span>
                        <span className="text-[#00E599]">Verified</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-[var(--app-border)]">
                        <span>Docker Container Image Versions</span>
                        <span className="text-[#00E599]">Verified</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-[var(--app-border)]">
                        <span>Cluster CPU/Memory Limits Allocation</span>
                        <span className="text-[#00E599]">Verified</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span>Secrets & Certificate Expirations</span>
                        <span className="text-[#00E599]">Verified</span>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── FOOTER STAT BREAKDOWNS (3-Column grid) ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4 border-[var(--app-border)]">
            
            {/* Component Health Overview */}
            <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-3"
              style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Component Health Overview</div>
              
              <div className="flex items-center gap-4">
                {/* Donut chart layout */}
                <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="var(--app-border)" strokeWidth="5" fill="transparent" />
                    {/* Healthy (89% - offset from 0 to 145) */}
                    <circle cx="32" cy="32" r="26" stroke="#00E599" strokeWidth="5" fill="transparent" 
                      strokeDasharray={163} strokeDashoffset={18} />
                    {/* Degraded (11% - offset from 145 to 163) */}
                    <circle cx="32" cy="32" r="26" stroke="#FF9F0A" strokeWidth="5" fill="transparent" 
                      strokeDasharray={163} strokeDashoffset={163 - 18} />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-[15px] font-extrabold text-[var(--text-primary)]">9</span>
                    <span className="text-[7px] text-[var(--text-muted)] uppercase font-semibold">Total</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-[10px] font-bold">
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00E599]" /> Healthy:</span>
                    <span className="text-[var(--text-primary)]">8 (89%)</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF9F0A]" /> Degraded:</span>
                    <span className="text-[var(--text-primary)]">1 (11%)</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF453A]" /> Unhealthy:</span>
                    <span className="text-[var(--text-primary)]">0 (0%)</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8E8E93]" /> Unknown:</span>
                    <span className="text-[var(--text-primary)]">0 (0%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Component Health Distribution */}
            <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-3"
              style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Component Health Distribution</div>
              
              <div className="flex flex-col gap-1.5 text-[9.5px] font-bold">
                {[
                  { name: 'Auth Service', val: 100, color: '#00E599' },
                  { name: 'Customer Service', val: 100, color: '#00E599' },
                  { name: 'Account Service', val: 100, color: '#00E599' },
                  { name: 'Payment Service', val: 89, color: '#FF9F0A' },
                  { name: 'Notification Service', val: 100, color: '#00E599' }
                ].map((dist, idx) => (
                  <div key={idx} className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span className="truncate max-w-[120px]">{dist.name}</span>
                      <span>{dist.val}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--app-bg-muted)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${dist.val}%`, background: dist.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Sources Overview */}
            <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-3"
              style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Data Sources Overview</div>
              
              <div className="flex items-center gap-4">
                {/* Donut chart layout */}
                <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="var(--app-border)" strokeWidth="5" fill="transparent" />
                    {/* Healthy (94% - offset from 0 to 153) */}
                    <circle cx="32" cy="32" r="26" stroke="#00E599" strokeWidth="5" fill="transparent" 
                      strokeDasharray={163} strokeDashoffset={10} />
                    {/* Degraded (6% - offset from 153 to 163) */}
                    <circle cx="32" cy="32" r="26" stroke="#FF9F0A" strokeWidth="5" fill="transparent" 
                      strokeDasharray={163} strokeDashoffset={163 - 10} />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-[15px] font-extrabold text-[var(--text-primary)]">32</span>
                    <span className="text-[7px] text-[var(--text-muted)] uppercase font-semibold">Total</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-[10px] font-bold">
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00E599]" /> Healthy:</span>
                    <span className="text-[var(--text-primary)]">30 (94%)</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF9F0A]" /> Degraded:</span>
                    <span className="text-[var(--text-primary)]">2 (6%)</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF453A]" /> Unhealthy:</span>
                    <span className="text-[var(--text-primary)]">0 (0%)</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[var(--text-muted)] font-normal flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8E8E93]" /> Unknown:</span>
                    <span className="text-[var(--text-primary)]">0 (0%)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

// ==========================================
// TREE COMPONENT HELPER
// ==========================================

function TreeItem({ 
  node, 
  selectedId, 
  expandedNodes, 
  onSelect, 
  onToggleExpand, 
  level 
}: { 
  node: LOBNode; 
  selectedId: string; 
  expandedNodes: Record<string, boolean>; 
  onSelect: (id: string) => void; 
  onToggleExpand: (id: string) => void; 
  level: number;
}) {
  const isExpanded = expandedNodes[node.id] || false;
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  
  // Custom design specs based on depth
  const depthPadding = level * 12;

  const handleSelectNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const handleToggleNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  return (
    <div className="flex flex-col">
      {/* Node Element */}
      <div 
        onClick={handleSelectNode}
        className={cn(
          "flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none",
          isSelected 
            ? "bg-purple-500/15 border-l-2 border-purple-500 shadow-xs" 
            : "hover:bg-[var(--app-surface-hover)] border-l-2 border-transparent"
        )}
        style={{ paddingLeft: `${Math.max(depthPadding, 8)}px` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Collapse/Expand indicator */}
          {hasChildren ? (
            <button 
              onClick={handleToggleNode}
              className="p-0.5 rounded hover:bg-[var(--app-surface-active)] text-[var(--text-muted)]"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4.5" />
          )}

          {/* Node Icon */}
          {node.type === 'LOB' && <Building2 className="w-3.5 h-3.5 text-purple-400" />}
          {node.type === 'PLATFORM' && <Layers className="w-3.5 h-3.5 text-blue-400" />}
          {node.type === 'GROUP' && <Network className="w-3.5 h-3.5 text-amber-400" />}
          {node.type === 'COMPONENT' && <Cpu className="w-3.5 h-3.5 text-emerald-400" />}

          {/* Node Name */}
          <div className="flex flex-col min-w-0">
            <span className={cn(
              "text-[11px] font-bold truncate",
              isSelected ? "text-purple-300" : "text-[var(--text-primary)]"
            )}>
              {node.name}
            </span>
            {node.role && (
              <span className="text-[8.5px] text-[var(--text-muted)] font-normal">{node.role}</span>
            )}
          </div>
        </div>

        {/* Node stats / status indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {node.stats && (
            <div className="hidden sm:flex items-center gap-1.5 text-[8.5px] font-bold text-[var(--text-muted)]">
              <span title="Applications">⚙ {node.stats.apps}</span>
              <span title="Components">⚡ {node.stats.components}</span>
              <span title="Data Sources">🗄 {node.stats.dataSources}</span>
              {node.stats.confidence > 0 && (
                <span className="text-[#00E599]" title="Runtime Confidence">{node.stats.confidence}%</span>
              )}
            </div>
          )}

          <span className="w-2 h-2 rounded-full" style={{ background: getStatusColor(node.status) }} />
        </div>
      </div>

      {/* Children list */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col gap-1 mt-1 pl-1 border-l border-[var(--app-border)] ml-4">
          {node.children!.map(child => (
            <TreeItem 
              key={child.id} 
              node={child} 
              selectedId={selectedId} 
              expandedNodes={expandedNodes} 
              onSelect={onSelect} 
              onToggleExpand={onToggleExpand} 
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
