#!/usr/bin/env python3
"""
Test the consensus endpoint with mock data.
Traces through the full flow to identify where the issue is.
"""

import os
import sys

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv('../.env.local')

from app.swarm.swarm_state import SwarmOutput, SwarmMessage
from app.consensus.consensus_builder import ConsensusBuilder
from app.orchestration.llm_client import get_llm_client, LLMClient

# Mock data matching real swarm structure
MOCK_SWARM_OUTPUT: SwarmOutput = {
    "swarm_id": "test-consensus-123",
    "topic": "Would you upgrade to premium if perceived value increased?",
    "participants": [
        {
            "agent_id": "agent-1",
            "agent_name": "Marta",
            "message_count": 4,
            "demographics": {
                "name": "Marta",
                "age": 34,
                "gender": "female",
                "occupation": "Marketing Manager",
                "country": "Spain",
                "primary_app": "Duolingo",
                "learning_language": "English",
                "learning_goal": "career",
                "usage_frequency": "daily",
                "is_premium_user": False,
            }
        },
        {
            "agent_id": "agent-2",
            "agent_name": "Jason",
            "message_count": 4,
            "demographics": {
                "name": "Jason",
                "age": 28,
                "gender": "male",
                "occupation": "Software Developer",
                "country": "United States",
                "primary_app": "Duolingo",
                "learning_language": "Japanese",
                "learning_goal": "travel",
                "usage_frequency": "weekly",
                "is_premium_user": True,
            }
        },
        {
            "agent_id": "agent-3",
            "agent_name": "Petra",
            "message_count": 4,
            "demographics": {
                "name": "Petra",
                "age": 45,
                "gender": "female",
                "occupation": "Veterinarian",
                "country": "Germany",
                "primary_app": "Babbel",
                "learning_language": "Spanish",
                "learning_goal": "personal",
                "usage_frequency": "daily",
                "is_premium_user": False,
            }
        },
    ],
    "messages": [
        {
            "id": "msg-1",
            "turn_number": 1,
            "speaker_id": "agent-1",
            "speaker_name": "Marta",
            "content": "Yes, I would likely upgrade if the extra value justified the cost. Real-life client scenarios for practicing business English would be amazing. Right now I use the free version but hit frustrating limits.",
            "timestamp": "2025-12-11T10:00:00Z",
            "message_type": "dialogue",
        },
        {
            "id": "msg-2",
            "turn_number": 2,
            "speaker_id": "agent-2",
            "speaker_name": "Jason",
            "content": "Yeah, I get Marta's point. I already pay for premium and honestly the offline mode is the only thing I really use. If they added conversation practice with AI tutors that could correct my pronunciation, that would be worth even more.",
            "timestamp": "2025-12-11T10:01:00Z",
            "message_type": "dialogue",
        },
        {
            "id": "msg-3",
            "turn_number": 3,
            "speaker_id": "agent-3",
            "speaker_name": "Petra",
            "content": "I'm on the fence. I've been using free apps for years and they work fine for my casual learning. But if premium had specialized vocabulary for my veterinary work, like medical terms in Spanish, I might consider it.",
            "timestamp": "2025-12-11T10:02:00Z",
            "message_type": "dialogue",
        },
        {
            "id": "msg-4",
            "turn_number": 4,
            "speaker_id": "agent-1",
            "speaker_name": "Marta",
            "content": "That's a great point about specialization. Generic lessons only go so far. I spend so much time searching for industry-specific content elsewhere.",
            "timestamp": "2025-12-11T10:03:00Z",
            "message_type": "dialogue",
        },
        {
            "id": "msg-5",
            "turn_number": 5,
            "speaker_id": "agent-2",
            "speaker_name": "Jason",
            "content": "Exactly! What would make me recommend premium to my friends is if it felt more personalized. Like, knowing I'm learning Japanese for travel and suggesting relevant phrases, not just textbook stuff.",
            "timestamp": "2025-12-11T10:04:00Z",
            "message_type": "dialogue",
        },
    ],
    "total_turns": 5,
    "status": "completed",
    "termination_reason": "max_turns",
    "duration_seconds": 45.2,
}


def test_llm_complete():
    """Test that LLM.complete() works with gpt-5."""
    print("\n" + "=" * 60)
    print("TEST 1: LLM.complete() with gpt-5")
    print("=" * 60)

    llm = get_llm_client()

    prompt = "Say hello in 3 words."
    print(f"Prompt: {prompt}")

    try:
        response = llm.complete(prompt, model="gpt-5", max_tokens=100)
        print(f"Response: {response}")
        print(f"Response length: {len(response)}")
        print("✅ LLM.complete() works!")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_consensus_builder():
    """Test ConsensusBuilder with mock data."""
    print("\n" + "=" * 60)
    print("TEST 2: ConsensusBuilder.build_consensus()")
    print("=" * 60)

    builder = ConsensusBuilder()

    print(f"Input swarm has {len(MOCK_SWARM_OUTPUT['participants'])} participants")
    print(f"Input swarm has {len(MOCK_SWARM_OUTPUT['messages'])} messages")

    try:
        consensus = builder.build_consensus(MOCK_SWARM_OUTPUT)

        print("\n--- Consensus Result ---")
        print(f"swarm_id: {consensus['swarm_id']}")
        print(f"confidence_score: {consensus['confidence_score']}")
        print(f"consensus_strength: {consensus['consensus_strength']}")
        print(f"key_insights count: {len(consensus['key_insights'])}")
        print(f"actionable_items count: {len(consensus['actionable_items'])}")

        synth = consensus['synthesized_conclusion']
        print(f"\nsynthesized_conclusion length: {len(synth)}")
        print(f"\nFirst 500 chars of synthesized_conclusion:")
        print(synth[:500])

        if len(synth) > 0:
            print("\n✅ Consensus generated successfully!")
            return consensus
        else:
            print("\n❌ synthesized_conclusion is EMPTY!")
            return None

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_full_report_generation():
    """Test just the _generate_full_report method."""
    print("\n" + "=" * 60)
    print("TEST 3: ConsensusBuilder._generate_full_report()")
    print("=" * 60)

    builder = ConsensusBuilder()

    messages = MOCK_SWARM_OUTPUT['messages']
    participants = MOCK_SWARM_OUTPUT['participants']
    topic = MOCK_SWARM_OUTPUT['topic']

    print(f"Topic: {topic}")
    print(f"Participants: {[p['agent_name'] for p in participants]}")
    print(f"Messages: {len(messages)}")

    try:
        report = builder._generate_full_report(topic, messages, participants)

        print(f"\nReport length: {len(report)}")
        print(f"\nFull report:")
        print("-" * 40)
        print(report)
        print("-" * 40)

        if len(report) > 0 and "Unable to generate" not in report:
            print("\n✅ Report generated successfully!")
            return True
        else:
            print("\n❌ Report generation failed!")
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_endpoint_via_http():
    """Test the actual HTTP endpoint."""
    print("\n" + "=" * 60)
    print("TEST 4: HTTP Endpoint /api/swarm/consensus/{swarm_id}")
    print("=" * 60)

    import requests

    # Use an existing swarm_id from the database
    swarm_id = "169b9f63-a97c-46ef-b0e4-a887871407cf"

    url = f"http://localhost:8000/api/swarm/consensus/{swarm_id}"
    print(f"GET {url}")

    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            synth = data.get('synthesized_conclusion', '')
            print(f"synthesized_conclusion length: {len(synth)}")
            print(f"First 200 chars: {synth[:200]}")

            if len(synth) > 0:
                print("\n✅ Endpoint works!")
            else:
                print("\n❌ Endpoint returns empty synthesized_conclusion")
        else:
            print(f"Response: {response.text}")
            print("\n❌ Endpoint returned error")

    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server (is it running?)")
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("CONSENSUS ENDPOINT TEST SUITE")
    print("=" * 60)

    # Run tests
    test_llm_complete()
    test_full_report_generation()
    test_consensus_builder()

    # Optionally test HTTP endpoint
    print("\nTest HTTP endpoint? (requires server running)")
    # test_endpoint_via_http()
