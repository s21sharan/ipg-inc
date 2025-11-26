import { createClient } from '@supabase/supabase-js';
import { simulateInterview, buildAgentContext, type Campaign, type Interview } from '@/lib/simulation-engine';
import { NextRequest, NextResponse } from 'next/server';

// Background simulation processing
async function processSimulation(
  campaignId: string,
  supabaseUrl: string,
  supabaseKey: string,
  authHeader: string | null
) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {}
    }
  });

  try {
    // Fetch campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) return;

    // Check if simulation was stopped
    const checkStopped = async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('simulation_status')
        .eq('id', campaignId)
        .single();
      return data?.simulation_status === 'stopped';
    };

    // Fetch all interviews in campaign's workspace that have reflection_memory
    const { data: interviews } = await supabase
      .from('interviews')
      .select('id, name, transcript, reflection_memory, personality')
      .eq('workspace_id', campaign.workspace_id)
      .not('reflection_memory', 'is', null);

    if (!interviews || interviews.length === 0) return;

    // Process interviews in batches of 10
    const batchSize = 10;

    for (let i = 0; i < interviews.length; i += batchSize) {
      // Check if stopped before each batch
      if (await checkStopped()) {
        console.log('Simulation stopped by user');
        break;
      }

      const batch = interviews.slice(i, i + batchSize);

      // Process batch sequentially to avoid rate limits
      for (const interview of batch) {
        // Check if stopped before each interview
        if (await checkStopped()) {
          console.log('Simulation stopped by user');
          break;
        }

        try {
          // Check if conversation already exists
          const { data: existing } = await supabase
            .from('conversations')
            .select('id, status')
            .eq('campaign_id', campaignId)
            .eq('source_interview_id', interview.id)
            .single();

          // Skip if already completed
          if (existing && existing.status === 'completed') {
            continue;
          }

          // Create or reuse conversation record
          let conversationId = existing?.id;
          if (!conversationId) {
            const { data: conversation } = await supabase
              .from('conversations')
              .insert({
                campaign_id: campaignId,
                source_interview_id: interview.id,
                participant_name: interview.name,
                status: 'in_progress',
                transcript: [],
                topics_covered: []
              })
              .select()
              .single();

            conversationId = conversation?.id;
          } else {
            // Update existing to in_progress
            await supabase
              .from('conversations')
              .update({ status: 'in_progress' })
              .eq('id', conversationId);
          }

          if (!conversationId) continue;

          // Build agent context
          const agentContext = buildAgentContext(interview as Interview);

          // Simulate interview
          const result = await simulateInterview(
            campaign as Campaign,
            interview as Interview,
            agentContext
          );

          // Update conversation record
          await supabase
            .from('conversations')
            .update({
              transcript: result.transcript,
              topics_covered: result.topics_covered,
              status: result.status,
              error_message: result.error_message || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);

        } catch (error) {
          console.error('Interview simulation error:', error);

          // Try to update conversation status to failed if it exists
          await supabase
            .from('conversations')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : 'Unknown error',
              updated_at: new Date().toISOString()
            })
            .eq('campaign_id', campaignId)
            .eq('source_interview_id', interview.id);
        }
      }

      // Wait 1 second between batches
      if (i + batchSize < interviews.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Check final status
    const stopped = await checkStopped();

    // Update campaign status to completed or stopped
    await supabase
      .from('campaigns')
      .update({
        simulation_status: stopped ? 'stopped' : 'completed'
      })
      .eq('id', campaignId);

  } catch (error) {
    console.error('Background simulation error:', error);

    // Mark campaign as completed with errors
    await supabase
      .from('campaigns')
      .update({
        simulation_status: 'completed'
      })
      .eq('id', campaignId);
  }
}

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
      console.error('Auth error:', authError);
      console.error('Auth header present:', !!authHeader);
      return NextResponse.json({
        error: 'Unauthorized',
        details: authError?.message || 'No user found'
      }, { status: 401 });
    }

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Check if already running
    if (campaign.simulation_status === 'running') {
      return NextResponse.json({
        error: 'Simulation already running',
        status: 'running'
      }, { status: 400 });
    }

    // Validate campaign has topics beyond Kickoff/Signoff
    const topics = campaign.topics || [];
    const meaningfulTopics = topics.filter((t: any) =>
      t.type !== 'statement' || (t.name !== 'Kickoff' && t.name !== 'Signoff')
    );

    if (meaningfulTopics.length === 0) {
      return NextResponse.json({
        error: 'Campaign must have at least one topic beyond Kickoff and Signoff'
      }, { status: 400 });
    }

    // Fetch all interviews in campaign's workspace that have reflection_memory
    const { data: interviews, error: interviewsError } = await supabase
      .from('interviews')
      .select('id, name, transcript, reflection_memory, personality')
      .eq('workspace_id', campaign.workspace_id)
      .not('reflection_memory', 'is', null);

    if (interviewsError) {
      return NextResponse.json({ error: 'Failed to fetch interviews' }, { status: 500 });
    }

    if (!interviews || interviews.length === 0) {
      return NextResponse.json({
        error: 'No interviews with reflection memory found in this workspace'
      }, { status: 400 });
    }

    // Update campaign status to running
    await supabase
      .from('campaigns')
      .update({
        simulation_status: 'running',
        simulation_started_at: new Date().toISOString(),
        simulation_stopped_at: null
      })
      .eq('id', campaignId);

    // Start background processing (non-blocking)
    processSimulation(campaignId, supabaseUrl, supabaseKey, authHeader).catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'Simulation started in background',
      total: interviews.length
    });

  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Simulation failed' },
      { status: 500 }
    );
  }
}
