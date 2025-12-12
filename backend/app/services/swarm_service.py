"""
Swarm Service for orchestrating multi-agent discussions.

Provides a unified interface for:
- Creating and managing swarm sessions
- Running swarm conversations
- Generating consensus summaries via critic/builder
- Database persistence for sessions, messages, and summaries
"""

import uuid
import asyncio
import threading
import logging
from datetime import datetime, timezone
from typing import Any
from supabase import Client

logger = logging.getLogger(__name__)

from ..swarm import (
    SwarmOrchestrator,
    SwarmOutput,
    SwarmMessage,
    SwarmConfig,
    DEFAULT_SWARM_CONFIG,
    create_swarm_orchestrator,
)
from ..consensus import (
    CriticAgent,
    ConsensusBuilder,
    CriticEvaluation,
    ConsensusSummary,
)


class SwarmService:
    """
    Service layer for swarm operations.

    Orchestrates swarm creation, execution, and consensus generation
    with database persistence.
    """

    def __init__(self, db: Client):
        """
        Initialize the swarm service.

        Args:
            db: Supabase client for database operations
        """
        self.db = db
        self._active_swarms: dict[str, SwarmOrchestrator] = {}

    def create_swarm(
        self,
        topic: str,
        agent_ids: list[str],
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Create and start a new swarm session.

        Args:
            topic: Discussion topic
            agent_ids: List of interview IDs to include as agents
            config: Optional swarm configuration overrides

        Returns:
            Dict with swarm_id and status

        Raises:
            ValueError: If validation fails
        """
        # Validate inputs
        if not topic or not topic.strip():
            raise ValueError("topic is required and cannot be empty")

        if not agent_ids:
            raise ValueError("agent_ids is required and cannot be empty")

        if len(agent_ids) < 2:
            raise ValueError("Swarm requires at least 2 agents")

        # Fetch interview data for agents (supports both interview IDs and conversation IDs)
        interviews, resolved_ids = self._get_interviews(agent_ids)

        # Validate all agent IDs were resolved
        missing = set(agent_ids) - resolved_ids
        if missing:
            raise ValueError(f"Agents not found: {', '.join(missing)}")

        # Deduplicate interviews (multiple conversation IDs may map to same interview)
        seen_ids = set()
        unique_interviews = []
        for interview in interviews:
            if interview["id"] not in seen_ids:
                seen_ids.add(interview["id"])
                unique_interviews.append(interview)
        interviews = unique_interviews

        # Create session in database
        swarm_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        merged_config = {**DEFAULT_SWARM_CONFIG}
        if config:
            merged_config.update(config)

        session_data = {
            "id": swarm_id,
            "topic": topic,
            "status": "active",
            "config": merged_config,
            "created_at": now,
            "completed_at": None,
        }

        self.db.table("swarm_sessions").insert(session_data).execute()

        # Create participant records
        for interview in interviews:
            participant_data = {
                "id": str(uuid.uuid4()),
                "swarm_id": swarm_id,
                "interview_id": interview["id"],
                "agent_name": interview.get("name", "Unknown"),
            }
            self.db.table("swarm_participants").insert(participant_data).execute()

        # Start swarm in background thread (truly async)
        thread = threading.Thread(
            target=self._run_swarm_background,
            args=(swarm_id, topic, interviews, merged_config),
            daemon=True,
        )
        thread.start()

        return {
            "swarm_id": swarm_id,
            "status": "active",
            "topic": topic,
            "participant_count": len(interviews),
        }

    def get_swarm_status(self, swarm_id: str) -> dict[str, Any] | None:
        """
        Get current status of a swarm session.

        Args:
            swarm_id: ID of the swarm

        Returns:
            Swarm session data with message count, or None if not found
        """
        result = (
            self.db.table("swarm_sessions")
            .select("*")
            .eq("id", swarm_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return None

        session = result.data[0]

        # Get message count
        messages_result = (
            self.db.table("swarm_messages")
            .select("id")
            .eq("swarm_id", swarm_id)
            .execute()
        )

        message_count = len(messages_result.data) if messages_result.data else 0

        return {
            **session,
            "message_count": message_count,
        }

    def get_messages(
        self,
        swarm_id: str,
        offset: int = 0,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Get messages from a swarm session with pagination.

        Args:
            swarm_id: ID of the swarm
            offset: Number of messages to skip
            limit: Maximum messages to return

        Returns:
            List of message dictionaries
        """
        result = (
            self.db.table("swarm_messages")
            .select("*")
            .eq("swarm_id", swarm_id)
            .order("turn_number")
            .range(offset, offset + limit - 1)
            .execute()
        )

        return result.data or []

    def get_participants(self, swarm_id: str) -> list[dict[str, Any]]:
        """
        Get participants in a swarm session.

        Args:
            swarm_id: ID of the swarm

        Returns:
            List of participant dictionaries
        """
        result = (
            self.db.table("swarm_participants")
            .select("*")
            .eq("swarm_id", swarm_id)
            .execute()
        )

        return result.data or []

    def stop_swarm(self, swarm_id: str) -> bool:
        """
        Manually stop an active swarm session.

        Args:
            swarm_id: ID of the swarm to stop

        Returns:
            True if stopped successfully, False if not found or already completed
        """
        # Check current status
        result = (
            self.db.table("swarm_sessions")
            .select("status")
            .eq("id", swarm_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return False

        session = result.data[0]
        if session["status"] != "active":
            return False

        # Update status to terminated
        now = datetime.now(timezone.utc).isoformat()
        self.db.table("swarm_sessions").update({
            "status": "terminated",
            "completed_at": now,
        }).eq("id", swarm_id).execute()

        # Remove from active swarms
        if swarm_id in self._active_swarms:
            del self._active_swarms[swarm_id]

        return True

    def get_consensus(self, swarm_id: str) -> dict[str, Any] | None:
        """
        Get the consensus summary for a completed swarm.

        Args:
            swarm_id: ID of the swarm

        Returns:
            Consensus summary dictionary, or None if not available
        """
        result = (
            self.db.table("consensus_summaries")
            .select("*")
            .eq("swarm_id", swarm_id)
            .limit(1)
            .execute()
        )

        return result.data[0] if result.data else None

    def generate_consensus(
        self,
        swarm_output: SwarmOutput,
        force: bool = False,
    ) -> ConsensusSummary | None:
        """
        Generate consensus summary from completed swarm output.

        Uses CriticAgent to evaluate quality, then ConsensusBuilder
        to synthesize insights if quality is sufficient.

        Args:
            swarm_output: Output from completed swarm
            force: Generate even if critic recommends against it

        Returns:
            ConsensusSummary if generated, None if skipped
        """
        # Run critic evaluation
        critic = CriticAgent()
        evaluation = critic.evaluate(swarm_output)

        # Check if we should proceed
        if not force and not evaluation["proceed_to_consensus"]:
            return None

        # Build consensus
        builder = ConsensusBuilder()
        consensus = builder.build_consensus(swarm_output, evaluation)

        # Store in database
        self._store_consensus(consensus, evaluation)

        return consensus

    def _get_interviews(self, agent_ids: list[str]) -> tuple[list[dict[str, Any]], set[str]]:
        """Fetch interview data for given IDs.

        Supports both interview IDs and conversation IDs.
        For conversation IDs, looks up interview_id or source_interview_id column.

        Returns:
            Tuple of (interviews list, set of resolved input IDs)
        """
        resolved_ids: set[str] = set()

        # First try direct interview lookup
        result = (
            self.db.table("interviews")
            .select("*")
            .in_("id", agent_ids)
            .execute()
        )

        found_interviews = result.data or []
        found_ids = {i["id"] for i in found_interviews}
        resolved_ids.update(found_ids)

        # For any IDs not found as interviews, try looking up as conversation IDs
        missing_ids = [aid for aid in agent_ids if aid not in found_ids]
        if missing_ids:
            # Look up conversations - try both column names for compatibility
            # (schema uses source_interview_id, but simulation may use interview_id)
            conv_result = (
                self.db.table("conversations")
                .select("*")
                .in_("id", missing_ids)
                .execute()
            )

            if conv_result.data:
                # Track which conversation IDs were resolved
                # Check both possible column names
                conv_to_interview = {}
                for c in conv_result.data:
                    interview_id = c.get("interview_id") or c.get("source_interview_id")
                    if interview_id:
                        conv_to_interview[c["id"]] = interview_id

                resolved_ids.update(conv_to_interview.keys())

                interview_ids = list(conv_to_interview.values())
                if interview_ids:
                    # Fetch these interviews
                    additional = (
                        self.db.table("interviews")
                        .select("*")
                        .in_("id", interview_ids)
                        .execute()
                    )
                    if additional.data:
                        found_interviews.extend(additional.data)

        return found_interviews, resolved_ids

    def _run_swarm_background(
        self,
        swarm_id: str,
        topic: str,
        interviews: list[dict],
        config: dict[str, Any],
    ) -> None:
        """
        Start swarm execution in background thread.

        Runs the full swarm conversation and generates consensus.
        Updates database incrementally as messages are generated.
        """
        logger.info(f"Starting swarm {swarm_id} with {len(interviews)} agents")
        try:
            orchestrator = create_swarm_orchestrator(
                config.get("speaker_selection", "dynamic")
            )

            self._active_swarms[swarm_id] = orchestrator

            # Initialize swarm
            state = orchestrator.initialize_swarm(
                topic=topic,
                interviews=interviews,
                config=config,
                load_memories=config.get("load_memories", True),
            )

            # Update swarm_id in state to match our DB record
            state["swarm_id"] = swarm_id

            # Run swarm with message callback
            def on_message(msg: SwarmMessage) -> None:
                self._save_message(swarm_id, msg)

            final_state = orchestrator.run_swarm(state, on_message=on_message)

            # Get output and generate consensus
            output = orchestrator.get_output(final_state)

            # Mark swarm as completed immediately so frontend can show messages
            now = datetime.now(timezone.utc).isoformat()
            self.db.table("swarm_sessions").update({
                "status": "completed",
                "completed_at": now,
            }).eq("id", swarm_id).execute()

            logger.info(f"Swarm {swarm_id} completed, starting consensus generation in background...")

            # Generate consensus in background (don't block the completion)
            if final_state["status"] == "completed":
                try:
                    self.generate_consensus(output)
                    logger.info(f"Swarm {swarm_id} consensus generated successfully")
                except Exception as e:
                    logger.error(f"Swarm {swarm_id} consensus generation failed: {e}")

            logger.info(f"Swarm {swarm_id} finished with status: {final_state['status']}")

        except Exception as e:
            # Mark session as failed
            logger.error(f"Swarm {swarm_id} failed: {e}")
            self.db.table("swarm_sessions").update({
                "status": "error",
                "error": str(e),
            }).eq("id", swarm_id).execute()

        finally:
            # Cleanup
            if swarm_id in self._active_swarms:
                del self._active_swarms[swarm_id]

    def _save_message(self, swarm_id: str, message: SwarmMessage) -> None:
        """Save a swarm message to the database."""
        message_data = {
            "id": message["id"],
            "swarm_id": swarm_id,
            "turn_number": message["turn_number"],
            "speaker_id": message["speaker_id"],
            "speaker_name": message["speaker_name"],
            "content": message["content"],
            "message_type": message["message_type"],
            "created_at": message["timestamp"],
        }

        self.db.table("swarm_messages").insert(message_data).execute()

    def _store_consensus(
        self,
        consensus: ConsensusSummary,
        evaluation: CriticEvaluation,
    ) -> None:
        """Store consensus summary in database."""
        consensus_data = {
            "id": str(uuid.uuid4()),
            "swarm_id": consensus["swarm_id"],
            "key_insights": consensus["key_insights"],
            "areas_of_agreement": consensus["areas_of_agreement"],
            "areas_of_disagreement": consensus["areas_of_disagreement"],
            "synthesized_conclusion": consensus["synthesized_conclusion"],
            "actionable_items": consensus["actionable_items"],
            "confidence_score": consensus["confidence_score"],
            "consensus_strength": consensus["consensus_strength"],
            "critic_evaluation": {
                "quality": evaluation["quality"],
                "participation": evaluation["participation"],
                "flags": evaluation["flags"],
                "recommendations": evaluation["recommendations"],
            },
            "generated_at": consensus["generated_at"],
        }

        self.db.table("consensus_summaries").insert(consensus_data).execute()


def create_swarm_service(db: Client) -> SwarmService:
    """
    Factory function for creating SwarmService.

    Args:
        db: Supabase client

    Returns:
        Configured SwarmService
    """
    return SwarmService(db)
