import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { parseEditCommand, isTargetedEdit, type ParsedCommand } from '@/lib/utils/edit-command-parser';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Topic {
  id: string;
  name: string;
  type: 'statement' | 'conversation' | 'question';
  content?: string;
  persona?: string;
  goals?: string;
  maxDuration?: string;
  question?: string;
  probeQuestions?: string;
  probeDepth?: string;
}

interface EditRequest {
  currentTopics: Topic[];
  editCommand: string;
  context: {
    title: string;
    goal: string;
    audience: string;
    focusCategory: string;
  };
}

interface EditResponse {
  editType: 'full_regeneration' | 'targeted_edit';
  updatedTopics: Topic[];
  changedIds: string[];
  description: string;
}

// Validate and fix topic structure
function validateTopics(topics: any[]): Topic[] {
  return topics.map((topic, index) => {
    // Ensure required fields exist
    const validated: Topic = {
      id: topic.id || String(index + 1),
      name: topic.name || `Topic ${index + 1}`,
      type: topic.type || 'question',
    };

    // Add type-specific fields
    if (validated.type === 'statement') {
      validated.content = topic.content || '';
    } else if (validated.type === 'question') {
      validated.question = topic.question || '';
      validated.probeQuestions = topic.probeQuestions || '';
      validated.probeDepth = topic.probeDepth || '1-2';
    }

    return validated;
  });
}

async function handleTargetedEdit(
  parsedCommand: ParsedCommand,
  currentTopics: Topic[],
  context: EditRequest['context']
): Promise<{ updatedTopics: Topic[]; changedIds: string[] }> {
  // Find question topics (excluding statements)
  const questionTopics = currentTopics.filter(t => t.type === 'question');
  const targetIndex = parsedCommand.targetQuestionIndex;

  if (targetIndex !== undefined && (targetIndex < 1 || targetIndex > questionTopics.length)) {
    throw new Error(`Question ${targetIndex} not found. There are ${questionTopics.length} questions.`);
  }

  const targetTopic = targetIndex ? questionTopics[targetIndex - 1] : undefined;

  let prompt = '';
  const topicStructure = `
IMPORTANT: Each topic MUST have these exact fields:
- id: string (e.g., "1", "2", "3")
- name: string (e.g., "Introduction: Welcome" or "Kickoff")
- type: "statement" | "question" | "conversation"
- For statement type: content (string)
- For question type: question (string), probeQuestions (string, newline-separated), probeDepth ("1-2" | "3-5" | "5-10")
`;
  let editContext = `
Campaign: "${context.title}"
Goal: "${context.goal}"
Audience: "${context.audience}"
Focus Area: "${context.focusCategory}"

Current interview guide topics:
${JSON.stringify(currentTopics, null, 2)}

User's edit request: "${parsedCommand.instruction}"
${topicStructure}`;

  switch (parsedCommand.type) {
    case 'add_followup':
      if (!targetTopic) {
        throw new Error('Please specify which question to add follow-ups to (e.g., "add follow-up to question 2")');
      }
      prompt = `${editContext}

Add 1-2 relevant follow-up questions to question ${targetIndex} (id: ${targetTopic.id}).
The question is: "${targetTopic.question}"
Current follow-ups: "${targetTopic.probeQuestions || 'none'}"

Return ONLY the modified topics array as JSON. Only modify the probeQuestions field of the specified topic.`;
      break;

    case 'add_choice':
      if (!targetTopic) {
        throw new Error('Please specify which question to add choices to (e.g., "add choice to question 3")');
      }
      prompt = `${editContext}

Add multiple choice options to question ${targetIndex} (id: ${targetTopic.id}).
The question is: "${targetTopic.question}"

Embed the options in the question text like this:
"Original question text?

Options:
- Option A
- Option B
- Option C
- Other"

Return ONLY the modified topics array as JSON. Only modify the question field of the specified topic.`;
      break;

    case 'modify_question':
      if (!targetTopic) {
        throw new Error('Please specify which question to modify (e.g., "change question 2 to focus on...")');
      }
      prompt = `${editContext}

Modify question ${targetIndex} (id: ${targetTopic.id}) based on the user's request.
Current question: "${targetTopic.question}"
Current follow-ups: "${targetTopic.probeQuestions || 'none'}"

Update the question and/or follow-ups as needed. Keep the same id and topic structure.
Return ONLY the modified topics array as JSON.`;
      break;

    case 'delete_question':
      if (!targetTopic) {
        throw new Error('Please specify which question to remove (e.g., "delete question 3")');
      }
      // Handle deletion locally without API call
      const updatedTopics = currentTopics.filter(t => t.id !== targetTopic.id);
      // Renumber remaining question topics
      let questionNum = 0;
      const renumberedTopics = updatedTopics.map(t => {
        if (t.type === 'question') {
          questionNum++;
          return { ...t, id: String(questionNum + 1) }; // +1 because Kickoff is id 1
        }
        return t;
      });
      return { updatedTopics: renumberedTopics, changedIds: [targetTopic.id] };

    case 'add_question':
      prompt = `${editContext}

Add a new question to the interview guide based on the user's request.
Insert it in an appropriate position (before the Signoff statement).
Give it a unique id and appropriate section prefix in the name.

Return ONLY the modified topics array as JSON with the new question included.`;
      break;

    case 'change_section':
      prompt = `${editContext}

Modify the section structure or names based on the user's request.
This might involve renaming sections (the prefix before ":" in topic names) or reorganizing questions.

Return ONLY the modified topics array as JSON.`;
      break;

    default:
      prompt = `${editContext}

Apply the user's edit request to the interview guide.
Return ONLY the modified topics array as JSON.`;
  }

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: prompt,
  });

  const content = response.output_text;

  if (!content) {
    throw new Error('No content generated from OpenAI API');
  }

  // Extract JSON
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const parsedTopics = JSON.parse(jsonStr);
  const updatedTopics: Topic[] = validateTopics(parsedTopics);

  // Determine which topics changed
  const changedIds: string[] = [];
  for (const newTopic of updatedTopics) {
    const oldTopic = currentTopics.find(t => t.id === newTopic.id);
    if (!oldTopic) {
      // New topic added
      changedIds.push(newTopic.id);
    } else if (JSON.stringify(oldTopic) !== JSON.stringify(newTopic)) {
      // Topic was modified
      changedIds.push(newTopic.id);
    }
  }

  // Check for deleted topics
  for (const oldTopic of currentTopics) {
    if (!updatedTopics.find(t => t.id === oldTopic.id)) {
      changedIds.push(oldTopic.id);
    }
  }

  return { updatedTopics, changedIds };
}

async function handleFullRegeneration(
  command: string,
  context: EditRequest['context']
): Promise<{ updatedTopics: Topic[]; changedIds: string[] }> {
  const prompt = `Generate a new interview discussion guide based on these parameters and the user's feedback.

Campaign: "${context.title}"
Goal: "${context.goal}"
Audience: "${context.audience}"
Focus Area: "${context.focusCategory}"

User's feedback: "${command}"

Generate a structured interview guide with:
1. A Kickoff statement topic (introduction/welcome)
2. 4-6 question topics organized into 2-3 sections
3. A Signoff statement topic (thank you/closing)

SECTION NAMING CONVENTION:
- Statement topics: Just use "Kickoff" or "Signoff" as the name
- Question topics: Use format "SectionName: Brief Question Title"

For each QUESTION topic, include:
- A main question reflecting the user's feedback
- 3-5 follow-up probe questions (newline-separated in probeQuestions)
- probeDepth: one of "1-2", "3-5", or "5-10"

IMPORTANT: Each topic object MUST have these exact fields:
{
  "id": "1",
  "name": "SectionName: Topic Title",
  "type": "statement" or "question",
  "content": "..." (for statement type only),
  "question": "..." (for question type),
  "probeQuestions": "line1\\nline2\\nline3" (for question type),
  "probeDepth": "1-2" or "3-5" or "5-10" (for question type)
}

Return ONLY a valid JSON array of Topic objects. No markdown, no explanation.`;

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: prompt,
  });

  const content = response.output_text;

  if (!content) {
    throw new Error('No content generated from OpenAI API');
  }

  // Extract JSON
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const parsedTopics = JSON.parse(jsonStr);
  const updatedTopics: Topic[] = validateTopics(parsedTopics);

  // All topics are "changed" in full regeneration
  const changedIds = updatedTopics.map(t => t.id);

  return { updatedTopics, changedIds };
}

export async function POST(request: NextRequest) {
  try {
    const body: EditRequest = await request.json();
    const { currentTopics, editCommand, context } = body;

    if (!editCommand || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: editCommand, context' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Parse the edit command to determine type
    const parsedCommand = parseEditCommand(editCommand);
    const isTargeted = isTargetedEdit(parsedCommand);

    let result: { updatedTopics: Topic[]; changedIds: string[] };

    if (isTargeted && currentTopics && currentTopics.length > 0) {
      result = await handleTargetedEdit(parsedCommand, currentTopics, context);
    } else {
      result = await handleFullRegeneration(editCommand, context);
    }

    const response: EditResponse = {
      editType: isTargeted ? 'targeted_edit' : 'full_regeneration',
      updatedTopics: result.updatedTopics,
      changedIds: result.changedIds,
      description: `${isTargeted ? 'Targeted' : 'Full'} edit applied`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error editing interview guide:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
