const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.log('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Fixed Duolingo Demo workspace UUID
const DUOLINGO_DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

async function seedDuolingoInterviews() {
  console.log('Seeding Duolingo Demo interviews...\n');

  // Verify workspace exists
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', DUOLINGO_DEMO_WORKSPACE_ID)
    .single();

  if (wsError || !workspace) {
    console.error('Duolingo Demo workspace not found. Please run the SQL migration first.');
    console.log('Expected workspace ID:', DUOLINGO_DEMO_WORKSPACE_ID);
    process.exit(1);
  }

  console.log(`Found workspace: ${workspace.name} (${workspace.id})\n`);

  // Load agent metadata
  const metadataPath = path.join(__dirname, '..', 'agent_metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  console.log(`Loaded metadata for ${metadata.length} agents\n`);

  // Load all transcripts
  const transcriptsDir = path.join(__dirname, '..', 'transcripts');
  const transcriptFiles = fs.readdirSync(transcriptsDir).filter(f => f.endsWith('.json'));

  console.log(`Found ${transcriptFiles.length} transcript files\n`);

  // Create a map of metadata by name (case-insensitive)
  const metadataByName = {};
  metadata.forEach(m => {
    metadataByName[m.name.toLowerCase()] = m;
  });

  // Process each transcript
  const interviews = [];
  for (const file of transcriptFiles) {
    const transcriptPath = path.join(transcriptsDir, file);
    const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));

    // Find matching metadata
    const name = transcript.user_name;
    const meta = metadataByName[name.toLowerCase()] || {};

    // Build interview object using workspace_id
    const interview = {
      workspace_id: DUOLINGO_DEMO_WORKSPACE_ID,
      campaign_id: null,
      user_id: null, // Demo data has no user_id

      // From transcript
      name: name,
      summary: transcript.summary || '',
      top_quotes: transcript.top_quotes || [],
      transcript: transcript.interview_script || [],

      // From metadata
      age: meta.age || null,
      gender: meta.gender || null,
      race: meta.race || null,
      hometown: meta.hometown || null,
      occupation: meta.occupation || null,
      country: meta.country || null,
      primary_app: meta.primaryApp || null,
      other_apps: meta.otherApps || [],
      learning_language: meta.learningLanguage || null,
      learning_goal: meta.learningGoal || null,
      sentiments: meta.sentiments || {},
      usage_frequency: meta.usageFrequency || null,
      is_premium_user: meta.isPremiumUser || false,
      personality: meta.personality || [],
      pain_points: meta.painPoints || [],
      value_props: meta.valueProps || []
    };

    interviews.push(interview);
  }

  console.log(`Prepared ${interviews.length} interviews for insertion\n`);

  // Check if interviews already exist
  const { data: existingInterviews, error: checkError } = await supabase
    .from('interviews')
    .select('id, name')
    .eq('workspace_id', DUOLINGO_DEMO_WORKSPACE_ID);

  if (checkError) {
    console.error('Error checking existing interviews:', checkError.message);
    process.exit(1);
  }

  if (existingInterviews && existingInterviews.length > 0) {
    console.log(`Found ${existingInterviews.length} existing Duolingo Demo interviews.`);

    const shouldContinue = process.argv.includes('--force');
    if (!shouldContinue) {
      console.log('Use --force flag to delete existing data and re-seed.');
      console.log('Example: node seed_duolingo_interviews.js --force');
      process.exit(0);
    }

    // Delete existing interviews
    console.log('Deleting existing Duolingo Demo interviews...');
    const { error: deleteError } = await supabase
      .from('interviews')
      .delete()
      .eq('workspace_id', DUOLINGO_DEMO_WORKSPACE_ID);

    if (deleteError) {
      console.error('Error deleting existing interviews:', deleteError.message);
      process.exit(1);
    }
    console.log('Deleted existing interviews.\n');
  }

  // Insert interviews in batches of 10
  const batchSize = 10;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < interviews.length; i += batchSize) {
    const batch = interviews.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('interviews')
      .insert(batch);

    if (insertError) {
      console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, insertError.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(interviews.length / batchSize)} (${batch.length} interviews)`);
    }
  }

  console.log(`\nSeeding complete!`);
  console.log(`Successfully inserted: ${successCount} interviews`);
  if (errorCount > 0) {
    console.log(`Failed to insert: ${errorCount} interviews`);
  }

  // Verify the data
  const { data: verifyData, error: verifyError } = await supabase
    .from('interviews')
    .select('id, name')
    .eq('workspace_id', DUOLINGO_DEMO_WORKSPACE_ID);

  if (verifyError) {
    console.error('Error verifying data:', verifyError.message);
  } else {
    console.log(`\nVerification: ${verifyData.length} Duolingo Demo interviews in database`);
  }
}

// Run the seed
seedDuolingoInterviews().catch(console.error);
