# HealthMesh: Application Runtime Location Visibility — Final Hackathon Plan

---

## EXECUTIVE SUMMARY

**Problem:** Enterprises cannot reliably determine where an application is *actually* running, which data center owns authoritative state, and whether that matches design intent.

**Our answer:** A single operational surface that correlates multi-source signals into a clear, confidence-scored runtime location view — with explicit drift detection, blast radius simulation, and full source evidence.

**Winning edge:** The solution answers three questions judges will ask:
1. **Where is this app?** — Data center map with primary write owner
2. **How sure are you?** — Confidence + freshness scoring per source
3. **Is it right?** — Intent vs Actual drift with severity classification

---

## JUDGE SCORING ESTIMATE

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Problem Fit | 10/10 | Directly addresses every stated requirement |
| Technical Depth | 8/10 | Backend services, scoring engine, drift detection, LLM agents |
| Data Coverage | 9/10 | 8+ source types, confidence matrix, WIP gaps surfaced |
| UX Quality | 7/10 (→ 9/10 with improvements below) | Functional but needs visual wow factor |
| Demo Readiness | 9/10 | Walkthrough overlay, incident mode, rich mock data |
| Innovation | 8/10 | Blast radius, intent definition, collaborative discovery |
| **Overall** | **~8.2/10** | **Strong submission. Apply UI upgrades to win.** |

---

## CURRENT STATE ANALYSIS

### What Is Fully Implemented ✅

| Feature | Quality | Location |
|---------|---------|----------|
| Runtime location list page | Excellent | RuntimeLocationPage.tsx |
| Application detail drilldown | Excellent | ApplicationLocationDetailPage.tsx |
| Data center card visualization | Excellent | DataCenterCard.tsx + LocationMap.tsx |
| Confidence badge (1-4 levels) | Excellent | ConfidenceBadge.tsx |
| Freshness indicator (FRESH/STALE/VERY_STALE) | Excellent | FreshnessIndicator.tsx |
| Intent vs Actual drift detection | Very Good | IntentVsActualTab.tsx + drift_service.py |
| Intent definition panel | Good | IntentDefinitionPanel.tsx |
| Conflict detection & resolution | Good | ConflictAlert.tsx |
| Blast radius / incident mode | Excellent | IncidentModePanel.tsx + blast_radius_service.py |
| Data discovery + proposal workflow | Very Good | DataDiscoveryPanel.tsx |
| Audit trail | Excellent | AuditLogTab.tsx |
| Demo walkthrough overlay (11 steps) | Excellent | DemoWalkthroughOverlay.tsx |
| Asset status badges (PRIMARY/SECONDARY/STANDBY) | Excellent | AssetStatusBadge.tsx |
| Tech stack icons (11 stacks) | Good | TechStackIcon.tsx |
| Confidence scoring engine | Excellent | confidence_service.py |
| Drift detection service | Excellent | drift_service.py |
| Blast radius service | Excellent | blast_radius_service.py |
| LLM runtime agent | Good | runtime_agent.py |
| Mock data (5 DCs, 4 apps, multi-stack) | Excellent | runtimeLocationMock.ts |
| Full TypeScript types | Excellent | types/runtime.ts |
| Zustand runtime store | Excellent | runtimeLocationStore.ts |
| WebSocket drift alerts | Good | wsStore.ts + drift_service.py |
| CSV import modal | Good | RuntimeLocationPage.tsx |
| Time simulation slider (data aging) | Excellent | RuntimeLocationPage.tsx |
| Splunk traffic connector | Good | splunk-traffic-service/main.py |
| AppDynamics connector | Good | appdynamics-service/main.py |
| Application health metrics page | Partial | ApplicationRuntimeMetricsPage.tsx |

---

### What Is Missing or Incomplete ⚠️

| Gap | Severity | Impact on Judges | Effort to Fix |
|-----|----------|-----------------|---------------|
| **Visual dependency graph** (node-link) | HIGH | Judges want to see "app → MQ → DB → OCP" | High |
| **Interactive geographic DC map** | HIGH | "Where" means nothing without geography | Medium |
| **CSV parser for all 11 source formats** | MEDIUM | Import feels hollow without real parsing | High |
| **Backend API persistence** (in-memory only) | MEDIUM | Refresh loses all state | Medium |
| **Compare Environments tab** (UI scaffolded) | MEDIUM | Tab exists but renders no content | Low |
| **Confidence filter on list** | LOW | Search exists, confidence filter missing | Low |
| **Mobile responsive detail tabs** | LOW | Tabs overflow on small screens | Low |
| **Animated traffic flow lines** | LOW | Pure wow-factor visual | Medium |
| **Health hierarchy cross-link** (bi-directional) | LOW | LOB → Project → App runtime path | Medium |
| **Real-time live update feed** | LOW | WebSocket hooked but not surfaced in UI | Low |

---

### Data Signals Available vs Used

| Tech Stack | Topology Confidence | Traffic Confidence | Sample Available | Currently Used |
|------------|--------------------|--------------------|-----------------|----------------|
| Compute - VM | 4 (standardized) | 3 (not standardized) | CMDB / SPLOC | ✅ Partial |
| Compute - OCP | 3 | 4 (standardized) | OCP_pod_info.csv | ✅ Model exists |
| Database - MongoDB | 3 | 3 | mongodb_info.csv | ✅ Agent + model |
| Database - Oracle | 3 | 2 (proprietary) | oem_db_role.csv | ✅ Connector |
| Database - MS SQL | 3 | 3 | SCOM_Prod_ReplicaStatus.csv | ✅ Agent |
| Messaging - Kafka | 3 | 3 | ibmmq_qmgr_status.csv | ✅ Partial |
| Messaging - IBM MQ | 3 | 3 | ibmmq_qmgr_status.csv | ✅ Full agent |
| Storage - Object | 3 | 2 (proprietary) | None | ❌ Gap surfaced |
| Storage - File | 3 | 2 (proprietary) | None | ❌ Gap surfaced |
| Batch - AutoSys | 2 (proprietary) | 2 (proprietary) | Batch.csv | ⚠️ Partial |
| Network - AVI LB | 3 | 2 (proprietary) | load_balancer_report.csv | ✅ Connector |

---

## WINNING PLAN — FINAL VERSION

### Strategy

The current solution is **functionally complete at 8/10**. To win, two things must happen:
1. **Close the visual gaps** — geographic map, dependency graph, animated flows
2. **Sharpen the narrative** — make the demo story unmissable and the data confidence model explicit

The original plan phases 0–22 are well-structured. This final plan refines priorities, fills gaps, and adds the missing UI magic.

---

## PHASE 0: LOCK THE DEMO NARRATIVE *(Already Done — Validate)*

**Status: Complete**

The 11-step DemoWalkthroughOverlay.tsx covers the core judge story. Validate it covers:
1. Start on app list → immediately see confidence + primary DC per app ✅
2. Click app → see where it's running, which DC owns writes ✅
3. Show component hierarchy (MQ → IBM MQ in IBB1, DB → Oracle PRIMARY in IBB1) ✅
4. Open Intent vs Actual → highlight drift (MISSING_DC severity HIGH) ✅
5. Show evidence: "This is the Oracle OEM file. This row. This field." ✅
6. Show confidence decay: "CMDB is 4h old → LOW confidence on topology" ✅
7. Open Incident Mode: "If IBB1 fails, PAYROLL has no failover → CRITICAL" ✅
8. Show Audit Log: "This state was detected at 09:14. Source imported at 09:00." ✅
9. Open Data Discovery: "We found a new source — AVI LB pool JSON — sharing to chat" ✅
10. Close: "This system doesn't just find apps — it verifies them against intent." ✅

**Action:** Re-read DemoWalkthroughOverlay.tsx step text and ensure all 10 story beats are covered.

---

## PHASE 1: GEOGRAPHIC DATA CENTER MAP *(CRITICAL — Missing)*

**Why it matters:** When judges ask "where is it running?" they expect geography. Text cards saying "IBB1" mean nothing without context.

**What to build:**
- Replace or augment the text-based DC card row with an SVG-based US geography map
- Each data center is a glowing dot (position hardcoded by DC shortname to approximate region)
- Active DCs for the selected application pulse green
- Primary write DC has a crown/star indicator and larger dot
- Standby DCs are dimmer, amber
- Hover shows: DC name, asset count, tech stack chips, write authority indicator
- Lines animate between primary and secondary for replication direction

**Data center coordinates (approximate US map):**
```
IBB1 → Denver area (central)
SHV  → Dallas area (south-central)
GA-UAT → Atlanta area (southeast)
MA-UAT → Boston area (northeast)
AZ3  → Phoenix area (southwest)
```

**Implementation approach:**
- Use `<svg viewBox="0 0 1000 600">` with a simplified US outline path
- Place `<circle>` elements for DCs, styled with Tailwind classes
- Animate with framer-motion `animate={{ scale: [1, 1.3, 1] }}` for pulse
- Add connecting `<line>` or `<path>` elements for replication arrows (dashed for async, solid for sync)

**Files to modify:**
- `src/components/runtime/LocationMap.tsx` → add SVGMap mode
- `src/pages/ApplicationLocationDetailPage.tsx` → switch to map mode in DC Distribution tab

---

## PHASE 2: VISUAL DEPENDENCY GRAPH *(HIGH — Missing)*

**Why it matters:** The problem statement explicitly asks about "protocol constraints, data consistency models, active/passive patterns." A graph showing `App → MongoDB(PRIMARY/SECONDARY) → IBM_MQ → OCP` makes this tangible.

**What to build:**
- React Flow (`@xyflow/react` already installed) node-link graph
- Central app node with color based on confidence
- Downstream component nodes (DB, MQ, compute, network) per DC
- Edge labels: replication role, sync type (sync/async)
- Color edges: green=healthy, amber=stale, red=conflict
- Click a node → show source evidence panel in sidebar
- Horizontal layout: App center → left DC (IBB1) / right DC (SHV) branch structure

**Node types:**
```
AppNode (center, blue border, app name + confidence badge)
├── DCNode (gray, DC name + environment)
│   ├── AssetNode (color by role: primary=green, secondary=amber)
│       └── source evidence tooltip on hover
```

**Why @xyflow/react (already installed):**
- Dagre layout library already in package.json
- `TopologyCanvas.tsx` already demonstrates usage pattern
- Can reuse existing `ProjectNode`, `AssetNode`, `ConnectorNode` node types

**Files to modify:**
- Create `src/components/runtime/RuntimeDependencyGraph.tsx` (new)
- `src/pages/ApplicationLocationDetailPage.tsx` → add "Dependency Graph" tab

---

## PHASE 3: UI DESIGN OVERHAUL *(HIGH — Visual Transformation)*

**Current assessment:** The UI is functional and professional but lacks visual personality and "eye feast" quality.

### 3.1 Color System Enhancement

**Add to tailwind.config.js:**
```
dc-primary: neon green (#00E599) — active/live DC indicator
dc-standby: amber (#F59E0B) — standby/secondary
dc-critical: red (#EF4444) — conflict/offline
confidence-high: green (#22C55E) — strong confidence
confidence-medium: amber (#F59E0B) — partial confidence
confidence-low: red (#EF4444) — weak confidence
confidence-unknown: gray (#6B7280) — no data
```

### 3.2 Application Card Redesign

**Current:** Simple card with name, status badge, DC list

**Target:** Full-width card with:
- Left: Color bar indicating confidence (green/amber/red strip)
- App name + ID in bold, environment pill
- Center: Mini horizontal bar: DC1 ████ DC2 ██ (asset distribution)
- Right: Confidence score (large, colored), primary DC name, freshness dot
- Bottom row: Tech stack icons + stale signal count
- Hover: Card lifts with shadow, confidence glow effect

### 3.3 Data Center Card Redesign

**Current:** Flat card with asset list

**Target:**
- Frosted glass effect (`backdrop-blur-sm bg-white/5`)
- Neon left border when this is the PRIMARY write DC
- Pulsing green indicator for "live traffic"
- Mini bar chart showing tech stack distribution
- "Write authority" crown badge on primary
- Animated replication arrows between adjacent DC cards

### 3.4 Page-Level Visual Improvements

**Runtime Location Page (list):**
- Hero stat row with animated counters: "12 Applications | 5 Data Centers | 3 Stale Sources | 2 Drifted"
- Color-coded stat cards (green/amber/red based on state)
- Kanban-style columns option: group apps by environment
- Confidence heatmap option: visual grid where each cell = one app, color = confidence

**Application Detail Page:**
- Full-bleed header with gradient background (dark blue → dark gray)
- Summary band as a prominent "cockpit strip" with large metric values
- Tab bar with colored indicators (drift tab shows red badge count)
- Graph sections with subtle grid/axis styling (not plain white)

### 3.5 Micro-interactions

```
App card hover:      translateY(-2px), shadow-lg, 200ms ease
Tab switch:          slide content left/right (framer-motion AnimatePresence)
Confidence badge:    pulse once on mount if UNKNOWN/LOW
DC card expand:      height animation, spring physics
Drift badge:         shake animation for CRITICAL severity
Import success:      confetti-style particle burst (subtle)
Freshness STALE:     slow breathing red glow on indicator
```

---

## PHASE 4: COMPLETE ENVIRONMENTS COMPARISON TAB *(Medium — Easy Win)*

**Status:** Tab exists, data model exists (`EnvComparisonRow` type), mock data exists. Just needs rendering.

**What to build:** Simple table showing PROD vs UAT vs DR for each component:

```
Component    | PROD (IBB1)      | UAT (GA-UAT)     | Difference
Oracle DB    | PRIMARY (IBB1)   | PRIMARY (GA-UAT)  | ✅ Same role
IBM MQ       | 3 queues (IBB1)  | 2 queues (MA-UAT) | ⚠️ Count diff
OCP Pods     | 8 (IBB1/SHV)     | 3 (GA-UAT)        | ⚠️ Pod count diff
```

**Files to modify:**
- `src/pages/ApplicationLocationDetailPage.tsx` → implement Compare Envs tab content (section currently renders nothing)

---

## PHASE 5: CONFIDENCE + STALE FILTERS ON LIST *(Low — Quick Win)*

**Status:** Search + environment + tech stack filters exist. Confidence filter is missing.

**Add to RuntimeLocationPage.tsx filter bar:**
- Filter chips: `HIGH | MEDIUM | LOW | UNKNOWN` confidence (multi-select)
- Filter chips: `FRESH | STALE | VERY_STALE` data freshness
- Filter chip: `DRIFTED` — apps where intent != actual
- Filter chip: `CONFLICT` — apps with conflicting source assertions

**Implementation:** Add `confidenceFilter` and `freshnessFilter` to store, apply in filtered list computation.

---

## PHASE 6: REAL-TIME LIVE FEED SIDEBAR *(Medium — Wow Factor)*

**Why it matters:** WebSocket is already connected. Surface it visually.

**What to build:** A collapsible "Live Events" panel on the right side of the list page:
- Shows last 10 WebSocket events as a feed (auto-scroll)
- Event types with icons: DRIFT_DETECTED (red bell), IMPORT_COMPLETE (green cloud), STATE_CHANGE (blue arrow)
- Clicking an event navigates to the affected application
- Pulse animation on new events
- "X new alerts" badge when panel is collapsed

**Files to modify:**
- `src/pages/RuntimeLocationPage.tsx` → add live events sidebar toggle
- `src/store/wsStore.ts` → expose recent events array

---

## PHASE 7: DATA FRESHNESS HEATMAP *(Medium — Strong Visual)*

**What to build:** In the Data Quality tab, replace the source list with a visual heatmap:

```
Source         | 0-30m | 30m-2h | 2h-24h | >24h
AppDynamics    | ████  |        |        |      → FRESH
IBM MQ         |       | ████   |        |      → STALE
CMDB           |       |        | ████   |      → VERY_STALE
Oracle OEM     |       |        |        | ████ → CRITICAL
```

Each cell colored green → amber → red by age. Time since last import shown numerically.

---

## PHASE 8: SNAPSHOT TIMELINE CHART *(Already Partial — Polish)*

**Status:** Snapshot chart exists in detail page. Needs refinement.

**Improvements:**
- Use Recharts `AreaChart` instead of bar chart for smoother trend
- Color fill under line: green when ALIGNED, red when DRIFTED
- Clickable points to "replay" historical state
- Tooltip showing: date, confidence score, drift count, primary DC at that time
- "Now" marker at right edge

---

## PHASE 9: NARRATIVE & STORYTELLING LAYER *(Critical for Winning)*

This is often what separates 1st from 2nd in hackathons: **how clearly the solution answers the problem**.

### 9.1 Add Contextual Help Tooltips

Every confidence badge, freshness indicator, and drift badge should have a tooltip explaining:
- **Confidence HIGH:** "MongoDB PRIMARY assertion confirmed by 2 independent sources (Ops Manager + Prometheus). Data is 12 minutes old."
- **STALE:** "Last CMDB update was 4 hours ago. Topology may not reflect current state."
- **DRIFTED:** "Application should be active in AZ3 per intent definition. No assets found in AZ3."

### 9.2 Operator Summary Band (Enhance)

The existing "quick summary row" should become a "cockpit strip" that immediately answers 5 questions:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PCA-PAYMENTS            PRODUCTION          Last updated: 8 min ago     │
│                                                                          │
│  WHERE: IBB1 + SHV (2 DCs)     PRIMARY WRITE: IBB1     CONFIDENCE: HIGH │
│  DRIFT: ALIGNED ✓              STALE SOURCES: 1         ASSETS: 14      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Evidence Chips

For each data center in the location view, add small evidence chips showing:
- Which source proved the asset was there: `[AppDyn] [SPLOC] [MongoDB]`
- Clicking a chip opens the source record in a side drawer
- Color: green=deterministic, amber=inferred, gray=CMDB

### 9.4 The "Why" Button

Every major assertion should have a small `(?)` button that expands a one-paragraph explanation:
> "IBB1 is classified as PRIMARY because: MongoDB OPS Manager shows rs_state=1 (Primary) for cluster Cluster_0 on host ibm1dbprod. This was ingested 8 minutes ago. AppDynamics shows 94% of transaction load routed through IBB1 nodes. No conflicting signals detected."

---

## PHASE 10: MISSING DATA DISCOVERY — SHARE MECHANISM *(Bonus Credit)*

The problem statement says teams must share newly discovered data sources in a common channel for extra credit.

**What to add to DataDiscoveryPanel.tsx:**
- "Submit Discovery" form prominently at the top
- Pre-populate with discovered sources we've found (AVI LB pool JSON, batch Autosys jobs, OCP pod info)
- Show a "Shared to hackathon channel" confirmation state
- Add a "Discoveries by this team" section listing what we've contributed

**Discoveries to document:**
1. **AVI Load Balancer Pool JSON** — provides active/standby pool member status, traffic-weighted distribution across DCs
2. **AutoSys Batch Job CSV** — shows which machine (`RUN_MACHINE`) executed each job, with DC derivable from FQDN prefix
3. **IBM MQ QMgr Command Server Status** — identifies which queue managers are accepting commands (live vs passive)
4. **MongoDB Replica State** (`rs_state=1` = primary, `rs_state=2` = secondary) — most deterministic single-field write authority indicator in the dataset

---

## PHASE 11: BACKEND PERSISTENCE *(Medium — Worth Doing)*

**Current:** Zustand in-memory. Page refresh = data loss.

**What to implement with existing backend:**
```sql
-- Core runtime tables
runtime_applications (id, name, environment, confidence_level, primary_dc, last_updated)
runtime_assets (id, app_id, component, tech_stack, data_center, role, write_authority, source_name, freshness)
runtime_intents (id, app_id, intended_primary_dc, intended_active_dcs, replication_model)
runtime_drifts (id, app_id, drift_type, severity, detected_at, resolved_at)
runtime_audit_log (id, app_id, event_type, actor, description, timestamp)
runtime_proposals (id, tech_stack, dimension, proposed_source, status, submitted_by)
```

**Priority:** If time allows, implement this. It makes the solution feel real, not demo-only.

---

## PHASE 12: UI ANIMATION POLISH

### List Page Animations

```tsx
// Staggered card entrance
variants={{
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05 } })
}}
```

### Detail Page Tab Transitions

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.2 }}
  >
    {renderTab()}
  </motion.div>
</AnimatePresence>
```

### Confidence Badge Pulse on LOW/UNKNOWN

```tsx
<motion.div
  animate={confidence === 'LOW' ? { scale: [1, 1.05, 1] } : {}}
  transition={{ repeat: Infinity, duration: 2 }}
>
  <ConfidenceBadge level={confidence} />
</motion.div>
```

---

## FINAL IMPLEMENTATION PRIORITY ORDER

### P0 — Non-negotiable (do these first)

1. **Verify end-to-end demo flow works** — click app → detail → intent → evidence → incident mode
2. **Geographic map component** — US SVG with DC dots, pulse for active, lines for replication
3. **Dependency graph (React Flow)** — app → component nodes → DC branches
4. **Application card redesign** — confidence color bar, mini DC distribution bar, tech stack icons
5. **Compare Environments tab** — implement the table (data already exists)
6. **Confidence/stale filters** — add to list page filter bar

### P1 — High-value additions

7. **Data freshness heatmap** — in Data Quality tab
8. **Cockpit strip enhancement** — 5 clear answers in the summary band
9. **Evidence chips with source provenance** — per DC card
10. **"Why" explanation tooltips** — on confidence badge, primary DC, drift badges
11. **Snapshot timeline improvements** — area chart with drift coloring
12. **Live events sidebar** — WebSocket feed made visible

### P2 — Polish & wow factor

13. **Micro-animations** — card hover lift, tab transitions, badge pulses
14. **Animated replication arrows** — between DC cards in location map
15. **Discovery submission form prominence** — position discoveries at top of Data Discovery panel
16. **Mobile responsive tab bar** — scrollable tab names for small screens
17. **Backend persistence** — Supabase tables if time allows

---

## UI DESIGN SPECIFICATIONS

### Color Palette

```
Background:    #0A0E1A (near-black navy)
Surface:       #111827 (card background)
Surface-Hover: #1F2937 (hover state)
Border:        #1E2A3A (subtle border)

Primary:       #3B82F6 (blue — interactive elements)
Primary-Glow:  #3B82F620 (glow effect)

DC-Active:     #00E599 (neon green — live/primary DC)
DC-Active-Glow:#00E59920

DC-Standby:    #F59E0B (amber — secondary DC)
Stale:         #EF4444 (red — stale/conflict)

Confidence-HIGH:    #22C55E
Confidence-MEDIUM:  #F59E0B
Confidence-LOW:     #EF4444
Confidence-UNKNOWN: #6B7280

Text-Primary:  #F9FAFB
Text-Secondary:#9CA3AF
Text-Muted:    #6B7280
```

### Typography

```
Font: Inter (already loaded)
App name:      text-xl font-bold tracking-tight
DC name:       text-sm font-semibold uppercase tracking-wider
Metric value:  text-3xl font-black tabular-nums
Evidence:      text-xs font-mono text-muted
```

### Spacing System (8px grid)

```
xs: 4px
sm: 8px
md: 16px
lg: 24px
xl: 32px
2xl: 48px
```

### Card Design Pattern

```
bg-[#111827]
border border-[#1E2A3A]
rounded-xl
p-4 md:p-6
hover:border-[#3B82F6]/40
hover:shadow-lg hover:shadow-[#3B82F6]/5
transition-all duration-200
```

---

## DEMO SCRIPT — FINAL VERSION

**Time: 5-7 minutes. Practice 3x.**

### Opening (30s)
> "Every incident, every failover, every DR test comes down to one question: where is my application actually running? Not where it's deployed — where it's *live*, where it owns writes, and whether that matches what we intended. HealthMesh answers this."

### Act 1: Where is it? & The "2 AM Ready" Trust Banner (90s)
1. Open runtime location list → show 4 apps, confidence scores, DC tags.
2. "Notice PCA-PAYMENTS has MEDIUM confidence. Let's drill into it."
3. Click PCA-PAYMENTS → detail page opens.
4. Point to the "2AM READY" trust banner at the top → "This is our '2 AM Ready' trust banner. During a high-stress 2 AM outage, SREs cannot afford to act on stale or conflicting data. This banner aggregates signal freshness and conflict counts to prevent engineers from executing destructive recovery steps based on outdated assumptions."
5. Point to the geographic map → "Active in IBB1 and SHV. Primary write authority is IBB1. You can see the replication arrow."

### Act 2: Conflict Resolution & How Sure Are We? (90s)
1. Point to the Conflict Alert → "Here, when sources disagree (e.g. CMDB says SHV, but routing says ASH), we surface a Conflict Alert. Operators can resolve the conflict directly by choosing which source to trust, recording the action in the audit trail."
2. Click Data Quality tab.
3. "MongoDB? Deterministic — we read the primary replica state directly. HIGH confidence."
4. "CMDB? 4 hours old. LOW confidence on topology."
5. "That's why the overall confidence is MEDIUM — two sources, one fresh, one stale."

### Act 3: Is it right? (90s)
1. Click Intent vs Actual tab.
2. "PCA was designed to be active in IBB1, SHV, and AZ3. But we don't see any assets in AZ3."
3. "MISSING_DC drift. HIGH severity. Flagged automatically."
4. "Either AZ3 was decommissioned and intent wasn't updated, or a deployment failed. Either way, we found it."

### Act 4: What's the blast radius? Decoupled Simulation Sandbox (60s)
1. Open Incident Mode panel.
2. Select IBB1 as failed DC.
3. "PAYROLL has no failover configured → CRITICAL impact. 4 other apps have standby → WARNING."
4. "Importantly, this failover simulator operates in a decoupled, transaction-isolated sandbox memory layer in production rather than writing destructive mutations directly to the telemetry database. This keeps our production metrics safe and untainted while testing scenarios."
5. Show JSON export: "This goes into the incident ticket."

### Act 5: Collaborative Discovery Model & Close (60s)
1. Open Data Discovery panel.
2. "To earn extra innovation points, we pitched the Collaborative Discovery Model: the Data Discovery Hub acts as a crowdsourced enterprise wiki where application teams help security/observability teams populate dark infrastructure (like AutoSys batch jobs and legacy IBM MQ networks) to resolve blindspots."
3. "Every import, state change, conflict resolution, and discovery is logged in our Audit Log with full source provenance."
4. Close: "HealthMesh doesn't just tell you where your app is. It tells you why it believes that, how confident it is, and whether it's right. In an incident, that's the difference between minutes and hours."

---

## DATA DISCOVERY FINDINGS (Share to Hackathon Chat)

The following new data sources were identified during this project and should be shared:

### Discovery 1: IBM MQ Queue Manager Command Server Status
- **Source:** `ibmmq_qmgr_command_server_status.csv` / Prometheus ibm-mq exporter
- **Signal:** Queue managers with `Value=2` are actively accepting commands. Combined with hostname FQDN, DC can be derived.
- **Why deterministic:** A passive standby queue manager does not respond to commands. `Value=2` = definitively live.
- **Confidence level:** HIGH (3 → can be 4 with FQDN→DC mapping standardized)
- **Collaborative wiki role:** Fills critical MQ visibility gaps that app teams typically run as dark infrastructure.

### Discovery 2: MongoDB Replica State Field
- **Source:** `mongodb_info.csv` — field `rs_state` (1=primary, 2=secondary, 0=startup)
- **Signal:** `rs_state=1` is the single most authoritative field for identifying write authority in a MongoDB deployment
- **Why deterministic:** The MongoDB RS protocol enforces exactly one primary per replica set at all times
- **Confidence level:** 4 (Available and standardized — fully deterministic)

### Discovery 3: AutoSys Batch Job Execution Location
- **Source:** `Batch.csv` — fields `MACH_NAME`, `RUN_MACHINE`, `JOB_STATUS`, `STATUS_TIMESTAMP`
- **Signal:** `RUN_MACHINE` FQDN prefix indicates which physical/virtual host executed the job. DC derivable from FQDN naming convention.
- **Why useful:** Batch systems often reveal "dark" compute that never appears in CMDB or observability
- **Confidence level:** 3 (machine name → DC mapping requires FQDN convention to be consistent)

### Discovery 4: AVI Load Balancer Pool Member Status
- **Source:** `pool member-2.json` / AVI Controller API
- **Signal:** Pool members with `enabled=true` and `operational_state=OPER_UP` are actively receiving traffic. Site field maps directly to DC.
- **Why deterministic:** Load balancer is the ingress truth. If traffic is flowing to a pool member, the application is live at that site.
- **Confidence level:** 3 → 4 (requires AVI Controller API standardization)

---

## HACKATHON WINNER CHECKLIST

Before presenting, verify:

- [ ] Demo walkthrough overlay starts and advances correctly
- [ ] Clicking any app opens detail with geographic map visible
- [ ] MongoDB assets show PRIMARY/SECONDARY badges clearly
- [ ] Intent vs Actual tab shows at least one drift
- [ ] Incident Mode shows at least one CRITICAL impact
- [ ] Data Quality tab shows at least one STALE source
- [ ] Audit log has at least 5 events
- [ ] Confidence badge tooltips explain the score
- [ ] Data Discovery panel shows team's 4 discovered sources
- [ ] Export from Incident Mode works and shows valid JSON
- [ ] Browser refresh returns to same application detail (URL state)
- [ ] Build passes: `npm run build`

---

## WHAT JUDGES WILL ASK — AND OUR ANSWERS

| Judge Question | Where to Show It |
|---------------|-----------------|
| "Where is PCA-PAYMENTS running?" | Geographic map → IBB1 + SHV, primary write IBB1 |
| "How do you know that?" | Data Quality tab → MongoDB PRIMARY from Ops Manager (8 min ago) |
| "What if it's wrong?" | Confidence badge: MEDIUM because CMDB is 4h stale |
| "Is this what was intended?" | Intent vs Actual → ALIGNED for IBB1/SHV, DRIFTED for AZ3 |
| "What happens if IBB1 goes down?" | Incident Mode → PAYROLL CRITICAL, PCA WARNING (SHV failover) |
| "What changed recently?" | Audit Log → last import at 09:14, drift detected at 09:22 |
| "Can this scale?" | Confidence scoring engine, determinism model, WIP source matrix |
| "What data is missing?" | Data Discovery panel → WIP sources, gaps explicitly surfaced |
| "How is this different from a CMDB?" | Intent vs Actual, freshness decay, multi-source conflict resolution, blast radius |
| "Is the UI responsive?" | Mobile tabs, responsive grid, touch-friendly buttons |

---

## BOTTOM LINE

This solution is **the strongest possible answer to the hackathon problem** because:

1. It solves BOTH dimensions the problem statement requires: where data is absent (gap surfacing) AND where data exists (correlation and simplification)
2. It makes confidence and uncertainty **first-class citizens**, not afterthoughts
3. It separates **design intent from actual state** (the bonus criterion)
4. It shows **how the solution evolves** as better data arrives (proposal workflow + WIP matrix)
5. The demo is narrated, guided, and covers every judge question

**The gap between current state (8/10) and first place (10/10) is:**
- Geographic DC map with pulse animation
- React Flow dependency graph
- Card and cockpit strip visual redesign
- Compare Environments tab completion
- Confidence/stale filter bar completion

These are all achievable with the existing codebase and packages already installed.

**Ship the P0 items. Win the hackathon.**
