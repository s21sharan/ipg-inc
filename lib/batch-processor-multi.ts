/**
 * Multi-Batch Processor
 *
 * Handles processing of analyses split into multiple batches
 */

import { createClient } from '@supabase/supabase-js';
import {
  checkMultiBatchStatus,
  mergeBatchResults,
  checkMergeBatchStatus,
} from './analysis-engine-batch';
import { triggerClustering } from './clustering-engine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function processMultiBatchAnalyses() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find analyses that are processing with batch_processing data
  const { data: analyses, error } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('status', 'processing')
    .not('batch_processing', 'is', null);

  if (error) {
    console.error('Error fetching analyses:', error);
    return;
  }

  if (!analyses || analyses.length === 0) {
    console.log('No multi-batch analyses to process');
    return;
  }

  console.log(`Processing ${analyses.length} multi-batch analyses...`);

  for (const analysis of analyses) {
    try {
      await processMultiBatchAnalysis(analysis);
    } catch (error: any) {
      console.error(`Error processing analysis ${analysis.id}:`, error.message);
    }
  }
}

async function processMultiBatchAnalysis(analysis: any) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const batchProcessing = analysis.batch_processing || {};

  console.log(`\nProcessing analysis ${analysis.id} (v${analysis.version_number})`);

  // Check if we're in merge phase
  if (batchProcessing.merge_batch_id) {
    console.log('Checking merge batch status...');

    const mergeResult = await checkMergeBatchStatus(batchProcessing.merge_batch_id);

    if (mergeResult.status === 'completed') {
      // Update analysis with final results
      await supabase
        .from('campaign_analyses')
        .update({
          status: 'completed',
          report_markdown: mergeResult.reportMarkdown,
          dashboard_json: mergeResult.dashboardJson,
          completed_at: new Date().toISOString(),
          batch_processing: {
            ...batchProcessing,
            merge_status: 'completed',
          },
        })
        .eq('id', analysis.id);

      console.log(`✓ Analysis ${analysis.id} completed with merged results`);

      // Auto-trigger clustering after analysis completes
      try {
        console.log(`Starting clustering for campaign ${analysis.campaign_id}...`);
        await triggerClustering(analysis.campaign_id, analysis.id);
        console.log(`✓ Clustering triggered for campaign ${analysis.campaign_id}`);
      } catch (clusterError: any) {
        console.error(`Failed to trigger clustering: ${clusterError.message}`);
        // Don't fail the analysis if clustering fails - it can be triggered manually
      }
    } else if (mergeResult.status === 'failed') {
      await supabase
        .from('campaign_analyses')
        .update({
          status: 'failed',
          error_message: mergeResult.error || 'Merge failed',
          batch_processing: {
            ...batchProcessing,
            merge_status: 'failed',
          },
        })
        .eq('id', analysis.id);

      console.log(`✗ Analysis ${analysis.id} merge failed`);
    } else {
      console.log(`⏳ Merge still processing...`);
    }

    return;
  }

  // Check individual batch statuses
  console.log('Checking individual batch statuses...');

  const { allCompleted, anyFailed, results, updatedBatches } = await checkMultiBatchStatus(batchProcessing);

  // Update batch processing info
  const completedCount = updatedBatches.filter((b: any) => b.status === 'completed').length;

  await supabase
    .from('campaign_analyses')
    .update({
      completed_batches: completedCount,
      batch_processing: {
        ...batchProcessing,
        batches: updatedBatches,
      },
    })
    .eq('id', analysis.id);

  console.log(`Progress: ${completedCount}/${analysis.total_batches} batches completed`);

  if (anyFailed) {
    await supabase
      .from('campaign_analyses')
      .update({
        status: 'failed',
        error_message: 'One or more batches failed',
      })
      .eq('id', analysis.id);

    console.log(`✗ Analysis ${analysis.id} failed - one or more batches failed`);
    return;
  }

  if (allCompleted && results.length === analysis.total_batches) {
    console.log('All batches completed! Starting merge...');

    // Get campaign context for merge
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', analysis.campaign_id)
      .single();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Build context and questions
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

    const context = {
      client_name: 'Client',
      campaign_name: campaign.title || campaign.name,
      targeted_problem_statement: campaign.caption || 'Understanding user needs',
      target_audience: 'Campaign participants',
      research_goals: questions
        .filter((q: any) => q.success_criteria)
        .map((q: any) => q.success_criteria),
    };

    // Start merge batch
    const { mergeBatchId, mergeStatus } = await mergeBatchResults(
      results,
      context,
      questions,
      analysis.id
    );

    await supabase
      .from('campaign_analyses')
      .update({
        batch_processing: {
          ...batchProcessing,
          batches: updatedBatches,
          merge_batch_id: mergeBatchId,
          merge_status: mergeStatus,
        },
      })
      .eq('id', analysis.id);

    console.log(`Started merge batch: ${mergeBatchId}`);
  }
}
