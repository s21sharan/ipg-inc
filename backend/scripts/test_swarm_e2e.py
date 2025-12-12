#!/usr/bin/env python3
"""
End-to-end test for swarm conversation with real agents.
Tests the full flow: create swarm -> agents discuss -> generate consensus -> evaluate quality.
"""

import os
import sys
import time
import json

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from openai import OpenAI

from app.services.swarm_service import SwarmService


def get_random_interviews(db, limit: int = 5):
    """Get random interviews that have reflection_memory."""
    result = (
        db.table("interviews")
        .select("id, name")
        .not_.is_("reflection_memory", "null")
        .limit(limit)
        .execute()
    )
    return result.data or []


def evaluate_response_quality(question: str, consensus: dict) -> dict:
    """Use GPT-4 to evaluate the quality of the swarm response."""
    client = OpenAI()

    # Format consensus for evaluation
    response_text = f"""
Synthesized Conclusion: {consensus.get('synthesized_conclusion', 'N/A')}

Key Insights:
{json.dumps(consensus.get('key_insights', []), indent=2)}

Areas of Agreement:
{json.dumps(consensus.get('areas_of_agreement', []), indent=2)}

Areas of Disagreement:
{json.dumps(consensus.get('areas_of_disagreement', []), indent=2)}

Actionable Items:
{json.dumps(consensus.get('actionable_items', []), indent=2)}

Confidence Score: {consensus.get('confidence_score', 'N/A')}
Consensus Strength: {consensus.get('consensus_strength', 'N/A')}
"""

    eval_prompt = f"""You are evaluating the quality of a multi-agent discussion response.

QUESTION ASKED: "{question}"

RESPONSE FROM AGENT SWARM:
{response_text}

Please evaluate this response on the following criteria (1-10 scale):

1. **Relevance**: Does the response directly address the question asked?
2. **Depth**: Does it provide meaningful insights rather than surface-level answers?
3. **Actionability**: Are the conclusions and recommendations practical?
4. **Coherence**: Is the response well-organized and internally consistent?
5. **Evidence-based**: Does it seem grounded in actual user perspectives?

Provide your evaluation in this JSON format:
{{
    "relevance_score": <1-10>,
    "depth_score": <1-10>,
    "actionability_score": <1-10>,
    "coherence_score": <1-10>,
    "evidence_score": <1-10>,
    "overall_score": <1-10>,
    "summary": "<2-3 sentence evaluation>",
    "strengths": ["<strength 1>", "<strength 2>"],
    "improvements": ["<improvement 1>", "<improvement 2>"]
}}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": eval_prompt}],
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


def main():
    print("=" * 60)
    print("SWARM END-TO-END TEST")
    print("=" * 60)

    # Setup
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        print("ERROR: Missing Supabase credentials")
        print("Set SUPABASE_URL and SUPABASE_KEY (or NEXT_PUBLIC_* variants)")
        sys.exit(1)

    db = create_client(supabase_url, supabase_key)
    service = SwarmService(db)

    # Get 5 random agents
    print("\n1. Fetching 5 random agents with reflection memory...")
    interviews = get_random_interviews(db, limit=5)

    if len(interviews) < 2:
        print(f"ERROR: Only found {len(interviews)} interviews. Need at least 2.")
        sys.exit(1)

    print(f"   Found {len(interviews)} agents:")
    for i, interview in enumerate(interviews, 1):
        print(f"   {i}. {interview['name']} ({interview['id'][:8]}...)")

    # Create swarm
    question = "If perceived value increased, would these users upgrade to premium?"
    print(f"\n2. Creating swarm with question:")
    print(f"   '{question}'")

    agent_ids = [i["id"] for i in interviews]

    try:
        result = service.create_swarm(
            topic=question,
            agent_ids=agent_ids,
            config={
                "max_turns": 15,
                "speaker_selection": "dynamic",
            }
        )
        swarm_id = result["swarm_id"]
        print(f"   Swarm created: {swarm_id}")
    except Exception as e:
        print(f"ERROR creating swarm: {e}")
        sys.exit(1)

    # Poll for completion
    print("\n3. Waiting for swarm to complete...")
    max_wait = 300  # 5 minutes
    poll_interval = 10
    elapsed = 0

    while elapsed < max_wait:
        status = service.get_swarm_status(swarm_id)
        if not status:
            print("   ERROR: Swarm not found")
            sys.exit(1)

        print(f"   [{elapsed}s] Status: {status['status']}, Messages: {status['message_count']}")

        if status["status"] == "completed":
            print("   Swarm completed!")
            break
        elif status["status"] in ("error", "terminated"):
            print(f"   ERROR: Swarm ended with status: {status['status']}")
            sys.exit(1)

        time.sleep(poll_interval)
        elapsed += poll_interval

    if elapsed >= max_wait:
        print("   TIMEOUT: Swarm did not complete in time")
        sys.exit(1)

    # Get messages
    print("\n4. Fetching conversation messages...")
    messages = service.get_messages(swarm_id, limit=100)
    print(f"   Retrieved {len(messages)} messages")

    print("\n   --- CONVERSATION ---")
    for msg in messages[:10]:  # Show first 10
        print(f"   [{msg['turn_number']}] {msg['speaker_name']}: {msg['content'][:100]}...")
    if len(messages) > 10:
        print(f"   ... and {len(messages) - 10} more messages")
    print("   --- END CONVERSATION ---")

    # Get consensus
    print("\n5. Fetching consensus summary...")
    consensus = service.get_consensus(swarm_id)

    if not consensus:
        print("   WARNING: No consensus generated (may have failed quality check)")
        print("   Skipping evaluation...")
        sys.exit(0)

    print("\n   --- CONSENSUS SUMMARY ---")
    print(f"   Conclusion: {consensus.get('synthesized_conclusion', 'N/A')[:200]}...")
    print(f"   Key Insights: {len(consensus.get('key_insights', []))} items")
    print(f"   Confidence: {consensus.get('confidence_score', 'N/A')}")
    print(f"   Strength: {consensus.get('consensus_strength', 'N/A')}")
    print("   --- END SUMMARY ---")

    # Evaluate with GPT
    print("\n6. Evaluating response quality with GPT-4...")
    try:
        evaluation = evaluate_response_quality(question, consensus)

        print("\n   --- GPT EVALUATION ---")
        print(f"   Overall Score: {evaluation.get('overall_score', 'N/A')}/10")
        print(f"   Relevance: {evaluation.get('relevance_score', 'N/A')}/10")
        print(f"   Depth: {evaluation.get('depth_score', 'N/A')}/10")
        print(f"   Actionability: {evaluation.get('actionability_score', 'N/A')}/10")
        print(f"   Coherence: {evaluation.get('coherence_score', 'N/A')}/10")
        print(f"   Evidence-based: {evaluation.get('evidence_score', 'N/A')}/10")
        print(f"\n   Summary: {evaluation.get('summary', 'N/A')}")
        print(f"\n   Strengths: {evaluation.get('strengths', [])}")
        print(f"   Improvements: {evaluation.get('improvements', [])}")
        print("   --- END EVALUATION ---")

        # Pass/Fail
        overall = evaluation.get('overall_score', 0)
        if overall >= 7:
            print(f"\n✅ TEST PASSED (Score: {overall}/10)")
        elif overall >= 5:
            print(f"\n⚠️  TEST MARGINAL (Score: {overall}/10)")
        else:
            print(f"\n❌ TEST FAILED (Score: {overall}/10)")

    except Exception as e:
        print(f"   ERROR during evaluation: {e}")

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
