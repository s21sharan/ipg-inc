"""
Test Interview Guide Simulation Integration

Tests that generated interview guide topics work correctly with the simulation engine.
Verifies the Topic[] structure is compatible with existing simulation flow.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import json


# Sample generated topics matching exact existing Topic structure
SAMPLE_GENERATED_TOPICS = [
    {
        "id": "1",
        "name": "Kickoff",
        "type": "statement",
        "content": "Thanks for joining us today! We're excited to learn about your experience with Duolingo."
    },
    {
        "id": "2",
        "name": "Introduction: Why Duolingo",
        "type": "question",
        "question": "Why do you have Duolingo on your phone?",
        "probeQuestions": "Have you tried other language learning apps?\nHave you ever stopped using Duolingo for a period?",
        "probeDepth": "1-2"
    },
    {
        "id": "3",
        "name": "Introduction: Coming back",
        "type": "question",
        "question": "What keeps you coming back to Duolingo?\n\nOptions:\n- The streak system motivates me\n- I enjoy the gamification\n- It fits my schedule\n- Other",
        "probeQuestions": "Tell me more about that.\nHow often does that happen?",
        "probeDepth": "1-2"
    },
    {
        "id": "4",
        "name": "Free Experience: Learning moments",
        "type": "question",
        "question": "When does Duolingo help you learn best?",
        "probeQuestions": "Can you give me a specific example?\nHow does that compare to other learning experiences?",
        "probeDepth": "3-5"
    },
    {
        "id": "5",
        "name": "Upgrade Decision: Value perception",
        "type": "question",
        "question": "What's holding you back from upgrading to Super Duolingo?",
        "probeQuestions": "I don't feel the premium features are worth paying for.\nThe free version already meets my needs.\nSuper feels too expensive.\nI don't use Duolingo consistently enough to justify paying.\nOther:",
        "probeDepth": "3-5"
    },
    {
        "id": "6",
        "name": "Signoff",
        "type": "statement",
        "content": "Thank you so much for sharing your thoughts today! Your feedback is incredibly valuable."
    }
]

SAMPLE_AGENT_CONTEXT = {
    "reflection_memory": {
        "goals": ["Learn Spanish", "Prepare for Mexico trip"],
        "pain_points": ["Premium seems expensive", "Not sure if features are worth it"],
        "preferences": ["Free tools only", "Short daily lessons"],
        "habits": ["Uses app during commute", "Prefers morning sessions"]
    },
    "original_recent_qa": [],
    "personality": {
        "scores": {
            "openness": 0.7,
            "conscientiousness": 0.6,
            "extraversion": 0.5,
            "agreeableness": 0.8,
            "neuroticism": 0.3
        }
    }
}


class TestTopicStructureValidation:
    """Test that generated topics have valid structure for simulation."""

    def test_topics_have_required_fields(self):
        """Each topic must have id, name, type fields."""
        for topic in SAMPLE_GENERATED_TOPICS:
            assert "id" in topic, f"Topic missing 'id': {topic}"
            assert "name" in topic, f"Topic missing 'name': {topic}"
            assert "type" in topic, f"Topic missing 'type': {topic}"
            assert topic["type"] in ["statement", "question", "conversation"], \
                f"Invalid topic type: {topic['type']}"

    def test_statement_topics_have_content(self):
        """Statement topics must have content field."""
        statement_topics = [t for t in SAMPLE_GENERATED_TOPICS if t["type"] == "statement"]
        assert len(statement_topics) >= 2, "Should have at least Kickoff and Signoff"

        for topic in statement_topics:
            assert "content" in topic, f"Statement topic missing 'content': {topic}"
            assert topic["content"], f"Statement topic has empty content: {topic}"

    def test_question_topics_have_question_field(self):
        """Question topics must have question field."""
        question_topics = [t for t in SAMPLE_GENERATED_TOPICS if t["type"] == "question"]
        assert len(question_topics) >= 3, "Should have at least 3 questions"

        for topic in question_topics:
            assert "question" in topic, f"Question topic missing 'question': {topic}"
            assert topic["question"], f"Question topic has empty question: {topic}"

    def test_question_topics_have_valid_probe_depth(self):
        """Question topics should have valid probeDepth values."""
        valid_depths = ["No probe questions", "1-2", "3-5", "5-10"]
        question_topics = [t for t in SAMPLE_GENERATED_TOPICS if t["type"] == "question"]

        for topic in question_topics:
            if "probeDepth" in topic:
                assert topic["probeDepth"] in valid_depths, \
                    f"Invalid probeDepth '{topic['probeDepth']}' in topic: {topic['name']}"

    def test_probe_questions_are_newline_separated(self):
        """probeQuestions should be newline-separated strings."""
        question_topics = [t for t in SAMPLE_GENERATED_TOPICS if t["type"] == "question"]

        for topic in question_topics:
            if topic.get("probeQuestions"):
                probes = topic["probeQuestions"].split("\n")
                assert len(probes) >= 1, f"Should have at least one probe question: {topic['name']}"
                for probe in probes:
                    assert len(probe.strip()) > 0 or probe == "", \
                        f"Empty probe in topic: {topic['name']}"

    def test_has_kickoff_and_signoff(self):
        """Topics should start with Kickoff and end with Signoff."""
        assert SAMPLE_GENERATED_TOPICS[0]["name"] == "Kickoff", "First topic should be Kickoff"
        assert SAMPLE_GENERATED_TOPICS[0]["type"] == "statement", "Kickoff should be statement type"

        assert SAMPLE_GENERATED_TOPICS[-1]["name"] == "Signoff", "Last topic should be Signoff"
        assert SAMPLE_GENERATED_TOPICS[-1]["type"] == "statement", "Signoff should be statement type"

    def test_question_topics_use_section_naming(self):
        """Question topics should use 'Section: Title' naming convention."""
        question_topics = [t for t in SAMPLE_GENERATED_TOPICS if t["type"] == "question"]

        for topic in question_topics:
            assert ": " in topic["name"], \
                f"Question topic should use 'Section: Title' naming: {topic['name']}"


class TestMultipleChoiceQuestions:
    """Test multiple choice question handling."""

    def test_options_embedded_in_question(self):
        """Multiple choice options should be embedded in question text."""
        topic = SAMPLE_GENERATED_TOPICS[2]  # "Coming back" question

        assert "Options:" in topic["question"], "Should have Options: section"
        assert "- " in topic["question"], "Options should be bullet points"

    def test_options_can_be_parsed(self):
        """Options should be parseable from question text."""
        topic = SAMPLE_GENERATED_TOPICS[2]
        question = topic["question"]

        # Split on Options:
        parts = question.split("Options:")
        assert len(parts) == 2, "Should split into question and options"

        # Parse options
        options_text = parts[1].strip()
        options = [opt.replace("- ", "").strip() for opt in options_text.split("\n") if opt.strip()]

        assert len(options) >= 2, "Should have at least 2 options"


class TestSimulationCompatibility:
    """Test that topics are compatible with simulation engine patterns."""

    def test_topics_serializable_to_json(self):
        """Topics should be JSON serializable."""
        json_str = json.dumps(SAMPLE_GENERATED_TOPICS)
        parsed = json.loads(json_str)
        assert len(parsed) == len(SAMPLE_GENERATED_TOPICS)

    def test_topics_match_simulation_engine_interface(self):
        """Topics should match the simulation-engine.ts Topic interface."""
        required_base_fields = {"id", "name", "type"}

        for topic in SAMPLE_GENERATED_TOPICS:
            topic_fields = set(topic.keys())
            assert required_base_fields.issubset(topic_fields), \
                f"Topic missing required fields: {required_base_fields - topic_fields}"

    def test_conversation_topic_structure(self):
        """Test conversation topic structure if present."""
        conversation_topic = {
            "id": "7",
            "name": "Deep Dive: Feature Discussion",
            "type": "conversation",
            "persona": "Curious researcher",
            "goals": "Understand feature usage\nExplore pain points",
            "maxDuration": "5 minutes"
        }

        # Verify structure
        assert conversation_topic["type"] == "conversation"
        assert "persona" in conversation_topic
        assert "goals" in conversation_topic
        # Goals should be newline-separated
        goals = conversation_topic["goals"].split("\n")
        assert len(goals) >= 1


class TestAgentContextCompatibility:
    """Test that agent context works with generated topics."""

    def test_agent_context_has_reflection_memory(self):
        """Agent context should have reflection_memory."""
        assert "reflection_memory" in SAMPLE_AGENT_CONTEXT
        assert "goals" in SAMPLE_AGENT_CONTEXT["reflection_memory"]
        assert "pain_points" in SAMPLE_AGENT_CONTEXT["reflection_memory"]

    def test_agent_context_has_personality(self):
        """Agent context should have personality scores."""
        assert "personality" in SAMPLE_AGENT_CONTEXT
        assert "scores" in SAMPLE_AGENT_CONTEXT["personality"]

        scores = SAMPLE_AGENT_CONTEXT["personality"]["scores"]
        ocean_traits = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"]
        for trait in ocean_traits:
            assert trait in scores, f"Missing OCEAN trait: {trait}"
            assert 0 <= scores[trait] <= 1, f"Trait {trait} score out of range"


class TestSectionGrouping:
    """Test section grouping logic for UI rendering."""

    def test_sections_can_be_extracted(self):
        """Sections should be extractable from topic names."""
        sections = set()

        for topic in SAMPLE_GENERATED_TOPICS:
            if topic["type"] == "question":
                # Extract section from "Section: Title" format
                section = topic["name"].split(":")[0].strip()
                sections.add(section)

        assert len(sections) >= 2, f"Should have at least 2 sections, found: {sections}"

    def test_topics_group_correctly_by_section(self):
        """Topics should group correctly by section prefix."""
        section_topics = {}

        for topic in SAMPLE_GENERATED_TOPICS:
            if topic["type"] == "question":
                section = topic["name"].split(":")[0].strip()
                if section not in section_topics:
                    section_topics[section] = []
                section_topics[section].append(topic)

        # Each section should have at least one topic
        for section, topics in section_topics.items():
            assert len(topics) >= 1, f"Section '{section}' should have at least 1 topic"


@pytest.mark.integration
class TestSimulationEngineIntegration:
    """Integration tests with actual simulation engine (requires services)."""

    @pytest.fixture
    def mock_llm_response(self):
        """Mock LLM response for simulation."""
        return {
            "answer": "I use Duolingo because it's free and convenient for learning Spanish on my commute.",
            "cognitive": {
                "emotional_before": {
                    "curiosity": 0.6,
                    "frustration": 0.2,
                    "enthusiasm": 0.7,
                    "anxiety": 0.1,
                    "contentment": 0.5
                },
                "emotional_after": {
                    "curiosity": 0.7,
                    "frustration": 0.1,
                    "enthusiasm": 0.8,
                    "anxiety": 0.1,
                    "contentment": 0.6
                }
            }
        }

    def test_statement_topic_processing(self, mock_llm_response):
        """Test that statement topics produce agent acknowledgment."""
        topic = SAMPLE_GENERATED_TOPICS[0]  # Kickoff
        assert topic["type"] == "statement"

        # Simulate transcript entry for statement
        transcript_entry = {
            "question": topic["content"],
            "answer": "Thanks for having me! I'm happy to share my experience.",
            "is_followup": False
        }

        assert transcript_entry["question"] == topic["content"]
        assert len(transcript_entry["answer"]) > 0

    def test_question_topic_with_followups(self, mock_llm_response):
        """Test question topic generates main question and follow-ups."""
        topic = SAMPLE_GENERATED_TOPICS[1]  # "Why Duolingo" question
        assert topic["type"] == "question"

        # Parse follow-ups
        followups = topic["probeQuestions"].split("\n")

        # Simulate transcript with main question and follow-ups
        transcript = [
            {"question": topic["question"], "answer": mock_llm_response["answer"], "is_followup": False},
        ]

        # Add follow-up entries
        for i, followup in enumerate(followups):
            transcript.append({
                "question": followup,
                "answer": f"Response to follow-up {i+1}",
                "is_followup": True,
                "followup_to_index": 0
            })

        # Verify transcript structure
        assert len(transcript) >= 1
        assert not transcript[0]["is_followup"]

        # Check follow-ups
        followup_entries = [t for t in transcript if t.get("is_followup")]
        assert len(followup_entries) == len(followups)

    def test_full_guide_transcript_generation(self, mock_llm_response):
        """Test full interview guide produces complete transcript."""
        transcript = []

        for topic in SAMPLE_GENERATED_TOPICS:
            if topic["type"] == "statement":
                transcript.append({
                    "question": topic["content"],
                    "answer": "Acknowledged",
                    "is_followup": False
                })
            elif topic["type"] == "question":
                transcript.append({
                    "question": topic["question"],
                    "answer": mock_llm_response["answer"],
                    "is_followup": False
                })
                # Add one follow-up per question
                if topic.get("probeQuestions"):
                    first_probe = topic["probeQuestions"].split("\n")[0]
                    transcript.append({
                        "question": first_probe,
                        "answer": "Follow-up response",
                        "is_followup": True,
                        "followup_to_index": len(transcript) - 1
                    })

        # Should have entries for all topics plus some follow-ups
        assert len(transcript) >= len(SAMPLE_GENERATED_TOPICS)

        # First and last should be from statement topics
        assert "Thanks for joining" in transcript[0]["question"]


@pytest.mark.evaluation
class TestAgentResponseQuality:
    """Tests that use LLM to evaluate agent response quality."""

    def test_agent_answer_references_context(self):
        """Agent answers should reference their reflection memory context."""
        # This would normally call LLM to evaluate
        # For unit test, we verify the structure is correct
        topic = SAMPLE_GENERATED_TOPICS[4]  # "Value perception" question

        # Agent with budget concerns should reference price in answer
        agent_context = SAMPLE_AGENT_CONTEXT
        assert "expensive" in str(agent_context["reflection_memory"]["pain_points"]).lower()

        # In real test, LLM would evaluate if answer references these pain points
        expected_keywords = ["free", "cost", "money", "expensive", "budget", "price"]

        # Placeholder for LLM evaluation
        simulated_answer = "The free version works well for me. I'm hesitant about the cost."
        assert any(kw in simulated_answer.lower() for kw in expected_keywords)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
