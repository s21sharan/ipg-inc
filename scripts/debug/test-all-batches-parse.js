const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const batchIds = [
  'batch_6926682cd4948190aa2230189ef8f68a',
  'batch_6926682e1ccc8190846f08017e055219',
  'batch_6926682efc708190a413de642d38e8e3',
  'batch_6926682fe0b88190818adf064407bab0',
];

async function testBatch(batchId, index) {
  console.log(`\n=== BATCH ${index + 1} - ${batchId} ===`);

  try {
    const batch = await openai.batches.retrieve(batchId);

    if (!batch.output_file_id) {
      console.error('✗ No output file available');
      return;
    }

    const fileResponse = await openai.files.content(batch.output_file_id);
    const fileContents = await fileResponse.text();
    const result = JSON.parse(fileContents.trim());
    const responseContent = result.response.body.choices[0].message.content;

    const markdownMatch = responseContent.match(/===REPORT_MARKDOWN===([\s\S]*?)===DASHBOARD_JSON===/);
    const jsonMatch = responseContent.match(/===DASHBOARD_JSON===([\s\S]*)/);

    if (!markdownMatch || !jsonMatch) {
      console.error('✗ Failed to match sections');
      return;
    }

    const dashboardJsonStr = jsonMatch[1].trim();

    try {
      const dashboardJson = JSON.parse(dashboardJsonStr);
      console.log('✓ JSON parsed successfully');
      console.log(`  Markdown: ${markdownMatch[1].trim().length} chars`);
      console.log(`  JSON: ${dashboardJsonStr.length} chars`);
    } catch (e) {
      console.error('✗ JSON parse error:', e.message);
      console.log('  First 200 chars of JSON:', dashboardJsonStr.substring(0, 200));
      console.log('  Last 200 chars of JSON:', dashboardJsonStr.substring(dashboardJsonStr.length - 200));
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

async function testAll() {
  for (let i = 0; i < batchIds.length; i++) {
    await testBatch(batchIds[i], i);
  }
}

testAll();
