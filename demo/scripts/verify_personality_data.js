const { createClient } = require('@supabase/supabase-js');

// Initialize client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPersonalityData() {
  console.log('Fetching interviews with personality data...\n');

  // Fetch a sample of interviews
  const { data: interviews, error } = await supabase
    .from('interviews')
    .select('id, name, personality')
    .not('personality', 'is', null)
    .limit(10);

  if (error) {
    console.error('Error fetching interviews:', error.message);
    process.exit(1);
  }

  console.log(`Found ${interviews.length} interviews with personality data\n`);

  // Display scores for each
  for (const interview of interviews) {
    const personality = interview.personality;
    const scores = personality?.scores;

    if (scores) {
      // Scores are already in 0-5 scale
      const format = (score) => typeof score === 'number' ? score.toFixed(2) : score;

      console.log(`${interview.name}:`);
      console.log(`  Scores (0-5): E=${format(scores.extroversion)} A=${format(scores.agreeableness)} C=${format(scores.conscientiousness)} N=${format(scores.neuroticism)} O=${format(scores.openness)}`);
      console.log('');
    } else {
      console.log(`${interview.name}: No scores found`);
      console.log(`  personality object: ${JSON.stringify(personality).substring(0, 100)}...`);
      console.log('');
    }
  }

  // Check table columns
  console.log('\n=== Checking for unused columns ===');
  const { data: sampleRow } = await supabase
    .from('interviews')
    .select('*')
    .limit(1)
    .single();

  if (sampleRow) {
    const columns = Object.keys(sampleRow);
    console.log(`\nAll columns in interviews table (${columns.length}):`);
    console.log(columns.join(', '));

    // Check for potentially unused columns
    const potentiallyUnused = ['participant_name', 'participant_email', 'race', 'hometown', 'primary_app', 'other_apps', 'sentiments'];
    const unusedFound = potentiallyUnused.filter(col => columns.includes(col));

    if (unusedFound.length > 0) {
      console.log(`\nPotentially unused columns found: ${unusedFound.join(', ')}`);
      console.log('Run the cleanup SQL migration to remove these.');
    } else {
      console.log('\nNo obviously unused columns detected.');
    }
  }
}

verifyPersonalityData().catch(console.error);
