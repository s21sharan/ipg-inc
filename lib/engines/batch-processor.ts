/**
 * Batch Processor
 *
 * Background job that polls OpenAI batch status and processes completed analyses.
 * Can be run via cron job or on-demand polling.
 */

import { createClient } from '@supabase/supabase-js';
import { checkBatchStatus, updateAnalysisRecord } from './analysis-engine';
import { triggerClustering } from './clustering-engine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Process all pending batch analyses
 * Call this from a cron job or polling interval
 */
export async function processPendingBatches() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch all analyses with status='processing' that have a batch_id
  const { data: pendingAnalyses, error } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('status', 'processing')
    .not('batch_id', 'is', null);

  if (error) {
    console.error('Error fetching pending analyses:', error);
    return;
  }

  if (!pendingAnalyses || pendingAnalyses.length === 0) {
    console.log('No pending analyses to process');
    return;
  }

  console.log(`Processing ${pendingAnalyses.length} pending analyses...`);

  // Process each analysis
  for (const analysis of pendingAnalyses) {
    try {
      await processAnalysis(analysis);
    } catch (error: any) {
      console.error(
        `Error processing analysis ${analysis.id}:`,
        error.message
      );
    }
  }

  console.log('Batch processing complete');
}

/**
 * Process a single analysis
 */
async function processAnalysis(analysis: any) {
  console.log(`Checking batch ${analysis.batch_id} for analysis ${analysis.id}...`);

  try {
    const result = await checkBatchStatus(analysis.batch_id);

    if (result.status === 'completed') {
      // Update analysis with results
      await updateAnalysisRecord(analysis.id, {
        status: 'completed',
        report_markdown: result.reportMarkdown,
        dashboard_json: result.dashboardJson,
        completed_at: new Date().toISOString(),
      });

      console.log(`✓ Analysis ${analysis.id} completed successfully`);

      // Auto-trigger clustering after analysis completes
      try {
        console.log(`Starting clustering for campaign ${analysis.campaign_id}...`);
        await triggerClustering(analysis.campaign_id, analysis.id);
        console.log(`✓ Clustering triggered for campaign ${analysis.campaign_id}`);
      } catch (clusterError: any) {
        console.error(`Failed to trigger clustering: ${clusterError.message}`);
        // Don't fail the analysis if clustering fails - it can be triggered manually
      }
    } else if (result.status === 'failed') {
      // Update analysis with error
      await updateAnalysisRecord(analysis.id, {
        status: 'failed',
        error_message: result.error || 'Batch processing failed',
      });

      console.log(`✗ Analysis ${analysis.id} failed: ${result.error}`);
    } else {
      // Still processing
      console.log(`⏳ Analysis ${analysis.id} still processing...`);
    }
  } catch (error: any) {
    console.error(`Error processing analysis ${analysis.id}:`, error);

    // Update analysis with error
    await updateAnalysisRecord(analysis.id, {
      status: 'failed',
      error_message: error.message || 'Unknown error during processing',
    });
  }
}

/**
 * Process a specific analysis by ID
 * Useful for on-demand checking
 */
export async function processAnalysisById(analysisId: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: analysis, error } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (error || !analysis) {
    throw new Error('Analysis not found');
  }

  if (analysis.status !== 'processing' || !analysis.batch_id) {
    throw new Error('Analysis is not in processing state');
  }

  await processAnalysis(analysis);
}
