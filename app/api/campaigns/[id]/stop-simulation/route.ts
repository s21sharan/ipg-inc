import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
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
      .select('id, simulation_status')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Check if simulation is running
    if (campaign.simulation_status !== 'running') {
      return NextResponse.json({
        error: 'No simulation is currently running',
        status: campaign.simulation_status
      }, { status: 400 });
    }

    // Update campaign status to stopped
    await supabase
      .from('campaigns')
      .update({
        simulation_status: 'stopped',
        simulation_stopped_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    // Cancel all in_progress conversations
    await supabase
      .from('conversations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'in_progress');

    return NextResponse.json({
      success: true,
      message: 'Simulation stopped successfully'
    });

  } catch (error) {
    console.error('Stop simulation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stop simulation failed' },
      { status: 500 }
    );
  }
}
