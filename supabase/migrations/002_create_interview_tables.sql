-- Create interviews table
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  participant_name TEXT,
  participant_email TEXT,
  status TEXT DEFAULT 'initialized' CHECK (status IN ('initialized', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  current_topic_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create transcript_entries table
CREATE TABLE IF NOT EXISTS transcript_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL CHECK (speaker IN ('agent', 'participant', 'system')),
  text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  topic_id TEXT,
  audio_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create digital_twin_profiles table
CREATE TABLE IF NOT EXISTS digital_twin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_interviews_campaign_id ON interviews(campaign_id);
CREATE INDEX idx_interviews_status ON interviews(status);
CREATE INDEX idx_transcript_entries_interview_id ON transcript_entries(interview_id);
CREATE INDEX idx_transcript_entries_timestamp ON transcript_entries(timestamp);
CREATE INDEX idx_digital_twin_profiles_interview_id ON digital_twin_profiles(interview_id);

-- Enable Row Level Security
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_twin_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for interviews table
CREATE POLICY "Interviews are viewable by everyone" ON interviews
  FOR SELECT USING (true);

CREATE POLICY "Interviews can be created by anyone" ON interviews
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Interviews can be updated by anyone" ON interviews
  FOR UPDATE USING (true);

-- Create policies for transcript_entries table
CREATE POLICY "Transcripts are viewable by everyone" ON transcript_entries
  FOR SELECT USING (true);

CREATE POLICY "Transcripts can be created by anyone" ON transcript_entries
  FOR INSERT WITH CHECK (true);

-- Create policies for digital_twin_profiles table
CREATE POLICY "Profiles are viewable by everyone" ON digital_twin_profiles
  FOR SELECT USING (true);

CREATE POLICY "Profiles can be created by anyone" ON digital_twin_profiles
  FOR INSERT WITH CHECK (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();