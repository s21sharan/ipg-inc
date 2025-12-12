"""
Swarm Agent implementation for multi-agent dialogue.

Wraps individual agents for participation in swarm conversations,
loading isolated memories from Qdrant and generating contextual responses.

Reference: HACN Architecture - Tier 1 (Local Interaction Clusters)
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
import uuid

from ..orchestration.agent_state import (
    PersonalityProfile,
    EmotionalState,
    ReflectionMemory,
    MemoryObject,
)
from ..orchestration.llm_client import get_llm_client, LLMClient
from .swarm_state import (
    SwarmAgentContext,
    SwarmMessage,
    SwarmState,
)

if TYPE_CHECKING:
    from ..orchestration.persistent_memory import PersistentMemoryStore


class SwarmAgent:
    """
    Individual agent wrapper for swarm participation.

    Handles:
    - Loading isolated memories from Qdrant (filtered by agent_id)
    - Generating contextual responses based on personality and memories
    - Tracking emotional state through conversation
    """

    def __init__(
        self,
        agent_id: str,
        agent_name: str,
        interview_id: str,
        personality: PersonalityProfile,
        reflection_memory: ReflectionMemory,
        initial_emotion: EmotionalState | None = None,
    ):
        """
        Initialize a swarm agent.

        Args:
            agent_id: Unique identifier for the agent
            agent_name: Display name for the agent
            interview_id: Link to original interview data
            personality: Big Five personality profile
            reflection_memory: Structured reflection memory from interview
            initial_emotion: Starting emotional state (default: neutral)
        """
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.interview_id = interview_id
        self.personality = personality
        self.reflection_memory = reflection_memory

        # Initialize emotional state
        self.emotional_state: EmotionalState = initial_emotion or {
            "primary_emotion": "neutral",
            "intensity": 0.3,
            "valence": 0.0,
            "arousal": 0.3,
            "narrative": "Starting the discussion with an open mind.",
        }

        # Memory storage (isolated - only this agent's memories)
        self.memories: list[MemoryObject] = []

        # Participation tracking
        self.message_count = 0
        self.last_spoke_turn = -1

        # LLM client
        self._llm: LLMClient = get_llm_client()
        self._persistent_store: "PersistentMemoryStore | None" = None

    def load_memories(self, limit: int = 50) -> int:
        """
        Load isolated memories from Qdrant for this agent.

        Args:
            limit: Maximum memories to load

        Returns:
            Number of memories loaded
        """
        from ..orchestration.persistent_memory import get_persistent_memory_store

        self._persistent_store = get_persistent_memory_store(self.agent_id)
        loaded = self._persistent_store.load_memories(limit=limit)
        self.memories = loaded
        return len(loaded)

    def generate_response(
        self,
        topic: str,
        conversation_history: list[SwarmMessage],
        max_history: int = 10,
    ) -> str:
        """
        Generate a response in the swarm conversation.

        Args:
            topic: The discussion topic
            conversation_history: Recent messages from all agents
            max_history: Maximum messages to include in context

        Returns:
            The agent's response text
        """
        # Build context from personality
        personality_ctx = self._build_personality_context()
        emotional_ctx = self._build_emotional_context()
        memory_ctx = self._build_memory_context(topic)
        reflection_ctx = self._build_reflection_memory_context()

        # Format conversation history
        history_ctx = self._format_conversation_history(
            conversation_history[-max_history:]
        )

        # Build the prompt
        system_prompt = f"""You are {self.agent_name}, participating in a group discussion with other people.

{personality_ctx}

{emotional_ctx}

{reflection_ctx}

Relevant Memories and Experiences:
{memory_ctx}

DISCUSSION GUIDELINES:
- Engage naturally with what others have said
- Share your genuine perspective based on your experiences
- Be conversational (2-4 sentences typically)
- Let your personality influence your tone and style
- You can agree, disagree, ask questions, or build on ideas
- Be authentic - you don't need to be polished or diplomatic
- Reference specific experiences when relevant"""

        user_prompt = f"""Topic: {topic}

Conversation so far:
{history_ctx}

It's your turn to speak. Respond naturally as {self.agent_name}:"""

        # Generate response
        response = self._llm.complete(
            user_prompt,
            system_prompt=system_prompt,
            max_tokens=1500,
        )

        return response.strip()

    def update_emotional_state(
        self,
        observation: str,
    ) -> EmotionalState:
        """
        Update emotional state based on an observation (other agent's message).

        Args:
            observation: The message/event to react to

        Returns:
            Updated emotional state
        """
        system_prompt = f"""You are simulating the inner emotional experience of {self.agent_name}.

{self._build_personality_context()}

{self._build_emotional_context()}

Given your personality and current emotional state, describe how the following observation affects you emotionally.
Focus on the FEELING, not what you will do about it."""

        user_prompt = f"""Observation: "{observation}"

How does this make you feel? Respond in this exact JSON format:
{{
    "primary_emotion": "<single word emotion>",
    "intensity": <0.0 to 1.0>,
    "valence": <-1.0 to 1.0>,
    "arousal": <0.0 to 1.0>,
    "narrative": "<1 sentence describing your emotional reaction>"
}}"""

        response = self._llm.complete(user_prompt, system_prompt=system_prompt)

        # Parse emotional state update
        try:
            import json
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                emotion_data = json.loads(response[start:end])
                self.emotional_state = {
                    "primary_emotion": emotion_data.get(
                        "primary_emotion", self.emotional_state["primary_emotion"]
                    ),
                    "intensity": float(
                        emotion_data.get("intensity", self.emotional_state["intensity"])
                    ),
                    "valence": float(
                        emotion_data.get("valence", self.emotional_state["valence"])
                    ),
                    "arousal": float(
                        emotion_data.get("arousal", self.emotional_state["arousal"])
                    ),
                    "narrative": emotion_data.get(
                        "narrative", self.emotional_state["narrative"]
                    ),
                }
        except (json.JSONDecodeError, ValueError, KeyError):
            pass  # Keep existing emotional state

        return self.emotional_state

    def to_context(self) -> SwarmAgentContext:
        """Convert agent to SwarmAgentContext for state tracking."""
        return {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "interview_id": self.interview_id,
            "personality": self.personality,
            "emotional_state": self.emotional_state,
            "reflection_memory": self.reflection_memory,
            "memories": self.memories,
            "message_count": self.message_count,
            "last_spoke_turn": self.last_spoke_turn,
        }

    @classmethod
    def from_context(cls, ctx: SwarmAgentContext) -> "SwarmAgent":
        """Create agent from SwarmAgentContext."""
        agent = cls(
            agent_id=ctx["agent_id"],
            agent_name=ctx["agent_name"],
            interview_id=ctx["interview_id"],
            personality=ctx["personality"],
            reflection_memory=ctx["reflection_memory"],
            initial_emotion=ctx["emotional_state"],
        )
        agent.memories = ctx["memories"]
        agent.message_count = ctx["message_count"]
        agent.last_spoke_turn = ctx["last_spoke_turn"]
        return agent

    @classmethod
    def from_interview_data(
        cls,
        interview: dict,
        agent_id: str | None = None,
    ) -> "SwarmAgent":
        """
        Create a SwarmAgent from interview data.

        Args:
            interview: Interview data dict with personality, transcript, etc.
            agent_id: Optional override for agent_id

        Returns:
            Initialized SwarmAgent
        """
        interview_id = interview.get("id", str(uuid.uuid4()))
        agent_id = agent_id or interview_id

        # Extract name from demographics or use default
        demographics = interview.get("demographics", {})
        name = demographics.get("name", f"Participant-{interview_id[:8]}")

        # Extract personality (handle nested structure)
        personality_raw = interview.get("personality", {})
        personality_data = personality_raw.get("scores", personality_raw)
        personality: PersonalityProfile = {
            "openness": personality_data.get("openness", 2.5),
            "conscientiousness": personality_data.get("conscientiousness", 2.5),
            "extraversion": personality_data.get("extraversion")
            or personality_data.get("extroversion", 2.5),
            "agreeableness": personality_data.get("agreeableness", 2.5),
            "neuroticism": personality_data.get("neuroticism", 2.5),
        }

        # Extract reflection memory
        reflection_data = interview.get("reflection_memory", {})
        reflection_memory: ReflectionMemory = {
            "basic_facts": reflection_data.get("basic_facts", {}),
            "goals_and_aspirations": reflection_data.get("goals_and_aspirations", {}),
            "pain_points_and_frustrations": reflection_data.get(
                "pain_points_and_frustrations", {}
            ),
            "product_attitudes": reflection_data.get("product_attitudes", {}),
            "communication_style": reflection_data.get("communication_style", {}),
        }

        return cls(
            agent_id=agent_id,
            agent_name=name,
            interview_id=interview_id,
            personality=personality,
            reflection_memory=reflection_memory,
        )

    # =========================================================================
    # Private helper methods
    # =========================================================================

    def _build_personality_context(self) -> str:
        """Build personality description from OCEAN profile."""
        p = self.personality

        def level(score: float) -> str:
            if score >= 4.0:
                return "very high"
            elif score >= 3.0:
                return "moderately high"
            elif score >= 2.0:
                return "moderate"
            elif score >= 1.0:
                return "moderately low"
            else:
                return "very low"

        return f"""Personality Profile (Big Five/OCEAN):
- Openness: {level(p['openness'])} ({p['openness']:.1f}/5) - {'Curious, creative, open to new experiences' if p['openness'] >= 3 else 'Practical, conventional, prefers routine'}
- Conscientiousness: {level(p['conscientiousness'])} ({p['conscientiousness']:.1f}/5) - {'Organized, reliable, goal-oriented' if p['conscientiousness'] >= 3 else 'Flexible, spontaneous, adaptable'}
- Extraversion: {level(p['extraversion'])} ({p['extraversion']:.1f}/5) - {'Outgoing, energetic, talkative' if p['extraversion'] >= 3 else 'Reserved, reflective, prefers solitude'}
- Agreeableness: {level(p['agreeableness'])} ({p['agreeableness']:.1f}/5) - {'Cooperative, empathetic, helpful' if p['agreeableness'] >= 3 else 'Competitive, skeptical, direct'}
- Neuroticism: {level(p['neuroticism'])} ({p['neuroticism']:.1f}/5) - {'Sensitive, prone to stress and worry' if p['neuroticism'] >= 3 else 'Emotionally stable, calm, resilient'}"""

    def _build_emotional_context(self) -> str:
        """Build emotional state description."""
        e = self.emotional_state
        valence = (
            "positive" if e["valence"] > 0 else "negative" if e["valence"] < 0 else "neutral"
        )
        arousal = "high energy" if e["arousal"] > 0.5 else "calm"

        return f"""Current Emotional State:
- Primary Emotion: {e['primary_emotion']} (intensity: {e['intensity']:.1f})
- Valence: {valence} ({e['valence']:.2f})
- Arousal: {arousal} ({e['arousal']:.2f})
- Emotional Narrative: {e['narrative']}"""

    def _build_reflection_memory_context(self) -> str:
        """Build context from reflection memory."""
        rm = self.reflection_memory
        parts = []

        if rm.get("basic_facts"):
            facts = ", ".join(f"{k}: {v}" for k, v in rm["basic_facts"].items() if v)
            if facts:
                parts.append(f"Background: {facts}")

        if rm.get("goals_and_aspirations"):
            goals = rm["goals_and_aspirations"]
            if isinstance(goals, dict) and goals:
                goal_str = ", ".join(str(v) for v in goals.values() if v)
                if goal_str:
                    parts.append(f"Goals: {goal_str}")

        if rm.get("pain_points_and_frustrations"):
            pains = rm["pain_points_and_frustrations"]
            if isinstance(pains, dict) and pains.get("current_problems"):
                pain_str = ", ".join(pains["current_problems"][:3])
                parts.append(f"Pain Points: {pain_str}")

        if rm.get("product_attitudes"):
            attitudes = rm["product_attitudes"]
            if isinstance(attitudes, dict) and attitudes:
                att_str = ", ".join(f"{k}: {v}" for k, v in list(attitudes.items())[:3] if v)
                if att_str:
                    parts.append(f"Product Attitudes: {att_str}")

        return "\n".join(parts) if parts else "No background information available."

    def _build_memory_context(self, topic: str) -> str:
        """Build context from relevant memories for the topic."""
        if not self.memories:
            return "No relevant memories."

        # Simple relevance: return recent memories
        # In production, would use semantic search
        relevant = self.memories[-10:]

        return "\n".join([f"- {m['content']}" for m in relevant])

    def _format_conversation_history(
        self,
        messages: list[SwarmMessage],
    ) -> str:
        """Format swarm messages for prompt context."""
        if not messages:
            return "(No previous conversation)"

        lines = []
        for msg in messages:
            speaker = msg["speaker_name"]
            content = msg["content"]
            lines.append(f"{speaker}: {content}")

        return "\n".join(lines)


def create_swarm_agent_from_interview(
    interview: dict,
    load_memories: bool = True,
    memory_limit: int = 50,
) -> SwarmAgent:
    """
    Factory function to create and initialize a SwarmAgent.

    Args:
        interview: Interview data dict
        load_memories: Whether to load memories from Qdrant
        memory_limit: Maximum memories to load

    Returns:
        Initialized SwarmAgent with memories loaded
    """
    agent = SwarmAgent.from_interview_data(interview)

    if load_memories:
        try:
            agent.load_memories(limit=memory_limit)
        except Exception as e:
            print(f"Warning: Failed to load memories for {agent.agent_name}: {e}")

    return agent
