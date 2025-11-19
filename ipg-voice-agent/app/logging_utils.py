"""
Logging utilities for conversation transcripts and metadata.
Handles structured logging of interview sessions.
"""

import json
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path
from integrations.supabase_client import SupabaseClient


class ConversationLogger:
    """
    Logger for interview conversations.
    Saves transcripts to both local files and Supabase.
    """

    def __init__(self, session_id: str, log_dir: str = "logs"):
        self.session_id = session_id
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)

        # Create session directory
        self.session_dir = self.log_dir / session_id
        self.session_dir.mkdir(exist_ok=True)

        # File paths
        self.transcript_file = self.session_dir / "transcript.jsonl"
        self.metadata_file = self.session_dir / "metadata.json"
        self.summary_file = self.session_dir / "summary.json"

        # Supabase client
        self.supabase = SupabaseClient()

        # In-memory buffers
        self.transcript_buffer: List[Dict[str, Any]] = []
        self.metadata: Dict[str, Any] = {
            "session_id": session_id,
            "started_at": datetime.utcnow().isoformat(),
            "steps_completed": []
        }

        # Counters
        self.utterance_count = 0
        self.agent_utterances = 0
        self.participant_utterances = 0

    async def initialize(self) -> None:
        """Initialize the logger and write initial metadata"""
        await self._write_metadata()

    async def log_agent_utterance(
        self,
        text: str,
        step_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log an agent utterance"""
        entry = {
            "id": self.utterance_count,
            "timestamp": datetime.utcnow().isoformat(),
            "speaker": "agent",
            "text": text,
            "step_id": step_id,
            "metadata": metadata or {}
        }

        self.utterance_count += 1
        self.agent_utterances += 1
        self.transcript_buffer.append(entry)

        # Write to file
        await self._append_to_transcript(entry)

        # Save to Supabase
        await self.supabase.save_transcript_entry(
            interview_id=self.session_id,
            speaker="agent",
            text=text,
            topic_id=step_id,
            metadata=metadata
        )

    async def log_participant_utterance(
        self,
        text: str,
        step_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log a participant utterance"""
        entry = {
            "id": self.utterance_count,
            "timestamp": datetime.utcnow().isoformat(),
            "speaker": "participant",
            "text": text,
            "step_id": step_id,
            "metadata": metadata or {}
        }

        self.utterance_count += 1
        self.participant_utterances += 1
        self.transcript_buffer.append(entry)

        # Write to file
        await self._append_to_transcript(entry)

        # Save to Supabase
        await self.supabase.save_transcript_entry(
            interview_id=self.session_id,
            speaker="participant",
            text=text,
            topic_id=step_id,
            metadata=metadata
        )

    async def log_step_started(self, step_id: str, step_name: str) -> None:
        """Log the start of a guide step"""
        event = {
            "type": "step_started",
            "timestamp": datetime.utcnow().isoformat(),
            "step_id": step_id,
            "step_name": step_name
        }

        await self._append_to_transcript(event)

    async def log_step_completed(
        self,
        step_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log the completion of a guide step"""
        event = {
            "type": "step_completed",
            "timestamp": datetime.utcnow().isoformat(),
            "step_id": step_id,
            "metadata": metadata or {}
        }

        self.metadata["steps_completed"].append(step_id)
        await self._append_to_transcript(event)
        await self._write_metadata()

    async def log_event(
        self,
        event_type: str,
        data: Dict[str, Any]
    ) -> None:
        """Log a generic event"""
        event = {
            "type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }

        await self._append_to_transcript(event)

    async def finalize(self) -> None:
        """Finalize logging and write summary"""
        self.metadata["completed_at"] = datetime.utcnow().isoformat()
        self.metadata["total_utterances"] = self.utterance_count
        self.metadata["agent_utterances"] = self.agent_utterances
        self.metadata["participant_utterances"] = self.participant_utterances

        await self._write_metadata()
        await self._write_summary()

    async def _append_to_transcript(self, entry: Dict[str, Any]) -> None:
        """Append entry to transcript file"""
        try:
            with open(self.transcript_file, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            print(f"Error writing to transcript: {e}")

    async def _write_metadata(self) -> None:
        """Write metadata to file"""
        try:
            with open(self.metadata_file, "w") as f:
                json.dump(self.metadata, f, indent=2)
        except Exception as e:
            print(f"Error writing metadata: {e}")

    async def _write_summary(self) -> None:
        """Write conversation summary"""
        summary = {
            "session_id": self.session_id,
            "duration_seconds": None,
            "total_utterances": self.utterance_count,
            "agent_utterances": self.agent_utterances,
            "participant_utterances": self.participant_utterances,
            "steps_completed": len(self.metadata.get("steps_completed", [])),
            "transcript_preview": []
        }

        # Calculate duration
        if "started_at" in self.metadata and "completed_at" in self.metadata:
            start = datetime.fromisoformat(self.metadata["started_at"])
            end = datetime.fromisoformat(self.metadata["completed_at"])
            summary["duration_seconds"] = (end - start).total_seconds()

        # Add transcript preview (first 5 exchanges)
        for entry in self.transcript_buffer[:10]:
            if entry.get("speaker"):
                summary["transcript_preview"].append({
                    "speaker": entry["speaker"],
                    "text": entry["text"][:100] + "..." if len(entry["text"]) > 100 else entry["text"]
                })

        try:
            with open(self.summary_file, "w") as f:
                json.dump(summary, f, indent=2)
        except Exception as e:
            print(f"Error writing summary: {e}")

    def get_transcript(self) -> List[Dict[str, Any]]:
        """Get the full transcript buffer"""
        return self.transcript_buffer

    def get_transcript_count(self) -> int:
        """Get the count of transcript entries"""
        return self.utterance_count

    def get_last_n_utterances(self, n: int = 5) -> List[Dict[str, Any]]:
        """Get the last N utterances"""
        utterances = [e for e in self.transcript_buffer if e.get("speaker")]
        return utterances[-n:] if len(utterances) >= n else utterances


class TranscriptAnalyzer:
    """Analyzer for processing and extracting insights from transcripts"""

    @staticmethod
    def extract_key_themes(transcript: List[Dict[str, Any]]) -> List[str]:
        """Extract key themes from transcript"""
        # This would use NLP/LLM to extract themes
        # Placeholder implementation
        themes = []
        participant_text = " ".join([
            e["text"] for e in transcript
            if e.get("speaker") == "participant"
        ])

        # Simple keyword extraction (replace with proper NLP)
        keywords = ["charging", "frustration", "convenient", "expensive", "time", "location"]
        for keyword in keywords:
            if keyword.lower() in participant_text.lower():
                themes.append(keyword)

        return themes

    @staticmethod
    def calculate_engagement_score(transcript: List[Dict[str, Any]]) -> float:
        """Calculate participant engagement score"""
        participant_utterances = [
            e for e in transcript
            if e.get("speaker") == "participant"
        ]

        if not participant_utterances:
            return 0.0

        # Calculate average response length as proxy for engagement
        total_words = sum(len(u["text"].split()) for u in participant_utterances)
        avg_words = total_words / len(participant_utterances)

        # Normalize to 0-1 score (assuming 50+ words is high engagement)
        score = min(1.0, avg_words / 50.0)
        return score

    @staticmethod
    def identify_pain_points(transcript: List[Dict[str, Any]]) -> List[str]:
        """Identify pain points from transcript"""
        pain_points = []
        pain_keywords = [
            "frustrating", "annoying", "difficult", "problem", "issue",
            "hate", "dislike", "wish", "should", "need", "want"
        ]

        for entry in transcript:
            if entry.get("speaker") == "participant":
                text_lower = entry["text"].lower()
                for keyword in pain_keywords:
                    if keyword in text_lower:
                        # Extract sentence containing keyword
                        sentences = entry["text"].split(".")
                        for sentence in sentences:
                            if keyword in sentence.lower():
                                pain_points.append(sentence.strip())
                                break

        return list(set(pain_points))  # Remove duplicates

    @staticmethod
    def extract_quotes(
        transcript: List[Dict[str, Any]],
        max_quotes: int = 5
    ) -> List[str]:
        """Extract notable quotes from participant"""
        quotes = []

        for entry in transcript:
            if entry.get("speaker") == "participant":
                text = entry["text"]
                # Look for quotable content (20-100 words)
                word_count = len(text.split())
                if 20 <= word_count <= 100:
                    # Check for interesting content markers
                    if any(marker in text.lower() for marker in [
                        "i think", "i feel", "i believe", "for me",
                        "the problem is", "what works", "i wish"
                    ]):
                        quotes.append(text)

        # Return top quotes (could be ranked by relevance)
        return quotes[:max_quotes]