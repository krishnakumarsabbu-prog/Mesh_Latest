"""
Multi-agent orchestrator.
Parses intent from the user query, routes to relevant domain agents,
executes their tools, and assembles context for the LLM.
"""
import json
import logging
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent, ToolExecution
from app.llm.agents.appdynamics_agent import AppDynamicsAgent
from app.llm.agents.ibmmq_agent import IbmMqAgent
from app.llm.agents.mongodb_agent import MongoDbAgent
from app.llm.agents.openshift_agent import OpenShiftAgent
from app.llm.agents.splunk_agent import SplunkAgent
from app.llm.agents.runtime_agent import RuntimeLocationAgent
from app.llm.agents.gap_agent import GapAnalysisAgent

logger = logging.getLogger(__name__)

# Registry of all available agents
_AGENT_REGISTRY: list[BaseHealthMeshAgent] = [
    AppDynamicsAgent(),
    IbmMqAgent(),
    OpenShiftAgent(),
    MongoDbAgent(),
    SplunkAgent(),
    RuntimeLocationAgent(),
    GapAnalysisAgent(),
]

_AGENT_BY_SLUG: dict[str, BaseHealthMeshAgent] = {a.connector_slug: a for a in _AGENT_REGISTRY}

# Keyword → agent slug mapping for intent detection
_INTENT_KEYWORDS: dict[str, list[str]] = {
    "appdynamics": ["appdynamics", "apm", "application performance", "transaction", "node inventory", "tier"],
    "ibm-mq": ["ibm mq", "mq", "queue", "queue depth", "backlog", "message queue", "channel", "qmgr"],
    "openshift": ["openshift", "ocp", "pod", "kubernetes", "container", "namespace", "deployment", "k8s"],
    "mongodb": ["mongodb", "mongo", "replica", "replica set", "replication", "oplog", "connection pool"],
    "splunk": ["splunk", "log", "logs", "log volume", "search", "index", "ingestion"],
    "runtime-location": [
        "where is", "which dc", "primary write", "data center", "datacenter",
        "running in", "runtime location", "primary dc", "drift", "wrong primary",
        "aligned", "drifted", "topology", "write dc",
    ],
    "gap-analysis": [
        "missing data", "unknown", "wip", "stale", "no data", "gap", "coverage",
        "incomplete", "confidence", "data quality", "import status",
    ],
}

# Broad health queries activate multiple agents
_BROAD_QUERY_KEYWORDS = [
    "health", "status", "incident", "all", "overall", "summary",
    "everything", "overview", "what", "which", "failing", "down",
]


def detect_relevant_agents(query: str) -> list[BaseHealthMeshAgent]:
    """Return a prioritised list of agents matching the query intent."""
    q = query.lower()

    matched: list[BaseHealthMeshAgent] = []
    for slug, keywords in _INTENT_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            agent = _AGENT_BY_SLUG.get(slug)
            if agent:
                matched.append(agent)

    # Fall back to all agents for broad health questions
    if not matched and any(kw in q for kw in _BROAD_QUERY_KEYWORDS):
        matched = list(_AGENT_REGISTRY)

    return matched[:4]  # Cap at 4 agents per query to limit latency


def _sse(event_type: str, data: dict) -> str:
    payload = json.dumps({"type": event_type, **data})
    return f"data: {payload}\n\n"


async def run_agents_with_trace(
    query: str,
    db: AsyncSession,
) -> AsyncIterator[str]:
    """
    Detect agents, execute their tools, and stream SSE events for each step.
    Yields SSE strings; caller concatenates them into the full stream.
    Also yields the final aggregated context string as a non-SSE sentinel.
    """
    agents = detect_relevant_agents(query)
    if not agents:
        return

    active_slugs = [a.connector_slug for a in agents]
    yield _sse("agents", {"active": active_slugs})

    context_parts: list[str] = []

    for agent in agents:
        tool_names = agent._select_tools(query)
        for tool_name in tool_names:
            args = agent._build_args(tool_name, query)
            yield _sse("tool_start", {
                "agent": agent.connector_slug,
                "tool": tool_name,
                "args": args,
            })

            execution: ToolExecution = await agent.execute_tool(tool_name, args, db)

            result_payload = execution.result if execution.status == "success" else {"error": execution.error}
            yield _sse("tool_result", {
                "agent": agent.connector_slug,
                "tool": tool_name,
                "result": result_payload,
                "duration_ms": execution.duration_ms,
                "status": execution.status,
            })

        # Collect summary from all tool results
        agent_result = await agent.run(query, db)
        if agent_result.summary:
            context_parts.append(agent_result.summary)

    # Yield the aggregated context as a special internal event
    combined_context = "\n\n".join(context_parts)
    yield _sse("agent_context", {"context": combined_context})
