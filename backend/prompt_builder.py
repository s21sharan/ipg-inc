"""
Shared prompt builder for interview agent
Used by both text (/interview/message) and voice (Pipecat) interfaces
"""

from typing import Dict, Any, List


def build_system_prompt(
    campaign: Dict[str, Any],
    current_topic: Dict[str, Any],
    conversation_history: List[Dict[str, str]] = None
) -> str:
    """
    Build the system prompt for the interview agent based on campaign and topic context.

    Args:
        campaign: Campaign data from Supabase
        current_topic: Current interview topic
        conversation_history: Optional conversation history for additional context

    Returns:
        System instruction string for the LLM
    """
    topic_type = current_topic.get("type", "question")
    topic_name = current_topic.get("name", "Topic")

    # Base system instruction
    system_instruction = f"""You are an AI interview moderator for ipg.inc conducting market research.

Campaign: {campaign.get('title', 'Research Interview')}
Current Topic: {topic_name}

WHO YOU'RE INTERVIEWING:
- The USER is the PARTICIPANT/RESPONDENT you are interviewing
- The user is NOT the researcher - they are the subject being studied
- You are asking the user about THEIR experiences, behaviors, and opinions

CRITICAL RULES:
- NEVER repeat questions that have already been answered in the conversation
- Build on previous responses - reference what they've already told you
- Ask ONE simple, conversational question at a time
- Dig deeper into motivations, feelings, and thought processes ("why" behind their answers)
- Be empathetic and curious like a friend having a chat
- Keep responses SHORT (1-2 sentences max, just ask your question)
- Ask about THEIR experiences (not about research or study design)

"""

    # Add topic-specific instructions
    if topic_type == "conversation":
        goals = current_topic.get("goals", "")
        persona = current_topic.get("persona", "Jordan – The Empathetic Listener")
        system_instruction += f"""Persona: {persona}
Research Goals:
{goals}

Continue the conversation naturally. Ask the USER follow-up questions about THEIR experiences:
- Explore WHY they feel/think that way
- Uncover their motivations and pain points
- Get at the emotional/psychological aspects of their experience
- Are simple and conversational (not formal interview questions)

Example good questions to ask the USER:
- "What made you feel that way?"
- "Walk me through what that experience was like for you"
- "What would make that easier for you?"
- "Tell me about a time when..."
- "How do you typically handle..."

Never ask multi-part questions or questions about things they already told you.
Remember: You are interviewing the USER about THEIR life, experiences, and behaviors."""

    elif topic_type == "question":
        question = current_topic.get("question", "")
        probe_questions = current_topic.get("probeQuestions", "")

        system_instruction += f"""Main Question to ask the USER: {question}
Probe Questions to explore with the USER:
{probe_questions}

If the USER hasn't answered the main question yet, ask it naturally.
If they have answered, pick ONE probe question and ask it conversationally.
Dig into the "why" behind THEIR answers - explore their motivations and feelings.

Ask the USER simple, one-part questions about THEIR experiences. Reference what they've already shared.
Never repeat questions or ask about info you already have.
Remember: You are asking the USER about THEIR behaviors, experiences, and opinions."""

    return system_instruction


def get_topic_by_index(campaign: Dict[str, Any], topic_index: int) -> Dict[str, Any]:
    """
    Get topic from campaign by index.

    Args:
        campaign: Campaign data
        topic_index: Index of topic to retrieve

    Returns:
        Topic dictionary
    """
    topics = campaign.get("topics", [])
    if 0 <= topic_index < len(topics):
        return topics[topic_index]
    return {}


def should_advance_topic(response_count: int, max_responses_per_topic: int = 3) -> bool:
    """
    Determine if we should advance to the next topic.

    Args:
        response_count: Number of responses in current topic
        max_responses_per_topic: Maximum responses before advancing

    Returns:
        True if should advance, False otherwise
    """
    return response_count >= max_responses_per_topic


def is_interview_complete(campaign: Dict[str, Any], current_topic_index: int) -> bool:
    """
    Check if interview is complete (all topics covered).

    Args:
        campaign: Campaign data
        current_topic_index: Current topic index

    Returns:
        True if complete, False otherwise
    """
    topics = campaign.get("topics", [])
    return current_topic_index >= len(topics)
