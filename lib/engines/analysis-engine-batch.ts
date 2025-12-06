/**
 * Batch Analysis Engine
 *
 * Handles splitting large conversation sets into smaller batches,
 * processing each batch separately, and merging results.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { buildAnalysisPrompt } from '../prompts/analysis-prompt';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BATCH_SIZE = 50; // Process 50 conversations per batch
const MAX_TOKENS = 120000; // Leave buffer below 128k limit

/**
 * Create multiple batch requests for large conversation sets
 */
export async function createMultiBatchAnalysis(
  context: any,
  questions: any[],
  conversations: any[],
  analysisId: string
) {
  const totalConversations = conversations.length;
  const numBatches = Math.ceil(totalConversations / BATCH_SIZE);

  console.log(`Splitting ${totalConversations} conversations into ${numBatches} batches`);

  const batches = [];
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpDir = os.tmpdir();

  for (let i = 0; i < numBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min((i + 1) * BATCH_SIZE, totalConversations);
    const batchConversations = conversations.slice(start, end);

    // Build prompt for this batch
    const prompt = buildAnalysisPrompt(
      {
        ...context,
        campaign_name: `${context.campaign_name} (Batch ${i + 1}/${numBatches})`,
      },
      questions,
      batchConversations
    );

    // Create batch request
    const batchRequest = {
      custom_id: `${analysisId}_batch_${i}`,
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
        max_tokens: 16000,
      },
    };

    // Write batch file
    const batchFilePath = path.join(tmpDir, `batch_${analysisId}_${i}.jsonl`);
    fs.writeFileSync(batchFilePath, JSON.stringify(batchRequest));

    // Upload to OpenAI
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
        batch_index: i.toString(),
        batch_total: numBatches.toString(),
      },
    });

    batches.push({
      batch_id: batch.id,
      status: batch.status,
      conversation_start: start,
      conversation_end: end,
      batch_index: i,
    });

    // Clean up temp file
    fs.unlinkSync(batchFilePath);

    console.log(`Created batch ${i + 1}/${numBatches}: ${batch.id}`);
  }

  return {
    batches,
    totalBatches: numBatches,
  };
}

/**
 * Check status of all batches and download completed results
 */
export async function checkMultiBatchStatus(batchProcessing: any) {
  const batches = batchProcessing.batches || [];
  const results: any[] = [];
  let allCompleted = true;
  let anyFailed = false;

  for (const batchInfo of batches) {
    const batch = await openai.batches.retrieve(batchInfo.batch_id);

    if (batch.status === 'completed') {
      // Download result
      const fileResponse = await openai.files.content(batch.output_file_id!);
      const fileContents = await fileResponse.text();
      const result = JSON.parse(fileContents.trim());
      const responseContent = result.response.body.choices[0].message.content;

      results.push({
        batch_index: batchInfo.batch_index,
        conversation_start: batchInfo.conversation_start,
        conversation_end: batchInfo.conversation_end,
        content: responseContent,
      });

      batchInfo.status = 'completed';
    } else if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
      batchInfo.status = 'failed';
      batchInfo.error = 'Batch processing failed';
      anyFailed = true;
      allCompleted = false;
    } else {
      allCompleted = false;
    }
  }

  return {
    allCompleted,
    anyFailed,
    results: results.sort((a, b) => a.batch_index - b.batch_index),
    updatedBatches: batches,
  };
}

/**
 * Merge multiple batch results into a single comprehensive report
 */
export async function mergeBatchResults(
  batchResults: any[],
  context: any,
  questions: any[],
  analysisId: string
) {
  console.log(`Merging ${batchResults.length} batch results...`);

  // Extract all reports and dashboards from batches
  const batchReports: string[] = [];
  const batchDashboards: any[] = [];

  for (const result of batchResults) {
    const { reportMarkdown, dashboardJson } = parseAnalysisResponse(result.content);
    batchReports.push(reportMarkdown);
    batchDashboards.push(dashboardJson);
  }

  // Create merge prompt
  const mergePrompt = buildMergePrompt(context, questions, batchReports, batchDashboards);

  // Submit merge batch
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpDir = os.tmpdir();

  const mergeBatchRequest = {
    custom_id: `${analysisId}_merge`,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: mergePrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 16000,
    },
  };

  const mergeFilePath = path.join(tmpDir, `batch_${analysisId}_merge.jsonl`);
  fs.writeFileSync(mergeFilePath, JSON.stringify(mergeBatchRequest));

  const file = await openai.files.create({
    file: fs.createReadStream(mergeFilePath),
    purpose: 'batch',
  });

  const mergeBatch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      analysis_id: analysisId,
      type: 'merge',
    },
  });

  fs.unlinkSync(mergeFilePath);

  return {
    mergeBatchId: mergeBatch.id,
    mergeStatus: mergeBatch.status,
  };
}

/**
 * Check merge batch status and return final results
 */
export async function checkMergeBatchStatus(mergeBatchId: string) {
  const batch = await openai.batches.retrieve(mergeBatchId);

  if (batch.status === 'completed') {
    const fileResponse = await openai.files.content(batch.output_file_id!);
    const fileContents = await fileResponse.text();
    const result = JSON.parse(fileContents.trim());
    const responseContent = result.response.body.choices[0].message.content;

    const { reportMarkdown, dashboardJson } = parseAnalysisResponse(responseContent);

    return {
      status: 'completed',
      reportMarkdown,
      dashboardJson,
    };
  } else if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
    return {
      status: 'failed',
      error: 'Merge batch failed',
    };
  }

  return {
    status: 'processing',
  };
}

/**
 * Build merge prompt to combine multiple batch reports
 */
function buildMergePrompt(
  context: any,
  questions: any[],
  batchReports: string[],
  batchDashboards: any[]
): string {
  return `You are a research synthesis expert. You have received ${batchReports.length} separate analysis reports from a large research campaign. Your task is to merge these reports into a single comprehensive analysis.

CAMPAIGN CONTEXT:
${JSON.stringify(context, null, 2)}

DISCUSSION GUIDE:
${JSON.stringify(questions, null, 2)}

BATCH REPORTS (${batchReports.length} total):
${batchReports.map((report, i) => `\n=== BATCH ${i + 1} REPORT ===\n${report}`).join('\n\n')}

BATCH DASHBOARDS (${batchDashboards.length} total):
${batchDashboards.map((dash, i) => `\n=== BATCH ${i + 1} DASHBOARD ===\n${JSON.stringify(dash, null, 2)}`).join('\n\n')}

YOUR TASK:
1. Combine all statistics accurately (add up counts, recalculate percentages based on total N)
2. Merge themes - identify common themes across batches and consolidate them
3. Combine quotes - select the most representative quotes from across all batches
4. Merge dashboard data - combine all chart data, ensuring correct totals
5. Maintain all citations in the format [INT:interview_id|BLK:block_id]
6. Ensure the final report has the same structure as individual batch reports

STRICT RULES:
- Do NOT invent new data - only merge existing data
- Recalculate ALL percentages based on the combined total N
- Preserve ALL citations from original reports
- Ensure chart data arrays combine data from all batches
- Keep the same output format: REPORT_MARKDOWN and DASHBOARD_JSON sections

OUTPUT FORMAT (MANDATORY):
Return EXACTLY two top-level sections:

===REPORT_MARKDOWN===
[Your merged markdown report here]

===DASHBOARD_JSON===
[Your merged JSON object here]`;
}

/**
 * Parse analysis response to extract markdown and JSON sections
 */
function parseAnalysisResponse(content: string): {
  reportMarkdown: string;
  dashboardJson: any;
} {
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
    // Try to fix common JSON formatting errors
    console.log('Initial JSON parse failed, attempting to fix common errors...');

    // Fix missing commas before new properties (common LLM error)
    let fixedJson = dashboardJsonStr.replace(/("\s*)\n(\s*")/g, '$1,\n$2');

    try {
      dashboardJson = JSON.parse(fixedJson);
      console.log('✓ Fixed JSON by adding missing commas');
    } catch (e2) {
      console.error('JSON parse error:', e);
      console.error('Context:', dashboardJsonStr.substring(0, 500));
      throw new Error('Failed to parse dashboard JSON');
    }
  }

  return {
    reportMarkdown,
    dashboardJson,
  };
}
