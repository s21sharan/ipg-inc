import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { caption } = await request.json();

    if (!caption) {
      return NextResponse.json(
        { error: 'Caption is required' },
        { status: 400 }
      );
    }

    // Use the OpenAI Responses API directly
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        input: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that creates professional and welcoming interview scripts. Generate a warm kickoff message and a brief signoff message for user interviews. Always respond in valid JSON format.',
          },
          {
            role: 'user',
            content: `Based on this campaign caption: "${caption}"\n\nGenerate:\n1. A kickoff message (2-3 sentences) - A warm, welcoming introduction that makes participants feel comfortable and valued. It should encourage honesty and openness.\n2. A signoff message (1-2 sentences) - A brief thank you message expressing gratitude for their time and participation.\n\nReturn your response in this exact JSON format:\n{\n  "kickoff": "your kickoff message here",\n  "signoff": "your signoff message here"\n}`,
          },
        ],
        response_format: { type: 'json' },
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();

    // Extract the text from the Responses API output
    const content = data.output?.[0]?.content?.[0]?.text?.value ?? null;

    if (!content) {
      throw new Error('No content generated');
    }

    const result = JSON.parse(content);

    return NextResponse.json({
      kickoff: result.kickoff,
      signoff: result.signoff,
    });
  } catch (error) {
    console.error('Error generating content:', error);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}