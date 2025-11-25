-- Add simulation status tracking to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS simulation_status TEXT DEFAULT 'idle' CHECK (simulation_status IN ('idle', 'running', 'stopped', 'completed')),
ADD COLUMN IF NOT EXISTS simulation_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS simulation_stopped_at TIMESTAMP WITH TIME ZONE;

-- Create index for simulation queries
CREATE INDEX IF NOT EXISTS campaigns_simulation_status_idx ON campaigns(simulation_status);

-- Add cancelled status to conversations
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE conversations
ADD CONSTRAINT conversations_status_check
CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled'));
