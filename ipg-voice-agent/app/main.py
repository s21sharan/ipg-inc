"""
FastAPI server for the voice interview agent.
Handles session management, API endpoints, and agent lifecycle.
"""

import asyncio
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import get_settings
from app.guide_models import DiscussionGuide
from app.format_converter import FormatConverter
from app.agent import VoiceInterviewAgent
from integrations.supabase_client import SupabaseClient
from integrations.daily_client import DailyClient
from app.profiling import DigitalTwinGenerator


# Request/Response models
class CreateSessionRequest(BaseModel):
    """Request to create a new interview session"""
    campaign_id: str = Field(..., description="ID of the campaign from Supabase")
    participant_name: Optional[str] = Field(default=None)
    participant_email: Optional[str] = Field(default=None)
    enable_recording: bool = Field(default=False)


class CreateSessionResponse(BaseModel):
    """Response for session creation"""
    session_id: str
    room_url: str
    participant_token: str
    agent_token: str
    expires_at: str
    status: str = "created"


class SessionStatus(BaseModel):
    """Session status information"""
    session_id: str
    status: str
    progress: Optional[Dict[str, Any]] = None
    transcript_count: int = 0
    duration_seconds: Optional[float] = None


class GenerateProfileRequest(BaseModel):
    """Request to generate digital twin profile"""
    session_id: str
    include_transcript: bool = Field(default=False)


# Session manager
class SessionManager:
    """Manages active interview sessions"""

    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.agents: Dict[str, VoiceInterviewAgent] = {}
        self.cleanup_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the session manager"""
        # Start cleanup task
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        """Stop the session manager"""
        if self.cleanup_task:
            self.cleanup_task.cancel()

        # Stop all active agents
        for agent in self.agents.values():
            await agent.stop()

    async def create_session(
        self,
        campaign_id: str,
        participant_name: Optional[str] = None,
        participant_email: Optional[str] = None,
        enable_recording: bool = False
    ) -> Dict[str, Any]:
        """Create a new interview session"""
        session_id = str(uuid.uuid4())

        # Fetch campaign from Supabase
        supabase = SupabaseClient()
        campaign = await supabase.get_campaign(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Convert to DiscussionGuide format
        guide = FormatConverter.supabase_to_guide(campaign)

        # Create Daily room
        async with DailyClient() as daily:
            room_info = await daily.create_interview_room(
                interview_id=session_id,
                enable_recording=enable_recording
            )

        # Save session to Supabase
        interview_data = await supabase.create_interview_session(
            campaign_id=campaign_id,
            participant_name=participant_name,
            participant_email=participant_email,
            daily_room_url=room_info["room_url"],
            metadata={
                "room_name": room_info["room_name"],
                "agent_token": room_info["agent_token"],
                "participant_token": room_info["participant_token"]
            }
        )

        # Store session info
        session_info = {
            "id": session_id,
            "campaign_id": campaign_id,
            "guide": guide,
            "room_info": room_info,
            "interview_data": interview_data,
            "started_at": datetime.utcnow(),
            "status": "created"
        }

        self.sessions[session_id] = session_info

        return session_info

    async def start_agent(self, session_id: str) -> None:
        """Start the voice agent for a session"""
        if session_id not in self.sessions:
            raise ValueError(f"Session {session_id} not found")

        session = self.sessions[session_id]

        # Create agent
        agent = VoiceInterviewAgent(
            guide=session["guide"],
            room_url=session["room_info"]["room_url"],
            token=session["room_info"]["agent_token"],
            session_id=session_id
        )

        self.agents[session_id] = agent
        session["status"] = "active"

        # Start agent in background (non-blocking)
        agent_task = asyncio.create_task(agent.start())

        # Wait a moment for agent to join room and be ready
        await asyncio.sleep(2)
        print(f"Agent initialization complete for session {session_id}")

        # Update Supabase status
        supabase = SupabaseClient()
        await supabase.update_interview_status(session_id, "in_progress")

    async def stop_agent(self, session_id: str) -> None:
        """Stop the agent for a session"""
        if session_id in self.agents:
            agent = self.agents[session_id]
            await agent.stop()
            del self.agents[session_id]

        if session_id in self.sessions:
            self.sessions[session_id]["status"] = "completed"

        # Update Supabase status
        supabase = SupabaseClient()
        await supabase.update_interview_status(session_id, "completed")

    async def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get status for a session"""
        if session_id not in self.sessions:
            # Try to fetch from Supabase
            supabase = SupabaseClient()
            interviews = await supabase.get_interview_sessions(session_id)
            if interviews:
                return {
                    "session_id": session_id,
                    "status": interviews[0].get("status", "unknown"),
                    "from_database": True
                }
            raise ValueError(f"Session {session_id} not found")

        session = self.sessions[session_id]
        status = {
            "session_id": session_id,
            "status": session["status"]
        }

        # Add agent status if active
        if session_id in self.agents:
            agent = self.agents[session_id]
            agent_status = await agent.get_status()
            status.update(agent_status)

        # Calculate duration
        if session.get("started_at"):
            duration = (datetime.utcnow() - session["started_at"]).total_seconds()
            status["duration_seconds"] = duration

        return status

    async def _cleanup_loop(self):
        """Periodic cleanup of expired sessions"""
        while True:
            try:
                await asyncio.sleep(1800)  # Run every 30 minutes
                await self._cleanup_expired_sessions()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in cleanup loop: {e}")

    async def _cleanup_expired_sessions(self):
        """Clean up expired sessions"""
        now = datetime.utcnow()
        expired = []

        for session_id, session in self.sessions.items():
            started_at = session.get("started_at")
            if started_at:
                # Sessions expire after 2 hours
                if (now - started_at) > timedelta(hours=2):
                    expired.append(session_id)

        for session_id in expired:
            await self.stop_agent(session_id)
            del self.sessions[session_id]

        print(f"Cleaned up {len(expired)} expired sessions")


# Global session manager
session_manager = SessionManager()


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup - Initialize Daily SDK ONCE at application level
    import sys
    print("Initializing Daily SDK...", file=sys.stderr, flush=True)
    from daily import Daily
    Daily.init()

    # Set Pipecat's class variable to prevent it from calling Daily.init() again
    from pipecat.transports.services.daily import DailyTransportClient
    DailyTransportClient._daily_initialized = True
    print("Daily SDK initialized", file=sys.stderr, flush=True)

    await session_manager.start()
    yield

    # Shutdown
    await session_manager.stop()

    print("Deinitializing Daily SDK...", file=sys.stderr, flush=True)
    Daily.deinit()
    print("Daily SDK deinitialized", file=sys.stderr, flush=True)


# Create FastAPI app
app = FastAPI(
    title="IPG Voice Interview Agent",
    description="Voice interview agent for conducting AI-moderated market research interviews",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.server.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/sessions/create", response_model=CreateSessionResponse)
async def create_session(
    request: CreateSessionRequest,
    background_tasks: BackgroundTasks
) -> CreateSessionResponse:
    """Create a new interview session"""
    try:
        # Create session
        session_info = await session_manager.create_session(
            campaign_id=request.campaign_id,
            participant_name=request.participant_name,
            participant_email=request.participant_email,
            enable_recording=request.enable_recording
        )

        # Start agent BEFORE returning (so it's ready when participant joins)
        print(f"Starting agent for session {session_info['id']}...")
        await session_manager.start_agent(session_info["id"])
        print(f"Agent started and ready for session {session_info['id']}")

        return CreateSessionResponse(
            session_id=session_info["id"],
            room_url=session_info["room_info"]["room_url"],
            participant_token=session_info["room_info"]["participant_token"],
            agent_token=session_info["room_info"]["agent_token"],
            expires_at=session_info["room_info"]["expires_at"],
            status="created"
        )
    except Exception as e:
        print(f"ERROR creating session: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/sessions/{session_id}/start")
async def start_session(session_id: str):
    """Start the voice agent for a session"""
    try:
        await session_manager.start_agent(session_id)
        return {"status": "started", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    """Stop the voice agent for a session"""
    try:
        await session_manager.stop_agent(session_id)
        return {"status": "stopped", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/sessions/{session_id}/status", response_model=SessionStatus)
async def get_session_status(session_id: str) -> SessionStatus:
    """Get status for a session"""
    try:
        status = await session_manager.get_session_status(session_id)
        return SessionStatus(**status)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/sessions/{session_id}/transcript")
async def get_session_transcript(session_id: str):
    """Get transcript for a session"""
    try:
        supabase = SupabaseClient()
        transcript = await supabase.get_interview_transcript(session_id)
        return {"session_id": session_id, "transcript": transcript}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/sessions/{session_id}/profile")
async def generate_digital_twin_profile(
    session_id: str,
    request: GenerateProfileRequest
):
    """Generate digital twin profile for a session"""
    try:
        # Get transcript
        supabase = SupabaseClient()
        transcript = await supabase.get_interview_transcript(session_id)

        if not transcript:
            raise ValueError("No transcript found for session")

        # Get campaign info
        interview_data = await supabase.client.table('interviews')\
            .select('campaign_id')\
            .eq('id', session_id)\
            .single()\
            .execute()

        campaign_id = interview_data.data.get('campaign_id')
        campaign = await supabase.get_campaign(campaign_id)

        # Generate profile
        generator = DigitalTwinGenerator()
        profile = await generator.generate_profile(
            transcript=transcript,
            campaign_context=campaign
        )

        # Save profile
        await supabase.save_digital_twin_profile(session_id, profile)

        response = {"session_id": session_id, "profile": profile}
        if request.include_transcript:
            response["transcript"] = transcript

        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str):
    """Get campaign details"""
    try:
        supabase = SupabaseClient()
        campaign = await supabase.get_campaign(campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return campaign
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/campaigns/{campaign_id}/sessions")
async def get_campaign_sessions(campaign_id: str):
    """Get all interview sessions for a campaign"""
    try:
        supabase = SupabaseClient()
        sessions = await supabase.get_interview_sessions(campaign_id)
        return {"campaign_id": campaign_id, "sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Error handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Generic exception handler"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.server.log_level == "DEBUG" else "An error occurred"
        }
    )


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        app,
        host=settings.server.host,
        port=settings.server.port,
        log_level=settings.server.log_level.lower()
    )