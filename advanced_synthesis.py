"""
advanced_synthesis.py
---------------------
Advanced answer synthesis: multi-aspect extraction, hierarchical organization,
content deduplication, cross-referencing.
"""

from __future__ import annotations

import re
from typing import Any
from collections import defaultdict


class AdvancedSynthesis:
    """Sophisticated answer construction."""

    def extract_multi_aspect_content(self, query: str, chunks: list[dict[str, Any]]) -> dict[str, list[str]]:
        """Extract content organized by multiple aspects."""

        aspects = {
            'overview': [],
            'definition': [],
            'types': [],
            'characteristics': [],
            'functions': [],
            'examples': [],
            'related': [],
            'process': [],
            'importance': [],
            'other': [],
        }

        for chunk in chunks:
            content = str(chunk.get('content', '')).strip()
            if not content:
                continue

            # Analyze content for different aspects
            content_lower = content.lower()

            # DEFINITION: Contains "is", "are", "refers to", "means"
            if any(p in content_lower for p in [' is ', ' are ', 'refers to', 'means', 'defined as']):
                aspects['definition'].append(content)

            # TYPES/CLASSIFICATION: Contains "types", "kinds", "categories"
            if any(p in content_lower for p in ['types of', 'kinds of', 'varieties', 'categories', 'classified']):
                aspects['types'].append(content)

            # CHARACTERISTICS: Contains "has", "properties", "features"
            if any(p in content_lower for p in ['has ', 'properties', 'features', 'characteristics', 'structure']):
                aspects['characteristics'].append(content)

            # FUNCTIONS: Contains "function", "role", "purpose"
            if any(p in content_lower for p in ['function', 'role', 'purpose', 'allows', 'enables', 'helps']):
                aspects['functions'].append(content)

            # EXAMPLES: Contains "example", "such as", "for instance"
            if any(p in content_lower for p in ['example', 'such as', 'for instance', 'like ', 'e.g.']):
                aspects['examples'].append(content)

            # PROCESS: Contains procedural language
            if any(p in content_lower for p in ['step', 'process', 'procedure', 'method', 'first', 'then']):
                aspects['process'].append(content)

            # IMPORTANCE/SIGNIFICANCE: Contains "important", "significant"
            if any(p in content_lower for p in ['important', 'significant', 'crucial', 'essential', 'vital']):
                aspects['importance'].append(content)

            # RELATED CONCEPTS: Contains "related", "associated"
            if any(p in content_lower for p in ['related to', 'associated with', 'connected', 'part of']):
                aspects['related'].append(content)

            # Catch-all
            if not any(aspects[k] for k in aspects if k != 'other'):
                aspects['other'].append(content)

        return aspects

    def deduplicate_content(self, content_list: list[str], similarity_threshold: float = 0.8) -> list[str]:
        """Remove duplicate or highly similar content."""

        if not content_list:
            return []

        deduplicated = []

        for content in content_list:
            is_duplicate = False

            for existing in deduplicated:
                if self._content_similarity(content, existing) > similarity_threshold:
                    is_duplicate = True
                    break

            if not is_duplicate:
                deduplicated.append(content)

        return deduplicated

    def _content_similarity(self, text1: str, text2: str) -> float:
        """Calculate content similarity (0-1)."""
        words1 = set(w.lower() for w in re.findall(r'\w+', text1) if len(w) > 2)
        words2 = set(w.lower() for w in re.findall(r'\w+', text2) if len(w) > 2)

        if not words1 or not words2:
            return 0.0

        overlap = len(words1 & words2)
        total = len(words1 | words2)

        return overlap / total if total > 0 else 0.0

    def organize_hierarchically(self, aspects: dict[str, list[str]], entity: str) -> dict[str, list[str]]:
        """Organize content in hierarchical structure."""

        organized = {}

        # Level 1: Overview/Definition
        if aspects['definition']:
            organized['definition'] = self.deduplicate_content(aspects['definition'][:2])

        # Level 2: Main characteristics
        if aspects['characteristics']:
            organized['characteristics'] = self.deduplicate_content(aspects['characteristics'][:3])

        # Level 3: Types/Categories
        if aspects['types']:
            organized['types'] = self.deduplicate_content(aspects['types'][:4])

        # Level 4: Functions/Purpose
        if aspects['functions']:
            organized['functions'] = self.deduplicate_content(aspects['functions'][:3])

        # Level 5: Process/How it works
        if aspects['process']:
            organized['process'] = self.deduplicate_content(aspects['process'][:2])

        # Level 6: Examples
        if aspects['examples']:
            organized['examples'] = self.deduplicate_content(aspects['examples'][:3])

        # Level 7: Related concepts
        if aspects['related']:
            organized['related'] = self.deduplicate_content(aspects['related'][:2])

        # Level 8: Importance
        if aspects['importance']:
            organized['importance'] = self.deduplicate_content(aspects['importance'][:1])

        return organized

    def add_cross_references(self, organized_content: dict[str, list[str]]) -> dict[str, Any]:
        """Add cross-references between different aspects."""

        references = defaultdict(list)

        # Find entities mentioned across different aspects
        all_text = ' '.join([' '.join(v) for v in organized_content.values()])
        entities = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?', all_text)

        for entity in set(entities):
            mentions = []
            for aspect, contents in organized_content.items():
                for content in contents:
                    if entity in content:
                        mentions.append(aspect)

            if len(mentions) > 1:
                references[entity] = mentions

        return dict(references)

    def generate_structured_answer(self, query: str, chunks: list[dict[str, Any]]) -> dict[str, Any]:
        """Generate complete structured answer."""

        # Extract main entity
        entity = self._extract_entity(query)

        # Extract multi-aspect content
        aspects = self.extract_multi_aspect_content(query, chunks)

        # Organize hierarchically
        organized = self.organize_hierarchically(aspects, entity)

        # Add cross-references
        references = self.add_cross_references(organized)

        # Calculate confidence
        confidence = self._calculate_confidence(organized, len(chunks))

        return {
            'entity': entity,
            'organized_content': organized,
            'cross_references': references,
            'confidence': confidence,
            'aspect_count': len(organized),
            'sources_used': len(chunks),
        }

    def _extract_entity(self, query: str) -> str:
        """Extract main entity from query."""
        words = query.lower().split()
        stop_words = {
            'what', 'is', 'are', 'the', 'a', 'an', 'how', 'why', 'where', 'when',
            'list', 'content', 'of', 'pdf', 'file', 'document', 'table', 'structure',
            'outline', 'summary', 'topics', 'sections', 'in', 'from', 'about', 'on'
        }

        # Look for the most likely entity (after filtering stop words)
        for word in words:
            clean = word.rstrip('?').strip()
            if clean and clean not in stop_words and len(clean) > 2:
                return clean

        return "this topic"

    def _calculate_confidence(self, organized_content: dict, source_count: int) -> float:
        """Calculate confidence score (0-1)."""
        aspect_coverage = len(organized_content) / 8  # Max 8 aspects
        source_score = min(source_count / 5, 1.0)  # Confidence grows with sources up to 5

        return (aspect_coverage + source_score) / 2


# Global synthesizer
synthesizer = AdvancedSynthesis()


def synthesize_advanced(query: str, chunks: list[dict[str, Any]]) -> dict[str, Any]:
    """Generate advanced structured answer."""
    return synthesizer.generate_structured_answer(query, chunks)
