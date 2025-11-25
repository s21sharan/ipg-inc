-- Create conversations table for campaign simulation results
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,

  -- Denormalized for easy display
  participant_name TEXT NOT NULL,

  -- Conversation data
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  topics_covered JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS conversations_campaign_id_idx ON conversations(campaign_id);
CREATE INDEX IF NOT EXISTS conversations_source_interview_id_idx ON conversations(source_interview_id);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations(status);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can view conversations for campaigns they own
CREATE POLICY "Users can view their campaign conversations"
  ON conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = conversations.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Users can insert conversations for their own campaigns
CREATE POLICY "Users can insert their campaign conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = conversations.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Users can update their campaign conversations
CREATE POLICY "Users can update their campaign conversations"
  ON conversations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = conversations.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Users can delete their campaign conversations
CREATE POLICY "Users can delete their campaign conversations"
  ON conversations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = conversations.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
