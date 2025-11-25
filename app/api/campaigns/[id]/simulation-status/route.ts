import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    // Get auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {}
      }
    });

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get campaign data including simulation status
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('workspace_id, simulation_status, simulation_started_at, simulation_stopped_at')
      .eq('id', campaignId)
      .single();

    let totalInterviews = 0;
    if (campaignData) {
      const { count } = await supabase
        .from('interviews')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', campaignData.workspace_id)
        .not('reflection_memory', 'is', null);

      totalInterviews = count || 0;
    }

    // Get conversation counts by status
    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, participant_name, status, error_message, created_at')
      .eq('campaign_id', campaignId);

    if (conversationsError) {
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    const total = totalInterviews;
    const completed = conversations?.filter(c => c.status === 'completed').length || 0;
    const in_progress = conversations?.filter(c => c.status === 'in_progress').length || 0;
    const failed = conversations?.filter(c => c.status === 'failed').length || 0;
    const pending = total - (completed + in_progress + failed);

    return NextResponse.json({
      total,
      completed,
      in_progress,
      failed,
      pending,
      simulation_status: campaignData?.simulation_status || 'idle',
      simulation_started_at: campaignData?.simulation_started_at,
      simulation_stopped_at: campaignData?.simulation_stopped_at,
      conversations: conversations?.map(c => ({
        participant_name: c.participant_name,
        status: c.status,
        error_message: c.error_message,
        created_at: c.created_at
      })) || []
    });

  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}
