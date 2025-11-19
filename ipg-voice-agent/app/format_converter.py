"""
Format converter between Supabase campaign format and Discussion Guide format.
Handles bidirectional conversion for seamless integration.
"""

from typing import Dict, List, Any, Optional
from app.guide_models import (
    DiscussionGuide,
    StatementStep,
    ConversationStep,
    QuestionStep,
    GuideStep
)
import uuid
import re


class FormatConverter:
    """Convert between Supabase campaign format and agent guide format"""

    @staticmethod
    def parse_time_estimate(time_estimate: str) -> int:
        """Parse time estimate string to minutes"""
        # Handle formats like "10 minutes", "10-15 minutes", "10"
        if not time_estimate:
            return 5

        # Extract numbers from string
        numbers = re.findall(r'\d+', time_estimate)
        if numbers:
            # If range (e.g., "10-15"), take the higher value
            return int(numbers[-1])
        return 5

    @staticmethod
    def supabase_to_guide(campaign_data: Dict[str, Any]) -> DiscussionGuide:
        """
        Convert Supabase campaign format to DiscussionGuide format.

        Supabase format:
        {
            "id": "uuid",
            "name": "Campaign Name",
            "title": "Campaign Title",
            "caption": "Description",
            "topics": [
                {
                    "id": "1",
                    "type": "statement",
                    "content": "...",
                    "name": "Kickoff"
                },
                {
                    "id": "2",
                    "type": "conversation",
                    "goals": "...",
                    "persona": "David - The Curious Friend",
                    "content": ""
                },
                {
                    "id": "3",
                    "type": "question",
                    "question": "...",
                    "probeQuestions": ["...", "..."]
                }
            ],
            "time_estimate": "15 minutes",
            "completion_logic": {...}
        }
        """
        topics = campaign_data.get('topics', [])
        steps: List[GuideStep] = []

        # Calculate time per topic
        total_time = FormatConverter.parse_time_estimate(
            campaign_data.get('time_estimate', '15 minutes')
        )
        time_per_topic = max(1, total_time // len(topics)) if topics else 5

        for i, topic in enumerate(topics):
            topic_type = topic.get('type', 'statement').lower()
            topic_id = str(topic.get('id', uuid.uuid4()))
            topic_name = topic.get('name', f"Topic {i+1}")

            # Assign time with special cases
            if 'kickoff' in topic_name.lower() or 'signoff' in topic_name.lower():
                max_duration = 1  # Short for kickoff/signoff
            elif topic_type == 'statement':
                max_duration = 1
            elif topic_type == 'conversation':
                max_duration = min(time_per_topic + 2, 10)  # Slightly more for conversations
            else:
                max_duration = time_per_topic

            if topic_type == 'statement':
                content = topic.get('content', '')
                if not content and 'question' in topic:
                    content = topic['question']

                steps.append(StatementStep(
                    id=topic_id,
                    name=topic_name,
                    content=content,
                    max_duration_minutes=max_duration
                ))

            elif topic_type == 'conversation':
                goals = topic.get('goals', '')
                if not goals and 'content' in topic:
                    goals = topic['content']

                steps.append(ConversationStep(
                    id=topic_id,
                    name=topic_name,
                    goals=goals,
                    persona=topic.get('persona', 'Friendly Interviewer'),
                    content=topic.get('content', ''),
                    max_duration_minutes=max_duration
                ))

            elif topic_type == 'question':
                question = topic.get('question', '')
                if not question and 'content' in topic:
                    question = topic['content']

                # Handle probe questions (could be array or string)
                probe_questions = topic.get('probeQuestions', '')
                if isinstance(probe_questions, list):
                    probe_questions = '\n'.join(probe_questions)

                steps.append(QuestionStep(
                    id=topic_id,
                    name=topic_name,
                    question=question,
                    probe_depth=topic.get('probeDepth', '1-2'),
                    probe_questions=probe_questions,
                    max_duration_minutes=max_duration
                ))

        # Create the guide
        guide = DiscussionGuide(
            id=campaign_data.get('id'),
            name=campaign_data.get('name', 'Interview'),
            description=campaign_data.get('caption', ''),
            steps=steps,
            metadata={
                'campaign_id': campaign_data.get('id'),
                'title': campaign_data.get('title'),
                'modality': campaign_data.get('modality', 'Audio Only'),
                'completion_logic': campaign_data.get('completion_logic', {})
            }
        )

        return guide

    @staticmethod
    def guide_to_supabase(guide: DiscussionGuide) -> Dict[str, Any]:
        """
        Convert DiscussionGuide format back to Supabase campaign format.
        """
        topics = []

        for step in guide.steps:
            topic = {
                'id': step.id,
                'name': step.name,
                'type': step.type
            }

            if isinstance(step, StatementStep):
                topic['content'] = step.content

            elif isinstance(step, ConversationStep):
                topic['goals'] = step.goals
                topic['persona'] = step.persona
                topic['content'] = step.content or ''

            elif isinstance(step, QuestionStep):
                topic['question'] = step.question
                topic['probeDepth'] = step.probe_depth
                topic['probeQuestions'] = step.probe_questions_list
                topic['content'] = step.content or ''

            topics.append(topic)

        # Calculate total time estimate
        total_minutes = guide.total_estimated_minutes()
        time_estimate = f"{total_minutes} minutes"

        return {
            'id': guide.id,
            'name': guide.name,
            'title': guide.metadata.get('title', guide.name),
            'caption': guide.description or '',
            'topics': topics,
            'time_estimate': time_estimate,
            'modality': guide.metadata.get('modality', 'Audio Only'),
            'completion_logic': guide.metadata.get('completion_logic', {
                'completion_message': 'Thank you for your time!',
                'exit_message': 'Interview ended.',
                'redirect_url': ''
            })
        }

    @staticmethod
    def validate_campaign_format(campaign_data: Dict[str, Any]) -> bool:
        """Validate that campaign data has required fields"""
        required = ['topics']
        for field in required:
            if field not in campaign_data:
                return False

        # Validate topics structure
        topics = campaign_data.get('topics', [])
        if not isinstance(topics, list) or len(topics) == 0:
            return False

        for topic in topics:
            if not isinstance(topic, dict):
                return False
            if 'type' not in topic:
                return False

        return True

    @staticmethod
    def extract_persona_traits(persona: str) -> Dict[str, str]:
        """
        Extract personality traits from persona string.
        E.g., "David - The Curious Friend" -> {name: "David", trait: "Curious Friend"}
        """
        if '-' in persona:
            parts = persona.split('-', 1)
            return {
                'name': parts[0].strip(),
                'trait': parts[1].strip().replace('The ', '')
            }
        return {
            'name': 'Interviewer',
            'trait': persona or 'Professional'
        }

    @staticmethod
    def merge_completion_logic(guide: DiscussionGuide, completion_logic: Dict[str, Any]) -> None:
        """Merge completion logic into guide metadata"""
        if not guide.metadata:
            guide.metadata = {}

        guide.metadata['completion_logic'] = {
            'completion_message': completion_logic.get('completion_message', 'Thank you for participating!'),
            'exit_message': completion_logic.get('exit_message', 'Interview ended early.'),
            'redirect_url': completion_logic.get('redirect_url', ''),
            'save_on_exit': completion_logic.get('save_on_exit', True),
            'allow_restart': completion_logic.get('allow_restart', False)
        }