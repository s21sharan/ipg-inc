"""
LangGraph node implementations for the generative agent cognitive loop.

Implements the Plan → Act → Observe → Reflect cycle with Chain-of-Feeling
emotional tracking and memory-grounded reasoning.

Reference: SyntheticCohorts Framework Section 2 (Cognitive Architecture)
"""

from datetime import datetime, timezone
from typing import Literal
import uuid

from .agent_state import AgentState, MemoryObject, EmotionalState
from .llm_client import get_llm_client
from .memory_stream import MemoryStream


# Reflection threshold (trigger when importance accumulator exceeds this)
DEFAULT_REFLECTION_THRESHOLD = 50.0


def _build_personality_context(state: AgentState) -> str:
    """Build personality description from OCEAN profile."""
    p = state["personality"]

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


def _build_emotional_context(state: AgentState) -> str:
    """Build emotional state description for Chain-of-Feeling."""
    e = state["emotional_state"]
    valence = "positive" if e["valence"] > 0 else "negative" if e["valence"] < 0 else "neutral"
    arousal = "high energy" if e["arousal"] > 0.5 else "calm"

    return f"""Current Emotional State:
- Primary Emotion: {e['primary_emotion']} (intensity: {e['intensity']:.1f})
- Valence: {valence} ({e['valence']:.2f})
- Arousal: {arousal} ({e['arousal']:.2f})
- Emotional Narrative: {e['narrative']}"""


def _build_reflection_memory_context(state: AgentState) -> str:
    """Build context from the agent's reflection memory."""
    rm = state["reflection_memory"]
    parts = []

    if rm.get("basic_facts"):
        facts = ", ".join(f"{k}: {v}" for k, v in rm["basic_facts"].items() if v)
        parts.append(f"Background: {facts}")

    if rm.get("goals_and_aspirations"):
        goals = rm["goals_and_aspirations"]
        if isinstance(goals, dict) and goals:
            goal_str = ", ".join(str(v) for v in goals.values() if v)
            parts.append(f"Goals: {goal_str}")

    if rm.get("pain_points_and_frustrations"):
        pains = rm["pain_points_and_frustrations"]
        if isinstance(pains, dict) and pains.get("current_problems"):
            pain_str = ", ".join(pains["current_problems"][:3])
            parts.append(f"Pain Points: {pain_str}")

    return "\n".join(parts) if parts else "No background information available."


def observe_node(state: AgentState) -> dict:
    """
    OBSERVE: Process the current observation and update emotional state.

    This is the first step in the cognitive loop. The agent perceives
    a stimulus (e.g., interviewer question) and records how it makes them feel.

    Reference: Framework Section 2.2.1 (Chain-of-Feeling)
    """
    llm = get_llm_client()

    observation = state["current_observation"]
    current_emotion = state["emotional_state"]

    # Chain-of-Feeling: How does this observation make the agent feel?
    system_prompt = f"""You are simulating the inner emotional experience of a person named {state['agent_name']}.

{_build_personality_context(state)}

{_build_emotional_context(state)}

{_build_reflection_memory_context(state)}

Given your personality and current emotional state, describe how the following observation affects you emotionally.
Focus on the FEELING, not what you will do about it."""

    user_prompt = f"""Observation: "{observation}"

How does this make you feel? Respond in this exact JSON format:
{{
    "primary_emotion": "<single word emotion>",
    "intensity": <0.0 to 1.0>,
    "valence": <-1.0 to 1.0>,
    "arousal": <0.0 to 1.0>,
    "narrative": "<1-2 sentences describing your emotional reaction>"
}}"""

    response = llm.complete(user_prompt, system_prompt=system_prompt)

    # Parse emotional state update
    try:
        import json
        # Find JSON in response
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            emotion_data = json.loads(response[start:end])
            new_emotion: EmotionalState = {
                "primary_emotion": emotion_data.get("primary_emotion", current_emotion["primary_emotion"]),
                "intensity": float(emotion_data.get("intensity", current_emotion["intensity"])),
                "valence": float(emotion_data.get("valence", current_emotion["valence"])),
                "arousal": float(emotion_data.get("arousal", current_emotion["arousal"])),
                "narrative": emotion_data.get("narrative", current_emotion["narrative"]),
            }
        else:
            new_emotion = current_emotion
    except (json.JSONDecodeError, ValueError, KeyError):
        new_emotion = current_emotion

    # Create memory of this observation
    memory_content = f"Observed: {observation}. Felt: {new_emotion['primary_emotion']} ({new_emotion['narrative']})"
    importance = llm.score_importance(memory_content)
    embedding = llm.generate_embedding(memory_content)

    new_memory: MemoryObject = {
        "id": str(uuid.uuid4()),
        "content": memory_content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "importance": importance,
        "memory_type": "observation",
        "embedding": embedding,
    }

    return {
        "emotional_state": new_emotion,
        "memory_stream": [new_memory],
        "importance_accumulator": state["importance_accumulator"] + importance,
    }


def plan_node(state: AgentState) -> dict:
    """
    PLAN: Decide what to do based on observation and retrieved memories.

    The agent considers their goals, personality, and relevant memories
    to formulate an intention before acting.

    Reference: Framework Section 2 (Agent reasoning loop)
    """
    llm = get_llm_client()

    # Retrieve relevant memories for the current context
    memory_stream = MemoryStream(state["agent_id"])
    memory_stream.from_list(state["memory_stream"])

    query = f"{state['current_observation']} {state['emotional_state']['narrative']}"
    retrieved = memory_stream.retrieve(query, k=5)

    # Format retrieved memories
    memories_context = "\n".join([
        f"- {m['content']} (importance: {m['importance']:.1f})"
        for m in retrieved
    ]) if retrieved else "No relevant memories."

    system_prompt = f"""You are simulating the thought process of {state['agent_name']}.

{_build_personality_context(state)}

{_build_emotional_context(state)}

{_build_reflection_memory_context(state)}

Relevant Memories:
{memories_context}

Based on your personality, current emotional state, and memories, decide what you intend to do.
Think about WHY you want to respond this way, not just WHAT you will say."""

    user_prompt = f"""Current Observation: "{state['current_observation']}"

Conversation so far:
{_format_conversation(state['conversation_history'][-5:])}

What do you plan to do? Consider your emotional state ({state['emotional_state']['primary_emotion']}) and personality.
Express your intention in 1-2 sentences."""

    plan = llm.complete(user_prompt, system_prompt=system_prompt, max_tokens=1500)

    # Create memory of the plan
    plan_memory: MemoryObject = {
        "id": str(uuid.uuid4()),
        "content": f"Planned: {plan.strip()}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "importance": 3.0,  # Plans are moderately important
        "memory_type": "plan",
        "embedding": llm.generate_embedding(plan),
    }

    return {
        "current_plan": plan.strip(),
        "retrieved_memories": retrieved,
        "memory_stream": [plan_memory],
    }


def act_node(state: AgentState) -> dict:
    """
    ACT: Execute the plan by generating a response.

    The agent produces their actual response based on their plan,
    personality, and emotional state. Responses are conversational
    (2-4 sentences) not essay-like.

    Reference: Framework Section 2 (Action generation)
    """
    llm = get_llm_client()

    system_prompt = f"""You are {state['agent_name']}, participating in a market research interview.

{_build_personality_context(state)}

{_build_emotional_context(state)}

{_build_reflection_memory_context(state)}

Your current intention: {state['current_plan']}

IMPORTANT GUIDELINES:
- Respond naturally and conversationally (2-4 sentences max)
- Let your personality and current emotion influence your tone
- Be authentic to your character - don't be overly polished or formal
- Share specific examples from your experience when relevant
- It's okay to express uncertainty or mixed feelings"""

    # Build conversation context
    conv_context = _format_conversation(state["conversation_history"][-3:])

    user_prompt = f"""Conversation so far:
{conv_context}

Interviewer: "{state['current_observation']}"

Respond as {state['agent_name']} (feeling {state['emotional_state']['primary_emotion']}):"""

    response = llm.complete(user_prompt, system_prompt=system_prompt, max_tokens=1500)

    # Create memory of the action
    action_memory: MemoryObject = {
        "id": str(uuid.uuid4()),
        "content": f"I responded: {response.strip()}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "importance": 4.0,  # Actions are moderately important
        "memory_type": "action",
        "embedding": llm.generate_embedding(response),
    }

    # Update conversation history
    new_exchange = {
        "question": state["current_observation"],
        "answer": response.strip(),
    }

    return {
        "current_action": response.strip(),
        "action_result": "Response generated successfully",
        "memory_stream": [action_memory],
        "conversation_history": state["conversation_history"] + [new_exchange],
        "iteration_count": state["iteration_count"] + 1,
    }


def reflect_node(state: AgentState) -> dict:
    """
    REFLECT: Generate high-level insights from recent experiences.

    Triggered when the importance accumulator exceeds the threshold.
    The agent synthesizes recent memories into generalizations about
    themselves, updating their self-conception.

    Reference: Framework Section 2.1.2 (Reflection and Higher-Order Reasoning)
    """
    llm = get_llm_client()

    # Get recent memories for reflection
    recent_memories = state["memory_stream"][-20:] if state["memory_stream"] else []

    if not recent_memories:
        return {"importance_accumulator": 0.0}

    # Format recent memories
    memories_text = "\n".join([
        f"- {m['content']}"
        for m in recent_memories
    ])

    system_prompt = f"""You are analyzing the recent experiences of {state['agent_name']} to generate insights.

{_build_personality_context(state)}

{_build_reflection_memory_context(state)}

Review the recent memories and generate 2-3 high-level insights or generalizations.
These should be self-realizations like:
- "I am becoming more interested in..."
- "I tend to feel frustrated when..."
- "My priorities seem to be shifting toward..."

Focus on patterns and what they reveal about the person's evolving attitudes or beliefs."""

    user_prompt = f"""Recent experiences:
{memories_text}

Generate 2-3 high-level insights about what these experiences reveal about {state['agent_name']}.
Format each insight on a new line, starting with "Insight:"."""

    response = llm.complete(user_prompt, system_prompt=system_prompt, max_tokens=1500)

    # Parse and store reflections
    reflection_memories: list[MemoryObject] = []
    now = datetime.now(timezone.utc).isoformat()

    for line in response.split("\n"):
        line = line.strip()
        if line.startswith("Insight:"):
            insight = line[8:].strip()
            if insight:
                reflection_memories.append({
                    "id": str(uuid.uuid4()),
                    "content": f"Reflection: {insight}",
                    "timestamp": now,
                    "importance": 8.0,  # Reflections are highly important
                    "memory_type": "reflection",
                    "embedding": llm.generate_embedding(insight),
                })

    return {
        "memory_stream": reflection_memories,
        "importance_accumulator": 0.0,  # Reset accumulator after reflection
        "last_reflection_time": now,
    }


def should_reflect(state: AgentState) -> Literal["reflect", "continue"]:
    """
    Conditional edge: Determine if the agent should enter reflection.

    Triggered when the sum of importance scores for recent events
    exceeds the reflection threshold.

    Reference: Framework Section 2.1.2 (Reflection triggering)
    """
    if state["importance_accumulator"] >= state.get("reflection_threshold", DEFAULT_REFLECTION_THRESHOLD):
        return "reflect"
    return "continue"


def should_terminate(state: AgentState) -> Literal["end", "continue"]:
    """
    Conditional edge: Determine if the workflow should terminate.

    Ends when:
    - should_terminate flag is set
    - Maximum iterations reached
    - Campaign questions exhausted
    """
    if state.get("should_terminate", False):
        return "end"

    if state["iteration_count"] >= state.get("max_iterations", 20):
        return "end"

    return "continue"


def _format_conversation(history: list[dict]) -> str:
    """Format conversation history for prompts."""
    if not history:
        return "(No previous conversation)"

    lines = []
    for exchange in history:
        q = exchange.get("question", "")
        a = exchange.get("answer", "")
        if q:
            lines.append(f"Interviewer: {q}")
        if a:
            lines.append(f"Participant: {a}")

    return "\n".join(lines) if lines else "(No previous conversation)"
