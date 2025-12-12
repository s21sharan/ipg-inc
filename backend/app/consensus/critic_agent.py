"""
Critic Agent for evaluating completed swarm discussions.

Implements a MetaGPT-style critic that analyzes swarm output to assess:
- Discussion quality
- Participation balance
- Coherence and relevance
- Readiness for consensus building

Reference: HACN Architecture - Tier 3 (Critic/Judge Evaluation)
"""

from datetime import datetime, timezone
import json

from .judge_state import (
    CriticEvaluation,
    QualityMetrics,
    ParticipationMetrics,
)
from ..swarm.swarm_state import SwarmOutput, SwarmMessage
from ..orchestration.llm_client import get_llm_client, LLMClient

# Use gpt-4o-mini for quality assessment (faster and more reliable for structured output)
ASSESSMENT_MODEL = "gpt-4o-mini"


class CriticAgent:
    """
    Evaluates completed swarm discussions for quality and consensus readiness.

    The critic analyzes the conversation to:
    - Score overall quality dimensions
    - Assess participation balance
    - Identify issues or flags
    - Recommend whether to proceed with consensus building
    """

    def __init__(self, llm_client: LLMClient | None = None):
        """
        Initialize the critic agent.

        Args:
            llm_client: Optional LLM client (default: create new)
        """
        self._llm = llm_client or get_llm_client()

    def evaluate(self, swarm_output: SwarmOutput) -> CriticEvaluation:
        """
        Evaluate a completed swarm discussion.

        Args:
            swarm_output: Output from completed swarm

        Returns:
            CriticEvaluation with quality metrics and recommendations
        """
        # Calculate participation metrics
        participation = self._calculate_participation(swarm_output)

        # Get LLM quality assessment
        quality = self._assess_quality(swarm_output)

        # Generate flags and recommendations
        flags = self._generate_flags(swarm_output, participation, quality)
        recommendations = self._generate_recommendations(flags)

        # Determine if we should proceed to consensus
        proceed = self._should_proceed(quality, participation, flags)

        return {
            "swarm_id": swarm_output["swarm_id"],
            "quality": quality,
            "participation": participation,
            "flags": flags,
            "recommendations": recommendations,
            "proceed_to_consensus": proceed,
        }

    def _calculate_participation(self, output: SwarmOutput) -> ParticipationMetrics:
        """Calculate participation metrics from swarm output."""
        participants = output["participants"]

        # Count per agent (use participant counts, not message list length)
        per_agent: dict[str, int] = {}
        for p in participants:
            per_agent[p["agent_id"]] = p["message_count"]

        total_messages = sum(per_agent.values())

        # Calculate balance score (0-1, higher = more balanced)
        if len(participants) > 1 and total_messages > 0:
            counts = list(per_agent.values())
            avg = total_messages / len(participants)
            variance = sum((c - avg) ** 2 for c in counts) / len(counts)
            max_variance = avg ** 2  # Maximum possible variance
            balance_score = 1.0 - (variance / max_variance) if max_variance > 0 else 1.0
            balance_score = max(0.0, min(1.0, balance_score))
        else:
            balance_score = 1.0

        # Find dominant speaker
        dominant_speaker = None
        if participants:
            max_count = max(p["message_count"] for p in participants)
            avg_count = total_messages / len(participants) if participants else 0
            if max_count > avg_count * 1.5:  # 50% more than average
                dominant = next(p for p in participants if p["message_count"] == max_count)
                dominant_speaker = dominant["agent_id"]

        # Find quiet agents (below average)
        quiet_agents = []
        if participants:
            avg_count = total_messages / len(participants)
            for p in participants:
                if p["message_count"] < avg_count * 0.5:  # Less than half average
                    quiet_agents.append(p["agent_id"])

        return {
            "total_messages": total_messages,
            "per_agent": per_agent,
            "balance_score": balance_score,
            "dominant_speaker": dominant_speaker,
            "quiet_agents": quiet_agents,
        }

    def _assess_quality(self, output: SwarmOutput) -> QualityMetrics:
        """Use LLM to assess conversation quality."""
        # Format conversation for analysis
        conversation_text = self._format_conversation(output["messages"])

        system_prompt = """You are a conversation quality analyst. Evaluate the following group discussion
and provide scores for each dimension on a 0-10 scale.

Scoring dimensions:
- coherence: How well the conversation flows logically (0=disjointed, 10=perfectly coherent)
- depth: How deeply topics were explored (0=superficial, 10=thorough analysis)
- relevance: How on-topic agents stayed (0=completely off-topic, 10=highly focused)
- engagement: How engaged participants appeared (0=passive, 10=highly engaged)

Respond in JSON format:
{
    "coherence_score": <0-10>,
    "depth_score": <0-10>,
    "relevance_score": <0-10>,
    "engagement_score": <0-10>,
    "overall_score": <0-10>,
    "reasoning": "<brief explanation>"
}"""

        user_prompt = f"""Topic: {output['topic']}

Participants: {', '.join(p['agent_name'] for p in output['participants'])}

Conversation:
{conversation_text}

Evaluate this discussion and provide quality scores."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt, model=ASSESSMENT_MODEL)

            # Parse JSON from response
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                return {
                    "overall_score": float(data.get("overall_score", 5.0)),
                    "coherence_score": float(data.get("coherence_score", 5.0)),
                    "depth_score": float(data.get("depth_score", 5.0)),
                    "relevance_score": float(data.get("relevance_score", 5.0)),
                    "engagement_score": float(data.get("engagement_score", 5.0)),
                }
        except (json.JSONDecodeError, ValueError, KeyError):
            pass

        # Default scores on error
        return {
            "overall_score": 5.0,
            "coherence_score": 5.0,
            "depth_score": 5.0,
            "relevance_score": 5.0,
            "engagement_score": 5.0,
        }

    def _generate_flags(
        self,
        output: SwarmOutput,
        participation: ParticipationMetrics,
        quality: QualityMetrics,
    ) -> list[str]:
        """Generate warning flags based on analysis."""
        flags = []

        # Participation flags
        if participation["balance_score"] < 0.5:
            flags.append("unbalanced_participation")

        if participation["dominant_speaker"]:
            flags.append("dominant_speaker_detected")

        if participation["quiet_agents"]:
            flags.append(f"quiet_agents: {', '.join(participation['quiet_agents'])}")

        # Quality flags
        if quality["overall_score"] < 4.0:
            flags.append("low_overall_quality")

        if quality["coherence_score"] < 4.0:
            flags.append("low_coherence")

        if quality["depth_score"] < 4.0:
            flags.append("shallow_discussion")

        if quality["relevance_score"] < 4.0:
            flags.append("off_topic")

        # Message count flags
        if output["total_turns"] < 5:
            flags.append("very_short_discussion")

        if output["total_turns"] > 50:
            flags.append("very_long_discussion")

        return flags

    def _generate_recommendations(self, flags: list[str]) -> list[str]:
        """Generate recommendations based on flags."""
        recommendations = []

        if "unbalanced_participation" in flags or "dominant_speaker_detected" in flags:
            recommendations.append(
                "Consider encouraging quieter participants in future discussions"
            )

        if "low_coherence" in flags:
            recommendations.append(
                "Consider providing more structure or moderation in future discussions"
            )

        if "shallow_discussion" in flags:
            recommendations.append(
                "Consider using probe questions to encourage deeper exploration"
            )

        if "off_topic" in flags:
            recommendations.append(
                "Consider refining the topic or adding guardrails"
            )

        if "very_short_discussion" in flags:
            recommendations.append(
                "Consider increasing the turn limit for more thorough coverage"
            )

        return recommendations

    def _should_proceed(
        self,
        quality: QualityMetrics,
        participation: ParticipationMetrics,
        flags: list[str],
    ) -> bool:
        """Determine if the swarm output is suitable for consensus building."""
        # Don't proceed if quality is very low
        if quality["overall_score"] < 3.0:
            return False

        # Don't proceed if extremely unbalanced
        if participation["balance_score"] < 0.3:
            return False

        # Don't proceed if too many critical flags
        critical_flags = ["low_overall_quality", "low_coherence", "off_topic"]
        critical_count = sum(1 for f in flags if any(c in f for c in critical_flags))
        if critical_count >= 2:
            return False

        return True

    def _format_conversation(self, messages: list[SwarmMessage]) -> str:
        """Format messages for LLM analysis."""
        lines = []
        for msg in messages:
            lines.append(f"[Turn {msg['turn_number']}] {msg['speaker_name']}: {msg['content']}")
        return "\n\n".join(lines)


def create_critic_agent() -> CriticAgent:
    """Factory function for creating CriticAgent."""
    return CriticAgent()
