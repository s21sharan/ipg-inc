from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from pathlib import Path
from dotenv import load_dotenv
import requests
from supabase import create_client, Client

# Load environment variables from multiple possible locations
load_dotenv()  # Load from backend/.env if exists
load_dotenv(Path(__file__).parent.parent / '.env')  # Check root .env
load_dotenv(Path(__file__).parent.parent / '.env.local')  # Check root .env.local (Next.js convention)

app = FastAPI(title="IPG Interview Agent API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get environment variables (support both NEXT_PUBLIC_ prefix and without)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
# Try service role key first (for backend), fallback to anon key
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or
    os.getenv("SUPABASE_KEY") or
    os.getenv("SUPABASE_ANON_KEY") or
    os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is required")
if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable is required")
if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is required")

print(f"Using Supabase URL: {SUPABASE_URL}")
print(f"Using key type: {'SERVICE_ROLE' if os.getenv('SUPABASE_SERVICE_ROLE_KEY') else 'ANON'}")

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# In-memory storage for conversation states (use Redis in production)
conversations: Dict[str, Dict[str, Any]] = {}


class StartInterviewRequest(BaseModel):
    campaign_id: str
    user_id: str


class SendMessageRequest(BaseModel):
    session_id: str
    message: str


class InterviewSession(BaseModel):
    session_id: str
    campaign_name: str
    current_topic: str
    message: str


@app.get("/")
async def root():
    return {"message": "IPG Interview Agent API", "status": "running"}


@app.get("/campaigns")
async def get_campaigns(user_id: str):
    """Fetch all campaigns for a user from Supabase"""
    try:
        # First try with user_id filter
        response = supabase.table("campaigns").select("*").eq("user_id", user_id).execute()

        # If no campaigns found, try without filter (campaigns might not have user_id column)
        if not response.data or len(response.data) == 0:
            print(f"No campaigns found for user {user_id}, trying without filter...")
            response = supabase.table("campaigns").select("*").execute()

        print(f"Found {len(response.data) if response.data else 0} campaigns")
        return {"campaigns": response.data}
    except Exception as e:
        print(f"Error fetching campaigns: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch campaigns: {str(e)}")


@app.post("/interview/start")
async def start_interview(request: StartInterviewRequest) -> InterviewSession:
    """Start a new interview session for a selected campaign"""
    try:
        print(f"Starting interview for campaign: {request.campaign_id}, user: {request.user_id}")

        # Fetch campaign details from Supabase
        campaign_response = supabase.table("campaigns").select("*").eq("id", request.campaign_id).execute()

        if not campaign_response.data or len(campaign_response.data) == 0:
            raise HTTPException(status_code=404, detail=f"Campaign not found: {request.campaign_id}")

        campaign = campaign_response.data[0]
        print(f"Campaign found: {campaign.get('title')}")

        # Parse topics (stored as JSON in Supabase)
        topics = campaign.get("topics", [])
        if not topics:
            raise HTTPException(status_code=400, detail="Campaign has no topics configured")

        print(f"Campaign has {len(topics)} topics")

        # Create a new conversation using Conversations API
        print("Creating OpenAI conversation...")
        try:
            conv_response = requests.post(
                "https://api.openai.com/v1/conversations",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}"
                },
                json={
                    "metadata": {
                        "campaign_id": request.campaign_id,
                        "user_id": request.user_id,
                        "campaign_title": campaign.get('title', '')
                    }
                }
            )
            conv_response.raise_for_status()
            conversation = conv_response.json()
            conversation_id = conversation["id"]
            print(f"Conversation created: {conversation_id}")
        except Exception as e:
            print(f"OpenAI Conversations API Error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")

        session_id = f"{request.user_id}_{request.campaign_id}_{conversation_id}"

        # Store conversation state
        conversations[session_id] = {
            "conversation_id": conversation_id,
            "campaign_id": request.campaign_id,
            "user_id": request.user_id,
            "campaign": campaign,
            "topics": topics,
            "current_topic_index": 0,
            "responses": []
        }

        # Get first topic (should be Kickoff statement)
        first_topic = topics[0]
        first_message = first_topic.get("content", "Welcome! Let's begin our conversation.")

        return InterviewSession(
            session_id=session_id,
            campaign_name=campaign.get("title", "Interview"),
            current_topic=first_topic.get("name", "Kickoff"),
            message=first_message
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in start_interview: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to start interview: {str(e)}")


@app.post("/interview/message")
async def send_message(request: SendMessageRequest) -> Dict[str, Any]:
    """Send a message and get AI response based on discussion guide"""
    try:
        # Get conversation state
        if request.session_id not in conversations:
            raise HTTPException(status_code=404, detail="Session not found")

        session = conversations[request.session_id]
        conversation_id = session["conversation_id"]
        topics = session["topics"]
        current_index = session["current_topic_index"]
        campaign = session["campaign"]

        # Store user response
        session["responses"].append({
            "topic_index": current_index,
            "user_message": request.message
        })

        # Get current topic
        current_topic = topics[current_index] if current_index < len(topics) else None

        if not current_topic:
            # Interview complete
            completion_message = campaign.get("completion_logic", {}).get("completionMessage", "Thank you for completing this interview!")
            return {
                "session_id": request.session_id,
                "message": completion_message,
                "current_topic": "Complete",
                "is_complete": True
            }

        # Build context based on topic type
        topic_type = current_topic.get("type", "question")
        topic_name = current_topic.get("name", "Topic")

        # Build system instruction based on topic type
        system_instruction = f"""You are an AI interview moderator for ipg.inc conducting market research.

Campaign: {campaign.get('title', 'Research Interview')}
Current Topic: {topic_name}

CRITICAL RULES:
- NEVER repeat questions that have already been answered in the conversation
- Build on previous responses - reference what they've already told you
- Ask ONE simple, conversational question at a time
- Dig deeper into motivations, feelings, and thought processes ("why" behind their answers)
- Be empathetic and curious like a friend having a chat
- Keep responses SHORT (1-2 sentences max, just ask your question)

"""

        if topic_type == "conversation":
            goals = current_topic.get("goals", "")
            persona = current_topic.get("persona", "Jordan – The Empathetic Listener")
            system_instruction += f"""Persona: {persona}
Research Goals:
{goals}

Continue the conversation naturally. Ask follow-up questions that:
- Explore WHY they feel/think that way
- Uncover motivations and pain points
- Get at the emotional/psychological aspects
- Are simple and conversational (not formal interview questions)

Example good questions:
- "What made you feel that way?"
- "Walk me through what that experience was like"
- "What would make that easier for you?"

Never ask multi-part questions or questions about things they already told you."""

        elif topic_type == "question":
            question = current_topic.get("question", "")
            probe_questions = current_topic.get("probeQuestions", "")

            system_instruction += f"""Main Question: {question}
Probe Questions to explore:
{probe_questions}

If they haven't answered the main question yet, ask it naturally.
If they have answered, pick ONE probe question and ask it conversationally.
Dig into the "why" behind their answers - explore motivations and feelings.

Ask simple, one-part questions. Reference what they've already shared.
Never repeat questions or ask about info you already have."""

        # Add user message to conversation
        try:
            add_user_msg = requests.post(
                f"https://api.openai.com/v1/conversations/{conversation_id}/items",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}"
                },
                json={
                    "items": [
                        {
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": request.message}
                            ]
                        }
                    ]
                }
            )
            add_user_msg.raise_for_status()
        except Exception as e:
            print(f"Error adding user message: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to add message: {str(e)}")

        # Get AI response using Responses API with conversation context
        try:
            # First, get the conversation items to build context
            conv_items_response = requests.get(
                f"https://api.openai.com/v1/conversations/{conversation_id}/items",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}"
                }
            )
            conv_items_response.raise_for_status()
            conv_items = conv_items_response.json().get("data", [])

            print(f"Conversation has {len(conv_items)} items")

            # Build conversation summary for context
            recent_exchanges = []
            for item in conv_items[-6:]:  # Last 3 exchanges (user + assistant)
                if item.get("role") == "user" and item.get("content"):
                    user_text = item["content"][0].get("text", "")
                    recent_exchanges.append(f"User: {user_text}")
                elif item.get("role") == "assistant" and item.get("content"):
                    asst_text = item["content"][0].get("text", "")
                    recent_exchanges.append(f"You: {asst_text}")

            conversation_context = "\n".join(recent_exchanges) if recent_exchanges else "This is the start of the conversation."

            # Build the input with full context
            full_input = f"""{system_instruction}

CONVERSATION SO FAR:
{conversation_context}
User: {request.message}

Your response (remember: short, conversational, ONE question that digs deeper):"""

            # Get AI response using Responses API with store to conversation
            response_payload = {
                "model": "gpt-5-nano",
                "store": True,
                "input": full_input,
                "reasoning": {"effort": "low"},
                "text": {"verbosity": "low"}
            }

            # If this is not the first exchange, include previous response ID
            if "last_response_id" in session:
                response_payload["previous_response_id"] = session["last_response_id"]

            response = requests.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}"
                },
                json=response_payload
            )

            if not response.ok:
                error_detail = response.json() if response.content else {}
                print(f"Responses API error: {response.status_code}")
                print(f"Error detail: {error_detail}")

            response.raise_for_status()
            response_data = response.json()

            # Store response ID for next turn
            session["last_response_id"] = response_data.get("id")

            # Extract assistant message from response
            message_item = next((item for item in response_data.get("output", []) if item.get("type") == "message"), None)
            if message_item and message_item.get("content"):
                assistant_message = message_item["content"][0].get("text", "Could you tell me more about that?")
            else:
                assistant_message = "Could you tell me more about that?"

            # Also add the assistant response to the conversation for persistence
            try:
                requests.post(
                    f"https://api.openai.com/v1/conversations/{conversation_id}/items",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {OPENAI_API_KEY}"
                    },
                    json={
                        "items": [
                            {
                                "type": "message",
                                "role": "assistant",
                                "content": [
                                    {"type": "output_text", "text": assistant_message}
                                ]
                            }
                        ]
                    }
                )
            except:
                pass  # Non-critical if this fails

        except Exception as e:
            print(f"Error getting AI response: {str(e)}")
            import traceback
            traceback.print_exc()
            assistant_message = "I'm sorry, could you tell me more about that?"

        # Check if we should move to next topic (after 2-3 exchanges)
        topic_responses = [r for r in session["responses"] if r["topic_index"] == current_index]

        should_advance = False
        if topic_type == "statement":
            should_advance = True  # Move past statements immediately
        elif len(topic_responses) >= 3:  # After 3 user responses, move to next topic
            should_advance = True

        if should_advance and current_index + 1 < len(topics):
            session["current_topic_index"] += 1
            next_topic = topics[session["current_topic_index"]]

            if next_topic.get("type") == "statement":
                # If next is a statement (like Signoff), return it directly
                assistant_message = next_topic.get("content", "Thank you!")

        return {
            "session_id": request.session_id,
            "message": assistant_message,
            "current_topic": topics[session["current_topic_index"]].get("name", "Topic"),
            "is_complete": False,
            "topic_number": session["current_topic_index"] + 1,
            "total_topics": len(topics)
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in send_message: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process message: {str(e)}")


@app.get("/interview/session/{session_id}")
async def get_session(session_id: str):
    """Get current session state"""
    if session_id not in conversations:
        raise HTTPException(status_code=404, detail="Session not found")

    session = conversations[session_id]
    return {
        "session_id": session_id,
        "campaign_name": session["campaign"].get("title"),
        "current_topic": session["topics"][session["current_topic_index"]].get("name"),
        "topic_number": session["current_topic_index"] + 1,
        "total_topics": len(session["topics"]),
        "response_count": len(session["responses"])
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
