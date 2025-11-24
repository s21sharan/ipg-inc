-- Create interviews table
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace TEXT NOT NULL DEFAULT 'personal',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Interviewee info
  name TEXT NOT NULL,
  summary TEXT,
  top_quotes JSONB DEFAULT '[]'::jsonb,
  transcript JSONB DEFAULT '[]'::jsonb,

  -- Metadata/demographics
  age INTEGER,
  gender TEXT,
  race TEXT,
  hometown TEXT,
  occupation TEXT,
  country TEXT,

  -- Duolingo-specific fields (can be extended for other workspaces)
  primary_app TEXT,
  other_apps JSONB DEFAULT '[]'::jsonb,
  learning_language TEXT,
  learning_goal TEXT,
  sentiments JSONB DEFAULT '{}'::jsonb,
  usage_frequency TEXT,
  is_premium_user BOOLEAN DEFAULT FALSE,
  personality JSONB DEFAULT '[]'::jsonb,
  pain_points JSONB DEFAULT '[]'::jsonb,
  value_props JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS interviews_workspace_idx ON interviews(workspace);
CREATE INDEX IF NOT EXISTS interviews_user_id_idx ON interviews(user_id);
CREATE INDEX IF NOT EXISTS interviews_campaign_id_idx ON interviews(campaign_id);
CREATE INDEX IF NOT EXISTS interviews_created_at_idx ON interviews(created_at DESC);

-- Enable Row Level Security
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- Create policies

-- Users can view their own interviews
CREATE POLICY "Users can view their own interviews"
  ON interviews
  FOR SELECT
  USING (auth.uid() = user_id);

-- All authenticated users can view duolingo-demo workspace interviews
CREATE POLICY "All users can view duolingo-demo interviews"
  ON interviews
  FOR SELECT
  USING (workspace = 'duolingo-demo');

-- Users can insert their own interviews
CREATE POLICY "Users can insert their own interviews"
  ON interviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR workspace = 'duolingo-demo');

-- Users can update their own interviews
CREATE POLICY "Users can update their own interviews"
  ON interviews
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own interviews
CREATE POLICY "Users can delete their own interviews"
  ON interviews
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_interviews_updated_at
  BEFORE UPDATE ON interviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
