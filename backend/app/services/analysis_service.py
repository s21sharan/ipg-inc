import uuid
import json
from typing import Any
from openai import OpenAI
from supabase import Client

from app.config import get_settings


class AnalysisService:
    """Service for analyzing conversation data and generating reports."""

    def __init__(self, db: Client):
        self.db = db
        settings = get_settings()
        self.openai = OpenAI(api_key=settings.openai_api_key)

    def get_completed_conversations(self, campaign_id: str) -> list[dict]:
        """Get all completed conversations for a campaign."""
        result = self.db.table("conversations").select(
            "*, interviews(name, summary, demographics)"
        ).eq("campaign_id", campaign_id).eq("status", "completed").execute()
        return result.data or []

    def create_analysis_record(self, campaign_id: str) -> str:
        """Create a new analysis record."""
        # Get next version number
        existing = self.db.table("campaign_analyses").select("version").eq(
            "campaign_id", campaign_id
        ).order("version", desc=True).limit(1).execute()

        version = 1
        if existing.data:
            version = existing.data[0]["version"] + 1

        analysis_id = str(uuid.uuid4())
        self.db.table("campaign_analyses").insert({
            "id": analysis_id,
            "campaign_id": campaign_id,
            "version": version,
            "status": "processing",
        }).execute()

        return analysis_id

    def get_latest_analysis_status(self, campaign_id: str) -> dict:
        """Get the latest analysis status for a campaign."""
        result = self.db.table("campaign_analyses").select("*").eq(
            "campaign_id", campaign_id
        ).order("version", desc=True).limit(1).execute()

        if not result.data:
            return {
                "analysis_id": None,
                "status": "none",
                "version": None,
                "total_batches": None,
                "completed_batches": None,
                "report_markdown": None,
            }

        analysis = result.data[0]
        return {
            "analysis_id": analysis["id"],
            "status": analysis["status"],
            "version": analysis["version"],
            "total_batches": analysis.get("total_batches"),
            "completed_batches": analysis.get("completed_batches"),
            "report_markdown": analysis.get("report_markdown"),
        }

    def get_analysis(self, analysis_id: str) -> dict | None:
        """Get a specific analysis by ID."""
        result = self.db.table("campaign_analyses").select("*").eq(
            "id", analysis_id
        ).single().execute()
        return result.data

    def get_analysis_history(self, campaign_id: str) -> list[dict]:
        """Get all analyses for a campaign."""
        result = self.db.table("campaign_analyses").select(
            "id, version, status, created_at"
        ).eq("campaign_id", campaign_id).order("version", desc=True).execute()
        return result.data or []

    async def run_analysis(
        self,
        analysis_id: str,
        campaign_id: str,
        conversations: list[dict],
        batch_size: int = 50,
    ):
        """Run analysis on conversations."""
        try:
            # Split into batches if needed
            if len(conversations) <= batch_size:
                # Single batch analysis
                report = await self._analyze_batch(conversations)
                self._save_analysis_result(analysis_id, report)
            else:
                # Multi-batch analysis
                await self._run_multi_batch_analysis(
                    analysis_id, conversations, batch_size
                )
        except Exception as e:
            self.db.table("campaign_analyses").update({
                "status": "failed",
                "error": str(e),
            }).eq("id", analysis_id).execute()
            raise

    async def _analyze_batch(self, conversations: list[dict]) -> str:
        """Analyze a batch of conversations and return markdown report."""
        # Build input text from conversations
        input_text = self._build_analysis_input(conversations)

        response = self.openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": self._get_analysis_system_prompt()},
                {"role": "user", "content": input_text},
            ],
            max_tokens=4000,
            temperature=0.3,
        )

        return response.choices[0].message.content

    async def _run_multi_batch_analysis(
        self,
        analysis_id: str,
        conversations: list[dict],
        batch_size: int,
    ):
        """Run multi-batch analysis for large conversation sets."""
        batches = [
            conversations[i:i + batch_size]
            for i in range(0, len(conversations), batch_size)
        ]

        # Update total batches
        self.db.table("campaign_analyses").update({
            "total_batches": len(batches),
            "completed_batches": 0,
        }).eq("id", analysis_id).execute()

        # Analyze each batch
        batch_reports = []
        for i, batch in enumerate(batches):
            report = await self._analyze_batch(batch)
            batch_reports.append(report)

            # Update progress
            self.db.table("campaign_analyses").update({
                "completed_batches": i + 1,
            }).eq("id", analysis_id).execute()

        # Merge batch reports
        final_report = await self._merge_reports(batch_reports, len(conversations))
        self._save_analysis_result(analysis_id, final_report)

    async def _merge_reports(self, reports: list[str], total_count: int) -> str:
        """Merge multiple batch reports into a final report."""
        combined = "\n\n---\n\n".join(reports)

        response = self.openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": self._get_merge_system_prompt(total_count)},
                {"role": "user", "content": combined},
            ],
            max_tokens=4000,
            temperature=0.3,
        )

        return response.choices[0].message.content

    def _save_analysis_result(self, analysis_id: str, report: str):
        """Save the analysis result."""
        self.db.table("campaign_analyses").update({
            "status": "completed",
            "report_markdown": report,
        }).eq("id", analysis_id).execute()

    def _build_analysis_input(self, conversations: list[dict]) -> str:
        """Build input text for analysis."""
        parts = []
        for conv in conversations:
            participant = conv.get("participant_name", "Unknown")
            transcript = conv.get("transcript", [])

            conv_text = f"## {participant}\n"
            for item in transcript:
                role = "Q" if item["role"] == "interviewer" else "A"
                conv_text += f"{role}: {item['content']}\n"

            parts.append(conv_text)

        return "\n\n".join(parts)

    def _get_analysis_system_prompt(self) -> str:
        """Get system prompt for analysis."""
        return """You are a market research analyst. Analyze these interview conversations and generate a comprehensive report.

Your report should include:
1. **Executive Summary** - Key findings in 3-5 bullet points
2. **Themes & Patterns** - Major themes that emerged with supporting quotes
3. **Question-by-Question Analysis** - Insights for each discussion topic
4. **Statistical Summary** - Percentages and counts (e.g., "X% of participants mentioned...")
5. **Recommendations** - Actionable insights based on findings

Use citations in format [INT:conversation_id|BLK:block_index] when quoting participants.
Format as clean markdown with headers, bullet points, and blockquotes for quotes."""

    def _get_merge_system_prompt(self, total_count: int) -> str:
        """Get system prompt for merging batch reports."""
        return f"""You are merging multiple analysis reports into one comprehensive report.

Total participants analyzed: {total_count}

Combine the insights from all batch reports:
- Recalculate percentages based on the total count
- Merge similar themes and deduplicate insights
- Keep the best/most representative quotes
- Maintain the standard report structure

Output a single, cohesive markdown report."""
