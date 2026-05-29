"""
Connector Registry and Factory.

Provides dynamic resolution of connector implementations by slug.
New connectors are registered at import time via the `register` decorator
or `ConnectorRegistry.register()` method.
"""

from __future__ import annotations

import logging
from typing import Dict, Optional, Type

from app.connectors.base.interface import BaseConnector, ConnectorConfig, ConnectorCredentials

logger = logging.getLogger(__name__)


class ConnectorRegistry:
    """
    Central registry mapping connector slugs to their implementation classes.

    Usage:
        @ConnectorRegistry.register("splunk")
        class SplunkConnector(BaseConnector):
            ...

        connector_cls = ConnectorRegistry.resolve("splunk")
        instance = connector_cls(config, credentials)
    """

    _registry: Dict[str, Type[BaseConnector]] = {}

    @classmethod
    def register(cls, slug: str) -> "type[BaseConnector]":
        """Class decorator that registers a connector implementation."""
        def decorator(connector_cls: Type[BaseConnector]) -> Type[BaseConnector]:
            if slug in cls._registry:
                logger.warning("Connector slug %r already registered — overwriting", slug)
            cls._registry[slug] = connector_cls
            connector_cls.CONNECTOR_SLUG = slug
            logger.debug("Registered connector: %r -> %s", slug, connector_cls.__name__)
            return connector_cls
        return decorator

    @classmethod
    def resolve(cls, slug: str) -> Optional[Type[BaseConnector]]:
        """Return the connector class for the given slug, or None."""
        return cls._registry.get(slug)

    @classmethod
    def build(
        cls,
        slug: str,
        config: ConnectorConfig,
        credentials: ConnectorCredentials,
    ) -> Optional[BaseConnector]:
        """Instantiate a connector by slug. Returns None if slug is not registered."""
        connector_cls = cls.resolve(slug)
        if connector_cls is None:
            logger.warning("No connector registered for slug %r", slug)
            return None
        return connector_cls(config, credentials)

    @classmethod
    def list_registered(cls) -> Dict[str, Type[BaseConnector]]:
        """Return a copy of the full registry."""
        return dict(cls._registry)

    @classmethod
    def is_registered(cls, slug: str) -> bool:
        return slug in cls._registry


def _import_all_connectors() -> None:
    """
    Force-import all connector modules so their @register decorators run.
    Call this once at application startup.
    """
    import importlib

    _modules = [
        "app.connectors.splunk.connector",
        "app.connectors.grafana.connector",
        "app.connectors.appdynamics.connector",
        "app.connectors.servicenow.connector",
        "app.connectors.linborg.connector",
        "app.connectors.custom.connector",
        "app.connectors.ibmmq.connector",
        "app.connectors.mongodb.connector",
        "app.connectors.oracle_oem.connector",
        "app.connectors.avi_lb.connector",
    ]

    for module_path in _modules:
        try:
            importlib.import_module(module_path)
            logger.debug("Loaded connector module: %s", module_path)
        except ImportError as exc:
            logger.error("Failed to import connector module %s: %s", module_path, exc)


def initialize_registry() -> None:
    """Initialize the connector registry. Call once at app startup."""
    _import_all_connectors()
    logger.info(
        "Connector registry initialized with %d connectors: %s",
        len(ConnectorRegistry._registry),
        list(ConnectorRegistry._registry.keys()),
    )
