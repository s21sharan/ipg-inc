const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testParse() {
  const batchId = 'batch_6926682cd4948190aa2230189ef8f68a';

  console.log(`Fetching batch: ${batchId}`);
  const batch = await openai.batches.retrieve(batchId);

  if (!batch.output_file_id) {
    console.error('No output file available');
    return;
  }

  const fileResponse = await openai.files.content(batch.output_file_id);
  const fileContents = await fileResponse.text();
  const result = JSON.parse(fileContents.trim());
  const responseContent = result.response.body.choices[0].message.content;

  console.log('=== TESTING PARSE FUNCTION ===\n');

  const markdownMatch = responseContent.match(/===REPORT_MARKDOWN===([\s\S]*?)===DASHBOARD_JSON===/);
  const jsonMatch = responseContent.match(/===DASHBOARD_JSON===([\s\S]*)/);

  if (!markdownMatch || !jsonMatch) {
    console.error('Failed to match sections');
    console.log('Has markdown match:', !!markdownMatch);
    console.log('Has json match:', !!jsonMatch);
    return;
  }

  const reportMarkdown = markdownMatch[1].trim();
  const dashboardJsonStr = jsonMatch[1].trim();

  console.log('Markdown length:', reportMarkdown.length);
  console.log('Dashboard JSON string length:', dashboardJsonStr.length);
  console.log('\nFirst 100 chars of JSON string:');
  console.log(dashboardJsonStr.substring(0, 100));
  console.log('\nLast 100 chars of JSON string:');
  console.log(dashboardJsonStr.substring(dashboardJsonStr.length - 100));

  try {
    const dashboardJson = JSON.parse(dashboardJsonStr);
    console.log('\n✓ JSON parsed successfully!');
    console.log('Keys:', Object.keys(dashboardJson));
  } catch (e) {
    console.error('\n✗ JSON parse error:', e.message);
    console.log('\nTrying to find the issue...');

    // Check for common issues
    const lines = dashboardJsonStr.split('\n');
    console.log('Total lines:', lines.length);
    console.log('Last 5 lines:');
    lines.slice(-5).forEach((line, i) => {
      console.log(`  ${lines.length - 5 + i}: ${line}`);
    });
  }
}

testParse();
