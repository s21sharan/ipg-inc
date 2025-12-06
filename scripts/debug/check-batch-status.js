const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBatchStatus() {
  // Check for processing analyses
  const { data: processing, error: procError } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('status', 'processing')
    .order('created_at', { ascending: false });

  if (procError) {
    console.error('Error:', procError.message);
    process.exit(1);
  }

  if (processing && processing.length > 0) {
    console.log('\n=== PROCESSING ANALYSES ===');
    processing.forEach((analysis, i) => {
      console.log(`\n${i + 1}. Analysis v${analysis.version_number}`);
      console.log('   ID:', analysis.id);
      console.log('   Batch ID:', analysis.batch_id || 'Not yet submitted');
      console.log('   Conversations:', analysis.conversations_analyzed);
      console.log('   Created:', new Date(analysis.created_at).toLocaleString());
      console.log('   Error:', analysis.error_message || 'None');

      // Check for multi-batch processing
      if (analysis.batch_processing && analysis.batch_processing.batches) {
        console.log('   Multi-Batch Mode: YES');
        console.log('   Total Batches:', analysis.total_batches);
        console.log('   Completed Batches:', analysis.completed_batches);
        console.log('   Batch Details:');
        analysis.batch_processing.batches.forEach((batch, batchIdx) => {
          console.log(`     - Batch ${batchIdx + 1}: ${batch.status} (ID: ${batch.batch_id})`);
          console.log(`       Conversations: ${batch.conversation_start}-${batch.conversation_end}`);
        });
        if (analysis.batch_processing.merge_batch_id) {
          console.log('   Merge Batch ID:', analysis.batch_processing.merge_batch_id);
          console.log('   Merge Status:', analysis.batch_processing.merge_status);
        }
      }
    });

    if (processing[0].batch_id) {
      console.log('\n=== OpenAI Batch Check ===');
      console.log('Run this command to check batch status:');
      console.log(`\ncurl https://api.openai.com/v1/batches/${processing[0].batch_id} \\`);
      console.log(`  -H "Authorization: Bearer $OPENAI_API_KEY" | jq`);
    }
  } else {
    console.log('\n✓ No processing analyses found');
  }

  // Check latest analysis of any status
  const { data: latest } = await supabase
    .from('campaign_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (latest && latest.length > 0) {
    const analysis = latest[0];
    console.log('\n=== LATEST ANALYSIS ===');
    console.log('Status:', analysis.status);
    console.log('Version:', analysis.version_number);
    console.log('Conversations:', analysis.conversations_analyzed);
    console.log('Created:', new Date(analysis.created_at).toLocaleString());
    if (analysis.completed_at) {
      console.log('Completed:', new Date(analysis.completed_at).toLocaleString());
    }
    console.log('Has Report:', analysis.report_markdown ? 'Yes' : 'No');
    console.log('Has Dashboard:', analysis.dashboard_json ? 'Yes' : 'No');
    if (analysis.error_message) {
      console.log('Error:', analysis.error_message);
    }
  }
}

checkBatchStatus();
