-- Create campaign_clusters table for storing versioned clustering results
CREATE TABLE IF NOT EXISTS campaign_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES campaign_analyses(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL,

  -- Clustering configuration
  dimension TEXT NOT NULL, -- 'pain_points', 'goals', 'motivations', 'attitudes'
  dimension_rationale TEXT,
  num_clusters INTEGER NOT NULL DEFAULT 4,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'embedding', 'clustering', 'labeling', 'completed', 'failed')),
  batch_id TEXT,

  -- Results
  clusters_json JSONB,
  -- Structure: { clusters: [{ cluster_id, label, quote, description, count, percentage, confidence, prevalence, members }] }

  -- Metadata
  conversations_analyzed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(campaign_id, version_number)
);

-- Create indexes for efficient queries
CREATE INDEX idx_campaign_clusters_campaign ON campaign_clusters(campaign_id);
CREATE INDEX idx_campaign_clusters_status ON campaign_clusters(status);
CREATE INDEX idx_campaign_clusters_batch ON campaign_clusters(batch_id) WHERE batch_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE campaign_clusters ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view clusters for campaigns they own
CREATE POLICY "Users can view their own campaign clusters"
  ON campaign_clusters
  FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert clusters for campaigns they own
CREATE POLICY "Users can create clusters for their own campaigns"
  ON campaign_clusters
  FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update clusters for campaigns they own
CREATE POLICY "Users can update their own campaign clusters"
  ON campaign_clusters
  FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );
