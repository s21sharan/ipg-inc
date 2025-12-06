import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildAnalysisInput,
  createBatchAnalysisRequest,
} from '@/lib/engines/analysis-engine';
import { createMultiBatchAnalysis } from '@/lib/engines/analysis-engine-batch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const campaignId = params.id;

    // Get auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create Supabase client with auth
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user from auth header
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Count completed conversations
    const { count: completedCount, error: countError } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'completed');

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to count conversations' },
        { status: 500 }
      );
    }

    if (!completedCount || completedCount === 0) {
      return NextResponse.json(
        { error: 'No completed conversations to analyze' },
        { status: 400 }
      );
    }

    // Check if analysis already in progress
    const { data: existingAnalyses, error: existingError } = await supabase
      .from('campaign_analyses')
      .select('id, status')
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing']);

    if (existingError) {
      return NextResponse.json(
        { error: 'Failed to check existing analyses' },
        { status: 500 }
      );
    }

    if (existingAnalyses && existingAnalyses.length > 0) {
      return NextResponse.json(
        { error: 'Analysis already in progress for this campaign' },
        { status: 409 }
      );
    }

    // Calculate next version number
    const { data: latestAnalysis } = await supabase
      .from('campaign_analyses')
      .select('version_number')
      .eq('campaign_id', campaignId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = latestAnalysis ? latestAnalysis.version_number + 1 : 1;

    // Create analysis record
    const { data: analysis, error: createError } = await supabase
      .from('campaign_analyses')
      .insert({
        campaign_id: campaignId,
        version_number: nextVersion,
        status: 'pending',
        conversations_analyzed: completedCount,
      })
      .select()
      .single();

    if (createError || !analysis) {
      return NextResponse.json(
        { error: 'Failed to create analysis record' },
        { status: 500 }
      );
    }

    // Build analysis input and create batch request (non-blocking background process)
    // We'll spawn this and return immediately
    processAnalysisInBackground(
      analysis.id,
      campaignId,
      user.id,
      authHeader
    );

    return NextResponse.json({
      success: true,
      analysis_id: analysis.id,
      version: nextVersion,
      total_conversations: completedCount,
    });
  } catch (error: any) {
    console.error('Error starting analysis:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Background process to build input and submit batch request
 */
async function processAnalysisInBackground(
  analysisId: string,
  campaignId: string,
  userId: string,
  authHeader: string
) {
  try {
    // Build analysis input
    const { context, questions, conversations, totalConversations } = await buildAnalysisInput(
      campaignId,
      userId,
      authHeader
    );

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decide whether to use single batch or multi-batch approach
    const BATCH_THRESHOLD = 50;

    if (totalConversations <= BATCH_THRESHOLD) {
      // Use single batch approach
      console.log(`Using single batch for ${totalConversations} conversations`);

      const { batchId } = await createBatchAnalysisRequest(
        context,
        questions,
        conversations,
        analysisId
      );

      await supabase
        .from('campaign_analyses')
        .update({
          batch_id: batchId,
          status: 'processing',
          total_batches: 1,
          completed_batches: 0,
        })
        .eq('id', analysisId);
    } else {
      // Use multi-batch approach
      console.log(`Using multi-batch for ${totalConversations} conversations`);

      const { batches, totalBatches } = await createMultiBatchAnalysis(
        context,
        questions,
        conversations,
        analysisId
      );

      await supabase
        .from('campaign_analyses')
        .update({
          status: 'processing',
          total_batches: totalBatches,
          completed_batches: 0,
          batch_processing: {
            batches,
          },
        })
        .eq('id', analysisId);
    }

    // Trigger auto-polling to automatically process batch results
    console.log('Starting auto-poll for batch processing...');
    triggerAutoPoll();
  } catch (error: any) {
    console.error('Error in background analysis processing:', error);

    // Update analysis record with error
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase
      .from('campaign_analyses')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown error',
      })
      .eq('id', analysisId);
  }
}

/**
 * Trigger auto-polling mechanism to process batch results
 */
function triggerAutoPoll() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  fetch(`${baseUrl}/api/batch-processor/auto-poll`, {
    method: 'POST',
  }).catch(err => {
    console.error('Failed to trigger auto-poll:', err);
  });
}
