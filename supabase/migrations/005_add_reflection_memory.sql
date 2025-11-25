-- Add reflection_memory column to interviews table
ALTER TABLE interviews
ADD COLUMN IF NOT EXISTS reflection_memory JSONB DEFAULT NULL;

-- Create index for reflection_memory queries
CREATE INDEX IF NOT EXISTS interviews_reflection_memory_idx ON interviews USING gin(reflection_memory);
