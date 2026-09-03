"""
embeddings.py
-------------
Generate embeddings using pure algorithmic approach.
No external ML models, lightweight, runs locally.
Uses frequency-based semantic hashing for fast, deterministic embeddings.
"""

from __future__ import annotations

import math
import re
import hashlib
from typing import Optional


def _tokenize(text: str) -> list[str]:
    """Tokenize text into meaningful words."""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    words = re.findall(r'\b\w{3,}\b', text)
    return words


def _calculate_idf_simple(text: str) -> dict[str, float]:
    """Calculate term frequencies for text."""
    tokens = _tokenize(text)
    if not tokens:
        return {}

    freq = {}
    for token in tokens:
        freq[token] = freq.get(token, 0) + 1

    total = len(tokens)
    return {
        token: (count / total) * math.log(total / count + 1)
        for token, count in freq.items()
    }


def _hash_to_vector(
    token: str,
    dim: int = 384,
) -> list[float]:
    """Convert token to consistent embedding using hash."""
    hash_obj = hashlib.md5(token.encode())
    hash_bytes = hash_obj.digest()

    embedding = []
    for i in range(dim):
        byte_val = hash_bytes[i % len(hash_bytes)]
        normalized = (byte_val / 255.0) * 2 - 1
        embedding.append(normalized)

    return embedding


def _get_embedding_from_tokens(
    tokens: list[str],
    embedding_dim: int = 384,
) -> list[float]:
    """Create embedding from token list using weighted averaging."""
    if not tokens:
        return [0.0] * embedding_dim

    token_freqs = _calculate_idf_simple(" ".join(tokens))

    if not token_freqs:
        return [0.0] * embedding_dim

    embedding = [0.0] * embedding_dim
    total_weight = 0.0

    for token, weight in token_freqs.items():
        token_vector = _hash_to_vector(token, embedding_dim)
        for i in range(embedding_dim):
            embedding[i] += token_vector[i] * weight
        total_weight += weight

    if total_weight > 0:
        embedding = [x / total_weight for x in embedding]

    norm = math.sqrt(sum(x * x for x in embedding))
    if norm > 0:
        embedding = [x / norm for x in embedding]

    return embedding


def get_embedding(text: str) -> Optional[list[float]]:
    """Generate embedding for text."""
    try:
        text = text.strip()
        if not text:
            return [0.0] * 384

        tokens = _tokenize(text)
        return _get_embedding_from_tokens(tokens)

    except Exception as e:
        print(f"Embedding error: {e}")
        return None


def get_embeddings_batch(texts: list[str]) -> list[Optional[list[float]]]:
    """Generate embeddings for multiple texts."""
    if not texts:
        return []

    try:
        embeddings = []
        for text in texts:
            text = text.strip()
            if not text:
                embeddings.append([0.0] * 384)
            else:
                tokens = _tokenize(text)
                embeddings.append(
                    _get_embedding_from_tokens(tokens)
                )
        return embeddings

    except Exception as e:
        print(f"Batch embedding error: {e}")
        return [None] * len(texts)


def is_embedding_enabled() -> bool:
    """Check if embeddings are available."""
    return True
