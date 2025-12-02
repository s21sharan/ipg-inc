import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    // Get the latest completed cluster for this campaign
    const { data: cluster, error } = await supabase
      .from('campaign_clusters')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'completed')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      return NextResponse.json(
        { error: 'Failed to fetch cluster' },
        { status: 500 }
      );
    }

    if (!cluster) {
      // Check if there's a clustering in progress
      const { data: inProgress } = await supabase
        .from('campaign_clusters')
        .select('id, status, created_at')
        .eq('campaign_id', campaignId)
        .in('status', ['pending', 'extracting', 'embedding', 'clustering', 'labeling'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (inProgress) {
        return NextResponse.json({
          status: 'processing',
          processing_status: inProgress.status,
          cluster_id: inProgress.id,
        });
      }

      return NextResponse.json({
        status: 'none',
        message: 'No clusters generated yet',
      });
    }

    // Transform clusters for frontend
    const clusters = (cluster.clusters_json?.clusters || []).map((c: any) => ({
      id: c.cluster_id,
      title: c.label,
      summary: c.description,
      quote: c.quote,
      matchedUsers: c.count,
      prevalence: c.prevalence,
      confidence: c.confidence,
      hexagonCount: c.count,
      members: c.members,
    }));

    return NextResponse.json({
      status: 'completed',
      id: cluster.id,
      version: cluster.version_number,
      dimension: cluster.dimension,
      dimension_rationale: cluster.dimension_rationale,
      conversations_analyzed: cluster.conversations_analyzed,
      created_at: cluster.created_at,
      completed_at: cluster.completed_at,
      clusters,
    });
  } catch (error: any) {
    console.error('Error fetching latest cluster:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
