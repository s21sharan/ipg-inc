const OpenAI = require('openai');

const openaiKey = process.env.OPENAI_API_KEY;

if (!openaiKey) {
  console.error('Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiKey });

const batchId = process.argv[2];

if (!batchId) {
  console.error('Usage: node cancel_batch.js <batch_id>');
  process.exit(1);
}

async function cancelBatch() {
  console.log(`Cancelling batch: ${batchId}...`);

  try {
    const batch = await openai.batches.cancel(batchId);
    console.log(`\nBatch cancelled successfully!`);
    console.log(`Status: ${batch.status}`);
  } catch (error) {
    console.error(`Error cancelling batch: ${error.message}`);
    process.exit(1);
  }
}

cancelBatch().catch(console.error);
