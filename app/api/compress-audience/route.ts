import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

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
        input: `Compress this audience description into exactly 4-6 words that capture the key user segment or behavior. Be concise and descriptive.

Examples of good compressed outputs:
- "Frequent business travelers abroad"
- "Busy parents learning on mobile"
- "College students on tight budget"
- "Retired lifelong learners at home"
- "Casual gamers seeking quick sessions"
- "Early adopters of new tech"
- "Power users seeking advanced features"
- "First-time users trying product"
- "Lapsed users returning after break"

Input: "${text}"

Return ONLY the compressed 4-6 word phrase, nothing else. Do not include quotes or punctuation at the end. Match the style of the examples above.`,
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
    const messageItem = data.output?.find((item: any) => item.type === 'message');
    const content = messageItem?.content?.[0]?.text ?? null;

    if (!content) {
      console.error('Failed to extract content. Full response:', data);
      throw new Error('No content generated from OpenAI API');
    }

    return NextResponse.json({
      compressed: content.trim(),
    });
  } catch (error) {
    console.error('Error compressing audience:', error);
    return NextResponse.json(
      { error: 'Failed to compress audience text' },
      { status: 500 }
    );
  }
}
