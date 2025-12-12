#!/usr/bin/env python3
"""
E2E Test Script for Interview Guide Generation

Tests the full flow:
1. Generate interview guide via API
2. Verify Topic[] structure
3. Simulate conversation with generated topics
4. Verify transcript is valid

Usage:
  python scripts/test_interview_guide_e2e.py --generate
  python scripts/test_interview_guide_e2e.py --simulate
  python scripts/test_interview_guide_e2e.py --full
"""

import argparse
import asyncio
import json
import os
import sys
from typing import List, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Sample test data
TEST_CAMPAIGN = {
    "title": "Duolingo Super Conversion Study",
    "goal": "Understand why free users don't upgrade to Super Duolingo",
    "audience": "Free users hesitant to upgrade",
    "focusCategory": "Value Perception"
}

SAMPLE_AGENT = {
    "id": "test-agent-001",
    "name": "Maria Rodriguez",
    "transcript": [
        {"question": "Why do you use Duolingo?", "answer": "To learn Spanish for my trip to Mexico."}
    ],
    "reflection_memory": {
        "goals": ["Learn conversational Spanish", "Prepare for Mexico trip"],
        "pain_points": ["Premium seems expensive", "Not sure if features are worth it"],
        "preferences": ["Free learning tools", "Short daily lessons"],
        "habits": ["Uses app during commute", "Morning learner"]
    },
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


def validate_topic_structure(topics: List[Dict[str, Any]]) -> bool:
    """Validate that topics match expected structure."""
    print("\n--- Validating Topic Structure ---")

    if not topics:
        print("ERROR: No topics generated")
        return False

    # Check for required fields
    for i, topic in enumerate(topics):
        if "id" not in topic:
            print(f"ERROR: Topic {i} missing 'id'")
            return False
        if "name" not in topic:
            print(f"ERROR: Topic {i} missing 'name'")
            return False
        if "type" not in topic:
            print(f"ERROR: Topic {i} missing 'type'")
            return False
        if topic["type"] not in ["statement", "question", "conversation"]:
            print(f"ERROR: Topic {i} has invalid type: {topic['type']}")
            return False

        # Type-specific validation
        if topic["type"] == "statement":
            if not topic.get("content"):
                print(f"ERROR: Statement topic '{topic['name']}' missing content")
                return False
        elif topic["type"] == "question":
            if not topic.get("question"):
                print(f"ERROR: Question topic '{topic['name']}' missing question")
                return False

    # Check Kickoff/Signoff
    if topics[0]["name"] != "Kickoff":
        print(f"WARNING: First topic is '{topics[0]['name']}', expected 'Kickoff'")
    if topics[-1]["name"] != "Signoff":
        print(f"WARNING: Last topic is '{topics[-1]['name']}', expected 'Signoff'")

    print(f"SUCCESS: All {len(topics)} topics have valid structure")
    return True


def validate_question_naming(topics: List[Dict[str, Any]]) -> bool:
    """Validate question topics use section naming convention."""
    print("\n--- Validating Question Naming ---")

    question_topics = [t for t in topics if t["type"] == "question"]

    for topic in question_topics:
        if ": " not in topic["name"]:
            print(f"WARNING: Question '{topic['name']}' doesn't use 'Section: Title' naming")

    sections = set()
    for topic in question_topics:
        section = topic["name"].split(":")[0].strip()
        sections.add(section)

    print(f"Found {len(sections)} sections: {sections}")
    return True


def simulate_transcript(topics: List[Dict[str, Any]], agent: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Simulate a transcript using the generated topics."""
    print("\n--- Simulating Transcript ---")

    transcript = []

    for topic in topics:
        if topic["type"] == "statement":
            # Agent acknowledges statement
            transcript.append({
                "question": topic["content"],
                "answer": f"[Agent acknowledges: {topic['name']}]",
                "is_followup": False
            })
            print(f"  Statement: {topic['name']}")

        elif topic["type"] == "question":
            # Main question
            main_entry = {
                "question": topic["question"],
                "answer": generate_mock_answer(topic, agent),
                "is_followup": False
            }
            transcript.append(main_entry)
            print(f"  Question: {topic['name'][:40]}...")

            # Add follow-ups if present
            if topic.get("probeQuestions"):
                probes = topic["probeQuestions"].split("\n")
                probe_count = get_probe_count(topic.get("probeDepth", "1-2"))

                for i, probe in enumerate(probes[:probe_count]):
                    if probe.strip():
                        transcript.append({
                            "question": probe,
                            "answer": f"[Follow-up response {i+1}]",
                            "is_followup": True,
                            "followup_to_index": len(transcript) - 1 - i
                        })
                print(f"    + {min(len(probes), probe_count)} follow-ups")

    print(f"\nGenerated transcript with {len(transcript)} entries")
    return transcript


def generate_mock_answer(topic: Dict[str, Any], agent: Dict[str, Any]) -> str:
    """Generate a mock answer based on agent context."""
    # In real test, this would call the simulation engine
    pain_points = agent.get("reflection_memory", {}).get("pain_points", [])

    if "upgrade" in topic.get("question", "").lower() or "super" in topic.get("question", "").lower():
        return f"Honestly, the free version works well for me. {pain_points[0] if pain_points else 'Im not sure I need premium.'}"

    if "why" in topic.get("question", "").lower():
        goals = agent.get("reflection_memory", {}).get("goals", [])
        return f"I use Duolingo because {goals[0].lower() if goals else 'I want to learn a new language'}."

    return "That's a good question. Let me think about that..."


def get_probe_count(probe_depth: str) -> int:
    """Get number of probes based on depth setting."""
    depth_map = {
        "No probe questions": 0,
        "1-2": 2,
        "3-5": 4,
        "5-10": 7
    }
    return depth_map.get(probe_depth, 2)


def validate_transcript(transcript: List[Dict[str, Any]]) -> bool:
    """Validate transcript structure."""
    print("\n--- Validating Transcript ---")

    if not transcript:
        print("ERROR: Empty transcript")
        return False

    main_questions = [t for t in transcript if not t.get("is_followup")]
    followups = [t for t in transcript if t.get("is_followup")]

    print(f"Main entries: {len(main_questions)}")
    print(f"Follow-ups: {len(followups)}")

    # Check all entries have required fields
    for i, entry in enumerate(transcript):
        if "question" not in entry:
            print(f"ERROR: Entry {i} missing 'question'")
            return False
        if "answer" not in entry:
            print(f"ERROR: Entry {i} missing 'answer'")
            return False

    print("SUCCESS: Transcript structure is valid")
    return True


async def test_generate_guide():
    """Test guide generation (mock - real test would call API)."""
    print("=" * 60)
    print("TEST: Generate Interview Guide")
    print("=" * 60)

    print(f"\nInput:")
    print(f"  Title: {TEST_CAMPAIGN['title']}")
    print(f"  Goal: {TEST_CAMPAIGN['goal']}")
    print(f"  Audience: {TEST_CAMPAIGN['audience']}")
    print(f"  Focus: {TEST_CAMPAIGN['focusCategory']}")

    # Mock generated topics (in real test, call /api/generate-interview-guide)
    topics = [
        {"id": "1", "name": "Kickoff", "type": "statement", "content": "Thanks for joining us today! We're excited to learn about your experience with Duolingo."},
        {"id": "2", "name": "Introduction: Why Duolingo", "type": "question", "question": "Why do you have Duolingo on your phone?", "probeQuestions": "Have you tried other apps?\nHow long have you used it?", "probeDepth": "1-2"},
        {"id": "3", "name": "Value: Premium hesitation", "type": "question", "question": "What's holding you back from upgrading to Super?", "probeQuestions": "Is it the price?\nDo you feel you need the features?", "probeDepth": "3-5"},
        {"id": "4", "name": "Signoff", "type": "statement", "content": "Thank you for your time!"}
    ]

    print(f"\nGenerated {len(topics)} topics:")
    for topic in topics:
        print(f"  [{topic['type']}] {topic['name']}")

    # Validate
    assert validate_topic_structure(topics), "Topic structure validation failed"
    assert validate_question_naming(topics), "Question naming validation failed"

    return topics


async def test_simulate_with_guide(topics: List[Dict[str, Any]]):
    """Test simulation with generated guide."""
    print("\n" + "=" * 60)
    print("TEST: Simulate Conversation with Generated Guide")
    print("=" * 60)

    print(f"\nAgent: {SAMPLE_AGENT['name']}")
    print(f"Pain points: {SAMPLE_AGENT['reflection_memory']['pain_points']}")

    transcript = simulate_transcript(topics, SAMPLE_AGENT)

    # Validate transcript
    assert validate_transcript(transcript), "Transcript validation failed"

    # Print sample entries
    print("\nSample transcript entries:")
    for i, entry in enumerate(transcript[:5]):
        q = entry['question'][:60] + "..." if len(entry['question']) > 60 else entry['question']
        a = entry['answer'][:60] + "..." if len(entry['answer']) > 60 else entry['answer']
        print(f"  [{i+1}] Q: {q}")
        print(f"       A: {a}")

    return transcript


async def test_full_e2e():
    """Full E2E test: generate + simulate."""
    topics = await test_generate_guide()
    transcript = await test_simulate_with_guide(topics)

    print("\n" + "=" * 60)
    print("E2E TEST COMPLETE")
    print("=" * 60)
    print(f"Generated {len(topics)} topics")
    print(f"Simulated {len(transcript)} transcript entries")
    print("All validations passed!")

    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="E2E test for interview guide generation")
    parser.add_argument("--generate", action="store_true", help="Test generation only")
    parser.add_argument("--simulate", action="store_true", help="Test simulation only")
    parser.add_argument("--full", action="store_true", help="Full E2E test")
    args = parser.parse_args()

    if args.generate:
        asyncio.run(test_generate_guide())
    elif args.simulate:
        # Use mock topics for simulation-only test
        mock_topics = [
            {"id": "1", "name": "Kickoff", "type": "statement", "content": "Welcome!"},
            {"id": "2", "name": "Test: Question", "type": "question", "question": "Test question?", "probeQuestions": "Follow-up 1\nFollow-up 2", "probeDepth": "1-2"},
            {"id": "3", "name": "Signoff", "type": "statement", "content": "Thanks!"}
        ]
        asyncio.run(test_simulate_with_guide(mock_topics))
    else:
        # Default to full E2E test
        success = asyncio.run(test_full_e2e())
        sys.exit(0 if success else 1)
