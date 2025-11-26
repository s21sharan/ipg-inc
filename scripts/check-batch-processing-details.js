const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDetails() {
  const { data: analysis } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('version_number', 2)
    .single();

  if (!analysis) {
    console.log('No v2 analysis found');
    return;
  }

  console.log('=== ANALYSIS v2 DETAILS ===\n');
  console.log('ID:', analysis.id);
  console.log('Status:', analysis.status);
  console.log('Total Batches:', analysis.total_batches);
  console.log('Completed Batches:', analysis.completed_batches);
  console.log('\n=== BATCH PROCESSING DATA ===');
  console.log(JSON.stringify(analysis.batch_processing, null, 2));
}

checkDetails();
