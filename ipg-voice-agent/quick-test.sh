#!/bin/bash
# Quick validation script - test changes without rebuilding
echo "🔍 Running quick validation..."
docker cp test_quick.py ipg-voice-agent:/app/test_quick.py 2>/dev/null
docker exec -u root ipg-voice-agent chown agent:agent /app/test_quick.py 2>/dev/null
docker exec ipg-voice-agent python /app/test_quick.py
