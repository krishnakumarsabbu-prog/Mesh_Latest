"""
Abstract base class for all HealthMesh domain agents.
Each agent owns a connector type and exposes typed tools that query
the local SQLite database, returning structured results.
"""
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class AgentTool:
    name: str
    description: str
    func: Callable


@dataclass
class ToolExecution:
    agent: str
    tool: str
    args: dict
    result: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None
    status: str = "running"  # running | success | error


@dataclass
class AgentResult:
    agent_slug: str
    summary: str
    tool_executions: list[ToolExecution] = field(default_factory=list)
    data: dict = field(default_factory=dict)


class BaseHealthMeshAgent(ABC):
    connector_slug: str = ""
    display_name: str = ""
    system_prompt: str = ""

    def __init__(self):
        self._tools: dict[str, AgentTool] = {}
        self._register_tools()

    @abstractmethod
    def _register_tools(self) -> None:
        """Register all tools for this agent."""

    def register_tool(self, name: str, description: str, func: Callable) -> None:
        self._tools[name] = AgentTool(name=name, description=description, func=func)

    @property
    def tools(self) -> list[AgentTool]:
        return list(self._tools.values())

    async def execute_tool(
        self, tool_name: str, args: dict, db: AsyncSession
    ) -> ToolExecution:
        exec_record = ToolExecution(
            agent=self.connector_slug,
            tool=tool_name,
            args=args,
            status="running",
        )
        if tool_name not in self._tools:
            exec_record.status = "error"
            exec_record.error = f"Unknown tool: {tool_name}"
            return exec_record

        start = time.monotonic()
        try:
            result = await self._tools[tool_name].func(db=db, **args)
            exec_record.result = result
            exec_record.status = "success"
        except Exception as exc:
            logger.error("Tool %s.%s failed: %s", self.connector_slug, tool_name, exc)
            exec_record.status = "error"
            exec_record.error = str(exc)
        finally:
            exec_record.duration_ms = round((time.monotonic() - start) * 1000, 1)

        return exec_record

    async def run(self, query: str, db: AsyncSession) -> AgentResult:
        """Execute relevant tools for the given query and return a structured result."""
        result = AgentResult(agent_slug=self.connector_slug)
        tool_names = self._select_tools(query)

        for tool_name in tool_names:
            args = self._build_args(tool_name, query)
            execution = await self.execute_tool(tool_name, args, db)
            result.tool_executions.append(execution)
            if execution.status == "success" and execution.result:
                result.data[tool_name] = execution.result

        result.summary = self._summarize(result.data, query)
        return result

    def _select_tools(self, query: str) -> list[str]:
        """Return tool names relevant to the query. Default: run all tools."""
        return list(self._tools.keys())

    def _build_args(self, tool_name: str, query: str) -> dict:
        """Build arguments for a tool call. Override per agent as needed."""
        return {}

    def _summarize(self, data: dict, query: str) -> str:
        """Build a compact text summary of collected data for the LLM context."""
        if not data:
            return f"No data retrieved from {self.display_name}."
        lines = [f"## {self.display_name} Data"]
        for key, value in data.items():
            lines.append(f"- {key}: {value}")
        return "\n".join(lines)
