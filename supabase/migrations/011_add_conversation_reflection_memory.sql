-- Add reflection_memory column to conversations table
-- This stores extracted insights from simulated campaign conversations

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS reflection_memory JSONB DEFAULT NULL;

-- Create index for reflection_memory queries
CREATE INDEX IF NOT EXISTS conversations_reflection_memory_idx ON conversations USING gin(reflection_memory);
