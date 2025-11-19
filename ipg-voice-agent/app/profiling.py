"""
Digital twin profiling system.
Generates personality profiles and simulated agents from interview transcripts.
"""

from typing import Dict, Any, List, Optional
import json
from openai import AsyncOpenAI
from app.config import get_settings
from app.logging_utils import TranscriptAnalyzer


class DigitalTwinGenerator:
    """
    Generates digital twin profiles from interview transcripts.
    Creates comprehensive personality models for simulation.
    """

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai.api_key)
        self.model = settings.openai.model_name

    async def generate_profile(
        self,
        transcript: List[Dict[str, Any]],
        campaign_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate a digital twin profile from interview transcript.

        Args:
            transcript: List of transcript entries
            campaign_context: Campaign information for context

        Returns:
            Digital twin profile dictionary
        """
        # Prepare transcript text
        transcript_text = self._format_transcript_for_analysis(transcript)

        # Extract basic analytics
        analyzer = TranscriptAnalyzer()
        themes = analyzer.extract_key_themes(transcript)
        pain_points = analyzer.identify_pain_points(transcript)
        quotes = analyzer.extract_quotes(transcript)
        engagement_score = analyzer.calculate_engagement_score(transcript)

        # Generate profile using OpenAI
        profile = await self._generate_profile_with_llm(
            transcript_text,
            themes,
            pain_points,
            quotes,
            campaign_context
        )

        # Add metadata
        profile["metadata"] = {
            "engagement_score": engagement_score,
            "transcript_length": len(transcript),
            "themes_identified": len(themes),
            "pain_points_count": len(pain_points)
        }

        return profile

    def _format_transcript_for_analysis(self, transcript: List[Dict[str, Any]]) -> str:
        """Format transcript for LLM analysis"""
        formatted = []
        for entry in transcript:
            if entry.get("speaker"):
                speaker = "Interviewer" if entry["speaker"] == "agent" else "Participant"
                formatted.append(f"{speaker}: {entry['text']}")

        return "\n".join(formatted)

    async def _generate_profile_with_llm(
        self,
        transcript_text: str,
        themes: List[str],
        pain_points: List[str],
        quotes: List[str],
        campaign_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Use LLM to generate comprehensive digital twin profile"""

        system_prompt = """You are an expert at analyzing interview transcripts and creating detailed personality profiles for market research simulations.

        Create a comprehensive digital twin profile that captures:
        1. Core personality traits and characteristics
        2. Motivations and decision-making patterns
        3. Habits and routines
        4. Frustrations and challenges
        5. Mental models and thought processes
        6. Memorable quotes that capture their essence
        7. A simulation prompt for recreating this personality

        Be specific and detailed. Extract actual behaviors and preferences from the transcript.
        DO NOT include any personally identifiable information (PII) like names, addresses, or specific companies.

        Return a JSON object with the following structure:
        {
            "persona_name": "Descriptive nickname (e.g., 'The Efficiency-Focused Commuter')",
            "core_personality_traits": ["trait1", "trait2", ...],
            "motivations": {
                "primary": ["motivation1", "motivation2"],
                "secondary": ["motivation3", "motivation4"]
            },
            "habits_routines": {
                "daily": ["habit1", "habit2"],
                "weekly": ["habit3", "habit4"],
                "context_specific": ["habit5", "habit6"]
            },
            "frustrations_challenges": [
                {
                    "issue": "description",
                    "frequency": "daily/weekly/occasional",
                    "intensity": "high/medium/low",
                    "impact": "description of impact"
                }
            ],
            "mental_models": {
                "decision_making": "How they make decisions",
                "problem_solving": "How they approach problems",
                "value_system": "What they prioritize",
                "trade_offs": "How they handle trade-offs"
            },
            "quotes": ["memorable quote 1", "memorable quote 2", ...],
            "behavioral_patterns": {
                "preferences": ["preference1", "preference2"],
                "aversions": ["aversion1", "aversion2"],
                "triggers": ["trigger1", "trigger2"]
            },
            "simulated_agent_prompt": "A detailed system prompt for an AI to roleplay as this person..."
        }"""

        # Add context if available
        context_info = ""
        if campaign_context:
            context_info = f"\nInterview Context: {campaign_context.get('caption', 'Market research interview')}\n"

        user_prompt = f"""{context_info}
        Transcript:
        {transcript_text[:10000]}  # Limit to first 10k characters

        Key Themes Identified: {', '.join(themes) if themes else 'None identified'}
        Pain Points: {'; '.join(pain_points[:5]) if pain_points else 'None identified'}

        Generate a comprehensive digital twin profile based on this interview."""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=2000,
                response_format={"type": "json_object"}
            )

            profile_json = response.choices[0].message.content
            profile = json.loads(profile_json)

            # Add the extracted quotes if not in LLM response
            if quotes and len(profile.get("quotes", [])) < 3:
                profile["quotes"] = quotes[:5]

            return profile

        except Exception as e:
            print(f"Error generating profile with LLM: {e}")
            # Return a basic profile as fallback
            return self._generate_fallback_profile(themes, pain_points, quotes)

    def _generate_fallback_profile(
        self,
        themes: List[str],
        pain_points: List[str],
        quotes: List[str]
    ) -> Dict[str, Any]:
        """Generate a basic fallback profile if LLM fails"""
        return {
            "persona_name": "Interview Participant",
            "core_personality_traits": ["Engaged", "Thoughtful", "Experience-focused"],
            "motivations": {
                "primary": ["Efficiency", "Convenience"],
                "secondary": ["Cost-effectiveness", "Reliability"]
            },
            "habits_routines": {
                "daily": ["Regular usage patterns identified"],
                "weekly": ["Planned activities mentioned"],
                "context_specific": []
            },
            "frustrations_challenges": [
                {
                    "issue": pain_point,
                    "frequency": "occasional",
                    "intensity": "medium",
                    "impact": "Affects user experience"
                } for pain_point in pain_points[:3]
            ],
            "mental_models": {
                "decision_making": "Practical and experience-based",
                "problem_solving": "Seeks efficient solutions",
                "value_system": "Values convenience and reliability",
                "trade_offs": "Balances cost with convenience"
            },
            "quotes": quotes[:5] if quotes else [],
            "behavioral_patterns": {
                "preferences": themes[:3] if themes else [],
                "aversions": [],
                "triggers": []
            },
            "simulated_agent_prompt": "You are a participant who values efficiency and has experienced various challenges with the current systems."
        }


class SimulatedAgentGenerator:
    """
    Generates simulated agents based on digital twin profiles.
    Creates AI agents that can roleplay as interview participants.
    """

    @staticmethod
    def generate_agent_prompt(profile: Dict[str, Any]) -> str:
        """
        Generate a comprehensive system prompt for a simulated agent.

        Args:
            profile: Digital twin profile

        Returns:
            System prompt for AI agent
        """
        # Use the prompt from profile if available
        if "simulated_agent_prompt" in profile:
            return profile["simulated_agent_prompt"]

        # Otherwise, construct from profile components
        persona_name = profile.get("persona_name", "Participant")
        traits = ", ".join(profile.get("core_personality_traits", []))
        motivations = profile.get("motivations", {})
        mental_models = profile.get("mental_models", {})

        prompt = f"""You are roleplaying as {persona_name}, a participant in a market research interview.

        Your personality traits: {traits}

        Your primary motivations: {', '.join(motivations.get('primary', []))}
        Your secondary motivations: {', '.join(motivations.get('secondary', []))}

        Decision-making style: {mental_models.get('decision_making', 'Practical')}
        Problem-solving approach: {mental_models.get('problem_solving', 'Direct')}
        Value system: {mental_models.get('value_system', 'Balanced')}
        How you handle trade-offs: {mental_models.get('trade_offs', 'Pragmatic')}

        When responding:
        - Draw from your experiences and frustrations
        - Be conversational and authentic
        - Share specific examples when relevant
        - Express emotions appropriately
        - Stay consistent with your personality and motivations
        - Don't provide information you wouldn't realistically know

        Respond naturally as this person would in an interview setting."""

        # Add specific patterns if available
        if profile.get("behavioral_patterns"):
            patterns = profile["behavioral_patterns"]
            if patterns.get("preferences"):
                prompt += f"\n\nYour preferences: {', '.join(patterns['preferences'])}"
            if patterns.get("aversions"):
                prompt += f"\nThings you avoid: {', '.join(patterns['aversions'])}"

        return prompt

    @staticmethod
    def generate_test_questions(profile: Dict[str, Any]) -> List[str]:
        """
        Generate test questions to validate the simulated agent.

        Args:
            profile: Digital twin profile

        Returns:
            List of test questions
        """
        questions = [
            "Tell me about your typical day.",
            "What's most important to you when making decisions?",
            "Describe a recent frustration you experienced.",
            "How do you usually solve problems?",
            "What would make your life easier?"
        ]

        # Add profile-specific questions
        if profile.get("frustrations_challenges"):
            for frustration in profile["frustrations_challenges"][:2]:
                questions.append(f"How do you deal with {frustration['issue']}?")

        return questions