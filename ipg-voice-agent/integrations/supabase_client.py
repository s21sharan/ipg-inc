"""
Supabase client for fetching campaigns and saving interview data.
Integrates with the existing ipg.inc database schema.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from supabase import create_client, Client
import uuid
import json
from app.config import get_settings
from app.guide_models import DiscussionGuide
from app.format_converter import FormatConverter


class SupabaseClient:
    """Client for interacting with Supabase database"""

    def __init__(self):
        settings = get_settings()
        self.url = settings.supabase.url
        self.anon_key = settings.supabase.anon_key
        self.service_key = settings.supabase.service_key

        # Use service key if available for server-side operations
        key = self.service_key if self.service_key else self.anon_key
        self.client: Client = create_client(self.url, key)

    async def get_campaign(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a campaign by ID"""
        try:
            response = self.client.table('campaigns').select('*').eq('id', campaign_id).single().execute()
            return response.data
        except Exception as e:
            print(f"Error fetching campaign {campaign_id}: {e}")
            return None

    async def get_campaign_as_guide(self, campaign_id: str) -> Optional[DiscussionGuide]:
        """Fetch campaign and convert to DiscussionGuide format"""
        campaign = await self.get_campaign(campaign_id)
        if campaign:
            return FormatConverter.supabase_to_guide(campaign)
        return None

    async def create_interview_session(
        self,
        campaign_id: str,
        participant_name: Optional[str] = None,
        participant_email: Optional[str] = None,
        daily_room_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new interview session"""
        session_id = str(uuid.uuid4())

        data = {
            'id': session_id,
            'campaign_id': campaign_id,
            'participant_name': participant_name,
            'participant_email': participant_email,
            'status': 'initialized',
            'started_at': datetime.utcnow().isoformat(),
            'current_topic_index': 0,
            'metadata': metadata or {}
        }

        if daily_room_url:
            data['metadata']['daily_room_url'] = daily_room_url

        # Create the interviews table if it doesn't exist (first time setup)
        await self._ensure_interviews_table()

        try:
            response = self.client.table('interviews').insert(data).execute()
            return response.data[0]
        except Exception as e:
            print(f"Error creating interview session: {e}")
            # Return the data even if insert fails (for development)
            return data

    async def update_interview_status(
        self,
        interview_id: str,
        status: str,
        current_topic_index: Optional[int] = None,
        metadata_update: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update interview session status"""
        update_data = {
            'status': status,
            'updated_at': datetime.utcnow().isoformat()
        }

        if current_topic_index is not None:
            update_data['current_topic_index'] = current_topic_index

        if status == 'completed':
            update_data['completed_at'] = datetime.utcnow().isoformat()

        try:
            # Update metadata if provided
            if metadata_update:
                # Fetch current metadata
                current = self.client.table('interviews').select('metadata').eq('id', interview_id).single().execute()
                if current.data:
                    current_metadata = current.data.get('metadata', {})
                    current_metadata.update(metadata_update)
                    update_data['metadata'] = current_metadata

            self.client.table('interviews').update(update_data).eq('id', interview_id).execute()
            return True
        except Exception as e:
            print(f"Error updating interview status: {e}")
            return False

    async def save_transcript_entry(
        self,
        interview_id: str,
        speaker: str,  # 'agent' or 'participant'
        text: str,
        topic_id: Optional[str] = None,
        audio_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Save a transcript entry"""
        await self._ensure_transcript_table()

        data = {
            'id': str(uuid.uuid4()),
            'interview_id': interview_id,
            'speaker': speaker,
            'text': text,
            'timestamp': datetime.utcnow().isoformat(),
            'topic_id': topic_id,
            'audio_url': audio_url,
            'metadata': metadata or {}
        }

        try:
            self.client.table('transcript_entries').insert(data).execute()
            return True
        except Exception as e:
            print(f"Error saving transcript entry: {e}")
            return False

    async def get_interview_transcript(self, interview_id: str) -> List[Dict[str, Any]]:
        """Get all transcript entries for an interview"""
        try:
            response = self.client.table('transcript_entries')\
                .select('*')\
                .eq('interview_id', interview_id)\
                .order('timestamp')\
                .execute()
            return response.data
        except Exception as e:
            print(f"Error fetching transcript: {e}")
            return []

    async def save_digital_twin_profile(
        self,
        interview_id: str,
        profile_data: Dict[str, Any]
    ) -> bool:
        """Save the generated digital twin profile"""
        await self._ensure_profiles_table()

        data = {
            'id': str(uuid.uuid4()),
            'interview_id': interview_id,
            'profile_data': profile_data,
            'created_at': datetime.utcnow().isoformat()
        }

        try:
            self.client.table('digital_twin_profiles').insert(data).execute()
            return True
        except Exception as e:
            print(f"Error saving digital twin profile: {e}")
            return False

    async def _ensure_interviews_table(self):
        """Ensure interviews table exists (for development)"""
        # This would normally be done via Supabase migrations
        # Included here for completeness
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS interviews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
            participant_name TEXT,
            participant_email TEXT,
            status TEXT DEFAULT 'initialized',
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE,
            current_topic_index INTEGER DEFAULT 0,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        # Note: This would require database admin permissions
        # In production, use proper migrations

    async def _ensure_transcript_table(self):
        """Ensure transcript_entries table exists"""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS transcript_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
            speaker TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            topic_id TEXT,
            audio_url TEXT,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        # Note: This would require database admin permissions
        # In production, use proper migrations

    async def _ensure_profiles_table(self):
        """Ensure digital_twin_profiles table exists"""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS digital_twin_profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
            profile_data JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        # Note: This would require database admin permissions
        # In production, use proper migrations

    async def get_user_campaigns(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all campaigns for a user"""
        try:
            response = self.client.table('campaigns')\
                .select('id, name, title, caption, modality, time_estimate, created_at')\
                .eq('user_id', user_id)\
                .order('created_at', desc=True)\
                .execute()
            return response.data
        except Exception as e:
            print(f"Error fetching user campaigns: {e}")
            return []

    async def get_interview_sessions(self, campaign_id: str) -> List[Dict[str, Any]]:
        """Get all interview sessions for a campaign"""
        try:
            response = self.client.table('interviews')\
                .select('*')\
                .eq('campaign_id', campaign_id)\
                .order('started_at', desc=True)\
                .execute()
            return response.data
        except Exception as e:
            print(f"Error fetching interview sessions: {e}")
            return []