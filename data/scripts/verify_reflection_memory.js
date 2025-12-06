const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyReflectionMemory() {
  console.log('Checking reflection memory status...\n');

  // Get total count
  const { count: totalCount, error: totalError } = await supabase
    .from('interviews')
    .select('*', { count: 'exact', head: true });

  if (totalError) {
    console.error('Error fetching total count:', totalError.message);
    process.exit(1);
  }

  // Get count with reflection_memory
  const { count: withMemoryCount, error: memoryError } = await supabase
    .from('interviews')
    .select('*', { count: 'exact', head: true })
    .not('reflection_memory', 'is', null);

  if (memoryError) {
    console.error('Error fetching memory count:', memoryError.message);
    process.exit(1);
  }

  // Get count without reflection_memory
  const { count: withoutMemoryCount, error: noMemoryError } = await supabase
    .from('interviews')
    .select('*', { count: 'exact', head: true })
    .is('reflection_memory', null);

  if (noMemoryError) {
    console.error('Error fetching no-memory count:', noMemoryError.message);
    process.exit(1);
  }

  console.log('========================================');
  console.log('REFLECTION MEMORY STATUS');
  console.log('========================================');
  console.log(`Total interviews: ${totalCount}`);
  console.log(`With reflection memory: ${withMemoryCount}`);
  console.log(`Without reflection memory: ${withoutMemoryCount}`);
  console.log('========================================\n');

  if (withoutMemoryCount > 0) {
    console.log('Fetching interviews without reflection memory...');
    const { data: missing, error: missingError } = await supabase
      .from('interviews')
      .select('id, name')
      .is('reflection_memory', null);

    if (!missingError && missing) {
      console.log('\nMissing reflection memory:');
      missing.forEach(interview => {
        console.log(`  - ${interview.name} (${interview.id})`);
      });
    }
  } else {
    console.log('✓ All interviews have reflection memory!');
  }

  // Sample one reflection memory to show structure
  console.log('\nFetching sample reflection memory...');
  const { data: sample, error: sampleError } = await supabase
    .from('interviews')
    .select('name, reflection_memory')
    .not('reflection_memory', 'is', null)
    .limit(1)
    .single();

  if (!sampleError && sample) {
    console.log(`\nSample from: ${sample.name}`);
    console.log('========================================');
    console.log(JSON.stringify(sample.reflection_memory, null, 2));
  }
}

verifyReflectionMemory().catch(console.error);
