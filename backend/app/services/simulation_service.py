import uuid
import asyncio
from typing import Any
from openai import OpenAI
from supabase import Client

from app.config import get_settings


class SimulationService:
    """Service for running conversation simulations with AI agents."""

    def __init__(self, db: Client):
        self.db = db
        settings = get_settings()
        self.openai = OpenAI(api_key=settings.openai_api_key)

    def get_campaign(self, campaign_id: str) -> dict | None:
        """Get campaign by ID."""
        result = self.db.table("campaigns").select("*").eq("id", campaign_id).single().execute()
        return result.data if result.data else None

    def get_workspace_interviews(self, workspace_id: str) -> list[dict]:
        """Get all interviews for a workspace."""
        result = self.db.table("interviews").select("*").eq("workspace_id", workspace_id).execute()
        return result.data or []

    def get_simulation_status(self, campaign_id: str) -> dict:
        """Get current simulation status for a campaign."""
        result = self.db.table("conversations").select("status").eq("campaign_id", campaign_id).execute()

        conversations = result.data or []
        status_counts = {
            "total": len(conversations),
            "completed": sum(1 for c in conversations if c["status"] == "completed"),
            "in_progress": sum(1 for c in conversations if c["status"] == "in_progress"),
            "failed": sum(1 for c in conversations if c["status"] == "failed"),
            "pending": sum(1 for c in conversations if c["status"] == "pending"),
        }
        return status_counts

    def delete_conversations(self, conversation_ids: list[str]) -> int:
        """Delete specific conversations."""
        result = self.db.table("conversations").delete().in_("id", conversation_ids).execute()
        return len(result.data) if result.data else 0

    def delete_all_campaign_conversations(self, campaign_id: str) -> int:
        """Delete all conversations for a campaign."""
        result = self.db.table("conversations").delete().eq("campaign_id", campaign_id).execute()
        return len(result.data) if result.data else 0

    async def run_simulation(
        self,
        campaign_id: str,
        interviews: list[dict],
        campaign: dict,
        batch_size: int = 10,
    ):
        """Run simulation for all interviews in batches."""
        # Create conversation records for all interviews
        for interview in interviews:
            self.db.table("conversations").insert({
                "id": str(uuid.uuid4()),
                "campaign_id": campaign_id,
                "interview_id": interview["id"],
                "participant_name": interview["name"],
                "status": "pending",
                "transcript": [],
            }).execute()

        # Process in batches
        for i in range(0, len(interviews), batch_size):
            batch = interviews[i:i + batch_size]
            await self._process_batch(campaign_id, batch, campaign)

    async def _process_batch(
        self,
        campaign_id: str,
        interviews: list[dict],
        campaign: dict,
    ):
        """Process a batch of interviews."""
        tasks = []
        for interview in interviews:
            tasks.append(self._simulate_conversation(campaign_id, interview, campaign))

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _simulate_conversation(
        self,
        campaign_id: str,
        interview: dict,
        campaign: dict,
    ):
        """Simulate a single conversation with an AI agent."""
        conversation_id = None

        try:
            # Get conversation record
            result = self.db.table("conversations").select("id").eq(
                "campaign_id", campaign_id
            ).eq("interview_id", interview["id"]).single().execute()

            if not result.data:
                return

            conversation_id = result.data["id"]

            # Update status to in_progress
            self.db.table("conversations").update({
                "status": "in_progress"
            }).eq("id", conversation_id).execute()

            # Build agent context from interview data
            agent_context = self._build_agent_context(interview)

            # Get discussion topics from campaign
            topics = campaign.get("topics", [])

            # Run the conversation
            transcript = await self._run_conversation(agent_context, topics)

            # Update conversation with results
            self.db.table("conversations").update({
                "status": "completed",
                "transcript": transcript,
            }).eq("id", conversation_id).execute()

        except Exception as e:
            if conversation_id:
                self.db.table("conversations").update({
                    "status": "failed",
                    "error": str(e),
                }).eq("id", conversation_id).execute()
            raise

    def _build_agent_context(self, interview: dict) -> str:
        """Build context for the AI agent from interview data."""
        context_parts = [
            f"You are roleplaying as {interview.get('name', 'a user')}.",
            f"Summary: {interview.get('summary', 'No summary available')}",
        ]

        # Add reflection memory if available
        if interview.get("reflection_memory"):
            rm = interview["reflection_memory"]
            if rm.get("personality_summary"):
                context_parts.append(f"Personality: {rm['personality_summary']}")
            if rm.get("goals"):
                context_parts.append(f"Goals: {', '.join(rm['goals'])}")
            if rm.get("pain_points"):
                context_parts.append(f"Pain points: {', '.join(rm['pain_points'])}")

        # Add demographics
        demographics = []
        if interview.get("age"):
            demographics.append(f"{interview['age']} years old")
        if interview.get("occupation"):
            demographics.append(interview["occupation"])
        if interview.get("country"):
            demographics.append(f"from {interview['country']}")

        if demographics:
            context_parts.append(f"Demographics: {', '.join(demographics)}")

        return "\n".join(context_parts)

    async def _run_conversation(
        self,
        agent_context: str,
        topics: list[dict],
    ) -> list[dict]:
        """Run a multi-turn conversation."""
        transcript = []
        messages = [
            {"role": "system", "content": self._get_agent_system_prompt(agent_context)}
        ]

        for topic in topics:
            # Interviewer asks question
            question = topic.get("question", topic.get("statement", ""))
            if not question:
                continue

            transcript.append({
                "role": "interviewer",
                "content": question,
            })
            messages.append({"role": "user", "content": question})

            # Agent responds
            response = self.openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=150,
                temperature=0.8,
            )

            agent_response = response.choices[0].message.content
            transcript.append({
                "role": "participant",
                "content": agent_response,
            })
            messages.append({"role": "assistant", "content": agent_response})

            # Follow-up probes
            probes = topic.get("probes", [])
            for probe in probes[:2]:  # Max 2 follow-ups
                transcript.append({
                    "role": "interviewer",
                    "content": probe,
                    "is_followup": True,
                })
                messages.append({"role": "user", "content": probe})

                response = self.openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=150,
                    temperature=0.8,
                )

                agent_response = response.choices[0].message.content
                transcript.append({
                    "role": "participant",
                    "content": agent_response,
                    "is_followup": True,
                })
                messages.append({"role": "assistant", "content": agent_response})

        return transcript

    def _get_agent_system_prompt(self, agent_context: str) -> str:
        """Get the system prompt for the AI agent."""
        return f"""You are participating in a market research interview. Stay in character based on this context:

{agent_context}

Guidelines:
- Respond naturally and conversationally in 2-4 sentences
- Be authentic to your character's perspective and experiences
- Share specific examples when relevant
- Express genuine opinions and emotions
- Don't be overly formal or robotic"""
