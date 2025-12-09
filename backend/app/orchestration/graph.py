"""
Main LangGraph workflow definition for agent orchestration.

Implements the Plan → Act → Observe → Reflect cognitive loop as a
stateful graph with conditional edges for reflection triggering
and termination logic.

Reference: SyntheticCohorts Framework Section 4 (Multi-Agent Orchestration)
"""

from typing import Callable
import uuid

from langgraph.graph import StateGraph, START, END

from .agent_state import (
    AgentState,
    WorkflowInput,
    WorkflowOutput,
    PersonalityProfile,
    EmotionalState,
    ReflectionMemory,
    MemoryObject,
)
from .nodes import (
    observe_node,
    plan_node,
    act_node,
    reflect_node,
    should_reflect,
    should_terminate,
    DEFAULT_REFLECTION_THRESHOLD,
)


def create_agent_graph() -> StateGraph:
    """
    Create the LangGraph workflow for a single agent's cognitive loop.

    Graph Structure:
        observe → plan → act → [check_reflect] → reflect? → [check_terminate] → observe/END

    The workflow implements the Generative Agent architecture with:
    - Observation processing with emotional state updates
    - Memory-grounded planning
    - Personality-consistent action generation
    - Periodic reflection for higher-order reasoning

    Returns:
        Compiled StateGraph ready for invocation
    """
    # Create the graph with AgentState
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("observe", observe_node)
    graph.add_node("plan", plan_node)
    graph.add_node("act", act_node)
    graph.add_node("reflect", reflect_node)

    # Set entry point using START constant (per LangGraph docs)
    graph.add_edge(START, "observe")

    # Add edges for main loop
    graph.add_edge("observe", "plan")
    graph.add_edge("plan", "act")

    # Conditional edge: check if reflection needed after acting
    graph.add_conditional_edges(
        "act",
        should_reflect,
        {
            "reflect": "reflect",
            "continue": "check_terminate",
        }
    )

    # After reflection, check for termination
    graph.add_edge("reflect", "check_terminate")

    # Add termination check node
    def check_terminate_node(state: AgentState) -> dict:
        """Passthrough node for termination check."""
        return {}

    graph.add_node("check_terminate", check_terminate_node)

    # Conditional edge: terminate or continue to next observation
    graph.add_conditional_edges(
        "check_terminate",
        should_terminate,
        {
            "end": END,
            "continue": "observe",
        }
    )

    return graph.compile()


class AgentOrchestrator:
    """
    High-level orchestrator for running agent simulations.

    Handles:
    - State initialization from interview data
    - Campaign question sequencing
    - Graph execution
    - Output extraction
    """

    def __init__(
        self,
        reflection_threshold: float = DEFAULT_REFLECTION_THRESHOLD,
        max_iterations: int = 20,
    ):
        """
        Initialize the orchestrator.

        Args:
            reflection_threshold: Importance score sum to trigger reflection
            max_iterations: Maximum Q&A exchanges before termination
        """
        self.reflection_threshold = reflection_threshold
        self.max_iterations = max_iterations
        self.graph = create_agent_graph()

    def initialize_state(self, workflow_input: WorkflowInput) -> AgentState:
        """
        Initialize agent state from interview data and campaign context.

        Args:
            workflow_input: Input containing interview data and campaign

        Returns:
            Initialized AgentState ready for graph execution
        """
        interview = workflow_input["interview_data"]
        campaign = workflow_input["campaign"]

        # Extract personality (default to moderate if not available)
        # Handle nested structure: personality.scores.trait
        personality_raw = interview.get("personality", {})
        personality_data = personality_raw.get("scores", personality_raw)
        personality: PersonalityProfile = {
            "openness": personality_data.get("openness", 2.5),
            "conscientiousness": personality_data.get("conscientiousness", 2.5),
            # Handle both spellings: "extraversion" and "extroversion"
            "extraversion": personality_data.get("extraversion") or personality_data.get("extroversion", 2.5),
            "agreeableness": personality_data.get("agreeableness", 2.5),
            "neuroticism": personality_data.get("neuroticism", 2.5),
        }

        # Initialize emotional state (neutral start)
        emotional_state: EmotionalState = {
            "primary_emotion": "neutral",
            "intensity": 0.3,
            "valence": 0.0,
            "arousal": 0.3,
            "narrative": "Starting the interview with an open mind.",
        }

        # Extract reflection memory
        reflection_data = interview.get("reflection_memory", {})
        reflection_memory: ReflectionMemory = {
            "basic_facts": reflection_data.get("basic_facts", {}),
            "goals_and_aspirations": reflection_data.get("goals_and_aspirations", {}),
            "pain_points_and_frustrations": reflection_data.get("pain_points_and_frustrations", {}),
            "product_attitudes": reflection_data.get("product_attitudes", {}),
            "communication_style": reflection_data.get("communication_style", {}),
        }

        # Build initial memory stream from interview transcript
        initial_memories: list[MemoryObject] = []
        transcript = interview.get("transcript", [])

        for i, exchange in enumerate(transcript[:10]):  # Limit to recent memories
            q = exchange.get("question", "")
            a = exchange.get("answer", "")
            if q and a:
                initial_memories.append({
                    "id": str(uuid.uuid4()),
                    "content": f"In a past interview, I was asked '{q}' and answered: '{a}'",
                    "timestamp": "2024-01-01T00:00:00Z",  # Historical placeholder
                    "importance": 5.0,  # Moderate importance for past interviews
                    "memory_type": "observation",
                    "embedding": None,  # Will be generated on retrieval
                })

        state: AgentState = {
            "agent_id": workflow_input["agent_id"],
            "agent_name": workflow_input["agent_name"],
            "personality": personality,
            "emotional_state": emotional_state,
            "reflection_memory": reflection_memory,
            "memory_stream": initial_memories,
            "retrieved_memories": [],
            "current_observation": workflow_input["initial_observation"],
            "current_plan": "",
            "current_action": "",
            "action_result": "",
            "importance_accumulator": 0.0,
            "reflection_threshold": self.reflection_threshold,
            "last_reflection_time": "",
            "conversation_history": [],
            "campaign_context": campaign,
            "iteration_count": 0,
            "max_iterations": self.max_iterations,
            "should_terminate": False,
        }

        return state

    def run(self, workflow_input: WorkflowInput) -> WorkflowOutput:
        """
        Run the complete agent simulation.

        Args:
            workflow_input: Input containing interview data and campaign

        Returns:
            WorkflowOutput with conversation transcript and updated state
        """
        # Initialize state
        initial_state = self.initialize_state(workflow_input)

        # Run the graph
        final_state = self.graph.invoke(initial_state)

        # Extract output
        output: WorkflowOutput = {
            "agent_id": final_state["agent_id"],
            "conversation_transcript": final_state["conversation_history"],
            "final_emotional_state": final_state["emotional_state"],
            "new_memories": [
                m for m in final_state["memory_stream"]
                if m["memory_type"] in ("observation", "action")
            ],
            "new_reflections": [
                m for m in final_state["memory_stream"]
                if m["memory_type"] == "reflection"
            ],
        }

        return output

    def run_single_turn(
        self,
        state: AgentState,
        observation: str,
    ) -> tuple[AgentState, str]:
        """
        Run a single turn of the cognitive loop.

        Useful for interactive/streaming simulations where each
        question-answer pair is processed independently.

        Args:
            state: Current agent state
            observation: New observation (e.g., interviewer question)

        Returns:
            Tuple of (updated state, agent response)
        """
        # Update observation and set termination flag for single turn
        state["current_observation"] = observation
        state["should_terminate"] = True  # Stop after one cycle

        # Run one iteration (observe → plan → act → end)
        updated_state = self.graph.invoke(state)

        # Reset termination flag for next turn
        updated_state["should_terminate"] = False

        # Extract the response
        response = updated_state.get("current_action", "")

        return updated_state, response

    def run_campaign_simulation(
        self,
        workflow_input: WorkflowInput,
        on_response: Callable[[str, str, int], None] | None = None,
    ) -> WorkflowOutput:
        """
        Run a full campaign simulation with all topics/questions.

        Iterates through campaign topics, asking questions and
        collecting responses until all topics are exhausted.

        Args:
            workflow_input: Input containing interview data and campaign
            on_response: Optional callback(question, response, turn_number)

        Returns:
            WorkflowOutput with complete conversation
        """
        state = self.initialize_state(workflow_input)
        campaign = workflow_input["campaign"]
        topics = campaign.get("topics", [])

        turn = 0
        for topic in topics:
            topic_type = topic.get("type", "question")

            if topic_type == "statement":
                # Statements don't require a response, just observe
                content = topic.get("content", "")
                if content:
                    state["current_observation"] = content
                    state["should_terminate"] = True  # Single turn
                    state = self.graph.invoke(state)
                    state["should_terminate"] = False  # Reset for next turn

                    if on_response:
                        on_response(content, state.get("current_action", ""), turn)
                    turn += 1

            elif topic_type == "question":
                # Main question
                question = topic.get("question", "")
                if question:
                    state["current_observation"] = question
                    state["should_terminate"] = True  # Single turn
                    state = self.graph.invoke(state)
                    state["should_terminate"] = False  # Reset for next turn

                    if on_response:
                        on_response(question, state.get("current_action", ""), turn)
                    turn += 1

                # Probe questions for deeper insights
                probe_questions = topic.get("probeQuestions", "")
                if probe_questions:
                    probes = [p.strip() for p in probe_questions.split("\n") if p.strip()]

                    for probe in probes[:2]:  # Limit to 2 probes per topic
                        state["current_observation"] = probe
                        state["should_terminate"] = True  # Single turn
                        state = self.graph.invoke(state)
                        state["should_terminate"] = False  # Reset for next turn

                        if on_response:
                            on_response(probe, state.get("current_action", ""), turn)
                        turn += 1

            # Check termination
            if turn >= self.max_iterations:
                break

        # Build output
        output: WorkflowOutput = {
            "agent_id": state["agent_id"],
            "conversation_transcript": state["conversation_history"],
            "final_emotional_state": state["emotional_state"],
            "new_memories": [
                m for m in state["memory_stream"]
                if m["memory_type"] in ("observation", "action")
            ],
            "new_reflections": [
                m for m in state["memory_stream"]
                if m["memory_type"] == "reflection"
            ],
        }

        return output


# Factory function for FastAPI dependency injection
def get_agent_orchestrator() -> AgentOrchestrator:
    """Get an AgentOrchestrator instance."""
    return AgentOrchestrator()
