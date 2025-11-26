const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function checkMerge() {
  const mergeBatchId = 'batch_69266f042fb88190b177da02abb5a3e9';

  console.log('=== MERGE BATCH STATUS ===\n');
  console.log('Batch ID:', mergeBatchId);

  const batch = await openai.batches.retrieve(mergeBatchId);

  console.log('Status:', batch.status);
  console.log('Created:', new Date(batch.created_at * 1000).toLocaleString());

  if (batch.in_progress_at) {
    console.log('In Progress:', new Date(batch.in_progress_at * 1000).toLocaleString());
  }

  if (batch.completed_at) {
    console.log('Completed:', new Date(batch.completed_at * 1000).toLocaleString());
  }

  console.log('\nRequest Counts:');
  console.log('  Total:', batch.request_counts.total);
  console.log('  Completed:', batch.request_counts.completed);
  console.log('  Failed:', batch.request_counts.failed);

  if (batch.metadata) {
    console.log('\nMetadata:');
    console.log(JSON.stringify(batch.metadata, null, 2));
  }
}

checkMerge();
