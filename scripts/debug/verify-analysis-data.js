const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  const { data: analysis } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('version_number', 2)
    .single();

  if (!analysis) {
    console.log('No v2 analysis found');
    return;
  }

  console.log('=== ANALYSIS v2 VERIFICATION ===\n');
  console.log('Status:', analysis.status);
  console.log('Created:', new Date(analysis.created_at).toLocaleString());
  console.log('Completed:', analysis.completed_at ? new Date(analysis.completed_at).toLocaleString() : 'N/A');
  console.log('\nData:');
  console.log('  Report Markdown:', analysis.report_markdown ? `${analysis.report_markdown.length} chars` : 'Missing');
  console.log('  Dashboard JSON:', analysis.dashboard_json ? 'Present' : 'Missing');

  if (analysis.dashboard_json) {
    console.log('\nDashboard JSON Structure:');
    console.log('  Keys:', Object.keys(analysis.dashboard_json));
    if (analysis.dashboard_json.campaign_meta) {
      console.log('  Campaign Name:', analysis.dashboard_json.campaign_meta.campaign_name);
      console.log('  Total N:', analysis.dashboard_json.campaign_meta.N);
    }
    if (analysis.dashboard_json.themes) {
      console.log('  Themes:', analysis.dashboard_json.themes.length);
    }
  }

  if (analysis.report_markdown) {
    console.log('\nReport Preview (first 500 chars):');
    console.log(analysis.report_markdown.substring(0, 500));
  }
}

verify();
