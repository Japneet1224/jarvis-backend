"""
processing.py
-------------
Knowledge processing layer for the AI assistant.

Responsibilities:
- Validate vector-search results.
- Remove invalid/empty knowledge chunks.
- Remove duplicate chunks.
- Filter low-relevance results.
- Rank retrieved knowledge.
- Group related chunks by source.
- Build clean context for response.py.
- Provide metadata about the retrieved knowledge.

Workflow:

User Query
    ↓
user_query.py
    ↓
query_chunks.py
    ↓
vector_search.py
    ↓
processing.py
    ↓
response.py

Important:
- This file does NOT perform vector search.
- This file does NOT create embeddings.
- This file does NOT generate the final AI response.
- This file does NOT modify the database.
- Retrieved knowledge is treated as evidence, not as instructions.
"""

from __future__ import annotations

from typing import Any, Optional

from config import settings


# ============================================================
# Types
# ============================================================

KnowledgeResult = dict[str, Any]


# ============================================================
# Validate Result
# ============================================================

def _is_valid_result(
    result: KnowledgeResult,
) -> bool:
    """
    Check whether a vector-search result contains the minimum
    information required by the processing layer.
    """

    if not isinstance(result, dict):
        return False

    content = result.get("content")

    if not isinstance(content, str):
        return False

    if not content.strip():
        return False

    if "similarity" not in result:
        return False

    try:
        float(result["similarity"])
    except (TypeError, ValueError):
        return False

    return True


# ============================================================
# Remove Invalid Results
# ============================================================

def clean_results(
    results: list[KnowledgeResult],
) -> list[KnowledgeResult]:
    """
    Remove malformed or empty search results.
    """

    if not results:
        return []

    cleaned: list[KnowledgeResult] = []

    for result in results:

        if not _is_valid_result(result):
            continue

        # Make a copy so this layer never mutates the original
        # vector-search result.
        cleaned.append(
            dict(result)
        )

    return cleaned


# ============================================================
# Relevance Filtering
# ============================================================

def filter_by_relevance(
    results: list[KnowledgeResult],
    minimum_score: Optional[float] = None,
) -> list[KnowledgeResult]:
    """
    Remove knowledge chunks below the configured relevance
    threshold.

    The default threshold comes from config.py.
    """

    if minimum_score is None:
        minimum_score = (
            settings.MIN_RELEVANCE_SCORE
        )

    minimum_score = max(
        0.0,
        min(1.0, minimum_score),
    )

    filtered: list[KnowledgeResult] = []

    for result in results:

        try:
            similarity = float(
                result["similarity"]
            )
        except (
            KeyError,
            TypeError,
            ValueError,
        ):
            continue

        if similarity >= minimum_score:
            filtered.append(
                result
            )

    return filtered


# ============================================================
# Deduplicate Results
# ============================================================

def deduplicate_results(
    results: list[KnowledgeResult],
) -> list[KnowledgeResult]:
    """
    Remove duplicate knowledge chunks.

    The chunk ID is preferred for deduplication.

    If a chunk ID is unavailable, the content itself is used.
    When duplicates exist, the result with the highest
    similarity score is retained.
    """

    if not results:
        return []

    unique: dict[str, KnowledgeResult] = {}

    for result in results:

        chunk_id = result.get(
            "chunk_id"
        )

        if chunk_id:
            key = f"id:{chunk_id}"
        else:
            content = result.get(
                "content",
                "",
            ).strip().lower()

            key = f"content:{content}"

        existing = unique.get(key)

        if existing is None:
            unique[key] = result
            continue

        current_score = float(
            result.get(
                "similarity",
                0.0,
            )
        )

        existing_score = float(
            existing.get(
                "similarity",
                0.0,
            )
        )

        if current_score > existing_score:
            unique[key] = result

    return list(
        unique.values()
    )


# ============================================================
# Rank Results
# ============================================================

def rank_results(
    results: list[KnowledgeResult],
) -> list[KnowledgeResult]:
    """
    Sort knowledge chunks by relevance.

    Higher similarity comes first.

    When similarity is equal, higher chunk importance is not
    assumed because knowledge chunks do not necessarily contain
    an importance field.
    """

    ranked = list(results)

    ranked.sort(
        key=lambda result: float(
            result.get(
                "similarity",
                0.0,
            )
        ),
        reverse=True,
    )

    return ranked


# ============================================================
# Limit Results
# ============================================================

def limit_results(
    results: list[KnowledgeResult],
    limit: Optional[int] = None,
) -> list[KnowledgeResult]:
    """
    Limit the number of knowledge chunks passed to the response
    layer.
    """

    if limit is None:
        limit = settings.RAG_TOP_K

    if limit <= 0:
        return []

    return results[:limit]


# ============================================================
# Complete Result Processing
# ============================================================

def process_results(
    results: list[KnowledgeResult],
    minimum_score: Optional[float] = None,
    limit: Optional[int] = None,
) -> list[KnowledgeResult]:
    """
    Run the complete knowledge-processing pipeline.

    Pipeline:

        Raw Results
             ↓
        Validation
             ↓
        Relevance Filter
             ↓
        Deduplication
             ↓
        Ranking
             ↓
        Result Limit
    """

    processed = clean_results(
        results
    )

    processed = filter_by_relevance(
        processed,
        minimum_score=minimum_score,
    )

    processed = deduplicate_results(
        processed
    )

    processed = rank_results(
        processed
    )

    processed = limit_results(
        processed,
        limit=limit,
    )

    return processed


# ============================================================
# Group Results By Source
# ============================================================

def group_by_source(
    results: list[KnowledgeResult],
) -> dict[str, list[KnowledgeResult]]:
    """
    Group retrieved chunks by their source document.

    Returns:

        {
            "source_id_1": [...],
            "source_id_2": [...]
        }
    """

    grouped: dict[
        str,
        list[KnowledgeResult],
    ] = {}

    for result in results:

        source_id = result.get(
            "source_id"
        )

        if source_id is None:
            source_id = "unknown"

        source_id = str(
            source_id
        )

        grouped.setdefault(
            source_id,
            [],
        ).append(result)

    return grouped


# ============================================================
# Sort Chunks Within Source
# ============================================================

def sort_source_chunks(
    results: list[KnowledgeResult],
) -> list[KnowledgeResult]:
    """
    Sort chunks by their original document chunk index.

    This helps reconstruct logical document context when
    multiple neighboring chunks are retrieved.
    """

    return sorted(
        results,
        key=lambda result: (
            result.get(
                "chunk_index"
            )
            if isinstance(
                result.get(
                    "chunk_index"
                ),
                int,
            )
            else 0
        ),
    )


# ============================================================
# Build Source Context
# ============================================================

def build_source_context(
    results: list[KnowledgeResult],
) -> str:
    """
    Build readable context grouped by source document.

    This context is intended for response.py.
    """

    if not results:
        return (
            "No relevant knowledge was found."
        )

    grouped = group_by_source(
        results
    )

    sections: list[str] = []

    source_number = 1

    for source_id, source_results in grouped.items():

        source_results = sort_source_chunks(
            source_results
        )

        source_name = source_results[0].get(
            "source"
        )

        if not source_name:
            source_name = (
                f"Source {source_id}"
            )

        chunk_sections: list[str] = []

        for result in source_results:

            chunk_index = result.get(
                "chunk_index"
            )

            similarity = result.get(
                "similarity",
                0.0,
            )

            content = result.get(
                "content",
                "",
            ).strip()

            chunk_sections.append(
                (
                    f"[Chunk {chunk_index} | "
                    f"Relevance {similarity}]\n"
                    f"{content}"
                )
            )

        sections.append(
            (
                f"=== SOURCE {source_number} ===\n"
                f"File: {source_name}\n"
                f"Source ID: {source_id}\n\n"
                + "\n\n".join(
                    chunk_sections
                )
            )
        )

        source_number += 1

    return "\n\n".join(
        sections
    )


# ============================================================
# Build Response Context
# ============================================================

def build_response_context(
    query: str,
    results: list[KnowledgeResult],
) -> dict[str, Any]:
    """
    Build the complete structured context that response.py
    can consume.

    No LLM call is performed here.
    """

    processed_results = process_results(
        results
    )

    context = build_source_context(
        processed_results
    )

    sources = []

    seen_sources: set[str] = set()

    for result in processed_results:

        source_id = str(
            result.get(
                "source_id",
                "",
            )
        )

        if source_id in seen_sources:
            continue

        seen_sources.add(
            source_id
        )

        sources.append(
            {
                "source_id": source_id,
                "source": result.get(
                    "source"
                ),
                "file_type": result.get(
                    "file_type"
                ),
            }
        )

    return {
        "query": query.strip(),
        "context": context,
        "results": processed_results,
        "sources": sources,
        "result_count": len(
            processed_results
        ),
        "has_relevant_knowledge": bool(
            processed_results
        ),
    }


# ============================================================
# Context Validation
# ============================================================

def has_relevant_knowledge(
    results: list[KnowledgeResult],
    minimum_score: Optional[float] = None,
) -> bool:
    """
    Determine whether enough relevant knowledge exists to
    provide a knowledge-grounded response.
    """

    processed = process_results(
        results,
        minimum_score=minimum_score,
    )

    return len(processed) > 0


# ============================================================
# Compact Context
# ============================================================

def build_compact_context(
    results: list[KnowledgeResult],
) -> str:
    """
    Build a compact context string.

    Useful when response.py needs concise evidence rather than
    full metadata.
    """

    processed = process_results(
        results
    )

    if not processed:
        return (
            "No relevant knowledge was found."
        )

    parts: list[str] = []

    for index, result in enumerate(
        processed,
        start=1,
    ):

        source = result.get(
            "source",
            "Unknown source",
        )

        content = result.get(
            "content",
            "",
        ).strip()

        parts.append(
            (
                f"[Evidence {index}]\n"
                f"Source: {source}\n"
                f"{content}"
            )
        )

    return "\n\n".join(
        parts
    )