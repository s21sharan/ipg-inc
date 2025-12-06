import { NextRequest, NextResponse } from 'next/server';
import { processPendingBatches } from '@/lib/engines/batch-processor';
import { processMultiBatchAnalyses } from '@/lib/engines/batch-processor-multi';

/**
 * Auto-polling endpoint that continues polling until all analyses complete
 * This runs in the background and automatically processes batch results
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Auto-Poll] Starting batch processing cycle...');

    // Process both single and multi-batch analyses
    await processPendingBatches();
    await processMultiBatchAnalyses();

    // Check if there are still pending analyses
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: processingAnalyses } = await supabase
      .from('campaign_analyses')
      .select('id, status, total_batches, completed_batches')
      .eq('status', 'processing');

    const stillProcessing = processingAnalyses && processingAnalyses.length > 0;

    if (stillProcessing) {
      console.log(`[Auto-Poll] ${processingAnalyses.length} analyses still processing.`);
    } else {
      console.log('[Auto-Poll] No analyses processing.');
    }

    return NextResponse.json({
      success: true,
      message: 'Auto-poll cycle completed',
      still_processing: stillProcessing,
      count: processingAnalyses?.length || 0,
      analyses: processingAnalyses?.map(a => ({
        id: a.id,
        status: a.status,
        progress: a.total_batches ? `${a.completed_batches}/${a.total_batches}` : 'N/A',
      })) || [],
    });
  } catch (error: any) {
    console.error('[Auto-Poll] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
