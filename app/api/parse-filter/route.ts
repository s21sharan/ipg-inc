import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const systemPrompt = `You are a filter parser for a user research database. Convert natural language queries into structured filters.

Available fields to filter on:
- age: number (e.g., <24, >30, =25, 20-30)
- occupation: string
- country: string
- primaryApp: string ("Duolingo", "Babbel", "Rosetta Stone", "Pimsleur", "Memrise", "HelloChinese")
- learningLanguage: string
- learningGoal: string ("career", "travel", "heritage", "hobby", "education", "social", "immigration")
- sentiments.overall: string ("very_negative", "negative", "mixed", "positive", "very_positive")
- sentiments.streaks: string (same scale)
- sentiments.gamification: string (same scale)
- sentiments.hearts: string (same scale)
- sentiments.notifications: string (same scale)
- sentiments.pricing: string (same scale)
- sentiments.content_quality: string (same scale)
- sentiments.progression_speed: string (same scale)
- usageFrequency: string ("daily", "several_times_week", "weekly", "sporadic", "stopped")
- isPremiumUser: boolean
- personality: string[] (check if contains trait)
- painPoints: string[] (check if contains keyword)
- valueProps: string[] (check if contains keyword)

Return a JSON array of filter objects. Each filter should have:
{
  "id": string (unique identifier),
  "field": string (the field path like "age" or "sentiments.streaks"),
  "operator": string ("<", ">", "<=", ">=", "=", "!=", "contains", "range"),
  "value": string | number | [number, number] for ranges,
  "label": string (human-readable label like "Age: <24" or "Streaks: Negative")
}

Examples:
- "under 24" → [{"id": "age_lt_24", "field": "age", "operator": "<", "value": 24, "label": "Age: <24"}]
- "negative about streaks" → [{"id": "streaks_neg", "field": "sentiments.streaks", "operator": "=", "value": "negative", "label": "Streaks: Negative"}]
- "frustrated with hearts" → [{"id": "hearts_neg", "field": "sentiments.hearts", "operator": "=", "value": "negative", "label": "Hearts: Frustrated"}]
- "uses Babbel" → [{"id": "app_babbel", "field": "primaryApp", "operator": "=", "value": "Babbel", "label": "App: Babbel"}]
- "learning for career" → [{"id": "goal_career", "field": "learningGoal", "operator": "=", "value": "career", "label": "Goal: Career"}]

For sentiment queries like "frustrated", "annoyed", "hates" → use "negative" or "very_negative"
For sentiment queries like "loves", "enjoys" → use "positive" or "very_positive"

Return a JSON object with a "filters" key containing the array of filter objects.
Example: {"filters": [{"id": "age_lt_30", "field": "age", "operator": "<", "value": 30, "label": "Age: <30"}]}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content || '{}');

    // Handle both array and object with filters key
    const filters = Array.isArray(parsed) ? parsed : (parsed.filters || []);

    return NextResponse.json({ filters });
  } catch (error) {
    console.error('Error parsing filter:', error);
    return NextResponse.json({ error: 'Failed to parse filter' }, { status: 500 });
  }
}
