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

async function processFollowupBatch() {
  // Read batch status
  const statusPath = path.join(__dirname, 'batch_status.json');

  if (!fs.existsSync(statusPath)) {
    console.error('batch_status.json not found. Run create_followup_batch.js first.');
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
  const outputPath = path.join(__dirname, 'batch_output.jsonl');
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
      const followupData = JSON.parse(gptResponse);

      // Fetch current interview from Supabase
      const { data: interview, error: fetchError } = await supabase
        .from('interviews')
        .select('transcript, name')
        .eq('id', interviewId)
        .single();

      if (fetchError || !interview) {
        console.error(`Failed to fetch interview ${interviewId}:`, fetchError?.message);
        errorCount++;
        continue;
      }

      // Insert follow-ups into transcript
      const updatedTranscript = insertFollowups(interview.transcript, followupData.followups);

      // Update Supabase
      const { error: updateError } = await supabase
        .from('interviews')
        .update({
          transcript: updatedTranscript,
          updated_at: new Date().toISOString()
        })
        .eq('id', interviewId);

      if (updateError) {
        console.error(`Failed to update interview ${interviewId}:`, updateError.message);
        errorCount++;
        continue;
      }

      const followupCount = followupData.followups.reduce((sum, f) => sum + f.followup_questions.length, 0);
      console.log(`✓ ${interview.name}: Added ${followupCount} follow-up Q&As`);
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

function insertFollowups(transcript, followups) {
  // Create a copy of the transcript
  const updatedTranscript = [...transcript];

  // Sort followups by original_question_index in descending order
  // (so we insert from the end, preserving indices)
  const sortedFollowups = [...followups].sort(
    (a, b) => b.original_question_index - a.original_question_index
  );

  for (const followup of sortedFollowups) {
    const insertIndex = followup.original_question_index + 1;

    // Create follow-up Q&A objects with notation
    const followupItems = followup.followup_questions.map(fq => ({
      question: fq.question,
      answer: fq.answer,
      is_followup: true,
      followup_to_index: followup.original_question_index
    }));

    // Insert after the original question
    updatedTranscript.splice(insertIndex, 0, ...followupItems);
  }

  return updatedTranscript;
}

// Run the script
processFollowupBatch().catch(console.error);
