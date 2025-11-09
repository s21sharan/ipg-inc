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

    // Use the OpenAI Responses API
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
        input: `You are a helpful assistant that creates professional and welcoming interview scripts. Based on this campaign caption: "${caption}"\n\nGenerate:\n1. A kickoff message (2-3 sentences) - A warm, welcoming introduction that makes participants feel comfortable and valued. It should encourage honesty and openness.\n2. A signoff message (1-2 sentences) - A brief thank you message expressing gratitude for their time and participation.\n\nReturn your response in this exact JSON format:\n{\n  "kickoff": "your kickoff message here",\n  "signoff": "your signoff message here"\n}`,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();

    // Extract the text from the Responses API output
    // Find the message in the output array (not the reasoning item)
    const messageItem = data.output?.find((item: any) => item.type === 'message');
    const content = messageItem?.content?.[0]?.text ?? null;

    if (!content) {
      console.error('Failed to extract content. Full response:', data);
      throw new Error('No content generated from OpenAI API');
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