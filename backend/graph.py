"""
graph.py
--------
Knowledge Graph layer for the AI knowledge assistant.

Responsibilities:
- Build a lightweight knowledge graph from document chunks.
- Store entities/concepts as graph nodes.
- Store relationships between nodes as graph edges.
- Keep graph data isolated between users.
- Associate graph data with the source document and chunk.
- Provide functions for creating, retrieving, and deleting graph data.

Architecture:

    Uploaded File
         ↓
      chunks.py
         ↓
       graph.py
         ↓
    Graph Nodes + Edges
         ↓
    Future query processing

Important:
- This file does NOT perform vector search.
- This file does NOT generate the final AI response.
- This file does NOT handle authentication.
- Vector embeddings remain the responsibility of the vector layer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.collection import Collection

from database import db, to_object_id


# ============================================================
# Collections
# ============================================================

graph_nodes: Collection = db["knowledge_graph_nodes"]
graph_edges: Collection = db["knowledge_graph_edges"]


# ============================================================
# Utility
# ============================================================

def utc_now() -> datetime:
    """
    Return the current UTC time.
    """
    return datetime.now(timezone.utc)


# ============================================================
# Database Initialization
# ============================================================

def init_graph_db() -> None:
    """
    Create indexes required by the knowledge graph.

    MongoDB creates the collections automatically when data is
    inserted, so only indexes are required here.
    """

    # --------------------------------------------------------
    # Graph Nodes
    # --------------------------------------------------------

    graph_nodes.create_index(
        [
            ("user_id", ASCENDING),
            ("source_id", ASCENDING),
        ]
    )

    graph_nodes.create_index(
        [
            ("user_id", ASCENDING),
            ("name", ASCENDING),
        ]
    )

    graph_nodes.create_index(
        [
            ("user_id", ASCENDING),
            ("node_type", ASCENDING),
        ]
    )

    # Prevent duplicate entities with the same name/type
    # inside the same user's graph.
    graph_nodes.create_index(
        [
            ("user_id", ASCENDING),
            ("name_normalized", ASCENDING),
            ("node_type", ASCENDING),
        ],
        unique=True,
    )

    # --------------------------------------------------------
    # Graph Edges
    # --------------------------------------------------------

    graph_edges.create_index(
        [
            ("user_id", ASCENDING),
            ("source_node_id", ASCENDING),
        ]
    )

    graph_edges.create_index(
        [
            ("user_id", ASCENDING),
            ("target_node_id", ASCENDING),
        ]
    )

    graph_edges.create_index(
        [
            ("user_id", ASCENDING),
            ("relationship", ASCENDING),
        ]
    )

    graph_edges.create_index(
        [
            ("user_id", ASCENDING),
            ("source_node_id", ASCENDING),
            ("target_node_id", ASCENDING),
            ("relationship", ASCENDING),
        ],
        unique=True,
    )


# ============================================================
# Node Helpers
# ============================================================

def normalize_node_name(name: str) -> str:
    """
    Normalize a graph node name for comparison and deduplication.
    """

    return " ".join(
        name.strip().lower().split()
    )


def create_node(
    user_id: str,
    name: str,
    node_type: str = "concept",
    source_id: Optional[str] = None,
    chunk_id: Optional[str] = None,
    properties: Optional[dict[str, Any]] = None,
) -> str:
    """
    Create a knowledge graph node.

    Parameters
    ----------
    user_id:
        Owner of the graph node.

    name:
        Human-readable entity/concept name.

    node_type:
        Type of node.

        Examples:
        - person
        - organization
        - product
        - location
        - concept
        - technology
        - event

    source_id:
        Document from which the node originated.

    chunk_id:
        Chunk from which the node originated.

    properties:
        Additional structured information.
    """

    name = name.strip()

    if not name:
        raise ValueError(
            "Graph node name cannot be empty."
        )

    node_type = node_type.strip().lower()

    if not node_type:
        node_type = "concept"

    document = {
        "user_id": to_object_id(user_id),
        "name": name,
        "name_normalized": normalize_node_name(name),
        "node_type": node_type,
        "source_id": (
            to_object_id(source_id)
            if source_id
            else None
        ),
        "chunk_id": (
            to_object_id(chunk_id)
            if chunk_id
            else None
        ),
        "properties": properties or {},
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }

    # --------------------------------------------------------
    # Check for an existing node.
    # --------------------------------------------------------

    existing = graph_nodes.find_one(
        {
            "user_id": to_object_id(user_id),
            "name_normalized": document[
                "name_normalized"
            ],
            "node_type": node_type,
        }
    )

    if existing:
        return str(existing["_id"])

    result = graph_nodes.insert_one(
        document
    )

    return str(result.inserted_id)


# ============================================================
# Get Node
# ============================================================

def get_node(
    node_id: str,
    user_id: str,
) -> Optional[dict[str, Any]]:
    """
    Retrieve a graph node belonging to a specific user.
    """

    node = graph_nodes.find_one(
        {
            "_id": to_object_id(node_id),
            "user_id": to_object_id(user_id),
        }
    )

    if node is None:
        return None

    return _serialize_node(node)


# ============================================================
# Find Node
# ============================================================

def find_node(
    user_id: str,
    name: str,
    node_type: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Find a graph node by name.

    Search is always restricted to the requesting user.
    """

    query: dict[str, Any] = {
        "user_id": to_object_id(user_id),
        "name_normalized": normalize_node_name(name),
    }

    if node_type:
        query["node_type"] = node_type.strip().lower()

    node = graph_nodes.find_one(
        query
    )

    if node is None:
        return None

    return _serialize_node(node)


# ============================================================
# List User Nodes
# ============================================================

def get_user_nodes(
    user_id: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Return graph nodes belonging to a specific user.
    """

    limit = max(1, min(limit, 1000))

    nodes = graph_nodes.find(
        {
            "user_id": to_object_id(user_id),
        }
    ).sort(
        "created_at",
        DESCENDING,
    ).limit(limit)

    return [
        _serialize_node(node)
        for node in nodes
    ]


# ============================================================
# Edge Helpers
# ============================================================

def create_edge(
    user_id: str,
    source_node_id: str,
    target_node_id: str,
    relationship: str,
    source_id: Optional[str] = None,
    chunk_id: Optional[str] = None,
    properties: Optional[dict[str, Any]] = None,
) -> str:
    """
    Create a relationship between two graph nodes.

    Example:

        Apple --develops--> iPhone

    source_node_id:
        Apple

    target_node_id:
        iPhone

    relationship:
        develops
    """

    relationship = relationship.strip().lower()

    if not relationship:
        raise ValueError(
            "Graph relationship cannot be empty."
        )

    user_object_id = to_object_id(
        user_id
    )

    source_object_id = to_object_id(
        source_node_id
    )

    target_object_id = to_object_id(
        target_node_id
    )

    # --------------------------------------------------------
    # Verify both nodes belong to the same user.
    # --------------------------------------------------------

    node_count = graph_nodes.count_documents(
        {
            "_id": {
                "$in": [
                    source_object_id,
                    target_object_id,
                ]
            },
            "user_id": user_object_id,
        }
    )

    if node_count != 2:
        raise ValueError(
            "Both graph nodes must belong to the user."
        )

    # --------------------------------------------------------
    # Prevent self relationships.
    # --------------------------------------------------------

    if source_object_id == target_object_id:
        raise ValueError(
            "A graph node cannot have a relationship with itself."
        )

    # --------------------------------------------------------
    # Check existing relationship.
    # --------------------------------------------------------

    existing = graph_edges.find_one(
        {
            "user_id": user_object_id,
            "source_node_id": source_object_id,
            "target_node_id": target_object_id,
            "relationship": relationship,
        }
    )

    if existing:
        return str(existing["_id"])

    document = {
        "user_id": user_object_id,
        "source_node_id": source_object_id,
        "target_node_id": target_object_id,
        "relationship": relationship,
        "source_id": (
            to_object_id(source_id)
            if source_id
            else None
        ),
        "chunk_id": (
            to_object_id(chunk_id)
            if chunk_id
            else None
        ),
        "properties": properties or {},
        "created_at": utc_now(),
    }

    result = graph_edges.insert_one(
        document
    )

    return str(result.inserted_id)


# ============================================================
# Get Edge
# ============================================================

def get_edge(
    edge_id: str,
    user_id: str,
) -> Optional[dict[str, Any]]:
    """
    Retrieve an edge belonging to a specific user.
    """

    edge = graph_edges.find_one(
        {
            "_id": to_object_id(edge_id),
            "user_id": to_object_id(user_id),
        }
    )

    if edge is None:
        return None

    return _serialize_edge(edge)


# ============================================================
# Get Node Relationships
# ============================================================

def get_node_relationships(
    node_id: str,
    user_id: str,
) -> list[dict[str, Any]]:
    """
    Return all relationships connected to a graph node.

    Both incoming and outgoing relationships are returned.
    """

    node_object_id = to_object_id(
        node_id
    )

    user_object_id = to_object_id(
        user_id
    )

    edges = graph_edges.find(
        {
            "user_id": user_object_id,
            "$or": [
                {
                    "source_node_id": node_object_id,
                },
                {
                    "target_node_id": node_object_id,
                },
            ],
        }
    )

    return [
        _serialize_edge(edge)
        for edge in edges
    ]


# ============================================================
# Get User Graph
# ============================================================

def get_user_graph(
    user_id: str,
    node_limit: int = 500,
    edge_limit: int = 1000,
) -> dict[str, list[dict[str, Any]]]:
    """
    Return a user's knowledge graph.

    Returns:

        {
            "nodes": [...],
            "edges": [...]
        }
    """

    user_object_id = to_object_id(
        user_id
    )

    node_limit = max(
        1,
        min(node_limit, 5000),
    )

    edge_limit = max(
        1,
        min(edge_limit, 10000),
    )

    nodes = graph_nodes.find(
        {
            "user_id": user_object_id,
        }
    ).limit(node_limit)

    edges = graph_edges.find(
        {
            "user_id": user_object_id,
        }
    ).limit(edge_limit)

    return {
        "nodes": [
            _serialize_node(node)
            for node in nodes
        ],
        "edges": [
            _serialize_edge(edge)
            for edge in edges
        ],
    }


# ============================================================
# Delete Source Graph
# ============================================================

def delete_source_graph(
    source_id: str,
    user_id: str,
) -> dict[str, int]:
    """
    Delete graph data generated from a specific document.

    Only graph data belonging to the requesting user is deleted.
    """

    source_object_id = to_object_id(
        source_id
    )

    user_object_id = to_object_id(
        user_id
    )

    # --------------------------------------------------------
    # Find nodes belonging to the source.
    # --------------------------------------------------------

    nodes = list(
        graph_nodes.find(
            {
                "user_id": user_object_id,
                "source_id": source_object_id,
            },
            {
                "_id": 1,
            },
        )
    )

    node_ids = [
        node["_id"]
        for node in nodes
    ]

    # --------------------------------------------------------
    # Delete edges connected to those nodes.
    # --------------------------------------------------------

    deleted_edges = 0

    if node_ids:
        edge_result = graph_edges.delete_many(
            {
                "user_id": user_object_id,
                "$or": [
                    {
                        "source_node_id": {
                            "$in": node_ids,
                        }
                    },
                    {
                        "target_node_id": {
                            "$in": node_ids,
                        }
                    },
                ],
            }
        )

        deleted_edges = edge_result.deleted_count

    # --------------------------------------------------------
    # Delete nodes.
    # --------------------------------------------------------

    node_result = graph_nodes.delete_many(
        {
            "user_id": user_object_id,
            "source_id": source_object_id,
        }
    )

    return {
        "nodes_deleted": node_result.deleted_count,
        "edges_deleted": deleted_edges,
    }


# ============================================================
# Delete User Graph
# ============================================================

def delete_user_graph(
    user_id: str,
) -> dict[str, int]:
    """
    Delete the complete knowledge graph of a user.
    """

    user_object_id = to_object_id(
        user_id
    )

    edge_result = graph_edges.delete_many(
        {
            "user_id": user_object_id,
        }
    )

    node_result = graph_nodes.delete_many(
        {
            "user_id": user_object_id,
        }
    )

    return {
        "nodes_deleted": node_result.deleted_count,
        "edges_deleted": edge_result.deleted_count,
    }


# ============================================================
# Serialization
# ============================================================

def _serialize_node(
    node: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert a MongoDB graph node into a JSON-friendly dictionary.
    """

    return {
        "id": str(node["_id"]),
        "user_id": str(node["user_id"]),
        "name": node["name"],
        "node_type": node["node_type"],
        "source_id": (
            str(node["source_id"])
            if node.get("source_id")
            else None
        ),
        "chunk_id": (
            str(node["chunk_id"])
            if node.get("chunk_id")
            else None
        ),
        "properties": node.get(
            "properties",
            {},
        ),
        "created_at": (
            node["created_at"].isoformat()
            if node.get("created_at")
            else None
        ),
        "updated_at": (
            node["updated_at"].isoformat()
            if node.get("updated_at")
            else None
        ),
    }


def _serialize_edge(
    edge: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert a MongoDB graph edge into a JSON-friendly dictionary.
    """

    return {
        "id": str(edge["_id"]),
        "user_id": str(edge["user_id"]),
        "source_node_id": str(
            edge["source_node_id"]
        ),
        "target_node_id": str(
            edge["target_node_id"]
        ),
        "relationship": edge["relationship"],
        "source_id": (
            str(edge["source_id"])
            if edge.get("source_id")
            else None
        ),
        "chunk_id": (
            str(edge["chunk_id"])
            if edge.get("chunk_id")
            else None
        ),
        "properties": edge.get(
            "properties",
            {},
        ),
        "created_at": (
            edge["created_at"].isoformat()
            if edge.get("created_at")
            else None
        ),
    }


# ============================================================
# Initialize Graph Database
# ============================================================

init_graph_db()