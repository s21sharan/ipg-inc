const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateClusterDescriptions() {
  // First check all campaigns with "Why Aren't You Upgrading" title
  const { data: campaigns, error: campError } = await supabase
    .from('campaigns')
    .select('id, name, title')
    .ilike('title', '%Why%Aren%Upgrading%');

  console.log('Campaigns matching title:', campaigns);

  // Also check all cluster records
  const { data: allClusterRecords } = await supabase
    .from('campaign_clusters')
    .select('id, campaign_id, status, version_number')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\nRecent cluster records:', allClusterRecords);

  // Find the correct campaign ID
  const campaignId = campaigns?.[0]?.id || '171d899d-172c-44c7-8453-5d9234584143';
  console.log('\nUsing campaign ID:', campaignId);

  // First check what clusters exist
  const { data: allClusters, error: checkError } = await supabase
    .from('campaign_clusters')
    .select('id, campaign_id, status, version_number')
    .eq('campaign_id', campaignId);

  console.log('Clusters for campaign:', allClusters);

  // Fetch current cluster data - try without status filter
  const { data: cluster, error } = await supabase
    .from('campaign_clusters')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching cluster:', error);
    return;
  }

  console.log('Current clusters:');
  const clusters = cluster.clusters_json?.clusters || [];
  clusters.forEach(c => {
    console.log(`\n${c.label}:`);
    console.log(`  Description: ${c.description}`);
    console.log(`  Count: ${c.count}`);
  });

  // Update with shorter descriptions (max ~55 chars to fit in one line)
  const updatedClusters = clusters.map(c => {
    let newDescription = c.description;

    switch(c.label) {
      case 'Premium Value Uncertainty':
        newDescription = 'Users hesitate to upgrade due to unclear premium value.';
        break;
      case 'Practical Application Focus':
        newDescription = 'Users want real-world skills over gamified learning.';
        break;
      case 'Cultural Context Desire':
        newDescription = 'Users seek deeper cultural context and nuance.';
        break;
      case 'Personalization and Flexibility':
        newDescription = 'Users want customizable paths and flexible pacing.';
        break;
    }

    return { ...c, description: newDescription };
  });

  // Update in database
  const { error: updateError } = await supabase
    .from('campaign_clusters')
    .update({
      clusters_json: { clusters: updatedClusters }
    })
    .eq('id', cluster.id);

  if (updateError) {
    console.error('Error updating:', updateError);
    return;
  }

  console.log('\n\nUpdated descriptions:');
  updatedClusters.forEach(c => {
    console.log(`${c.label}: "${c.description}" (${c.description.length} chars)`);
  });

  console.log('\nDone!');
}

updateClusterDescriptions();
