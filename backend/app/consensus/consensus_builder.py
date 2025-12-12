"""
Consensus Builder for synthesizing swarm discussions into structured summaries.

Implements a MetaGPT-style structured output generator that analyzes
completed swarm conversations to extract:
- Key insights with supporting quotes and statistics
- Product recommendations with problems, fixes, and implementations

Reference: HACN Architecture - Tier 3 (Consensus Summary Generation)
"""

from datetime import datetime, timezone
import json
from typing import Literal

from .judge_state import (
    ConsensusSummary,
    ConsensusInput,
    KeyInsight,
    InsightQuote,
    AgreementPoint,
    DisagreementPoint,
    CriticEvaluation,
)
from ..swarm.swarm_state import SwarmOutput, SwarmMessage
from ..orchestration.llm_client import get_llm_client, LLMClient

# Use gpt-5 for high-quality consensus extraction
# Note: Reasoning models need high token limits as they use tokens for internal
# reasoning before producing output
EXTRACTION_MODEL = "gpt-5"
EXTRACTION_MAX_TOKENS = 16000  # High limit for reasoning + output


class ConsensusBuilder:
    """
    Builds structured consensus summaries from swarm discussions.

    Analyzes completed swarm conversations to extract insights,
    identify patterns, and generate actionable product recommendations.
    """

    def __init__(self, llm_client: LLMClient | None = None):
        """
        Initialize the consensus builder.

        Args:
            llm_client: Optional LLM client (default: create new)
        """
        self._llm = llm_client or get_llm_client()

    def build_consensus(
        self,
        swarm_output: SwarmOutput,
        critic_evaluation: CriticEvaluation | None = None,
    ) -> ConsensusSummary:
        """
        Build a consensus summary from swarm output.

        Args:
            swarm_output: Output from completed swarm
            critic_evaluation: Optional critic evaluation for context

        Returns:
            ConsensusSummary with structured insights and recommendations
        """
        messages = swarm_output["messages"]
        topic = swarm_output["topic"]
        participants = swarm_output["participants"]

        # Generate the full analysis report
        report = self._generate_full_report(topic, messages, participants)

        # Extract structured data for database storage
        key_insights = self._parse_key_insights(report)
        recommendations = self._parse_recommendations(report)

        # Calculate confidence based on discussion quality
        confidence = self._calculate_confidence_from_discussion(
            messages, participants, critic_evaluation
        )

        # Determine consensus strength
        consensus_strength = self._determine_consensus_strength_from_report(report)

        # Format participants
        formatted_participants = [
            {
                "agent_id": p["agent_id"],
                "agent_name": p["agent_name"],
                "role": "participant",
            }
            for p in participants
        ]

        return {
            "swarm_id": swarm_output["swarm_id"],
            "topic": topic,
            "participants": formatted_participants,
            "key_insights": key_insights,
            "areas_of_agreement": [],  # Incorporated into key_insights
            "areas_of_disagreement": [],  # Incorporated into key_insights
            "synthesized_conclusion": report,  # Full markdown report
            "actionable_items": recommendations,
            "confidence_score": confidence,
            "consensus_strength": consensus_strength,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model_used": EXTRACTION_MODEL,
        }

    def _generate_full_report(
        self,
        topic: str,
        messages: list[SwarmMessage],
        participants: list[dict],
    ) -> str:
        """Generate the full analysis report in the specified format."""
        conversation = self._format_conversation(messages)
        participant_profiles = self._format_participant_profiles(participants)
        participant_names = [p["agent_name"] for p in participants]
        num_participants = len(participants)

        system_prompt = f"""You are an expert UX researcher and product strategist analyzing a focus group discussion.

Your task is to synthesize the conversation into a comprehensive insights report with actionable product recommendations.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

# Key Insights

## [Insight Title]
**[One-line subtitle that captures the core finding]**

[2-3 paragraph detailed explanation of the insight, weaving in direct quotes from participants. Include specific examples and explain the psychological or behavioral mechanism behind the pattern. Reference participants by name when quoting them.]

- [Statistic or data point derived from the discussion, e.g., "X of {num_participants} users (Y%) mentioned..."]
- [Another supporting data point]
- [Pattern observation with specific numbers]
- [Behavioral insight with quantification where possible]

## [Next Insight Title]
...

(Continue for 3-5 key insights)

---

# Product Recommendations

| Problem | Fix | Implementation |
|---------|-----|----------------|
| [Brief problem statement from insights] | [Concise solution description] | [Detailed implementation steps with specific examples, messages, and mechanics] |
| [Next problem] | [Next fix] | [Next implementation] |

(Include 3-5 recommendations that directly address the key insights)

GUIDELINES:
- Extract ACTUAL quotes from the conversation (use participant names)
- Calculate percentages based on {num_participants} total participants
- Make insights specific and actionable, not generic
- Each insight should have a clear "so what" implication
- Recommendations should be concrete enough for a PM to implement
- Use bold, specific numbers where possible
- Connect recommendations directly to insights
- Implementation details should include example UI copy/messages"""

        user_prompt = f"""Topic: {topic}

Participants ({num_participants} total):
{participant_profiles}

Conversation:
{conversation}

Generate a comprehensive insights report following the exact format specified. Use participant demographics to provide context (e.g., "As a 65-year-old retired woman, Olga noted..." or "The younger participants aged 20-25 tended to...")."""

        try:
            response = self._llm.complete(
                user_prompt,
                system_prompt=system_prompt,
                model=EXTRACTION_MODEL,
                max_tokens=EXTRACTION_MAX_TOKENS,
            )
            return response.strip()
        except Exception as e:
            return f"Unable to generate report: {str(e)}"

    def _parse_key_insights(self, report: str) -> list[KeyInsight]:
        """Parse key insights from the markdown report."""
        insights = []

        # Simple parsing - extract insight titles and content
        lines = report.split('\n')
        current_insight = None
        current_content = []

        for line in lines:
            if line.startswith('## ') and 'Product Recommendations' not in line:
                if current_insight:
                    insights.append({
                        "insight": current_insight,
                        "supporting_agents": [],
                        "quotes": [],
                        "confidence": 0.8,
                        "details": '\n'.join(current_content).strip()
                    })
                current_insight = line[3:].strip()
                current_content = []
            elif current_insight and not line.startswith('# '):
                current_content.append(line)

        # Add last insight
        if current_insight:
            insights.append({
                "insight": current_insight,
                "supporting_agents": [],
                "quotes": [],
                "confidence": 0.8,
                "details": '\n'.join(current_content).strip()
            })

        return insights[:5]  # Limit to 5 insights

    def _parse_recommendations(self, report: str) -> list[str]:
        """Parse product recommendations from the report."""
        recommendations = []

        # Find the recommendations section
        if '# Product Recommendations' in report:
            rec_section = report.split('# Product Recommendations')[1]

            # Parse table rows
            lines = rec_section.split('\n')
            for line in lines:
                if line.startswith('|') and '---' not in line and 'Problem' not in line:
                    parts = [p.strip() for p in line.split('|')[1:-1]]
                    if len(parts) >= 3:
                        problem, fix, implementation = parts[0], parts[1], parts[2]
                        if problem and fix:
                            recommendations.append(f"{problem}: {fix}")

        return recommendations[:5]

    def _calculate_confidence_from_discussion(
        self,
        messages: list[SwarmMessage],
        participants: list[dict],
        critic_evaluation: CriticEvaluation | None,
    ) -> float:
        """Calculate confidence based on discussion quality."""
        confidence = 0.6  # Base confidence

        # More messages = more data = higher confidence
        if len(messages) >= 10:
            confidence += 0.1
        if len(messages) >= 20:
            confidence += 0.1

        # More participants = more perspectives
        if len(participants) >= 5:
            confidence += 0.1

        # Factor in critic evaluation if available
        if critic_evaluation:
            quality_factor = critic_evaluation["quality"]["overall_score"] / 10.0
            confidence = confidence * 0.7 + quality_factor * 0.3

        return max(0.0, min(1.0, confidence))

    def _determine_consensus_strength_from_report(
        self,
        report: str,
    ) -> Literal["strong", "moderate", "weak", "none"]:
        """Determine consensus strength from report content."""
        report_lower = report.lower()

        # Look for consensus indicators
        strong_indicators = ["all participants", "unanimous", "everyone agreed", "100%"]
        moderate_indicators = ["most participants", "majority", "generally agreed", "70%", "80%"]
        weak_indicators = ["some participants", "divided", "mixed views", "disagreed"]

        strong_count = sum(1 for i in strong_indicators if i in report_lower)
        moderate_count = sum(1 for i in moderate_indicators if i in report_lower)
        weak_count = sum(1 for i in weak_indicators if i in report_lower)

        if strong_count >= 2:
            return "strong"
        elif moderate_count >= 2 or strong_count >= 1:
            return "moderate"
        elif weak_count >= 2:
            return "weak"
        else:
            return "moderate"  # Default

    def _format_conversation(self, messages: list[SwarmMessage]) -> str:
        """Format messages for LLM analysis."""
        lines = []
        for msg in messages:
            lines.append(f"**{msg['speaker_name']}**: {msg['content']}")
        return "\n\n".join(lines)

    def _format_participant_profiles(self, participants: list[dict]) -> str:
        """Format participant demographics for the prompt."""
        profiles = []
        for p in participants:
            name = p.get("agent_name", "Unknown")
            demo = p.get("demographics", {})

            # Build profile line
            parts = [f"**{name}**"]

            # Age and gender
            age = demo.get("age")
            gender = demo.get("gender")
            if age and gender:
                parts.append(f"{age}-year-old {gender}")
            elif age:
                parts.append(f"{age} years old")
            elif gender:
                parts.append(gender)

            # Occupation and location
            occupation = demo.get("occupation")
            country = demo.get("country")
            hometown = demo.get("hometown")
            if occupation:
                parts.append(occupation)
            if hometown and country:
                parts.append(f"from {hometown}, {country}")
            elif country:
                parts.append(f"from {country}")

            # App usage context
            primary_app = demo.get("primary_app")
            usage_freq = demo.get("usage_frequency")
            is_premium = demo.get("is_premium_user")
            learning_lang = demo.get("learning_language")
            learning_goal = demo.get("learning_goal")

            usage_parts = []
            if primary_app:
                usage_parts.append(f"uses {primary_app}")
            if usage_freq:
                usage_parts.append(f"{usage_freq} user")
            if is_premium is not None:
                usage_parts.append("premium" if is_premium else "free tier")
            if learning_lang:
                usage_parts.append(f"learning {learning_lang}")
            if learning_goal:
                usage_parts.append(f"for {learning_goal} purposes")

            if usage_parts:
                parts.append(f"({', '.join(usage_parts)})")

            # Pain points if available
            pain_points = demo.get("pain_points", [])
            if pain_points and isinstance(pain_points, list):
                parts.append(f"- Pain points: {'; '.join(pain_points[:3])}")

            profiles.append(" - ".join(parts[:4]) + ("\n  " + parts[4] if len(parts) > 4 else ""))

        return "\n".join(profiles)


def create_consensus_builder() -> ConsensusBuilder:
    """Factory function for creating ConsensusBuilder."""
    return ConsensusBuilder()


def build_consensus_from_swarm(
    swarm_output: SwarmOutput,
    critic_evaluation: CriticEvaluation | None = None,
) -> ConsensusSummary:
    """
    Convenience function to build consensus from swarm output.

    Args:
        swarm_output: Completed swarm output
        critic_evaluation: Optional critic evaluation

    Returns:
        ConsensusSummary
    """
    builder = ConsensusBuilder()
    return builder.build_consensus(swarm_output, critic_evaluation)
