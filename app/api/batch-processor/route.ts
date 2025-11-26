import { NextRequest, NextResponse } from 'next/server';
import { processPendingBatches } from '../../../lib/batch-processor';
import { processMultiBatchAnalyses } from '../../../lib/batch-processor-multi';

/**
 * API endpoint to manually trigger batch processing
 * Can also be called by a cron job
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication check here
    // For now, we'll allow any POST request (consider adding API key auth)

    // Process both single and multi-batch analyses
    await processPendingBatches();
    await processMultiBatchAnalyses();

    return NextResponse.json({
      success: true,
      message: 'Batch processing completed',
    });
  } catch (error: any) {
    console.error('Error in batch processor endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing
export async function GET(request: NextRequest) {
  return POST(request);
}
