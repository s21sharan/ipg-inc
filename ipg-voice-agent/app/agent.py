"""
Main Pipecat agent orchestration.
Integrates STT, LLM, TTS services with the guide engine.
"""

import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.frames.frames import (
    Frame,
    AudioRawFrame,
    TextFrame,
    TranscriptionFrame,
    StartFrame,
    EndFrame,
    SystemFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    TTSStartedFrame,
    TTSStoppedFrame
)
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.services.cartesia import CartesiaTTSService
from pipecat.services.openai import OpenAILLMService

from pipecat.transports.services.daily import DailyTransport, DailyParams

from app.config import get_settings
from app.guide_models import DiscussionGuide, StatementStep, ConversationStep, QuestionStep
from app.guide_engine import GuideEngine
from app.logging_utils import ConversationLogger


class InterviewAgentProcessor(FrameProcessor):
    """
    Custom processor that manages the interview flow.
    Coordinates between guide engine, LLM, and conversation state.
    """

    def __init__(
        self,
        guide_engine: GuideEngine,
        llm_service: OpenAILLMService,
        logger: ConversationLogger
    ):
        super().__init__()
        self.guide_engine = guide_engine
        self.llm_service = llm_service
        self.logger = logger

        # Initialize context without messages - we'll manage context manually
        self.llm_context = OpenAILLMContext()

        # State management
        self.current_step_initialized = False
        self.waiting_for_response = False
        self.last_transcript = ""
        self.conversation_history: List[Dict[str, str]] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        """Process incoming frames and manage interview flow"""
        print(f"InterviewAgentProcessor.process_frame() called with frame type: {type(frame).__name__}, direction: {direction}")

        # Handle start of interview
        if isinstance(frame, StartFrame):
            print("InterviewAgentProcessor: Detected StartFrame!")
            await self._start_interview()

        # Handle user speech transcription
        elif isinstance(frame, TranscriptionFrame):
            await self._handle_transcription(frame)

        # Handle TTS completion
        elif isinstance(frame, TTSStoppedFrame):
            self.waiting_for_response = True

        # Handle user starting to speak
        elif isinstance(frame, UserStartedSpeakingFrame):
            # Cancel any pending agent speech
            pass

        # Handle user stopped speaking
        elif isinstance(frame, UserStoppedSpeakingFrame):
            if self.waiting_for_response and self.last_transcript:
                await self._generate_response()

        # Pass frame downstream
        await self.push_frame(frame, direction)

    async def _start_interview(self) -> None:
        """Start the interview with the first step"""
        print("InterviewAgentProcessor: Starting interview...")
        first_step = await self.guide_engine.start()
        print(f"InterviewAgentProcessor: First step = {first_step}")
        if first_step:
            await self._execute_current_step()
        else:
            print("InterviewAgentProcessor: No first step found!")

    async def _execute_current_step(self) -> None:
        """Execute the current guide step"""
        print("InterviewAgentProcessor: Executing current step...")
        step = self.guide_engine.get_current_step()
        print(f"InterviewAgentProcessor: Current step type = {type(step).__name__ if step else None}")
        if not step:
            await self._end_interview()
            return

        self.current_step_initialized = True

        # Clear conversation history and set new system prompt for this step
        system_prompt = self.guide_engine.get_system_prompt_for_step()
        self.conversation_history = [
            {"role": "system", "content": system_prompt}
        ]

        if isinstance(step, StatementStep):
            # For statements, speak the content directly
            print(f"InterviewAgentProcessor: Speaking statement: {step.content[:50]}...")
            await self._speak(step.content)
            self.guide_engine.record_agent_turn()

            # Auto-transition after speaking
            await asyncio.sleep(1)
            await self._transition_to_next_step()

        elif isinstance(step, ConversationStep):
            # Start conversation with opening question based on goals
            opening = self._generate_conversation_opener(step)
            print(f"InterviewAgentProcessor: Speaking conversation opener: {opening[:50]}...")
            await self._speak(opening)
            self.guide_engine.record_agent_turn()
            self.waiting_for_response = True

        elif isinstance(step, QuestionStep):
            # Ask the primary question
            print(f"InterviewAgentProcessor: Speaking question: {step.question[:50]}...")
            await self._speak(step.question)
            self.guide_engine.record_agent_turn()
            self.waiting_for_response = True

    async def _handle_transcription(self, frame: TranscriptionFrame) -> None:
        """Handle incoming speech transcription"""
        if not frame.text or frame.is_interim:
            return

        self.last_transcript = frame.text
        self.guide_engine.record_participant_response(frame.text)

        # Log to transcript
        await self.logger.log_participant_utterance(
            frame.text,
            self.guide_engine.current_step.id if self.guide_engine.current_step else None
        )

        # Add to conversation history
        self.conversation_history.append({
            "role": "user",
            "content": frame.text
        })

    async def _generate_response(self) -> None:
        """Generate agent response based on current step and context"""
        self.waiting_for_response = False
        step = self.guide_engine.get_current_step()

        if not step:
            return

        # Check if we should transition
        if self.guide_engine.should_transition_step():
            transition_msg = self.guide_engine.get_transition_message()
            await self._speak(transition_msg)
            await self._transition_to_next_step()
            return

        # Generate appropriate response based on step type
        if isinstance(step, ConversationStep):
            # Generate conversational response
            response = await self._generate_llm_response()
            await self._speak(response)
            self.guide_engine.record_agent_turn()
            self.waiting_for_response = True

        elif isinstance(step, QuestionStep):
            # Check for probe questions
            probe = self.guide_engine.get_next_probe(self.last_transcript)
            if probe:
                # Format and ask probe
                formatted_probe = self.guide_engine.format_probe_naturally(probe, self.last_transcript)
                await self._speak(formatted_probe)
                self.guide_engine.record_agent_turn()
                self.waiting_for_response = True
            else:
                # No more probes, transition
                transition_msg = self.guide_engine.get_transition_message()
                await self._speak(transition_msg)
                await self._transition_to_next_step()

    async def _generate_llm_response(self) -> str:
        """Generate response using LLM"""
        # Use conversation_history which already includes system prompt
        # Limit to recent messages to avoid context length issues
        recent_history = self.conversation_history[-10:] if len(self.conversation_history) > 10 else self.conversation_history

        # Generate response
        try:
            response = await self.llm_service.generate(recent_history)
            # Add to history
            self.conversation_history.append({
                "role": "assistant",
                "content": response
            })
            return response
        except Exception as e:
            print(f"Error generating LLM response: {e}")
            return "I see. Could you tell me more about that?"

    def _generate_conversation_opener(self, step: ConversationStep) -> str:
        """Generate an opening question for a conversation step"""
        openers = {
            "Daily Charging Habits": "Let's start by talking about your typical day with your EV. Walk me through how charging fits into your daily routine.",
            "Frustrations and Challenges": "I'd love to hear about your experiences with EV charging. What's been working well for you, and what's been frustrating?",
            "Future Improvements": "If you could wave a magic wand and improve EV charging, what would you change?"
        }

        # Check if we have a specific opener for this step
        if step.name in openers:
            return openers[step.name]

        # Generate based on goals
        if step.goals_list:
            first_goal = step.goals_list[0]
            if "understand" in first_goal.lower():
                return "Help me understand " + first_goal[first_goal.lower().find("understand") + 10:].lower()
            elif "identify" in first_goal.lower():
                return "I'd like to learn about " + first_goal[first_goal.lower().find("identify") + 8:].lower()

        # Default opener
        return "Let's talk about this topic. What comes to mind for you?"

    async def _speak(self, text: str) -> None:
        """Send text to TTS"""
        if not text:
            return

        print(f"InterviewAgentProcessor: _speak() called with text: {text[:100]}...")

        # Log agent utterance
        await self.logger.log_agent_utterance(
            text,
            self.guide_engine.current_step.id if self.guide_engine.current_step else None
        )

        # Send to TTS
        tts_frame = TextFrame(text=text)
        print(f"InterviewAgentProcessor: Pushing TextFrame downstream...")
        await self.push_frame(tts_frame, FrameDirection.DOWNSTREAM)
        print(f"InterviewAgentProcessor: TextFrame pushed")

    async def _transition_to_next_step(self) -> None:
        """Transition to the next step in the guide"""
        next_step = await self.guide_engine.move_to_next_step()
        if next_step:
            await self._execute_current_step()
        else:
            await self._end_interview()

    async def _end_interview(self) -> None:
        """End the interview"""
        # Final message if not already spoken
        if not self.guide_engine.current_step:
            await self._speak("That concludes our interview. Thank you so much for your time and insights!")

        # Send end frame
        await self.push_frame(EndFrame(), FrameDirection.DOWNSTREAM)


class VoiceInterviewAgent:
    """
    Main voice interview agent that orchestrates the entire pipeline.
    """

    def __init__(
        self,
        guide: DiscussionGuide,
        room_url: str,
        token: str,
        session_id: str
    ):
        self.guide = guide
        self.room_url = room_url
        self.token = token
        self.session_id = session_id
        self.settings = get_settings()

        # Components
        self.transport: Optional[DailyTransport] = None
        self.stt_service: Optional[DeepgramSTTService] = None
        self.tts_service: Optional[CartesiaTTSService] = None
        self.llm_service: Optional[OpenAILLMService] = None
        self.guide_engine: Optional[GuideEngine] = None
        self.logger: Optional[ConversationLogger] = None
        self.pipeline: Optional[Pipeline] = None
        self.pipeline_task: Optional[PipelineTask] = None

    async def start(self) -> None:
        """Start the interview agent"""
        # Initialize logger
        self.logger = ConversationLogger(self.session_id)
        await self.logger.initialize()

        # Initialize guide engine
        self.guide_engine = GuideEngine(self.guide, self.logger)

        # Initialize Daily transport with proper params
        daily_params = DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            camera_out_enabled=False,
            vad_enabled=True,
            vad_analyzer=None,  # Use default WebRTC VAD
            transcription_enabled=False  # We use Deepgram for STT
        )

        self.transport = DailyTransport(
            room_url=self.room_url,
            token=self.token,
            bot_name="Interview Agent",
            params=daily_params
        )

        # Initialize STT service
        self.stt_service = DeepgramSTTService(
            api_key=self.settings.deepgram.api_key,
            options={
                "language": self.settings.deepgram.language,
                "model": self.settings.deepgram.model,
                "punctuate": self.settings.deepgram.punctuate,
                "interim_results": self.settings.deepgram.interim_results,
                "endpointing": self.settings.deepgram.endpointing
            }
        )

        # Initialize TTS service
        self.tts_service = CartesiaTTSService(
            api_key=self.settings.cartesia.api_key,
            voice_id=self.settings.cartesia.voice_id,
            model=self.settings.cartesia.model,
            language=self.settings.cartesia.language,
            speed=self.settings.cartesia.speed,
            emotion=self.settings.cartesia.emotion
        )

        # Initialize LLM service
        self.llm_service = OpenAILLMService(
            api_key=self.settings.openai.api_key,
            model=self.settings.openai.model_name,
            temperature=0.7,
            max_tokens=150,
            frequency_penalty=0.3,
            presence_penalty=0.3
        )

        # Create interview processor
        interview_processor = InterviewAgentProcessor(
            guide_engine=self.guide_engine,
            llm_service=self.llm_service,
            logger=self.logger
        )

        # Build pipeline - DailyTransport provides separate input/output
        pipeline = Pipeline([
            self.transport.input(),   # Audio input from Daily
            self.stt_service,         # Speech to text
            interview_processor,      # Interview logic
            self.tts_service,         # Text to speech
            self.transport.output()   # Audio output to Daily
        ])

        # Create and start pipeline task
        runner = PipelineRunner()
        self.pipeline_task = PipelineTask(pipeline)
        await runner.run(self.pipeline_task)

    async def stop(self) -> None:
        """Stop the interview agent"""
        if self.pipeline_task:
            await self.pipeline_task.cancel()

        # Transport cleanup is handled by the pipeline task
        # No need to call transport.cleanup() directly

        if self.logger:
            await self.logger.finalize()

    async def get_status(self) -> Dict[str, Any]:
        """Get current agent status"""
        if not self.guide_engine:
            return {"status": "not_started"}

        progress = self.guide_engine.get_progress()
        step_summary = self.guide_engine.get_step_summary()

        return {
            "status": "active",
            "session_id": self.session_id,
            "progress": progress,
            "current_step": step_summary,
            "transcript_count": self.logger.get_transcript_count() if self.logger else 0
        }