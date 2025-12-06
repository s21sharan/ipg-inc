const { processMultiBatchAnalyses } = require('../lib/batch-processor-multi');

async function run() {
  console.log('Running multi-batch processor...\n');
  try {
    await processMultiBatchAnalyses();
    console.log('\n✓ Processing complete');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error.stack);
  }
}

run();
