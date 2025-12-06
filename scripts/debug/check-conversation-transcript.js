const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConversation() {
  // Get a conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', '16aa0c51-f1fe-4c31-a14c-546fce883e12')
    .single();

  if (!conversation) {
    console.log('Conversation not found');
    return;
  }

  console.log('=== CONVERSATION TRANSCRIPT ===\n');
  console.log('Conversation ID:', conversation.id);
  console.log('Campaign ID:', conversation.campaign_id);
  console.log('Source Interview ID:', conversation.source_interview_id);
  console.log('Status:', conversation.status);
  console.log('\nTranscript structure:', conversation.transcript ? 'EXISTS' : 'MISSING');

  if (conversation.transcript) {
    console.log('Transcript length:', conversation.transcript.length);
    console.log('\n=== FIRST 5 BLOCKS ===\n');
    conversation.transcript.slice(0, 5).forEach((block, idx) => {
      console.log(`Block ${idx}:`);
      console.log(JSON.stringify(block, null, 2));
      console.log('---');
    });
  }
}

checkConversation();
