"""
query_chunks.py
----------------
Query chunking layer for the AI knowledge assistant.

Responsibilities:
- Receive a user's query.
- Validate and normalize the query.
- Split long or multi-part queries into searchable chunks.
- Preserve the original query.
- Keep query chunking independent from vector search.
- Prepare query chunks for vector_search.py.

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
- This file does NOT generate AI responses.
- Knowledge/document chunking belongs to chunks.py.
"""

from __future__ import annotations

import re
from typing import Any


# ============================================================
# Configuration
# ============================================================

DEFAULT_MAX_CHUNK_LENGTH = 500
MIN_CHUNK_LENGTH = 3


# ============================================================
# Normalize Query
# ============================================================

def normalize_query(query: str) -> str:
    """
    Normalize a user's query before chunking.

    Operations:
    - Remove leading/trailing whitespace.
    - Collapse repeated whitespace.
    - Preserve the actual meaning of the query.

    Parameters
    ----------
    query:
        User's original query.

    Returns
    -------
    str
        Normalized query.
    """

    if not isinstance(query, str):
        raise TypeError("Query must be a string.")

    query = query.strip()

    if not query:
        raise ValueError("Query cannot be empty.")

    # Collapse multiple spaces/newlines/tabs.
    query = re.sub(r"\s+", " ", query)

    return query


# ============================================================
# Sentence Splitting
# ============================================================

def _split_sentences(text: str) -> list[str]:
    """
    Split text into basic sentences.

    This is intentionally lightweight.

    More advanced semantic query decomposition can be added
    later without changing the public interface.
    """

    sentences = re.split(
        r"(?<=[.!?])\s+",
        text,
    )

    return [
        sentence.strip()
        for sentence in sentences
        if sentence.strip()
    ]


# ============================================================
# Query Chunking
# ============================================================

def chunk_query(
    query: str,
    max_chunk_length: int = DEFAULT_MAX_CHUNK_LENGTH,
) -> list[str]:
    """
    Split a user query into searchable chunks.

    Short queries remain as one chunk.

    Longer queries are first divided into sentences. If a
    sentence is still too long, it is divided into smaller
    word-based chunks.

    Parameters
    ----------
    query:
        User's original query.

    max_chunk_length:
        Maximum approximate character length of a query chunk.

    Returns
    -------
    list[str]
        Searchable query chunks.
    """

    query = normalize_query(query)

    if max_chunk_length < MIN_CHUNK_LENGTH:
        raise ValueError(
            f"max_chunk_length must be at least "
            f"{MIN_CHUNK_LENGTH}."
        )

    # --------------------------------------------------------
    # Short query
    # --------------------------------------------------------

    if len(query) <= max_chunk_length:
        return [query]

    # --------------------------------------------------------
    # First split by sentence
    # --------------------------------------------------------

    sentences = _split_sentences(query)

    if not sentences:
        return [query]

    chunks: list[str] = []
    current_chunk = ""

    for sentence in sentences:

        # ----------------------------------------------------
        # Sentence fits into the current chunk.
        # ----------------------------------------------------

        if len(sentence) <= max_chunk_length:

            if not current_chunk:
                current_chunk = sentence

            elif (
                len(current_chunk)
                + 1
                + len(sentence)
                <= max_chunk_length
            ):
                current_chunk = (
                    f"{current_chunk} {sentence}"
                )

            else:
                chunks.append(current_chunk)
                current_chunk = sentence

            continue

        # ----------------------------------------------------
        # Flush current chunk before processing a very
        # long sentence.
        # ----------------------------------------------------

        if current_chunk:
            chunks.append(current_chunk)
            current_chunk = ""

        # ----------------------------------------------------
        # Split very long sentence by words.
        # ----------------------------------------------------

        words = sentence.split()
        word_chunk = ""

        for word in words:

            if not word_chunk:
                word_chunk = word
                continue

            candidate = (
                f"{word_chunk} {word}"
            )

            if len(candidate) <= max_chunk_length:
                word_chunk = candidate

            else:
                chunks.append(word_chunk)
                word_chunk = word

        if word_chunk:
            current_chunk = word_chunk

    # --------------------------------------------------------
    # Add remaining chunk.
    # --------------------------------------------------------

    if current_chunk:
        chunks.append(current_chunk)

    return [
        chunk.strip()
        for chunk in chunks
        if chunk.strip()
    ]


# ============================================================
# Query Chunk Objects
# ============================================================

def create_query_chunks(
    query: str,
    max_chunk_length: int = DEFAULT_MAX_CHUNK_LENGTH,
) -> list[dict[str, Any]]:
    """
    Create structured query chunks.

    This is the main function that vector_search.py can use.

    Example output:

    [
        {
            "chunk_index": 0,
            "content": "What does the uploaded document say about pricing?",
            "original_query": "...",
        }
    ]
    """

    normalized_query = normalize_query(query)

    chunks = chunk_query(
        query=normalized_query,
        max_chunk_length=max_chunk_length,
    )

    return [
        {
            "chunk_index": index,
            "content": chunk,
            "original_query": normalized_query,
        }
        for index, chunk in enumerate(chunks)
    ]


# ============================================================
# Query Validation
# ============================================================

def validate_query(query: str) -> bool:
    """
    Validate whether a query can be processed.

    Returns
    -------
    bool
        True when the query is valid.
    """

    if not isinstance(query, str):
        return False

    query = query.strip()

    if not query:
        return False

    return len(query) >= MIN_CHUNK_LENGTH


# ============================================================
# Search Query Preparation
# ============================================================

def prepare_search_queries(
    query: str,
    max_chunk_length: int = DEFAULT_MAX_CHUNK_LENGTH,
) -> list[str]:
    """
    Prepare query chunks for vector_search.py.

    This function intentionally returns only the text that
    should be embedded/searched.

    It does not create embeddings or access the database.
    """

    if not validate_query(query):
        raise ValueError(
            "Invalid query."
        )

    return chunk_query(
        query=query,
        max_chunk_length=max_chunk_length,
    )