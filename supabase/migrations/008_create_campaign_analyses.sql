-- Create campaign_analyses table for storing versioned analysis results
CREATE TABLE IF NOT EXISTS campaign_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  batch_id TEXT, -- OpenAI batch ID for tracking
  conversations_analyzed INTEGER NOT NULL DEFAULT 0,
  report_markdown TEXT,
  dashboard_json JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(campaign_id, version_number)
);

-- Create indexes for efficient queries
CREATE INDEX idx_campaign_analyses_campaign ON campaign_analyses(campaign_id);
CREATE INDEX idx_campaign_analyses_status ON campaign_analyses(status);
CREATE INDEX idx_campaign_analyses_batch ON campaign_analyses(batch_id) WHERE batch_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE campaign_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view analyses for campaigns they own
CREATE POLICY "Users can view their own campaign analyses"
  ON campaign_analyses
  FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert analyses for campaigns they own
CREATE POLICY "Users can create analyses for their own campaigns"
  ON campaign_analyses
  FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update analyses for campaigns they own
CREATE POLICY "Users can update their own campaign analyses"
  ON campaign_analyses
  FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );
