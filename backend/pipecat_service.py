"""
Pipecat service for voice-only interview agent
Handles STT → LLM → TTS pipeline with session state management via Daily.co WebRTC
"""

import asyncio
import os
from typing import Dict, Any, Optional
from loguru import logger

from pipecat.frames.frames import LLMMessagesFrame, EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_response import (
    LLMAssistantResponseAggregator,
    LLMUserResponseAggregator,
)
from pipecat.services.openai import OpenAILLMService
from pipecat.services.deepgram import DeepgramTTSService
from pipecat.services.assemblyai import AssemblyAISTTService
from pipecat.transports.services.daily import DailyParams, DailyTransport
from pipecat.vad.silero import SileroVADAnalyzer
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.frames.frames import Frame, TextFrame

from prompt_builder import build_system_prompt, get_topic_by_index, should_advance_topic, is_interview_complete
from supabase import Client


class InterviewStateManager(FrameProcessor):
    """
    Manages interview state (topic progression, response counting)
    Intercepts conversation to track progress
    """

    def __init__(self, session_state: Dict[str, Any]):
        super().__init__()
        self.session_state = session_state

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process frames to track conversation state"""
        await super().process_frame(frame, direction)

        # Track user responses to determine topic advancement
        if isinstance(frame, TextFrame) and direction == FrameDirection.UPSTREAM:
            self.session_state["response_count"] += 1
            logger.info(f"Response count: {self.session_state['response_count']}")

            # Check if should advance topic
            if should_advance_topic(self.session_state["response_count"]):
                campaign = self.session_state["campaign"]
                self.session_state["current_topic_index"] += 1
                self.session_state["response_count"] = 0

                # Check if interview complete
                if is_interview_complete(campaign, self.session_state["current_topic_index"]):
                    logger.info("Interview complete, ending session")
                    self.session_state["is_complete"] = True
                    # Send completion message then end
                    completion_msg = campaign.get("completion_logic", {}).get(
                        "completionMessage",
                        "Thank you for participating!"
                    )
                    await self.push_frame(TextFrame(completion_msg), FrameDirection.DOWNSTREAM)
                    await self.push_frame(EndFrame(), FrameDirection.DOWNSTREAM)
                else:
                    # Advance to next topic - update system prompt
                    current_topic = get_topic_by_index(campaign, self.session_state["current_topic_index"])
                    new_prompt = build_system_prompt(campaign, current_topic)
                    self.session_state["current_system_prompt"] = new_prompt
                    logger.info(f"Advanced to topic: {current_topic.get('name')}")

        await self.push_frame(frame, direction)


async def run_interview_bot(
    session_id: str,
    campaign: Dict[str, Any],
    room_url: str,
    token: str,
    openai_api_key: str,
    assemblyai_api_key: str,
    deepgram_api_key: str,
    krisp_api_key: Optional[str] = None
):
    """
    Run voice interview bot with Pipecat pipeline

    Uses:
    - AssemblyAI for Speech-to-Text (STT)
    - Deepgram for Text-to-Speech (TTS)
    - Krisp VIVA for noise cancellation (optional)

    Args:
        session_id: Unique session ID
        campaign: Campaign data from Supabase
        room_url: Daily.co room URL
        token: Daily.co bot token
        openai_api_key: OpenAI API key
        assemblyai_api_key: AssemblyAI API key for STT
        deepgram_api_key: Deepgram API key for TTS
        krisp_api_key: Krisp API key for noise cancellation (optional)
    """
    # Initialize session state
    session_state = {
        "session_id": session_id,
        "campaign": campaign,
        "current_topic_index": 0,
        "response_count": 0,
        "is_complete": False,
    }

    # Get initial topic and build prompt
    current_topic = get_topic_by_index(campaign, 0)
    system_prompt = build_system_prompt(campaign, current_topic)
    session_state["current_system_prompt"] = system_prompt

    # Configure Daily transport params with Krisp VIVA noise cancellation
    daily_params = DailyParams(
        audio_out_enabled=True,
        transcription_enabled=False,  # We're using AssemblyAI for STT
        vad_enabled=True,
        vad_analyzer=SileroVADAnalyzer(),
        vad_audio_passthrough=True,
    )

    # Enable Krisp VIVA noise cancellation if API key provided
    if krisp_api_key:
        daily_params.krisp_enabled = True
        daily_params.krisp_api_key = krisp_api_key
        logger.info("Krisp VIVA noise cancellation enabled")

    # Initialize Daily transport
    transport = DailyTransport(
        room_url,
        token,
        "Interview Agent",
        daily_params,
    )

    # Initialize STT (AssemblyAI)
    stt = AssemblyAISTTService(
        api_key=assemblyai_api_key,
        sample_rate=16000,
    )
    logger.info("Using AssemblyAI for Speech-to-Text")

    # Initialize LLM (OpenAI)
    llm = OpenAILLMService(
        api_key=openai_api_key,
        model="gpt-4o-mini",
    )

    # Initialize TTS (Deepgram)
    tts = DeepgramTTSService(
        api_key=deepgram_api_key,
        voice="aura-asteria-en",  # Natural conversational voice
    )
    logger.info("Using Deepgram for Text-to-Speech")

    # Create aggregators
    llm_user_aggregator = LLMUserResponseAggregator()
    llm_assistant_aggregator = LLMAssistantResponseAggregator()

    # Create state manager
    state_manager = InterviewStateManager(session_state)

    # Build the pipeline with AssemblyAI STT and Deepgram TTS
    pipeline = Pipeline(
        [
            transport.input(),           # Audio input from Daily (with Krisp noise cancellation)
            stt,                          # AssemblyAI Speech-to-Text
            llm_user_aggregator,         # Aggregate user transcription
            state_manager,               # Track interview state and topic progression
            llm,                          # OpenAI LLM generates response
            tts,                          # Deepgram Text-to-Speech
            transport.output(),           # Audio output to Daily
            llm_assistant_aggregator,    # Track assistant responses
        ]
    )

    # Prepare initial messages
    messages = [
        {"role": "system", "content": system_prompt}
    ]

    # Add greeting based on topic type
    if current_topic.get("type") == "statement":
        greeting = current_topic.get("content", "Welcome to the interview.")
    else:
        topic_name = current_topic.get("name", "this topic")
        greeting = f"Hi there! I'm excited to chat with you about {topic_name}. Let's get started."

    messages.append({"role": "assistant", "content": greeting})

    # Create task
    task = PipelineTask(
        pipeline,
        PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    # Event handlers
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        logger.info(f"Participant joined: {participant['id']}")
        # Send greeting
        await task.queue_frames([LLMMessagesFrame(messages)])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant):
        logger.info(f"Participant left: {participant['id']}")
        await task.queue_frames([EndFrame()])

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        logger.info(f"Call state: {state}")

    # Run the pipeline
    runner = PipelineRunner()
    await runner.run(task)

    logger.info(f"Interview session {session_id} completed")
