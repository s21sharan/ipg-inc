# IPG Voice Interview Agent 🎙️

A production-ready voice interview agent for conducting AI-moderated market research interviews. Built with Pipecat, Deepgram STT, Cartesia TTS, OpenAI LLMs, and Daily.co for WebRTC.

## Features

- **Real-time Voice Interaction**: Conduct natural, conversational interviews with participants
- **Structured Discussion Guides**: Support for statement, conversation, and question step types
- **Intelligent Probe Selection**: Dynamic follow-up questions based on participant responses
- **Digital Twin Generation**: Create detailed personality profiles from interview transcripts
- **Integration with IPG.inc**: Seamlessly works with your existing Next.js campaign system
- **WebRTC via Daily.co**: High-quality audio/video streaming
- **Comprehensive Logging**: Full transcript capture with timestamps and metadata

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Next.js App    │────▶│  Python Backend  │────▶│    Supabase      │
│  (Interview UI)  │     │  (Voice Agent)   │     │   (Campaigns)    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │
         │                        ├── Deepgram (STT)
         │                        ├── Cartesia (TTS)
         └── Daily.co ───────────▶├── OpenAI (LLM)
             (WebRTC)             └── Pipecat (Orchestration)
```

## Quick Start

### Prerequisites

- Python 3.11+
- Docker and Docker Compose (for containerized deployment)
- API Keys for:
  - OpenAI
  - Deepgram
  - Cartesia
  - Daily.co
  - Supabase

### Installation

1. **Clone and navigate to the voice agent directory:**
```bash
cd ipg-voice-agent
```

2. **Copy the environment template:**
```bash
cp .env.example .env
```

3. **Edit `.env` with your API keys:**
```env
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
CARTESIA_API_KEY=...
DAILY_API_KEY=...
DAILY_DOMAIN=https://yourcompany.daily.co
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
```

4. **Install dependencies (for local development):**
```bash
pip install -r requirements.txt
```

5. **Run the server:**
```bash
# Local development
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Or using Docker
docker-compose up
```

6. **Access the test client:**
```
http://localhost:8001/static/index.html
```

## Integration with Your Next.js App

### 1. Update your CameraView.tsx

Replace the `startInterview` function in `/app/components/interview/CameraView.tsx`:

```typescript
const startInterview = async () => {
  try {
    // Create session with Python backend
    const response = await fetch('http://localhost:8001/api/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaign.id,
        participant_name: participantName,
        participant_email: participantEmail
      })
    });

    const session = await response.json();

    // Join Daily room with the provided token
    // Your existing Daily.co integration code here

    setInterviewStarted(true);
  } catch (error) {
    console.error('Failed to start interview:', error);
  }
};
```

### 2. Create Database Tables

Run these migrations in your Supabase SQL editor:

```sql
-- Create interviews table
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  participant_name TEXT,
  participant_email TEXT,
  status TEXT DEFAULT 'initialized',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  current_topic_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create transcript_entries table
CREATE TABLE IF NOT EXISTS transcript_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  topic_id TEXT,
  audio_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create digital_twin_profiles table
CREATE TABLE IF NOT EXISTS digital_twin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_twin_profiles ENABLE ROW LEVEL SECURITY;
```

## API Documentation

### Create Interview Session
```http
POST /api/sessions/create
Content-Type: application/json

{
  "campaign_id": "uuid",
  "participant_name": "John Doe",
  "participant_email": "john@example.com",
  "enable_recording": false
}

Response:
{
  "session_id": "uuid",
  "room_url": "https://domain.daily.co/room",
  "participant_token": "jwt...",
  "agent_token": "jwt...",
  "expires_at": "2024-01-01T00:00:00Z"
}
```

### Get Session Status
```http
GET /api/sessions/{session_id}/status

Response:
{
  "session_id": "uuid",
  "status": "active",
  "progress": {
    "current_step_index": 2,
    "total_steps": 5,
    "progress_percentage": 40
  },
  "transcript_count": 15,
  "duration_seconds": 180
}
```

### Get Transcript
```http
GET /api/sessions/{session_id}/transcript

Response:
{
  "session_id": "uuid",
  "transcript": [
    {
      "speaker": "agent",
      "text": "Thank you for joining us today...",
      "timestamp": "2024-01-01T00:00:00Z",
      "topic_id": "1"
    }
  ]
}
```

### Generate Digital Twin Profile
```http
POST /api/sessions/{session_id}/profile
Content-Type: application/json

{
  "session_id": "uuid",
  "include_transcript": false
}

Response:
{
  "session_id": "uuid",
  "profile": {
    "persona_name": "The Efficiency-Focused Commuter",
    "core_personality_traits": [...],
    "motivations": {...},
    "frustrations_challenges": [...],
    "quotes": [...],
    "simulated_agent_prompt": "..."
  }
}
```

## Discussion Guide Format

The agent supports three step types:

### 1. Statement Steps
```json
{
  "id": "1",
  "name": "Kickoff",
  "type": "statement",
  "content": "Welcome message to read",
  "maxDuration": "1"
}
```

### 2. Conversation Steps
```json
{
  "id": "2",
  "name": "Daily Habits",
  "type": "conversation",
  "goals": "Understand daily routines\nIdentify pain points",
  "persona": "David - The Curious Friend",
  "maxDuration": "5"
}
```

### 3. Question Steps
```json
{
  "id": "3",
  "name": "Challenges",
  "type": "question",
  "question": "What frustrates you most?",
  "probeDepth": "1-2",
  "probeQuestions": "Can you give an example?\nHow often does this happen?",
  "maxDuration": "3"
}
```

## Deployment

### Docker Deployment

1. **Build the image:**
```bash
docker build -t ipg-voice-agent .
```

2. **Run with Docker Compose:**
```bash
docker-compose up -d
```

### AWS EC2 Deployment

1. **Launch EC2 instance** (t3.medium or larger recommended)

2. **Install Docker:**
```bash
sudo yum update -y  # Amazon Linux
sudo yum install docker -y
sudo service docker start
sudo usermod -a -G docker ec2-user
```

3. **Clone and configure:**
```bash
git clone [your-repo]
cd ipg-voice-agent
cp .env.example .env
# Edit .env with your API keys
```

4. **Run the container:**
```bash
docker-compose up -d
```

5. **Configure security group** to allow:
   - Port 8001 (API)
   - Port 80/443 (if using Nginx)

### Production Considerations

- **SSL/TLS**: Use Nginx as reverse proxy with Let's Encrypt
- **Monitoring**: Integrate with CloudWatch or Datadog
- **Scaling**: Use ECS or Kubernetes for horizontal scaling
- **Backup**: Regular backups of transcript logs
- **Security**: Keep API keys in AWS Secrets Manager

## Development

### Project Structure
```
ipg-voice-agent/
├── app/
│   ├── main.py              # FastAPI server
│   ├── config.py            # Configuration
│   ├── guide_models.py      # Data models
│   ├── guide_engine.py      # Interview flow logic
│   ├── agent.py             # Pipecat orchestration
│   ├── daily_transport.py   # Daily.co WebRTC
│   ├── format_converter.py  # Campaign format conversion
│   ├── profiling.py         # Digital twin generation
│   └── logging_utils.py     # Transcript logging
├── integrations/
│   ├── supabase_client.py   # Supabase integration
│   └── daily_client.py      # Daily.co API client
├── static/
│   ├── index.html           # Test client UI
│   └── client.js            # Test client JavaScript
├── guides/                  # Sample discussion guides
├── logs/                    # Interview transcripts
├── requirements.txt         # Python dependencies
├── Dockerfile              # Container definition
├── docker-compose.yml      # Multi-container setup
└── README.md              # This file
```

### Running Tests
```bash
pytest tests/ -v
pytest --cov=app tests/  # With coverage
```

### Code Quality
```bash
black app/  # Format code
flake8 app/  # Lint code
mypy app/  # Type checking
```

## Troubleshooting

### Common Issues

1. **"Failed to create room" error**
   - Verify Daily.co API key is valid
   - Check Daily.co domain is correct

2. **"No audio from agent"**
   - Ensure Cartesia API key is valid
   - Check audio permissions in browser

3. **"Transcription not working"**
   - Verify Deepgram API key
   - Check microphone permissions

4. **"Cannot connect to Supabase"**
   - Verify Supabase URL and keys
   - Ensure tables are created

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=DEBUG
PIPECAT_LOG_LEVEL=DEBUG
```

View logs:
```bash
docker-compose logs -f voice-agent
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- GitHub Issues: [your-repo-issues]
- Email: contact@ipg.inc

## Acknowledgments

Built with:
- [Pipecat](https://github.com/pipecat-ai/pipecat) - Voice agent framework
- [Deepgram](https://deepgram.com) - Speech-to-text
- [Cartesia](https://cartesia.ai) - Text-to-speech
- [OpenAI](https://openai.com) - Language models
- [Daily.co](https://daily.co) - WebRTC infrastructure