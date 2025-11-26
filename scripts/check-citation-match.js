const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCitations() {
  // Get the v2 analysis
  const { data: analysis } = await supabase
    .from('campaign_analyses')
    .select('*')
    .eq('version_number', 2)
    .single();

  if (!analysis || !analysis.report_markdown) {
    console.log('No analysis found');
    return;
  }

  console.log('=== CHECKING CITATIONS ===\n');

  // Extract a few citations from the report
  const citationRegex = /\[INT:([^\|]+)\|BLK:([^\]]+)\]/g;
  const citations = [];
  let match;
  let count = 0;

  while ((match = citationRegex.exec(analysis.report_markdown)) !== null && count < 5) {
    citations.push({
      interviewId: match[1],
      blockId: match[2],
      fullMatch: match[0],
    });
    count++;
  }

  console.log(`Found ${citations.length} citations to check:\n`);

  // Check each citation
  for (const citation of citations) {
    console.log(`\n--- Citation: ${citation.fullMatch} ---`);

    // Try to find as conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', citation.interviewId)
      .single();

    if (conversation) {
      console.log(`✓ Found conversation: ${conversation.id}`);

      // Get interview data
      const { data: interview } = await supabase
        .from('interviews')
        .select('*')
        .eq('id', conversation.source_interview_id)
        .single();

      if (interview) {
        console.log(`  Interview: ${interview.name}`);
        console.log(`  Has transcript: ${interview.transcript ? 'Yes' : 'No'}`);

        if (interview.transcript) {
          console.log(`  Total blocks: ${interview.transcript.length}`);

          // Find the specific block
          const block = interview.transcript.find(b => b.id === parseInt(citation.blockId));

          if (block) {
            console.log(`  ✓ Block ${citation.blockId} found!`);
            console.log(`  Question: ${block.question?.substring(0, 100)}...`);
            console.log(`  Answer: ${block.answer?.substring(0, 100)}...`);
          } else {
            console.log(`  ✗ Block ${citation.blockId} NOT FOUND`);
            console.log(`  Available block IDs: ${interview.transcript.map(b => b.id).join(', ')}`);
          }
        }
      }
    } else {
      console.log(`✗ Conversation not found, trying as interview...`);

      // Try as interview
      const { data: interview } = await supabase
        .from('interviews')
        .select('*')
        .eq('id', citation.interviewId)
        .single();

      if (interview) {
        console.log(`  ✓ Found interview: ${interview.name}`);
        console.log(`  Has transcript: ${interview.transcript ? 'Yes' : 'No'}`);

        if (interview.transcript) {
          const block = interview.transcript.find(b => b.id === parseInt(citation.blockId));

          if (block) {
            console.log(`  ✓ Block ${citation.blockId} found!`);
            console.log(`  Question: ${block.question?.substring(0, 100)}...`);
            console.log(`  Answer: ${block.answer?.substring(0, 100)}...`);
          } else {
            console.log(`  ✗ Block ${citation.blockId} NOT FOUND`);
          }
        }
      } else {
        console.log(`  ✗ Interview not found either`);
      }
    }
  }
}

checkCitations();
