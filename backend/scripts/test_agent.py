#!/usr/bin/env python3
"""
Test script for the Generative Agent Orchestrator.

Fetches a real interview from Supabase and runs an interactive
conversation using the LangGraph cognitive loop.

Usage:
    cd backend
    python scripts/test_agent.py

    # Or with a specific interview:
    python scripts/test_agent.py --interview-id <uuid>

    # Interactive mode (ask your own questions):
    python scripts/test_agent.py --interactive
"""

import sys
import os
import argparse
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
env_path = Path(__file__).parent.parent.parent / ".env.local"
load_dotenv(env_path)

from app.orchestration import AgentOrchestrator, WorkflowInput


# Duolingo Demo workspace UUID
DUOLINGO_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001"


def get_supabase_client():
    """Create Supabase client from env vars."""
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not url or not key:
        print("Error: Missing Supabase credentials in .env.local")
        print("Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    return create_client(url, key)


def fetch_interview(db, interview_id: str = None) -> dict:
    """Fetch an interview from Supabase."""
    if interview_id:
        result = db.table("interviews").select("*").eq("id", interview_id).single().execute()
    else:
        # Get a random interview from Duolingo Demo workspace
        result = db.table("interviews").select("*").eq(
            "workspace_id", DUOLINGO_WORKSPACE_ID
        ).limit(1).execute()

        if result.data:
            result.data = result.data[0]

    if not result.data:
        print("Error: No interview found")
        sys.exit(1)

    return result.data


def create_test_campaign() -> dict:
    """Create a simple test campaign for the conversation."""
    return {
        "id": "test-campaign",
        "title": "Product Feedback Interview",
        "caption": "Understanding user experiences and pain points",
        "topics": [
            {
                "id": "1",
                "type": "statement",
                "name": "Welcome",
                "content": "Hi! Thanks for taking the time to chat with me today. I'd love to hear about your experiences.",
            },
            {
                "id": "2",
                "type": "question",
                "name": "Experience",
                "question": "Can you tell me about your experience using the app? What's a typical session like for you?",
                "probeQuestions": "What features do you use most often?\nHow long have you been using it?",
            },
            {
                "id": "3",
                "type": "question",
                "name": "Pain Points",
                "question": "What frustrates you the most about the app?",
                "probeQuestions": "Can you give me a specific example?\nHow does that make you feel?",
            },
            {
                "id": "4",
                "type": "question",
                "name": "Improvements",
                "question": "If you could change one thing about the app, what would it be?",
                "probeQuestions": "Why is that important to you?",
            },
            {
                "id": "5",
                "type": "statement",
                "name": "Closing",
                "content": "Thank you so much for sharing your thoughts! This has been really helpful.",
            },
        ],
    }


def print_separator():
    """Print a visual separator."""
    print("\n" + "=" * 60 + "\n")


def print_interview_info(interview: dict):
    """Print interview details."""
    print("📋 INTERVIEW DATA")
    print(f"   Name: {interview.get('name', 'Unknown')}")
    print(f"   Summary: {interview.get('summary', 'N/A')[:100]}...")

    # Demographics
    demographics = []
    if interview.get("age"):
        demographics.append(f"{interview['age']} years old")
    if interview.get("occupation"):
        demographics.append(interview["occupation"])
    if interview.get("country"):
        demographics.append(interview["country"])
    if demographics:
        print(f"   Demographics: {', '.join(demographics)}")

    # Personality
    if interview.get("personality"):
        p = interview["personality"]
        # Handle nested structure: personality.scores.trait
        scores = p.get("scores", p)  # Fallback to p if no scores key
        print(f"   Personality (OCEAN):")
        # Get extraversion (handle both spellings)
        extraversion_val = scores.get("extraversion") or scores.get("extroversion")
        traits = [
            ("Openness", scores.get("openness")),
            ("Conscientiousness", scores.get("conscientiousness")),
            ("Extraversion", extraversion_val),
            ("Agreeableness", scores.get("agreeableness")),
            ("Neuroticism", scores.get("neuroticism")),
        ]
        for name, val in traits:
            if val is not None and isinstance(val, (int, float)):
                print(f"      {name}: {val:.1f}")
            else:
                print(f"      {name}: N/A")


def print_conversation(transcript: list[dict]):
    """Print the conversation transcript."""
    print("💬 CONVERSATION TRANSCRIPT")
    print()

    for i, exchange in enumerate(transcript, 1):
        question = exchange.get("question", "")
        answer = exchange.get("answer", "")

        print(f"🎤 Interviewer: {question}")
        print(f"👤 {answer}")
        print()


def run_campaign_simulation(interview: dict, campaign: dict):
    """Run a full campaign simulation."""
    print("\n🚀 Starting Agent Simulation...")
    print(f"   Using model: gpt-5-nano")
    print(f"   Max iterations: 20")
    print()

    # Create workflow input
    workflow_input: WorkflowInput = {
        "agent_id": interview["id"],
        "agent_name": interview.get("name", "User"),
        "interview_data": {
            "transcript": interview.get("transcript", []),
            "personality": interview.get("personality", {}),
            "reflection_memory": interview.get("reflection_memory", {}),
        },
        "campaign": campaign,
        "initial_observation": campaign["topics"][0].get("content", "Hello!"),
    }

    # Initialize orchestrator
    orchestrator = AgentOrchestrator(
        reflection_threshold=100.0,  # High threshold to avoid reflection during short test
        max_iterations=20,
    )

    # Track responses for display
    responses = []

    def on_response(question: str, response: str, turn: int):
        """Callback for each response."""
        responses.append({"question": question, "answer": response})
        print(f"\n[Turn {turn + 1}]")
        print(f"🎤 Interviewer: {question}")
        print(f"👤 Agent: {response}")

    # Run simulation
    try:
        output = orchestrator.run_campaign_simulation(workflow_input, on_response=on_response)

        print_separator()
        print("✅ SIMULATION COMPLETE")
        print(f"   Total turns: {len(output['conversation_transcript'])}")
        print(f"   New memories created: {len(output['new_memories'])}")
        print(f"   Reflections generated: {len(output['new_reflections'])}")
        print(f"   Final emotion: {output['final_emotional_state']['primary_emotion']}")

        return output

    except Exception as e:
        print(f"\n❌ Error during simulation: {e}")
        raise


def run_interactive_mode(interview: dict):
    """Run interactive mode where you can ask your own questions."""
    print("\n🎮 INTERACTIVE MODE")
    print("   Type your questions and the agent will respond.")
    print("   Type 'quit' or 'exit' to end the conversation.")
    print("   Type 'status' to see agent's emotional state.")
    print()

    # Create workflow input with minimal campaign
    workflow_input: WorkflowInput = {
        "agent_id": interview["id"],
        "agent_name": interview.get("name", "User"),
        "interview_data": {
            "transcript": interview.get("transcript", []),
            "personality": interview.get("personality", {}),
            "reflection_memory": interview.get("reflection_memory", {}),
        },
        "campaign": {"topics": []},
        "initial_observation": "Hello! I'm ready to chat.",
    }

    # Initialize orchestrator
    orchestrator = AgentOrchestrator(
        reflection_threshold=100.0,
        max_iterations=50,
    )

    # Initialize state
    state = orchestrator.initialize_state(workflow_input)

    print(f"👤 Agent ({interview.get('name', 'User')}): Hello! I'm ready to chat.\n")

    turn = 0
    while True:
        try:
            # Get user input
            user_input = input("🎤 You: ").strip()

            if not user_input:
                continue

            if user_input.lower() in ("quit", "exit", "q"):
                print("\n👋 Ending conversation. Goodbye!")
                break

            if user_input.lower() == "status":
                e = state["emotional_state"]
                print(f"\n📊 Agent Status:")
                print(f"   Emotion: {e['primary_emotion']} (intensity: {e['intensity']:.2f})")
                print(f"   Valence: {e['valence']:.2f}, Arousal: {e['arousal']:.2f}")
                print(f"   Narrative: {e['narrative']}")
                print(f"   Memories: {len(state['memory_stream'])}")
                print(f"   Turns: {state['iteration_count']}")
                print()
                continue

            # Run single turn
            state, response = orchestrator.run_single_turn(state, user_input)
            turn += 1

            print(f"👤 Agent: {response}\n")

        except KeyboardInterrupt:
            print("\n\n👋 Interrupted. Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            continue

    # Print final summary
    print_separator()
    print("📊 CONVERSATION SUMMARY")
    print(f"   Total turns: {turn}")
    print(f"   Memories created: {len(state['memory_stream'])}")
    print(f"   Final emotion: {state['emotional_state']['primary_emotion']}")


def main():
    parser = argparse.ArgumentParser(description="Test the Generative Agent Orchestrator")
    parser.add_argument("--interview-id", "-i", help="Specific interview UUID to use")
    parser.add_argument("--interactive", "-I", action="store_true", help="Run in interactive mode")
    parser.add_argument("--list", "-l", action="store_true", help="List available interviews")
    args = parser.parse_args()

    print("=" * 60)
    print("🤖 GENERATIVE AGENT TEST SCRIPT")
    print("=" * 60)

    # Connect to Supabase
    print("\n📡 Connecting to Supabase...")
    db = get_supabase_client()
    print("   Connected!")

    # List interviews if requested
    if args.list:
        print("\n📋 Available Interviews (Duolingo Demo):")
        result = db.table("interviews").select("id, name, summary").eq(
            "workspace_id", DUOLINGO_WORKSPACE_ID
        ).limit(10).execute()

        for i, interview in enumerate(result.data or [], 1):
            print(f"   {i}. {interview['name']}: {interview.get('summary', 'N/A')[:50]}...")
            print(f"      ID: {interview['id']}")
        return

    # Fetch interview
    print("\n📥 Fetching interview data...")
    interview = fetch_interview(db, args.interview_id)
    print(f"   Found: {interview.get('name', 'Unknown')}")

    print_separator()
    print_interview_info(interview)
    print_separator()

    if args.interactive:
        run_interactive_mode(interview)
    else:
        # Run campaign simulation
        campaign = create_test_campaign()
        run_campaign_simulation(interview, campaign)


if __name__ == "__main__":
    main()
