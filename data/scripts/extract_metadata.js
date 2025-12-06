const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function extractMetadata(interviewData, filename) {
  const systemPrompt = `You are analyzing a user interview about Duolingo to extract structured metadata.
IMPORTANT: Extract information ONLY from what is explicitly stated or clearly implied in the transcript. Do NOT hallucinate or make up data.

Read the transcript CAREFULLY and extract these fields:

{
  "age": number (extract if mentioned, or estimate based on life stage clues like "grandchildren", "college student", "retired" - a grandmother is likely 60-75, not 28),
  "gender": string (one of: "male", "female", "non-binary", "unknown" - infer from name and context),
  "race": string (infer from name origin, birthplace, cultural references - e.g., Ukrainian name + born in Ukraine = "White/Eastern European"),
  "hometown": string (extract from "Where did you grow up?" answer - the actual place mentioned),
  "occupation": string (extract from interview - if retired or grandmother, say "retired" or "homemaker"),
  "country": string (where they CURRENTLY live - look for "now I am here" or similar phrases),
  "primaryApp": string ("Duolingo" or name of competing app they prefer),
  "otherApps": string[] (other language apps mentioned),
  "learningLanguage": string (what language are they learning on Duolingo?),
  "learningGoal": string (one of: "career", "travel", "heritage", "hobby", "education", "social", "immigration" - "talk with grandbabies" = "social"),
  "sentiments": {
    "overall": string (one of: "very_negative", "negative", "mixed", "positive", "very_positive"),
    "streaks": string (one of: "very_negative", "negative", "neutral", "positive", "very_positive"),
    "gamification": string (same scale),
    "hearts": string (same scale),
    "notifications": string (same scale),
    "pricing": string (same scale),
    "content_quality": string (same scale),
    "progression_speed": string (same scale)
  },
  "usageFrequency": string (one of: "daily", "several_times_week", "weekly", "sporadic", "stopped"),
  "isPremiumUser": boolean,
  "personality": string[] (3-5 traits based on how they speak and what they value),
  "painPoints": string[] (top 3 specific frustrations they mention),
  "valueProps": string[] (top 3 things they appreciate about Duolingo)
}

CRITICAL:
- For age: A "babushka" (grandmother) with grandchildren is NOT 28. Estimate 65-75.
- For country: "Now I am here in US" means country is "United States", not where they were born.
- For hometown: Use the actual place from "Where did you grow up?" - e.g., "village near Kyiv, Ukraine"
- For learningLanguage: What language are they trying to learn? "Learn English" means "English".
- For occupation: If they're a grandmother/retired, don't say "digital marketing professional".

Be ACCURATE. Extract what's actually in the transcript.`;

  const userPrompt = `Analyze this interview and extract structured metadata:

User: ${interviewData.user_name}

Interview transcript:
${interviewData.interview_script.map(item => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n')}

Return only the JSON object with the metadata.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error extracting metadata for ${interviewData.user_name}:`, error.message);
    return null;
  }
}

async function main() {
  const transcriptsDir = path.join(__dirname, '..', 'transcripts');
  const outputPath = path.join(__dirname, '..', '..', 'public', 'agent_metadata.json');

  // Get all interview files
  const files = fs.readdirSync(transcriptsDir).filter(f => f.endsWith('_interview.json'));

  console.log(`Extracting metadata from ${files.length} interviews...\n`);

  const allMetadata = [];

  // Process in batches of 5
  const batchSize = 5;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(files.length / batchSize);

    console.log(`\nBatch ${batchNum}/${totalBatches}: Processing ${batch.length} files...`);

    const results = await Promise.all(
      batch.map(async (filename) => {
        const filepath = path.join(transcriptsDir, filename);
        const interviewData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

        const metadata = await extractMetadata(interviewData, filename);

        if (metadata) {
          return {
            id: files.indexOf(filename),
            name: interviewData.user_name,
            filename,
            ...metadata
          };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result) {
        allMetadata.push(result);
        console.log(`  ✓ ${result.name}`);
      } else {
        console.log(`  ✗ Failed`);
      }
    }

    // Delay between batches
    if (i + batchSize < files.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save all metadata
  fs.writeFileSync(outputPath, JSON.stringify(allMetadata, null, 2));
  console.log(`\n✓ Saved metadata for ${allMetadata.length} agents to agent_metadata.json`);
}

main();
