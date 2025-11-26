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
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Fetch all analyses for this campaign
    const { data: analyses, error: analysesError } = await supabase
      .from('campaign_analyses')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('version_number', { ascending: false });

    if (analysesError) {
      return NextResponse.json(
        { error: 'Failed to fetch analyses' },
        { status: 500 }
      );
    }

    // Return analyses list with summary info
    const analysesSummary = (analyses || []).map((analysis: any) => ({
      id: analysis.id,
      version: analysis.version_number,
      status: analysis.status,
      conversations_analyzed: analysis.conversations_analyzed,
      created_at: analysis.created_at,
      completed_at: analysis.completed_at,
      error_message: analysis.error_message,
    }));

    // Get the most recent analysis for detailed status
    const latestAnalysis = analyses && analyses.length > 0 ? analyses[0] : null;

    return NextResponse.json({
      analyses: analysesSummary,
      latest: latestAnalysis
        ? {
            id: latestAnalysis.id,
            version: latestAnalysis.version_number,
            status: latestAnalysis.status,
            conversations_analyzed: latestAnalysis.conversations_analyzed,
            has_results:
              !!latestAnalysis.report_markdown && !!latestAnalysis.dashboard_json,
            created_at: latestAnalysis.created_at,
            completed_at: latestAnalysis.completed_at,
            error_message: latestAnalysis.error_message,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error fetching analysis status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
