const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  // Get a sample row to see all columns
  const { data, error } = await supabase
    .from('campaign_analyses')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('=== CAMPAIGN_ANALYSES TABLE COLUMNS ===\n');
    console.log(Object.keys(data[0]).join(', '));
    console.log('\n=== SAMPLE ROW ===\n');
    console.log(JSON.stringify(data[0], null, 2));
  }
}

checkSchema();
