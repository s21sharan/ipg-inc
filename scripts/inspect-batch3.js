const OpenAI = require('openai');
const fs = require('fs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function inspect() {
  const batchId = 'batch_6926682efc708190a413de642d38e8e3';

  const batch = await openai.batches.retrieve(batchId);
  const fileResponse = await openai.files.content(batch.output_file_id);
  const fileContents = await fileResponse.text();
  const result = JSON.parse(fileContents.trim());
  const responseContent = result.response.body.choices[0].message.content;

  const jsonMatch = responseContent.match(/===DASHBOARD_JSON===([\s\S]*)/);
  const dashboardJsonStr = jsonMatch[1].trim();

  // Write to file for inspection
  fs.writeFileSync('/tmp/batch3-dashboard.json', dashboardJsonStr);
  console.log('Wrote JSON to /tmp/batch3-dashboard.json');

  // Try to find the error location
  try {
    JSON.parse(dashboardJsonStr);
  } catch (e) {
    console.log('\nError:', e.message);

    // Extract position from error message
    const posMatch = e.message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      const start = Math.max(0, pos - 100);
      const end = Math.min(dashboardJsonStr.length, pos + 100);

      console.log('\nContext around error (position', pos, '):');
      console.log('...' + dashboardJsonStr.substring(start, end) + '...');
      console.log(' '.repeat(100 - (pos - start)) + '^');
    }
  }
}

inspect();
