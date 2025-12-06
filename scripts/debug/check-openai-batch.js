const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOpenAIBatch() {
  // Get the latest analysis with a batch_id
  const { data: analyses, error } = await supabase
    .from('campaign_analyses')
    .select('*')
    .not('batch_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !analyses || analyses.length === 0) {
    console.error('No analyses with batch IDs found');
    process.exit(1);
  }

  const analysis = analyses[0];
  const batchId = analysis.batch_id;

  console.log('\n=== Analysis Info ===');
  console.log('Analysis ID:', analysis.id);
  console.log('Version:', analysis.version_number);
  console.log('Status:', analysis.status);
  console.log('Batch ID:', batchId);
  console.log('Created:', new Date(analysis.created_at).toLocaleString());

  console.log('\n=== Fetching OpenAI Batch Status ===');

  try {
    const batch = await openai.batches.retrieve(batchId);

    console.log('\nBatch Status:', batch.status);
    console.log('Created At:', new Date(batch.created_at * 1000).toLocaleString());
    console.log('Completion Window:', batch.completion_window);

    if (batch.in_progress_at) {
      console.log('Started At:', new Date(batch.in_progress_at * 1000).toLocaleString());
    }
    if (batch.completed_at) {
      console.log('Completed At:', new Date(batch.completed_at * 1000).toLocaleString());
    }
    if (batch.failed_at) {
      console.log('Failed At:', new Date(batch.failed_at * 1000).toLocaleString());
    }
    if (batch.expired_at) {
      console.log('Expired At:', new Date(batch.expired_at * 1000).toLocaleString());
    }
    if (batch.cancelled_at) {
      console.log('Cancelled At:', new Date(batch.cancelled_at * 1000).toLocaleString());
    }

    console.log('\n=== Request Counts ===');
    console.log('Total:', batch.request_counts.total);
    console.log('Completed:', batch.request_counts.completed);
    console.log('Failed:', batch.request_counts.failed);

    console.log('\n=== File IDs ===');
    console.log('Input File ID:', batch.input_file_id);
    console.log('Output File ID:', batch.output_file_id || 'null (no output yet)');
    console.log('Error File ID:', batch.error_file_id || 'null (no errors file)');

    // If there's an error file, download and show errors
    if (batch.error_file_id) {
      console.log('\n=== ERROR FILE CONTENTS ===');
      try {
        const errorFile = await openai.files.content(batch.error_file_id);
        const errorText = await errorFile.text();
        const errors = errorText.trim().split('\n').map(line => JSON.parse(line));

        console.log(`Found ${errors.length} error(s):\n`);
        errors.forEach((error, i) => {
          console.log(`Error ${i + 1}:`);
          console.log('  Custom ID:', error.custom_id);
          console.log('  Code:', error.error?.code);
          console.log('  Message:', error.error?.message);
          if (error.error?.param) {
            console.log('  Param:', error.error.param);
          }
          console.log('');
        });
      } catch (err) {
        console.error('Failed to read error file:', err.message);
      }
    }

    // If batch has errors object
    if (batch.errors) {
      console.log('\n=== BATCH ERRORS ===');
      console.log('Object:', batch.errors.object);
      if (batch.errors.data && batch.errors.data.length > 0) {
        batch.errors.data.forEach((err, i) => {
          console.log(`\nError ${i + 1}:`);
          console.log('  Code:', err.code);
          console.log('  Message:', err.message);
          console.log('  Line:', err.line || 'N/A');
        });
      }
    }

    // Additional metadata
    if (batch.metadata) {
      console.log('\n=== Metadata ===');
      console.log(JSON.stringify(batch.metadata, null, 2));
    }

  } catch (error) {
    console.error('\nError fetching batch from OpenAI:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

checkOpenAIBatch();
