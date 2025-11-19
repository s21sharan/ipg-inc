"""
Guide engine for managing interview flow and step transitions.
Handles timing, probe selection, and conversation state management.
"""

import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
import random
from app.guide_models import (
    DiscussionGuide,
    GuideStep,
    StatementStep,
    ConversationStep,
    QuestionStep
)
from app.logging_utils import ConversationLogger


class StepState(Enum):
    """State of a guide step during execution"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class GuideEngine:
    """
    Engine for executing discussion guides.
    Manages state, timing, and transitions between steps.
    """

    def __init__(
        self,
        guide: DiscussionGuide,
        logger: Optional[ConversationLogger] = None
    ):
        self.guide = guide
        self.logger = logger
        self.current_step_index = -1
        self.current_step: Optional[GuideStep] = None
        self.step_states: Dict[str, StepState] = {}
        self.step_start_times: Dict[str, datetime] = {}
        self.step_metadata: Dict[str, Dict[str, Any]] = {}

        # Conversation state for current step
        self.conversation_turn_count = 0
        self.probes_asked: List[str] = []
        self.last_participant_response = ""
        self.step_timer_task: Optional[asyncio.Task] = None

        # Initialize step states
        for step in guide.steps:
            self.step_states[step.id] = StepState.NOT_STARTED
            self.step_metadata[step.id] = {}

    def get_current_step(self) -> Optional[GuideStep]:
        """Get the current step being executed"""
        return self.current_step

    def get_progress(self) -> Dict[str, Any]:
        """Get current progress through the guide"""
        completed_count = sum(
            1 for state in self.step_states.values()
            if state == StepState.COMPLETED
        )

        return {
            "current_step_index": self.current_step_index,
            "current_step_id": self.current_step.id if self.current_step else None,
            "current_step_name": self.current_step.name if self.current_step else None,
            "total_steps": len(self.guide.steps),
            "completed_steps": completed_count,
            "progress_percentage": (completed_count / len(self.guide.steps)) * 100
        }

    async def start(self) -> GuideStep:
        """Start the guide with the first step"""
        return await self.move_to_next_step()

    async def move_to_next_step(self) -> Optional[GuideStep]:
        """Move to the next step in the guide"""
        # Cancel any existing timer
        if self.step_timer_task:
            self.step_timer_task.cancel()

        # Mark current step as completed
        if self.current_step:
            self.step_states[self.current_step.id] = StepState.COMPLETED
            if self.logger:
                await self.logger.log_step_completed(
                    self.current_step.id,
                    self.step_metadata.get(self.current_step.id, {})
                )

        # Move to next step
        self.current_step_index += 1
        if self.current_step_index >= len(self.guide.steps):
            # Guide completed
            self.current_step = None
            return None

        self.current_step = self.guide.steps[self.current_step_index]
        self.step_states[self.current_step.id] = StepState.IN_PROGRESS
        self.step_start_times[self.current_step.id] = datetime.utcnow()

        # Reset step-specific state
        self.conversation_turn_count = 0
        self.probes_asked = []
        self.last_participant_response = ""

        # Start timer for this step
        self.step_timer_task = asyncio.create_task(
            self._step_timer(self.current_step.max_duration_minutes)
        )

        if self.logger:
            await self.logger.log_step_started(self.current_step.id, self.current_step.name)

        return self.current_step

    async def _step_timer(self, duration_minutes: int):
        """Timer to track step duration"""
        try:
            await asyncio.sleep(duration_minutes * 60)
            # Timer expired, should transition
            self.step_metadata[self.current_step.id]["timer_expired"] = True
        except asyncio.CancelledError:
            pass

    def is_step_time_expired(self) -> bool:
        """Check if current step's time limit has been reached"""
        if not self.current_step:
            return False

        start_time = self.step_start_times.get(self.current_step.id)
        if not start_time:
            return False

        elapsed = datetime.utcnow() - start_time
        max_duration = timedelta(minutes=self.current_step.max_duration_minutes)

        return elapsed >= max_duration

    def should_transition_step(self) -> bool:
        """Determine if it's time to transition to next step"""
        if not self.current_step:
            return False

        # Check timer
        if self.is_step_time_expired():
            return True

        # Step-specific logic
        if isinstance(self.current_step, StatementStep):
            # Statement steps transition after being read once
            return self.conversation_turn_count > 0

        elif isinstance(self.current_step, QuestionStep):
            # Question steps transition after minimum probes asked
            return len(self.probes_asked) >= self.current_step.min_probes

        elif isinstance(self.current_step, ConversationStep):
            # Conversation steps use soft timing and turn count
            # Transition after reasonable number of turns or time
            min_turns = 2  # At least 2 back-and-forth exchanges
            return (
                self.conversation_turn_count >= min_turns and
                self.is_step_time_expired()
            )

        return False

    def get_transition_message(self) -> str:
        """Get a natural transition message to the next step"""
        if not self.current_step:
            return ""

        next_step = self.guide.get_next_step(self.current_step_index)
        if not next_step:
            # End of guide
            return "Thank you so much for your time and insights. That concludes our interview."

        transitions = [
            "That's really helpful. Let me ask you about something else.",
            "Great insights. Let's move on to another topic.",
            "Thanks for sharing that. I'd like to explore a different area now.",
            "I appreciate your thoughts on that. Let's shift gears a bit.",
            "That's very interesting. Now I'd like to understand..."
        ]

        return random.choice(transitions)

    def record_participant_response(self, response: str):
        """Record the participant's last response"""
        self.last_participant_response = response
        self.conversation_turn_count += 1

    def record_agent_turn(self):
        """Record that the agent has taken a turn"""
        self.conversation_turn_count += 1

    def select_probe_questions(
        self,
        available_probes: List[str],
        participant_response: str,
        max_count: Optional[int] = None
    ) -> List[str]:
        """
        Select relevant probe questions based on participant response.

        Args:
            available_probes: List of available probe questions
            participant_response: The participant's last response
            max_count: Maximum number of probes to select

        Returns:
            List of selected probe questions
        """
        if not available_probes:
            return []

        if not max_count:
            max_count = 2  # Default to 2 probes

        # Filter out already asked probes
        remaining_probes = [p for p in available_probes if p not in self.probes_asked]

        if not remaining_probes:
            return []

        # Simple relevance scoring (can be enhanced with NLP)
        scored_probes = []
        response_lower = participant_response.lower()

        for probe in remaining_probes:
            score = 0
            probe_lower = probe.lower()

            # Check for keyword overlap
            probe_words = set(probe_lower.split())
            response_words = set(response_lower.split())
            overlap = len(probe_words & response_words)
            score += overlap * 10

            # Prioritize probes about topics not mentioned
            not_mentioned_keywords = [
                "else", "other", "more", "also", "addition", "besides"
            ]
            for keyword in not_mentioned_keywords:
                if keyword in probe_lower:
                    score += 5

            # Add some randomness to avoid predictability
            score += random.randint(0, 5)

            scored_probes.append((probe, score))

        # Sort by score and select top N
        scored_probes.sort(key=lambda x: x[1], reverse=True)
        selected = [probe for probe, _ in scored_probes[:max_count]]

        # Record selected probes
        self.probes_asked.extend(selected)

        return selected

    def get_next_probe(self, participant_response: str) -> Optional[str]:
        """Get the next probe question for the current step"""
        if not isinstance(self.current_step, QuestionStep):
            return None

        # Check if we've asked enough probes
        if len(self.probes_asked) >= self.current_step.max_probes:
            return None

        # Select one relevant probe
        probes = self.select_probe_questions(
            self.current_step.probe_questions_list,
            participant_response,
            max_count=1
        )

        return probes[0] if probes else None

    def format_probe_naturally(self, probe: str, participant_response: str) -> str:
        """Format probe question to sound more natural in conversation"""
        connectors = [
            f"You mentioned that. {probe}",
            f"That's interesting. {probe}",
            f"I see. {probe}",
            f"Thanks for sharing. {probe}",
            f"Got it. {probe}"
        ]

        # Choose connector based on response length
        if len(participant_response.split()) > 50:
            # Long response - acknowledge briefly
            return random.choice(connectors[:2])
        else:
            # Short response - use any connector
            return random.choice(connectors)

    def get_system_prompt_for_step(self) -> str:
        """Get the system prompt for the current step"""
        if not self.current_step:
            return "You are a friendly interviewer conducting a research interview."

        base_prompt = """You are a friendly, curious interviewer conducting a research interview.
        Keep responses conversational and natural. Ask one question at a time.
        Avoid corporate jargon. Use plain, everyday language."""

        if isinstance(self.current_step, StatementStep):
            return base_prompt + f"\n\nDeliver this statement naturally: {self.current_step.content}"

        elif isinstance(self.current_step, ConversationStep):
            persona_traits = self.current_step.persona
            goals = "\n".join(f"- {g}" for g in self.current_step.goals_list)

            return f"""{base_prompt}

            Persona: {persona_traits}

            Conversation Goals:
            {goals}

            Guide the conversation naturally toward these goals. Be curious and encouraging.
            Ask open-ended questions. Build on what the participant shares."""

        elif isinstance(self.current_step, QuestionStep):
            return f"""{base_prompt}

            Primary Question: {self.current_step.question}

            Ask this question clearly and let the participant respond fully.
            Listen actively and ask relevant follow-up questions to understand their perspective better."""

        return base_prompt

    def get_step_summary(self) -> Dict[str, Any]:
        """Get summary of current step execution"""
        if not self.current_step:
            return {}

        elapsed_time = None
        if self.current_step.id in self.step_start_times:
            elapsed = datetime.utcnow() - self.step_start_times[self.current_step.id]
            elapsed_time = elapsed.total_seconds()

        return {
            "step_id": self.current_step.id,
            "step_name": self.current_step.name,
            "step_type": self.current_step.type,
            "state": self.step_states[self.current_step.id].value,
            "turn_count": self.conversation_turn_count,
            "probes_asked": self.probes_asked,
            "elapsed_seconds": elapsed_time,
            "max_duration_minutes": self.current_step.max_duration_minutes,
            "should_transition": self.should_transition_step()
        }