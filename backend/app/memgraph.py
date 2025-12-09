"""
Memgraph database connection and utilities.

This module provides connection management for Memgraph graph database.
Uses gqlalchemy for OGM (Object Graph Mapper) capabilities.

Local development: docker-compose up -d memgraph
AWS deployment: Update MEMGRAPH_HOST and enable MEMGRAPH_ENCRYPTED
"""

from typing import Any, Generator
from contextlib import contextmanager
from functools import lru_cache

from gqlalchemy import Memgraph
from neo4j import GraphDatabase, Driver, Session
from neo4j.exceptions import ServiceUnavailable, AuthError

from .config import get_settings


class MemgraphConnection:
    """
    Memgraph connection manager with both gqlalchemy and neo4j driver support.

    gqlalchemy: High-level OGM for defining node/relationship models
    neo4j driver: Low-level driver for raw Cypher queries
    """

    _instance: "MemgraphConnection | None" = None
    _memgraph: Memgraph | None = None
    _driver: Driver | None = None

    def __new__(cls) -> "MemgraphConnection":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def memgraph(self) -> Memgraph:
        """Get gqlalchemy Memgraph instance (lazy initialization)."""
        if self._memgraph is None:
            settings = get_settings()
            self._memgraph = Memgraph(
                host=settings.memgraph_host,
                port=settings.memgraph_port,
                username=settings.memgraph_username or None,
                password=settings.memgraph_password or None,
                encrypted=settings.memgraph_encrypted,
            )
        return self._memgraph

    @property
    def driver(self) -> Driver:
        """Get neo4j driver instance (lazy initialization)."""
        if self._driver is None:
            settings = get_settings()
            uri = f"bolt://{settings.memgraph_host}:{settings.memgraph_port}"

            auth = None
            if settings.memgraph_username and settings.memgraph_password:
                auth = (settings.memgraph_username, settings.memgraph_password)

            self._driver = GraphDatabase.driver(
                uri,
                auth=auth,
                encrypted=settings.memgraph_encrypted,
            )
        return self._driver

    def close(self) -> None:
        """Close all connections."""
        if self._driver:
            self._driver.close()
            self._driver = None
        self._memgraph = None

    def verify_connectivity(self) -> bool:
        """Check if Memgraph is reachable."""
        try:
            self.driver.verify_connectivity()
            return True
        except (ServiceUnavailable, AuthError, Exception):
            return False

    def get_session(self) -> Session:
        """Get a new neo4j session for transactions."""
        return self.driver.session()

    @contextmanager
    def session_context(self) -> Generator[Session, None, None]:
        """Context manager for auto-closing sessions."""
        session = self.get_session()
        try:
            yield session
        finally:
            session.close()


@lru_cache()
def get_memgraph_connection() -> MemgraphConnection:
    """Get the singleton Memgraph connection instance."""
    return MemgraphConnection()


def get_memgraph() -> Memgraph:
    """FastAPI dependency to get gqlalchemy Memgraph instance."""
    return get_memgraph_connection().memgraph


def get_neo4j_driver() -> Driver:
    """FastAPI dependency to get neo4j driver."""
    return get_memgraph_connection().driver


def execute_query(query: str, parameters: dict[str, Any] | None = None) -> list[dict]:
    """
    Execute a Cypher query and return results as list of dicts.

    Args:
        query: Cypher query string
        parameters: Optional query parameters

    Returns:
        List of record dictionaries
    """
    conn = get_memgraph_connection()
    with conn.session_context() as session:
        result = session.run(query, parameters or {})
        return [record.data() for record in result]


def execute_write(query: str, parameters: dict[str, Any] | None = None) -> dict:
    """
    Execute a write query (CREATE, MERGE, DELETE, etc.) and return summary.

    Args:
        query: Cypher query string
        parameters: Optional query parameters

    Returns:
        Summary dict with counters
    """
    conn = get_memgraph_connection()
    with conn.session_context() as session:
        result = session.run(query, parameters or {})
        summary = result.consume()
        return {
            "nodes_created": summary.counters.nodes_created,
            "nodes_deleted": summary.counters.nodes_deleted,
            "relationships_created": summary.counters.relationships_created,
            "relationships_deleted": summary.counters.relationships_deleted,
            "properties_set": summary.counters.properties_set,
        }


def health_check() -> dict:
    """
    Check Memgraph health and return status info.

    Returns:
        Dict with status, version, and connection info
    """
    conn = get_memgraph_connection()
    settings = get_settings()

    base_info = {
        "host": settings.memgraph_host,
        "port": settings.memgraph_port,
        "encrypted": settings.memgraph_encrypted,
    }

    if not conn.verify_connectivity():
        return {
            **base_info,
            "status": "disconnected",
            "error": "Cannot connect to Memgraph",
        }

    try:
        # Get Memgraph version
        result = execute_query("CALL mg.info() YIELD key, value RETURN key, value")
        info = {r["key"]: r["value"] for r in result}

        # Get node/edge counts
        counts = execute_query(
            "MATCH (n) OPTIONAL MATCH ()-[r]->() "
            "RETURN count(DISTINCT n) as nodes, count(DISTINCT r) as edges"
        )

        return {
            **base_info,
            "status": "connected",
            "version": info.get("version", "unknown"),
            "storage_mode": info.get("storage_mode", "unknown"),
            "node_count": counts[0]["nodes"] if counts else 0,
            "edge_count": counts[0]["edges"] if counts else 0,
        }
    except Exception as e:
        return {
            **base_info,
            "status": "error",
            "error": str(e),
        }
