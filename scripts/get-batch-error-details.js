const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getErrorDetails() {
  const errorFileId = 'file-5naTt6XwKUZkGFeFdRfB3P';

  console.log('Downloading error file...\n');

  try {
    const errorFile = await openai.files.content(errorFileId);
    const errorText = await errorFile.text();

    console.log('=== RAW ERROR FILE ===');
    console.log(errorText);
    console.log('\n=== PARSED ERRORS ===\n');

    const errors = errorText.trim().split('\n');
    errors.forEach((line, i) => {
      try {
        const error = JSON.parse(line);
        console.log(`Error ${i + 1}:`);
        console.log(JSON.stringify(error, null, 2));
        console.log('');
      } catch (e) {
        console.log('Failed to parse line:', line);
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getErrorDetails();
