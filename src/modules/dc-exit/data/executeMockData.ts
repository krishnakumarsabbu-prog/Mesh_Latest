/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Mock data for the Execute step. No backend — purely static
 * application execution rows, status definitions, and timeline
 * tracks (planned vs actual) used to render the two Execute tabs.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Database as DatabaseIcon,
  Flame as KafkaIcon,
  FlameKindling as MqIcon,
  Globe as DnsIcon,
  Boxes as BoxesIcon,
} from 'lucide-react';

// ─── Execution status ────────────────────────────────────────────────────────

export type ExecStatus = 'pending' | 'running' | 'verifying' | 'completed' | 'failed';

export const EXEC_STATUS_ORDER: ExecStatus[] = ['pending', 'running', 'verifying', 'completed', 'failed'];

export interface ExecStatusMeta {
  label: string;
  color: string;
  bg: string;
  border: string;
  bar: string;
}

export const EXEC_STATUS_META: Record<ExecStatus, ExecStatusMeta> = {
  pending:   { label: 'Pending',   color: '#8A97A8', bg: 'rgba(138,151,168,0.08)', border: 'rgba(138,151,168,0.18)', bar: '#8A97A8' },
  running:   { label: 'Running',   color: '#006CFF', bg: 'rgba(0,108,255,0.08)',   border: 'rgba(0,108,255,0.22)',   bar: '#006CFF' },
  verifying: { label: 'Verifying', color: '#FFB100', bg: 'rgba(255,177,0,0.08)',   border: 'rgba(255,177,0,0.22)',   bar: '#FFB100' },
  completed: { label: 'Completed', color: '#00B074', bg: 'rgba(0,176,116,0.08)',   border: 'rgba(0,176,116,0.22)',   bar: '#00B074' },
  failed:    { label: 'Failed',    color: '#FF4D4D', bg: 'rgba(255,77,77,0.08)',    border: 'rgba(255,77,77,0.22)',    bar: '#FF4D4D' },
};

// ─── Application icons ───────────────────────────────────────────────────────

export type AppTechIcon = 'app' | 'oracle' | 'kafka' | 'mq' | 'dns';

export const APP_TECH_ICON: Record<AppTechIcon, LucideIcon> = {
  app: BoxesIcon,
  oracle: DatabaseIcon,
  kafka: KafkaIcon,
  mq: MqIcon,
  dns: DnsIcon,
};

// ─── Execution apps ──────────────────────────────────────────────────────────

export interface ExecApp {
  id: string;
  name: string;
  techIcon: AppTechIcon;
  tier: 'T1' | 'T2' | 'T3';
  wave: number;
  status: ExecStatus;
  /** 0-100 progress within current status phase */
  progress: number;
  /** per-app confidence 0-100 */
  confidence: number;
  /** steps completed out of total */
  stepsDone: number;
  stepsTotal: number;
  owner: string;
  detail: string;
}

export const execApps: ExecApp[] = [
  {
    id: 'ex-1',
    name: 'payment-gateway-svc',
    techIcon: 'app',
    tier: 'T1',
    wave: 1,
    status: 'completed',
    progress: 100,
    confidence: 96,
    stepsDone: 6,
    stepsTotal: 6,
    owner: 'Platform Ops',
    detail: 'Cutover complete. Traffic shifted to target cluster. Oracle primary verified.',
  },
  {
    id: 'ex-2',
    name: 'claims-service',
    techIcon: 'app',
    tier: 'T1',
    wave: 1,
    status: 'completed',
    progress: 100,
    confidence: 91,
    stepsDone: 6,
    stepsTotal: 6,
    owner: 'Claims Team',
    detail: 'Cutover complete. MQ channels re-established. Standby apply lag resolved.',
  },
  {
    id: 'ex-3',
    name: 'policy-admin-svc',
    techIcon: 'app',
    tier: 'T1',
    wave: 2,
    status: 'verifying',
    progress: 60,
    confidence: 78,
    stepsDone: 4,
    stepsTotal: 6,
    owner: 'Policy Team',
    detail: 'Traffic shifted. Verifying Mongo replica sync and DNS resolution.',
  },
  {
    id: 'ex-4',
    name: 'billing-service',
    techIcon: 'app',
    tier: 'T2',
    wave: 2,
    status: 'running',
    progress: 45,
    confidence: 64,
    stepsDone: 3,
    stepsTotal: 6,
    owner: 'Billing Team',
    detail: 'Migrating Oracle schemas. Queue manager reconnect in progress.',
  },
  {
    id: 'ex-5',
    name: 'routing-engine',
    techIcon: 'app',
    tier: 'T2',
    wave: 2,
    status: 'running',
    progress: 30,
    confidence: 58,
    stepsDone: 2,
    stepsTotal: 6,
    owner: 'Routing Team',
    detail: 'Kafka consumer offsets syncing. Target pods scaling up.',
  },
  {
    id: 'ex-6',
    name: 'notification-svc',
    techIcon: 'app',
    tier: 'T3',
    wave: 3,
    status: 'pending',
    progress: 0,
    confidence: 42,
    stepsDone: 0,
    stepsTotal: 4,
    owner: 'Comms Team',
    detail: 'Awaiting Wave 2 completion. Kafka topic provisioning queued.',
  },
  {
    id: 'ex-7',
    name: 'invoice-generator',
    techIcon: 'app',
    tier: 'T3',
    wave: 3,
    status: 'pending',
    progress: 0,
    confidence: 38,
    stepsDone: 0,
    stepsTotal: 4,
    owner: 'Finance Ops',
    detail: 'Awaiting Wave 2 completion. Oracle link scheduled.',
  },
];

// ─── Timeline tracks ─────────────────────────────────────────────────────────

export interface TimelineMilestone {
  /** hour index 0-4 */
  hour: number;
  label: string;
  /** planned start minute offset within the hour (0-59) */
  startMin: number;
  /** planned duration in minutes */
  durationMin: number;
}

export interface TimelineActual extends TimelineMilestone {
  /** actual start minute offset; null if not started */
  actualStartMin: number | null;
  /** actual duration in minutes; null if still running */
  actualDurationMin: number | null;
  /** completion status */
  actualStatus: ExecStatus;
}

export const TIMELINE_HOURS = [0, 1, 2, 3, 4];

export const timelineActual: TimelineActual[] = [
  {
    hour: 0, label: 'Pre-checks & freeze', startMin: 0, durationMin: 45,
    actualStartMin: 0, actualDurationMin: 48, actualStatus: 'completed',
  },
  {
    hour: 0, label: 'Wave 1 cutover — payment', startMin: 30, durationMin: 30,
    actualStartMin: 32, actualDurationMin: 34, actualStatus: 'completed',
  },
  {
    hour: 1, label: 'Wave 1 cutover — claims', startMin: 0, durationMin: 40,
    actualStartMin: 2, actualDurationMin: 42, actualStatus: 'completed',
  },
  {
    hour: 1, label: 'Wave 1 verify & smoke', startMin: 40, durationMin: 20,
    actualStartMin: 44, actualDurationMin: 18, actualStatus: 'completed',
  },
  {
    hour: 2, label: 'Wave 2 cutover — policy', startMin: 0, durationMin: 35,
    actualStartMin: 1, actualDurationMin: null, actualStatus: 'verifying',
  },
  {
    hour: 2, label: 'Wave 2 cutover — billing', startMin: 20, durationMin: 40,
    actualStartMin: 22, actualDurationMin: null, actualStatus: 'running',
  },
  {
    hour: 3, label: 'Wave 2 cutover — routing', startMin: 0, durationMin: 30,
    actualStartMin: 24, actualDurationMin: null, actualStatus: 'running',
  },
  {
    hour: 3, label: 'Wave 2 verify & rollback window', startMin: 30, durationMin: 30,
    actualStartMin: null, actualDurationMin: null, actualStatus: 'pending',
  },
  {
    hour: 4, label: 'Wave 3 cutover — notification', startMin: 0, durationMin: 25,
    actualStartMin: null, actualDurationMin: null, actualStatus: 'pending',
  },
  {
    hour: 4, label: 'Wave 3 cutover — invoice', startMin: 25, durationMin: 20,
    actualStartMin: null, actualDurationMin: null, actualStatus: 'pending',
  },
];
