import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Building2, Folder, Layers, Activity, Heart,
  Search, RefreshCw, Plus, ChevronDown, Maximize2, Sparkles,
  AlertTriangle, AlertCircle, HelpCircle, ArrowRight, MoreVertical,
  Minus, CheckCircle
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface TeamDetail {
  name: string;
  lob: string;
  projects: number;
  components: number;
  members: number;
  health: number;
  trend: string;
}

export function TeamLiveDashboardPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLOB, setSelectedLOB] = useState('All LOBs');
  const [sortBy, setSortBy] = useState('Health');
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Mock Data representing the attached image exactly ---
  const statCards = [
    {
      title: 'Total Teams',
      value: '12',
      trend: '+ 2 vs last month',
      trendType: 'up',
      icon: Users,
      color: '#0A84FF',
      bgColor: 'rgba(10, 132, 255, 0.08)',
    },
    {
      title: 'LOBs',
      value: '5',
      trend: 'No change',
      trendType: 'neutral',
      icon: Building2,
      color: '#30D158',
      bgColor: 'rgba(48, 209, 88, 0.08)',
    },
    {
      title: 'Projects',
      value: '57',
      trend: '+ 8 vs last month',
      trendType: 'up',
      icon: Folder,
      color: '#FF9F0A',
      bgColor: 'rgba(255, 159, 10, 0.08)',
    },
    {
      title: 'Components',
      value: '824',
      trend: '+ 16 vs last month',
      trendType: 'up',
      icon: Layers,
      color: '#BF5AF2',
      bgColor: 'rgba(191, 90, 242, 0.08)',
    },
    {
      title: 'Members',
      value: '230',
      trend: '+ 18 vs last month',
      trendType: 'up',
      icon: Users,
      color: '#64D2FF',
      bgColor: 'rgba(100, 210, 255, 0.08)',
    },
    {
      title: 'Avg Health Score',
      value: '92%',
      trend: '3% vs last month',
      trendType: 'down',
      icon: Heart,
      color: '#FF453A',
      bgColor: 'rgba(255, 69, 58, 0.08)',
    },
  ];

  // The 12 teams that map exactly to the tree and donut chart
  const initialTeams: TeamDetail[] = [
    {
      name: 'Platform Core',
      lob: 'Platform Engineering',
      projects: 8,
      components: 112,
      members: 26,
      health: 95,
      trend: 'M0,15 Q15,5 30,10 T60,2 T90,5',
    },
    {
      name: 'Web Team',
      lob: 'Digital Products',
      projects: 7,
      components: 98,
      members: 22,
      health: 94,
      trend: 'M0,20 Q15,8 30,15 T60,5 T90,2',
    },
    {
      name: 'Data Platform',
      lob: 'Data & Analytics',
      projects: 6,
      components: 86,
      members: 18,
      health: 93,
      trend: 'M0,18 Q15,10 30,12 T60,8 T90,5',
    },
    {
      name: 'Platform DevEx',
      lob: 'Platform Engineering',
      projects: 5,
      components: 74,
      members: 16,
      health: 92,
      trend: 'M0,22 Q15,12 30,18 T60,10 T90,8',
    },
    {
      name: 'ERP Team',
      lob: 'Business Systems',
      projects: 5,
      components: 63,
      members: 14,
      health: 91,
      trend: 'M0,20 Q15,15 30,12 T60,8 T90,5',
    },
    {
      name: 'Mobile Team',
      lob: 'Digital Products',
      projects: 5,
      components: 78,
      members: 15,
      health: 90,
      trend: 'M0,25 Q15,18 30,20 T60,10 T90,6',
    },
    {
      name: 'Support Platform',
      lob: 'Customer Success',
      projects: 4,
      components: 60,
      members: 14,
      health: 90,
      trend: 'M0,18 Q15,14 30,16 T60,8 T90,4',
    },
    {
      name: 'Security Team',
      lob: 'Platform Engineering',
      projects: 4,
      components: 52,
      members: 12,
      health: 88,
      trend: 'M0,15 Q15,18 30,12 T60,20 T90,14',
    },
    {
      name: 'Analytics Team',
      lob: 'Data & Analytics',
      projects: 4,
      components: 55,
      members: 12,
      health: 87,
      trend: 'M0,20 Q15,15 30,18 T60,12 T90,10',
    },
    {
      name: 'Automation Team',
      lob: 'Business Systems',
      projects: 3,
      components: 42,
      members: 8,
      health: 86,
      trend: 'M0,25 Q15,20 30,22 T60,15 T90,12',
    },
    {
      name: 'Design System',
      lob: 'Digital Products',
      projects: 3,
      components: 45,
      members: 10,
      health: 85,
      trend: 'M0,22 Q15,18 30,20 T60,14 T90,12',
    },
    {
      name: 'CS Ops Team',
      lob: 'Customer Success',
      projects: 2,
      components: 30,
      members: 6,
      health: 64, // Fall into Needs Attention (50-69%)
      trend: 'M0,15 Q15,22 30,18 T60,25 T90,20',
    },
  ];

  // --- AI Insights List ---
  const aiInsights = [
    {
      id: 1,
      title: 'Team Alpha health dropped 20%',
      subtitle: 'Mainly due to documentation debt in 3 projects',
      type: 'critical',
      borderColor: 'border-red-100',
      bgColor: 'bg-red-50/40',
      iconColor: 'text-red-500',
      iconBg: 'bg-red-100/60',
    },
    {
      id: 2,
      title: 'Project Mercury missing wiki',
      subtitle: 'No documentation found. Consider creating one.',
      type: 'warning',
      borderColor: 'border-amber-100',
      bgColor: 'bg-amber-50/40',
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-100/60',
    },
    {
      id: 3,
      title: '3 components have no owner',
      subtitle: 'Assign owners to improve accountability',
      type: 'info',
      borderColor: 'border-yellow-100',
      bgColor: 'bg-yellow-50/30',
      iconColor: 'text-yellow-600',
      iconBg: 'bg-yellow-100/60',
    },
    {
      id: 4,
      title: '2 pipelines failing',
      subtitle: 'Across Platform Core and DevEx Team',
      type: 'pipeline',
      borderColor: 'border-purple-100',
      bgColor: 'bg-purple-50/40',
      iconColor: 'text-purple-500',
      iconBg: 'bg-purple-100/60',
    },
  ];

  // --- Filtering & Sorting ---
  const filteredTeams = useMemo(() => {
    let result = [...initialTeams];

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.lob.toLowerCase().includes(q)
      );
    }

    if (selectedLOB !== 'All LOBs') {
      result = result.filter((t) => t.lob === selectedLOB);
    }

    if (sortBy === 'Health') {
      result.sort((a, b) => b.health - a.health);
    } else if (sortBy === 'Name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'Members') {
      result.sort((a, b) => b.members - a.members);
    }

    return result;
  }, [searchQuery, selectedLOB, sortBy]);

  // Donut chart calculations
  const chartData = [
    { name: 'Excellent (90-100%)', value: 7, color: '#30D158' },
    { name: 'Good (70-89%)', value: 4, color: '#FF9F0A' },
    { name: 'Needs Attention (50-69%)', value: 1, color: '#FF6B6B' },
    { name: 'Critical (<50%)', value: 0, color: '#FF453A' },
  ];

  const getHealthColor = (score: number) => {
    if (score >= 90) return '#30D158';
    if (score >= 70) return '#FF9F0A';
    if (score >= 50) return '#FF6B6B';
    return '#FF453A';
  };

  return (
    <div className={`p-6 min-h-screen transition-all duration-300 ${isFullscreen ? 'bg-slate-900 text-white z-50 fixed inset-0 overflow-y-auto' : 'bg-slate-50/60'}`}>
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Teams
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualize and manage your organization across Lines of Business
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search teams, LOBs, projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-64 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-slate-800 shadow-sm"
            />
          </div>

          {/* Refresh Action */}
          <button 
            onClick={() => { setSearchQuery(''); setSelectedLOB('All LOBs'); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
            Refresh
          </button>

          {/* New Team Action */}
          <button 
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-md shadow-blue-100 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Team
          </button>
        </div>
      </div>

      {/* --- STAT CARDS --- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((card, idx) => {
          const IconComponent = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md hover:border-slate-200 transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 duration-300"
                  style={{ backgroundColor: card.bgColor }}
                >
                  <IconComponent className="w-5 h-5" style={{ color: card.color }} />
                </div>
                
                {/* Micro trend tag */}
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                  card.trendType === 'up' ? 'text-green-600 bg-green-50' : 
                  card.trendType === 'down' ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-50'
                }`}>
                  {card.trendType === 'up' && '▲'}
                  {card.trendType === 'down' && '▼'}
                  {card.trend}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-800 leading-none tracking-tight">
                  {card.value}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-1.5 uppercase tracking-wider">
                  {card.title}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* --- GRID LAYOUT FOR SECTIONS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- LEFT COLUMNS: ORG MAP & TEAMS LIST --- */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* --- ORGANIZATION MAP CARD --- */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  Organization Map
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Explore your organization hierarchy</p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white rounded-lg border border-slate-200/60 shadow-xs">
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                  View
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <div className="h-4 w-px bg-slate-200 mx-1" />
                <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">+</button>
                <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">-</button>
                <button 
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tree Map Container */}
            <div className="relative pt-6 pb-4 overflow-x-auto min-w-[650px] scrollbar-thin select-none">
              
              {/* Absolute SVG for Tree Connecting Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-200/80 stroke-2 fill-none">
                {/* Center Root -> Center Level 1 Horizontal Hub line */}
                <path d="M 380 48 L 380 72" />
                
                {/* Horizontal hub line connecting LOB cards */}
                <path d="M 75 72 L 685 72" />

                {/* Vertical lines connecting LOB cards to Horizontal hub */}
                <path d="M 75 72 L 75 92" />
                <path d="M 227 72 L 227 92" />
                <path d="M 380 72 L 380 92" />
                <path d="M 532 72 L 532 92" />
                <path d="M 685 72 L 685 92" />
              </svg>

              {/* LEVEL 0: Company Card */}
              <div className="flex justify-center mb-10 relative z-10">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-2.5 text-center shadow-xs flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-white">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-blue-900 leading-tight">Company</p>
                    <p className="text-[10px] font-semibold text-blue-600/80">5 LOBs</p>
                  </div>
                </div>
              </div>

              {/* LEVEL 1: The 5 LOB Columns */}
              <div className="grid grid-cols-5 gap-3.5 relative z-10">
                
                {/* Column 1: Platform Engineering */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center shadow-xs hover:border-blue-300 transition-colors">
                    <p className="text-xs font-bold text-slate-800 leading-tight flex items-center justify-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      Platform Eng
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 mt-0.5">3 Teams</p>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-2.5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Platform Core</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        95%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">DevEx Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        92%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Security Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        88%
                      </span>
                    </div>
                    <button className="w-full text-center text-[10px] font-bold text-blue-600 hover:text-blue-700 pt-1.5 border-t border-slate-50">
                      View all teams →
                    </button>
                  </div>
                </div>

                {/* Column 2: Digital Products */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center shadow-xs hover:border-green-300 transition-colors">
                    <p className="text-xs font-bold text-slate-800 leading-tight flex items-center justify-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-green-500" />
                      Digital Products
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 mt-0.5">3 Teams</p>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-2.5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Web Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        94%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Mobile Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        90%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Design System</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        85%
                      </span>
                    </div>
                    <button className="w-full text-center text-[10px] font-bold text-blue-600 hover:text-blue-700 pt-1.5 border-t border-slate-50">
                      View all teams →
                    </button>
                  </div>
                </div>

                {/* Column 3: Data & Analytics */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center shadow-xs hover:border-purple-300 transition-colors">
                    <p className="text-xs font-bold text-slate-800 leading-tight flex items-center justify-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-500" />
                      Data & Analytics
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 mt-0.5">2 Teams</p>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-2.5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Data Platform</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        93%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Analytics Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        87%
                      </span>
                    </div>
                    <div className="h-6" /> {/* spacer to match height */}
                    <button className="w-full text-center text-[10px] font-bold text-blue-600 hover:text-blue-700 pt-1.5 border-t border-slate-50">
                      View all teams →
                    </button>
                  </div>
                </div>

                {/* Column 4: Business Systems */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center shadow-xs hover:border-orange-300 transition-colors">
                    <p className="text-xs font-bold text-slate-800 leading-tight flex items-center justify-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-orange-500" />
                      Business Sys
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 mt-0.5">2 Teams</p>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-2.5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">ERP Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        91%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Automation</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        86%
                      </span>
                    </div>
                    <div className="h-6" /> {/* spacer to match height */}
                    <button className="w-full text-center text-[10px] font-bold text-blue-600 hover:text-blue-700 pt-1.5 border-t border-slate-50">
                      View all teams →
                    </button>
                  </div>
                </div>

                {/* Column 5: Customer Success */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center shadow-xs hover:border-sky-300 transition-colors">
                    <p className="text-xs font-bold text-slate-800 leading-tight flex items-center justify-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-sky-500" />
                      Cust Success
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 mt-0.5">2 Teams</p>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-2.5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">Support Plat</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        90%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium p-1">
                      <span className="text-slate-600">CS Ops Team</span>
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        64%
                      </span>
                    </div>
                    <div className="h-6" /> {/* spacer to match height */}
                    <button className="w-full text-center text-[10px] font-bold text-blue-600 hover:text-blue-700 pt-1.5 border-t border-slate-50">
                      View all teams →
                    </button>
                  </div>
                </div>

              </div>

              {/* TREE MAP LEGEND */}
              <div className="flex flex-wrap items-center justify-start gap-4 mt-8 pt-4 border-t border-slate-100 text-xs font-semibold text-slate-500">
                <span className="text-slate-400">Health Score:</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />90-100%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />70-89%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" />50-69%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />&lt;50%</span>
              </div>

            </div>
          </div>

          {/* --- TEAMS LIST OVERVIEW TABLE --- */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Teams Overview</h2>
                <p className="text-xs text-slate-400 mt-0.5">All teams at a glance</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* LOB selector dropdown */}
                <select
                  value={selectedLOB}
                  onChange={(e) => setSelectedLOB(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200/80 rounded-xl outline-none text-slate-600 focus:border-blue-500 transition-colors"
                >
                  <option value="All LOBs">All LOBs</option>
                  <option value="Platform Engineering">Platform Engineering</option>
                  <option value="Digital Products">Digital Products</option>
                  <option value="Data & Analytics">Data & Analytics</option>
                  <option value="Business Systems">Business Systems</option>
                  <option value="Customer Success">Customer Success</option>
                </select>

                {/* Sort selector dropdown */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200/80 rounded-xl outline-none text-slate-600 focus:border-blue-500 transition-colors"
                >
                  <option value="Health">Sort by: Health</option>
                  <option value="Name">Sort by: Name</option>
                  <option value="Members">Sort by: Members</option>
                </select>
              </div>
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">LOB</th>
                    <th className="py-3 px-4 text-center">Projects</th>
                    <th className="py-3 px-4 text-center">Components</th>
                    <th className="py-3 px-4 text-center">Members</th>
                    <th className="py-3 px-4 text-center">Health</th>
                    <th className="py-3 px-4 text-center">Trend</th>
                    <th className="py-3 px-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredTeams.slice(0, showAllTeams ? filteredTeams.length : 5).map((team) => (
                    <tr key={team.name} className="text-xs hover:bg-slate-50/50 transition-colors font-semibold text-slate-700">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getHealthColor(team.health) }} />
                        {team.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{team.lob}</td>
                      <td className="py-3.5 px-4 text-center font-bold">{team.projects}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-500">{team.components}</td>
                      <td className="py-3.5 px-4 text-center font-bold">{team.members}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{
                          backgroundColor: `${getHealthColor(team.health)}12`,
                          color: getHealthColor(team.health)
                        }}>
                          {team.health}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <svg className="w-16 h-5 mx-auto" viewBox="0 0 90 25" fill="none">
                          <path 
                            d={team.trend} 
                            stroke={getHealthColor(team.health)} 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                          />
                        </svg>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* "View all teams" expander toggle */}
            <div className="flex justify-center mt-5 pt-3 border-t border-slate-50">
              <button 
                onClick={() => setShowAllTeams(!showAllTeams)}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline transition-all"
              >
                {showAllTeams ? 'Show less teams' : 'View all teams'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

        {/* --- RIGHT COLUMN: AI INSIGHTS & DONUT DISTRIBUTION --- */}
        <div className="space-y-6">
          
          {/* --- AI INSIGHTS CARD --- */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between h-[450px]">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">AI Insights</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">Real-time telemetry diagnostics</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  Powered by KAI
                </div>
              </div>

              {/* Insights List */}
              <div className="space-y-3">
                {aiInsights.map((insight) => (
                  <motion.div
                    key={insight.id}
                    whileHover={{ x: 3 }}
                    className={`flex items-start justify-between p-3.5 rounded-2xl border ${insight.borderColor} ${insight.bgColor} cursor-pointer transition-all duration-200`}
                  >
                    <div className="flex gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${insight.iconBg}`}>
                        {insight.type === 'critical' && <AlertCircle className={`w-4.5 h-4.5 ${insight.iconColor}`} />}
                        {insight.type === 'warning' && <AlertTriangle className={`w-4.5 h-4.5 ${insight.iconColor}`} />}
                        {insight.type === 'info' && <HelpCircle className={`w-4.5 h-4.5 ${insight.iconColor}`} />}
                        {insight.type === 'pipeline' && <Activity className={`w-4.5 h-4.5 ${insight.iconColor}`} />}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{insight.title}</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">{insight.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 self-center" />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* View all insights action */}
            <div className="text-center pt-4 border-t border-slate-50 mt-4">
              <button className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 mx-auto hover:underline transition-all">
                View all insights
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* --- HEALTH DISTRIBUTION DONUT --- */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between h-[420px]">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Health Distribution</h2>
              <p className="text-xs text-slate-400 mt-0.5">Teams by health score</p>

              {/* Chart layout wrapper */}
              <div className="flex items-center justify-between mt-8 relative">
                
                {/* Donut Chart */}
                <div className="w-36 h-36 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={62}
                        paddingAngle={2.5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Center Text displaying overall total teams */}
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-black text-slate-800 leading-none">12</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1">
                      Total Teams
                    </span>
                  </div>
                </div>

                {/* Custom list layout legend matching image right aligned */}
                <div className="flex-1 pl-5 space-y-2.5 text-xs font-semibold text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Excellent <span className="text-slate-400 font-normal">(90-100%)</span>
                    </span>
                    <span className="font-bold text-slate-800 text-[11px]">7 teams (58%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      Good <span className="text-slate-400 font-normal">(70-89%)</span>
                    </span>
                    <span className="font-bold text-slate-800 text-[11px]">4 teams (33%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      Needs Attention <span className="text-slate-400 font-normal">(50-69%)</span>
                    </span>
                    <span className="font-bold text-slate-800 text-[11px]">1 team (8%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Critical <span className="text-slate-400 font-normal">(&lt;50%)</span>
                    </span>
                    <span className="font-bold text-slate-400 text-[11px]">0 teams (0%)</span>
                  </div>
                </div>

              </div>
            </div>

            {/* View Health report footer action */}
            <div className="text-center pt-4 border-t border-slate-50 mt-4">
              <button className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 mx-auto hover:underline transition-all">
                View health report
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

      </div>
      
    </div>
  );
}
