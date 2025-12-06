const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Diverse user profiles to generate
const userProfiles = [
  {
    name: 'Marcus',
    profile: 'African American software engineer from Atlanta, 28, uses Babbel primarily but tried Duolingo. Speaks in a casual, tech-savvy manner with some AAVE. Generally negative about Duolingo - finds it too gamified and not serious enough.',
  },
  {
    name: 'Sofia',
    profile: 'Mexican-American nurse from Texas, 34, heritage speaker trying to improve formal Spanish. Uses Duolingo and loves it. Speaks with occasional Spanglish and warm, friendly tone.',
  },
  {
    name: 'Kenji',
    profile: 'Japanese-American college student from California, 20, learning Korean for K-pop/K-drama. Very positive about Duolingo. Speaks casually with lots of filler words like "like" and "honestly".',
  },
  {
    name: 'Priya',
    profile: 'Indian immigrant in Canada, 31, IT professional learning French for Quebec job market. Uses Rosetta Stone mainly, tried Duolingo. Mixed feelings - appreciates free aspect but finds it insufficient. Speaks precisely with slight formal tone.',
  },
  {
    name: 'Dmitri',
    profile: 'Russian immigrant in Chicago, 45, factory worker learning English. Very positive about Duolingo - it helped him when he couldn\'t afford classes. Speaks with some grammatical quirks and direct manner.',
  },
  {
    name: 'Aaliyah',
    profile: 'Black British woman from London, 26, marketing professional learning Italian for boyfriend\'s family. Uses Duolingo casually. Speaks with British slang and expressions.',
  },
  {
    name: 'Chen Wei',
    profile: 'Chinese international student in US, 22, already fluent in English, learning Spanish. Negative about Duolingo - too slow, prefers textbooks. Speaks carefully and formally.',
  },
  {
    name: 'Maria',
    profile: 'Brazilian in Miami, 38, stay-at-home mom learning English. Loves Duolingo\'s flexibility. Speaks enthusiastically with some Portuguese-influenced patterns.',
  },
  {
    name: 'Tyrone',
    profile: 'African American retired military, 52, learning Arabic for travel. Uses multiple apps including Duolingo. Disciplined approach, speaks directly and no-nonsense.',
  },
  {
    name: 'Ingrid',
    profile: 'Swedish expat in NYC, 29, learning Japanese for anime/manga hobby. Very into gamification, loves Duolingo leagues. Speaks with slight Scandinavian directness.',
  },
  {
    name: 'Carlos',
    profile: 'Puerto Rican in Florida, 41, bilingual but kids losing Spanish. Uses Duolingo for kids. Speaks with code-switching and Boricua expressions.',
  },
  {
    name: 'Fatima',
    profile: 'Somali refugee in Minnesota, 24, learned English with Duolingo\'s help. Extremely positive. Speaks with earnest, heartfelt tone.',
  },
  {
    name: 'Trevor',
    profile: 'Australian backpacker, 23, tried learning Thai with Duolingo before trip. Disappointed - not practical enough. Speaks with Aussie slang and laid-back tone.',
  },
  {
    name: 'Yuki',
    profile: 'Japanese housewife in Japan, 48, learning English for volunteer work with tourists. Struggles with Duolingo\'s pace. Speaks politely with some hesitation.',
  },
  {
    name: 'DeShawn',
    profile: 'African American high school teacher in Detroit, 35, learning French to teach. Mixed feelings on Duolingo - good for basics, not for teaching prep. Speaks thoughtfully with educator perspective.',
  },
  {
    name: 'Anya',
    profile: 'Ukrainian refugee in Poland, 27, learning Polish urgently. Frustrated with Duolingo\'s slow progression. Speaks with urgency and some stress.',
  },
  {
    name: 'Mohammed',
    profile: 'Egyptian in London, 33, learning German for PhD. Prefers Pimsleur for pronunciation. Speaks formally with academic vocabulary.',
  },
  {
    name: 'Lucia',
    profile: 'Italian grandmother in New Jersey, 67, learning English better after 40 years in US. Loves Duolingo\'s patience. Speaks with Italian-American expressions and warm tone.',
  },
  {
    name: 'Brandon',
    profile: 'White American gamer, 19, learning Japanese for video games. Loves the gamification, hates the repetition. Speaks with gaming references and Gen-Z slang.',
  },
  {
    name: 'Amara',
    profile: 'Nigerian in Houston, 30, learning Yoruba to reconnect with heritage. Frustrated Duolingo doesn\'t have it, uses it for French instead. Speaks with Nigerian English patterns.',
  },
  {
    name: 'Viktor',
    profile: 'Polish truck driver in UK, 39, improving English. Uses Duolingo on long breaks. Practical, no-frills perspective. Speaks directly with some Polish syntax.',
  },
  {
    name: 'Jasmine',
    profile: 'Chinese-American in San Francisco, 25, relearning Mandarin she lost as kid. Emotional journey with language. Speaks casually with some frustration at herself.',
  },
  {
    name: 'Omar',
    profile: 'Jordanian in Michigan, 44, auto industry worker learning Spanish for coworkers. Very positive - Duolingo helped him connect. Speaks with Arabic-influenced warmth.',
  },
  {
    name: 'Sienna',
    profile: 'White American influencer, 21, learning Spanish for content. Superficial engagement, cares about streak for posts. Speaks with influencer-speak and vocal fry.',
  },
  {
    name: 'Kwame',
    profile: 'Ghanaian in UK, 36, learning Dutch for potential move. Compares to Memrise which he prefers. Speaks with Ghanaian English patterns.',
  },
  {
    name: 'Elena',
    profile: 'Greek in Australia, 32, learning Mandarin for business. Uses HelloChinese mainly, Duolingo secondary. Speaks with slight Greek accent patterns.',
  },
  {
    name: 'Rashid',
    profile: 'Pakistani-British doctor, 40, learning Spanish for medical missions. Time-constrained, appreciates Duolingo\'s short lessons. Speaks efficiently and precisely.',
  },
  {
    name: 'Destiny',
    profile: 'African American single mom in Atlanta, 29, learning ASL on Duolingo. Loves the visual approach. Speaks warmly with Southern expressions.',
  },
  {
    name: 'Hans',
    profile: 'German engineer in US, 51, perfecting English. Finds Duolingo too basic. Speaks with German precision and some frustration.',
  },
  {
    name: 'Mei Lin',
    profile: 'Taiwanese in Canada, 28, learning French for Montreal job. Uses Duolingo Plus, appreciates no ads. Speaks softly with careful word choice.',
  },
  {
    name: 'Jamal',
    profile: 'Moroccan in France, 25, already speaks French/Arabic, learning English. Finds Duolingo helpful for vocabulary. Speaks with French-influenced English.',
  },
  {
    name: 'Katya',
    profile: 'Russian ballet dancer in NYC, 23, improving English. Loves the daily habit aspect. Speaks with artistic, emotional tone.',
  },
  {
    name: 'Obinna',
    profile: 'Nigerian medical student in Ireland, 26, learning Irish as cultural respect. Appreciates Duolingo has it. Speaks with Nigerian formality.',
  },
  {
    name: 'Guadalupe',
    profile: 'Mexican immigrant cleaner in California, 55, learning English. Duolingo is her only resource. Speaks with deep gratitude but notes difficulty.',
  },
  {
    name: 'Finn',
    profile: 'Irish in Berlin, 31, learning German. Heavy Duolingo user but plateaued. Speaks with Irish expressions and humor.',
  },
  {
    name: 'Aisha',
    profile: 'Bangladeshi in London, 37, learning Arabic for Quran. Finds Duolingo\'s Modern Standard Arabic helpful. Speaks respectfully with religious context.',
  },
  {
    name: 'Darnell',
    profile: 'African American veteran, 34, learning Mandarin for business venture. Disciplined user but wants more depth. Speaks with military directness.',
  },
  {
    name: 'Nadia',
    profile: 'Iranian in Toronto, 42, learning Spanish for fun. Casual user, no pressure. Speaks with Persian-influenced warmth and philosophy.',
  },
  {
    name: 'Tomasz',
    profile: 'Polish programmer in Netherlands, 29, learning Dutch. Compares everything to programming logic. Speaks technically with dry humor.',
  },
  {
    name: 'Blessing',
    profile: 'Nigerian nurse in UK, 33, learning German for job in Germany. Frustrated with Duolingo\'s lack of medical vocabulary. Speaks with Nigerian English enthusiasm.',
  },
  {
    name: 'Sven',
    profile: 'Swedish retiree, 68, learning Spanish for winter home in Spain. Loves the patience of the app. Speaks slowly and thoughtfully.',
  },
  {
    name: 'Layla',
    profile: 'Lebanese-American in Michigan, 22, relearning Arabic. Conflicted feelings about heritage and language. Speaks with vulnerability.',
  },
  {
    name: 'Kofi',
    profile: 'Ghanaian Uber driver in NYC, 40, learning Spanish for passengers. Very practical perspective. Speaks with Ghanaian directness.',
  },
  {
    name: 'Valentina',
    profile: 'Colombian in Spain, 26, learning Catalan for Barcelona job. Uses Duolingo for Catalan specifically. Speaks with Colombian warmth.',
  },
  {
    name: 'Rajesh',
    profile: 'Indian IT manager in US, 47, learning Japanese for anime with son. Bonding experience. Speaks with Indian English patterns and dad humor.',
  },
  {
    name: 'Zara',
    profile: 'British-Pakistani influencer, 24, learning Korean. Does it for content mostly. Speaks with British-Pakistani slang mix.',
  },
  {
    name: 'Emmanuel',
    profile: 'Haitian in Boston, 38, already speaks French/Creole, learning Spanish. Finds Duolingo easy because of French base. Speaks with Haitian expressions.',
  },
  {
    name: 'Olga',
    profile: 'Ukrainian grandmother in US, 72, learning English. Grandkids set her up with Duolingo. Speaks with heavy accent representation and sweetness.',
  },
  {
    name: 'Dante',
    profile: 'Italian-American chef in Chicago, 35, relearning Italian for restaurant authenticity. Finds Duolingo too formal, not dialectal. Speaks with Chicago Italian-American style.',
  },
  {
    name: 'Amelia',
    profile: 'White American diplomat\'s kid, 17, learned 3 languages on Duolingo. Power user perspective. Speaks precociously with global awareness.',
  },
  {
    name: 'Tariq',
    profile: 'Saudi student in UK, 21, perfecting English. Finds Duolingo beneath his level but uses for streak pride. Speaks with Gulf Arabic-influenced English.',
  },
];

const questions = [
  { question: "Intro greeting", time_limit_sec: 0 },
  { question: "Short version of your life story?", time_limit_sec: 180 },
  { question: "Where did you grow up?", time_limit_sec: 60 },
  { question: "What was it like growing up there?", time_limit_sec: 90 },
  { question: "One turning point in your life?", time_limit_sec: 150 },
  { question: "Why was that a turning point?", time_limit_sec: 120 },
  { question: "How did you handle that situation?", time_limit_sec: 120 },
  { question: "What do you care most about right now?", time_limit_sec: 150 },
  { question: "Why is that important?", time_limit_sec: 120 },
  { question: "What is a good day for you?", time_limit_sec: 120 },
  { question: "What makes you say \"this was a good day\"?", time_limit_sec: 90 },
  { question: "How do you make big decisions?", time_limit_sec: 120 },
  { question: "Planner or go-with-the-flow?", time_limit_sec: 90 },
  { question: "Example showing that?", time_limit_sec: 120 },
  { question: "How do you handle risk?", time_limit_sec: 120 },
  { question: "Typical weekday?", time_limit_sec: 180 },
  { question: "Which parts take the most energy?", time_limit_sec: 120 },
  { question: "What do you wish you had more time or energy for?", time_limit_sec: 120 },
  { question: "Biggest constraint last year?", time_limit_sec: 150 },
  { question: "How do you deal with that constraint?", time_limit_sec: 120 },
  { question: "People you feel closest to?", time_limit_sec: 120 },
  { question: "Describe those relationships.", time_limit_sec: 90 },
  { question: "Where do you spend most of your time?", time_limit_sec: 90 },
  { question: "How do you feel in those spaces?", time_limit_sec: 120 },
  { question: "What makes you feel that way?", time_limit_sec: 90 },
  { question: "Who do you turn to when problems arise?", time_limit_sec: 120 },
  { question: "One tough moment in the last year?", time_limit_sec: 150 },
  { question: "How did it affect you?", time_limit_sec: 120 },
  { question: "How did you cope?", time_limit_sec: 150 },
  { question: "What helps when you're overwhelmed?", time_limit_sec: 120 },
  { question: "What do you want life to look like in a few years?", time_limit_sec: 150 },
  { question: "What do you want to be different?", time_limit_sec: 120 },
  { question: "Before Duolingo, how did you handle language learning?", time_limit_sec: 180 },
  { question: "Most annoying part of old method?", time_limit_sec: 150 },
  { question: "Time it really failed?", time_limit_sec: 150 },
  { question: "How did you first hear about Duolingo?", time_limit_sec: 90 },
  { question: "What convinced you to try it?", time_limit_sec: 120 },
  { question: "Walk through a recent Duolingo use.", time_limit_sec: 210 },
  { question: "Most helpful part?", time_limit_sec: 120 },
  { question: "Most frustrating part?", time_limit_sec: 150 },
  { question: "Most frustrating part of Duolingo overall?", time_limit_sec: 150 },
  { question: "One time that frustration showed up?", time_limit_sec: 180 },
  { question: "Do you use workarounds?", time_limit_sec: 150 },
  { question: "What do workarounds give you that Duolingo doesn't?", time_limit_sec: 150 },
  { question: "Worst-case scenario in this space?", time_limit_sec: 150 },
  { question: "When you open Duolingo, what do you hope it does?", time_limit_sec: 150 },
  { question: "How do you know Duolingo worked?", time_limit_sec: 120 },
  { question: "One thing you'd change about Duolingo?", time_limit_sec: 120 },
  { question: "One thing you'd change about the whole problem space?", time_limit_sec: 120 },
  { question: "Anything important we didn't cover?", time_limit_sec: 90 },
  { question: "Permission to build a digital twin?", time_limit_sec: 60 },
];

async function generateInterview(userProfile) {
  const systemPrompt = `You are simulating a user interview for a language learning app research study. You will generate realistic, conversational responses as if you are the person being interviewed.

The person you're simulating:
Name: ${userProfile.name}
Profile: ${userProfile.profile}

CRITICAL INSTRUCTIONS:
1. Speak EXACTLY as this person would speak - use their dialect, slang, filler words, speech patterns
2. Keep responses conversational and natural - people don't speak in perfect paragraphs
3. Include "um", "like", "you know", "I mean", verbal tics appropriate to the character
4. Responses should feel like real spoken language, not written text
5. Be authentic to their background - cultural references, expressions from their community
6. Their attitude toward Duolingo should match the profile (positive, negative, or mixed)
7. Reference competing apps if mentioned in profile (Babbel, Rosetta Stone, Pimsleur, Memrise, HelloChinese, etc.)
8. IMPORTANT: Responses should be DETAILED and SUBSTANTIVE - typically 4-8 sentences each. People in interviews ramble, explain themselves, give examples, go on tangents. Short answers are not realistic.
9. Show personality and emotion in responses - people share stories, memories, frustrations in detail
10. If they're negative about Duolingo, be genuinely critical with specific examples. If positive, be genuinely enthusiastic with specific examples.
11. Include specific anecdotes, concrete examples, and personal stories - not generic statements
12. For questions about Duolingo usage, describe specific screens, features, moments in detail
13. People in interviews often answer more than was asked - they connect things to their life, explain context, justify their feelings

Generate a complete interview with answers to all questions provided.`;

  const userPrompt = `Generate interview responses for all these questions. Return as a JSON array of objects with "question", "time_limit_sec", and "answer" fields.

Questions:
${JSON.stringify(questions, null, 2)}

Remember: This person is ${userProfile.name}. ${userProfile.profile}

Make sure to also generate:
- A "summary" field (one sentence capturing their key insight about Duolingo)
- A "top_quotes" array with exactly 3 of their most impactful quotes about Duolingo/language learning

Return format:
{
  "user_name": "${userProfile.name}",
  "summary": "...",
  "top_quotes": ["...", "...", "..."],
  "interview_script": [...]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 8000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error generating interview for ${userProfile.name}:`, error.message);
    return null;
  }
}

async function main() {
  const transcriptsDir = path.join(__dirname, '..', 'transcripts');

  // Ensure directory exists
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }

  console.log(`Generating ${userProfiles.length} interviews in batches of 3...\n`);

  // Process in batches of 3
  const batchSize = 3;
  for (let i = 0; i < userProfiles.length; i += batchSize) {
    const batch = userProfiles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(userProfiles.length / batchSize);

    console.log(`\nBatch ${batchNum}/${totalBatches}: Generating ${batch.map(p => p.name).join(', ')}...`);

    // Generate all interviews in this batch concurrently
    const results = await Promise.all(
      batch.map(async (profile) => {
        const interview = await generateInterview(profile);
        return { profile, interview };
      })
    );

    // Save all results from this batch
    for (const { profile, interview } of results) {
      if (interview) {
        const filename = `${profile.name.toLowerCase()}_interview.json`;
        const filepath = path.join(transcriptsDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(interview, null, 2));
        console.log(`  ✓ Saved ${filename}`);
      } else {
        console.log(`  ✗ Failed to generate interview for ${profile.name}`);
      }
    }

    // Delay between batches to avoid rate limiting
    if (i + batchSize < userProfiles.length) {
      console.log('  Waiting before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\nDone!');
}

main();
