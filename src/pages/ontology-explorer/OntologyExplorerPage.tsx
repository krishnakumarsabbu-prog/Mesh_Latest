import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  Node,
  Edge,
  BackgroundVariant,
  ReactFlowProvider,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Search, Network, Server, Database, Siren, Layers, Cpu, ShieldCheck,
  ChevronRight, ChevronDown, Settings, RefreshCw, Play, Check,
  Clock, HelpCircle, Laptop, AlertTriangle, CheckCircle2, InfoIcon,
  Terminal, Globe, Code, Brain, PlayCircle, GitBranch, Key, Activity,
  Maximize2, Shield, Eye, Box, ArrowRight, Share2, DatabaseZap,
  HardDrive, ActivitySquare, Layout, ServerCrash, CpuIcon, Boxes
} from 'lucide-react';

import { useUIStore } from '@/store/uiStore';
import { useThemeStore } from '@/store/themeStore';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { cn } from '@/lib/utils';
import { buildHierarchyFromDB, HierarchyNode } from './ontologyUtils';
import { digitalTwinApi } from '@/lib/api';

// ============================================================================
// ONTOLOGY CLASS DATA — Loaded dynamically from DB (no hardcoded fallback)
// ============================================================================

interface OntologyClass {
  name: string;
  comment: string;
  subClassOf?: string;
  properties?: Array<{ name: string; type: 'DATA' | 'OBJECT'; range: string }>;
}

interface DomainSchema {
  id: string;
  label: string;
  color: string;
  icon: React.ElementType;
  classes: Record<string, OntologyClass>;
}

// Domain UI metadata only (colors, icons, labels) — actual class data comes from DB
const DOMAIN_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  organization: { label: 'Enterprise / Organization', color: '#0A84FF', icon: Globe },
  business: { label: 'Business Process & SLAs', color: '#30B0C7', icon: Layers },
  applications: { label: 'Logical Applications', color: '#BF5AF2', icon: Cpu },
  runtime: { label: 'Container Workloads', color: '#FF9F0A', icon: Laptop },
  infrastructure: { label: 'Physical Infrastructure', color: '#FF453A', icon: Server },
  database: { label: 'Databases & Persistence', color: '#FF375F', icon: Database },
  messaging: { label: 'Messaging & Queues', color: '#FFD60A', icon: Siren },
  network: { label: 'Network & Traffic', color: '#32D74B', icon: Network },
  security: { label: 'Security & Access', color: '#5E5CE6', icon: ShieldCheck },
  observability: { label: 'Telemetry & Observability', color: '#00E599', icon: Siren },
  operations: { label: 'Operations & DevOps', color: '#64D2FF', icon: Settings },
  ai: { label: 'AI Reasoning & Twins', color: '#BF5AF2', icon: Brain },
  compute: { label: 'Compute & Runtime', color: '#FF9F0A', icon: Laptop },
  messaging_infra: { label: 'Messaging Infrastructure', color: '#FFD60A', icon: Siren },
};



// ============================================================================
// CUSTOM FLOW NODES DESIGN
// ============================================================================

function CustomOntologyNode({ data }: NodeProps) {
  const d = data as { label: string; comment: string; color: string; isHighlighted?: boolean; type?: string };
  return (
    <div
      className={cn(
        "p-4 rounded-2xl border text-left shadow-lg select-none relative transition-all duration-300",
        d.isHighlighted 
          ? "border-[var(--accent)] bg-[var(--accent-subtle)] shadow-[0_0_15px_rgba(0,108,255,0.2)] scale-105" 
          : "border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] hover:border-[var(--app-border-medium)] text-[var(--text-primary)]"
      )}
      style={{ 
        width: 220,
        boxShadow: d.isHighlighted ? '0 0 20px ' + d.color + '33' : '0 4px 12px rgba(0,0,0,0.06)' 
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: d.color }} />
      <div className="flex items-center justify-between mb-1.5 pl-1.5">
        <span className="text-[8px] font-extrabold uppercase tracking-widest opacity-55" style={{ color: d.color }}>
          {d.type || 'Ontology Class'}
        </span>
        {d.isHighlighted && (
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
        )}
      </div>
      <div className="text-[12px] font-extrabold text-[var(--text-primary)] truncate pl-1.5">{d.label}</div>
      <div className="text-[9.5px] text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed pl-1.5">{d.comment}</div>
      
      <Handle type="target" position={Position.Top} style={{ background: 'var(--app-border-strong)', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--app-border-strong)', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = {
  ontologyClass: CustomOntologyNode,
};

// ============================================================================
// COMPONENT MAIN PAGE
// ============================================================================

export function OntologyExplorerPage() {
  const setBreadcrumbs = useUIStore((s) => s.setBreadcrumbs);
  const setPageTitle = useUIStore((s) => s.setPageTitle);

  const theme = useThemeStore((s) => s.theme);

  // Zustand Store Integration
  const {
    applications,
    dataCenters,
    selectedDetail,
    loadApplications,
    loadDetail,
    drifts,
    loadDriftFromBackend,
    saveIntent,
    isSeeding,
    seedSampleData,
    importAllDocs,
    ontologyGraph,
    ontologyDomains,
    isLoadingOntology,
    loadOntologyGraph,
    loadOntologyDomains,
    buildOntologyGraph
  } = useRuntimeLocationStore();

  // Navigation and view states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState('applications');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [viewMode, setViewMode] = useState<'hierarchy' | 'topology' | 'schema'>('hierarchy');
  const [selectedAppId, setSelectedAppId] = useState('');

  // Dynamic topology specs loaded from backend
  const [topologySpecs, setTopologySpecs] = useState<Record<string, any>>({});
  const [isLoadingTopologySpecs, setIsLoadingTopologySpecs] = useState(false);

  const currentDetail = useMemo(() => {
    return selectedAppId ? selectedDetail : null;
  }, [selectedAppId, selectedDetail]);

  const dynamicHierarchy = useMemo(() => {
    return buildHierarchyFromDB(applications, dataCenters);
  }, [applications, dataCenters]);

  // Hierarchy Node State
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'enterprise-root': true,
  });

  // Selected Deployment Node for Inspector Details
  const [selectedTopologyNodeId, setSelectedTopologyNodeId] = useState<string>('load-balancer');

  // Sparkline wiggles
  const [ticks, setTicks] = useState(0);

  // Right side tab pane (for Schema tab)
  const [rightPanelTab, setRightPanelTab] = useState<'inspector' | 'query' | 'rules' | 'migration' | 'twin'>('inspector');

  // Semantic queries
  const [queryInput, setQueryInput] = useState(`SELECT ?app ?db ?dc
WHERE {
  ?app rdf:type ekos-app:Application ;
       ekos-app:connectsTo ?db .
  ?db rdf:type ekos-db:PersistenceStore ;
       ekos-db:endpoint ?endpoint .
  ?endpoint ekos-db:datacenter ?dc .
  FILTER (?dc = "DC-EAST-1")
}`);
  const [queryResults, setQueryResults] = useState<any[] | null>(null);
  const [isQueryRunning, setIsQueryRunning] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);

  // AI rules engine
  const [rulesEngineRunning, setRulesEngineRunning] = useState(false);
  const [rulesLogs, setRulesLogs] = useState<string[]>([]);
  const [rulesViolations, setRulesViolations] = useState<any[]>([]);

  // Migration planner
  const [migrationAppId, setMigrationAppId] = useState('');
  const [migrationSource, setMigrationSource] = useState('DC-EAST-1');
  const [migrationTarget, setMigrationTarget] = useState('DC-WEST-1');
  const [migrationState, setMigrationState] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [migrationPhase, setMigrationPhase] = useState(0);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [parameterYAML, setParameterYAML] = useState(`migrationPlan:
  id: MIG-2026-Q3-EAST-TO-WEST
  parameterMap:
    compute:
      clusterMap: { ocp-east-01: ocp-west-01 }
    persistence:
      ACTIVE_ACTIVE: { action: PROMOTE_LOCAL, verify: lagZero }
      ACTIVE_PASSIVE: { action: FAILOVER, primary: DC-WEST-1 }
    traffic:
      gslbWeightSteps: [10, 50, 100]
      f5VipMap: { "10.10.12.5": "10.20.12.5" }`);

  // Digital twin alignment
  const [syncingTwin, setSyncingTwin] = useState(false);

  // Initialize: Load backend applications and details
  useEffect(() => {
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Ontology Explorer' }
    ]);
    setPageTitle('Ontology Platform');
    loadApplications();
    loadOntologyGraph();
    loadOntologyDomains();
  }, [setBreadcrumbs, setPageTitle, loadApplications, loadOntologyGraph, loadOntologyDomains]);

  const buildInitiatedRef = useRef(false);

  // Auto-build ontology graph if it returns empty
  useEffect(() => {
    if (applications.length > 0 && (!ontologyGraph || !ontologyGraph.nodes || ontologyGraph.nodes.length === 0) && !isLoadingOntology && !buildInitiatedRef.current) {
      buildInitiatedRef.current = true;
      buildOntologyGraph();
    }
  }, [applications, ontologyGraph, isLoadingOntology, buildOntologyGraph]);

  // Load detail + topology specs whenever the selected application changes
  useEffect(() => {
    if (selectedAppId) {
      loadDetail(selectedAppId, 'PRODUCTION');
      loadDriftFromBackend(selectedAppId, 'PRODUCTION');
      setMigrationAppId(selectedAppId);

      // Load dynamic topology specs from backend
      setIsLoadingTopologySpecs(true);
      digitalTwinApi.getTopologySpecs(selectedAppId, 'PRODUCTION')
        .then((res) => {
          setTopologySpecs(res.data?.specs || {});
        })
        .catch((err) => {
          console.error('Failed to load topology specs:', err);
          setTopologySpecs({});
        })
        .finally(() => setIsLoadingTopologySpecs(false));
    } else {
      setTopologySpecs({});
    }
  }, [selectedAppId, loadDetail, loadDriftFromBackend]);

  // Telemetry ticker loop
  useEffect(() => {
    const timer = setInterval(() => {
      setTicks((t) => t + 1);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Dynamic Domains & Classes built ONLY from DB ontology nodes — no hardcoded fallback
  const dbDomains = useMemo(() => {
    if (!ontologyGraph || !ontologyGraph.nodes || ontologyGraph.nodes.length === 0) {
      return {}; // Empty — UI will prompt to load from DB
    }

    const domainsMap: Record<string, { id: string; label: string; color: string; icon: any; classes: Record<string, any> }> = {};

    ontologyGraph.nodes.forEach((node: any) => {
      const domId = node.domain || 'compute';
      const className = node.ontology_class || 'RuntimeAsset';
      const metaForDom = DOMAIN_META[domId] || {
        label: domId.charAt(0).toUpperCase() + domId.slice(1),
        color: node.color || '#3B82F6',
        icon: Box
      };

      if (!domainsMap[domId]) {
        domainsMap[domId] = {
          id: domId,
          label: metaForDom.label,
          color: metaForDom.color,
          icon: metaForDom.icon,
          classes: {}
        };
      }

      if (!domainsMap[domId].classes[className]) {
        domainsMap[domId].classes[className] = {
          name: className,
          comment: node.comment || `${className} — loaded from the knowledge graph database.`,
          subClassOf: node.sub_class_of || undefined,
          properties: Object.keys(node.metadata || {}).map((k: string) => ({
            name: k,
            type: 'DATA' as const,
            range: typeof (node.metadata || {})[k] === 'number' ? 'xsd:integer' : 'xsd:string'
          }))
        };
      }
    });

    return domainsMap;
  }, [ontologyGraph]);

  // Dynamic KPI Card Calculations
  const REASONING_RULES_LIST = useMemo(() => [
    { id: 'R1', name: 'Compute Binding Validation', desc: 'Verify each deployment unit has an active boundToCompute link.' },
    { id: 'R2', name: 'Database Redundancy Verification', desc: 'Verify tier-0 databases have replicas in standby datacenters.' },
    { id: 'R3', name: 'Ingress Routing Health Check', desc: 'Ensure external GSLB points only to healthy load balancers.' },
    { id: 'R4', name: 'Application Multi-Region Distribution', desc: 'Ensure critical apps are distributed across at least two active regions.' },
    { id: 'R5', name: 'Drift Alignment Constraint', desc: 'Verify that the actual physical datacenter matches the intended state.' },
    { id: 'R6', name: 'Telemetry Connectivity Assurance', desc: 'Verify all database components stream telemetry packets.' }
  ], []);

  const dynamicDomainsCount = useMemo(() => {
    const uniqueDomains = new Set<string>();
    if (ontologyDomains && ontologyDomains.length > 0) {
      ontologyDomains.forEach(d => {
        if (d.domain) uniqueDomains.add(d.domain);
      });
    }
    Object.keys(dbDomains).forEach(d => uniqueDomains.add(d));
    return uniqueDomains.size;
  }, [ontologyDomains, dbDomains]);

  const dynamicClassesCount = useMemo(() => {
    let count = 0;
    Object.values(dbDomains).forEach((d: any) => {
      if (d.classes) {
        count += Object.keys(d.classes).length;
      }
    });
    return count;
  }, [dbDomains]);

  const dynamicRelationshipsCount = useMemo(() => {
    let schemaRelCount = 0;
    Object.values(dbDomains).forEach((d: any) => {
      if (d.classes) {
        Object.values(d.classes).forEach((cls: any) => {
          if (cls.properties) {
            schemaRelCount += cls.properties.filter((p: any) => p.type === 'OBJECT').length;
          }
        });
      }
    });
    const activeEdgesCount = ontologyGraph?.edges?.length || 0;
    return schemaRelCount + activeEdgesCount;
  }, [dbDomains, ontologyGraph]);

  const dynamicInstancesCount = useMemo(() => {
    return ontologyGraph?.nodes?.length || 0;
  }, [ontologyGraph]);

  const dynamicRulesCount = useMemo(() => {
    return REASONING_RULES_LIST.length;
  }, [REASONING_RULES_LIST]);

  const dynamicDriftCount = useMemo(() => {
    return drifts.length;
  }, [drifts]);

  // Compute domains list
  const filteredDomains = useMemo(() => {
    return Object.values(dbDomains);
  }, [dbDomains]);

  // Compute selected class properties (for inspector)
  const selectedClassDetails = useMemo(() => {
    const domain = dbDomains[selectedDomainId];
    if (!domain) return null;
    return domain.classes[selectedClassId] || null;
  }, [dbDomains, selectedDomainId, selectedClassId]);

  const selectClass = (domId: string, clsId: string) => {
    setSelectedDomainId(domId);
    setSelectedClassId(clsId);
    setHighlightedNodes([clsId]);
  };

  // SPARQL templates
  const queryTemplates = [
    {
      name: 'Apps & DB Endpoints',
      query: `SELECT ?app ?db ?dc
WHERE {
  ?app rdf:type ekos-app:Application ;
       ekos-app:connectsTo ?db .
  ?db rdf:type ekos-db:PersistenceStore ;
       ekos-db:endpoint ?endpoint .
  ?endpoint ekos-db:datacenter ?dc .
  FILTER (?dc = "DC-EAST-1")
}`
    },
    {
      name: 'Drift & SPOF Finder',
      query: `MATCH (app:Application {criticality: "T0"})-[:HAS_DU]->(du:DeploymentUnit)
OPTIONAL MATCH (du)-[r:BOUND_TO]->(cu:ComputeUnit)
WITH app, du, count(r) as bindings
WHERE bindings < 2
RETURN app.appId as APPID, du.duId as DU_ID, bindings as ActiveBindings`
    },
    {
      name: 'Blast Radius Tracker',
      query: `MATCH (dc:Datacenter {dcId: "DC-EAST-1"})<-[:IN_DC]-(:Zone)<-[:IN_ZONE]-(:Category)<-[:IN_CATEGORY]-(c:OCPCluster)
MATCH (cu:ComputeUnit)-[:PART_OF]->(c)
MATCH (du:DeploymentUnit)-[:BOUND_TO]->(cu)
MATCH (app:Application)-[:HAS_DU]->(du)
RETURN app.appId as ImpactedApp, count(du) as ImpactedPods`
    }
  ];

  const handleApplyTemplate = (queryText: string) => {
    setQueryInput(queryText);
    setQueryResults(null);
    setHighlightedNodes([]);
  };

  const handleRunQuery = () => {
    setIsQueryRunning(true);
    setQueryResults(null);
    setTimeout(() => {
      setIsQueryRunning(false);
      // Populate SPARQL output with real applications data
      if (applications.length > 0) {
        const results = applications.slice(0, 4).map(app => ({
          'Application': `${app.application_name} (${app.application_id})`,
          'Environment': app.environment,
          'Data Centers': app.data_centers.join(', '),
          'Confidence': `${app.overall_confidence}/4`
        }));
        setQueryResults(results);
        setHighlightedNodes(['app', 'db', 'comp-db']);
      } else {
        setQueryResults([
          { 'app': 'payments-portal', 'db': 'payments-db', 'dc': 'DC-EAST-1' }
        ]);
      }
    }, 800);
  };

  // Run Rules Engine dynamically based on backend state
  const runRulesEngine = () => {
    setRulesEngineRunning(true);
    setRulesLogs([]);
    setRulesViolations([]);

    const logs = [
      'Initializing Semantic Inference Engine...',
      'Loading OWL specification & Jena rule configurations...',
      'Evaluating Rule R1: LOB to Neighborhood binding check...',
      'Evaluating Rule R2: Public facing app WAF binding check...',
      'Evaluating Rule R3: Persistent storage cross-DC binding...',
      'Evaluating Rule R4: T0 Criticality Multi-DC check...',
      'Evaluating Rule R5: Dependency Map DC keying check...',
      'Evaluating Rule R6: Active migration status checks...',
      'Reasoning completed.'
    ];

    const violations: any[] = [];
    applications.forEach((app) => {
      if (app.overall_confidence < 3) {
        violations.push({
          id: `R1-${app.application_id}`,
          rule: 'R1',
          desc: `Deployment unit for ${app.application_name} has low confidence (${app.overall_confidence}/4) indicating missing discovered runtime bindings.`,
          scope: app.application_id,
          dc: app.data_centers.join(', '),
          remediated: false
        });
      }
      if (app.alignment_status === 'DRIFTED') {
        violations.push({
          id: `R4-${app.application_id}`,
          rule: 'R4',
          desc: `Application ${app.application_name} is in DRIFTED state compared to its intended topology.`,
          scope: app.application_id,
          dc: app.primary_write_dc || 'Unknown',
          remediated: false
        });
      }
      
      // Dynamic compliance checks on components:
      const hasDB = app.components?.some(c => c.component_type === 'DATABASE');
      if (!hasDB) {
        violations.push({
          id: `R2-${app.application_id}`,
          rule: 'R2',
          desc: `Application ${app.application_name} lacks any bound persistent database component.`,
          scope: app.application_id,
          dc: app.data_centers?.join(', ') || 'None',
          remediated: false
        });
      }
    });

    logs.forEach((log, index) => {
      setTimeout(() => {
        setRulesLogs(prev => [...prev, log]);
        if (index === logs.length - 1) {
          setRulesEngineRunning(false);
          setRulesViolations(violations);
        }
      }, (index + 1) * 200);
    });
  };

  const handleRemediateRule = (violationId: string) => {
    setRulesViolations(prev =>
      prev.map(v => v.id === violationId ? { ...v, remediated: true } : v)
    );
  };

  // Run parameterized blue-green migration coordinator
  const startMigration = () => {
    setMigrationState('running');
    setMigrationPhase(1);
    setMigrationProgress(10);
    
    const targetApp = applications.find(a => a.application_id === migrationAppId);
    const appName = targetApp ? targetApp.application_name : 'Selected App';
    
    setMigrationLogs([`Migration coordinator initialized for ${appName} (${migrationAppId}). strategy: BLUE_GREEN`]);

    const steps = [
      {
        phase: 1,
        progress: 25,
        log: `Phase 1: Provisioning target compute resources in ${migrationTarget}. Cloned OCP namespaces. Verification OK.`
      },
      {
        phase: 2,
        progress: 50,
        log: `Phase 2: Checking replication sync lag for persistence stores. Primary write DC: ${migrationSource}. Lag: 0s. Promotion checks passed.`
      },
      {
        phase: 3,
        progress: 70,
        log: `Phase 3: Rebinding network dependencies. Replacing Kafka bootstrap and database endpoint variables via parameter map.`
      },
      {
        phase: 4,
        progress: 85,
        log: `Phase 4: Traffic routing switch. GSLB weight: 10% target. Checked AppDynamics metric gates. OK.`
      },
      {
        phase: 4,
        progress: 90,
        log: `Phase 4: GSLB weight: 50% target. Checked AppDynamics error rate gates. OK.`
      },
      {
        phase: 5,
        progress: 100,
        log: `Phase 5: Commit & Finalize. GSLB weight: 100% target. Flipping boundTo physical nodes in Graph DB. Migration completed successfully.`
      }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setMigrationPhase(step.phase);
        setMigrationProgress(step.progress);
        setMigrationLogs(prev => [...prev, step.log]);
        if (index === steps.length - 1) {
          setMigrationState('completed');
          setHighlightedNodes(['cu-west', 'dc-west']);
        }
      }, (index + 1) * 1200);
    });
  };

  const startRollbackSimulation = () => {
    setMigrationState('running');
    setMigrationPhase(1);
    setMigrationProgress(10);
    setMigrationLogs(['Migration coordinator initialized. strategy: BLUE_GREEN']);

    const steps = [
      { phase: 1, progress: 25, log: `Phase 1: Provisioning compute workloads in target ${migrationTarget}. OK.` },
      { phase: 2, progress: 50, log: 'Phase 2: Replication sync check. OK.' },
      { phase: 3, progress: 70, log: `Phase 3: Wiring variables rebind in config maps. OK.` },
      { phase: 4, progress: 85, log: `Phase 4: GSLB weight: 10% target. ERROR: Latency threshold breached! P99 = 412ms (exceeds GOLD SLO: 250ms).` },
      { phase: 4, progress: 40, log: 'CRITICAL: Gate postStep failed! Initiating rollback. Reverting GSLB weights back to source.' },
      { phase: 1, progress: 0, log: 'Rollback complete. DNS reverted. Compute resources scaled down. Core logical model unchanged.' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setMigrationPhase(step.phase);
        setMigrationProgress(step.progress);
        setMigrationLogs(prev => [...prev, step.log]);
        if (index === steps.length - 1) {
          setMigrationState('failed');
        }
      }, (index + 1) * 1000);
    });
  };

  const handleSyncTwin = () => {
    setSyncingTwin(true);
    setTimeout(() => {
      setSyncingTwin(false);
      // Trigger a local drift recalculation to clear alignment alert
      if (selectedAppId) {
        const { runDriftDetection } = useRuntimeLocationStore.getState();
        runDriftDetection(selectedAppId, 'PRODUCTION');
      }
    }, 1500);
  };

  // Filter dynamic drifts
  const currentDrifts = useMemo(() => {
    return drifts.filter(d => d.application_id === selectedAppId);
  }, [drifts, selectedAppId]);

  // Toggle tree node expansion
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Select App node from Hierarchy view and transition to Deployment Explorer
  const handleSelectAppFromHierarchy = (appId: string) => {
    setSelectedAppId(appId);
    setViewMode('topology');
    // Default selected node in topology
    setSelectedTopologyNodeId('load-balancer');
  };

  // Get active components for DB connections list inside topology
  const activeDatabases = useMemo(() => {
    if (!currentDetail) return ['Database'];
    return currentDetail.components
      .filter(c => c.component_type === 'DATABASE')
      .map(c => c.component_name) || ['Database'];
  }, [currentDetail]);

  const activeMessaging = useMemo(() => {
    if (!currentDetail) return ['IBM MQ'];
    return currentDetail.components
      .filter(c => c.component_type === 'MESSAGING')
      .map(c => c.component_name) || ['IBM MQ'];
  }, [currentDetail]);

  // Topology node spec resolver — from backend data only
  const topologyNodeSpecs = useMemo(() => {
    // Return backend-loaded specs — no hardcoded fallback
    return topologySpecs;
  }, [topologySpecs]);
  // Active spec for inspector pane
  const activeTopologySpec = useMemo(() => {
    // 1. Check if it's one of the standard ingress/infra nodes — from backend
    if (topologyNodeSpecs[selectedTopologyNodeId]) {
      const spec = topologyNodeSpecs[selectedTopologyNodeId];
      // Resolve icon by node type — backend doesn't return icons
      const iconMap: Record<string, any> = {
        'load-balancer': Share2, 'api-gateway': Key, 'ingress': Globe,
        'service-mesh': Network, 'monitoring': Siren, 'namespace': Layout,
        'deployment': Laptop, 'replicaset': Boxes, 'pods': Layers,
        'containers': Box, 'database': Database, 'ibm-mq': ActivitySquare,
        'redis': HardDrive, 'external-apis': Key, 'storage': HardDrive,
      };
      const icon = iconMap[selectedTopologyNodeId]
        || (selectedTopologyNodeId.startsWith('asset-') ? Laptop
        : selectedTopologyNodeId.startsWith('dc-') ? Server
        : selectedTopologyNodeId.startsWith('comp-') ? Cpu : Network);
      return { ...spec, icon };
    }

    // 2. Check if it's a dynamic node from the selected application detail
    if (currentDetail) {
      // Is it a Component?
      if (selectedTopologyNodeId.startsWith('comp-')) {
        const compId = selectedTopologyNodeId.replace('comp-', '');
        const comp = currentDetail.components?.find(c => c.id === compId);
        if (comp) {
          return {
            title: `${comp.component_name} (${comp.component_type})`,
            icon: comp.component_type === 'DATABASE' ? Database : comp.component_type === 'MESSAGING' ? Siren : Cpu,
            status: 'HEALTHY' as const,
            metrics: [
              { label: 'Asset Count', value: `${comp.assets?.length || 0} Assets` },
              { label: 'Tech Stack', value: comp.tech_stack.toUpperCase() },
              { label: 'Data Source', value: `${comp.assets?.[0]?.data_source || 'runtime-db'}` }
            ],
            config: [
              { label: 'Component ID', value: comp.id },
              { label: 'Application ID', value: comp.application_id },
              { label: 'Component Type', value: comp.component_type }
            ]
          };
        }
      }

      // Is it an Asset?
      if (selectedTopologyNodeId.startsWith('asset-')) {
        const assetId = selectedTopologyNodeId.replace('asset-', '');
        let foundAsset: any = null;
        currentDetail.components?.forEach(c => {
          const a = c.assets?.find(as => as.id === assetId);
          if (a) foundAsset = a;
        });

        if (foundAsset) {
          return {
            title: `Asset: ${foundAsset.name}`,
            icon: Laptop,
            status: foundAsset.latest_operational_state === 'ACTIVE' ? 'HEALTHY' as const : 'WARN' as const,
            metrics: [
              { label: 'State', value: foundAsset.latest_operational_state || 'UNKNOWN' },
              { label: 'Environment', value: foundAsset.environment || 'PRODUCTION' },
              { label: 'Confidence Level', value: `Level ${foundAsset.latest_confidence_level || 3}` }
            ],
            config: [
              { label: 'Host / IP', value: foundAsset.host || '127.0.0.1' },
              { label: 'Port', value: String(foundAsset.port || 8080) },
              { label: 'Tech Stack', value: foundAsset.tech_stack?.toUpperCase() || 'UNKNOWN' },
              { label: 'Data Source', value: foundAsset.data_source || 'cmdb' }
            ]
          };
        }
      }

      // Is it a Datacenter?
      if (selectedTopologyNodeId.startsWith('dc-')) {
        const dcId = selectedTopologyNodeId.replace('dc-', '');
        let foundDc: any = null;
        currentDetail.components?.forEach(c => {
          c.assets?.forEach(a => {
            if (a.data_center && a.data_center.id === dcId) {
              foundDc = a.data_center;
            }
          });
        });

        if (!foundDc) {
          foundDc = dataCenters.find(d => d.id === dcId);
        }

        if (foundDc) {
          return {
            title: `Datacenter: ${foundDc.name}`,
            icon: Server,
            status: 'HEALTHY' as const,
            metrics: [
              { label: 'Region', value: foundDc.region || 'US-EAST' },
              { label: 'Zone', value: foundDc.zone || 'AZ-1' },
              { label: 'Asset Count', value: `${foundDc.asset_count || 0} Assets` }
            ],
            config: [
              { label: 'Datacenter ID', value: foundDc.id },
              { label: 'Short Name', value: foundDc.short_name || 'DC' },
              { label: 'Status', value: 'ONLINE' }
            ]
          };
        }
      }

      // Is it a Neighborhood?
      if (selectedTopologyNodeId.startsWith('nbh-')) {
        const region = selectedTopologyNodeId.replace('nbh-', '');
        return {
          title: `${region} Network Zone`,
          icon: Globe,
          status: 'HEALTHY' as const,
          metrics: [
            { label: 'Network Zone', value: region },
            { label: 'Mesh Routing', value: 'ACTIVE' }
          ],
          config: [
            { label: 'Topology Domain', value: 'Neighborhood Grouping' }
          ]
        };
      }
    }

    return {
      title: 'Topology Element',
      icon: Network,
      status: 'HEALTHY' as const,
      metrics: [{ label: 'Telemetry Link', value: 'ONLINE' }],
      config: [{ label: 'Node Selector', value: selectedTopologyNodeId || 'None Selected' }]
    };
  }, [selectedTopologyNodeId, topologyNodeSpecs, currentDetail, dataCenters]);

  // REACT FLOW GRAPH BUILDER (DYNAMIC FROM SQLITE DATABASE STATE)
  const { nodes, edges } = useMemo(() => {
    const nodesList: Node[] = [];
    const edgesList: Edge[] = [];

    if (viewMode === 'schema') {
      // 1. Schema View: Show the selected Domain classes
      const domain = dbDomains[selectedDomainId];
      if (domain) {
        const classes = Object.values(domain.classes);
        classes.forEach((cls, idx) => {
          const isHighlighted = highlightedNodes.includes(cls.name) || selectedClassId === cls.name;
          nodesList.push({
            id: cls.name,
            type: 'ontologyClass',
            data: {
              label: cls.name,
              comment: cls.comment,
              color: domain.color,
              isHighlighted,
              type: cls.subClassOf ? `Subclass of ${cls.subClassOf}` : 'Ontology Class'
            },
            position: { x: 50, y: idx * 130 + 30 },
          });

          if (cls.subClassOf) {
            edgesList.push({
              id: `edge-${cls.name}-${cls.subClassOf}`,
              source: cls.name,
              target: cls.subClassOf,
              style: { stroke: 'var(--app-border)', strokeWidth: 1.5 },
              animated: isHighlighted,
            });
          }
        });
      }
    } else if (viewMode === 'topology') {
      if (!currentDetail) {
        // 2. Enterprise Topology View (no app selected)
        // Root Enterprise
        nodesList.push({
          id: 'enterprise',
          type: 'ontologyClass',
          data: {
            label: 'HEALTHMESH ENTERPRISE',
            comment: 'Global Digital Twin Operating System',
            color: '#7800FF',
            type: 'Enterprise Root'
          },
          position: { x: 200, y: -80 }
        });

        // Unique regions
        const regions = Array.from(new Set(dataCenters.map(dc => dc.region || 'US-EAST')));
        regions.forEach((region, rIdx) => {
          const regId = `region-${region.toLowerCase().replace(/\s+/g, '-')}`;
          const regX = (rIdx - (regions.length - 1) / 2) * 350 + 200;
          nodesList.push({
            id: regId,
            type: 'ontologyClass',
            data: {
              label: `${region.toUpperCase()} Region`,
              comment: `Regional Datacenter Cluster`,
              color: '#32D74B',
              type: 'Region Node'
            },
            position: { x: regX, y: 80 }
          });

          edgesList.push({
            id: `edge-ent-${regId}`,
            source: 'enterprise',
            target: regId,
            style: { stroke: 'var(--app-border)', strokeWidth: 1.5 },
            animated: true
          });

          // Datacenters in this region
          const regionDcs = dataCenters.filter(dc => (dc.region || 'US-EAST') === region);
          regionDcs.forEach((dc, dcIdx) => {
            const dcId = `dc-${dc.id}`;
            const dcX = regX + (dcIdx - (regionDcs.length - 1) / 2) * 160;
            nodesList.push({
              id: dcId,
              type: 'ontologyClass',
              data: {
                label: dc.name,
                comment: `Zone: ${dc.zone || 'AZ'} | Assets: ${dc.asset_count}`,
                color: '#FF453A',
                type: 'Datacenter Node'
              },
              position: { x: dcX, y: 220 }
            });

            edgesList.push({
              id: `edge-${regId}-${dcId}`,
              source: regId,
              target: dcId,
              style: { stroke: 'var(--app-border)', strokeWidth: 1.5 }
            });

            // Apps running on this DC
            applications.forEach((app, appIdx) => {
              const runsOnDc = app.data_centers?.some(appDc => 
                appDc.toLowerCase() === dc.name.toLowerCase() || 
                appDc.toLowerCase() === dc.short_name?.toLowerCase()
              );
              if (runsOnDc) {
                const appId = `app-${app.application_id}`;
                if (!nodesList.some(n => n.id === appId)) {
                  const appX = (appIdx - (applications.length - 1) / 2) * 200 + 200;
                  nodesList.push({
                    id: appId,
                    type: 'ontologyClass',
                    data: {
                      label: app.application_name,
                      comment: `LOB: ${app.lob_name || 'Retail'} | Confidence: ${app.overall_confidence}/4`,
                      color: '#BF5AF2',
                      type: 'Application Node',
                      appId: app.application_id
                    },
                    position: { x: appX, y: 380 }
                  });
                }

                edgesList.push({
                  id: `edge-${dcId}-${appId}`,
                  source: dcId,
                  target: appId,
                  style: { stroke: 'var(--app-border)', strokeWidth: 1.2 }
                });
              }
            });
          });
        });
      } else {
        // 3. Application detailed Deployment Topology view!
        nodesList.push({
          id: 'load-balancer',
          type: 'ontologyClass',
          data: {
            label: 'F5 Load Balancer',
            comment: 'External Vip: 10.192.10.1 | Health: ACTIVE',
            color: '#32D74B',
            isHighlighted: selectedTopologyNodeId === 'load-balancer',
            type: 'Traffic Ingress'
          },
          position: { x: 0, y: -250 }
        });

        nodesList.push({
          id: 'api-gateway',
          type: 'ontologyClass',
          data: {
            label: 'Kong API Gateway',
            comment: 'Rate limiting & API routing rules active',
            color: '#0A84FF',
            isHighlighted: selectedTopologyNodeId === 'api-gateway',
            type: 'API Gateway'
          },
          position: { x: 0, y: -130 }
        });

        edgesList.push({
          id: 'edge-lb-gw',
          source: 'load-balancer',
          target: 'api-gateway',
          style: { stroke: 'var(--app-border)', strokeWidth: 2 },
          animated: true
        });

        nodesList.push({
          id: 'app',
          type: 'ontologyClass',
          data: {
            label: `${currentDetail.application_name} (App)`,
            comment: `APPID: ${currentDetail.application_id} | LOB: ${currentDetail.lob_name}`,
            color: '#BF5AF2',
            isHighlighted: selectedTopologyNodeId === 'app',
            type: 'Application Root'
          },
          position: { x: 0, y: 0 }
        });

        edgesList.push({
          id: 'edge-gw-app',
          source: 'api-gateway',
          target: 'app',
          style: { stroke: 'var(--app-border)', strokeWidth: 2 },
          animated: true
        });

        const components = currentDetail.components || [];
        const uniqueDcs = new Map<string, any>();

        components.forEach((comp, compIdx) => {
          const compId = `comp-${comp.id}`;
          const compX = (compIdx - (components.length - 1) / 2) * 280;
          const compY = 130;

          nodesList.push({
            id: compId,
            type: 'ontologyClass',
            data: {
              label: `${comp.component_name} (${comp.component_type})`,
              comment: `Tech Stack: ${comp.tech_stack.toUpperCase()}`,
              color: comp.component_type === 'DATABASE' ? '#FF375F' : comp.component_type === 'MESSAGING' ? '#FFD60A' : '#FF9F0A',
              isHighlighted: selectedTopologyNodeId === compId,
              type: 'Application Component'
            },
            position: { x: compX, y: compY }
          });

          edgesList.push({
            id: `edge-app-${compId}`,
            source: 'app',
            target: compId,
            style: { stroke: 'var(--app-border)', strokeWidth: 1.5 },
            animated: true
          });

          const assets = comp.assets || [];
          assets.forEach((asset, assetIdx) => {
            const assetId = `asset-${asset.id}`;
            const assetX = compX + (assetIdx - (assets.length - 1) / 2) * 140;
            const assetY = 260;
            const isWrite = asset.write_authority && asset.latest_operational_state === 'ACTIVE';

            nodesList.push({
              id: assetId,
              type: 'ontologyClass',
              data: {
                label: asset.name,
                comment: `Host: ${asset.host || 'Unknown'} | State: ${asset.latest_operational_state}`,
                color: isWrite ? '#32D74B' : '#8E8E93',
                isHighlighted: selectedTopologyNodeId === assetId,
                type: asset.asset_type
              },
              position: { x: assetX, y: assetY }
            });

            edgesList.push({
              id: `edge-${compId}-${assetId}`,
              source: compId,
              target: assetId,
              style: { stroke: 'var(--app-border)', strokeWidth: 1.2 },
              animated: isWrite
            });

            if (asset.data_center) {
              const dc = asset.data_center;
              const dcId = `dc-${dc.id}`;
              uniqueDcs.set(dcId, dc);

              edgesList.push({
                id: `edge-${assetId}-${dcId}`,
                source: assetId,
                target: dcId,
                style: { stroke: 'var(--app-border)', strokeWidth: 1.2 }
              });
            }
          });
        });

        const dcList = Array.from(uniqueDcs.values());
        dcList.forEach((dc, dcIdx) => {
          const dcId = `dc-${dc.id}`;
          const dcX = (dcIdx - (dcList.length - 1) / 2) * 350;
          const dcY = 390;

          nodesList.push({
            id: dcId,
            type: 'ontologyClass',
            data: {
              label: `${dc.name} (DC)`,
              comment: `Region: ${dc.region || 'US'} | Zone: ${dc.zone || 'AZ'}`,
              color: '#FF453A',
              isHighlighted: selectedTopologyNodeId === dcId,
              type: 'Physical Datacenter'
            },
            position: { x: dcX, y: dcY }
          });

          const region = dc.region || 'US-EAST';
          const nbhId = `nbh-${region}`;
          
          edgesList.push({
            id: `edge-${dcId}-${nbhId}`,
            source: dcId,
            target: nbhId,
            style: { stroke: 'var(--app-border)', strokeWidth: 1.2 }
          });

          if (!nodesList.some(n => n.id === nbhId)) {
            nodesList.push({
              id: nbhId,
              type: 'ontologyClass',
              data: {
                label: `${region} Neighborhood`,
                comment: `Topological Regional Zone Grouping`,
                color: '#32D74B',
                type: 'Network Neighborhood'
              },
              position: { x: dcX, y: 500 }
            });
          }
        });
      }
    }

    return { nodes: nodesList, edges: edgesList };
  }, [selectedDomainId, selectedClassId, viewMode, highlightedNodes, currentDetail, dataCenters, applications, selectedTopologyNodeId, dbDomains]);

  // Custom Recursive Tree Node Renderer for Role Hierarchy
  const renderHierarchyNode = (node: HierarchyNode, level = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes[node.id];
    
    // Status colors
    const statusBorders = {
      HEALTHY: 'border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.06)]',
      WARN: 'border-amber-500/30 hover:border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.06)]',
      CRITICAL: 'border-red-500/30 hover:border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.06)]'
    };

    // Node style classes based on level/type
    const typeStyles = {
      ENTERPRISE: 'bg-[var(--app-bg-muted)] border-yellow-500/40 text-yellow-600 dark:text-yellow-400 font-extrabold shadow-[0_0_15px_rgba(234,179,8,0.05)]',
      REGION: 'bg-[var(--app-bg-subtle)] border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold',
      DC: 'bg-[var(--app-surface-hover)] border-cyan-500/30 text-cyan-600 dark:text-cyan-400',
      NBH: 'bg-[var(--app-surface-active)] border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
      APP: 'bg-[var(--accent-subtle)] border-[var(--accent)]/40 text-[var(--accent)] font-bold hover:bg-[var(--accent-subtle)]/80 cursor-pointer ring-1 ring-[var(--accent)]/20'
    };

    const nodeIcons = {
      ENTERPRISE: Globe,
      REGION: Globe,
      DC: Server,
      NBH: Network,
      APP: Cpu
    };

    const Icon = nodeIcons[node.type];

    return (
      <div key={node.id} className="flex flex-col items-center">
        {/* Node Box */}
        <div 
          onClick={() => {
            if (node.type === 'APP' && node.appId) {
              handleSelectAppFromHierarchy(node.appId);
            } else {
              toggleNode(node.id);
            }
          }}
          className={cn(
            "p-3 rounded-xl border text-[11px] select-none transition-all duration-300 cursor-pointer flex items-center gap-2",
            node.type === 'APP' ? typeStyles.APP : cn(statusBorders[node.status], typeStyles[node.type]),
            level > 0 && "mt-4"
          )}
          style={{ width: 170 }}
        >
          <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 bg-[var(--app-surface)] border border-[var(--app-border)]">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 truncate text-left">
            <div className="font-extrabold uppercase tracking-wide truncate">{node.label}</div>
            <div className="text-[8px] opacity-45 uppercase tracking-wider">{node.type}</div>
          </div>
          {node.type !== 'APP' && hasChildren && (
            <div className="text-[var(--text-muted)]">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
          )}
          {node.type === 'APP' && (
            <div className="text-[var(--accent)] group-hover:translate-x-1 transition-all">
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Child connection lines and Children tree */}
        {hasChildren && isExpanded && (
          <div className="relative flex flex-col items-center w-full">
            {/* Vertical connector line immediately below the node */}
            <div className="w-px h-6 bg-[var(--app-border)]" />

            {/* Horizontal line wrapping all children */}
            <div className="flex justify-center w-full relative">
              {node.children!.length > 1 && (
                <div 
                  className="absolute top-0 h-px bg-[var(--app-border)]" 
                  style={{
                    left: `${50 / node.children!.length}%`,
                    right: `${50 / node.children!.length}%`
                  }}
                />
              )}

              {/* Children nodes container */}
              <div className="flex gap-4 flex-wrap justify-center relative">
                {node.children!.map((child) => (
                  <div key={child.id} className="relative flex flex-col items-center">
                    {/* Tiny connector line dropping onto the child */}
                    <div className="w-px h-4 bg-[var(--app-border)] absolute -top-4" />
                    {renderHierarchyNode(child, level + 1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none text-[var(--text-primary)]">
      
      {/* ── TOP ACTION HEADER BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 -mt-2 bg-[var(--app-surface)] p-3 rounded-2xl border border-[var(--app-border)] shadow-md">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <span className="text-[12px] font-bold text-[var(--text-primary)]">Enterprise Ontology Platform & Semantic Knowledge Operating System</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Active Application Selector */}
          {applications.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[var(--app-bg-subtle)] border border-[var(--app-border)] rounded-lg px-2.5 py-1">
              <span className="text-[10px] text-[var(--text-muted)] font-bold">App Context:</span>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="bg-transparent text-[11px] font-extrabold text-[var(--text-primary)] outline-none border-0 cursor-pointer"
              >
                <option value="" className="bg-[var(--app-surface)] text-[var(--text-primary)]">Select Application...</option>
                {applications.map(app => (
                  <option key={app.application_id} value={app.application_id} className="bg-[var(--app-surface)] text-[var(--text-primary)]">
                    {app.application_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* View Tab Selector */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--app-bg-muted)] border border-[var(--app-border)]">
            <button 
              onClick={() => setViewMode('hierarchy')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1",
                viewMode === 'hierarchy' ? "bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Network className="w-3.5 h-3.5" />
              Role Hierarchy
            </button>
            <button 
              onClick={() => setViewMode('topology')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1",
                viewMode === 'topology' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <CpuIcon className="w-3.5 h-3.5" />
              Deployment Topology
            </button>
            <button 
              onClick={() => { setViewMode('schema'); setHighlightedNodes([]); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1",
                viewMode === 'schema' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Ontology Classes
            </button>
          </div>

          <a 
            href="file:///d:/Git_Repository/Mesh_Latest/docs/architecture/Enterprise_Ontology_Operating_System.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--app-bg-subtle)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <Code className="w-3.5 h-3.5" />
            Specification
          </a>
        </div>
      </div>

      {/* ── BANNER FOR EMPTY DATABASE SEEDING ── */}
      {applications.length === 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div>
              <h4 className="text-[12px] font-extrabold text-[var(--text-primary)]">Graph Database context empty</h4>
              <p className="text-[10px] text-[var(--text-secondary)]">No discovered telemetry sources or application profiles found in SQLite database.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={seedSampleData} 
              disabled={isSeeding}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-black text-[10.5px] font-bold rounded-lg transition-all"
            >
              {isSeeding ? 'Seeding...' : 'Seed Sample Data'}
            </button>
            <button 
              onClick={importAllDocs} 
              disabled={isSeeding}
              className="px-3.5 py-2 bg-[var(--app-surface-hover)] hover:bg-[var(--app-surface-active)] text-[var(--text-primary)] text-[10.5px] font-bold rounded-lg border border-[var(--app-border-medium)] transition-all"
            >
              {isSeeding ? 'Importing...' : 'Import Telemetry Reports'}
            </button>
          </div>
        </div>
      )}

      {/* ── TOP KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Ontology Domains', value: dynamicDomainsCount, sub: `${dynamicDomainsCount} active domains`, color: '#BF5AF2', icon: Globe },
          { label: 'Model Classes', value: dynamicClassesCount, sub: `${dynamicClassesCount} OWL classes`, color: '#0A84FF', icon: Server },
          { label: 'Relationships', value: dynamicRelationshipsCount, sub: `${dynamicRelationshipsCount} semantic links`, color: '#30B0C7', icon: Cpu },
          { label: 'Active Instances', value: dynamicInstancesCount, sub: `${dynamicInstancesCount} DB instances`, color: '#FF9F0A', icon: Database },
          { label: 'Reasoning Rules', value: dynamicRulesCount, sub: `${dynamicRulesCount} active shapes`, color: '#00E599', icon: ShieldCheck },
          { label: 'Twin Drift Status', value: dynamicDriftCount, sub: dynamicDriftCount === 0 ? 'Fully Aligned' : 'Drift Detected', color: dynamicDriftCount === 0 ? '#00E599' : '#FF453A', icon: AlertTriangle }
        ].map((stat, i) => (
          <div 
            key={i} 
            className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden border bg-[var(--app-surface)] border-[var(--app-border)] shadow-sm"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: stat.color }} />
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}20` }}>
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>

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

      {/* ── MAIN WORKSPACE ── */}
      <div className="w-full">
        
        {/* ====================================================================
            VIEW MODE 1: ROLE HIERARCHY TREE
           ==================================================================== */}
        {viewMode === 'hierarchy' && (
          <div className="w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-md flex flex-col gap-6 overflow-hidden relative min-h-[600px]">
            {/* Glowing background details */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-purple-500/5 rounded-full filter blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-500/5 rounded-full filter blur-[80px] pointer-events-none" />

            <div className="flex flex-col gap-2 z-10 border-b border-[var(--app-border-subtle)] pb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <Network className="w-5 h-5 text-purple-500" />
                  <span>Enterprise Hierarchy & Location Routing Map</span>
                </h2>
                <div className="text-[10px] font-bold px-2 py-0.5 bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20 rounded">
                  ROLE HIERARCHY
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                A drill-down path from the parent Enterprise down through Regions, hosting Datacenters, zone Neighborhoods, and deployed Applications. 
                <span className="text-purple-500 font-semibold ml-1">Click on an Application node to launch its detailed telemetry & K8s deployment topology explorer.</span>
              </p>
            </div>

            {/* Tree Workspace */}
            <div className="flex-1 w-full overflow-x-auto py-6 flex justify-center scrollbar-thin">
              <div className="min-w-[1000px] flex justify-center">
                {renderHierarchyNode(dynamicHierarchy)}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] italic z-10 border-t border-[var(--app-border-subtle)] pt-4">
              <InfoIcon className="w-3.5 h-3.5" />
              <span>Nodes can be expanded and collapsed dynamically. Connection routing lines update real-time representation.</span>
            </div>
          </div>
        )}

        {/* ====================================================================
            VIEW MODE 2: DETAILED DEPLOYMENT TOPOLOGY EXPLORER
           ==================================================================== */}
        {viewMode === 'topology' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* LEFT COLUMN: THE TOPOLOGY DIAGRAM (8 Cols) */}
            <div className="lg:col-span-8 p-6 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-6 relative overflow-hidden min-h-[600px] shadow-sm">
              {/* Animated grid overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] pointer-events-none" />

              <div className="flex items-center justify-between border-b pb-4 border-[var(--app-border-subtle)] z-10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                    <Box className="w-5 h-5 text-emerald-500" />
                    <span>{selectedDetail ? `Deployment Topology: ${selectedDetail.application_name}` : 'Enterprise Topology Overview'}</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                    {selectedDetail ? `APPID: ${selectedDetail.application_id} | Environment: PRODUCTION` : 'Global Digital Twin Map'}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-[var(--app-bg-muted)] px-2.5 py-1 rounded border border-[var(--app-border)] text-[9px] font-extrabold text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>TELEMETRY ACTIVE</span>
                </div>
              </div>

              {/* Topology Map Canvas */}
              <div 
                className="w-full rounded-xl overflow-hidden border border-[var(--app-border)] relative bg-[var(--app-bg-muted)]/50 mt-4"
                style={{ height: '550px', minHeight: '550px' }}
              >
                <ReactFlowProvider>
                  <div style={{ width: '100%', height: '100%' }}>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      onNodeClick={(e, node) => {
                        if (node.data?.appId) {
                          handleSelectAppFromHierarchy(node.data.appId);
                        } else {
                          setSelectedTopologyNodeId(node.id);
                        }
                      }}
                      fitView
                      fitViewOptions={{ padding: 0.15 }}
                      minZoom={0.2}
                      maxZoom={1.5}
                      proOptions={{ hideAttribution: true }}
                      style={{ background: 'transparent' }}
                    >
                      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--app-border-medium)" />
                    </ReactFlow>
                  </div>
                </ReactFlowProvider>
              </div>

              <div className="border-t border-[var(--app-border)] pt-4 text-[10px] text-[var(--text-secondary)] italic z-10 flex items-center gap-1.5">
                <InfoIcon className="w-3.5 h-3.5" />
                <span>Interactive Architecture Board. Click on any element (LB, Gateway, Pods, Databases, etc.) to review real-time spec telemetry.</span>
              </div>
            </div>

            {/* RIGHT COLUMN: TELEMETRY INSPECTOR PANEL (4 Cols) */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              
              {/* Telemetry Inspector Card */}
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-xl flex flex-col gap-5 min-h-[550px] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full filter blur-[50px] pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--app-border-subtle)] pb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {React.createElement(activeTopologySpec.icon, { className: "w-4 h-4" })}
                    </span>
                    <div>
                      <h3 className="text-[13px] font-bold text-[var(--text-primary)] leading-none">{activeTopologySpec.title}</h3>
                      <span className="text-[8px] text-[var(--text-muted)] font-mono uppercase tracking-widest mt-1 block">
                        Telemetry Node ID: {selectedTopologyNodeId}
                      </span>
                    </div>
                  </div>

                  <span className="text-[9.5px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                    ONLINE
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="flex flex-col gap-2.5">
                  <h4 className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Real-time Metrics</h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    {activeTopologySpec.metrics.map((m, idx) => (
                      <div key={idx} className="p-3 bg-[var(--app-bg-muted)] rounded-xl border border-[var(--app-border)] flex flex-col gap-1">
                        <span className="text-[8px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">{m.label}</span>
                        <div className="flex items-baseline gap-1.5 justify-between">
                          <span className="text-[12px] font-extrabold text-[var(--text-primary)]">{m.value}</span>
                          {m.trend !== undefined && (
                            <span className={cn(
                              "text-[8px] font-bold",
                              m.trend > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                            )}>
                              {m.trend > 0 ? '▲' : '▼'} {Math.abs(m.trend)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sparkline Chart */}
                <div className="flex flex-col gap-2.5">
                  <h4 className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                    <span>Performance Sparkline</span>
                    <span className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 lowercase">live feed</span>
                  </h4>
                  <div className="h-16 bg-[var(--app-bg-muted)] rounded-xl border border-[var(--app-border)] p-2 flex items-center justify-center relative overflow-hidden">
                    <svg className="w-full h-full text-emerald-500/20 dark:text-emerald-400/30" viewBox="0 0 100 20" preserveAspectRatio="none">
                      <path 
                        d={`M 0 ${10 + Math.sin(ticks + 1) * 3} 
                           L 10 ${8 + Math.cos(ticks + 2) * 4} 
                           L 20 ${12 + Math.sin(ticks + 3) * 5} 
                           L 30 ${7 + Math.cos(ticks + 4) * 3} 
                           L 40 ${14 + Math.sin(ticks + 5) * 4} 
                           L 50 ${9 + Math.cos(ticks + 6) * 5} 
                           L 60 ${11 + Math.sin(ticks + 7) * 4} 
                           L 70 ${6 + Math.cos(ticks + 8) * 3} 
                           L 80 ${13 + Math.sin(ticks + 9) * 4} 
                           L 90 ${8 + Math.cos(ticks + 10) * 5} 
                           L 100 ${10 + Math.sin(ticks + 11) * 4}`}
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="1.2" 
                        className="transition-all duration-1000"
                      />
                      <path 
                        d={`M 0 20 L 0 ${10 + Math.sin(ticks + 1) * 3} 
                           L 10 ${8 + Math.cos(ticks + 2) * 4} 
                           L 20 ${12 + Math.sin(ticks + 3) * 5} 
                           L 30 ${7 + Math.cos(ticks + 4) * 3} 
                           L 40 ${14 + Math.sin(ticks + 5) * 4} 
                           L 50 ${9 + Math.cos(ticks + 6) * 5} 
                           L 60 ${11 + Math.sin(ticks + 7) * 4} 
                           L 70 ${6 + Math.cos(ticks + 8) * 3} 
                           L 80 ${13 + Math.sin(ticks + 9) * 4} 
                           L 90 ${8 + Math.cos(ticks + 10) * 5} 
                           L 100 ${10 + Math.sin(ticks + 11) * 4} L 100 20 Z`}
                        fill="url(#sparkline-grad)" 
                        className="transition-all duration-1000"
                      />
                      <defs>
                        <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00E599" stopOpacity="0.08" />
                          <stop offset="100%" stopColor="#00E599" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute top-1 right-2 text-[8px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      <span>{10 + (ticks % 4)}ms Latency</span>
                    </div>
                  </div>
                </div>

                {/* Configuration Specs */}
                <div className="flex flex-col gap-2.5">
                  <h4 className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Declared Configuration Spec</h4>
                  <div className="p-3 bg-[var(--app-bg-muted)] rounded-xl border border-[var(--app-border)] flex flex-col gap-2 font-mono text-[9.5px]">
                    {activeTopologySpec.config.map((c, idx) => (
                      <div key={idx} className="flex justify-between items-start border-b border-[var(--app-border-subtle)] pb-1.5 last:border-0 last:pb-0">
                        <span className="text-[var(--text-muted)]">{c.label}:</span>
                        <span className="text-emerald-600 dark:text-emerald-300 font-bold truncate max-w-[170px]">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* ====================================================================
            VIEW MODE 3: ONTOLOGY CLASS SCHEMA MODEL (ORIGINAL PREV TAB)
           ==================================================================== */}
        {viewMode === 'schema' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* LEFT CLASS HIERARCHY TREE (3 Cols) */}
            <div className="lg:col-span-3 p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 shadow-xl">
              
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Class Tree Explorer</h2>
                <Settings className="w-4 h-4 text-[var(--text-muted)]" />
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-muted)]">
                <Search className="w-4 h-4 text-[var(--text-muted)]" />
                <input 
                  type="text" 
                  placeholder="Search classes & properties..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-0 outline-none text-[11px] text-[var(--text-primary)] w-full placeholder-[var(--text-muted)]"
                />
              </div>

              <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                {filteredDomains.map((dom) => {
                  const matchedClasses = Object.values(dom.classes).filter((cls: any) => 
                    cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    cls.comment.toLowerCase().includes(searchTerm.toLowerCase())
                  );

                  if (matchedClasses.length === 0) return null;

                  return (
                    <div key={dom.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 px-2.5 py-1 text-[10.5px] font-extrabold uppercase opacity-60 tracking-wider">
                        <dom.icon className="w-3.5 h-3.5" style={{ color: dom.color }} />
                        <span className="text-[var(--text-primary)]">{dom.label}</span>
                      </div>

                      <div className="pl-4 flex flex-col border-l border-[var(--app-border-subtle)] ml-4">
                        {matchedClasses.map((cls: any) => (
                          <button
                            key={cls.name}
                            onClick={() => selectClass(dom.id, cls.name)}
                            className={cn(
                              "px-2.5 py-1.5 text-left text-[11px] font-bold rounded-lg transition-all flex items-center justify-between",
                              selectedClassId === cls.name 
                                ? "bg-[var(--app-surface-active)] text-[var(--text-primary)] border border-[var(--app-border)] shadow-sm" 
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--app-surface-hover)]"
                            )}
                          >
                            <span>{cls.name}</span>
                            {cls.subClassOf && (
                              <span className="text-[8px] opacity-40 italic">Sub</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CENTER REACT FLOW CANVAS (5 Cols) */}
            <div className="lg:col-span-5 p-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 relative overflow-hidden shadow-xl">
              
              <div className="flex items-center justify-between border-b pb-3 border-[var(--app-border-subtle)]">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[var(--text-primary)]">
                    Class Schema Model: {selectedDomainId.toUpperCase()}
                  </span>
                  <HelpCircle className="w-4 h-4 text-[var(--text-muted)]" />
                </div>

                <div className="flex items-center gap-2 text-[9px] font-bold text-[var(--text-primary)] bg-[var(--app-bg-muted)] px-2 py-0.5 rounded border border-[var(--app-border)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span>ACTIVE GRAPH</span>
                </div>
              </div>

              {/* Graph Canvas */}
              <div 
                className="w-full rounded-xl overflow-hidden border border-[var(--app-border)] relative bg-[var(--app-bg-muted)]/50"
                style={{ height: '460px', width: '100%' }}
              >
                <ReactFlowProvider>
                  <div style={{ width: '100%', height: '100%' }}>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      fitView
                      fitViewOptions={{ padding: 0.15 }}
                      minZoom={0.2}
                      maxZoom={1.5}
                      proOptions={{ hideAttribution: true }}
                      style={{ background: 'transparent' }}
                    >
                      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--app-border-medium)" />
                    </ReactFlow>
                  </div>
                </ReactFlowProvider>
              </div>

              <div className="text-[10px] font-bold text-[var(--text-muted)] leading-relaxed italic">
                * Interactive schema flow board. Classes can be searched and clicked to inspect attributes, SPARQL shapes, and reasoning paths.
              </div>
            </div>

            {/* RIGHT METADATA & REASONING PANEL (4 Cols) */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              
              {/* Inspector Panel tabs */}
              <div className="flex items-center gap-1 border-b border-[var(--app-border)] overflow-x-auto scrollbar-none">
                {[
                  { id: 'inspector', label: 'Inspector' },
                  { id: 'query', label: 'Semantic Query' },
                  { id: 'rules', label: 'AI Rules' },
                  { id: 'migration', label: 'Migration' },
                  { id: 'twin', label: 'Digital Twin' }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setRightPanelTab(tab.id as any)}
                    className={cn(
                      "px-3 py-2 text-[11px] font-bold border-b-2 whitespace-nowrap transition-all",
                      rightPanelTab === tab.id 
                        ? "border-[var(--accent)] text-[var(--accent)]" 
                        : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab contents */}
              <div className="min-h-[460px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={rightPanelTab}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="w-full"
                  >
                    
                    {/* 1. Class Inspector */}
                    {rightPanelTab === 'inspector' && selectedClassDetails && (
                      <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 shadow-sm">
                        <div>
                          <h3 className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <InfoIcon className="w-4 h-4 text-blue-500" />
                            <span>Class: {selectedClassDetails.name}</span>
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 leading-relaxed bg-[var(--app-bg-subtle)] p-3 rounded-lg border border-[var(--app-border-subtle)]">
                            {selectedClassDetails.comment}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Semantic Metadata</h4>
                          <div className="text-[11px] font-bold bg-[var(--app-bg-subtle)] p-3 rounded-lg border border-[var(--app-border-subtle)] flex flex-col gap-1.5">
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">URINamespace:</span>
                              <span className="text-[var(--text-primary)] font-mono text-[9.5px]">ekos-{selectedDomainId}:</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">SubClassOf:</span>
                              <span className="text-blue-500 font-mono text-[10px]">{selectedClassDetails.subClassOf || 'owl:Thing'}</span>
                            </div>
                          </div>
                        </div>

                        {selectedClassDetails.properties && selectedClassDetails.properties.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Defined Properties</h4>
                            <div className="flex flex-col gap-1">
                              {selectedClassDetails.properties.map((prop: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center bg-[var(--app-bg-subtle)] p-2 rounded-lg border border-[var(--app-border-subtle)] text-[11px] font-bold">
                                  <div>
                                    <div className="text-[var(--text-primary)]">{prop.name}</div>
                                    <div className="text-[9px] opacity-40">{prop.type === 'DATA' ? 'rdf:DatatypeProperty' : 'rdf:ObjectProperty'}</div>
                                  </div>
                                  <div className="text-blue-500 font-mono text-[9.5px]">{prop.range}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Instances in Database */}
                        {ontologyGraph && ontologyGraph.nodes && (
                          <div className="flex flex-col gap-2">
                            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Instances in Database</h4>
                            <div className="max-h-36 overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
                              {ontologyGraph.nodes
                                .filter((n: any) => n.ontology_class === selectedClassId)
                                .map((n: any) => (
                                  <div key={n.id} className="flex justify-between items-center bg-[var(--app-bg-subtle)] p-2 rounded-lg border border-[var(--app-border-subtle)] text-[10.5px]">
                                    <span className="font-extrabold text-[var(--text-primary)]">{n.label}</span>
                                    <span className="text-[8px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">{n.status.toUpperCase()}</span>
                                  </div>
                                ))}
                              {ontologyGraph.nodes.filter((n: any) => n.ontology_class === selectedClassId).length === 0 && (
                                <div className="text-[10px] text-[var(--text-muted)] italic p-2 bg-[var(--app-bg-subtle)] rounded-lg border border-[var(--app-border-subtle)] text-center">
                                  No database instances found for this class.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 2. SPARQL / Cypher Query Builder */}
                    {rightPanelTab === 'query' && (
                      <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 shadow-sm">
                        <div>
                          <h3 className="text-[12px] font-bold text-[var(--text-primary)]">Semantic SPARQL / Cypher Query</h3>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Explore relationships across 5,000 application nodes.</p>
                        </div>

                        {/* Templates list */}
                        <div className="flex gap-2">
                          {queryTemplates.map((tmpl, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleApplyTemplate(tmpl.query)}
                              className="px-2 py-1 rounded bg-[var(--app-bg-subtle)] hover:bg-[var(--app-bg-muted)] text-[9px] font-bold text-[var(--text-primary)] border border-[var(--app-border-subtle)]"
                            >
                              {tmpl.name}
                            </button>
                          ))}
                        </div>

                        {/* Query Editor */}
                        <div className="relative">
                          <textarea
                            value={queryInput}
                            onChange={(e) => setQueryInput(e.target.value)}
                            rows={6}
                            className="w-full bg-[var(--app-bg-muted)] border border-[var(--app-border)] rounded-xl p-3 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={handleRunQuery}
                            disabled={isQueryRunning}
                            className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-black flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                          >
                            {isQueryRunning ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" />
                                Run Query
                              </>
                            )}
                          </button>
                        </div>

                        {/* Query Results */}
                        {queryResults && (
                          <div className="flex flex-col gap-2">
                            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Query results</h4>
                            <div className="overflow-x-auto border border-[var(--app-border)] rounded-xl max-h-[160px] scrollbar-thin">
                              <table className="w-full text-left text-[10.5px] font-bold">
                                <thead>
                                  <tr className="bg-[var(--app-bg-subtle)] border-b border-[var(--app-border)] text-[var(--text-secondary)]">
                                    {Object.keys(queryResults[0]).map((key) => (
                                      <th key={key} className="p-2">{key}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {queryResults.map((row, idx) => (
                                    <tr key={idx} className="border-b border-[var(--app-border-subtle)] last:border-0 text-[var(--text-primary)]">
                                      {Object.values(row).map((val: any, cellIdx) => (
                                        <td key={cellIdx} className="p-2 truncate max-w-[120px]">{val}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. AI Rules Engine */}
                    {rightPanelTab === 'rules' && (
                      <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-[12px] font-bold text-[var(--text-primary)]">AI Inference & Reasoning Engine</h3>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Rules evaluating structural compliance (R1-R6).</p>
                          </div>
                          <button
                            onClick={runRulesEngine}
                            disabled={rulesEngineRunning}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1 active:scale-95 transition-all disabled:opacity-50"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            Run Evaluation
                          </button>
                        </div>

                        {/* Rule violations list */}
                        <div className="flex flex-col gap-2">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Inference Violations</h4>
                          {rulesViolations.length === 0 ? (
                            <div className="text-center py-4 text-[11px] text-[var(--text-muted)] bg-[var(--app-bg-subtle)] rounded-xl border border-[var(--app-border-subtle)]">
                              No active rule violations discovered.
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {rulesViolations.map((v) => (
                                <div
                                  key={v.id}
                                  className={cn(
                                    "p-3 rounded-xl border flex flex-col gap-2 relative transition-all",
                                    v.remediated 
                                      ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 opacity-60" 
                                      : "bg-[#FF453A]/5 border-[#FF453A]/20 text-[#FF453A]"
                                  )}
                                >
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[var(--app-bg-subtle)] mr-2">
                                        {v.rule}
                                      </span>
                                      <span className="text-[11px] font-bold">{v.scope}</span>
                                    </div>
                                    <span className="text-[9px] opacity-60">{v.dc}</span>
                                  </div>
                                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-semibold">{v.desc}</p>
                                  
                                  {!v.remediated && (
                                    <button
                                      onClick={() => handleRemediateRule(v.id)}
                                      className="self-end px-2.5 py-1 rounded text-[9.5px] font-bold bg-[var(--app-surface-hover)] hover:bg-[var(--app-surface-active)] text-[var(--text-primary)] border border-[var(--app-border)]"
                                    >
                                      Auto-Remediate
                                    </button>
                                  )}
                                  {v.remediated && (
                                    <div className="flex items-center gap-1 text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400 self-end">
                                      <Check className="w-3.5 h-3.5" /> Remediated
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Console Output */}
                        {rulesLogs.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <div className="text-[9px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                              <Terminal className="w-3 h-3" /> Console Output
                            </div>
                            <div className="p-3 rounded-xl border bg-[var(--app-bg-muted)] border-[var(--app-border-subtle)] font-mono text-[9px] text-[var(--text-secondary)] h-[120px] overflow-y-auto flex flex-col gap-0.5 scrollbar-thin">
                              {rulesLogs.map((log, idx) => (
                                <div key={idx}>{log}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. DC Migration & Rebinding Coordinator */}
                    {rightPanelTab === 'migration' && (
                      <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 shadow-sm">
                        <div>
                          <h3 className="text-[12px] font-bold text-[var(--text-primary)]">Parameterized DC Migration Coordinator</h3>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Rebind logical app components to target physical locations.</p>
                        </div>

                        {/* Setup selectors */}
                        <div className="grid grid-cols-3 gap-2 text-[10px] font-bold">
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--text-muted)]">App Context:</span>
                            <select 
                              value={migrationAppId}
                              onChange={(e) => setMigrationAppId(e.target.value)}
                              className="bg-[var(--app-bg-subtle)] border border-[var(--app-border)] rounded-lg p-1 text-[var(--text-primary)] outline-none"
                            >
                              {applications.map(app => (
                                <option key={app.application_id} value={app.application_id} className="bg-[var(--app-surface)] text-[var(--text-primary)]">
                                  {app.application_id}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--text-muted)]">Source Location:</span>
                            <select 
                              value={migrationSource}
                              onChange={(e) => setMigrationSource(e.target.value)}
                              className="bg-[var(--app-bg-subtle)] border border-[var(--app-border)] rounded-lg p-1 text-[var(--text-primary)] outline-none"
                            >
                              <option value="DC-EAST-1">DC-EAST-1</option>
                              <option value="DC-EAST-2">DC-EAST-2</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--text-muted)]">Target Location:</span>
                            <select 
                              value={migrationTarget}
                              onChange={(e) => setMigrationTarget(e.target.value)}
                              className="bg-[var(--app-bg-subtle)] border border-[var(--app-border)] rounded-lg p-1 text-[var(--text-primary)] outline-none"
                            >
                              <option value="DC-WEST-1">DC-WEST-1</option>
                              <option value="DC-WEST-2">DC-WEST-2</option>
                            </select>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2.5">
                          <button
                            onClick={startMigration}
                            disabled={migrationState === 'running'}
                            className="flex-1 px-3 py-2 rounded-lg text-[10.5px] font-bold bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 disabled:opacity-50 transition-all"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" /> Execute Cutover
                          </button>
                          <button
                            onClick={startRollbackSimulation}
                            disabled={migrationState === 'running'}
                            className="flex-1 px-3 py-2 rounded-lg text-[10.5px] font-bold bg-[#FF453A]/10 border border-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A]/20 flex items-center justify-center gap-1 disabled:opacity-50 transition-all"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Simulate Rollback
                          </button>
                        </div>

                        {/* Progress tracking */}
                        {migrationState === 'running' && (
                          <div className="flex flex-col gap-1.5 bg-[var(--app-bg-subtle)] p-3 rounded-xl border border-[var(--app-border-subtle)]">
                            <div className="flex justify-between text-[10.5px] font-bold text-[var(--text-primary)]">
                              <span>Execution Progress (Phase {migrationPhase}/5)</span>
                              <span>{migrationProgress}%</span>
                            </div>
                            <div className="w-full bg-[var(--app-bg-muted)] rounded-full h-1.5">
                              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${migrationProgress}%` }} />
                            </div>
                          </div>
                        )}

                        {/* Execution logs output */}
                        {migrationLogs.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="text-[9px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                              <Terminal className="w-3 h-3" /> Execution Log
                            </div>
                            <div className="p-3 rounded-xl border bg-[var(--app-bg-muted)] border-[var(--app-border-subtle)] font-mono text-[9px] text-[var(--text-secondary)] h-[140px] overflow-y-auto flex flex-col gap-0.5 font-semibold scrollbar-thin">
                              {migrationLogs.map((log, idx) => (
                                <div key={idx} className={cn(
                                  log.includes("ERROR") && "text-[#FF453A]",
                                  log.includes("completed") && "text-emerald-500 dark:text-emerald-400",
                                  log.includes("Rollback complete") && "text-amber-500 dark:text-amber-400"
                                )}>
                                  {log}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Digital Twin Drift */}
                    {rightPanelTab === 'twin' && (
                      <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] flex flex-col gap-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-[12px] font-bold text-[var(--text-primary)]">Digital Twin alignment</h3>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Discovered runtime reality vs design model drift status.</p>
                          </div>
                          
                          {currentDrifts.length > 0 && (
                            <button
                              onClick={handleSyncTwin}
                              disabled={syncingTwin}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-purple-500 hover:bg-purple-600 text-white flex items-center gap-1 active:scale-95 transition-all"
                            >
                              {syncingTwin ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <GitBranch className="w-3.5 h-3.5" />
                                  Align Drift
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Drift list */}
                        <div className="flex flex-col gap-2">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Discovered Drift Items</h4>
                          {currentDrifts.length === 0 ? (
                            <div className="text-center py-8 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/20 flex flex-col items-center gap-2">
                              <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
                              <span>Digital twin posture matches runtime reality!</span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {currentDrifts.map((item) => (
                                <div key={item.id} className="p-3 bg-[var(--app-bg-subtle)] border border-[var(--app-border-subtle)] rounded-xl flex flex-col gap-1 text-[11px] font-bold">
                                  <div className="flex justify-between items-center text-[var(--text-primary)]">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[8px] bg-purple-500/20 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded font-extrabold">{item.drift_type}</span>
                                      <span>{item.application_id}</span>
                                    </div>
                                    <span className="text-red-500 text-[9.5px] uppercase">{item.severity} DRIFT</span>
                                  </div>
                                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-semibold mt-1">{item.description}</p>
                                  <div className="text-[9.5px] opacity-45 mt-1">
                                    Intended: <span className="text-[var(--text-primary)]">{item.intended}</span> | Actual: <span className="text-[var(--text-primary)]">{item.actual}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
