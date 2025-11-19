"""
Daily.co client for WebRTC room management.
Handles room creation, token generation, and participant management.
"""

import aiohttp
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import uuid
import json
from app.config import get_settings


class DailyClient:
    """Client for interacting with Daily.co API"""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.daily.api_key
        self.domain = settings.daily.domain
        self.base_url = "https://api.daily.co/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(headers=self.headers)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()

    def _get_session(self) -> aiohttp.ClientSession:
        """Get or create session"""
        if not self.session:
            self.session = aiohttp.ClientSession(headers=self.headers)
        return self.session

    async def create_room(
        self,
        name: Optional[str] = None,
        privacy: str = "public",
        properties: Optional[Dict[str, Any]] = None,
        expire_time: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a new Daily room for the interview session.

        Args:
            name: Room name (optional, will be auto-generated)
            privacy: "public" or "private"
            properties: Room properties (max_participants, enable_recording, etc.)
            expire_time: Unix timestamp when room expires

        Returns:
            Room data including URL and name
        """
        if not name:
            name = f"interview-{uuid.uuid4().hex[:8]}"

        # Default properties for interview rooms
        default_properties = {
            "max_participants": 2,  # Agent + Participant
            "enable_chat": False,
            "enable_recording": False,
            "enable_screenshare": False,
            "start_video_off": False,
            "start_audio_off": False,
            "lang": "en",
            "geo": "US",
            "enable_advanced_chat": False,
            "enable_noise_cancellation_ui": True
        }

        if properties:
            default_properties.update(properties)

        # Set expiration to 2 hours from now if not specified
        if not expire_time:
            expire_time = int((datetime.utcnow() + timedelta(hours=2)).timestamp())

        payload = {
            "name": name,
            "privacy": privacy,
            "properties": default_properties
        }

        # Only add exp if room should expire
        if expire_time > 0:
            payload["properties"]["exp"] = expire_time

        session = self._get_session()
        async with session.post(f"{self.base_url}/rooms", json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Failed to create room: {response.status} - {error_text}")

            room_data = await response.json()
            return room_data

    async def create_meeting_token(
        self,
        room_name: str,
        user_name: str = "Agent",
        is_owner: bool = False,
        start_audio_off: bool = False,
        start_video_off: bool = False,
        exp: Optional[int] = None
    ) -> str:
        """
        Create a meeting token for joining a room.

        Args:
            room_name: Name of the room to join
            user_name: Display name for the user
            is_owner: Whether this token has owner privileges
            start_audio_off: Start with audio muted
            start_video_off: Start with video off
            exp: Token expiration (Unix timestamp)

        Returns:
            JWT token for joining the room
        """
        if not exp:
            # Token expires in 2 hours
            exp = int((datetime.utcnow() + timedelta(hours=2)).timestamp())

        payload = {
            "properties": {
                "room_name": room_name,
                "user_name": user_name,
                "is_owner": is_owner,
                "start_audio_off": start_audio_off,
                "start_video_off": start_video_off,
                "exp": exp,
                "enable_recording": "local" if is_owner else None
            }
        }

        session = self._get_session()
        async with session.post(f"{self.base_url}/meeting-tokens", json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Failed to create meeting token: {response.status} - {error_text}")

            token_data = await response.json()
            return token_data["token"]

    async def get_room(self, room_name: str) -> Optional[Dict[str, Any]]:
        """Get room information by name"""
        session = self._get_session()
        async with session.get(f"{self.base_url}/rooms/{room_name}") as response:
            if response.status == 404:
                return None
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Failed to get room: {response.status} - {error_text}")

            return await response.json()

    async def delete_room(self, room_name: str) -> bool:
        """Delete a room"""
        session = self._get_session()
        async with session.delete(f"{self.base_url}/rooms/{room_name}") as response:
            return response.status == 200

    async def get_room_presence(self, room_name: str) -> Dict[str, Any]:
        """Get current participants in a room"""
        session = self._get_session()
        async with session.get(f"{self.base_url}/presence/{room_name}") as response:
            if response.status != 200:
                return {"total_count": 0, "data": []}
            return await response.json()

    async def start_recording(self, room_name: str) -> Dict[str, Any]:
        """Start cloud recording for a room"""
        payload = {
            "properties": {
                "mode": "cloud",
                "max_duration": 7200  # 2 hours max
            }
        }

        session = self._get_session()
        async with session.post(
            f"{self.base_url}/recordings",
            json={"room_name": room_name, **payload}
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Failed to start recording: {response.status} - {error_text}")
            return await response.json()

    async def stop_recording(self, room_name: str, recording_id: str) -> bool:
        """Stop cloud recording"""
        session = self._get_session()
        async with session.delete(f"{self.base_url}/recordings/{recording_id}") as response:
            return response.status == 200

    async def get_recordings(self, room_name: str) -> List[Dict[str, Any]]:
        """Get all recordings for a room"""
        session = self._get_session()
        async with session.get(f"{self.base_url}/recordings?room_name={room_name}") as response:
            if response.status != 200:
                return []
            data = await response.json()
            return data.get("data", [])

    async def create_interview_room(
        self,
        interview_id: str,
        enable_recording: bool = False
    ) -> Dict[str, Any]:
        """
        Create a room specifically configured for interviews.

        Returns:
            {
                "room_url": "https://domain.daily.co/room-name",
                "room_name": "room-name",
                "agent_token": "jwt-token-for-agent",
                "participant_token": "jwt-token-for-participant",
                "expires_at": "2024-01-01T00:00:00Z"
            }
        """
        # Create room with interview-specific settings
        room = await self.create_room(
            name=f"interview-{interview_id[:8]}",
            privacy="public",
            properties={
                "max_participants": 2,
                "enable_recording": enable_recording,
                "enable_chat": False,
                "enable_screenshare": False,
                "enable_noise_cancellation_ui": True,
                "lang": "en"
            }
        )

        room_name = room["name"]
        room_url = room["url"]

        # Create tokens for agent and participant
        agent_token = await self.create_meeting_token(
            room_name=room_name,
            user_name="AI Agent",
            is_owner=True,
            start_audio_off=False,
            start_video_off=True  # Agent doesn't need video
        )

        participant_token = await self.create_meeting_token(
            room_name=room_name,
            user_name="Participant",
            is_owner=False,
            start_audio_off=False,
            start_video_off=False
        )

        return {
            "room_url": room_url,
            "room_name": room_name,
            "agent_token": agent_token,
            "participant_token": participant_token,
            "expires_at": datetime.utcfromtimestamp(room["config"]["exp"]).isoformat()
        }

    async def cleanup_expired_rooms(self) -> int:
        """Clean up expired rooms (maintenance task)"""
        session = self._get_session()
        async with session.get(f"{self.base_url}/rooms") as response:
            if response.status != 200:
                return 0

            rooms = await response.json()
            deleted_count = 0

            for room in rooms.get("data", []):
                # Check if room is expired
                if room.get("config", {}).get("exp", 0) < datetime.utcnow().timestamp():
                    if await self.delete_room(room["name"]):
                        deleted_count += 1

            return deleted_count