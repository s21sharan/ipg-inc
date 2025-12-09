"""
Graph database router for Memgraph operations.

Provides endpoints for:
- Query execution
- Schema management
- Graph statistics
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.memgraph import execute_query, execute_write, health_check


router = APIRouter()


class CypherQuery(BaseModel):
    """Request model for Cypher query execution."""

    query: str
    parameters: dict | None = None


class CypherQueryResponse(BaseModel):
    """Response model for query results."""

    success: bool
    data: list[dict] | None = None
    error: str | None = None


class WriteResponse(BaseModel):
    """Response model for write operations."""

    success: bool
    summary: dict | None = None
    error: str | None = None


@router.get("/stats")
async def graph_stats():
    """Get graph statistics (node/edge counts, labels, etc.)."""
    try:
        # Get node labels and counts
        labels_result = execute_query(
            "MATCH (n) RETURN DISTINCT labels(n) as labels, count(*) as count"
        )

        # Get relationship types and counts
        rels_result = execute_query(
            "MATCH ()-[r]->() RETURN DISTINCT type(r) as type, count(*) as count"
        )

        # Get total counts
        totals = execute_query(
            "MATCH (n) OPTIONAL MATCH ()-[r]->() "
            "RETURN count(DISTINCT n) as nodes, count(DISTINCT r) as edges"
        )

        return {
            "total_nodes": totals[0]["nodes"] if totals else 0,
            "total_edges": totals[0]["edges"] if totals else 0,
            "node_labels": labels_result,
            "relationship_types": rels_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query", response_model=CypherQueryResponse)
async def run_query(request: CypherQuery):
    """
    Execute a read-only Cypher query.

    Use this for MATCH, RETURN, and other read operations.
    """
    try:
        # Basic safety check - block obvious write operations
        query_upper = request.query.upper().strip()
        write_keywords = ["CREATE", "MERGE", "DELETE", "SET", "REMOVE", "DETACH"]
        if any(query_upper.startswith(kw) for kw in write_keywords):
            return CypherQueryResponse(
                success=False,
                error="Write operations not allowed via /query endpoint. Use /write instead.",
            )

        data = execute_query(request.query, request.parameters)
        return CypherQueryResponse(success=True, data=data)
    except Exception as e:
        return CypherQueryResponse(success=False, error=str(e))


@router.post("/write", response_model=WriteResponse)
async def run_write(request: CypherQuery):
    """
    Execute a write Cypher query (CREATE, MERGE, DELETE, etc.).

    Returns summary of changes made.
    """
    try:
        summary = execute_write(request.query, request.parameters)
        return WriteResponse(success=True, summary=summary)
    except Exception as e:
        return WriteResponse(success=False, error=str(e))


@router.delete("/clear")
async def clear_graph():
    """
    Clear all nodes and relationships from the graph.

    WARNING: This is destructive and cannot be undone!
    """
    try:
        summary = execute_write("MATCH (n) DETACH DELETE n")
        return {
            "success": True,
            "message": "Graph cleared",
            "deleted_nodes": summary["nodes_deleted"],
            "deleted_relationships": summary["relationships_deleted"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schema")
async def get_schema():
    """Get graph schema (node labels and relationship types with properties)."""
    try:
        # Get node schema
        node_schema = execute_query(
            """
            MATCH (n)
            WITH DISTINCT labels(n) as labels, keys(n) as properties
            RETURN labels, collect(DISTINCT properties) as all_properties
            """
        )

        # Get relationship schema
        rel_schema = execute_query(
            """
            MATCH ()-[r]->()
            WITH DISTINCT type(r) as type, keys(r) as properties
            RETURN type, collect(DISTINCT properties) as all_properties
            """
        )

        return {
            "nodes": node_schema,
            "relationships": rel_schema,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
