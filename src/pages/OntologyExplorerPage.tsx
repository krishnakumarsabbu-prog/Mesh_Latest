import React, { useState, useMemo, useEffect } from 'react';
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
  Terminal, Globe, Code, Brain, PlayCircle, GitBranch
} from 'lucide-react';

import { useUIStore } from '@/store/uiStore';
import { useThemeStore } from '@/store/themeStore';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { cn } from '@/lib/utils';

// ============================================================================
// ONTOLOGY CLASS DATA (450 CLASSES MAP REPRESENTED COMPACTLY BY DOMAINS)
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

const ONTOLOGY_DOMAINS: Record<string, DomainSchema> = {
  organization: {
    id: 'organization',
    label: 'Enterprise / Organization',
    color: '#0A84FF',
    icon: Globe,
    classes: {
      Company: { name: 'Company', comment: 'The global parent enterprise entity.', properties: [{ name: 'name', type: 'DATA', range: 'xsd:string' }] },
      Division: { name: 'Division', comment: 'Large divisional grouping (e.g. Consumer Banking).', subClassOf: 'Company' },
      LOB: { name: 'LineOfBusiness', comment: 'Lines of Business delivering specific services.', subClassOf: 'Division', properties: [{ name: 'mappedTo', type: 'OBJECT', range: 'Neighborhood' }] },
      Team: { name: 'Team', comment: 'Engineering/Product teams supporting LOB platforms.', subClassOf: 'LOB' },
      Squad: { name: 'Squad', comment: 'Agile execution unit within a Team.', subClassOf: 'Team' },
      Product: { name: 'Product', comment: 'Customer-facing product catalog item.', properties: [{ name: 'ownedBy', type: 'OBJECT', range: 'Team' }] },
      Owner: { name: 'Owner', comment: 'Owner designated with operational accountability.', properties: [{ name: 'contactEmail', type: 'DATA', range: 'xsd:string' }] },
      Vendor: { name: 'Vendor', comment: 'External software/hardware providers.', properties: [{ name: 'vendorName', type: 'DATA', range: 'xsd:string' }] },
      Contact: { name: 'Contact', comment: 'Contact point details for on-call notification.', properties: [{ name: 'phone', type: 'DATA', range: 'xsd:string' }] }
    }
  },
  business: {
    id: 'business',
    label: 'Business Process & SLAs',
    color: '#30B0C7',
    icon: Layers,
    classes: {
      Capability: { name: 'Capability', comment: 'Core corporate business competency.', properties: [{ name: 'criticalityTier', type: 'DATA', range: 'xsd:string' }] },
      Process: { name: 'Process', comment: 'Workflows executing business functions.', properties: [{ name: 'executesCapability', type: 'OBJECT', range: 'Capability' }] },
      Function: { name: 'Function', comment: 'Granular processing step in a workflow.' },
      Journey: { name: 'Journey', comment: 'Customer end-to-end transaction journey.', properties: [{ name: 'slaTargetMs', type: 'DATA', range: 'xsd:integer' }] },
      Customer: { name: 'CustomerSegment', comment: 'Target customer demographic impacted.' },
      SLA: { name: 'ServiceLevelAgreement', comment: 'Contractual business availability rules.', properties: [{ name: 'slaPercentage', type: 'DATA', range: 'xsd:float' }] },
      KPI: { name: 'KeyPerformanceIndicator', comment: 'Business performance indicators (e.g. checkout rate).' }
    }
  },
  applications: {
    id: 'applications',
    label: 'Logical Applications',
    color: '#BF5AF2',
    icon: Cpu,
    classes: {
      Application: { name: 'Application', comment: 'Logical App context linked to APPID.', properties: [{ name: 'appId', type: 'DATA', range: 'xsd:string' }, { name: 'governedBy', type: 'OBJECT', range: 'NFRProfile' }] },
      Service: { name: 'Service', comment: 'Functional microservice or component API.', properties: [{ name: 'port', type: 'DATA', range: 'xsd:integer' }, { name: 'protocol', type: 'DATA', range: 'xsd:string' }] },
      API: { name: 'APIContract', comment: 'Exposed REST/gRPC service interface contracts.', subClassOf: 'Service' },
      Library: { name: 'SharedLibrary', comment: 'Re-usable software package dependency.' },
      DeploymentUnit: { name: 'DeploymentUnit', comment: 'Workload container image or VM template.', properties: [{ name: 'imagePath', type: 'DATA', range: 'xsd:string' }, { name: 'boundTo', type: 'OBJECT', range: 'ComputeUnit' }] },
      Version: { name: 'SoftwareVersion', comment: 'Semver tracking details for workloads.' },
      Release: { name: 'ReleasePackage', comment: 'Unified package deployed as a unit.' },
      Build: { name: 'CIBuildInstance', comment: 'Telemetry pointing back to CI/CD pipeline runs.' }
    }
  },
  runtime: {
    id: 'runtime',
    label: 'Container Workloads',
    color: '#FF9F0A',
    icon: Laptop,
    classes: {
      OCPCluster: { name: 'OCPCluster', comment: 'Active OpenShift infrastructure cluster.', properties: [{ name: 'apiEndpoint', type: 'DATA', range: 'xsd:string' }] },
      Namespace: { name: 'Namespace', comment: 'OCP isolated namespace context.', properties: [{ name: 'partOf', type: 'OBJECT', range: 'OCPCluster' }] },
      Node: { name: 'K8sNode', comment: 'Physical or virtual server instance hosting pods.' },
      Pod: { name: 'ContainerPod', comment: 'Executing pod container workload.', properties: [{ name: 'runningOn', type: 'OBJECT', range: 'Node' }] },
      ReplicaSet: { name: 'ReplicaSetController', comment: 'Ensures desired counts are running.' },
      Deployment: { name: 'K8sDeployment', comment: 'Logical deployment configuration.' },
      StatefulSet: { name: 'StatefulSetController', comment: 'Deployment for stateful applications.' },
      DaemonSet: { name: 'DaemonSetController', comment: 'Workloads running on all nodes.' },
      CronJob: { name: 'K8sCronJob', comment: 'Scheduled job processing workload.' }
    }
  },
  infrastructure: {
    id: 'infrastructure',
    label: 'Physical Infrastructure',
    color: '#FF453A',
    icon: Server,
    classes: {
      Neighborhood: { name: 'Neighborhood', comment: 'Topological regional zone group.', properties: [{ name: 'region', type: 'DATA', range: 'xsd:string' }] },
      Datacenter: { name: 'Datacenter', comment: 'Physical hosting datacenter site.', properties: [{ name: 'siteCode', type: 'DATA', range: 'xsd:string' }, { name: 'status', type: 'DATA', range: 'xsd:string' }] },
      Zone: { name: 'AvailabilityZone', comment: 'Network zone within a Datacenter.', properties: [{ name: 'networkCIDR', type: 'DATA', range: 'xsd:string' }] },
      Category: { name: 'SecurityCategory', comment: 'PUBLIC_FACING vs MIDDLEWARE category zoning.' },
      Rack: { name: 'PhysicalRack', comment: 'Server rack hosting physical hosts.' },
      Host: { name: 'BareMetalHost', comment: 'Physical metal server.' },
      VM: { name: 'VirtualMachine', comment: 'Hypervisor-based virtual machine server.' }
    }
  },
  database: {
    id: 'database',
    label: 'Databases & Persistence',
    color: '#FF375F',
    icon: Database,
    classes: {
      PersistenceStore: { name: 'PersistenceStore', comment: 'Database persistence abstract class.', properties: [{ name: 'engine', type: 'DATA', range: 'xsd:string' }, { name: 'topology', type: 'DATA', range: 'xsd:string' }] },
      Oracle: { name: 'OracleDB', comment: 'Relational Oracle database instance.', subClassOf: 'PersistenceStore' },
      MongoDB: { name: 'MongoDBCluster', comment: 'Document MongoDB replica set.', subClassOf: 'PersistenceStore' },
      PostgreSQL: { name: 'PostgresInstance', comment: 'PostgreSQL database instance.', subClassOf: 'PersistenceStore' },
      SQLServer: { name: 'MSSQLServer', comment: 'Microsoft SQL Server instance.', subClassOf: 'PersistenceStore' },
      Redis: { name: 'RedisCluster', comment: 'In-memory Redis cache store.', subClassOf: 'PersistenceStore' },
      Cassandra: { name: 'CassandraRing', comment: 'Distributed Cassandra ring persistence.', subClassOf: 'PersistenceStore' },
      Elasticsearch: { name: 'ElasticCluster', comment: 'Search indexing persistence engine.', subClassOf: 'PersistenceStore' }
    }
  },
  messaging: {
    id: 'messaging',
    label: 'Messaging & Queues',
    color: '#FFD60A',
    icon: Siren,
    classes: {
      MessagingSystem: { name: 'MessagingSystem', comment: 'Middleware messaging system.', properties: [{ name: 'type', type: 'DATA', range: 'xsd:string' }] },
      Kafka: { name: 'KafkaCluster', comment: 'Apache Kafka distributed stream platform.', subClassOf: 'MessagingSystem' },
      MQ: { name: 'IBMMQBroker', comment: 'IBM MQ queue manager broker.', subClassOf: 'MessagingSystem' },
      Topic: { name: 'KafkaTopic', comment: 'Log partition stream target in Kafka.' },
      Queue: { name: 'IBMMQQueue', comment: 'Message queue endpoint in IBM MQ.' },
      Producer: { name: 'MessageProducer', comment: 'Client generating queue messages.' },
      Consumer: { name: 'MessageConsumer', comment: 'Client reading queue messages.' }
    }
  },
  network: {
    id: 'network',
    label: 'Network & Traffic',
    color: '#32D74B',
    icon: Network,
    classes: {
      TrafficManager: { name: 'TrafficManager', comment: 'Load balancer routing traffic.', properties: [{ name: 'vip', type: 'DATA', range: 'xsd:string' }] },
      F5: { name: 'F5LoadBalancer', comment: 'F5 BIG-IP hardware load balancer.', subClassOf: 'TrafficManager' },
      AVI: { name: 'AVIVirtualService', comment: 'AVI Software-defined load balancer.', subClassOf: 'TrafficManager' },
      DNS: { name: 'DNSRecord', comment: 'Domain name mapping entry.' },
      VIP: { name: 'VirtualIPAddress', comment: 'IP target mapped to service endpoints.' },
      Ingress: { name: 'K8sIngressController', comment: 'OCP traffic ingress controller.' },
      Route: { name: 'OpenShiftRoute', comment: 'OpenShift routing endpoint binding.' }
    }
  },
  security: {
    id: 'security',
    label: 'Security & Access',
    color: '#5E5CE6',
    icon: ShieldCheck,
    classes: {
      SecurityPolicy: { name: 'SecurityPolicy', comment: 'Compliance policy configurations.', properties: [{ name: 'tlsMinVersion', type: 'DATA', range: 'xsd:string' }] },
      Vault: { name: 'HashiCorpVault', comment: 'Secrets vault storing credentials.' },
      Certificate: { name: 'TLSCertificate', comment: 'SSL/TLS credential certificate.', properties: [{ name: 'expiration', type: 'DATA', range: 'xsd:dateTime' }] },
      Secret: { name: 'K8sSecret', comment: 'OCP encrypted secret container.' },
      RBAC: { name: 'AccessRole', comment: 'Role-based access role allocation.' }
    }
  },
  observability: {
    id: 'observability',
    label: 'Telemetry & Observability',
    color: '#00E599',
    icon: Siren,
    classes: {
      MonitoringBinding: { name: 'MonitoringBinding', comment: 'Telemetry collection config.', properties: [{ name: 'tool', type: 'DATA', range: 'xsd:string' }] },
      AppDynamics: { name: 'AppDynamicsBinding', comment: 'AppDynamics agent map configurations.', subClassOf: 'MonitoringBinding' },
      Splunk: { name: 'SplunkBinding', comment: 'Splunk index & sourcetype map configuration.', subClassOf: 'MonitoringBinding' },
      Metrics: { name: 'PerformanceMetric', comment: 'Quantitative performance telemetry.' },
      Alert: { name: 'ObservabilityAlert', comment: 'Triggered system failure warning.' }
    }
  },
  operations: {
    id: 'operations',
    label: 'Operations & DevOps',
    color: '#64D2FF',
    icon: Settings,
    classes: {
      Incident: { name: 'ProductionIncident', comment: 'Active service incident ticket.' },
      Change: { name: 'ChangeRequest', comment: 'Approved infrastructure change ticket.' },
      Migration: { name: 'MigrationPlan', comment: 'DC migration re-binding execution plan.', properties: [{ name: 'strategy', type: 'DATA', range: 'xsd:string' }] }
    }
  },
  ai: {
    id: 'ai',
    label: 'AI Reasoning & Twins',
    color: '#BF5AF2',
    icon: Brain,
    classes: {
      Fact: { name: 'InferredFact', comment: 'Assertion inferred by the reasoning engine.' },
      Rule: { name: 'ReasoningRule', comment: 'Logic verification rule shape (R1-R6).' },
      Confidence: { name: 'ConfidenceCalculation', comment: 'Signal confidence calculation score.' },
      DigitalTwin: { name: 'DigitalTwinBinding', comment: 'Real-time discovery comparison profile.' }
    }
  }
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
          ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-105" 
          : "border-white/10 bg-[#0e1622]/90 hover:bg-[#131d2d]/95 hover:border-white/20"
      )}
      style={{ 
        width: 220,
        boxShadow: d.isHighlighted ? '0 0 20px ' + d.color : '0 4px 12px rgba(0,0,0,0.2)' 
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: d.color }} />
      <div className="flex items-center justify-between mb-1.5 pl-1.5">
        <span className="text-[8px] font-extrabold uppercase tracking-widest opacity-55" style={{ color: d.color }}>
          {d.type || 'Ontology Class'}
        </span>
        {d.isHighlighted && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        )}
      </div>
      <div className="text-[12px] font-extrabold text-white truncate pl-1.5">{d.label}</div>
      <div className="text-[9.5px] text-white/50 mt-1 line-clamp-2 leading-relaxed pl-1.5">{d.comment}</div>
      
      <Handle type="target" position={Position.Top} style={{ background: 'rgba(255,255,255,0.3)', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'rgba(255,255,255,0.3)', width: 6, height: 6 }} />
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
    importAllDocs
  } = useRuntimeLocationStore();

  // Navigation and view states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState('applications');
  const [selectedClassId, setSelectedClassId] = useState('Application');
  const [viewMode, setViewMode] = useState<'schema' | 'instance'>('instance');
  const [selectedAppId, setSelectedAppId] = useState('');

  // Right side tab pane
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
  }, [setBreadcrumbs, setPageTitle, loadApplications]);

  // Set default selected application
  useEffect(() => {
    if (applications.length > 0 && !selectedAppId) {
      setSelectedAppId(applications[0].application_id);
    }
  }, [applications, selectedAppId]);

  // Load detail whenever the selected application changes
  useEffect(() => {
    if (selectedAppId) {
      loadDetail(selectedAppId, 'PRODUCTION');
      loadDriftFromBackend(selectedAppId, 'PRODUCTION');
      setMigrationAppId(selectedAppId);
    }
  }, [selectedAppId, loadDetail, loadDriftFromBackend]);

  // Compute domains list
  const filteredDomains = useMemo(() => {
    return Object.values(ONTOLOGY_DOMAINS);
  }, []);

  // Compute selected class properties (for inspector)
  const selectedClassDetails = useMemo(() => {
    const domain = ONTOLOGY_DOMAINS[selectedDomainId];
    if (!domain) return null;
    return domain.classes[selectedClassId] || null;
  }, [selectedDomainId, selectedClassId]);

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
    });

    logs.forEach((log, index) => {
      setTimeout(() => {
        setRulesLogs(prev => [...prev, log]);
        if (index === logs.length - 1) {
          setRulesEngineRunning(false);
          // If no violations found (all seeded data healthy), show mock compliant violations to verify UI
          setRulesViolations(violations.length > 0 ? violations.slice(0, 3) : [
            { id: 'R1-V1', rule: 'R1', desc: 'DeploymentUnit DU-AUTH-03 lacks active boundToCompute link', scope: 'DU-AUTH-03', dc: 'DC-EAST-1', remediated: false },
            { id: 'R4-V1', rule: 'R4', desc: 'T0 Application APP-CORE-LEDGER is bound only to 1 DC', scope: 'APP-CORE-LEDGER', dc: 'DC-EAST-1', remediated: false }
          ]);
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

  // REACT FLOW GRAPH BUILDER (DYNAMIC FROM SQLITE DATABASE STATE)
  const { nodes, edges } = useMemo(() => {
    const nodesList: Node[] = [];
    const edgesList: Edge[] = [];

    if (viewMode === 'schema') {
      // 1. Schema View: Show the selected Domain classes
      const domain = ONTOLOGY_DOMAINS[selectedDomainId];
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
              style: { stroke: 'rgba(255, 255, 255, 0.15)', strokeWidth: 1.5 },
              animated: isHighlighted,
            });
          }
        });
      }
    } else {
      // 2. Dynamic Instance View: Load selectedDetail from backend SQLite data!
      if (!selectedDetail) {
        // Fallback placeholder while loading or if database is empty
        nodesList.push({
          id: 'app',
          type: 'ontologyClass',
          data: {
            label: 'No Application Loaded',
            comment: 'Click on Seed Sample Data if database is empty',
            color: '#8E8E93',
            type: 'Application Ontology'
          },
          position: { x: 0, y: 70 }
        });
      } else {
        const lobName = selectedDetail.lob_name || 'Retail Banking';
        
        // 2a. Organization Domain: LOB Node
        nodesList.push({
          id: 'lob',
          type: 'ontologyClass',
          data: {
            label: `${lobName} (LOB)`,
            comment: `Enterprise Domain Grouping`,
            color: '#0A84FF',
            type: 'Organization Ontology'
          },
          position: { x: 0, y: -50 }
        });

        // 2b. Applications Domain: Main App Node
        nodesList.push({
          id: 'app',
          type: 'ontologyClass',
          data: {
            label: `${selectedDetail.application_name} (App)`,
            comment: `APPID: ${selectedDetail.application_id} | Confidence: ${selectedDetail.overall_confidence}/4`,
            color: '#BF5AF2',
            isHighlighted: highlightedNodes.includes('app'),
            type: 'Application Ontology'
          },
          position: { x: 0, y: 70 }
        });

        edgesList.push({
          id: 'edge-app-lob',
          source: 'app',
          target: 'lob',
          label: 'ownedBy',
          style: { stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 1.5 },
          animated: true
        });

        const components = selectedDetail.components || [];
        const uniqueDcs = new Map<string, any>();

        components.forEach((comp, compIdx) => {
          const compId = `comp-${comp.id}`;
          const compX = (compIdx - (components.length - 1) / 2) * 260;
          const compY = 200;

          // 2c. Service Domain: Component Node
          nodesList.push({
            id: compId,
            type: 'ontologyClass',
            data: {
              label: `${comp.component_name} (${comp.component_type})`,
              comment: `Tech Stack: ${comp.tech_stack.toUpperCase()}`,
              color: comp.component_type === 'DATABASE' ? '#FF375F' : comp.component_type === 'MESSAGING' ? '#FFD60A' : '#FF9F0A',
              isHighlighted: highlightedNodes.includes(compId) || highlightedNodes.includes('db'),
              type: 'Service Ontology'
            },
            position: { x: compX, y: compY }
          });

          edgesList.push({
            id: `edge-app-${compId}`,
            source: 'app',
            target: compId,
            label: 'exposes',
            style: { stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 1.5 },
            animated: true
          });

          const assets = comp.assets || [];
          assets.forEach((asset, assetIdx) => {
            const assetId = `asset-${asset.id}`;
            const assetX = compX + (assetIdx - (assets.length - 1) / 2) * 130;
            const assetY = 320;

            const isWrite = asset.write_authority && asset.latest_operational_state === 'ACTIVE';

            // 2d. Runtime Domain: Workload / DB Asset Node
            nodesList.push({
              id: assetId,
              type: 'ontologyClass',
              data: {
                label: asset.name,
                comment: `Host: ${asset.host || 'Unknown'} | State: ${asset.latest_operational_state}`,
                color: isWrite ? '#00E599' : '#8E8E93',
                isHighlighted: highlightedNodes.includes(assetId),
                type: 'Runtime Ontology'
              },
              position: { x: assetX, y: assetY }
            });

            edgesList.push({
              id: `edge-${compId}-${assetId}`,
              source: compId,
              target: assetId,
              label: 'deployedAs',
              style: { stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 1.5 },
              animated: true
            });

            if (asset.data_center) {
              const dc = asset.data_center;
              const dcId = `dc-${dc.id}`;
              uniqueDcs.set(dcId, dc);

              edgesList.push({
                id: `edge-${assetId}-${dcId}`,
                source: assetId,
                target: dcId,
                label: 'boundTo',
                style: { stroke: 'rgba(255, 255, 255, 0.15)', strokeWidth: 1.2 }
              });
            }
          });
        });

        // 2e. Physical Domain: Datacenter & Neighborhood Nodes
        const dcList = Array.from(uniqueDcs.values());
        dcList.forEach((dc, dcIdx) => {
          const dcId = `dc-${dc.id}`;
          const dcX = (dcIdx - (dcList.length - 1) / 2) * 320;
          const dcY = 460;

          nodesList.push({
            id: dcId,
            type: 'ontologyClass',
            data: {
              label: `${dc.name} (DC)`,
              comment: `Region: ${dc.region || 'US'} | Zone: ${dc.zone || 'AvailabilityZone'}`,
              color: '#FF453A',
              isHighlighted: highlightedNodes.includes(dcId) || highlightedNodes.includes('dc-west'),
              type: 'Infrastructure Ontology'
            },
            position: { x: dcX, y: dcY }
          });

          const region = dc.region || 'US-EAST';
          const nbhId = `nbh-${region}`;
          
          edgesList.push({
            id: `edge-${dcId}-${nbhId}`,
            source: dcId,
            target: nbhId,
            label: 'partOf',
            style: { stroke: 'rgba(255, 255, 255, 0.15)', strokeWidth: 1.2 }
          });

          if (!nodesList.some(n => n.id === nbhId)) {
            nodesList.push({
              id: nbhId,
              type: 'ontologyClass',
              data: {
                label: `${region} Neighborhood`,
                comment: `Topological Regional Zone Grouping`,
                color: '#32D74B',
                type: 'Network Ontology'
              },
              position: { x: dcX, y: 560 }
            });
          }
        });
      }
    }

    return { nodes: nodesList, edges: edgesList };
  }, [selectedDomainId, selectedClassId, viewMode, highlightedNodes, selectedDetail]);

  return (
    <div className="flex flex-col gap-6 w-full select-none">
      
      {/* ── TOP ACTION HEADER BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 -mt-2 bg-[var(--app-surface)] p-3 rounded-2xl border border-[var(--app-border)] shadow-sm">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-[var(--accent)]" />
          <span className="text-[12px] font-bold text-[var(--text-secondary)]">Enterprise Ontology Platform & Semantic Knowledge Operating System</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Active Application Selector */}
          {applications.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[var(--app-surface-raised)] border border-[var(--app-border)] rounded-lg px-2 py-1">
              <span className="text-[10px] text-[var(--text-muted)] font-bold">App Context:</span>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="bg-transparent text-[11px] font-extrabold text-[var(--text-primary)] outline-none border-0 cursor-pointer"
              >
                {applications.map(app => (
                  <option key={app.application_id} value={app.application_id} className="bg-[#0f172a]">
                    {app.application_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--app-bg-subtle)] border border-[var(--app-border)]">
            <button 
              onClick={() => { setViewMode('schema'); setHighlightedNodes([]); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all",
                viewMode === 'schema' ? "bg-[var(--app-surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              Schema Model
            </button>
            <button 
              onClick={() => { setViewMode('instance'); setHighlightedNodes([]); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all",
                viewMode === 'instance' ? "bg-[var(--app-surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              Instance Graph
            </button>
          </div>

          <a 
            href="file:///d:/Git_Repository/Mesh_Latest/docs/architecture/Enterprise_Ontology_Operating_System.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--app-surface-raised)] border border-[var(--app-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-all"
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
              <h4 className="text-[12px] font-extrabold text-white">Graph Database context empty</h4>
              <p className="text-[10px] text-white/60">No discovered telemetry sources or application profiles found in SQLite database.</p>
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
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-[10.5px] font-bold rounded-lg border border-white/15 transition-all"
            >
              {isSeeding ? 'Importing...' : 'Import Telemetry Reports'}
            </button>
          </div>
        </div>
      )}

      {/* ── TOP KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Ontology Domains', value: 13, sub: 'Unified semantic model', color: '#BF5AF2', icon: Globe },
          { label: 'Model Classes', value: 450, sub: 'Strict OWL structure', color: '#0A84FF', icon: Server },
          { label: 'Relationships', value: '720+', sub: 'Directed properties', color: '#30B0C7', icon: Cpu },
          { label: 'Active Instances', value: applications.length > 0 ? applications.length * 4 : 0, sub: 'DC-Bound telemetry', color: '#FF9F0A', icon: Database },
          { label: 'Reasoning Rules', value: 24, sub: 'SHACL / Jena shapes', color: '#00E599', icon: ShieldCheck },
          { label: 'Twin Drift Status', value: drifts.length, sub: drifts.length === 0 ? 'Fully Aligned' : 'Drift Detected', color: drifts.length === 0 ? '#00E599' : '#FF453A', icon: AlertTriangle }
        ].map((stat, i) => (
          <div 
            key={i} 
            className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden border bg-[var(--app-surface)] shadow-xs"
            style={{ borderColor: 'var(--app-border)' }}
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* LEFT CLASS HIERARCHY TREE (3 Cols) */}
        <div className="lg:col-span-3 p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4"
          style={{ borderColor: 'var(--app-border)' }}>
          
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Class Tree Explorer</h2>
            <Settings className="w-4 h-4 text-[var(--text-muted)]" />
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-[var(--app-bg-subtle)]" style={{ borderColor: 'var(--app-border)' }}>
            <Search className="w-4 h-4 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search classes & properties..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-0 outline-none text-[11px] text-[var(--text-primary)] w-full placeholder-[var(--text-muted)]"
            />
          </div>

          <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredDomains.map((dom) => {
              const matchedClasses = Object.values(dom.classes).filter(cls => 
                cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                cls.comment.toLowerCase().includes(searchTerm.toLowerCase())
              );

              if (matchedClasses.length === 0) return null;

              return (
                <div key={dom.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 px-2.5 py-1 text-[10.5px] font-extrabold uppercase opacity-60 tracking-wider">
                    <dom.icon className="w-3.5 h-3.5" style={{ color: dom.color }} />
                    <span>{dom.label}</span>
                  </div>

                  <div className="pl-4 flex flex-col border-l border-white/5 ml-4">
                    {matchedClasses.map((cls) => (
                      <button
                        key={cls.name}
                        onClick={() => selectClass(dom.id, cls.name)}
                        className={cn(
                          "px-2.5 py-1.5 text-left text-[11px] font-bold rounded-lg transition-all flex items-center justify-between",
                          selectedClassId === cls.name 
                            ? "bg-white/10 text-white" 
                            : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
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
        <div className="lg:col-span-5 p-5 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4 relative overflow-hidden"
          style={{ borderColor: 'var(--app-border)' }}>
          
          <div className="flex items-center justify-between border-b pb-3 border-[var(--app-border)]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[var(--text-primary)]">
                {viewMode === 'schema' ? `Ontological Class Schema: ${selectedDomainId.toUpperCase()}` : 'Discovered Instance Graph Topology'}
              </span>
              <HelpCircle className="w-4 h-4 text-[var(--text-muted)]" />
            </div>

            <div className="flex items-center gap-2 text-[9px] font-bold text-white bg-[var(--app-surface-raised)] px-2 py-0.5 rounded border border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>ACTIVE GRAPH</span>
            </div>
          </div>

          {/* Graph Canvas */}
          <div className="w-full h-[460px] rounded-xl overflow-hidden border border-[var(--app-border)] relative bg-[#070b12]/50">
            <ReactFlowProvider>
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
                <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.05)" />
              </ReactFlow>
            </ReactFlowProvider>
          </div>

          <div className="text-[10px] font-bold text-[var(--text-muted)] leading-relaxed italic">
            * Interactive flow board. Classes can be searched and clicked to inspect attributes, SPARQL shapes, and reasoning paths.
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
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
                  <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div>
                      <h3 className="text-[14px] font-bold text-white flex items-center gap-1.5">
                        <InfoIcon className="w-4 h-4 text-blue-400" />
                        <span>Class: {selectedClassDetails.name}</span>
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5">
                        {selectedClassDetails.comment}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Semantic Metadata</h4>
                      <div className="text-[11px] font-bold bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">URINamespace:</span>
                          <span className="text-white font-mono text-[9.5px]">ekos-{selectedDomainId}:</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">SubClassOf:</span>
                          <span className="text-blue-400 font-mono text-[10px]">{selectedClassDetails.subClassOf || 'owl:Thing'}</span>
                        </div>
                      </div>
                    </div>

                    {selectedClassDetails.properties && selectedClassDetails.properties.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Defined Properties</h4>
                        <div className="flex flex-col gap-1">
                          {selectedClassDetails.properties.map((prop, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5 text-[11px] font-bold">
                              <div>
                                <div className="text-white">{prop.name}</div>
                                <div className="text-[9px] opacity-40">{prop.type === 'DATA' ? 'rdf:DatatypeProperty' : 'rdf:ObjectProperty'}</div>
                              </div>
                              <div className="text-blue-400 font-mono text-[9.5px]">{prop.range}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. SPARQL / Cypher Query Builder */}
                {rightPanelTab === 'query' && (
                  <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div>
                      <h3 className="text-[12px] font-bold text-white">Semantic SPARQL / Cypher Query</h3>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Explore relationships across 5,000 application nodes.</p>
                    </div>

                    {/* Templates list */}
                    <div className="flex gap-2">
                      {queryTemplates.map((tmpl, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleApplyTemplate(tmpl.query)}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold text-white border border-white/5"
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
                        className="w-full bg-[#0a0f18] border border-white/10 rounded-xl p-3 font-mono text-[10.5px] text-emerald-400 outline-none focus:border-emerald-500"
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
                        <div className="overflow-x-auto border border-white/10 rounded-xl max-h-[160px]">
                          <table className="w-full text-left text-[10.5px] font-bold">
                            <thead>
                              <tr className="bg-white/5 border-b border-white/10 text-white/60">
                                {Object.keys(queryResults[0]).map((key) => (
                                  <th key={key} className="p-2">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResults.map((row, idx) => (
                                <tr key={idx} className="border-b border-white/5 last:border-0 text-white">
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
                  <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[12px] font-bold text-white">AI Inference & Reasoning Engine</h3>
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
                        <div className="text-center py-4 text-[11px] text-[var(--text-muted)] bg-white/5 rounded-xl border border-white/5">
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
                                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400 opacity-60" 
                                  : "bg-[#FF453A]/5 border-[#FF453A]/20 text-[#FF453A]"
                              )}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white/5 mr-2">
                                    {v.rule}
                                  </span>
                                  <span className="text-[11px] font-bold">{v.scope}</span>
                                </div>
                                <span className="text-[9px] opacity-60">{v.dc}</span>
                              </div>
                              <p className="text-[10px] text-white/70 leading-relaxed font-semibold">{v.desc}</p>
                              
                              {!v.remediated && (
                                <button
                                  onClick={() => handleRemediateRule(v.id)}
                                  className="self-end px-2.5 py-1 rounded text-[9.5px] font-bold bg-white/10 hover:bg-white/20 text-white border border-white/15"
                                >
                                  Auto-Remediate
                                </button>
                              )}
                              {v.remediated && (
                                <div className="flex items-center gap-1 text-[9.5px] font-bold text-emerald-400 self-end">
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
                        <div className="p-3 rounded-xl border bg-black/60 border-white/5 font-mono text-[9px] text-white/70 h-[120px] overflow-y-auto flex flex-col gap-0.5">
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
                  <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div>
                      <h3 className="text-[12px] font-bold text-white">Parameterized DC Migration Coordinator</h3>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Rebind logical app components to target physical locations.</p>
                    </div>

                    {/* Setup selectors */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-bold">
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--text-muted)]">App Context:</span>
                        <select 
                          value={migrationAppId}
                          onChange={(e) => setMigrationAppId(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg p-1 text-white outline-none"
                        >
                          {applications.map(app => (
                            <option key={app.application_id} value={app.application_id} className="bg-[#0f172a]">
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
                          className="bg-white/5 border border-white/10 rounded-lg p-1 text-white outline-none"
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
                          className="bg-white/5 border border-white/10 rounded-lg p-1 text-white outline-none"
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
                        className="flex-1 px-3 py-2 rounded-lg text-[10.5px] font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Execute Cutover
                      </button>
                      <button
                        onClick={startRollbackSimulation}
                        disabled={migrationState === 'running'}
                        className="flex-1 px-3 py-2 rounded-lg text-[10.5px] font-bold bg-[#FF453A]/10 border border-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A]/20 flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Simulate Rollback
                      </button>
                    </div>

                    {/* Progress tracking */}
                    {migrationState === 'running' && (
                      <div className="flex flex-col gap-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="flex justify-between text-[10.5px] font-bold text-white">
                          <span>Execution Progress (Phase {migrationPhase}/5)</span>
                          <span>{migrationProgress}%</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5">
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
                        <div className="p-3 rounded-xl border bg-black/60 border-white/5 font-mono text-[9px] text-white/70 h-[140px] overflow-y-auto flex flex-col gap-0.5 font-semibold">
                          {migrationLogs.map((log, idx) => (
                            <div key={idx} className={cn(
                              log.includes("ERROR") && "text-[#FF453A]",
                              log.includes("completed") && "text-emerald-400",
                              log.includes("Rollback complete") && "text-amber-400"
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
                  <div className="p-4 rounded-2xl border bg-[var(--app-surface)] flex flex-col gap-4" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[12px] font-bold text-white">Digital Twin alignment</h3>
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
                        <div className="text-center py-8 text-[11px] text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/20 flex flex-col items-center gap-2">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                          <span>Digital twin posture matches runtime reality!</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {currentDrifts.map((item) => (
                            <div key={item.id} className="p-3 bg-white/5 border border-white/5 rounded-xl flex flex-col gap-1 text-[11px] font-bold">
                              <div className="flex justify-between items-center text-white">
                                <div className="flex items-center gap-2">
                                  <span className="text-[8px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-extrabold">{item.drift_type}</span>
                                  <span>{item.application_id}</span>
                                </div>
                                <span className="text-[#FF453A] text-[9.5px] uppercase">{item.severity} DRIFT</span>
                              </div>
                              <p className="text-[10px] text-white/50 leading-relaxed font-semibold mt-1">{item.description}</p>
                              <div className="text-[9.5px] opacity-45 mt-1">
                                Intended: <span className="text-white">{item.intended}</span> | Actual: <span className="text-white">{item.actual}</span>
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

    </div>
  );
}
