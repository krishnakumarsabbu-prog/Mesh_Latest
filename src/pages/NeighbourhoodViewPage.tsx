import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Network, Server, Database, Siren, Layers, Cpu, ShieldCheck, 
  Search, ChevronRight, ChevronDown, Settings, Expand, ZoomIn, ZoomOut,
  RefreshCw, Download, Star, ExternalLink, Activity, AlertTriangle, 
  CheckCircle2, Info, ArrowRight, Play, Check, Clock, Filter, 
  HelpCircle, Laptop, ShieldAlert, Wifi, Terminal, MapPin, Globe,
  ArrowUpRight, ListFilter, AlertCircle
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/utils';

// ==========================================
// TYPES & DATA STRUCTURES
// ==========================================

interface Neighbourhood {
  id: string;
  name: string;
  region: string;
  appsCount: number;
  componentsCount: number;
  dataSourcesCount: number;
  traffic: string; // e.g., '12.4K' or '800'
  trafficVal: number; // raw value for sorting
  health: number; // percentage
  confidence: number; // percentage
  trend: number[]; // Sparkline trend values
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  coordinates: { x: number; y: number }; // SVG Map placement
}

interface NeighbourhoodDetail {
  id: string;
  name: string;
  statusBadge: string;
  statusType: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  healthScore: number;
  metrics: {
    applications: number;
    components: number;
    dataSources: number;
    trafficRps: string;
    errorRate: string;
    latencyP95: string;
    slaCompliance: string;
    dataFreshness: string;
  };
  trafficTrend: number[];
  topApps: Array<{ name: string; rps: string }>;
  topComponents: Array<{ name: string; rps: string }>;
  topDataSources: Array<{ name: string; health: number }>;
}

const NEIGHBOURHOODS_DATA: Neighbourhood[] = [
  { id: 'us-east-1', name: 'US-EAST-1', region: 'N. Virginia', appsCount: 18, componentsCount: 76, dataSourcesCount: 320, traffic: '12.4K', trafficVal: 12400, health: 98, confidence: 98, trend: [10, 15, 8, 12, 14, 18, 16], status: 'HEALTHY', coordinates: { x: 300, y: 100 } },
  { id: 'us-central-1', name: 'US-CENTRAL-1', region: 'Texas', appsCount: 10, componentsCount: 48, dataSourcesCount: 210, traffic: '8.7K', trafficVal: 8700, health: 96, confidence: 96, trend: [12, 10, 14, 11, 13, 12, 14], status: 'HEALTHY', coordinates: { x: 340, y: 250 } },
  { id: 'us-west-2', name: 'US-WEST-2', region: 'Oregon', appsCount: 12, componentsCount: 54, dataSourcesCount: 198, traffic: '4.3K', trafficVal: 4300, health: 95, confidence: 95, trend: [8, 9, 11, 10, 12, 14, 15], status: 'HEALTHY', coordinates: { x: 140, y: 120 } },
  { id: 'eu-west-1', name: 'EU-WEST-1', region: 'Ireland', appsCount: 9, componentsCount: 42, dataSourcesCount: 156, traffic: '6.1K', trafficVal: 6100, health: 94, confidence: 94, trend: [11, 11, 12, 11, 13, 12, 12], status: 'HEALTHY', coordinates: { x: 500, y: 130 } },
  { id: 'ca-central-1', name: 'CA-CENTRAL-1', region: 'Montréal', appsCount: 5, componentsCount: 22, dataSourcesCount: 98, traffic: '2.1K', trafficVal: 2100, health: 93, confidence: 93, trend: [6, 7, 7, 8, 8, 9, 9], status: 'HEALTHY', coordinates: { x: 190, y: 260 } },
  { id: 'ap-south-1', name: 'AP-SOUTH-1', region: 'Mumbai', appsCount: 7, componentsCount: 29, dataSourcesCount: 134, traffic: '3.2K', trafficVal: 3200, health: 92, confidence: 92, trend: [9, 9, 8, 9, 10, 10, 10], status: 'HEALTHY', coordinates: { x: 580, y: 250 } },
  { id: 'sa-east-1', name: 'SA-EAST-1', region: 'São Paulo', appsCount: 3, componentsCount: 11, dataSourcesCount: 42, traffic: '800', trafficVal: 800, health: 78, confidence: 78, trend: [10, 9, 8, 7, 6, 5, 4], status: 'WARNING', coordinates: { x: 420, y: 340 } },
  { id: 'ap-northeast-1', name: 'AP-NORTHEAST-1', region: 'Tokyo', appsCount: 6, componentsCount: 18, dataSourcesCount: 72, traffic: '1.8K', trafficVal: 1800, health: 96, confidence: 95, trend: [7, 8, 8, 8, 9, 9, 9], status: 'HEALTHY', coordinates: { x: 680, y: 150 } },
  { id: 'eu-central-1', name: 'EU-CENTRAL-1', region: 'Frankfurt', appsCount: 8, componentsCount: 32, dataSourcesCount: 110, traffic: '3.9K', trafficVal: 3900, health: 94, confidence: 94, trend: [10, 10, 11, 10, 11, 11, 12], status: 'HEALTHY', coordinates: { x: 580, y: 80 } },
  { id: 'uk-south-1', name: 'UK-SOUTH-1', region: 'London', appsCount: 4, componentsCount: 15, dataSourcesCount: 60, traffic: '1.2K', trafficVal: 1200, health: 97, confidence: 97, trend: [8, 9, 8, 9, 9, 9, 10], status: 'HEALTHY', coordinates: { x: 450, y: 60 } },
  { id: 'us-west-1', name: 'US-WEST-1', region: 'N. California', appsCount: 5, componentsCount: 12, dataSourcesCount: 50, traffic: '900', trafficVal: 900, health: 95, confidence: 94, trend: [5, 5, 6, 6, 6, 7, 7], status: 'HEALTHY', coordinates: { x: 80, y: 200 } },
  { id: 'ap-southeast-2', name: 'AP-SOUTHEAST-2', region: 'Sydney', appsCount: 3, componentsCount: 8, dataSourcesCount: 30, traffic: '500', trafficVal: 500, health: 93, confidence: 93, trend: [4, 4, 4, 5, 5, 5, 5], status: 'HEALTHY', coordinates: { x: 720, y: 320 } }
];

const NEIGHBOURHOOD_DETAILS: Record<string, NeighbourhoodDetail> = {
  'us-east-1': {
    id: 'us-east-1',
    name: 'US-EAST-1 Neighbourhood',
    statusBadge: 'HEALTHY',
    statusType: 'HEALTHY',
    healthScore: 98,
    metrics: {
      applications: 18,
      components: 76,
      dataSources: 320,
      trafficRps: '12.4K',
      errorRate: '0.02%',
      latencyP95: '210 ms',
      slaCompliance: '99.98%',
      dataFreshness: '< 5 sec'
    },
    trafficTrend: [12000, 12100, 11950, 12300, 12200, 12150, 12400],
    topApps: [
      { name: 'Digital Banking Platform', rps: '4.2K RPS' },
      { name: 'Mobile Banking', rps: '2.1K RPS' },
      { name: 'Card Management', rps: '1.8K RPS' }
    ],
    topComponents: [
      { name: 'API Gateway', rps: '3.2K RPS' },
      { name: 'Payment Service', rps: '2.4K RPS' },
      { name: 'Customer Service', rps: '1.9K RPS' }
    ],
    topDataSources: [
      { name: 'MongoDB Cluster', health: 98 },
      { name: 'Kafka Cluster', health: 97 },
      { name: 'Redis Cluster', health: 96 }
    ]
  },
  'us-central-1': {
    id: 'us-central-1',
    name: 'US-CENTRAL-1 Neighbourhood',
    statusBadge: 'HEALTHY',
    statusType: 'HEALTHY',
    healthScore: 96,
    metrics: {
      applications: 10,
      components: 48,
      dataSources: 210,
      trafficRps: '8.7K',
      errorRate: '0.04%',
      latencyP95: '185 ms',
      slaCompliance: '99.95%',
      dataFreshness: '< 3 sec'
    },
    trafficTrend: [8200, 8400, 8300, 8600, 8500, 8650, 8700],
    topApps: [
      { name: 'Treasury Portal', rps: '3.1K RPS' },
      { name: 'Lending Platform', rps: '2.0K RPS' },
      { name: 'Brokerage Engine', rps: '1.5K RPS' }
    ],
    topComponents: [
      { name: 'Clearing API', rps: '2.2K RPS' },
      { name: 'FX Calculator', rps: '1.8K RPS' },
      { name: 'Ledger Writer', rps: '1.4K RPS' }
    ],
    topDataSources: [
      { name: 'Oracle DB Primary', health: 96 },
      { name: 'Cassandra Ring', health: 95 },
      { name: 'ElasticSearch', health: 96 }
    ]
  },
  'us-west-2': {
    id: 'us-west-2',
    name: 'US-WEST-2 Neighbourhood',
    statusBadge: 'HEALTHY',
    statusType: 'HEALTHY',
    healthScore: 95,
    metrics: {
      applications: 12,
      components: 54,
      dataSources: 198,
      trafficRps: '4.3K',
      errorRate: '0.05%',
      latencyP95: '235 ms',
      slaCompliance: '99.91%',
      dataFreshness: '< 5 sec'
    },
    trafficTrend: [4000, 4100, 4050, 4200, 4150, 4250, 4300],
    topApps: [
      { name: 'Core Processing API', rps: '1.8K RPS' },
      { name: 'Web Analytics', rps: '1.2K RPS' },
      { name: 'Notification Hub', rps: '600 RPS' }
    ],
    topComponents: [
      { name: 'Auth Node Alpha', rps: '1.1K RPS' },
      { name: 'Billing worker', rps: '850 RPS' },
      { name: 'Metrics collector', rps: '720 RPS' }
    ],
    topDataSources: [
      { name: 'Postgres RDS Replica', health: 95 },
      { name: 'DynamoDB Cache', health: 97 },
      { name: 'S3 Data Lake', health: 99 }
    ]
  },
  'sa-east-1': {
    id: 'sa-east-1',
    name: 'SA-EAST-1 Neighbourhood',
    statusBadge: 'DEGRADED',
    statusType: 'WARNING',
    healthScore: 78,
    metrics: {
      applications: 3,
      components: 11,
      dataSources: 42,
      trafficRps: '800',
      errorRate: '2.14%',
      latencyP95: '410 ms',
      slaCompliance: '97.20%',
      dataFreshness: '< 15 sec'
    },
    trafficTrend: [1000, 950, 900, 880, 840, 810, 800],
    topApps: [
      { name: 'Regional Portal', rps: '450 RPS' },
      { name: 'Local Cache Svc', rps: '250 RPS' },
      { name: 'Report Generator', rps: '100 RPS' }
    ],
    topComponents: [
      { name: 'Portal UI Node', rps: '380 RPS' },
      { name: 'Cache sync worker', rps: '210 RPS' },
      { name: 'DB Bridge', rps: '90 RPS' }
    ],
    topDataSources: [
      { name: 'Local Postgres DB', health: 75 },
      { name: 'Sync Replica Pool', health: 81 },
      { name: 'Redis Cache', health: 94 }
    ]
  }
};

const DEFAULT_DETAIL = (id: string, name: string): NeighbourhoodDetail => ({
  id,
  name: `${name} Neighbourhood`,
  statusBadge: 'HEALTHY',
  statusType: 'HEALTHY',
  healthScore: 94,
  metrics: {
    applications: 5,
    components: 20,
    dataSources: 80,
    trafficRps: '2.5K',
    errorRate: '0.05%',
    latencyP95: '220 ms',
    slaCompliance: '99.90%',
    dataFreshness: '< 5 sec'
  },
  trafficTrend: [2200, 2300, 2250, 2400, 2350, 2450, 2500],
  topApps: [
    { name: 'Regional Application', rps: '1.2K RPS' },
    { name: 'Support Portal', rps: '800 RPS' }
  ],
  topComponents: [
    { name: 'Gateway Node', rps: '950 RPS' },
    { name: 'App Logic Service', rps: '720 RPS' }
  ],
  topDataSources: [
    { name: 'SQL DB Instance', health: 94 },
    { name: 'Redis Cache node', health: 95 }
  ]
});

// Map connection lines
const MAP_CONNECTIONS = [
  { from: 'us-west-2', to: 'us-east-1', type: 'high' },
  { from: 'us-west-2', to: 'ca-central-1', type: 'medium' },
  { from: 'us-east-1', to: 'eu-west-1', type: 'high' },
  { from: 'us-east-1', to: 'us-central-1', type: 'high' },
  { from: 'us-central-1', to: 'ca-central-1', type: 'medium' },
  { from: 'us-central-1', to: 'sa-east-1', type: 'medium' },
  { from: 'eu-west-1', to: 'ap-south-1', type: 'medium' },
  { from: 'sa-east-1', to: 'ap-south-1', type: 'low' },
  { from: 'us-west-1', to: 'us-west-2', type: 'medium' },
  { from: 'uk-south-1', to: 'eu-central-1', type: 'high' },
  { from: 'eu-central-1', to: 'ap-south-1', type: 'medium' },
  { from: 'ap-south-1', to: 'ap-northeast-1', type: 'medium' },
  { from: 'ap-northeast-1', to: 'ap-southeast-2', type: 'low' }
];

export function NeighbourhoodViewPage() {
  const { theme } = useThemeStore();
  const setBreadcrumbs = useUIStore((s) => s.setBreadcrumbs);
  const setPageTitle = useUIStore((s) => s.setPageTitle);

  // States
  const [selectedNId, setSelectedNId] = useState('us-east-1');
  const [searchTerm, setSearchTerm] = useState('');
  const [envFilter, setEnvFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  
  const [mapViewMode, setMapViewMode] = useState<'health' | 'traffic'>('health');
  const [mapScale, setMapScale] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'overview' | 'apps' | 'comps' | 'ds' | 'signals' | 'topo'>('overview');

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Neighbourhood View' }
    ]);
    setPageTitle('Neighbourhood View');
  }, [setBreadcrumbs, setPageTitle]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  // Find selected detail
  const selectedDetail = useMemo(() => {
    return NEIGHBOURHOOD_DETAILS[selectedNId] || DEFAULT_DETAIL(selectedNId, selectedNId.toUpperCase());
  }, [selectedNId]);

  // Filter list of neighbourhoods
  const filteredNeighbourhoods = useMemo(() => {
    return NEIGHBOURHOODS_DATA.filter(n => {
      const matchesSearch = n.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            n.region.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRegion = regionFilter === 'all' || 
                            (regionFilter === 'americas' && (n.id.startsWith('us-') || n.id.startsWith('ca-') || n.id.startsWith('sa-'))) ||
                            (regionFilter === 'emea' && (n.id.startsWith('eu-') || n.id.startsWith('uk-'))) ||
                            (regionFilter === 'apac' && n.id.startsWith('ap-'));
      return matchesSearch && matchesRegion;
    });
  }, [searchTerm, regionFilter]);

  const activeNeighbourhood = useMemo(() => {
    return NEIGHBOURHOODS_DATA.find(n => n.id === selectedNId);
  }, [selectedNId]);

  const isDark = theme !== 'harness' && theme !== 'frost';

  // Colors mapping helper
  const getNodeColor = (status: string, health: number) => {
    if (mapViewMode === 'traffic') {
      if (health > 95) return '#00E599'; // Emerald
      if (health > 90) return '#0A84FF'; // Blue
      if (health > 70) return '#FF9F0A'; // Orange
      return '#FF453A'; // Red
    }
    // Health mode
    if (health >= 90) return '#00E599';
    if (health >= 70) return '#FF9F0A';
    return '#FF453A';
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none">
      
      {/* ── TOP ACTION HEADER BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 -mt-2 bg-[var(--app-surface)] p-3 rounded-2xl border border-[var(--app-border)] shadow-sm">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-[var(--accent)]" />
          <span className="text-[12px] font-bold text-[var(--text-secondary)]">Infrastructure neighbourhood to application mapping and health</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-all active:scale-95"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </button>

          {/* Topology Toggle Button */}
          <button 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-all"
          >
            <Globe className="w-3.5 h-3.5" />
            Topology
          </button>

          {/* Filters Toggle Button */}
          <button 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-all"
          >
            <ListFilter className="w-3.5 h-3.5" />
            Filters
          </button>
        </div>
      </div>

      {/* ── TOP KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Neighbourhoods', value: 12, sub: '9 Healthy • 2 Warn • 1 Crit', color: '#BF5AF2', icon: Globe },
          { label: 'Applications', value: 56, sub: '42 Healthy • 10 Warn • 4 Crit', color: '#0A84FF', icon: Server },
          { label: 'Components', value: 248, sub: '198 Healthy • 32 Warn • 18 Crit', color: '#00E599', icon: Cpu },
          { label: 'Data Sources', value: '1.2K', sub: '1.1K Healthy • 72 Warn • 28 Crit', color: '#FF9F0A', icon: Database },
          { 
            label: 'Avg Confidence', 
            value: '96%', 
            sub: '↑ 4% vs last 24h', 
            color: '#00E599', 
            icon: ShieldCheck, 
            isGauge: true 
          },
          { label: 'Incidents', value: 7, sub: '3 High • 4 Medium', color: '#FF453A', icon: Siren }
        ].map((stat, i) => (
          <div 
            key={i} 
            className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden border bg-[var(--app-surface)] shadow-xs"
            style={{ borderColor: 'var(--app-border)' }}
          >
            {/* Left accent strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: stat.color }} />
            
            {/* Gauge or Icon */}
            {stat.isGauge ? (
              <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="20" cy="20" r="16" stroke="var(--app-border)" strokeWidth="3" fill="transparent" />
                  <circle cx="20" cy="20" r="16" stroke={stat.color} strokeWidth="3" fill="transparent" 
                    strokeDasharray={100} strokeDashoffset={4} />
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
                {stat.value}
              </p>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-1">{stat.label}</p>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: stat.color }}>{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* LEFT WORKSPACE PANELS (7 Cols) */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          
          {/* Map panel */}
          <div className="p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4 relative overflow-hidden"
            style={{ borderColor: 'var(--app-border)' }}>
            
            {/* Map Header */}
            <div className="flex items-center justify-between border-b pb-3 border-[var(--app-border)]">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-[var(--text-primary)]">Infrastructure Neighbourhood Map</span>
                <HelpCircle className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
              
              {/* Map controls */}
              <div className="flex items-center gap-4">
                {/* View toggler */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
                  <button 
                    onClick={() => setMapViewMode('health')}
                    className={cn(
                      "px-2.5 py-1 rounded text-[10px] font-bold transition-all",
                      mapViewMode === 'health' ? "bg-[var(--app-surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Health
                  </button>
                  <button 
                    onClick={() => setMapViewMode('traffic')}
                    className={cn(
                      "px-2.5 py-1 rounded text-[10px] font-bold transition-all",
                      mapViewMode === 'traffic' ? "bg-[var(--app-surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Traffic
                  </button>
                </div>

                {/* Scale buttons */}
                <div className="flex items-center gap-1">
                  <button onClick={() => setMapScale(prev => Math.min(prev + 0.1, 1.4))} className="p-1 rounded bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ZoomIn className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setMapScale(prev => Math.max(prev - 0.1, 0.6))} className="p-1 rounded bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ZoomOut className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setMapScale(1)} className="p-1 rounded bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Expand className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>

            {/* SVG Visual Map */}
            <div className={cn(
              "relative w-full h-[380px] rounded-xl overflow-hidden border border-[var(--app-border)] flex items-center justify-center transition-colors",
              isDark ? "bg-[#080d16]/40" : "bg-gray-100/50"
            )}>
              
              {/* Map grid pattern background */}
              <div 
                className="absolute inset-0 opacity-[0.04] pointer-events-none" 
                style={{ 
                  backgroundImage: `radial-gradient(circle, ${isDark ? 'white' : 'black'} 1.2px, transparent 1.2px)`, 
                  backgroundSize: '24px 24px' 
                }} 
              />

              <svg 
                className="w-full h-full max-w-[800px] max-h-[380px] transition-transform duration-200"
                style={{ transform: `scale(${mapScale})` }}
              >
                {/* SVG glowing filters definition */}
                <defs>
                  <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-orange" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Connection lines layer */}
                {MAP_CONNECTIONS.map((conn, idx) => {
                  const fromNode = NEIGHBOURHOODS_DATA.find(n => n.id === conn.from);
                  const toNode = NEIGHBOURHOODS_DATA.find(n => n.id === conn.to);
                  if (!fromNode || !toNode) return null;

                  // Define stroke patterns
                  const isHigh = conn.type === 'high';
                  const isMedium = conn.type === 'medium';
                  const strokeWidth = isHigh ? 2 : isMedium ? 1.2 : 0.8;
                  const strokeDash = mapViewMode === 'traffic' ? (isHigh ? '5,5' : isMedium ? '8,8' : '12,12') : 'none';

                  return (
                    <g key={idx}>
                      <line 
                        x1={fromNode.coordinates.x} 
                        y1={fromNode.coordinates.y} 
                        x2={toNode.coordinates.x} 
                        y2={toNode.coordinates.y} 
                        stroke="var(--app-border)" 
                        strokeWidth={strokeWidth + 2}
                        strokeOpacity={0.15}
                      />
                      <line 
                        x1={fromNode.coordinates.x} 
                        y1={fromNode.coordinates.y} 
                        x2={toNode.coordinates.x} 
                        y2={toNode.coordinates.y} 
                        stroke={mapViewMode === 'traffic' ? 'rgba(0,229,153,0.4)' : 'var(--app-border-medium)'} 
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDash}
                        strokeOpacity={0.65}
                        className={mapViewMode === 'traffic' ? 'animate-[dash_20s_linear_infinite]' : ''}
                      />
                    </g>
                  );
                })}

                {/* Nodes layer */}
                {NEIGHBOURHOODS_DATA.map((node) => {
                  const isSelected = selectedNId === node.id;
                  const nodeColor = getNodeColor(node.status, node.health);
                  
                  // Glowing filter selection
                  let glowFilter = 'url(#glow-green)';
                  if (nodeColor === '#FF9F0A') glowFilter = 'url(#glow-orange)';
                  if (nodeColor === '#FF453A') glowFilter = 'url(#glow-red)';
                  if (nodeColor === '#0A84FF') glowFilter = 'url(#glow-blue)';

                  return (
                    <g 
                      key={node.id} 
                      className="cursor-pointer"
                      onClick={() => setSelectedNId(node.id)}
                    >
                      {/* Glow Outer circle */}
                      <circle 
                        cx={node.coordinates.x} 
                        cy={node.coordinates.y} 
                        r={isSelected ? 26 : 20} 
                        fill="transparent"
                        stroke={nodeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeOpacity={isSelected ? 0.95 : 0.35}
                        filter={isSelected ? glowFilter : 'none'}
                      />

                      {/* Inner solid circle */}
                      <circle 
                        cx={node.coordinates.x} 
                        cy={node.coordinates.y} 
                        r={isSelected ? 18 : 14} 
                        fill={isDark ? "#0b0f19" : "#ffffff"} 
                        stroke={nodeColor}
                        strokeWidth={2}
                      />

                      {/* Micro Server Icon inside circle */}
                      <g transform={`translate(${node.coordinates.x - 7}, ${node.coordinates.y - 7}) scale(0.6)`}>
                        <rect x="2" y="2" width="20" height="20" rx="3" fill="transparent" stroke={nodeColor} strokeWidth="1.5" />
                        <line x1="6" y1="8" x2="18" y2="8" stroke={nodeColor} strokeWidth="1.5" />
                        <line x1="6" y1="12" x2="18" y2="12" stroke={nodeColor} strokeWidth="1.5" />
                        <line x1="6" y1="16" x2="18" y2="16" stroke={nodeColor} strokeWidth="1.5" />
                      </g>

                      {/* Label Text Container */}
                      <g transform={`translate(${node.coordinates.x}, ${node.coordinates.y - (isSelected ? 35 : 28)})`}>
                        {/* Semi-transparent text background */}
                        <rect 
                          x={-42} 
                          y={-10} 
                          width={84} 
                          height={24} 
                          rx={6} 
                          fill={isDark ? "rgba(11, 16, 25, 0.85)" : "rgba(255, 255, 255, 0.9)"} 
                          stroke={isSelected ? 'var(--accent)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}
                          strokeWidth={1}
                        />
                        <text 
                          textAnchor="middle" 
                          fill={isSelected ? (isDark ? '#fff' : 'var(--accent)') : 'var(--text-primary)'} 
                          fontSize={8.5} 
                          fontWeight="extrabold"
                          y={3}
                        >
                          {node.name}
                        </text>
                        <text 
                          textAnchor="middle" 
                          fill={nodeColor} 
                          fontSize={7.5} 
                          fontWeight="bold"
                          y={11}
                        >
                          {node.appsCount} Apps • {node.health}%
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>

              {/* Map Floating Legend */}
              <div className="absolute bottom-4 left-4 p-3 rounded-xl border bg-[var(--app-surface-raised)]/95 backdrop-blur-md flex flex-col gap-2.5 shadow-md max-w-[160px]"
                style={{ borderColor: 'var(--app-border)' }}>
                <div>
                  <div className="text-[8px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">HEALTH LEGEND</div>
                  <div className="flex flex-col gap-1 mt-1 text-[8.5px] font-bold text-[var(--text-secondary)]">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#00E599]" /> Excellent (90-100%)</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#0A84FF]" /> Good (70-89%)</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FF9F0A]" /> Warning (50-69%)</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FF453A]" /> Critical (&lt;50%)</div>
                  </div>
                </div>
                
                <div className="border-t pt-2 border-[var(--app-border)]">
                  <div className="text-[8px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">TRAFFIC (RPS)</div>
                  <div className="flex flex-col gap-1 mt-1 text-[8.5px] font-bold text-[var(--text-secondary)]">
                    <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[var(--text-muted)]" /> High (&gt;10K)</div>
                    <div className="flex items-center gap-1.5"><span className="w-4 h-px bg-[var(--text-muted)]" /> Medium (1K-10K)</div>
                    <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t border-dotted border-[var(--text-muted)]" /> Low (&lt;1K)</div>
                  </div>
                </div>
              </div>

              {/* View Details Floating Link */}
              <div className="absolute top-4 right-4 text-[9px] font-extrabold text-[var(--text-muted)] bg-[var(--app-surface-raised)]/80 px-2.5 py-1 rounded-lg">
                Active DC: <span className="text-[var(--text-primary)] uppercase">{selectedNId}</span>
              </div>
            </div>

            <div className="text-[10.5px] font-bold text-[var(--text-muted)] leading-relaxed italic">
              * Confidence is calculated based on signal coverage, freshness and correlation across all data sources.
            </div>

          </div>

          {/* Bottom table panel */}
          <div className="p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4"
            style={{ borderColor: 'var(--app-border)' }}>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[13px] font-bold text-[var(--text-primary)]">Infrastructure Neighbourhoods ({filteredNeighbourhoods.length})</div>
              
              <div className="flex items-center gap-3">
                {/* Search bar */}
                <div className="flex items-center gap-2 px-3 py-1 rounded-xl border bg-[var(--app-bg-subtle)]" style={{ borderColor: 'var(--app-border)' }}>
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <input 
                    type="text" 
                    placeholder="Search neighbourhood..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent border-0 outline-none text-[11px] text-[var(--text-primary)] w-[150px] placeholder-[var(--text-muted)]"
                  />
                </div>

                {/* Region filter */}
                <select 
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="bg-[var(--app-surface-raised)] border border-[var(--app-border)] rounded-xl px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] outline-none"
                >
                  <option value="all">All Regions</option>
                  <option value="americas">Americas</option>
                  <option value="emea">EMEA</option>
                  <option value="apac">APAC</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-bold">
                <thead>
                  <tr className="border-b border-[var(--app-border)] text-[var(--text-muted)]">
                    <th className="py-2.5">Neighbourhood</th>
                    <th className="py-2.5">Region</th>
                    <th className="py-2.5 text-center">Applications</th>
                    <th className="py-2.5 text-center">Components</th>
                    <th className="py-2.5 text-center">Data Sources</th>
                    <th className="py-2.5">Traffic (RPS)</th>
                    <th className="py-2.5">Health</th>
                    <th className="py-2.5">Avg Confidence</th>
                    <th className="py-2.5 text-center">Trend (24h)</th>
                    <th className="py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNeighbourhoods.map((n) => {
                    const isSelected = selectedNId === n.id;
                    const nodeColor = getNodeColor(n.status, n.health);
                    
                    return (
                      <tr 
                        key={n.id} 
                        onClick={() => setSelectedNId(n.id)}
                        className={cn(
                          "border-b border-[var(--app-border)] last:border-0 hover:bg-[var(--app-surface-hover)] cursor-pointer transition-colors",
                          isSelected && "bg-purple-500/5"
                        )}
                      >
                        <td className={cn("py-3 text-[11px] font-extrabold", isSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]")}>
                          {n.name}
                        </td>
                        <td className="py-3 text-[var(--text-secondary)]">{n.region}</td>
                        <td className="py-3 text-center text-[var(--text-primary)]">{n.appsCount}</td>
                        <td className="py-3 text-center text-[var(--text-primary)]">{n.componentsCount}</td>
                        <td className="py-3 text-center text-[var(--text-primary)]">{n.dataSourcesCount}</td>
                        <td className="py-3 text-[var(--text-primary)]">{n.traffic}</td>
                        <td className="py-3">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                            style={{ color: nodeColor, background: `${nodeColor}15` }}>
                            <span className="w-1 h-1 rounded-full" style={{ background: nodeColor }} />
                            {n.health}%
                          </span>
                        </td>
                        <td className="py-3 text-[var(--text-primary)]">{n.confidence}%</td>
                        <td className="py-3 text-center">
                          <svg className="w-16 h-6 inline-block overflow-visible">
                            <path 
                              d={`M ${n.trend.map((val, idx) => `${(idx / (n.trend.length - 1)) * 64} ${24 - (val / 20) * 20}`).join(' L ')}`}
                              fill="none" 
                              stroke={n.health < 80 ? '#FF453A' : '#00E599'} 
                              strokeWidth="1.5" 
                            />
                          </svg>
                        </td>
                        <td className="py-3 text-center">
                          <button className="p-1 rounded hover:bg-[var(--app-surface-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

        </div>

        {/* RIGHT WORKSPACE PANELS (5 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          
          {/* Insights Panel */}
          <div className="p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4"
            style={{ borderColor: 'var(--app-border)' }}>
            
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--text-primary)]">Neighbourhood Insights</span>
              <button className="text-[10px] font-extrabold text-[var(--accent)] hover:underline">View All</button>
            </div>

            {/* Split row: Top Talkers and Health Distribution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Top Talkers */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Top Talkers</span>
                <div className="flex flex-col gap-1.5 text-[10.5px] font-bold">
                  {[
                    { dc: 'US-EAST-1', val: '12.4K RPS' },
                    { dc: 'US-CENTRAL-1', val: '8.7K RPS' },
                    { dc: 'EU-WEST-1', val: '6.1K RPS' },
                    { dc: 'US-WEST-2', val: '4.3K RPS' },
                    { dc: 'AP-SOUTH-1', val: '3.2K RPS' }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-[var(--app-border)] last:border-0">
                      <span className="text-[var(--text-secondary)]">{item.dc}</span>
                      <span className="text-[var(--text-primary)]">{item.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Health Distribution Donut */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Health Distribution</span>
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="26" stroke="var(--app-border)" strokeWidth="4.5" fill="transparent" />
                      {/* Excellent: 7/12 (58%) */}
                      <circle cx="32" cy="32" r="26" stroke="#00E599" strokeWidth="4.5" fill="transparent" 
                        strokeDasharray={163} strokeDashoffset={163 * 0.42} />
                      {/* Good: 3/12 (25%) */}
                      <circle cx="32" cy="32" r="26" stroke="#0A84FF" strokeWidth="4.5" fill="transparent" 
                        strokeDasharray={163} strokeDashoffset={163 * 0.75} />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-[14px] font-extrabold text-[var(--text-primary)]">12</span>
                      <span className="text-[6.5px] text-[var(--text-muted)] uppercase font-semibold">Total</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-0.5 text-[8.5px] font-bold text-[var(--text-secondary)]">
                    <div className="flex justify-between items-center gap-2"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" /> Excellent</span> <span>7 (58%)</span></div>
                    <div className="flex justify-between items-center gap-2"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" /> Good</span> <span>3 (25%)</span></div>
                    <div className="flex justify-between items-center gap-2"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A]" /> Warning</span> <span>1 (8%)</span></div>
                    <div className="flex justify-between items-center gap-2"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#FF453A]" /> Critical</span> <span>1 (8%)</span></div>
                  </div>
                </div>
              </div>

            </div>

            {/* Risk & Alerts */}
            <div className="flex flex-col gap-2.5 border-t pt-3 border-[var(--app-border)]">
              <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Risk & Alerts</span>
              <div className="flex flex-col gap-2 text-[10.5px] font-bold">
                {[
                  { dc: 'US-EAST-1', alert: 'High latency detected', time: '3m ago', color: '#FF453A' },
                  { dc: 'EU-WEST-1', alert: 'Database replication lag', time: '15m ago', color: '#FF9F0A' },
                  { dc: 'SA-EAST-1', alert: 'Low signal coverage', time: '28m ago', color: '#FF9F0A' },
                  { dc: 'US-WEST-2', alert: 'Configuration drift', time: '45m ago', color: '#FF9F0A' }
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: item.color }} />
                      <span className="text-[var(--text-primary)] uppercase truncate w-[80px]">{item.dc}</span>
                      <span className="text-[var(--text-secondary)] truncate">{item.alert}</span>
                    </div>
                    <span className="text-[var(--text-muted)] text-[9px]">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Incidents */}
            <div className="flex flex-col gap-2.5 border-t pt-3 border-[var(--app-border)]">
              <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Recent Incidents</span>
              <div className="flex flex-col gap-2 text-[10.5px] font-bold">
                {[
                  { inc: 'INC-4821', level: 'High', dc: 'US-EAST-1', time: '32m ago', color: '#FF453A' },
                  { inc: 'INC-4817', level: 'Medium', dc: 'EU-WEST-1', time: '1h ago', color: '#FF9F0A' },
                  { inc: 'INC-4812', level: 'Medium', dc: 'SA-EAST-1', time: '2h ago', color: '#FF9F0A' },
                  { inc: 'INC-4808', level: 'Low', dc: 'US-CENTRAL-1', time: '5h ago', color: '#00E599' }
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="text-[var(--text-primary)] font-mono">{item.inc}</span>
                      <span className="px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold" 
                        style={{ color: item.color, background: `${item.color}15` }}>{item.level}</span>
                      <span className="text-[var(--text-secondary)] uppercase truncate">{item.dc}</span>
                    </div>
                    <span className="text-[var(--text-muted)] text-[9px]">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Active Detail Panel */}
          <div className="p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4 relative overflow-hidden"
            style={{ borderColor: 'var(--app-border)' }}>
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-extrabold text-[var(--text-primary)] uppercase tracking-wide">
                  {selectedDetail.name}
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider mt-1.5"
                  style={{ 
                    background: `${selectedDetail.statusType === 'CRITICAL' ? '#FF453A' : selectedDetail.statusType === 'WARNING' ? '#FF9F0A' : '#00E599'}15`, 
                    color: selectedDetail.statusType === 'CRITICAL' ? '#FF453A' : selectedDetail.statusType === 'WARNING' ? '#FF9F0A' : '#00E599' 
                  }}>
                  <span className="w-1 h-1 rounded-full animate-ping" 
                    style={{ background: selectedDetail.statusType === 'CRITICAL' ? '#FF453A' : selectedDetail.statusType === 'WARNING' ? '#FF9F0A' : '#00E599' }} />
                  {selectedDetail.statusBadge}
                </span>
              </div>
              
              <button className="text-[10px] font-extrabold text-[var(--accent)] hover:underline flex items-center gap-0.5">
                View Details <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tabs inside Right pane */}
            <div className="flex border-b border-[var(--app-border)] overflow-x-auto scrollbar-none text-[10.5px] font-bold">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'apps', label: `Apps (${selectedDetail.metrics.applications})` },
                { id: 'comps', label: `Comps (${selectedDetail.metrics.components})` },
                { id: 'ds', label: 'Data Sources' },
                { id: 'signals', label: 'Signals' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setRightPanelTab(tab.id as any)}
                  className={cn(
                    "px-3 py-1.5 border-b-2 whitespace-nowrap transition-all",
                    rightPanelTab === tab.id 
                      ? "border-[var(--accent)] text-[var(--accent)]" 
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Right Pane Tab Contents */}
            <div className="min-h-[260px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={rightPanelTab}
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  transition={{ duration: 0.12 }}
                  className="flex flex-col gap-4"
                >
                  {rightPanelTab === 'overview' && (
                    <>
                      {/* Health gauge and metrics row */}
                      <div className="grid grid-cols-12 gap-4 items-center border-b pb-3.5 border-[var(--app-border)]">
                        {/* Health Score circle */}
                        <div className="col-span-5 flex flex-col items-center">
                          <span className="text-[8.5px] uppercase tracking-wider text-[var(--text-muted)] font-extrabold">Health Score</span>
                          <div className="relative w-16 h-16 flex items-center justify-center mt-1">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle cx="32" cy="32" r="26" stroke="var(--app-border)" strokeWidth="4" fill="transparent" />
                              <circle cx="32" cy="32" r="26" 
                                stroke={selectedDetail.healthScore > 90 ? '#00E599' : selectedDetail.healthScore > 70 ? '#FF9F0A' : '#FF453A'} 
                                strokeWidth="4" fill="transparent" 
                                strokeDasharray={163} strokeDashoffset={163 - (163 * selectedDetail.healthScore) / 100} />
                            </svg>
                            <div className="absolute flex flex-col items-center">
                              <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{selectedDetail.healthScore}%</span>
                              <span className="text-[6.5px] text-[#00E599] font-bold uppercase">Excellent</span>
                            </div>
                          </div>
                        </div>

                        {/* Basic metrics */}
                        <div className="col-span-7 grid grid-cols-2 gap-2 text-[10.5px] font-bold text-[var(--text-secondary)]">
                          <div className="flex flex-col">
                            <span className="text-[var(--text-muted)] font-normal">Applications</span>
                            <span className="text-[var(--text-primary)]">{selectedDetail.metrics.applications}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[var(--text-muted)] font-normal">Components</span>
                            <span className="text-[var(--text-primary)]">{selectedDetail.metrics.components}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[var(--text-muted)] font-normal">Data Sources</span>
                            <span className="text-[var(--text-primary)]">{selectedDetail.metrics.dataSources}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[var(--text-muted)] font-normal">Traffic (RPS)</span>
                            <span className="text-[var(--text-primary)]">{selectedDetail.metrics.trafficRps}</span>
                          </div>
                        </div>
                      </div>

                      {/* SLA and SLA stats */}
                      <div className="grid grid-cols-2 gap-3 text-[10.5px] font-bold text-[var(--text-secondary)]">
                        <div className="flex justify-between py-1 border-b border-[var(--app-border)]">
                          <span className="text-[var(--text-muted)] font-normal">Error Rate</span>
                          <span className="text-[var(--text-primary)]">{selectedDetail.metrics.errorRate}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[var(--app-border)]">
                          <span className="text-[var(--text-muted)] font-normal">Latency (P95)</span>
                          <span className="text-[var(--text-primary)]">{selectedDetail.metrics.latencyP95}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-[var(--text-muted)] font-normal">SLA Compliance</span>
                          <span className="text-[#00E599]">{selectedDetail.metrics.slaCompliance}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-[var(--text-muted)] font-normal">Data Freshness</span>
                          <span className="text-[var(--text-primary)]">{selectedDetail.metrics.dataFreshness}</span>
                        </div>
                      </div>

                      {/* Traffic Trend (24h) Sparkline */}
                      <div className="flex flex-col gap-1.5 border-t pt-3 border-[var(--app-border)]">
                        <div className="flex justify-between items-center text-[10px] font-extrabold">
                          <span className="text-[var(--text-muted)] uppercase tracking-wider">Traffic Trend (24h)</span>
                          <span className="text-[#00E599]">{selectedDetail.metrics.trafficRps} RPS ↑ 18%</span>
                        </div>
                        <svg className="w-full h-14 overflow-visible mt-1">
                          <path 
                            d={`M ${selectedDetail.trafficTrend.map((v, idx) => `${(idx / (selectedDetail.trafficTrend.length - 1)) * 320} ${56 - (v / Math.max(...selectedDetail.trafficTrend)) * 40}`).join(' L ')}`}
                            fill="none" 
                            stroke="#00E599" 
                            strokeWidth="2" 
                          />
                        </svg>
                      </div>

                      {/* Top Applications & Components lists */}
                      <div className="grid grid-cols-2 gap-4 border-t pt-3.5 border-[var(--app-border)]">
                        {/* Top Applications */}
                        <div className="flex flex-col gap-2">
                          <span className="text-[8.5px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Top Applications</span>
                          <div className="flex flex-col gap-1.5 text-[10.5px] font-bold">
                            {selectedDetail.topApps.map((app, i) => (
                              <div key={i} className="flex justify-between items-center py-0.5">
                                <span className="text-[var(--text-secondary)] truncate max-w-[100px]">{app.name}</span>
                                <span className="text-[var(--text-primary)] flex-shrink-0">{app.rps}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Components by Traffic */}
                        <div className="flex flex-col gap-2">
                          <span className="text-[8.5px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Top Components</span>
                          <div className="flex flex-col gap-1.5 text-[10.5px] font-bold">
                            {selectedDetail.topComponents.map((comp, i) => (
                              <div key={i} className="flex justify-between items-center py-0.5">
                                <span className="text-[var(--text-secondary)] truncate max-w-[100px]">{comp.name}</span>
                                <span className="text-[var(--text-primary)] flex-shrink-0">{comp.rps}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Top Data Sources */}
                      <div className="flex flex-col gap-2 border-t pt-3 border-[var(--app-border)]">
                        <span className="text-[8.5px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Top Data Sources</span>
                        <div className="flex flex-col gap-1.5 text-[10.5px] font-bold">
                          {selectedDetail.topDataSources.map((ds, i) => (
                            <div key={i} className="flex justify-between items-center py-0.5">
                              <span className="text-[var(--text-secondary)] truncate flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                {ds.name}
                              </span>
                              <span className="text-[#00E599]">{ds.health}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {rightPanelTab === 'apps' && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Active Applications</span>
                      <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
                        {selectedDetail.topApps.map((app, i) => (
                          <div key={i} className="p-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] flex items-center justify-between text-[11px] font-bold">
                            <div className="flex items-center gap-2">
                              <Server className="w-4 h-4 text-blue-500" />
                              <span className="text-[var(--text-primary)]">{app.name}</span>
                            </div>
                            <span className="text-[var(--text-muted)]">{app.rps}</span>
                          </div>
                        ))}
                        <div className="text-center py-4 text-[10.5px] text-[var(--text-muted)] italic">
                          Showing top applications
                        </div>
                      </div>
                    </div>
                  )}

                  {rightPanelTab === 'comps' && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Microservice Components</span>
                      <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
                        {selectedDetail.topComponents.map((comp, i) => (
                          <div key={i} className="p-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] flex items-center justify-between text-[11px] font-bold">
                            <div className="flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-purple-500" />
                              <span className="text-[var(--text-primary)]">{comp.name}</span>
                            </div>
                            <span className="text-[var(--text-muted)]">{comp.rps}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rightPanelTab === 'ds' && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Connected Storage Integration</span>
                      <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
                        {selectedDetail.topDataSources.map((ds, i) => (
                          <div key={i} className="p-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] flex items-center justify-between text-[11px] font-bold">
                            <div className="flex items-center gap-2">
                              <Database className="w-4 h-4 text-emerald-500" />
                              <span className="text-[var(--text-primary)]">{ds.name}</span>
                            </div>
                            <span className="text-[#00E599]">{ds.health}% Compliant</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rightPanelTab === 'signals' && (
                    <div className="flex flex-col gap-2.5 text-[11px] font-bold">
                      <span className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">Health Signals</span>
                      {[
                        { name: 'Gateway Latency', status: 'HEALTHY', val: '12ms' },
                        { name: 'SLA Deviation', status: 'HEALTHY', val: '0.00%' },
                        { name: 'Error Rates Status', status: 'HEALTHY', val: '0.02%' },
                        { name: 'Data Pipeline Synced', status: 'HEALTHY', val: 'Active' }
                      ].map((sig, i) => (
                        <div key={i} className="flex justify-between py-1.5 border-b border-[var(--app-border)]">
                          <span className="text-[var(--text-secondary)]">{sig.name}</span>
                          <span className="text-[#00E599]">{sig.val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
