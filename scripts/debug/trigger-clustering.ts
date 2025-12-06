/**
 * Trigger clustering for a campaign and save to database
 * Run with: npx tsx scripts/trigger-clustering.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { runClustering } from '../../lib/engines/clustering-engine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CAMPAIGN_ID = '1aaab4d3-6d8f-4bfa-ae4c-a9ff2606610e';

async function main() {
  console.log('=== Triggering LLM-Based Clustering ===\n');
  console.log(`Campaign ID: ${CAMPAIGN_ID}\n`);

  try {
    // Get next version number
    const { data: existing } = await supabase
      .from('campaign_clusters')
      .select('version_number')
      .eq('campaign_id', CAMPAIGN_ID)
      .order('version_number', { ascending: false })
      .limit(1);

    const versionNumber = (existing?.[0]?.version_number || 0) + 1;
    console.log(`Creating cluster version ${versionNumber}...\n`);

    // Run clustering
    const result = await runClustering(CAMPAIGN_ID, null);

    // Save to database
    const { data: cluster, error } = await supabase
      .from('campaign_clusters')
      .insert({
        campaign_id: CAMPAIGN_ID,
        analysis_id: null,
        version_number: versionNumber,
        dimension: result.dimension,
        dimension_rationale: result.dimension_rationale,
        status: 'completed',
        conversations_analyzed: result.clusters.reduce((sum, c) => sum + c.count, 0),
        clusters_json: { clusters: result.clusters },
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save clusters: ${error.message}`);
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('                    CLUSTERING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Cluster ID: ${cluster.id}`);
    console.log(`Total clusters: ${result.clusters.length}\n`);

    result.clusters.forEach((c) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📊 Cluster ${c.cluster_id}: ${c.label}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`💬 "${c.quote}"`);
      console.log(`👥 ${c.count} participants (${c.percentage}%) - ${c.prevalence} Prevalence`);
      console.log(`📝 ${c.description}`);
      console.log();
    });

    console.log('\nClustering complete! Results saved to database.');
  } catch (error: any) {
    console.error('Clustering failed:', error.message);
    process.exit(1);
  }
}

main();
