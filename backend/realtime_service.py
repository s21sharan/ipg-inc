"""
OpenAI Realtime API service for voice interviews
Handles session creation with interview instructions
"""

import os
from typing import Dict, Any
import requests
from prompt_builder import build_system_prompt, get_topic_by_index


def create_realtime_session(campaign: Dict[str, Any], user_id: str = "anonymous") -> Dict[str, Any]:
    """
    Create an OpenAI Realtime API session for voice interview

    Args:
        campaign: Campaign data from Supabase
        user_id: User identifier

    Returns:
        Session configuration with client secret and instructions
    """
    # Get first topic
    current_topic = get_topic_by_index(campaign, 0)

    # Build system prompt
    system_prompt = build_system_prompt(campaign, current_topic)

    # Create session with OpenAI Realtime API
    openai_api_key = os.getenv("OPENAI_API_KEY")

    response = requests.post(
        "https://api.openai.com/v1/realtime/sessions",
        headers={
            "Authorization": f"Bearer {openai_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4o-realtime-preview-2024-12-17",
            "voice": "verse",  # Options: alloy, echo, fable, onyx, nova, shimmer, verse
            "instructions": system_prompt,
            "turn_detection": {
                "type": "server_vad",  # Voice Activity Detection
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 500,
            },
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_transcription": {
                "model": "whisper-1"
            },
        },
    )

    if response.status_code != 200:
        raise Exception(f"Failed to create Realtime session: {response.text}")

    data = response.json()

    return {
        "client_secret": data["client_secret"]["value"],
        "session_id": data["id"],
        "model": data["model"],
        "campaign_title": campaign.get("title"),
        "instructions": system_prompt,
    }
