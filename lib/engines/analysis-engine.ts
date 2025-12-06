/**
 * Analysis Engine
 *
 * Core functions for building analysis inputs, creating batch requests,
 * and processing results from OpenAI Batch API.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { buildAnalysisPrompt } from '../prompts/analysis-prompt';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Campaign {
  id: string;
  title: string;
  caption: string;
  topics: any[];
  completion_logic: any;
}

interface Conversation {
  id: string;
  participant_name: string;
  transcript: Array<{
    question: string;
    answer: string;
    is_followup?: boolean;
    followup_to_index?: number;
  }>;
  created_at: string;
}

/**
 * Build analysis input from campaign and conversations
 */
export async function buildAnalysisInput(
  campaignId: string,
  userId: string,
  authHeader?: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  );

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .single();

  if (campaignError || !campaign) {
    throw new Error('Campaign not found or unauthorized');
  }

  // Fetch completed conversations
  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (conversationsError) {
    throw new Error('Failed to fetch conversations');
  }

  if (!conversations || conversations.length === 0) {
    throw new Error('No completed conversations found for this campaign');
  }

  // Transform campaign topics to discussion guide questions
  const questions = (campaign.topics || []).map((topic: any, index: number) => {
    let questionType = 'open_ended';
    let questionText = '';

    if (topic.type === 'statement') {
      questionType = 'other';
      questionText = topic.content || '';
    } else if (topic.type === 'question') {
      questionText = topic.question || '';
    } else if (topic.type === 'conversation') {
      questionText = topic.goals || '';
    }

    return {
      question_id: topic.id || `q${index + 1}`,
      question_text: questionText,
      question_type: questionType,
      success_criteria: topic.goals || undefined,
    };
  });

  // Transform conversations to interview format
  const interviewsJson = conversations.map((conv: any) => {
    const transcript = (conv.transcript || []).map((turn: any, idx: number) => ({
      block_id: idx,
      speaker: idx % 2 === 0 ? 'interviewer' : 'respondent',
      text: idx % 2 === 0 ? turn.question : turn.answer,
      question_id: turn.question_id || null,
      is_followup: turn.is_followup || false,
    }));

    return {
      interview_id: conv.id,
      respondent_id: conv.participant_name,
      segment_tags: {},
      transcript,
    };
  });

  // Build campaign context
  const context = {
    client_name: 'Client', // Could be extracted from workspace or user settings
    campaign_name: campaign.title || campaign.name,
    targeted_problem_statement: campaign.caption || 'Understanding user needs',
    target_audience: 'Campaign participants',
    research_goals: questions
      .filter((q: any) => q.success_criteria)
      .map((q: any) => q.success_criteria),
  };

  return {
    context,
    questions,
    conversations: interviewsJson,
    totalConversations: conversations.length,
  };
}

/**
 * Create batch analysis request with OpenAI
 */
export async function createBatchAnalysisRequest(
  context: any,
  questions: any[],
  conversations: any[],
  analysisId: string
) {
  // Build the comprehensive prompt
  const prompt = buildAnalysisPrompt(context, questions, conversations);

  // Create batch request object
  const batchRequest = {
    custom_id: analysisId,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 16000, // Allow for comprehensive report
    },
  };

  // Write batch request to temporary file
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpDir = os.tmpdir();
  const batchFilePath = path.join(tmpDir, `batch_${analysisId}.jsonl`);

  fs.writeFileSync(batchFilePath, JSON.stringify(batchRequest));

  // Upload batch file to OpenAI
  const file = await openai.files.create({
    file: fs.createReadStream(batchFilePath),
    purpose: 'batch',
  });

  // Create batch job
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      analysis_id: analysisId,
    },
  });

  // Clean up temporary file
  fs.unlinkSync(batchFilePath);

  return {
    batchId: batch.id,
    status: batch.status,
  };
}

/**
 * Check batch status and download results if completed
 */
export async function checkBatchStatus(batchId: string) {
  const batch = await openai.batches.retrieve(batchId);

  if (batch.status === 'completed') {
    // Download output file
    const fileResponse = await openai.files.content(batch.output_file_id!);
    const fileContents = await fileResponse.text();

    // Parse JSONL response
    const result = JSON.parse(fileContents.trim());
    const responseContent = result.response.body.choices[0].message.content;

    // Parse the response to extract REPORT_MARKDOWN and DASHBOARD_JSON
    const { reportMarkdown, dashboardJson } = parseAnalysisResponse(responseContent);

    return {
      status: 'completed',
      reportMarkdown,
      dashboardJson,
    };
  } else if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
    return {
      status: 'failed',
      error: batch.errors?.data?.[0]?.message || 'Batch processing failed',
    };
  }

  return {
    status: 'processing',
  };
}

/**
 * Parse analysis response to extract markdown and JSON sections
 */
function parseAnalysisResponse(content: string): {
  reportMarkdown: string;
  dashboardJson: any;
} {
  // Split by section markers
  const markdownMatch = content.match(/===REPORT_MARKDOWN===([\s\S]*?)===DASHBOARD_JSON===/);
  const jsonMatch = content.match(/===DASHBOARD_JSON===([\s\S]*)/);

  if (!markdownMatch || !jsonMatch) {
    throw new Error('Invalid analysis response format');
  }

  const reportMarkdown = markdownMatch[1].trim();
  const dashboardJsonStr = jsonMatch[1].trim();

  let dashboardJson;
  try {
    dashboardJson = JSON.parse(dashboardJsonStr);
  } catch (e) {
    throw new Error('Failed to parse dashboard JSON');
  }

  return {
    reportMarkdown,
    dashboardJson,
  };
}

/**
 * Update analysis record in database
 */
export async function updateAnalysisRecord(
  analysisId: string,
  updates: {
    status?: string;
    batch_id?: string;
    report_markdown?: string;
    dashboard_json?: any;
    error_message?: string;
    completed_at?: string;
  }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('campaign_analyses')
    .update(updates)
    .eq('id', analysisId);

  if (error) {
    throw new Error(`Failed to update analysis record: ${error.message}`);
  }
}
