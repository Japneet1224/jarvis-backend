"""
advanced_response.py
--------------------
Advanced response generation: combines all techniques into polished answers.
Uses query processing, hybrid search, synthesis, and formatting.
"""

from __future__ import annotations

from typing import Any

from advanced_query import process_query_advanced
from advanced_synthesis import synthesize_advanced


class AdvancedResponseGenerator:
    """Generate comprehensive, well-structured answers."""

    def __init__(self):
        self.confidence_threshold = 0.3  # Minimum confidence to present answer

    def generate_complete_response(self, query: str, search_results: list[dict[str, Any]]) -> dict[str, Any]:
        """Generate complete response using all advanced techniques."""

        if not search_results:
            return {
                'answer': 'No information found in documents. Please try rephrasing your question.',
                'confidence': 0.0,
                'sources': [],
                'aspects': {},
                'suggestions': []
            }

        # Step 1: Process query
        query_context = process_query_advanced(query)

        # Step 2: Synthesize answer from chunks
        synthesis_result = synthesize_advanced(query, search_results)

        # Step 3: Format answer
        formatted_answer = self._format_answer(synthesis_result, query_context)

        # Step 4: Extract sources
        sources = self._extract_sources(search_results)

        # Step 5: Generate suggestions
        suggestions = self._generate_suggestions(query_context, synthesis_result)

        return {
            'answer': formatted_answer,
            'confidence': synthesis_result['confidence'],
            'aspects': synthesis_result['organized_content'],
            'entity': synthesis_result['entity'],
            'intent': query_context['intent'],
            'sources': sources,
            'suggestions': suggestions,
            'cross_references': synthesis_result.get('cross_references', {}),
            'sources_used': synthesis_result['sources_used'],
        }

    def _format_answer(self, synthesis_result: dict[str, Any], query_context: dict) -> str:
        """Format synthesized content into readable answer."""

        entity = synthesis_result['entity'].capitalize()
        organized = synthesis_result['organized_content']
        intent = query_context.get('intent', 'definition')

        # If user is asking for listing/content, format as a table of contents
        if intent == 'listing':
            return self._format_listing_answer(organized, entity)

        sections = []

        # INTRO: Definition section
        if 'definition' in organized and organized['definition']:
            intro = f"**{entity}:**\n"
            intro += "\n".join(organized['definition'][:2])
            sections.append(intro)

        # CHARACTERISTICS
        if 'characteristics' in organized and organized['characteristics']:
            char_section = f"\n**Characteristics/Properties:**\n"
            for i, content in enumerate(organized['characteristics'][:3], 1):
                char_section += f"{i}. {content}\n"
            sections.append(char_section)

        # TYPES
        if 'types' in organized and organized['types']:
            types_section = f"\n**Types/Classifications:**\n"
            for i, content in enumerate(organized['types'][:4], 1):
                types_section += f"{i}. {content}\n"
            sections.append(types_section)

        # FUNCTIONS
        if 'functions' in organized and organized['functions']:
            func_section = f"\n**Functions/Purpose:**\n"
            for i, content in enumerate(organized['functions'][:3], 1):
                func_section += f"{i}. {content}\n"
            sections.append(func_section)

        # PROCESS
        if 'process' in organized and organized['process']:
            proc_section = f"\n**How It Works:**\n"
            for i, content in enumerate(organized['process'][:2], 1):
                proc_section += f"Step {i}: {content}\n"
            sections.append(proc_section)

        # EXAMPLES
        if 'examples' in organized and organized['examples']:
            ex_section = f"\n**Examples:**\n"
            for i, content in enumerate(organized['examples'][:3], 1):
                ex_section += f"• {content}\n"
            sections.append(ex_section)

        # RELATED
        if 'related' in organized and organized['related']:
            rel_section = f"\n**Related Concepts:**\n"
            for i, content in enumerate(organized['related'][:2], 1):
                rel_section += f"• {content}\n"
            sections.append(rel_section)

        # IMPORTANCE
        if 'importance' in organized and organized['importance']:
            imp_section = f"\n**Significance:**\n"
            imp_section += organized['importance'][0]
            sections.append(imp_section)

        return "".join(sections).strip() if sections else "Information available but could not be formatted."

    def _format_listing_answer(self, organized: dict[str, Any], entity: str) -> str:
        """Format answer for listing/table of contents requests."""
        sections = []

        sections.append(f"**Content of {entity}:**\n")

        # List all organized categories as main topics
        topic_order = [
            'definition', 'characteristics', 'types', 'functions',
            'process', 'examples', 'related', 'importance', 'clinical'
        ]

        topic_display_map = {
            'definition': 'Overview/Definition',
            'characteristics': 'Characteristics/Properties',
            'types': 'Types/Classifications',
            'functions': 'Functions/Purpose',
            'process': 'How It Works/Process',
            'examples': 'Examples',
            'related': 'Related Concepts',
            'importance': 'Significance/Importance',
            'clinical': 'Clinical Applications'
        }

        for topic in topic_order:
            if topic in organized and organized[topic]:
                topic_display = topic_display_map.get(topic, topic.title())
                sections.append(f"\n**• {topic_display}**")

                # Add key points for each section
                items = organized[topic]
                for idx, item in enumerate(items[:3], 1):  # Limit to 3 items per section
                    # Extract first 100 chars as summary
                    summary = item[:100].rstrip() + ('...' if len(item) > 100 else '')
                    sections.append(f"  {idx}. {summary}")

        return "\n".join(sections).strip() if len(sections) > 1 else "Content structure not available."

    def _extract_sources(self, search_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Extract unique sources from search results."""

        sources_dict = {}

        for result in search_results:
            source = result.get('source', 'Unknown')

            if source not in sources_dict:
                sources_dict[source] = {
                    'name': source,
                    'chunk_count': 0,
                    'relevance_scores': []
                }

            sources_dict[source]['chunk_count'] += 1
            if 'similarity' in result:
                sources_dict[source]['relevance_scores'].append(result['similarity'])

        # Calculate average relevance
        sources = []
        for source_info in sources_dict.values():
            avg_relevance = (
                sum(source_info['relevance_scores']) / len(source_info['relevance_scores'])
                if source_info['relevance_scores'] else 0.5
            )
            sources.append({
                'name': source_info['name'],
                'chunk_count': source_info['chunk_count'],
                'average_relevance': round(avg_relevance, 2)
            })

        return sorted(sources, key=lambda x: x['average_relevance'], reverse=True)

    def _generate_suggestions(self, query_context: dict, synthesis_result: dict) -> list[str]:
        """Generate follow-up suggestions based on answer."""

        suggestions = []
        entity = synthesis_result['entity']

        # Suggest based on intent
        intent = query_context['intent']

        if intent == 'definition':
            suggestions.append(f"What are the types of {entity}?")
            suggestions.append(f"What is the function of {entity}?")
            suggestions.append(f"What are examples of {entity}?")

        elif intent == 'process':
            suggestions.append(f"What are the steps involved in {entity}?")
            suggestions.append(f"What are the prerequisites for {entity}?")

        elif intent == 'classification':
            suggestions.append(f"What defines each type of {entity}?")
            suggestions.append(f"How are types of {entity} used?")

        elif intent == 'function':
            suggestions.append(f"What is {entity} used for?")
            suggestions.append(f"How important is {entity}?")
            suggestions.append(f"What are examples of {entity}?")

        # Remove duplicates
        suggestions = list(set(suggestions))[:3]

        return suggestions


# Global generator
response_generator = AdvancedResponseGenerator()


def generate_advanced_response(query: str, search_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Generate complete advanced response."""
    return response_generator.generate_complete_response(query, search_results)
