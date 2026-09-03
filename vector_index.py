"""
vector_index.py
---------------
MongoDB Atlas Vector Search layer for the AI knowledge assistant.

Responsibilities:
- Create the Atlas Vector Search index definition.
- Store/configure vector-search settings.
- Provide vector-search functionality for knowledge chunks.
- Restrict searches to the current user.
- Apply similarity/relevance filtering.
- Return clean search results for the processing layer.

Architecture:

    chunks.py
        ↓
    Embedded Knowledge Chunks
        ↓
    MongoDB knowledge_chunks
        ↓
    MongoDB Atlas Vector Search
        ↓
    vector_index.py
        ↓
    Relevant Knowledge
        ↓
    Future processing.py

Important:
- Embeddings are created by chunks.py.
- MongoDB Atlas performs the vector indexing/search.
- This file does NOT create embeddings.
- This file does NOT generate AI responses.
- This file does NOT handle authentication.
- This file does NOT perform knowledge-graph extraction.
"""

from __future__ import annotations

from typing import Any, Optional

from pymongo.collection import Collection

from config import settings
from database import knowledge_chunks, to_object_id


# ============================================================
# Configuration
# ============================================================

VECTOR_INDEX_NAME = settings.VECTOR_INDEX_NAME
VECTOR_FIELD_NAME = settings.VECTOR_FIELD_NAME

VECTOR_DIMENSIONS = settings.EMBEDDING_DIMENSIONS
VECTOR_NUM_CANDIDATES = settings.VECTOR_NUM_CANDIDATES


# ============================================================
# Vector Index Definition
# ============================================================

def get_vector_index_definition() -> dict[str, Any]:
    """
    Return the MongoDB Atlas Vector Search index definition.

    This definition is intended to be used when creating the
    Vector Search index in MongoDB Atlas.

    The embedding field is configured as a vector with the
    dimensions and similarity metric defined by the application.
    """

    return {
        "name": VECTOR_INDEX_NAME,
        "type": "vectorSearch",
        "definition": {
            "fields": [
                {
                    "type": "vector",
                    "path": VECTOR_FIELD_NAME,
                    "numDimensions": VECTOR_DIMENSIONS,
                    "similarity": "cosine",
                },
                {
                    "type": "filter",
                    "path": "user_id",
                },
                {
                    "type": "filter",
                    "path": "source_id",
                },
            ]
        },
    }


# ============================================================
# Index Information
# ============================================================

def get_vector_index_name() -> str:
    """
    Return the configured Atlas Vector Search index name.
    """

    return VECTOR_INDEX_NAME


def get_vector_field_name() -> str:
    """
    Return the MongoDB field containing embeddings.
    """

    return VECTOR_FIELD_NAME


def get_vector_dimensions() -> int:
    """
    Return the configured embedding dimensions.
    """

    return VECTOR_DIMENSIONS


# ============================================================
# Validate Embedding
# ============================================================

def validate_embedding(
    embedding: list[float],
) -> None:
    """
    Validate an embedding before it is used for vector search.

    Raises:
        ValueError:
            If the embedding is empty or has the wrong
            dimensionality.
    """

    if not embedding:
        raise ValueError(
            "Embedding cannot be empty."
        )

    if len(embedding) != VECTOR_DIMENSIONS:
        raise ValueError(
            "Invalid embedding dimensions. "
            f"Expected {VECTOR_DIMENSIONS}, "
            f"received {len(embedding)}."
        )


# ============================================================
# Vector Search
# ============================================================

def search_vectors(
    query_embedding: list[float],
    user_id: str,
    top_k: Optional[int] = None,
    num_candidates: Optional[int] = None,
    source_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Search knowledge chunks using MongoDB Atlas Vector Search.

    Parameters
    ----------
    query_embedding:
        Embedding vector for the user's query.

    user_id:
        Current authenticated user's ID.

    top_k:
        Maximum number of results to return.

    num_candidates:
        Number of candidates considered by Atlas Vector Search.

    source_id:
        Optional document restriction.

    Returns
    -------
    list[dict[str, Any]]
        Relevant knowledge chunks with similarity scores.
    """

    validate_embedding(
        query_embedding
    )

    user_object_id = to_object_id(
        user_id
    )

    if top_k is None:
        top_k = settings.RAG_TOP_K

    if top_k <= 0:
        return []

    if num_candidates is None:
        num_candidates = VECTOR_NUM_CANDIDATES

    if num_candidates < top_k:
        num_candidates = top_k

    # --------------------------------------------------------
    # User isolation filter
    # --------------------------------------------------------

    vector_filter: dict[str, Any] = {
        "user_id": user_object_id,
    }

    # --------------------------------------------------------
    # Optional source restriction
    # --------------------------------------------------------

    if source_id is not None:
        vector_filter["source_id"] = to_object_id(
            source_id
        )

    # --------------------------------------------------------
    # MongoDB Atlas Vector Search pipeline
    # --------------------------------------------------------

    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path": VECTOR_FIELD_NAME,
                "queryVector": query_embedding,
                "numCandidates": num_candidates,
                "limit": top_k,
                "filter": vector_filter,
            }
        },
        {
            "$set": {
                "similarity": {
                    "$meta": "vectorSearchScore"
                }
            }
        },
        {
            "$project": {
                "_id": 1,
                "user_id": 1,
                "source_id": 1,
                "chunk_index": 1,
                "content": 1,
                "metadata": 1,
                "created_at": 1,
                "similarity": 1,
            }
        },
    ]

    results = knowledge_chunks.aggregate(
        pipeline
    )

    retrieved: list[dict[str, Any]] = []

    for result in results:
        similarity = float(
            result.get(
                "similarity",
                0.0,
            )
        )

        # ----------------------------------------------------
        # Relevance threshold
        # ----------------------------------------------------

        if (
            similarity
            < settings.MIN_RELEVANCE_SCORE
        ):
            continue

        retrieved.append(
            {
                "chunk_id": str(
                    result["_id"]
                ),
                "user_id": str(
                    result["user_id"]
                ),
                "source_id": str(
                    result["source_id"]
                ),
                "chunk_index": result.get(
                    "chunk_index"
                ),
                "content": result.get(
                    "content",
                    "",
                ),
                "metadata": result.get(
                    "metadata",
                    {},
                ),
                "similarity": round(
                    similarity,
                    4,
                ),
                "created_at": (
                    result["created_at"].isoformat()
                    if result.get("created_at")
                    else None
                ),
            }
        )

    return retrieved


# ============================================================
# Search Entire User Knowledge Base
# ============================================================

def search_user_knowledge(
    query_embedding: list[float],
    user_id: str,
    top_k: Optional[int] = None,
    num_candidates: Optional[int] = None,
) -> list[dict[str, Any]]:
    """
    Search all vector-indexed knowledge belonging to a user.
    """

    return search_vectors(
        query_embedding=query_embedding,
        user_id=user_id,
        top_k=top_k,
        num_candidates=num_candidates,
    )


# ============================================================
# Search Specific Document
# ============================================================

def search_source(
    query_embedding: list[float],
    source_id: str,
    user_id: str,
    top_k: Optional[int] = None,
    num_candidates: Optional[int] = None,
) -> list[dict[str, Any]]:
    """
    Search vector-indexed chunks from one specific document.

    The source must belong to the requesting user.
    """

    return search_vectors(
        query_embedding=query_embedding,
        user_id=user_id,
        source_id=source_id,
        top_k=top_k,
        num_candidates=num_candidates,
    )


# ============================================================
# Get Vector Search Statistics
# ============================================================

def get_vector_statistics(
    user_id: str,
) -> dict[str, int]:
    """
    Return basic vector-search statistics for a user.

    This does not query Atlas index internals. It reports the
    number of chunks stored for the user and how many contain
    embeddings.
    """

    user_object_id = to_object_id(
        user_id
    )

    total_chunks = knowledge_chunks.count_documents(
        {
            "user_id": user_object_id,
        }
    )

    embedded_chunks = knowledge_chunks.count_documents(
        {
            "user_id": user_object_id,
            VECTOR_FIELD_NAME: {
                "$exists": True,
                "$ne": None,
            },
        }
    )

    return {
        "total_chunks": total_chunks,
        "embedded_chunks": embedded_chunks,
        "chunks_without_embeddings": (
            total_chunks - embedded_chunks
        ),
    }


# ============================================================
# Verify Vector Data
# ============================================================

def has_embedding(
    chunk_id: str,
    user_id: str,
) -> bool:
    """
    Check whether a specific user's chunk has an embedding.
    """

    chunk = knowledge_chunks.find_one(
        {
            "_id": to_object_id(chunk_id),
            "user_id": to_object_id(user_id),
            VECTOR_FIELD_NAME: {
                "$exists": True,
                "$ne": None,
            },
        },
        {
            "_id": 1,
        },
    )

    return chunk is not None