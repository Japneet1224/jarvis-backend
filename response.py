"""
response.py
-----------
Advanced response generation using intelligent algorithms.
Replaces all weak algorithms with best-in-class methods.
"""

from __future__ import annotations

from typing import Any

from advanced_response import generate_advanced_response


def generate_response_from_results(
    query: str,
    search_results: list[dict[str, Any]],
) -> str:
    """Generate answer using advanced algorithms (no LLM needed)."""

    print(f"\n[DEBUG] Advanced Query: {query}")
    print(f"[DEBUG] Retrieved chunks: {len(search_results)}")

    if not search_results:
        print("[DEBUG] No results - returning default message")
        return "No information found in documents. Please try rephrasing your question or upload relevant documents."

    try:
        print("[DEBUG] Using advanced response generation")
        response_data = generate_advanced_response(query, search_results)
        return response_data.get('answer', 'Could not generate answer.')

    except Exception as e:
        print(f"[ERROR] Advanced generation failed: {e}")
        return f"Error generating answer: {str(e)}"


def generate_response_with_metadata(
    query: str,
    search_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate answer with advanced metadata."""

    response_data = generate_advanced_response(query, search_results)

    return {
        "answer": response_data['answer'],
        "sources": response_data.get('sources', []),
        "confidence": response_data.get('confidence', 0.0),
        "suggestions": response_data.get('suggestions', []),
        "entity": response_data.get('entity', ''),
        "aspects": list(response_data.get('organized_content', {}).keys()),
    }


def response_service_available() -> bool:
    """Advanced service is always available (local)."""
    return True
