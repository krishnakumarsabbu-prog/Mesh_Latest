# HealthMesh AI — Enterprise Runtime Visibility Platform

**"Where is my application running RIGHT NOW?"**

HealthMesh AI (branded **LiveLens**) is an enterprise observability platform that answers the single most critical question during a 2 AM production outage: *where is my application actually running, who owns the writes, and can I trust the answer?*

Built for a Fortune-50 enterprise hackathon, the platform correlates telemetry from 8+ heterogeneous monitoring sources (AppDynamics, Oracle OEM, IBM MQ, MongoDB, OpenShift, GSLB/AVI, SCOM, CMDB) into a unified, deterministic runtime truth model — with a transparent confidence engine that tells operators exactly how much to trust every assertion.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [System Architecture Diagram](#system-architecture-diagram)
- [Data Flow Architecture](#data-flow-architecture)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Core Functionalities](#core-functionalities)
  - [1. Runtime Location](#1-runtime-location)
  - [2. Runtime Truth](#2-runtime-truth)
  - [3. LOB View](#3-lob-view)
  - [4. Neighbourhood View](#4-neighbourhood-view)
  - [5. Application Location Detail](#5-application-location-detail)
  - [6. Audit Logs](#6-audit-logs)
  - [7. Users & RBAC](#7-users--rbac)
  - [8. AI Chat Assistant](#8-ai-chat-assistant)
- [Confidence Engine](#confidence-engine)
- [Data Sources & Telemetry Correlation](#data-sources--telemetry-correlation)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)

---

## Architecture Overview

HealthMesh AI follows a **decoupled client-server architecture** with real-time WebSocket communication:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HEALTHMESH AI PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        FRONTEND (React + Vite)                        │  │
│  │                                                                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │  │
│  │  │ Runtime  │  │ Runtime  │  │   LOB    │  │  Neighbourhood View  │ │  │
│  │  │ Location │  │  Truth   │  │   View   │  │                      │ │  │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────────┬───────────┘ │  │
│  │        │             │             │                   │             │  │
│  │  ┌─────┴─────────────┴─────────────┴───────────────────┴──────────┐  │  │
│  │  │              Zustand Stores (State Management)                 │  │  │
│  │  │  authStore │ runtimeLocationStore │ wsStore │ chatStore │ ...  │  │  │
│  │  └──────────────────────────┬─────────────────────────────────────┘  │  │
│  │                             │                                        │  │
│  │  ┌──────────────────────────┴─────────────────────────────────────┐  │  │
│  │  │         API Layer (axios) + WebSocket (real-time)              │  │  │
│  │  └──────────────────────────┬─────────────────────────────────────┘  │  │
│  └──────────────────────────────┼───────────────────────────────────────┘  │
│                                 │                                          │
│  ┌──────────────────────────────┴───────────────────────────────────────┐  │
│  │                     BACKEND (FastAPI + Python)                       │  │
│  │                                                                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │  │
│  │  │   Auth   │  │  Users   │  │ Runtime  │  │     WebSocket        │ │  │
│  │  │ Endpoint │  │ Endpoint │  │ Endpoint │  │     Manager          │ │  │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────────┬───────────┘ │  │
│  │        └─────────────┴─────────────┴──────────────────┘             │  │
│  │                             │                                      │  │
│  │  ┌──────────────────────────┴───────────────────────────────────┐  │  │
│  │  │                    Service Layer                              │  │  │
│  │  │  audit_service │ auth_service │ blast_radius_service         │  │  │
│  │  │  confidence_service │ drift_service                          │  │  │
│  │  └──────────────────────────┬───────────────────────────────────┘  │  │
│  │                             │                                      │  │
│  │  ┌──────────────────────────┴───────────────────────────────────┐  │  │
│  │  │              SQLite Database (healthmesh.db)                  │  │  │
│  │  │  RuntimeAsset │ ApplicationComponent │ DataSourceInfo │      │  │  │
│  │  │  SourceConflict │ IntentDrift │ RuntimeSnapshot │ AuditLog   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   TELEMETRY DATA SOURCES (docs/)                     │  │
│  │  AppDynamics │ Oracle OEM │ IBM MQ │ MongoDB │ OpenShift │           │  │
│  │  GSLB/AVI │ SCOM │ SPLOC Traffic │ CMDB                            │  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite 5 |
| **Routing** | React Router DOM 6 (lazy-loaded pages) |
| **State Management** | Zustand 5 |
| **Data Fetching** | TanStack React Query 5 |
| **HTTP Client** | Axios |
| **Visualization** | Recharts, @xyflow/react (dependency graphs), custom SVG maps |
| **Animation** | Framer Motion 11 |
| **Icons** | Lucide React |
| **Styling** | Tailwind CSS 3, tailwind-merge, clsx |
| **Backend** | FastAPI (Python), Uvicorn |
| **Database** | SQLite (healthmesh.db) — SQLAlchemy ORM |
| **Real-time** | WebSocket (FastAPI native) |
| **Auth** | JWT tokens (python-jose), bcrypt password hashing |
| **Data Parsing** | Custom CSV/Excel parser (xlsx files in docs/) |

---

## System Architecture Diagram

### Request Lifecycle

```
┌──────────┐     HTTP/REST      ┌──────────┐     SQLAlchemy     ┌──────────┐
│  Browser │ ──────────────────▶ │ FastAPI  │ ────────────────▶ │  SQLite  │
│  (React) │ ◀────────────────── │ Backend  │ ◀──────────────── │    DB    │
└────┬─────┘     JSON Response   └────┬─────┘                   └──────────┘
     │                                │
     │       WebSocket (real-time)    │
     │ ◀────────────────────────────▶ │
     │   drift alerts, state changes  │
     │                                │
     │  ┌─────────────────────────────┴──────────────────────────┐
     │  │                 Backend Services                       │
     │  │                                                        │
     │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
     │  │  │ Auth Service │  │ Audit Service│  │ Drift Service│ │
     │  │  │ (JWT + bcrypt)│  │ (event log)  │  │ (intent vs   │ │
     │  │  └──────────────┘  └──────────────┘  │  actual)     │ │
     │  │                                      └──────────────┘ │
     │  │  ┌────────────────────────┐  ┌──────────────────────┐ │
     │  │  │ Confidence Service    │  │ Blast Radius Service │ │
     │  │  │ (freshness, determinism│  │ (impact analysis)   │ │
     │  │  │  agreement, coverage) │  │                      │ │
     │  │  └────────────────────────┘  └──────────────────────┘ │
     │  └────────────────────────────────────────────────────────┘
     │
     │  ┌─────────────────────────────────────────────────────────┐
     │  │              Frontend Engine (Client-side)              │
     │  │                                                         │
     │  │  ┌─────────────────────────────────────────────────┐   │
     │  │  │           Runtime Truth Engine                   │   │
     │  │  │  (src/lib/runtimeTruthEngine.ts)                 │   │
     │  │  │                                                  │   │
     │  │  │  computeVerdict() → RuntimeVerdict               │   │
     │  │  │  buildServiceTopology() → ServiceTopologyData    │   │
     │  │  │  buildTimeline() → TimelineEvent[]               │   │
     │  │  │  buildDiscoveredSignals() → DiscoveredSignal[]   │   │
     │  │  │  computeConfidence() → ConfidenceBreakdown       │   │
     │  │  └─────────────────────────────────────────────────┘   │
     │  └─────────────────────────────────────────────────────────┘
     └─────────────────────────────────────────────────────────────┘
```

### Telemetry Correlation Pipeline

```
                    TELEMETRY SOURCES
                    ═════════════════
                    
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ AppDynamics  │  │  Oracle OEM  │  │   IBM MQ     │  │   MongoDB    │
  │  (APM/CRM)   │  │  (DB Roles)  │  │  (QM Status) │  │  (RS State)  │
  │  Traffic     │  │  State       │  │  State       │  │  Replication │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                 │                 │
         └────────┬────────┴────────┬────────┘                 │
                  │                 │                          │
                  ▼                 ▼                          │
  ┌──────────────────────────────────────────┐                │
  │        CORRELATION KEY: App ID           │◀───────────────┘
  │  (extracted via direct match, regex,     │
  │   or delimited extraction)               │
  └──────────────────┬───────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                  FULL-STACK TOPOLOGY MODEL                   │
  │                                                              │
  │  Layer 1: TRAFFIC / INGRESS                                 │
  │    ├── AppDynamics (call rates per node)                     │
  │    ├── GSLB / AVI (virtual service routing)                 │
  │    └── SPLOC (app traffic)                                  │
  │                                                              │
  │  Layer 2: COMPUTE                                           │
  │    ├── OpenShift / Kubernetes (pod phase)                    │
  │    └── VM (CMDB topology)                                   │
  │                                                              │
  │  Layer 3: MESSAGING                                          │
  │    └── IBM MQ (queue manager status)                         │
  │                                                              │
  │  Layer 4: DATABASE                                           │
  │    ├── Oracle Data Guard (PRIMARY/STANDBY)                  │
  │    ├── MongoDB Replica Set (rs_state=1 → PRIMARY)           │
  │    └── MSSQL AlwaysOn (SCOM replica sync)                   │
  └──────────────────────────────────────────────────────────────┘
```

---

## Data Flow Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION FLOW                                 │
│                                                                            │
│  docs/*.xlsx / *.csv  ──▶  CSV/Excel Parser  ──▶  Runtime Endpoint       │
│  (8 telemetry files)       (src/lib/csvParser)    (/api/v1/runtime/import)│
│                                                                  │         │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  Auto-Import on Startup (lifespan hook)                       │       │
│  │  If DB is empty → import_all_docs() from docs/ directory     │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                  ▼         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    SQLite Database (healthmesh.db)                  │  │
│  │                                                                    │  │
│  │  RuntimeAsset ──┬── ApplicationComponent ── ApplicationLocation    │  │
│  │                 │                                                  │  │
│  │  DataSourceInfo ─┤                                                  │  │
│  │                 │                                                  │  │
│  │  SourceConflict ─┤                                                  │  │
│  │                 │                                                  │  │
│  │  IntentDrift ────┤                                                  │  │
│  │                 │                                                  │  │
│  │  RuntimeSnapshot─┘                                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                  │                                        │
│  ┌───────────────────────────────┴────────────────────────────────────┐  │
│  │                    READ / QUERY FLOW                                │  │
│  │                                                                     │  │
│  │  Frontend (React) ──GET /api/v1/runtime/locations──▶ FastAPI       │  │
│  │     │                                                               │  │
│  │     ├── Application summaries (grid view)                           │  │
│  │     ├── Application detail (cockpit view)                          │  │
│  │     ├── Data sources status                                         │  │
│  │     ├── Conflicts & drifts                                          │  │
│  │     └── Snapshots (historical timeline)                             │  │
│  │                                                                     │  │
│  │  WebSocket ──ws://host:8000/ws──▶ Real-time drift & state alerts    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                  CLIENT-SIDE COMPUTATION                            │  │
│  │                                                                     │  │
│  │  Runtime Truth Engine (src/lib/runtimeTruthEngine.ts)              │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │  Input: ApplicationLocationDetail + IntentDrift[] +         │   │  │
│  │  │         RuntimeSnapshot[]                                  │   │  │
│  │  │                                                              │   │  │
│  │  │  computeVerdict() ──▶ RuntimeVerdict                        │   │  │
│  │  │    ├── Confidence breakdown (freshness, determinism,         │   │  │
│  │  │    │   agreement, coverage — each /25, total /100)         │   │  │
│  │  │    ├── Authoritative site determination                     │   │  │
│  │  │    ├── Component authority (per-DC roles)                  │   │  │
│  │  │    ├── Failover scenarios (4 what-if simulations)          │   │  │
│  │  │    └── Risk assessment (LOW → CRITICAL)                    │   │  │
│  │  │                                                              │   │  │
│  │  │  buildServiceTopology() ──▶ nodes + edges for graph        │   │  │
│  │  │  buildTimeline() ──▶ chronological operational events       │   │  │
│  │  │  buildDiscoveredSignals() ──▶ signal marketplace           │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Backend Architecture

### FastAPI Application Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app factory, lifespan (auto-import), CORS, middleware
│   ├── core/
│   │   ├── config.py            # Settings (APP_NAME, DB URL, JWT secret, CORS origins)
│   │   ├── security.py          # JWT token creation/verification, bcrypt password hashing
│   │   ├── exceptions.py        # Custom exception handlers (400/401/404/500)
│   │   ├── middleware.py        # Request logging, response timing middleware
│   │   └── ws_manager.py        # WebSocket connection manager (broadcast to all clients)
│   ├── db/
│   │   ├── base.py              # SQLAlchemy engine, AsyncSessionLocal, init_db()
│   │   └── seed.py              # Seed data for initial users & catalogs
│   ├── models/                  # SQLAlchemy ORM models (30+ tables)
│   │   ├── runtime.py            # RuntimeAsset, ApplicationComponent, DataSourceInfo
│   │   ├── audit.py              # AuditLogEntry
│   │   ├── user.py               # User, UserSettings
│   │   ├── connector*.py         # Connector catalog, execution logs, project connectors
│   │   ├── health*.py            # HealthCheck, HealthRule, HealthRun
│   │   ├── lob.py / sub_lob.py   # Line of Business hierarchy
│   │   ├── project.py / team.py  # Project & team models
│   │   ├── rbac.py               # Role-based access control
│   │   └── ...                   # Dashboard templates, metrics, platform integrations
│   ├── schemas/
│   │   └── user.py              # Pydantic schemas for user API
│   ├── services/
│   │   ├── auth_service.py       # Authentication logic (login, register, token refresh)
│   │   ├── audit_service.py      # Audit event recording
│   │   ├── blast_radius_service.py # Impact / blast radius analysis
│   │   ├── confidence_service.py  # Confidence scoring (server-side)
│   │   └── drift_service.py      # Intent vs actual drift detection
│   └── api/v1/
│       ├── router.py             # Aggregates all endpoint routers
│       └── endpoints/
│           ├── auth.py           # POST /login, POST /register, GET /me
│           ├── users.py           # GET /users, POST /users, PUT /users/:id
│           ├── runtime.py         # GET /runtime/locations, GET /runtime/:appId,
│           │                      # POST /runtime/import, GET /runtime/sources,
│           │                      # GET /runtime/conflicts, GET /runtime/drifts,
│           │                      # GET /runtime/snapshots, POST /runtime/import-all
│           └── websocket.py       # WS /ws — real-time drift & state change alerts
├── healthmesh.db                 # SQLite database file
├── run.py                        # Uvicorn entry point
└── requirements.txt              # Python dependencies (FastAPI, SQLAlchemy, etc.)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/login` | Authenticate user, returns JWT |
| POST | `/api/v1/register` | Create new user account |
| GET | `/api/v1/me` | Get current authenticated user |
| GET | `/api/v1/users` | List all users (admin only) |
| POST | `/api/v1/users` | Create user (admin only) |
| PUT | `/api/v1/users/:id` | Update user (admin only) |
| GET | `/api/v1/runtime/locations` | List all application runtime summaries |
| GET | `/api/v1/runtime/locations/:appId` | Get detailed runtime info for one app |
| GET | `/api/v1/runtime/sources` | List all data sources with freshness |
| GET | `/api/v1/runtime/conflicts` | List source conflicts |
| GET | `/api/v1/runtime/drifts` | List intent drifts |
| GET | `/api/v1/runtime/snapshots` | List historical runtime snapshots |
| POST | `/api/v1/runtime/import` | Import telemetry from uploaded file |
| POST | `/api/v1/runtime/import-all` | Bulk import all docs/ files |
| WS | `/ws` | Real-time drift & state change alerts |
| GET | `/health` | Health check endpoint |

### Auto-Import on Startup

When the backend starts and the database is empty, it automatically:
1. Scans the `docs/` directory for `.xlsx` and `.csv` files
2. Parses each file using the CSV/Excel parser
3. Extracts App IDs via direct match, regex, or delimited extraction
4. Correlates data across sources by App ID
5. Creates `RuntimeAsset`, `ApplicationComponent`, `DataSourceInfo` records
6. Detects cross-source conflicts (e.g., Oracle OEM says PRIMARY but SCOM says SECONDARY)

---

## Frontend Architecture

### Routing & Page Structure

```
src/
├── App.tsx                        # BrowserRouter, lazy-loaded routes, RequireAuth guard
├── main.tsx                       # React entry point, QueryClient setup
├── index.css                      # Tailwind + global styles + CSS variables
│
├── pages/
│   ├── LoginPage.tsx              # Split-screen login with role selector
│   ├── RuntimeLocationPage.tsx    # SRE Command Center (grid + cockpit)
│   ├── ApplicationLocationDetailPage.tsx  # Deep-dive single app (11 tabs)
│   ├── RuntimeTruthPage.tsx        # Verdict engine (7 sub-tabs)
│   ├── LOBViewPage.tsx             # Line of Business hierarchy (7 tabs)
│   ├── NeighbourhoodViewPage.tsx   # Infrastructure neighbourhood map
│   ├── UsersPage.tsx              # User directory & RBAC
│   ├── AuditPage.tsx              # Audit trail
│   └── NotFoundPage.tsx           # 404
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx          # Shell: Sidebar + Header + content area
│   │   ├── Header.tsx             # Top bar with search, theme toggle, notifications
│   │   └── Sidebar.tsx            # Collapsible nav with tooltips
│   │
│   ├── runtime/                   # 20 runtime visualization components
│   │   ├── DataCenterCard.tsx
│   │   ├── LocationMap.tsx
│   │   ├── USAMapPaths.tsx
│   │   ├── RuntimeDependencyGraph.tsx
│   │   ├── RuntimeHierarchyTree.tsx
│   │   ├── ServiceTopologyMap.tsx
│   │   ├── ConfidenceBadge.tsx
│   │   ├── ConfidenceBreakdownPanel.tsx
│   │   ├── ConflictAlert.tsx
│   │   ├── FreshnessIndicator.tsx
│   │   ├── AssetStatusBadge.tsx
│   │   ├── AuditLogTab.tsx
│   │   ├── DataDiscoveryPanel.tsx
│   │   ├── DataSourcePanel.tsx
│   │   ├── IncidentModePanel.tsx
│   │   ├── IntentDefinitionPanel.tsx
│   │   ├── IntentVsActualTab.tsx
│   │   ├── PortalGuidePanel.tsx
│   │   ├── DemoWalkthroughOverlay.tsx
│   │   ├── TechStackIcon.tsx
│   │   └── widgets/
│   │       ├── DataCenterHealthMapWidget.tsx
│   │       ├── FreshnessStatusWidget.tsx
│   │       └── RuntimeAppLocationWidget.tsx
│   │
│   ├── chat/                      # AI chat assistant
│   │   ├── ChatWidget.tsx         # Floating button + expandable window
│   │   ├── ChatWindow.tsx         # Message list + typing indicator
│   │   ├── ChatMessage.tsx        # Individual message bubble
│   │   ├── ChatInput.tsx          # Input box with send button
│   │   └── TypingIndicator.tsx    # Animated dots
│   │
│   └── ui/                        # Reusable design system
│       ├── Button.tsx, Input.tsx, Card.tsx, Badge.tsx, Modal.tsx
│       ├── Table.tsx, Dropdown.tsx, Tooltip.tsx, Avatar.tsx
│       ├── PageHeader.tsx, MetricCard.tsx, EmptyState.tsx
│       ├── Skeleton.tsx, Notification.tsx, ErrorBoundary.tsx
│       └── ThemeSwitcher.tsx
│
├── store/                         # Zustand state stores
│   ├── authStore.ts               # User, token, login/logout
│   ├── runtimeLocationStore.ts    # App summaries, selected app, filters
│   ├── wsStore.ts                 # WebSocket connection & messages
│   ├── chatStore.ts               # Chat messages & state
│   ├── themeStore.ts              # Dark/light theme
│   ├── uiStore.ts                 # Sidebar collapse, modals
│   ├── notificationStore.ts       # Toast notifications
│   └── connectorConfigStore.ts     # Connector configuration
│
├── lib/
│   ├── runtimeTruthEngine.ts      # Verdict & confidence computation engine
│   ├── runtimeTruthMock.ts        # Mock data for runtime truth
│   ├── runtimeLocationMock.ts     # Mock data for runtime location
│   ├── api.ts                     # Axios instance + API functions
│   ├── csvParser.ts               # CSV/Excel parsing logic
│   ├── permissions.ts             # RBAC permission helpers
│   ├── errorHandler.ts            # Global error handling
│   ├── theme.ts                   # Theme definitions
│   └── utils.ts                   # cn() class merge utility
│
├── hooks/
│   ├── useProjectStream.ts        # React Query hook for project data
│   └── useWebSocket.ts            # WebSocket connection hook
│
├── services/
│   └── chatService.ts             # Chat message processing
│
└── types/                         # TypeScript type definitions
    ├── index.ts                   # Re-exports all types
    ├── runtime.ts                 # RuntimeAsset, ApplicationComponent, etc.
    ├── auth.ts, lob.ts, project.ts, team.ts, connector.ts
    ├── health.ts, dashboard.ts, agent.ts, topology.ts, rules.ts
    └── sub_lob.ts
```

### State Management (Zustand Stores)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ZUSTAND STORES                               │
├──────────────────┬──────────────────────────────────────────────────┤
│ authStore        │ user, token, isAuthenticated, login(), logout() │
│ runtimeLocation  │ summaries[], selectedApp, filters, import modal │
│ wsStore          │ ws connection, messages[], drift alerts          │
│ chatStore        │ messages[], isTyping, sendMessage()              │
│ themeStore       │ theme: 'dark' | 'light', toggleTheme()           │
│ uiStore          │ sidebarCollapsed, toggleSidebar(), modals        │
│ notificationStore│ toasts[], addNotification(), removeNotification │
│ connectorConfig  │ connector configurations                        │
└──────────────────┴──────────────────────────────────────────────────┘
```

---

## Core Functionalities

### 1. Runtime Location

**Path:** `/runtime-location`
**File:** `src/pages/RuntimeLocationPage.tsx` (~2,570 lines)
**Question answered:** *"Where is my application running RIGHT NOW?"*

This is the flagship **SRE Command Center** — the first page users see after login. It has two modes:

#### 1A. Grid View (Application Fleet Overview)

Displays all monitored applications in a filterable grid with:

- **Stats Cards (top row):**
  - Total Applications count
  - Total Data Centers
  - Stale Sources count (sources with stale/very-stale freshness)
  - Drifts detected count

- **Application List Table:**
  Each row shows: Application Name, Environment, Tech Stacks, Data Centers, Confidence Score (with color-coded badge), Freshness status, Alignment status (ALIGNED/DRIFTED/UNKNOWN), Last Updated time.

- **Filters:**
  - Environment filter (PRODUCTION, UAT, DR)
  - Tech Stack filter (Oracle, MongoDB, IBM MQ, OpenShift, Kafka, etc.)
  - Data Center filter
  - Confidence level filter (HIGH, MEDIUM, LOW, CONFLICT)
  - Freshness filter (FRESH, STALE, VERY_STALE)
  - Status filter (ALIGNED, DRIFTED)
  - Free-text search

- **CSV/Excel Import Modal:**
  - Drag-and-drop file upload
  - Auto-detection of source type (AppDynamics, Oracle OEM, etc.)
  - Shows parsed record count, errors, and import status
  - Import history with timestamps

- **Bulk Ingestion:**
  - "Import All from docs/" button — triggers backend `import_all_docs` which parses all 8 telemetry Excel/CSV files and correlates them by App ID

- **Incident Mode:**
  - Toggleable panel that highlights apps with conflicts, stale sources, or drifts
  - Filters the grid to show only problematic applications
  - Shows severity-sorted alert list

- **Signal Coverage Panel:**
  - Shows which telemetry sources are configured per application
  - Visual indicator of coverage gaps (missing sources)

- **Import History:**
  - Chronological log of all data imports with status (SUCCESS/PARTIAL/FAILED)

#### 1B. Detail Cockpit (Application Deep-Dive)

When an application is selected (`?appId=xxx&env=PRODUCTION`), the view transforms into an animated cockpit:

- **Data Center Flow Visualization:**
  - Animated SVG diagram showing DC1 (active) and DC2 (standby)
  - Flow lines indicate traffic direction and replication status
  - Color-coded: green = active, amber = standby, red = conflict
  - Real-time pulsing animation on active data paths

- **Component Runtime Matrix:**
  - Table with columns: Component Name, Type (DATABASE/MESSAGING/COMPUTE/STORAGE), Tech Stack, DC1 Role, DC2 Role, Authoritative Site, Failover Type, Failover Risk
  - Each cell shows the replication role (PRIMARY, SECONDARY, PHYSICAL_STANDBY) or operational state (ACTIVE, STANDBY)
  - Confidence level per asset (1-4 scale)

- **AI Signals Panel ("Why is DC active?"):**
  - For each component, shows the evidence chain:
    - Which data source reported the state
    - What signal was used (e.g., `db_role=PRIMARY`, `rs_state=1`)
    - When it was last seen (freshness)
    - Whether it's deterministic or inferred
  - Explains the reasoning: "Oracle OEM reports PRIMARY on host ibb1h01.corp. Last seen: 5m ago. Deterministic signal."

- **What-If Failover Simulator:**
  - Interactive scenario simulator
  - Operator selects a failure scenario (e.g., "DC1 Full Failure")
  - System computes expected outcome per component:
    - Which components auto-recover (AUTOMATIC failover)
    - Which need manual promotion (MANUAL failover)
    - Which go offline (NONE failover)
  - Shows step-by-step simulation log
  - "Execute Failover" and "Failback" buttons (simulated)
  - Blockers list (reasons why failover might fail)

- **WebSocket Integration:**
  - Real-time drift detection alerts
  - State change notifications
  - Conflict detection warnings

---

### 2. Runtime Truth

**Path:** `/runtime-truth`
**File:** `src/pages/RuntimeTruthPage.tsx` (~1,090 lines)
**Question answered:** *"Can this application process transactions RIGHT NOW — and how much can I trust that answer?"*

The Runtime Truth page uses the **Runtime Truth Engine** (`src/lib/runtimeTruthEngine.ts`) to compute a definitive verdict for any application. It has **7 sub-tabs**:

#### Tab 1: Verdict

The main verdict panel showing:

- **Verdict Banner:** Large display of `canServeTransactions` (YES/NO) with risk level color (LOW=green, MEDIUM=amber, HIGH=orange, CRITICAL=red)
- **Authoritative Site:** Which DC owns write authority (e.g., "IBB1 — confirmed by Oracle Data Guard")
- **Confidence Gauge:** Circular gauge showing total confidence score (0-100)
- **Confidence Breakdown Radar:** 4-axis radar chart showing:
  - Freshness (0-25): How current are the data sources?
  - Determinism (0-25): Are signals from authoritative control planes?
  - Agreement (0-25): Do all sources agree on write authority?
  - Coverage (0-25): How many tech stacks have fresh, high-confidence sources?
- **Verdict Summary:** Plain-English explanation of the verdict
- **State Owner:** Which DC + which assets own the write authority
- **Traffic Owner:** Which DC is actively serving user traffic
- **DC2 Readiness:** Percentage readiness for failover (0-98%)
- **Risk Reason:** Explanation of why the risk level was assigned

#### Tab 2: Authority Matrix

A detailed table showing component-level authority:

- **Columns:** Component Name, Type, Technology, DC1 Role, DC2 Role, Authoritative Site, Can Failover, Failover Type, Failover Risk
- **Expandable rows:** Click to reveal evidence signals for each component:
  - Source name (e.g., "Oracle OEM")
  - Signal name (e.g., "replication_role")
  - Signal value (e.g., "PRIMARY")
  - Data center
  - Signal type (deterministic, inferred, stale, conflicting, missing)
  - Freshness (FRESH, STALE, MISSING)
  - Confidence level (1-4)
  - Timestamp
  - Detail explanation

- **Conflict indicators:** When sources disagree (e.g., Oracle says PRIMARY, SCOM says SECONDARY), shows a warning with both claims and last-checked time

#### Tab 3: Service Map

Interactive topology graph showing:

- **Nodes:** Each runtime asset as a node, color-coded by health (healthy=green, degraded=amber, critical=red, unknown=gray)
- **Node details:** Technology, DC, role, error rate, request rate, p95/p99 latency, write authority flag, deterministic flag, freshness
- **Edges (3 types):**
  - `dependency` — Compute → Database, Compute → Messaging (with request rate, latency, error rate)
  - `replication` — Primary → Standby/Secondary (replication edges within same tech stack)
  - `traffic` — Traffic flow edges
- **Edge metrics:** Average latency, p95, p99, error rate, protocol (JDBC, AMQP)
- Built with `@xyflow/react` (React Flow) for interactive pan/zoom

#### Tab 4: What-If Simulator

Failover scenario simulator with **4 pre-computed scenarios**:

1. **Current State:** Baseline assessment — is everything OK right now?
2. **DC1 Full Failure:** What happens if the primary DC goes completely offline?
   - Which components auto-recover (AUTOMATIC failover)
   - Which need manual promotion (MANUAL — DBA intervention needed)
   - Which go offline entirely (NONE — single point of failure)
   - Expected confidence after failover
   - Blockers list
3. **All Telemetry Stale:** What if all data sources become stale?
   - System falls back to CMDB topology
   - Confidence drops significantly
   - Warning: "DO NOT take operational actions based on stale signals"
4. **Traffic Only Failover:** Traffic moves to DC2 but state stays in DC1
   - Cross-DC write latency degradation (80-200ms)
   - Data loss risk during network partition
   - Critical risk for PRIMARY-owned components

Each scenario shows:
- Outcome (SAFE, DEGRADED, FAILED, PARTIAL)
- Per-component impact (DC1 state, DC2 state, risk level)
- Expected confidence score
- Blockers and warnings
- Notes with operational guidance

#### Tab 5: Timeline

Chronological event feed showing:

- **Event types:**
  - `CONFLICT_DETECTED` — Sources disagree (CRITICAL)
  - `TELEMETRY_STALE` — Data source became stale (WARNING/CRITICAL)
  - `LEADER_ELECTION` — Replication role change (e.g., PRIMARY → SECONDARY)
  - `STATE_CHANGE` — Operational state change or telemetry refresh (INFO)
  - `TRAFFIC_SHIFT` — Traffic moved between DCs
  - `DB_FAILOVER` — Database failover event
  - `RECOVERY` — System recovered
  - `PARTIAL_FAILOVER` — Partial failover occurred

- **Each event shows:** Timestamp, relative time ("5m ago"), type icon, title, detail, DC, impact level, authority change (from → to)
- Sorted by timestamp descending, limited to 20 events
- Generated from actual snapshots, drifts, conflicts, and data source status

#### Tab 6: Discovery

Data source signal marketplace showing:

- **Discovered Signals:** For each technology in the application, shows:
  - Technology (Oracle, MongoDB, IBM MQ, etc.)
  - Display name (e.g., "Oracle Data Guard")
  - Signal name (e.g., "DB_ROLE (PRIMARY/STANDBY)")
  - API source (e.g., "Oracle OEM REST API /targets")
  - Confidence level (1-4)
  - Deterministic flag (true/false)
  - Category: STATE_OWNERSHIP, TRAFFIC_FLOW, REPLICATION, HEALTH
  - Description of what the signal proves
  - Shared flag (can this signal be used across multiple apps?)
  - Sample value

- **Extra signals** always shown:
  - AppDynamics APM (TRAFFIC_FLOW — per-node call rates)
  - AVI / GSLB (TRAFFIC_FLOW — virtual service routing)
  - NetApp SnapMirror (STATE_OWNERSHIP — volume write ownership)

#### Tab 7: DNA Graph

Visual representation of the **authority chain** — how write authority flows from the application down through components to individual assets. Shows the hierarchical dependency of which asset's signal determines the authoritative site.

---

### 3. LOB View

**Path:** `/lob-view`
**File:** `src/pages/LOBViewPage.tsx` (~1,480 lines)
**Question answered:** *"How is my Line of Business structured, and what's the health of each application?"*

The LOB (Line of Business) View provides a hierarchical view of the enterprise organized by business units.

#### Hierarchy Tree (Left Panel)

Expandable tree showing the organizational hierarchy:

```
Retail Banking
├── Payments
│   ├── PCA (Payment Core Application)
│   ├── PB3 (Payment Batch 3)
│   └── PA3 (Payment App 3)
├── Lending
│   ├── Loan Origination
│   └── Credit Assessment
Corporate Banking
├── Treasury
├── Trade Finance
└── Cash Management
Investment Banking
├── Portfolio Management
└── Risk Analytics
```

Each node shows:
- Name and description
- Health status indicator (healthy/degraded/critical)
- Application count
- Expandable/collapsible with animation

#### 7 Detail Tabs (Right Panel)

When a LOB node is selected, the right panel shows 7 tabs:

**Tab 1: Architecture View**
- Flow diagram showing the application architecture:
  - Channels (Web, Mobile, API, Batch) → Gateway (Load Balancer, API Gateway) → Services (Application servers) → Data Layer (Databases, Message Queues) → External (Partners, APIs)
- Animated flow lines showing traffic direction
- Health indicators on each node

**Tab 2: Components**
- Table of all components across the LOB's applications
- Columns: Component Name, Type, Technology, DC, Role, Status, Confidence

**Tab 3: Data Sources**
- List of telemetry sources feeding this LOB
- Freshness status, record count, last import, topology/traffic confidence

**Tab 4: Runtime Signals**
- Real-time signal feed from all telemetry sources
- Shows signal name, value, source, timestamp, confidence

**Tab 5: Topology**
- Visual topology map of all applications in the LOB
- Shows inter-application dependencies
- DC distribution

**Tab 6: Events**
- Chronological event log for this LOB
- State changes, drifts, conflicts, imports

**Tab 7: Drift Analysis**
- Shows intent vs actual configuration
- Lists all drift violations with severity
- Intent definition (intended active DCs, primary DC, failover type)
- Actual state (current DCs, roles, states)
- Drift type: MISSING_DC, WRONG_PRIMARY, MISSING_COMPONENT, EXTRA_DC, ROLE_MISMATCH, STALE_DATA

---

### 4. Neighbourhood View

**Path:** `/neighbourhood-view`
**File:** `src/pages/NeighbourhoodViewPage.tsx` (~1,150 lines)
**Question answered:** *"What does my infrastructure landscape look like, and how are data centers connected?"*

The Neighbourhood View provides a geographic/infrastructure map perspective.

#### World Map Visualization

- **SVG-based world map** with 12 neighbourhoods plotted by coordinates
- Each neighbourhood represents a data center or infrastructure zone
- **Two display modes:**
  - **Health Mode:** Nodes colored by health (green/amber/red)
  - **Traffic Mode:** Nodes colored by traffic volume (blue gradient)
- **Connection lines:** Animated lines between connected DCs showing:
  - Replication paths (dashed)
  - Traffic flow (solid with animation)
  - Health of connection (green/amber/red)
- **Interactive nodes:** Click to open detail panel

#### KPI Cards (Top)

- Total Neighbourhoods
- Healthy / Degraded / Critical counts
- Total Applications across all neighbourhoods
- Total Connections
- Average Health Score

#### Insights Panel

- **Top Talkers:** Ranked list of neighbourhoods by traffic volume
- **Health Distribution:** Donut chart showing healthy vs degraded vs critical
- **Risk Alerts:** List of active risks (stale sources, conflicts, drifts)
- **Active Incidents:** Current incidents with severity

#### Detail Panel (Slide-out)

When a neighbourhood is selected, a detail panel opens with 5 tabs:

**Tab 1: Overview**
- Neighbourhood name, region, zone
- Health score, traffic volume
- Asset count, application count
- Connection list (to other neighbourhoods)

**Tab 2: Applications**
- List of all applications running in this neighbourhood
- Per-app: name, environment, confidence, status

**Tab 3: Components**
- All components across all apps in this neighbourhood
- Role, tech stack, state, confidence

**Tab 4: Data Sources**
- Telemetry sources for this neighbourhood
- Freshness, record count, confidence levels

**Tab 5: Signals**
- Real-time signal feed specific to this neighbourhood

---

### 5. Application Location Detail

**Path:** `/runtime-location/:appId`
**File:** `src/pages/ApplicationLocationDetailPage.tsx` (~1,730 lines)

The deepest single-application view with **11 tabs**:

#### Operator Quick Summary Band

Top banner with:
- Application name and environment
- "2AM Ready" trust banner — confirms the operator can trust the data
- Expandable assertion justifications (click to see why each claim is made)
- Overall confidence score
- Authoritative site
- Can serve transactions (YES/NO)

#### Tab 1: DC Distribution
- USA map showing DC locations
- Failover simulation (same as Runtime Location cockpit)
- Active/standby visualization
- Traffic flow arrows

#### Tab 2: Topology Hierarchy
- Tree view: Application → Components → Assets
- Expandable nodes showing the full hierarchy
- Each asset shows: DC, role, state, confidence, freshness

#### Tab 3: Dependency Graph
- Interactive graph (React Flow) showing component dependencies
- Nodes: databases, message queues, compute nodes
- Edges: dependency, replication, traffic
- Pan/zoom/expand capabilities

#### Tab 4: Components
- Full component table with all assets
- Per-asset: name, type, tech stack, DC, host, role, state, write authority, confidence, freshness, deterministic flag, data source, last seen

#### Tab 5: OpenShift Console
- Pod-level view for OpenShift/Kubernetes assets
- Shows pod name, phase (Running/Pending), node, restarts, age
- Mock log viewer per pod
- Container status

#### Tab 6: Intent vs Actual
- Side-by-side comparison:
  - **Intent:** Defined active DCs, primary DC, failover type, required tech stacks, replication model
  - **Actual:** Current DCs, roles, states, tech stacks present
- Drift violations listed with severity
- Alignment status (ALIGNED / DRIFTED / UNKNOWN)

#### Tab 7: Data Quality
- Data source health panel
- Freshness timeline (when was each source last refreshed)
- Topology confidence vs traffic confidence per source
- Record counts
- Missing source detection

#### Tab 8: Snapshots
- Historical timeline chart (Recharts)
- X-axis: time, Y-axis: confidence level
- Shows how confidence changed over time
- Snapshot points with state/role at each point
- Click a snapshot to see full detail

#### Tab 9: Compare Environments
- Side-by-side table comparing PROD vs UAT vs DR:
  - Per-asset: role in each environment, DC, confidence
  - Status: consistent, inconsistent, prod_only, uat_only, dr_only
- Highlights discrepancies between environments

#### Tab 10: Audit Log
- Chronological audit trail for this application
- Event types: IMPORT, STATE_CHANGE, CONFLICT_DETECTED, INTENT_CREATED, INTENT_UPDATED, DRIFT_DETECTED, PROPOSAL_SUBMITTED, SEED_LOADED
- Shows: event type, description, actor, source, before/after values, timestamp

#### Tab 11: Runtime Truth
- Embedded Runtime Truth verdict (same as the Runtime Truth page)
- Verdict banner, confidence breakdown, component authority, scenarios

---

### 6. Audit Logs

**Path:** `/audit`
**File:** `src/pages/AuditPage.tsx`

System-wide audit trail with:

- **Summary Cards:** Total events, conflicts, drifts, imports, failover simulations
- **Event Categories:** IMPORT, FAILOVER_SIM, SECURITY, DRIFT, ROUTING_SHIFT, STATE_CHANGE, CONFLICT_DETECTED
- **Severity Filtering:** Filter by severity level
- **Audit Table:** Event type, application, asset, description, actor, source, before/after values, timestamp
- **Search:** Full-text search across audit entries

---

### 7. Users & RBAC

**Path:** `/users`
**File:** `src/pages/UsersPage.tsx`

User directory and role-based access control:

- **User Table:** Name, email, role, DC access bounds, status, last active
- **Roles (7 types):**
  - `super_admin` — Full system access
  - `admin` — System administration
  - `sre_dba` — SRE & Database admin
  - `dev_ops` — DevOps engineer
  - `security` — Security team
  - `infra_lead` — Infrastructure lead
  - `viewer` — Read-only access
- **DC Access Bounds:** Which data centers each user can access
- **Permissions Display:** Shows what actions each role can perform
- **Admin-only:** Only `super_admin` and `admin` roles can access this page

---

### 8. AI Chat Assistant

**Component:** `src/components/chat/ChatWidget.tsx`
**Global:** Available on all pages as a floating widget

- **Floating button** in bottom-right corner
- **Expandable chat window** with:
  - Message history (user + assistant bubbles)
  - Typing indicator (animated dots)
  - Input box with send button
  - Context-aware responses based on current page
- **Chat service** (`src/services/chatService.ts`) processes messages and returns contextual answers about runtime state, confidence, drifts, etc.
- **Zustand store** (`chatStore.ts`) manages message state

---

## Confidence Engine

The confidence engine is the heart of HealthMesh AI. It lives in `src/lib/runtimeTruthEngine.ts` and computes a **transparent, explainable confidence score** (0-100) for every application verdict.

### Scoring Model (4 Dimensions, 25 points each)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE SCORE (0-100)                         │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                          │
│  │   FRESHNESS      │  │  DETERMINISM    │                          │
│  │   (0-25)         │  │  (0-25)         │                          │
│  │                  │  │                 │                          │
│  │  How current     │  │  Are signals    │                          │
│  │  are the data    │  │  from authori-  │                          │
│  │  sources?        │  │  tative control │                          │
│  │                  │  │  planes?        │                          │
│  │                  │  │                 │                          │
│  │  FRESH = full    │  │  Deterministic  │                          │
│  │  STALE = partial │  │  assets / total │                          │
│  │  VERY_STALE = 0  │  │  assets × 25    │                          │
│  │                  │  │                 │                          │
│  │  Penalty: -8    │  │  Penalty: -8    │                          │
│  │  if conflicts    │  │  if conflicts    │                          │
│  └─────────────────┘  └─────────────────┘                          │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                          │
│  │   AGREEMENT     │  │   COVERAGE      │                          │
│  │   (0-25)        │  │   (0-25)        │                          │
│  │                 │  │                 │                          │
│  │  Do all sources │  │  How many tech  │                          │
│  │  agree on write │  │  stacks have    │                          │
│  │  authority?     │  │  fresh, high-   │                          │
│  │                 │  │  confidence     │                          │
│  │  No conflicts   │  │  sources?       │                          │
│  │  = 23/25         │  │                 │                          │
│  │  Drifts = 17/25 │  │  Sources with   │                          │
│  │  Conflicts =    │  │  topology_conf  │                          │
│  │  max(5-n×5,0)   │  │  ≥3 / techs ×22 │                          │
│  │                 │  │  + 3 if no stale│                          │
│  └─────────────────┘  └─────────────────┘                          │
│                                                                      │
│  TOTAL = min(freshness + determinism + agreement + coverage, 100)  │
└──────────────────────────────────────────────────────────────────────┘
```

### Verdict Computation Flow

```
Input:
  ApplicationLocationDetail (components, assets, data_sources, conflicts)
  IntentDrift[] (drift violations vs defined intent)
  RuntimeSnapshot[] (historical state changes)

         │
         ▼
  ┌──────────────────────────────────────────────────┐
  │  1. Compute Confidence Breakdown                 │
  │     ├── Freshness score (0-25)                   │
  │     ├── Determinism score (0-25)                 │
  │     ├── Agreement score (0-25)                   │
  │     └── Coverage score (0-25)                    │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────┐
  │  2. Determine Authoritative Site                 │
  │     ├── Find assets with write_authority=true   │
  │     ├── Check for conflicts (sources disagree)  │
  │     ├── Check for very-stale sources            │
  │     └── Result: DC name, CONFLICT, or UNKNOWN    │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────┐
  │  3. Build Component Authority (per component)    │
  │     ├── DC1 role, DC2 role                       │
  │     ├── Authoritative site                       │
  │     ├── Failover type (AUTOMATIC/MANUAL/NONE)    │
  │     ├── Failover risk                            │
  │     └── Evidence signals (source, value, fresh)  │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────┐
  │  4. Generate What-If Scenarios (4 scenarios)    │
  │     ├── Current State                            │
  │     ├── DC1 Full Failure                         │
  │     ├── All Telemetry Stale                      │
  │     └── Traffic Only Failover                    │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────┐
  │  5. Compute Risk Level                           │
  │     ├── CRITICAL: conflicts or can't serve      │
  │     ├── HIGH: confidence < 40                   │
  │     ├── MEDIUM: confidence < 65                 │
  │     └── LOW: confidence ≥ 65, no issues          │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────┐
  │  6. Build Verdict Summary (plain English)        │
  │     "IBB1 is the authoritative runtime site.     │
  │      Write authority confirmed on: oracle-01.   │
  │      IBB2 is ready for failover (87% readiness).│
  │      Safe to process customer transactions."    │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  Output: RuntimeVerdict
    ├── canServeTransactions: boolean
    ├── confidence: number (0-100)
    ├── confidenceBreakdown: { freshness, determinism, agreement, coverage }
    ├── risk: LOW | MEDIUM | HIGH | CRITICAL
    ├── authoritativeSite: string
    ├── stateOwner, trafficOwner: string
    ├── dc2CanTakeOver: boolean
    ├── dc2ReadinessPercent: number
    ├── components: ComponentAuthority[]
    ├── signals: AuthoritySignal[]
    └── scenarios: ScenarioResult[]
```

### Signal Types

Every signal is classified into one of 5 types:

| Type | Description | Example |
|------|-------------|---------|
| `deterministic` | From authoritative control plane, fresh | Oracle OEM: `db_role=PRIMARY` |
| `inferred` | Not from a deterministic source | CMDB: `vm_status=ACTIVE` |
| `stale` | Was deterministic but data is old | Oracle OEM data >2 hours old |
| `conflicting` | Sources disagree on this asset | Oracle says PRIMARY, SCOM says SECONDARY |
| `missing` | No signal available | No telemetry from this source |

---

## Data Sources & Telemetry Correlation

### Supported Telemetry Sources

| Source | File | Signal | Category | Deterministic | Confidence |
|--------|------|--------|----------|---------------|------------|
| **AppDynamics** | `AppDynamics_Node_Inventory.xlsx` | Call rate per node | TRAFFIC_FLOW | Yes | 4/4 |
| **AppDynamics Traffic** | `AppDynamics_Traffic_Raw_sample_consolidated.xlsx` | Traffic flow between nodes | TRAFFIC_FLOW | Yes | 4/4 |
| **SPLOC** | `SPLOC_App_Traffic_Sample.xlsx` | Application traffic | TRAFFIC_FLOW | Yes | 3/4 |
| **GSLB / AVI** | `gslb_report_virtual_services.xlsx` | Virtual service routing | TRAFFIC_FLOW | Yes | 4/4 |
| **Oracle OEM** | `oem_db_role_data.xlsx` | DB_ROLE (PRIMARY/STANDBY) | STATE_OWNERSHIP | Yes | 4/4 |
| **IBM MQ** | `ibmmq_qmgr_command_server_status.xlsx` | QMGR_STATUS | STATE_OWNERSHIP | Yes | 3/4 |
| **MongoDB** | `mongodb_info.xlsx` | RS_STATE (1=PRIMARY) | REPLICATION | Yes | 3/4 |
| **OpenShift** | `ocp_pod_info.xlsx` | POD_PHASE (Running/Pending) | HEALTH | Yes | 3/4 |
| **SCOM** | `SCOM_Prod_ReplicaStatus.csv` | Replica sync state | REPLICATION | No | 3/4 |
| **Batch Jobs** | `PA3/PB3/PC3/PG3_jobs_*.csv` | Job execution status | HEALTH | Yes | 3/4 |
| **Pool Members** | `pool member-2.json` | Pool member status | TRAFFIC_FLOW | Yes | 4/4 |
| **Virtual Services** | `virtual service.json` | VS routing config | TRAFFIC_FLOW | Yes | 4/4 |

### Correlation Logic

```
Step 1: Extract App ID
   ├── Direct match (column contains exact app name)
   ├── Regex extraction (pattern match in cell values)
   └── Delimited extraction (split by separators)

Step 2: Build Components
   ├── Group assets by component_type (DATABASE, MESSAGING, COMPUTE, STORAGE)
   ├── Group assets by tech_stack (oracle, mongodb, ibm_mq, ocp, etc.)
   └── Assign to application by App ID

Step 3: Determine Runtime State
   ├── For each asset, find latest signal from its data source
   ├── Map signal to operational_state (ACTIVE/STANDBY/UNKNOWN)
   ├── Map signal to replication_role (PRIMARY/SECONDARY/PHYSICAL_STANDBY)
   ├── Set write_authority flag (true if PRIMARY or ACTIVE with write capability)
   ├── Set is_deterministic flag (true if source is authoritative control plane)
   └── Compute confidence_level (1-4 based on source trust)

Step 4: Detect Conflicts
   ├── For each asset, compare signals from different sources
   ├── If source A says PRIMARY and source B says SECONDARY → conflict
   └── Record conflict with both claims and last-checked timestamp

Step 5: Detect Drifts
   ├── Compare actual state vs defined intent
   ├── MISSING_DC: intent says DC should be active but no assets found
   ├── WRONG_PRIMARY: intent says DC1 is primary but DC2 is primary
   ├── MISSING_COMPONENT: intent requires a component that's not present
   ├── EXTRA_DC: assets found in DC not in intent
   ├── ROLE_MISMATCH: asset role doesn't match intended role
   └── STALE_DATA: data source is stale beyond SLA threshold
```

### Freshness Thresholds

| Age | Status | Indicator |
|-----|--------|-----------|
| < 30 minutes | FRESH | Green |
| 30-120 minutes | STALE | Amber |
| > 120 minutes | VERY_STALE | Red |
| No timestamp | UNKNOWN | Gray |

---

## Project Structure

```
healthmesh-ai/
├── docs/                           # Telemetry source files (xlsx, csv, json)
│   ├── AppDynamics_Node_Inventory.xlsx
│   ├── AppDynamics_Traffic_Raw_sample_consolidated.xlsx
│   ├── gslb_report_virtual_services.xlsx
│   ├── ibmmq_qmgr_command_server_status.xlsx
│   ├── mongodb_info.xlsx
│   ├── ocp_pod_info.xlsx
│   ├── oem_db_role_data.xlsx
│   ├── SPLOC_App_Traffic_Sample.xlsx
│   ├── SCOM_Prod_ReplicaStatus.csv
│   ├── PA3/PB3/PC3/PG3_jobs_*.csv
│   ├── pool member-2.json
│   ├── virtual service.json
│   └── sample_response.json
│
├── src/                             # Frontend (React + TypeScript)
│   ├── App.tsx                      # Router + auth guard
│   ├── main.tsx                     # Entry point
│   ├── pages/                       # 9 page components
│   ├── components/
│   │   ├── layout/                  # AppLayout, Header, Sidebar
│   │   ├── runtime/                 # 20 runtime components + 3 widgets
│   │   ├── chat/                    # 5 chat components
│   │   └── ui/                      # 15 reusable UI components
│   ├── store/                       # 8 Zustand stores
│   ├── lib/                         # 10 utility/engine files
│   ├── hooks/                       # 2 custom hooks
│   ├── services/                    # Chat service
│   └── types/                       # 13 type definition files
│
├── backend/                         # Backend (FastAPI + Python)
│   ├── app/
│   │   ├── main.py                  # FastAPI app + lifespan
│   │   ├── core/                    # Config, security, middleware, WS manager
│   │   ├── db/                      # SQLAlchemy base, seed
│   │   ├── models/                  # 25+ ORM models
│   │   ├── schemas/                 # Pydantic schemas
│   │   ├── services/                # 5 service modules
│   │   └── api/v1/endpoints/        # 4 endpoint modules
│   ├── healthmesh.db                # SQLite database
│   ├── run.py                       # Uvicorn launcher
│   └── requirements.txt
│
├── package.json                     # Node dependencies
├── vite.config.ts                   # Vite configuration
├── tsconfig.json                    # TypeScript config
├── tailwind.config.js               # Tailwind CSS config
├── postcss.config.js                # PostCSS config
├── index.html                       # HTML entry point
├── .env                             # Environment variables
└── .gitignore
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+

### Frontend

```bash
npm install
npm run dev      # Development server (Vite)
npm run build    # Production build (tsc + vite build)
npm run preview  # Preview production build
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py    # Starts Uvicorn on port 8000
```

The backend auto-imports telemetry data from `docs/` on first startup when the database is empty.

### Default Credentials

The backend seeds initial users on startup. Use the login page with demo accounts (role selector on the login screen provides quick access).

### Environment Variables

Key variables (pre-configured in `.env`):
- Backend API URL
- WebSocket URL
- JWT secret
- Database path

---

## Summary

HealthMesh AI is a comprehensive enterprise runtime visibility platform that:

1. **Correlates** 8+ heterogeneous telemetry sources by App ID into a unified topology
2. **Determines** which data center is active, owns writes, and handles traffic — with evidence
3. **Scores** confidence transparently across 4 dimensions (freshness, determinism, agreement, coverage)
4. **Detects** conflicts when sources disagree and drifts when actual state diverges from intent
5. **Simulates** failover scenarios to help operators plan for disasters
6. **Provides** a 2 AM-ready operator experience with plain-English verdicts and expandable evidence
7. **Visualizes** runtime topology, dependencies, and infrastructure neighbourhoods
8. **Organizes** applications by Line of Business with architectural flow diagrams
9. **Tracks** all system events with a comprehensive audit trail
10. **Secures** access with JWT authentication and role-based access control (7 roles)
