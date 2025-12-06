const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

if (!openaiKey) {
  console.error('Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function processReflectionBatch() {
  // Read batch status
  const statusPath = path.join(__dirname, 'reflection_batch_status.json');

  if (!fs.existsSync(statusPath)) {
    console.error('reflection_batch_status.json not found. Run create_reflection_batch.js first.');
    process.exit(1);
  }

  const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  console.log(`Batch ID: ${statusData.batch_id}`);
  console.log(`Total requests: ${statusData.total_requests}\n`);

  // Check batch status
  console.log('Checking batch status...');
  const batch = await openai.batches.retrieve(statusData.batch_id);

  console.log(`Status: ${batch.status}`);
  console.log(`Completed: ${batch.request_counts?.completed || 0}/${batch.request_counts?.total || 0}`);
  console.log(`Failed: ${batch.request_counts?.failed || 0}`);

  if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
    console.log('\nBatch is still processing. Please wait and try again later.');
    console.log(`Progress: ${Math.round((batch.request_counts?.completed / batch.request_counts?.total) * 100)}%`);
    process.exit(0);
  }

  if (batch.status === 'failed') {
    console.error('\nBatch failed!');
    if (batch.errors) {
      console.error('Errors:', JSON.stringify(batch.errors, null, 2));
    }
    process.exit(1);
  }

  if (batch.status === 'expired') {
    console.error('\nBatch expired before completion.');
    process.exit(1);
  }

  if (batch.status !== 'completed') {
    console.log(`\nUnexpected status: ${batch.status}`);
    process.exit(1);
  }

  // Batch completed - download results
  console.log('\nBatch completed! Downloading results...');

  if (!batch.output_file_id) {
    console.error('No output file ID found');
    process.exit(1);
  }

  // Download the output file
  const fileResponse = await openai.files.content(batch.output_file_id);
  const outputContent = await fileResponse.text();

  // Save raw output for debugging
  const outputPath = path.join(__dirname, 'reflection_batch_output.jsonl');
  fs.writeFileSync(outputPath, outputContent);
  console.log(`Raw output saved to: ${outputPath}\n`);

  // Parse results
  const results = outputContent.trim().split('\n').map(line => JSON.parse(line));
  console.log(`Processing ${results.length} results...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const interviewId = result.custom_id;

    if (result.error) {
      console.error(`Error for interview ${interviewId}:`, result.error);
      errorCount++;
      continue;
    }

    try {
      // Parse the GPT response
      const gptResponse = result.response.body.choices[0].message.content;
      const reflectionMemory = JSON.parse(gptResponse);

      // Add metadata
      reflectionMemory.extracted_at = new Date().toISOString();
      reflectionMemory.model = 'gpt-4o-mini';
      reflectionMemory.batch_id = statusData.batch_id;

      // Fetch interview name for logging
      const { data: interview, error: fetchError } = await supabase
        .from('interviews')
        .select('name')
        .eq('id', interviewId)
        .single();

      if (fetchError) {
        console.error(`Failed to fetch interview ${interviewId}:`, fetchError.message);
        errorCount++;
        continue;
      }

      // Update Supabase
      const { error: updateError } = await supabase
        .from('interviews')
        .update({
          reflection_memory: reflectionMemory,
          updated_at: new Date().toISOString()
        })
        .eq('id', interviewId);

      if (updateError) {
        console.error(`Failed to update interview ${interviewId}:`, updateError.message);
        errorCount++;
        continue;
      }

      console.log(`✓ ${interview.name}: Reflection memory extracted and saved`);
      successCount++;

    } catch (err) {
      console.error(`Error processing interview ${interviewId}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Processing complete!`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
  console.log(`========================================`);

  // Update status file
  statusData.processed_at = new Date().toISOString();
  statusData.success_count = successCount;
  statusData.error_count = errorCount;
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
}

// Run the script
processReflectionBatch().catch(console.error);
