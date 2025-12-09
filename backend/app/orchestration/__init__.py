"""
LangGraph-based LLM Orchestration for SyntheticCohorts Framework.

This module provides the core cognitive architecture for generative agents,
implementing the Plan → Act → Observe → Reflect reasoning loop as described
in the SyntheticCohorts framework documentation.

Components:
- agent_state: TypedDict state definitions for LangGraph workflows
- llm_client: OpenAI client wrapper with model configuration
- memory_stream: Agent memory with recency/importance/relevance retrieval
- nodes: LangGraph node implementations (Plan, Act, Observe, Reflect)
- graph: Main workflow graph definition and compilation
"""

from .agent_state import (
    AgentState,
    MemoryObject,
    PersonalityProfile,
    EmotionalState,
    ReflectionMemory,
    WorkflowInput,
    WorkflowOutput,
)
from .llm_client import LLMClient, get_llm_client
from .memory_stream import MemoryStream
from .nodes import plan_node, act_node, observe_node, reflect_node, should_reflect
from .graph import create_agent_graph, AgentOrchestrator

__all__ = [
    # State
    "AgentState",
    "MemoryObject",
    "PersonalityProfile",
    "EmotionalState",
    "ReflectionMemory",
    "WorkflowInput",
    "WorkflowOutput",
    # LLM
    "LLMClient",
    "get_llm_client",
    # Memory
    "MemoryStream",
    # Nodes
    "plan_node",
    "act_node",
    "observe_node",
    "reflect_node",
    "should_reflect",
    # Graph
    "create_agent_graph",
    "AgentOrchestrator",
]
