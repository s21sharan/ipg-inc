const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStructure() {
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

  console.log('=== CONVERSATION DATA ===\n');
  console.log('ID:', conversation.id);
  console.log('Source Interview ID:', conversation.source_interview_id);
  console.log('Has transcript:', conversation.transcript ? 'Yes' : 'No');

  if (conversation.transcript) {
    console.log('Transcript length:', conversation.transcript.length);
    console.log('\n=== FIRST 3 BLOCKS ===\n');
    conversation.transcript.slice(0, 3).forEach((block, idx) => {
      console.log(`Block ${idx}:`);
      console.log(JSON.stringify(block, null, 2));
      console.log('---');
    });
  }

  // Get the source interview
  const { data: interview } = await supabase
    .from('interviews')
    .select('*')
    .eq('id', conversation.source_interview_id)
    .single();

  if (interview) {
    console.log('\n=== SOURCE INTERVIEW DATA ===\n');
    console.log('Name:', interview.name);
    console.log('Has transcript:', interview.transcript ? 'Yes' : 'No');

    if (interview.transcript) {
      console.log('Transcript length:', interview.transcript.length);
      console.log('\n=== FIRST 3 BLOCKS ===\n');
      interview.transcript.slice(0, 3).forEach((block, idx) => {
        console.log(`Block ${idx}:`);
        console.log(JSON.stringify(block, null, 2));
        console.log('---');
      });
    }
  }
}

checkStructure();
