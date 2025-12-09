#!/usr/bin/env python3
"""
Interactive test script for persistent memory functionality.

Demonstrates the full flow:
1. Start a conversation with an agent (persistent=True)
2. Ask questions, watch memories being persisted
3. End session, inspect databases
4. Start new session with same agent
5. Ask related questions to verify memory retrieval

Usage:
    cd backend
    python scripts/test_persistent_memory.py

    # Use a specific interview:
    python scripts/test_persistent_memory.py --interview-id <uuid>

    # Run both sessions automatically (non-interactive):
    python scripts/test_persistent_memory.py --auto
"""

import sys
import os
import argparse
import time
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
env_path = Path(__file__).parent.parent.parent / ".env.local"
load_dotenv(env_path)

from app.orchestration import AgentOrchestrator, WorkflowInput
from app.orchestration.persistent_memory import PersistentMemoryStore
from app.memgraph import execute_query
from app.qdrant import get_qdrant_connection


# Duolingo Demo workspace UUID
DUOLINGO_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001"


def print_separator(title: str = ""):
    """Print a visual separator."""
    print("\n" + "=" * 60)
    if title:
        print(f"  {title}")
        print("=" * 60)
    print()


def get_supabase_client():
    """Create Supabase client from env vars."""
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not url or not key:
        print("Error: Missing Supabase credentials in .env.local")
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


def check_services() -> bool:
    """Check if Qdrant and Memgraph are available."""
    print("Checking services...")

    # Check Qdrant
    try:
        qdrant_conn = get_qdrant_connection()
        if qdrant_conn.verify_connectivity():
            print("  ✓ Qdrant: Connected")
        else:
            print("  ✗ Qdrant: Not connected")
            return False
    except Exception as e:
        print(f"  ✗ Qdrant: Error - {e}")
        return False

    # Check Memgraph
    try:
        from app.memgraph import get_memgraph_connection
        memgraph_conn = get_memgraph_connection()
        if memgraph_conn.verify_connectivity():
            print("  ✓ Memgraph: Connected")
        else:
            print("  ✗ Memgraph: Not connected")
            return False
    except Exception as e:
        print(f"  ✗ Memgraph: Error - {e}")
        return False

    return True


def inspect_databases(agent_id: str):
    """Inspect Qdrant and Memgraph for agent data."""
    print_separator("DATABASE INSPECTION")

    store = PersistentMemoryStore(agent_id)

    # Qdrant inspection
    print("📊 QDRANT (Vector Storage):")
    qdrant_count = store.count_memories()
    print(f"   Total memories: {qdrant_count}")

    memories = store.load_memories(limit=10)
    print(f"   Latest memories loaded: {len(memories)}")

    if memories:
        print("\n   Recent memories:")
        for i, m in enumerate(memories[-5:], 1):
            content = m.get("content", "")[:60]
            mtype = m.get("memory_type", "unknown")
            print(f"   {i}. [{mtype}] {content}...")

    # Memgraph inspection
    print("\n🔗 MEMGRAPH (Graph Relationships):")

    try:
        # Count memories for this agent
        query = """
        MATCH (a:Agent {id: $agent_id})-[:REMEMBERS]->(m:Memory)
        RETURN count(m) AS memory_count,
               collect(DISTINCT m.memory_type) AS types
        """
        result = execute_query(query, {"agent_id": agent_id})

        if result:
            print(f"   Memory nodes: {result[0]['memory_count']}")
            print(f"   Memory types: {result[0]['types']}")

        # Check for DERIVED_FROM relationships (reflections)
        derived_query = """
        MATCH (r:Memory)-[:DERIVED_FROM]->(s:Memory)
        WHERE r.memory_type = 'reflection'
        RETURN count(r) AS reflection_count
        """
        derived_result = execute_query(derived_query)
        if derived_result:
            print(f"   Reflections with sources: {derived_result[0]['reflection_count']}")

    except Exception as e:
        print(f"   Error querying Memgraph: {e}")


def run_session(
    interview: dict,
    questions: list[str],
    session_name: str = "Session",
) -> tuple[str, list[str]]:
    """
    Run a conversation session with the agent.

    Returns:
        Tuple of (session_id, list of responses)
    """
    print_separator(f"{session_name}: Starting")

    # Create orchestrator with persistence enabled
    orchestrator = AgentOrchestrator(
        reflection_threshold=100.0,
        max_iterations=20,
        persistent=True,
    )

    # Create workflow input
    workflow_input: WorkflowInput = {
        "agent_id": interview["id"],
        "agent_name": interview.get("name", "User"),
        "interview_data": {
            "transcript": interview.get("transcript", []),
            "personality": interview.get("personality", {}),
            "reflection_memory": interview.get("reflection_memory", {}),
        },
        "campaign": {"topics": []},
        "initial_observation": "Hello! Let's continue our conversation.",
    }

    # Initialize state (loads memories if persistent)
    state = orchestrator.initialize_state(workflow_input)

    session_id = orchestrator.get_session_id()
    print(f"Session ID: {session_id}")

    # Get memory stats
    stats = orchestrator.get_memory_stats()
    print(f"Loaded memories: {stats['total_memories']}")
    print(f"Memory types: {stats['by_type']}")

    # Run conversation
    responses = []
    print(f"\n--- Conversation with {interview.get('name', 'Agent')} ---\n")

    for i, question in enumerate(questions, 1):
        print(f"🎤 You: {question}")

        state, response = orchestrator.run_single_turn(state, question)
        responses.append(response)

        print(f"👤 Agent: {response}\n")

    # Finalize session
    saved = orchestrator.finalize_session()
    print(f"\n✅ Session complete. Persisted {saved} new memories.")

    return session_id, responses


def run_interactive_session(interview: dict):
    """Run an interactive conversation session."""
    print_separator("INTERACTIVE MODE")
    print("Type your questions. Commands:")
    print("  'quit' or 'exit' - End session")
    print("  'status' - Show memory stats")
    print("  'inspect' - Inspect databases")
    print()

    orchestrator = AgentOrchestrator(
        reflection_threshold=100.0,
        max_iterations=50,
        persistent=True,
    )

    workflow_input: WorkflowInput = {
        "agent_id": interview["id"],
        "agent_name": interview.get("name", "User"),
        "interview_data": {
            "transcript": interview.get("transcript", []),
            "personality": interview.get("personality", {}),
            "reflection_memory": interview.get("reflection_memory", {}),
        },
        "campaign": {"topics": []},
        "initial_observation": "Hello! Ready to chat.",
    }

    state = orchestrator.initialize_state(workflow_input)

    print(f"Session ID: {orchestrator.get_session_id()}")
    stats = orchestrator.get_memory_stats()
    print(f"Loaded {stats['total_memories']} memories\n")

    while True:
        try:
            user_input = input("🎤 You: ").strip()

            if not user_input:
                continue

            if user_input.lower() in ("quit", "exit", "q"):
                break

            if user_input.lower() == "status":
                stats = orchestrator.get_memory_stats()
                print(f"\n📊 Memory Stats:")
                print(f"   Total: {stats['total_memories']}")
                print(f"   New: {stats['new_memories']}")
                print(f"   Types: {stats['by_type']}\n")
                continue

            if user_input.lower() == "inspect":
                inspect_databases(interview["id"])
                continue

            state, response = orchestrator.run_single_turn(state, user_input)
            print(f"👤 Agent: {response}\n")

        except KeyboardInterrupt:
            print("\n\nInterrupted.")
            break
        except Exception as e:
            print(f"Error: {e}")
            continue

    # Finalize
    saved = orchestrator.finalize_session()
    print(f"\n✅ Session ended. Persisted {saved} memories.")

    # Final inspection
    inspect_databases(interview["id"])


def run_auto_test(interview: dict):
    """Run automated two-session test."""
    print_separator("AUTOMATED PERSISTENT MEMORY TEST")

    # Session 1: Establish facts
    session1_questions = [
        "What's your favorite feature in mobile apps?",
        "If you could change one thing about most apps, what would it be?",
        "Tell me about a memorable user experience you've had recently.",
    ]

    session1_id, responses1 = run_session(
        interview,
        session1_questions,
        "SESSION 1 (Establishing Facts)"
    )

    # Inspect after session 1
    print_separator("After Session 1")
    inspect_databases(interview["id"])

    # Wait a moment
    print("\n⏳ Waiting before session 2...")
    time.sleep(2)

    # Session 2: Test recall
    session2_questions = [
        "Earlier we talked about your favorite app features. What did you mention?",
        "You mentioned something you'd change about apps. Can you elaborate?",
        "Based on our previous discussion, what matters most to you in UX?",
    ]

    session2_id, responses2 = run_session(
        interview,
        session2_questions,
        "SESSION 2 (Testing Memory Recall)"
    )

    # Final inspection
    print_separator("Final Database State")
    inspect_databases(interview["id"])

    # Summary
    print_separator("TEST SUMMARY")
    print(f"Agent: {interview.get('name', 'Unknown')}")
    print(f"Agent ID: {interview['id']}")
    print(f"Session 1 ID: {session1_id}")
    print(f"Session 2 ID: {session2_id}")
    print(f"\nSession 1 Responses: {len(responses1)}")
    print(f"Session 2 Responses: {len(responses2)}")

    print("\n--- Review the responses above to verify memory was used ---")


def main():
    parser = argparse.ArgumentParser(description="Test persistent memory functionality")
    parser.add_argument("--interview-id", "-i", help="Specific interview UUID to use")
    parser.add_argument("--auto", "-a", action="store_true", help="Run automated two-session test")
    parser.add_argument("--inspect", action="store_true", help="Just inspect databases for an agent")
    args = parser.parse_args()

    print_separator("PERSISTENT MEMORY TEST")

    # Check services
    if not check_services():
        print("\n❌ Required services not available.")
        print("Run: docker-compose up -d qdrant memgraph")
        sys.exit(1)

    # Connect to Supabase
    print("\n📡 Connecting to Supabase...")
    db = get_supabase_client()
    print("   Connected!")

    # Fetch interview
    print("\n📥 Fetching interview data...")
    interview = fetch_interview(db, args.interview_id)
    print(f"   Using: {interview.get('name', 'Unknown')}")
    print(f"   ID: {interview['id']}")

    if args.inspect:
        # Just inspect databases
        inspect_databases(interview["id"])
    elif args.auto:
        # Run automated test
        run_auto_test(interview)
    else:
        # Run interactive session
        run_interactive_session(interview)


if __name__ == "__main__":
    main()
