import sys
import os
import asyncio
import httpx
from datetime import datetime
from typing import Dict, List, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Set up simple logging
import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("connector-gateway")

# Registry definition for all 8 independent connector services
CONNECTORS_METADATA = [
    {"slug": "ibm-mq", "name": "IBM MQ Connector", "port": 1001},
    {"slug": "oracle-oem", "name": "Oracle OEM Connector", "port": 1002},
    {"slug": "mongodb", "name": "MongoDB Connector", "port": 1003},
    {"slug": "openshift", "name": "OpenShift Connector", "port": 1004},
    {"slug": "appdynamics", "name": "AppDynamics Connector", "port": 1005},
    {"slug": "splunk-traffic", "name": "Splunk Traffic Connector", "port": 1006},
    {"slug": "scom", "name": "SCOM Connector", "port": 1007},
    {"slug": "batch-monitor", "name": "Batch Monitor Connector", "port": 1008},
    {"slug": "adc-loadbalancer", "name": "AVI Load Balancer Connector", "port": 1009},
    {"slug": "prometheus", "name": "Prometheus Connector", "port": 1011},
    {"slug": "grafana", "name": "Grafana Connector", "port": 1012},
    {"slug": "pcf", "name": "PCF Cloud Connector", "port": 1013},
    {"slug": "vm", "name": "VM vCenter Connector", "port": 1014},
    {"slug": "servicenow", "name": "ServiceNow CMDB Connector", "port": 1015},
    {"slug": "splunk", "name": "Splunk Core Connector", "port": 1016},
]

def get_connector_url(slug: str, port: int) -> str:
    # Check if there is an env var like: IBM_MQ_SERVICE_URL
    env_name = f"{slug.upper().replace('-', '_')}_SERVICE_URL"
    return os.getenv(env_name, f"http://localhost:{port}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing HealthMesh Connector Gateway on port 1010...")
    # Initialize connection client
    app.state.http_client = httpx.AsyncClient(timeout=4.0)
    yield
    # Close connection client
    await app.state.http_client.aclose()
    logger.info("Gateway service stopped.")

app = FastAPI(
    title="HealthMesh Connector Gateway Service",
    description="Enterprise federated connector registry, aggregated telemetry health cockpit, and AI topology mesh gateway",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def check_heartbeat(client: httpx.AsyncClient, name: str, url: str) -> Dict[str, Any]:
    try:
        resp = await client.get(f"{url}/health")
        if resp.status_code == 200:
            return {"status": "ONLINE", "latency_ms": round(resp.elapsed.total_seconds() * 1000, 2)}
        return {"status": "DEGRADED", "error": f"HTTP status {resp.status_code}"}
    except Exception as e:
        return {"status": "OFFLINE", "error": str(e)}

@app.get("/health")
async def gateway_health():
    return {
        "status": "healthy",
        "service": "connector-gateway",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/connectors")
async def list_connectors():
    client = app.state.http_client
    tasks = []
    
    for conn in CONNECTORS_METADATA:
        url = get_connector_url(conn["slug"], conn["port"])
        tasks.append(check_heartbeat(client, conn["name"], url))
        
    heartbeats = await asyncio.gather(*tasks)
    
    result = []
    for conn, hb in zip(CONNECTORS_METADATA, heartbeats):
        url = get_connector_url(conn["slug"], conn["port"])
        result.append({
            "name": conn["name"],
            "slug": conn["slug"],
            "url": url,
            "status": hb["status"],
            "latency": hb.get("latency_ms"),
            "error": hb.get("error")
        })
    return result

@app.get("/aggregate-health")
async def aggregate_health():
    client = app.state.http_client
    tasks = []
    
    for conn in CONNECTORS_METADATA:
        url = get_connector_url(conn["slug"], conn["port"])
        tasks.append(client.get(f"{url}/summary"))
        
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    
    summary = {}
    online_count = 0
    offline_count = 0
    total_active_alerts = 0

    for conn, resp in zip(CONNECTORS_METADATA, responses):
        if isinstance(resp, httpx.Response) and resp.status_code == 200:
            data = resp.json()
            summary[conn["slug"]] = {
                "status": "ONLINE",
                "metrics": data
            }
            online_count += 1
            total_active_alerts += data.get("active_alerts_count", 0)
        else:
            summary[conn["slug"]] = {
                "status": "OFFLINE",
                "error": str(resp) if not isinstance(resp, httpx.Response) else f"HTTP {resp.status_code}"
            }
            offline_count += 1

    return {
        "total_connectors": len(CONNECTORS_METADATA),
        "online_connectors": online_count,
        "offline_connectors": offline_count,
        "mesh_health_score": round((online_count / len(CONNECTORS_METADATA)) * 100, 2),
        "total_active_alerts": total_active_alerts,
        "connectors_summary": summary
    }

@app.get("/aggregate-topology")
async def aggregate_topology():
    client = app.state.http_client
    tasks = []
    
    for conn in CONNECTORS_METADATA:
        url = get_connector_url(conn["slug"], conn["port"])
        tasks.append(client.get(f"{url}/topology"))
        
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    
    federated_nodes = []
    federated_edges = []
    
    # Virtual node representing our gateway orchestrator
    federated_nodes.append({
        "id": "gateway:orchestrator",
        "label": "HealthMesh Gateway",
        "type": "orchestrator",
        "status": "HEALTHY"
    })

    for conn, resp in zip(CONNECTORS_METADATA, responses):
        if isinstance(resp, httpx.Response) and resp.status_code == 200:
            topo = resp.json()
            slug = conn["slug"]
            
            # Virtual link node connecting gateway to connector cluster
            virtual_hub_id = f"mesh-hub:{slug}"
            federated_nodes.append({
                "id": virtual_hub_id,
                "label": conn["name"],
                "type": "connector_hub",
                "status": "ONLINE"
            })
            federated_edges.append({
                "source": "gateway:orchestrator",
                "target": virtual_hub_id,
                "type": "orchestrates"
            })

            # Merge nodes and prefix their IDs to prevent collision across connectors
            for node in topo.get("nodes", []):
                original_id = node["id"]
                prefixed_id = f"{slug}_{original_id}"
                node["id"] = prefixed_id
                node["connector"] = slug
                federated_nodes.append(node)
                
                # Connect topological root elements to our virtual hub
                if node.get("type") in ["queue_manager", "database", "replica_set", "cluster", "application", "load_balancer", "server", "job"]:
                    federated_edges.append({
                        "source": virtual_hub_id,
                        "target": prefixed_id,
                        "type": "monitors"
                    })

            # Merge edges and adjust references to match prefixed node IDs
            for edge in topo.get("edges", []):
                edge["source"] = f"{slug}_{edge['source']}"
                edge["target"] = f"{slug}_{edge['target']}"
                edge["connector"] = slug
                federated_edges.append(edge)

    return {
        "nodes": federated_nodes,
        "edges": federated_edges
    }

@app.get("/aggregate-alerts")
async def aggregate_alerts():
    client = app.state.http_client
    tasks = []
    
    for conn in CONNECTORS_METADATA:
        url = get_connector_url(conn["slug"], conn["port"])
        tasks.append(client.get(f"{url}/alerts"))
        
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    
    all_alerts = []
    
    for conn, resp in zip(CONNECTORS_METADATA, responses):
        if isinstance(resp, httpx.Response) and resp.status_code == 200:
            alerts = resp.json()
            for a in alerts:
                a["connector"] = conn["slug"]
                all_alerts.append(a)

    return all_alerts

@app.get("/aggregate-ai-context")
async def aggregate_ai_context():
    client = app.state.http_client
    tasks = []
    
    for conn in CONNECTORS_METADATA:
        url = get_connector_url(conn["slug"], conn["port"])
        tasks.append(client.get(f"{url}/ai-context"))
        
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    
    scores = []
    critical_findings = []
    warnings = []
    recommendations = []
    active_alerts = []
    drift_analysis = {}
    sla_status = {}
    
    for conn, resp in zip(CONNECTORS_METADATA, responses):
        slug = conn["slug"]
        if isinstance(resp, httpx.Response) and resp.status_code == 200:
            ctx = resp.json()
            scores.append(ctx.get("health_score", 100.0))
            
            # Aggregate findings with connector tags
            for f in ctx.get("critical_findings", []):
                critical_findings.append(f"[{conn['name']}] {f}")
            for w in ctx.get("warnings", []):
                warnings.append(f"[{conn['name']}] {w}")
            for r in ctx.get("recommendations", []):
                recommendations.append(f"[{conn['name']}] {r}")
            for a in ctx.get("active_alerts", []):
                active_alerts.append(f"[{conn['name']}] {a}")
                
            drift_analysis[slug] = ctx.get("drift_analysis", {})
            sla_status[slug] = ctx.get("sla_status", {})
        else:
            # Penalize for offline connector
            scores.append(0.0)
            critical_findings.append(f"[{conn['name']}] Connector is completely OFFLINE!")
            recommendations.append(f"[{conn['name']}] Check connector application server status and container ports.")
            drift_analysis[slug] = {"offline": True}
            sla_status[slug] = {"status": "OFFLINE_BREACH"}

    mesh_health_score = sum(scores) / len(scores) if scores else 0.0

    return {
        "connector": "mesh-gateway-aggregator",
        "health_score": round(mesh_health_score, 2),
        "critical_findings": critical_findings,
        "warnings": warnings,
        "recommendations": recommendations,
        "topology_summary": f"Federated connector mesh is orchestrating {len(scores)} telemetry nodes simultaneously.",
        "active_alerts": active_alerts,
        "drift_analysis": drift_analysis,
        "sla_status": sla_status,
        "generated_at": datetime.utcnow().isoformat() + "Z"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=1010, reload=False)
