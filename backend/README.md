# IPG Interview Agent Backend

FastAPI backend for AI-moderated market research interviews using OpenAI's Conversations API with gpt-5-nano.

## Setup

### 1. Create Virtual Environment & Install Dependencies

To avoid conflicts with other Python packages, use a virtual environment:

```bash
cd backend
./setup.sh
```

Or manually:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the `backend/` directory with the following:

```bash
# backend/.env
OPENAI_API_KEY=your_openai_api_key_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_anon_key_here
```

Or if you already have a `.env` file in the root directory, the backend will use those same credentials.

Required environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon/public key

### 3. Run the Server

Make sure the virtual environment is activated:

```bash
source venv/bin/activate  # If not already activated
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

## API Documentation

Once running, visit `http://localhost:8000/docs` for interactive API documentation.

## Endpoints

### GET `/campaigns?user_id={user_id}`
Fetch all campaigns for a user from Supabase.

**Response:**
```json
{
  "campaigns": [
    {
      "id": "uuid",
      "name": "campaign-name",
      "title": "Campaign Title",
      "topics": [...]
    }
  ]
}
```

### POST `/interview/start`
Start a new interview session for a selected campaign.

**Request:**
```json
{
  "campaign_id": "uuid",
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "session_id": "user_campaign_conversation",
  "campaign_name": "Campaign Title",
  "current_topic": "Kickoff",
  "message": "Welcome! Let's begin..."
}
```

### POST `/interview/message`
Send a message and get AI response based on discussion guide.

**Request:**
```json
{
  "session_id": "session_id_from_start",
  "message": "User's response text"
}
```

**Response:**
```json
{
  "session_id": "session_id",
  "message": "AI's next question or response",
  "current_topic": "Topic Name",
  "is_complete": false,
  "topic_number": 2,
  "total_topics": 5
}
```

### GET `/interview/session/{session_id}`
Get current session state and progress.

## How It Works

1. **Campaign Selection**: User selects a campaign from Supabase
2. **Session Creation**: Backend creates OpenAI Conversation and initializes state
3. **Conversation Flow**:
   - System prompt sets context about the campaign and research goals
   - AI follows the discussion guide (topics with different types: statement, conversation, question)
   - For **conversation** topics: AI uses persona and research goals to guide natural dialogue
   - For **question** topics: AI asks the main question and uses probe questions for follow-ups
   - For **statement** topics: Static messages like Kickoff and Signoff
4. **Topic Progression**: Automatically advances through topics based on response count
5. **Completion**: Returns completion message when all topics are covered

## Architecture

- **FastAPI**: High-performance async web framework
- **OpenAI Conversations API**: Maintains conversation state and context
- **Supabase**: Campaign and user data storage
- **In-memory state**: Session tracking (replace with Redis for production)

## Production Considerations

- Replace in-memory `conversations` dict with Redis or database
- Add authentication middleware
- Implement rate limiting
- Add conversation persistence to Supabase
- Set up proper logging and monitoring
- Configure production CORS origins
- Add webhook for conversation completion to save transcripts
