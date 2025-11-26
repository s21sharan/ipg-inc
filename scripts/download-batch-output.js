const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function downloadOutput() {
  const batchId = 'batch_6926682cd4948190aa2230189ef8f68a';

  console.log(`Fetching batch: ${batchId}`);
  const batch = await openai.batches.retrieve(batchId);

  if (!batch.output_file_id) {
    console.error('No output file available');
    return;
  }

  console.log(`Downloading output file: ${batch.output_file_id}`);
  const fileResponse = await openai.files.content(batch.output_file_id);
  const fileContents = await fileResponse.text();

  console.log('\n=== RAW OUTPUT ===\n');
  console.log(fileContents);

  console.log('\n\n=== PARSED OUTPUT ===\n');
  const result = JSON.parse(fileContents.trim());
  console.log(JSON.stringify(result, null, 2));

  console.log('\n\n=== RESPONSE CONTENT (first 500 chars) ===\n');
  const responseContent = result.response.body.choices[0].message.content;
  console.log(responseContent.substring(0, 500));
}

downloadOutput();
