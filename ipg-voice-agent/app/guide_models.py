"""
Pydantic models for discussion guide data structures.
Supports multiple step types: statement, conversation, question.
"""

from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field, validator
from datetime import datetime
import json


class GuideStepBase(BaseModel):
    """Base model for all guide step types"""
    id: str
    name: str
    type: Literal["statement", "conversation", "question"]
    max_duration_minutes: int = Field(default=5, ge=1, le=60)

    class Config:
        extra = "forbid"


class StatementStep(GuideStepBase):
    """Statement step - Agent reads content once"""
    type: Literal["statement"] = "statement"
    content: str = Field(..., min_length=1)

    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError("Statement content cannot be empty")
        return v.strip()


class ConversationStep(GuideStepBase):
    """Conversation step - Open dialogue guided by goals and persona"""
    type: Literal["conversation"] = "conversation"
    goals: str = Field(..., min_length=1)
    persona: str = Field(default="Friendly Interviewer")
    content: Optional[str] = Field(default="")  # Optional initial prompt

    @validator('goals')
    def validate_goals(cls, v):
        if not v.strip():
            raise ValueError("Conversation goals cannot be empty")
        return v.strip()

    @property
    def goals_list(self) -> List[str]:
        """Parse goals into a list (split by newlines)"""
        return [g.strip() for g in self.goals.split('\n') if g.strip()]


class QuestionStep(GuideStepBase):
    """Question step - Primary question with intelligent probes"""
    type: Literal["question"] = "question"
    question: str = Field(..., min_length=1)
    probe_depth: str = Field(default="1-2")  # e.g., "1-2" means 1-2 probes
    probe_questions: str = Field(default="")
    content: Optional[str] = Field(default="")  # For compatibility

    @validator('question')
    def validate_question(cls, v):
        if not v.strip():
            raise ValueError("Question cannot be empty")
        return v.strip()

    @validator('probe_depth')
    def validate_probe_depth(cls, v):
        # Parse formats like "1-2", "2-3", "1", etc.
        if '-' in v:
            try:
                min_val, max_val = map(int, v.split('-'))
                if min_val < 0 or max_val < min_val:
                    raise ValueError
            except:
                raise ValueError("Probe depth must be in format 'X-Y' where X <= Y")
        else:
            try:
                int(v)
            except:
                raise ValueError("Probe depth must be a number or range (e.g., '1-2')")
        return v

    @property
    def probe_questions_list(self) -> List[str]:
        """Parse probe questions into a list (split by newlines, remove quotes)"""
        if not self.probe_questions:
            return []
        # Split by newlines and clean up quotes
        probes = []
        for line in self.probe_questions.split('\n'):
            line = line.strip()
            # Remove surrounding quotes if present
            if line.startswith('"') and line.endswith('"'):
                line = line[1:-1]
            elif line.startswith("'") and line.endswith("'"):
                line = line[1:-1]
            if line:
                probes.append(line)
        return probes

    @property
    def min_probes(self) -> int:
        """Get minimum number of probes"""
        if '-' in self.probe_depth:
            return int(self.probe_depth.split('-')[0])
        return int(self.probe_depth)

    @property
    def max_probes(self) -> int:
        """Get maximum number of probes"""
        if '-' in self.probe_depth:
            return int(self.probe_depth.split('-')[1])
        return int(self.probe_depth)


# Union type for any step
GuideStep = Union[StatementStep, ConversationStep, QuestionStep]


class DiscussionGuide(BaseModel):
    """Complete discussion guide containing multiple steps"""
    id: Optional[str] = Field(default=None)
    name: str = Field(default="Interview Guide")
    description: Optional[str] = Field(default=None)
    steps: List[GuideStep] = Field(..., min_items=1)
    created_at: Optional[datetime] = Field(default_factory=datetime.now)
    metadata: dict = Field(default_factory=dict)

    @validator('steps')
    def validate_steps(cls, v):
        if not v:
            raise ValueError("Guide must have at least one step")
        # Ensure at least one statement for kickoff
        has_kickoff = any(
            isinstance(step, StatementStep) and 'kickoff' in step.name.lower()
            for step in v
        )
        if not has_kickoff:
            # Add a default kickoff if none exists
            print("Warning: No kickoff statement found in guide")
        return v

    def get_step(self, index: int) -> Optional[GuideStep]:
        """Get step by index"""
        if 0 <= index < len(self.steps):
            return self.steps[index]
        return None

    def get_next_step(self, current_index: int) -> Optional[GuideStep]:
        """Get the next step after current index"""
        next_index = current_index + 1
        return self.get_step(next_index)

    @classmethod
    def from_json_file(cls, filepath: str) -> 'DiscussionGuide':
        """Load guide from JSON file"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls.from_json_array(data)

    @classmethod
    def from_json_array(cls, data: List[dict]) -> 'DiscussionGuide':
        """Create guide from JSON array format"""
        steps = []
        for item in data:
            step_type = item.get('type', '').lower()

            # Map maxDuration string to integer minutes
            max_duration = int(item.get('maxDuration', '5'))

            if step_type == 'statement':
                steps.append(StatementStep(
                    id=item['id'],
                    name=item['name'],
                    content=item.get('content', ''),
                    max_duration_minutes=max_duration
                ))
            elif step_type == 'conversation':
                steps.append(ConversationStep(
                    id=item['id'],
                    name=item['name'],
                    goals=item.get('goals', ''),
                    persona=item.get('persona', 'Friendly Interviewer'),
                    content=item.get('content', ''),
                    max_duration_minutes=max_duration
                ))
            elif step_type == 'question':
                steps.append(QuestionStep(
                    id=item['id'],
                    name=item['name'],
                    question=item.get('question', item.get('content', '')),
                    probe_depth=item.get('probeDepth', '1-2'),
                    probe_questions=item.get('probeQuestions', ''),
                    content=item.get('content', ''),
                    max_duration_minutes=max_duration
                ))

        return cls(
            name="Discussion Guide",
            steps=steps
        )

    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.dict(), default=str, indent=2)

    def total_estimated_minutes(self) -> int:
        """Calculate total estimated duration"""
        return sum(step.max_duration_minutes for step in self.steps)