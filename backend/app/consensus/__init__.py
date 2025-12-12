"""
Consensus module for critic/judge evaluation and summary building.

Implements MetaGPT-style structured output generation where a critic
evaluates completed swarms and a consensus builder synthesizes insights.

Components:
- judge_state: TypedDict state definitions
- critic_agent: Critic/Judge for quality evaluation
- consensus_builder: Builds structured ConsensusSummary
"""

from .judge_state import (
    InsightQuote,
    KeyInsight,
    AgreementPoint,
    DisagreementPoint,
    ParticipationMetrics,
    QualityMetrics,
    CriticEvaluation,
    ConsensusSummary,
    ConsensusInput,
    JudgeState,
)
from .critic_agent import CriticAgent, create_critic_agent
from .consensus_builder import (
    ConsensusBuilder,
    create_consensus_builder,
    build_consensus_from_swarm,
)

__all__ = [
    # Insight types
    "InsightQuote",
    "KeyInsight",
    "AgreementPoint",
    "DisagreementPoint",
    # Metric types
    "ParticipationMetrics",
    "QualityMetrics",
    # Evaluation types
    "CriticEvaluation",
    "ConsensusSummary",
    "ConsensusInput",
    "JudgeState",
    # Critic
    "CriticAgent",
    "create_critic_agent",
    # Consensus Builder
    "ConsensusBuilder",
    "create_consensus_builder",
    "build_consensus_from_swarm",
]
