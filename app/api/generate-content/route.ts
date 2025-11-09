import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { caption } = await request.json();

    if (!caption) {
      return NextResponse.json(
        { error: 'Caption is required' },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates professional and welcoming interview scripts. Generate a warm kickoff message and a brief signoff message for user interviews.'
        },
        {
          role: 'user',
          content: `Based on this campaign caption: "${caption}"\n\nGenerate:\n1. A kickoff message (2-3 sentences) - A warm, welcoming introduction that makes participants feel comfortable and valued. It should encourage honesty and openness.\n2. A signoff message (1-2 sentences) - A brief thank you message expressing gratitude for their time and participation.\n\nReturn your response in this exact JSON format:\n{\n  "kickoff": "your kickoff message here",\n  "signoff": "your signoff message here"\n}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content;
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
