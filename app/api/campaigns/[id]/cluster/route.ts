import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerClustering } from '../../../../../lib/clustering-engine';

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
        { error: 'No completed conversations to cluster' },
        { status: 400 }
      );
    }

    // Check if clustering already in progress
    const { data: existingClusters, error: existingError } = await supabase
      .from('campaign_clusters')
      .select('id, status')
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'extracting', 'embedding', 'clustering', 'labeling']);

    if (existingError) {
      return NextResponse.json(
        { error: 'Failed to check existing clusters' },
        { status: 500 }
      );
    }

    if (existingClusters && existingClusters.length > 0) {
      return NextResponse.json(
        { error: 'Clustering already in progress for this campaign' },
        { status: 409 }
      );
    }

    // Get optional analysis_id from request body
    let analysisId: string | null = null;
    try {
      const body = await request.json();
      analysisId = body.analysis_id || null;
    } catch {
      // No body provided, that's fine
    }

    // Trigger clustering
    const { clusterId } = await triggerClustering(campaignId, analysisId);

    return NextResponse.json({
      success: true,
      cluster_id: clusterId,
      total_conversations: completedCount,
    });
  } catch (error: any) {
    console.error('Error starting clustering:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: Get clustering status
export async function GET(
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

    // Get all clusters for this campaign
    const { data: clusters, error } = await supabase
      .from('campaign_clusters')
      .select('id, version_number, status, dimension, conversations_analyzed, created_at, completed_at, error_message')
      .eq('campaign_id', campaignId)
      .order('version_number', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch clusters' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clusters: clusters || [],
    });
  } catch (error: any) {
    console.error('Error fetching clusters:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
