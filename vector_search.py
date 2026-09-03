"""
vector_search.py
----------------
Knowledge retrieval and embedding layer.

Responsibilities:
- Create algorithmic embeddings (TF-IDF).
- Ensure uploaded knowledge is processed.
- Ensure document chunks have embeddings.
- Search MongoDB Atlas Vector Search.
- Fall back to lexical retrieval when Atlas Vector Search
  is unavailable.
- Keep results isolated to the authenticated user.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

from config import settings
from database import (
    knowledge_chunks,
    knowledge_sources,
    to_object_id,
)
from query_chunks import create_query_chunks
from embeddings import get_embedding, get_embeddings_batch
from advanced_query import process_query_advanced


# ============================================================
# Normalize Embedding
# ============================================================

def _normalize_embedding(
    embedding: list[float],
) -> list[float]:
    """L2-normalize an embedding vector."""

    norm = math.sqrt(
        sum(value * value for value in embedding)
    )

    if norm == 0:
        return embedding

    return [value / norm for value in embedding]


# ============================================================
# Create Single Embedding
# ============================================================

def create_query_embedding(
    query: str,
    task_type: str = "RETRIEVAL_QUERY",
) -> list[float]:

    query = query.strip()

    if not query:
        raise ValueError(
            "Query cannot be empty."
        )

    embedding = get_embedding(query)

    if not embedding:
        raise RuntimeError(
            "Failed to generate embedding locally."
        )

    embedding = _normalize_embedding(embedding)

    return embedding


# ============================================================
# Create Batch Embeddings
# ============================================================

def create_query_embeddings(
    queries: list[str],
    task_type: str = "RETRIEVAL_DOCUMENT",
) -> list[list[float]]:

    if not queries:
        return []

    cleaned = [
        query.strip()
        for query in queries
        if query and query.strip()
    ]

    if not cleaned:
        return []

    embeddings = get_embeddings_batch(cleaned)

    if not embeddings:
        raise RuntimeError(
            "Failed to generate embeddings locally."
        )

    return [
        _normalize_embedding(emb) if emb else []
        for emb in embeddings
    ]


# ============================================================
# Process Existing Sources
# ============================================================

def _ensure_sources_chunked(
    user_id: str,
) -> None:
    """
    Process uploaded files that have not yet been chunked.

    Older versions of upload.py only created the knowledge_sources
    record. This function repairs those existing uploads lazily.
    """

    from chunks import process_knowledge_source

    sources = list(
        knowledge_sources.find(
            {
                "user_id": user_id,
            },
            {
                "_id": 1,
                "filename": 1,
                "status": 1,
            },
        )
    )

    for source in sources:

        source_id = str(
            source["_id"]
        )

        chunk_count = knowledge_chunks.count_documents(
            {
                "user_id": to_object_id(user_id),
                "source_id": source["_id"],
            }
        )

        if chunk_count > 0:
            continue

        try:
            process_knowledge_source(
                source_id=source_id,
                user_id=user_id,
            )

            knowledge_sources.update_one(
                {
                    "_id": source["_id"],
                    "user_id": user_id,
                },
                {
                    "$set": {
                        "status": "chunked",
                    }
                },
            )

        except Exception as exc:
            knowledge_sources.update_one(
                {
                    "_id": source["_id"],
                    "user_id": user_id,
                },
                {
                    "$set": {
                        "status": "failed",
                        "processing_error": str(exc),
                    }
                },
            )


# ============================================================
# Ensure Chunk Embeddings
# ============================================================

def _ensure_chunk_embeddings(
    user_id: str,
) -> int:
    """
    Generate embeddings for all chunks belonging to the user
    that currently do not have embeddings.

    Returns:
        Number of chunks embedded.
    """

    missing = list(
        knowledge_chunks.find(
            {
                "user_id": to_object_id(user_id),
                "$or": [
                    {
                        "embedding": {
                            "$exists": False,
                        }
                    },
                    {
                        "embedding": None,
                    },
                    {
                        "embedding": [],
                    },
                ],
            },
            {
                "_id": 1,
                "content": 1,
            },
        )
    )

    if not missing:
        return 0

    total_embedded = 0

    batch_size = 64

    for start in range(
        0,
        len(missing),
        batch_size,
    ):

        batch = missing[
            start:start + batch_size
        ]

        texts = [
            str(item.get("content", "")).strip()
            for item in batch
        ]

        valid_items = [
            (item, text)
            for item, text in zip(
                batch,
                texts,
            )
            if text
        ]

        if not valid_items:
            continue

        embeddings = create_query_embeddings(
            [
                text
                for _, text in valid_items
            ]
        )

        for (item, _), embedding in zip(
            valid_items,
            embeddings,
        ):

            knowledge_chunks.update_one(
                {
                    "_id": item["_id"],
                    "user_id": to_object_id(user_id),
                },
                {
                    "$set": {
                        "embedding": embedding,
                    }
                },
            )

            total_embedded += 1

    return total_embedded


# ============================================================
# Ensure Knowledge Is Searchable
# ============================================================

def ensure_user_knowledge_ready(
    user_id: str,
) -> dict[str, int]:

    _ensure_sources_chunked(
        user_id=user_id,
    )

    embedded = _ensure_chunk_embeddings(
        user_id=user_id,
    )

    chunk_count = knowledge_chunks.count_documents(
        {
            "user_id": to_object_id(user_id),
        }
    )

    return {
        "chunks": chunk_count,
        "embedded": embedded,
    }


# ============================================================
# Convert Mongo Result
# ============================================================

def _serialize_result(
    result: dict[str, Any],
) -> dict[str, Any]:

    score = float(
        result.get(
            "similarity",
            result.get(
                "score",
                0.0,
            ),
        )
    )

    metadata = result.get(
        "metadata",
        {},
    )

    return {
        "chunk_id": str(
            result["_id"]
        ),
        "user_id": str(
            result.get(
                "user_id",
                "",
            )
        ),
        "source_id": str(
            result.get(
                "source_id",
                "",
            )
        ),
        "chunk_index": result.get(
            "chunk_index"
        ),
        "content": str(
            result.get(
                "content",
                "",
            )
        ),
        "metadata": metadata,
        "similarity": round(
            score,
            4,
        ),
        "source": metadata.get(
            "source_filename",
            "Uploaded knowledge",
        ),
        "created_at": (
            result["created_at"].isoformat()
            if result.get("created_at")
            else None
        ),
    }


# ============================================================
# Atlas Vector Search
# ============================================================

def search_vector_index(
    query_embedding: list[float],
    user_id: str,
    top_k: Optional[int] = None,
) -> list[dict[str, Any]]:

    if not query_embedding:
        return []

    if top_k is None:
        top_k = settings.RAG_TOP_K

    top_k = max(
        1,
        min(
            top_k,
            50,
        ),
    )

    pipeline = [
        {
            "$vectorSearch": {
                "index": settings.VECTOR_INDEX_NAME,
                "path": settings.VECTOR_FIELD_NAME,
                "queryVector": query_embedding,
                "numCandidates": max(
                    settings.VECTOR_NUM_CANDIDATES,
                    top_k * 10,
                ),
                "limit": top_k,
                "filter": {
                    "user_id": to_object_id(user_id),
                },
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
                "similarity": {
                    "$meta": "vectorSearchScore",
                },
            }
        },
    ]

    results = list(
        knowledge_chunks.aggregate(
            pipeline
        )
    )

    retrieved = []

    for result in results:

        serialized = _serialize_result(
            result
        )

        if (
            serialized["similarity"]
            >= settings.MIN_RELEVANCE_SCORE
        ):
            retrieved.append(
                serialized
            )

    return retrieved


# ============================================================
# Keyword Fallback
# ============================================================

def keyword_search(
    query: str,
    user_id: str,
    top_k: Optional[int] = None,
) -> list[dict[str, Any]]:
    """
    Fallback retrieval.

    This makes the assistant usable even when Atlas Vector Search
    is temporarily unavailable or the index is still building.
    """

    if top_k is None:
        top_k = settings.RAG_TOP_K

    query_words = {
        word.lower()
        for word in re.findall(
            r"\b[a-zA-Z0-9]{3,}\b",
            query,
        )
    }

    if not query_words:
        return []

    chunks = list(
        knowledge_chunks.find(
            {
                "user_id": to_object_id(user_id),
            },
            {
                "_id": 1,
                "user_id": 1,
                "source_id": 1,
                "chunk_index": 1,
                "content": 1,
                "metadata": 1,
                "created_at": 1,
            },
        )
    )

    scored = []

    for chunk in chunks:

        content = str(
            chunk.get(
                "content",
                "",
            )
        )

        content_words = {
            word.lower()
            for word in re.findall(
                r"\b[a-zA-Z0-9]{3,}\b",
                content,
            )
        }

        overlap = query_words.intersection(
            content_words
        )

        if not overlap:
            continue

        score = (
            len(overlap)
            / max(
                len(query_words),
                1,
            )
        )

        chunk["similarity"] = score

        scored.append(
            chunk
        )

    scored.sort(
        key=lambda item: item.get(
            "similarity",
            0.0,
        ),
        reverse=True,
    )

    return [
        _serialize_result(
            item
        )
        for item in scored[
            :top_k
        ]
    ]


# ============================================================
# Search One Query
# ============================================================

def search_query(
    query: str,
    user_id: str,
    top_k: Optional[int] = None,
) -> list[dict[str, Any]]:

    query = query.strip()

    if not query:
        raise ValueError(
            "Query cannot be empty."
        )

    ensure_user_knowledge_ready(
        user_id=user_id,
    )

    embedding = create_query_embedding(
        query
    )

    try:
        results = search_vector_index(
            query_embedding=embedding,
            user_id=user_id,
            top_k=top_k,
        )

        if results:
            return results

    except Exception as exc:
        print(
            "Atlas Vector Search failed; "
            f"using fallback retrieval: {exc}"
        )

    return keyword_search(
        query=query,
        user_id=user_id,
        top_k=top_k,
    )


# ============================================================
# Search Query Chunks
# ============================================================

def search_query_chunks(
    query: str,
    user_id: str,
    top_k: Optional[int] = None,
) -> list[dict[str, Any]]:
    """
    Advanced search using query processing and expansion.
    """

    query = query.strip()

    if not query:
        return []

    if top_k is None:
        top_k = settings.RAG_TOP_K

    print(f"[ADVANCED SEARCH] Query: {query}")

    # Process query with advanced techniques
    query_context = process_query_advanced(query)
    queries_to_search = query_context['expanded'][:3]  # Use top 3 variations

    print(f"[ADVANCED SEARCH] Expanded queries: {queries_to_search}")

    all_results = []
    seen_chunks = set()

    # Search with multiple query variations
    for search_query_str in queries_to_search:
        try:
            results = search_query(
                query=search_query_str,
                user_id=user_id,
                top_k=top_k,
            )

            for result in results:
                chunk_id = result.get('chunk_id')
                if chunk_id not in seen_chunks:
                    all_results.append(result)
                    seen_chunks.add(chunk_id)

        except Exception as exc:
            print(f"[ADVANCED SEARCH] Search variation failed: {exc}")
            continue

    # Deduplicate and rank
    if all_results:
        all_results.sort(
            key=lambda item: item.get("similarity", 0.0),
            reverse=True,
        )
        return all_results[:top_k]

    print("[ADVANCED SEARCH] No results found")
    return []


# ============================================================
# Retrieve Context
# ============================================================

def retrieve_context(
    query: str,
    user_id: str,
    top_k: Optional[int] = None,
) -> str:

    results = search_query_chunks(
        query=query,
        user_id=user_id,
        top_k=top_k,
    )

    if not results:
        return (
            "No relevant knowledge was found."
        )

    context_parts = []

    for index, result in enumerate(
        results,
        start=1,
    ):

        context_parts.append(
            "\n".join(
                [
                    f"[Knowledge {index}]",
                    f"Source: {result.get('source', 'Uploaded knowledge')}",
                    f"Relevance: {result.get('similarity', 0.0)}",
                    f"Content:",
                    result.get(
                        "content",
                        "",
                    ),
                ]
            )
        )

    return "\n\n".join(
        context_parts
    )


# ============================================================
# Health Check
# ============================================================

def vector_search_health_check() -> bool:

    try:
        knowledge_chunks.find_one(
            {},
            {
                "_id": 1,
            },
        )

        return True

    except Exception:
        return False