"""
advanced_query.py
-----------------
Advanced query processing: decomposition, intent detection, expansion.
"""

from __future__ import annotations

import re
from typing import Any


class QueryProcessor:
    """Process user queries intelligently."""

    def __init__(self):
        self.intent_keywords = {
            'listing': ['list', 'content of', 'table of contents', 'summary of', 'outline', 'structure of', 'sections of', 'topics in'],
            'definition': ['what is', 'what are', 'define', 'meaning of', 'refers to'],
            'process': ['how does', 'how to', 'how can', 'process of', 'procedure'],
            'comparison': ['difference between', 'vs', 'versus', 'compared to', 'compare'],
            'location': ['where is', 'location of', 'situated in', 'found in'],
            'function': ['what does', 'function of', 'purpose of', 'role of'],
            'classification': ['types of', 'kinds of', 'categories of', 'classification'],
            'cause': ['why', 'because', 'caused by', 'reason for'],
            'example': ['example of', 'instance of', 'such as', 'like'],
        }

    def detect_intent(self, query: str) -> str:
        """Detect the intent/type of the query."""
        query_lower = query.lower()

        for intent, keywords in self.intent_keywords.items():
            for keyword in keywords:
                if keyword in query_lower:
                    return intent

        return 'general'

    def extract_keywords(self, query: str) -> list[str]:
        """Extract important keywords from query."""
        # Remove common stop words
        stop_words = {
            'what', 'is', 'are', 'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to',
            'how', 'why', 'where', 'when', 'which', 'who', 'does', 'do', 'can',
            'could', 'would', 'should', 'have', 'has', 'had', 'be', 'been'
        }

        words = re.findall(r'\b\w+\b', query.lower())
        keywords = [w for w in words if w not in stop_words and len(w) > 2]

        return keywords

    def decompose_query(self, query: str) -> list[str]:
        """Break complex queries into simpler sub-queries."""
        decomposed = [query]  # Start with original

        # If query has "and", split it
        if ' and ' in query.lower():
            parts = query.split(' and ')
            decomposed.extend([p.strip() for p in parts if len(p.strip()) > 5])

        # If query has commas, consider them as separate queries
        if ',' in query:
            parts = query.split(',')
            decomposed.extend([p.strip() for p in parts if len(p.strip()) > 5])

        return decomposed[:3]  # Limit to 3 queries

    def expand_query(self, query: str) -> list[str]:
        """Generate related query variations."""
        expanded = [query]

        # Add synonym variations
        synonyms = {
            'how does': ['how to', 'how can', 'mechanism of'],
            'what is': ['define', 'explain', 'meaning of'],
            'types': ['kinds', 'categories', 'classification'],
            'function': ['purpose', 'role', 'use'],
        }

        for original, alternatives in synonyms.items():
            if original in query.lower():
                for alt in alternatives:
                    expanded.append(query.lower().replace(original, alt))

        return list(set(expanded[:5]))  # Unique, limit to 5

    def get_query_context(self, query: str) -> dict[str, Any]:
        """Get complete query context."""
        return {
            'original_query': query,
            'intent': self.detect_intent(query),
            'keywords': self.extract_keywords(query),
            'decomposed': self.decompose_query(query),
            'expanded': self.expand_query(query),
            'query_length': len(query),
            'keyword_count': len(self.extract_keywords(query)),
        }


# Global processor
query_processor = QueryProcessor()


def process_query_advanced(query: str) -> dict[str, Any]:
    """Process query with all advanced techniques."""
    return query_processor.get_query_context(query)
