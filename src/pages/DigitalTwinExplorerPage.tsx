import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Eye, Network, GitBranch, Box, Activity, Shield,
  Cpu, Layers, Clock, Brain, Play, Zap, Server, Database,
  ChevronDown, RefreshCw, Globe,
} from 'lucide-react';
import { useDigitalTwinStore } from '@/store/digitalTwinStore';
import { HeroSection } from '@/components/digital-twin/HeroSection';
import { OntologyTreePanel } from '@/components/digital-twin/OntologyTreePanel';
import { KnowledgeGraphPanel } from '@/components/digital-twin/KnowledgeGraphPanel';
import { PropertyInspectorPanel } from '@/components/digital-twin/PropertyInspectorPanel';
import { TimelinePanel } from '@/components/digital-twin/TimelinePanel';
import { SimulationPanel } from '@/components/digital-twin/SimulationPanel';
import { AICopilotPanel } from '@/components/digital-twin/AICopilotPanel';
import {
  DependenciesPanel, InfrastructurePanel, RuntimePanel,
  BusinessPanel, ObservabilityPanel, SecurityPanel,
} from '@/components/digital-twin/TabPanels';

const NAV_TABS = [
  { id: 'topology', label: 'Topology', icon: Network },
  { id: 'knowledge', label: 'Knowledge Graph', icon: GitBranch },
  { id: 'dependencies', label: 'Dependencies', icon: Box },
  { id: 'infrastructure', label: 'Infrastructure', icon: Server },
  { id: 'runtime', label: 'Runtime', icon: Cpu },
  { id: 'business', label: 'Business', icon: Layers },
  { id: 'observability', label: 'Observability', icon: Activity },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'simulation', label: 'Simulation', icon: Play },
  { id: 'ai', label: 'AI Copilot', icon: Brain },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

const ENVIRONMENTS = ['PRODUCTION', 'UAT', 'DR'];

export function DigitalTwinExplorerPage() {
  const {
    loading, error, hero, nodes, edges, ontology, timeline,
    properties, selectedNodeId, applications, simulationResult,
    simulating, aiHistory, aiLoading, activeView, environment,
    fetchApplications, fetchGraph, selectNode, runSimulation,
    askAI, setActiveView, setEnvironment, clearSimulation,
  } = useDigitalTwinStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState('');
  const [showAppDropdown, setShowAppDropdown] = useState(false);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (applications.length > 0 && !selectedApp) {
      const first = applications[0];
      setSelectedApp(first.application_id);
      fetchGraph(first.application_id, environment);
    }
  }, [applications, selectedApp, environment, fetchGraph]);

  const handleSelectApp = (appId: string) => {
    setSelectedApp(appId);
    setShowAppDropdown(false);
    fetchGraph(appId, environment);
  };

  const handleEnvChange = (env: string) => {
    setEnvironment(env);
    setShowEnvDropdown(false);
    if (selectedApp) {
      fetchGraph(selectedApp, env);
    }
  };

  const handleRefresh = () => {
    if (selectedApp) {
      fetchGraph(selectedApp, environment);
    }
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const impactedNodeIds = useMemo(
    () => simulationResult?.impacted_node_ids || [],
    [simulationResult],
  );

  const filteredApps = useMemo(() => {
    if (!searchQuery) return applications;
    return applications.filter((a) =>
      a.application_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.application_id.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [applications, searchQuery]);

  const showOntologySidebar = activeView === 'topology' || activeView === 'knowledge';
  const showPropertyInspector = ['topology', 'knowledge', 'dependencies', 'infrastructure', 'runtime', 'observability', 'security'].includes(activeView);
  const showTimelineBottom = ['topology', 'knowledge', 'dependencies', 'infrastructure', 'runtime', 'business', 'observability', 'security'].includes(activeView);

  const renderCenterPanel = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: '#3B82F6' }} />
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-[12px] font-semibold" style={{ color: '#FF003C' }}>{error}</p>
        </div>
      );
    }
    if (nodes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <Network className="w-10 h-10 mb-3 opacity-20" style={{ color: '#667085' }} />
          <p className="text-[12px] font-medium" style={{ color: '#667085' }}>No graph data</p>
          <p className="text-[10px] mt-1" style={{ color: '#475467' }}>Select an application to build the knowledge graph</p>
        </div>
      );
    }

    switch (activeView) {
      case 'topology':
      case 'knowledge':
        return (
          <KnowledgeGraphPanel
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            impactedNodeIds={impactedNodeIds}
            onSelectNode={selectNode}
          />
        );
      case 'dependencies':
        return <DependenciesPanel nodes={nodes} edges={edges} onSelectNode={selectNode} />;
      case 'infrastructure':
        return <InfrastructurePanel nodes={nodes} onSelectNode={selectNode} />;
      case 'runtime':
        return <RuntimePanel nodes={nodes} hero={hero} onSelectNode={selectNode} />;
      case 'business':
        return <BusinessPanel hero={hero} properties={properties} />;
      case 'observability':
        return <ObservabilityPanel nodes={nodes} properties={properties} onSelectNode={selectNode} />;
      case 'security':
        return <SecurityPanel nodes={nodes} properties={properties} onSelectNode={selectNode} />;
      default:
        return (
          <KnowledgeGraphPanel
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            impactedNodeIds={impactedNodeIds}
            onSelectNode={selectNode}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0B1020' }}>
      {/* ─── Top Header ─── */}
      <header
        className="flex items-center gap-3 px-4 h-[56px] flex-shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(18,24,38,0.6)' }}
      >
        {/* App Search */}
        <div className="relative">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border cursor-pointer transition-all"
            style={{
              borderColor: showAppDropdown ? '#3B82F655' : 'rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              minWidth: 240,
            }}
            onClick={() => setShowAppDropdown(!showAppDropdown)}
          >
            <Search className="w-3.5 h-3.5" style={{ color: '#667085' }} />
            <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: '#E6EAF0' }}>
              {selectedApp || 'Search application...'}
            </span>
            <ChevronDown className="w-3.5 h-3.5" style={{ color: '#667085' }} />
          </div>
          <AnimatePresence>
            {showAppDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-1.5 left-0 right-0 rounded-[12px] border z-50 overflow-hidden"
                style={{
                  background: 'rgba(18,24,38,0.98)',
                  borderColor: 'rgba(255,255,255,0.08)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                }}
              >
                <div className="p-2 border-b border-white/[0.04]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search applications..."
                    autoFocus
                    className="w-full px-2.5 py-1.5 text-[11px] rounded-[8px] border border-white/[0.06] outline-none"
                    style={{ background: 'rgba(255,255,255,0.02)', color: '#E6EAF0' }}
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
                  {filteredApps.map((app) => (
                    <button
                      key={app.application_id}
                      onClick={() => handleSelectApp(app.application_id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-all text-left"
                    >
                      <Eye className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#3B82F6' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate" style={{ color: '#E6EAF0' }}>
                          {app.application_name}
                        </p>
                        <p className="text-[9px]" style={{ color: '#667085' }}>
                          {app.application_id} · {app.asset_count} assets · {app.environments.join(', ')}
                        </p>
                      </div>
                    </button>
                  ))}
                  {filteredApps.length === 0 && (
                    <p className="px-3 py-4 text-center text-[11px]" style={{ color: '#667085' }}>No applications found</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Environment Selector */}
        <div className="relative">
          <button
            onClick={() => setShowEnvDropdown(!showEnvDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border transition-all"
            style={{
              borderColor: showEnvDropdown ? '#3B82F655' : 'rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <Globe className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
            <span className="text-[11px] font-semibold" style={{ color: '#E6EAF0' }}>{environment}</span>
            <ChevronDown className="w-3 h-3" style={{ color: '#667085' }} />
          </button>
          <AnimatePresence>
            {showEnvDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full mt-1.5 left-0 rounded-[10px] border z-50 overflow-hidden py-1"
                style={{ background: 'rgba(18,24,38,0.98)', borderColor: 'rgba(255,255,255,0.08)', minWidth: 140 }}
              >
                {ENVIRONMENTS.map((env) => (
                  <button
                    key={env}
                    onClick={() => handleEnvChange(env)}
                    className="w-full px-3 py-1.5 text-[11px] font-medium text-left hover:bg-white/[0.03] transition-all"
                    style={{ color: env === environment ? '#3B82F6' : '#98A2B3' }}
                  >
                    {env}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1" />

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] transition-all"
          style={{ color: '#667085', background: 'rgba(255,255,255,0.02)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#3B82F6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#667085'; }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-[8px] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)' }}
          >
            <Eye className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-[12px] font-bold leading-tight" style={{ color: '#E6EAF0' }}>LiveLens Digital Twin</p>
            <p className="text-[8px] uppercase tracking-wider leading-tight" style={{ color: '#667085' }}>Enterprise Explorer</p>
          </div>
        </div>
      </header>

      {/* ─── Digital Twin Navigation Bar ─── */}
      <nav
        className="flex items-center gap-1 px-4 h-[40px] flex-shrink-0 border-b overflow-x-auto scrollbar-none"
        style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(11,16,32,0.5)' }}
      >
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] transition-all whitespace-nowrap"
              style={{
                background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: isActive ? '#3B82F6' : '#667085',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#98A2B3'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#667085'; }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="text-[11px] font-semibold">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute -bottom-[1px] left-2 right-2 h-[2px] rounded-full"
                  style={{ background: '#3B82F6' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* ─── Hero Section ─── */}
      {hero && (
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <HeroSection hero={hero} />
        </div>
      )}

      {/* ─── Main Layout ─── */}
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        {activeView === 'simulation' ? (
          /* ─── Simulation Full View ─── */
          <div
            className="flex-1 rounded-[16px] border border-white/[0.05] overflow-hidden"
            style={{ background: 'rgba(18,24,38,0.6)' }}
          >
            <SimulationPanel
              appId={selectedApp}
              environment={environment}
              simulating={simulating}
              simulationResult={simulationResult}
              onRun={(scenario, target) => runSimulation({ app_id: selectedApp, environment, scenario, target })}
              onClear={clearSimulation}
            />
          </div>
        ) : activeView === 'ai' ? (
          /* ─── AI Copilot Full View ─── */
          <div className="flex-1 flex gap-2">
            <div
              className="flex-1 rounded-[16px] border border-white/[0.05] overflow-hidden"
              style={{ background: 'rgba(11,16,32,0.4)' }}
            >
              {renderCenterPanel()}
            </div>
            <div
              className="w-[380px] flex-shrink-0 rounded-[16px] border border-white/[0.05] overflow-hidden"
              style={{ background: 'rgba(18,24,38,0.6)' }}
            >
              <AICopilotPanel
                aiHistory={aiHistory}
                aiLoading={aiLoading}
                onAsk={(q) => askAI(q, selectedApp, environment)}
                appId={selectedApp}
              />
            </div>
          </div>
        ) : (
          /* ─── Standard Layout (ontology sidebar + center + property inspector) ─── */
          <>
            {showOntologySidebar && (
              <div
                className="w-[280px] flex-shrink-0 rounded-[16px] border border-white/[0.05] overflow-hidden"
                style={{ background: 'rgba(18,24,38,0.6)' }}
              >
                <OntologyTreePanel ontology={ontology} />
              </div>
            )}

            <div
              className="flex-1 rounded-[16px] border border-white/[0.05] overflow-hidden relative"
              style={{ background: 'rgba(11,16,32,0.4)' }}
            >
              {renderCenterPanel()}

              {simulationResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-[10px] border"
                  style={{
                    background: 'rgba(255,0,60,0.1)',
                    borderColor: 'rgba(255,0,60,0.2)',
                  }}
                >
                  <Zap className="w-3.5 h-3.5" style={{ color: '#FF003C' }} />
                  <span className="text-[10px] font-bold" style={{ color: '#FF6B7A' }}>
                    SIMULATION ACTIVE: {simulationResult.scenario_label}
                  </span>
                </motion.div>
              )}
            </div>

            {showPropertyInspector && (
              <div
                className="w-[300px] flex-shrink-0 rounded-[16px] border border-white/[0.05] overflow-hidden"
                style={{ background: 'rgba(18,24,38,0.6)' }}
              >
                <PropertyInspectorPanel properties={properties} selectedNode={selectedNode} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Bottom Panel - Timeline ─── */}
      {showTimelineBottom && (
        <div
          className="h-[100px] flex-shrink-0 mx-2 mb-2 rounded-[14px] border border-white/[0.05] overflow-hidden"
          style={{ background: 'rgba(18,24,38,0.6)' }}
        >
          <TimelinePanel events={timeline} />
        </div>
      )}
    </div>
  );
}
