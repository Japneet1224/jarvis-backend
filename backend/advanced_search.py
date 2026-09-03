"""
advanced_search.py
------------------
Hybrid search combining vector, keyword, and semantic retrieval.
Multi-stage ranking with result fusion.
"""

from __future__ import annotations

import re
from typing import Any
from collections import defaultdict


class HybridSearchEngine:
    """Advanced multi-strategy search engine."""

    def __init__(self):
        self.keyword_weight = 0.3
        self.vector_weight = 0.4
        self.semantic_weight = 0.3

    def keyword_search(self, query: str, chunks: list[dict[str, Any]]) -> list[tuple[str, float]]:
        """Traditional keyword-based search with TF-IDF-like scoring."""
        query_words = set(w.lower() for w in re.findall(r'\w+', query) if len(w) > 2)
        results = []

        for chunk in chunks:
            content = str(chunk.get('content', '')).lower()
            chunk_words = set(w.lower() for w in re.findall(r'\w+', content) if len(w) > 2)

            # Calculate overlap
            overlap = len(query_words & chunk_words)
            if overlap == 0:
                continue

            # TF-IDF like scoring
            precision = overlap / len(query_words)  # How many query words found
            recall = overlap / len(chunk_words)  # How much of chunk matches
            score = (precision + recall) / 2

            results.append((chunk, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def semantic_search(self, query: str, chunks: list[dict[str, Any]]) -> list[tuple[str, float]]:
        """Semantic search using phrase similarity and conceptual matching."""
        query_phrases = self._extract_phrases(query)
        results = []

        for chunk in chunks:
            content = str(chunk.get('content', ''))
            chunk_phrases = self._extract_phrases(content)

            # Calculate semantic similarity (phrase overlap)
            phrase_overlap = len(set(query_phrases) & set(chunk_phrases))

            if phrase_overlap == 0:
                # Check for related concepts
                score = self._concept_similarity(query, content)
            else:
                score = 0.5 + (phrase_overlap / max(len(query_phrases), 1)) * 0.5

            if score > 0.1:
                results.append((chunk, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _extract_phrases(self, text: str) -> list[str]:
        """Extract noun phrases and key terms."""
        phrases = []

        # Split by common separators
        segments = re.split(r'[,;:.!?]', text)

        for segment in segments:
            words = segment.strip().split()
            if len(words) >= 2:
                # 2-3 word phrases
                for i in range(len(words) - 1):
                    phrase = ' '.join(words[i:i+2]).lower()
                    if len(phrase) > 5:
                        phrases.append(phrase)

        return phrases

    def _concept_similarity(self, text1: str, text2: str) -> float:
        """Estimate conceptual similarity between texts."""
        words1 = set(w.lower() for w in re.findall(r'\w{4,}', text1))  # Words 4+ chars
        words2 = set(w.lower() for w in re.findall(r'\w{4,}', text2))

        if not words1 or not words2:
            return 0.0

        overlap = len(words1 & words2)
        return overlap / max(len(words1), len(words2))

    def rerank_results(self, vector_results: list[dict], keyword_results: list[tuple],
                       semantic_results: list[tuple]) -> list[dict[str, Any]]:
        """Combine and rerank results from multiple strategies."""

        # Normalize scores to 0-1
        combined_scores = defaultdict(float)

        # Add vector search scores
        for i, result in enumerate(vector_results[:10]):
            chunk_id = str(result.get('chunk_id', ''))
            score = (10 - i) / 10  # Position-based score
            combined_scores[chunk_id] += score * self.vector_weight

        # Add keyword search scores
        for i, (chunk, score) in enumerate(keyword_results[:10]):
            chunk_id = str(chunk.get('_id', ''))
            combined_scores[chunk_id] += score * self.keyword_weight

        # Add semantic search scores
        for i, (chunk, score) in enumerate(semantic_results[:10]):
            chunk_id = str(chunk.get('_id', ''))
            combined_scores[chunk_id] += score * self.semantic_weight

        # Sort by combined score
        ranked = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)

        return [{'chunk_id': cid, 'combined_score': score} for cid, score in ranked[:15]]

    def diversity_sample(self, results: list[dict], max_results: int = 5) -> list[dict]:
        """Sample results for diversity (avoid repetitive content)."""
        if len(results) <= max_results:
            return results

        sampled = []
        for result in results:
            # Simple diversity: only add if content is different enough
            content = str(result.get('content', '')).lower()

            is_diverse = True
            for existing in sampled:
                existing_content = str(existing.get('content', '')).lower()
                # Check if content similarity is too high
                if self._content_overlap(content, existing_content) > 0.7:
                    is_diverse = False
                    break

            if is_diverse:
                sampled.append(result)

            if len(sampled) >= max_results:
                break

        return sampled

    def _content_overlap(self, text1: str, text2: str) -> float:
        """Calculate content overlap between two texts."""
        words1 = set(w.lower() for w in re.findall(r'\w+', text1))
        words2 = set(w.lower() for w in re.findall(r'\w+', text2))

        if not words1 or not words2:
            return 0.0

        overlap = len(words1 & words2)
        return overlap / min(len(words1), len(words2))


# Global engine
search_engine = HybridSearchEngine()


def hybrid_search(query: str, chunks: list[dict[str, Any]],
                  vector_results: list[dict] | None = None) -> list[dict]:
    """Perform hybrid search combining all strategies."""

    # Keyword search
    keyword_results = search_engine.keyword_search(query, chunks)

    # Semantic search
    semantic_results = search_engine.semantic_search(query, chunks)

    # Convert to dicts for reranking
    keyword_dicts = [result[0] for result in keyword_results]
    semantic_dicts = [result[0] for result in semantic_results]

    # Rerank using all strategies
    if vector_results:
        reranked = search_engine.rerank_results(vector_results, keyword_results, semantic_results)
    else:
        # Fallback if no vector results
        reranked = search_engine.rerank_results([], keyword_results, semantic_results)

    # Apply diversity sampling
    diverse = search_engine.diversity_sample(reranked, max_results=5)

    return diverse
