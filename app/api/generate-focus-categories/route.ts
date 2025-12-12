import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { title, goal } = await request.json();

    if (!title || !goal) {
      return NextResponse.json(
        { error: 'Title and goal are required' },
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
        input: `Generate exactly 4 interview focus categories for a user research campaign.

Campaign Title: "${title}"
Campaign Goal: "${goal}"

Here are examples of good focus categories. You can use these directly if relevant, or create new ones that better fit the campaign goal:

Examples:
- "Value Perception" - "Questions about what users value, don't value, or misunderstand about the product."
- "Usage & Habits" - "Questions about how/when they use the product, and where usage or value drops off."
- "Onboarding Experience" - "Questions about their first days with the product and what made it easy or confusing to get started."
- "Upgrade & Pricing" - "Questions about what would convince them to upgrade, and how they feel about the current price and benefits."
- "Churn & Breakpoints" - "Questions about why they stopped using the product (or considered leaving), and what might have kept them."
- "Feature Discovery" - "Questions about which features they know about, which they ignore, and how they discover new parts of the product."
- "Motivation & Goals" - "Questions about what they're trying to achieve with the product and whether it's helping them reach those goals."
- "Pain Points & Frustrations" - "Questions about moments where the product feels slow, confusing, or annoying, and how that affects their behavior."
- "Alternatives & Competition" - "Questions about other tools they use instead of the product, and why they choose those for certain jobs."
- "Content Fit & Personalization" - "Questions about whether the content, recommendations, or experiences feel relevant and tailored to them."

Generate 4 categories most relevant to the campaign goal. Each category should have:
- A short name (2-4 words)
- A description starting with "Questions about..." (one sentence)

Return ONLY a JSON array with exactly 4 objects, each with "name" and "description" fields:
[{"name": "Category Name", "description": "Questions about..."}]`,
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

    // Parse the JSON array
    const categories = JSON.parse(content.trim());

    if (!Array.isArray(categories) || categories.length !== 4) {
      throw new Error('Invalid response format');
    }

    return NextResponse.json({
      categories,
    });
  } catch (error) {
    console.error('Error generating focus categories:', error);
    // Return default categories as fallback
    return NextResponse.json({
      categories: [
        { name: 'Value Perception', description: 'Questions about what users value, don\'t value, or misunderstand about the product.' },
        { name: 'Usage & Habits', description: 'Questions about how/when they use the product, and where usage or value drops off.' },
        { name: 'Motivation & Goals', description: 'Questions about what they\'re trying to achieve with the product and whether it\'s helping them reach those goals.' },
        { name: 'Pain Points & Frustrations', description: 'Questions about moments where the product feels slow, confusing, or annoying, and how that affects their behavior.' },
      ],
    });
  }
}
