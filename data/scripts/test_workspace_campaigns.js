const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.log('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testWorkspaceCampaigns() {
  console.log('Testing workspace-specific campaigns...\n');

  // Test data
  const testUserId = process.argv[2];

  if (!testUserId) {
    console.log('Usage: node test_workspace_campaigns.js <user_id>');
    console.log('\nTo get your user_id, run this SQL in Supabase:');
    console.log("SELECT id FROM auth.users WHERE email = 'your-email@example.com';");
    process.exit(1);
  }

  // Test campaigns for different workspaces
  const testCampaigns = [
    {
      user_id: testUserId,
      name: 'Personal Test Campaign',
      title: 'Test Personal Campaign',
      caption: 'This is a test campaign for personal workspace',
      modality: 'Audio + Video',
      time_estimate: '5 mins',
      topics: [
        { id: '1', name: 'Kickoff', type: 'statement', content: 'Welcome!' },
        { id: '2', name: 'Signoff', type: 'statement', content: 'Thank you!' }
      ],
      completion_logic: {
        completionAction: 'Show Message',
        completionMessage: 'Thanks for completing!',
        completionUrl: '',
        earlyExitAction: 'Show Message',
        exitMessage: 'See you next time!',
        exitUrl: ''
      },
      workspace: 'personal'
    },
    {
      user_id: testUserId,
      name: 'Duolingo Retention Study',
      title: 'Duolingo User Retention',
      caption: 'Understanding why users stop using Duolingo',
      modality: 'Audio + Video',
      time_estimate: '10 mins',
      topics: [
        { id: '1', name: 'Kickoff', type: 'statement', content: 'Thanks for joining our Duolingo study!' },
        { id: '2', name: 'Usage Patterns', type: 'question', question: 'How often do you use Duolingo?' },
        { id: '3', name: 'Signoff', type: 'statement', content: 'Thank you for your feedback!' }
      ],
      completion_logic: {
        completionAction: 'Show Message',
        completionMessage: 'Your feedback helps us improve!',
        completionUrl: '',
        earlyExitAction: 'Show Message',
        exitMessage: 'Thanks anyway!',
        exitUrl: ''
      },
      workspace: 'duolingo-demo'
    },
    {
      user_id: testUserId,
      name: 'Duolingo Feature Feedback',
      title: 'New Feature Testing',
      caption: 'Getting feedback on potential new features',
      modality: 'Audio',
      time_estimate: '7 mins',
      topics: [
        { id: '1', name: 'Kickoff', type: 'statement', content: 'Help us design better features!' },
        { id: '2', name: 'Feature Ideas', type: 'conversation', persona: 'Product researcher' },
        { id: '3', name: 'Signoff', type: 'statement', content: 'Thanks for your ideas!' }
      ],
      completion_logic: {
        completionAction: 'Redirect',
        completionMessage: '',
        completionUrl: 'https://duolingo.com',
        earlyExitAction: 'Show Message',
        exitMessage: 'Come back anytime!',
        exitUrl: ''
      },
      workspace: 'duolingo-demo'
    }
  ];

  // Insert test campaigns
  console.log('Inserting test campaigns...\n');

  for (const campaign of testCampaigns) {
    const { data, error } = await supabase
      .from('campaigns')
      .insert(campaign)
      .select();

    if (error) {
      console.error(`Error inserting campaign "${campaign.name}":`, error.message);
    } else {
      console.log(`✓ Created: ${campaign.name} (workspace: ${campaign.workspace})`);
    }
  }

  // Verify campaigns by workspace
  console.log('\n--- Verifying campaigns by workspace ---\n');

  // Check personal workspace
  const { data: personalCampaigns, error: personalError } = await supabase
    .from('campaigns')
    .select('name, workspace')
    .eq('workspace', 'personal')
    .eq('user_id', testUserId);

  if (personalError) {
    console.error('Error fetching personal campaigns:', personalError.message);
  } else {
    console.log(`Personal Workspace campaigns (${personalCampaigns.length}):`);
    personalCampaigns.forEach(c => console.log(`  - ${c.name}`));
  }

  // Check duolingo-demo workspace
  const { data: duolingoCampaigns, error: duolingoError } = await supabase
    .from('campaigns')
    .select('name, workspace')
    .eq('workspace', 'duolingo-demo')
    .eq('user_id', testUserId);

  if (duolingoError) {
    console.error('Error fetching duolingo-demo campaigns:', duolingoError.message);
  } else {
    console.log(`\nDuolingo Demo workspace campaigns (${duolingoCampaigns.length}):`);
    duolingoCampaigns.forEach(c => console.log(`  - ${c.name}`));
  }

  console.log('\n✓ Test complete!');
  console.log('\nNote: You may need to add the "workspace" column to your campaigns table:');
  console.log('ALTER TABLE campaigns ADD COLUMN workspace TEXT DEFAULT \'personal\';');
}

// Run tests
testWorkspaceCampaigns().catch(console.error);
