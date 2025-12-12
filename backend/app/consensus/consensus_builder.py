"""
Consensus Builder for synthesizing swarm discussions into structured summaries.

Implements a MetaGPT-style structured output generator that analyzes
completed swarm conversations to extract:
- Key insights with supporting quotes
- Areas of agreement and disagreement
- Synthesized conclusions
- Actionable items

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


class ConsensusBuilder:
    """
    Builds structured consensus summaries from swarm discussions.

    Analyzes completed swarm conversations to extract insights,
    identify areas of agreement/disagreement, and synthesize conclusions.
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
            ConsensusSummary with structured insights
        """
        messages = swarm_output["messages"]
        topic = swarm_output["topic"]
        participants = swarm_output["participants"]

        # Extract key insights
        key_insights = self._extract_key_insights(topic, messages, participants)

        # Identify agreement areas
        agreements = self._identify_agreements(topic, messages, participants)

        # Identify disagreement areas
        disagreements = self._identify_disagreements(topic, messages, participants)

        # Synthesize conclusion
        conclusion = self._synthesize_conclusion(
            topic, key_insights, agreements, disagreements
        )

        # Generate actionable items
        actionable_items = self._generate_actionable_items(
            topic, key_insights, agreements, conclusion
        )

        # Calculate confidence
        confidence = self._calculate_confidence(
            key_insights, agreements, disagreements, critic_evaluation
        )

        # Determine consensus strength
        consensus_strength = self._determine_consensus_strength(
            agreements, disagreements
        )

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
            "areas_of_agreement": agreements,
            "areas_of_disagreement": disagreements,
            "synthesized_conclusion": conclusion,
            "actionable_items": actionable_items,
            "confidence_score": confidence,
            "consensus_strength": consensus_strength,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model_used": "gpt-4o-mini",
        }

    def _extract_key_insights(
        self,
        topic: str,
        messages: list[SwarmMessage],
        participants: list[dict],
    ) -> list[KeyInsight]:
        """Extract key insights from the discussion."""
        conversation = self._format_conversation(messages)
        participant_names = [p["agent_name"] for p in participants]

        system_prompt = """You are an expert at analyzing group discussions and extracting key insights.

Identify the 3-5 most important insights from this conversation.
For each insight:
1. State the insight clearly
2. List which participants supported this insight
3. Include 1-2 direct quotes that support it

Respond in JSON format:
{
    "insights": [
        {
            "insight": "<the key insight>",
            "supporting_agents": ["<name1>", "<name2>"],
            "quotes": [
                {"agent_name": "<name>", "quote": "<direct quote>", "turn": <turn number>}
            ],
            "confidence": <0.0-1.0>
        }
    ]
}"""

        user_prompt = f"""Topic: {topic}

Participants: {', '.join(participant_names)}

Conversation:
{conversation}

Extract the key insights from this discussion."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt)

            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                insights = []

                for item in data.get("insights", [])[:5]:
                    quotes: list[InsightQuote] = []
                    for q in item.get("quotes", [])[:3]:
                        # Find agent_id from name
                        agent_id = ""
                        for p in participants:
                            if p["agent_name"] == q.get("agent_name"):
                                agent_id = p["agent_id"]
                                break

                        quotes.append({
                            "agent_id": agent_id,
                            "agent_name": q.get("agent_name", "Unknown"),
                            "quote": q.get("quote", ""),
                            "turn_number": int(q.get("turn", 0)),
                        })

                    insights.append({
                        "insight": item.get("insight", ""),
                        "supporting_agents": item.get("supporting_agents", []),
                        "quotes": quotes,
                        "confidence": float(item.get("confidence", 0.7)),
                    })

                return insights

        except (json.JSONDecodeError, ValueError, KeyError):
            pass

        return []

    def _identify_agreements(
        self,
        topic: str,
        messages: list[SwarmMessage],
        participants: list[dict],
    ) -> list[AgreementPoint]:
        """Identify areas of agreement in the discussion."""
        conversation = self._format_conversation(messages)
        participant_names = [p["agent_name"] for p in participants]

        system_prompt = """You are an expert at analyzing group discussions for consensus.

Identify points where participants agreed or reached consensus.
For each agreement:
1. State the point of agreement
2. Assess the strength (strong, moderate, weak)
3. List supporting and dissenting agents

Respond in JSON format:
{
    "agreements": [
        {
            "point": "<what they agreed on>",
            "strength": "strong|moderate|weak",
            "supporting_agents": ["<name1>", "<name2>"],
            "dissenting_agents": ["<name>"]
        }
    ]
}"""

        user_prompt = f"""Topic: {topic}

Participants: {', '.join(participant_names)}

Conversation:
{conversation}

Identify areas of agreement in this discussion."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt)

            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                agreements = []

                for item in data.get("agreements", [])[:5]:
                    strength = item.get("strength", "moderate")
                    if strength not in ("strong", "moderate", "weak"):
                        strength = "moderate"

                    agreements.append({
                        "point": item.get("point", ""),
                        "agreement_level": strength,
                        "supporting_agents": item.get("supporting_agents", []),
                        "dissenting_agents": item.get("dissenting_agents", []),
                    })

                return agreements

        except (json.JSONDecodeError, ValueError, KeyError):
            pass

        return []

    def _identify_disagreements(
        self,
        topic: str,
        messages: list[SwarmMessage],
        participants: list[dict],
    ) -> list[DisagreementPoint]:
        """Identify areas of disagreement in the discussion."""
        conversation = self._format_conversation(messages)
        participant_names = [p["agent_name"] for p in participants]

        system_prompt = """You are an expert at analyzing group discussions for differing viewpoints.

Identify points where participants disagreed or held different positions.
For each disagreement:
1. State the point of contention
2. List the different positions and who held them

Respond in JSON format:
{
    "disagreements": [
        {
            "point": "<the topic of disagreement>",
            "positions": [
                {"position": "<viewpoint 1>", "agents": ["<name1>"]},
                {"position": "<viewpoint 2>", "agents": ["<name2>"]}
            ]
        }
    ]
}"""

        user_prompt = f"""Topic: {topic}

Participants: {', '.join(participant_names)}

Conversation:
{conversation}

Identify areas of disagreement in this discussion."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt)

            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                disagreements = []

                for item in data.get("disagreements", [])[:5]:
                    disagreements.append({
                        "point": item.get("point", ""),
                        "positions": item.get("positions", []),
                    })

                return disagreements

        except (json.JSONDecodeError, ValueError, KeyError):
            pass

        return []

    def _synthesize_conclusion(
        self,
        topic: str,
        insights: list[KeyInsight],
        agreements: list[AgreementPoint],
        disagreements: list[DisagreementPoint],
    ) -> str:
        """Synthesize a conclusion from the analysis."""
        insights_text = "\n".join([f"- {i['insight']}" for i in insights]) or "No key insights identified."
        agreements_text = "\n".join([f"- {a['point']}" for a in agreements]) or "No clear agreements."
        disagreements_text = "\n".join([f"- {d['point']}" for d in disagreements]) or "No major disagreements."

        system_prompt = """You are an expert at synthesizing group discussions into clear conclusions.

Write a concise (2-4 sentences) conclusion that summarizes the key takeaways from this discussion.
Focus on what was learned and any emerging consensus."""

        user_prompt = f"""Topic: {topic}

Key Insights:
{insights_text}

Areas of Agreement:
{agreements_text}

Areas of Disagreement:
{disagreements_text}

Write a synthesized conclusion for this discussion."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt)
            return response.strip()
        except Exception:
            return "Unable to synthesize conclusion from the discussion."

    def _generate_actionable_items(
        self,
        topic: str,
        insights: list[KeyInsight],
        agreements: list[AgreementPoint],
        conclusion: str,
    ) -> list[str]:
        """Generate actionable recommendations from the discussion."""
        insights_text = "\n".join([f"- {i['insight']}" for i in insights]) or "No insights."
        agreements_text = "\n".join([f"- {a['point']}" for a in agreements]) or "No agreements."

        system_prompt = """You are an expert at turning discussion insights into actionable recommendations.

Generate 2-4 specific, actionable items based on the discussion findings.
Each item should be concrete and implementable.

Respond in JSON format:
{
    "actions": ["<action 1>", "<action 2>", "<action 3>"]
}"""

        user_prompt = f"""Topic: {topic}

Key Insights:
{insights_text}

Areas of Agreement:
{agreements_text}

Conclusion: {conclusion}

Generate actionable items from this discussion."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt)

            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                return data.get("actions", [])[:5]

        except (json.JSONDecodeError, ValueError, KeyError):
            pass

        return []

    def _calculate_confidence(
        self,
        insights: list[KeyInsight],
        agreements: list[AgreementPoint],
        disagreements: list[DisagreementPoint],
        critic_evaluation: CriticEvaluation | None,
    ) -> float:
        """Calculate overall confidence score for the consensus."""
        confidence = 0.5  # Base confidence

        # More insights = higher confidence
        if len(insights) >= 3:
            confidence += 0.1
        if len(insights) >= 5:
            confidence += 0.1

        # Strong agreements increase confidence
        strong_agreements = sum(1 for a in agreements if a["agreement_level"] == "strong")
        if strong_agreements >= 2:
            confidence += 0.15

        # Many disagreements decrease confidence
        if len(disagreements) > len(agreements):
            confidence -= 0.1

        # Factor in critic quality score if available
        if critic_evaluation:
            quality_factor = critic_evaluation["quality"]["overall_score"] / 10.0
            confidence = confidence * 0.7 + quality_factor * 0.3

        return max(0.0, min(1.0, confidence))

    def _determine_consensus_strength(
        self,
        agreements: list[AgreementPoint],
        disagreements: list[DisagreementPoint],
    ) -> Literal["strong", "moderate", "weak", "none"]:
        """Determine the overall strength of consensus."""
        if not agreements and not disagreements:
            return "none"

        strong_agreements = sum(1 for a in agreements if a["agreement_level"] == "strong")
        total_agreements = len(agreements)
        total_disagreements = len(disagreements)

        # Strong consensus: multiple strong agreements, few disagreements
        if strong_agreements >= 2 and total_disagreements <= 1:
            return "strong"

        # Moderate: more agreements than disagreements
        if total_agreements > total_disagreements:
            return "moderate"

        # Weak: equal or more disagreements
        if total_agreements > 0:
            return "weak"

        return "none"

    def _format_conversation(self, messages: list[SwarmMessage]) -> str:
        """Format messages for LLM analysis."""
        lines = []
        for msg in messages:
            lines.append(f"[Turn {msg['turn_number']}] {msg['speaker_name']}: {msg['content']}")
        return "\n\n".join(lines)


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
