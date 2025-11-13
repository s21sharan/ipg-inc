#!/bin/bash

# Test script for Interview Agent API

BASE_URL="http://localhost:8000"

echo "=== Testing Interview Agent API ==="
echo ""

# Step 1: Get campaigns
echo "1. Fetching campaigns for user..."
echo "GET /campaigns?user_id=YOUR_USER_ID"
echo ""
read -p "Enter your user_id from Supabase: " USER_ID

CAMPAIGNS=$(curl -s "$BASE_URL/campaigns?user_id=$USER_ID")
echo "Response: $CAMPAIGNS"
echo ""

# Step 2: Select campaign
read -p "Enter campaign_id from the list above: " CAMPAIGN_ID

# Step 3: Start interview
echo ""
echo "2. Starting interview session..."
SESSION_DATA=$(curl -s -X POST "$BASE_URL/interview/start" \
  -H "Content-Type: application/json" \
  -d "{\"campaign_id\": \"$CAMPAIGN_ID\", \"user_id\": \"$USER_ID\"}")

echo "Response: $SESSION_DATA"
echo ""

SESSION_ID=$(echo $SESSION_DATA | grep -o '"session_id":"[^"]*' | cut -d'"' -f4)
FIRST_MESSAGE=$(echo $SESSION_DATA | grep -o '"message":"[^"]*' | cut -d'"' -f4)

echo "Session ID: $SESSION_ID"
echo "AI: $FIRST_MESSAGE"
echo ""

# Step 4: Interactive conversation
echo "3. Starting interactive conversation..."
echo "(Type 'exit' to quit)"
echo ""

while true; do
    read -p "You: " USER_MESSAGE

    if [ "$USER_MESSAGE" = "exit" ]; then
        echo "Goodbye!"
        break
    fi

    RESPONSE=$(curl -s -X POST "$BASE_URL/interview/message" \
      -H "Content-Type: application/json" \
      -d "{\"session_id\": \"$SESSION_ID\", \"message\": \"$USER_MESSAGE\"}")

    AI_MESSAGE=$(echo $RESPONSE | grep -o '"message":"[^"]*' | cut -d'"' -f4)
    CURRENT_TOPIC=$(echo $RESPONSE | grep -o '"current_topic":"[^"]*' | cut -d'"' -f4)
    IS_COMPLETE=$(echo $RESPONSE | grep -o '"is_complete":[^,}]*' | cut -d':' -f2)

    echo "AI [$CURRENT_TOPIC]: $AI_MESSAGE"
    echo ""

    if [ "$IS_COMPLETE" = "true" ]; then
        echo "Interview complete!"
        break
    fi
done
