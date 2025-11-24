-- Cleanup interviews table: Remove unused columns
-- Run this in Supabase SQL Editor

-- Drop unused columns (participant_name, participant_email if they exist)
ALTER TABLE interviews DROP COLUMN IF EXISTS participant_name;
ALTER TABLE interviews DROP COLUMN IF EXISTS participant_email;

-- Also drop other potentially unused columns (uncomment if needed)
-- ALTER TABLE interviews DROP COLUMN IF EXISTS race;
-- ALTER TABLE interviews DROP COLUMN IF EXISTS hometown;
-- ALTER TABLE interviews DROP COLUMN IF EXISTS primary_app;
-- ALTER TABLE interviews DROP COLUMN IF EXISTS other_apps;
-- ALTER TABLE interviews DROP COLUMN IF EXISTS sentiments;

-- Verify the personality column structure
-- This query shows a sample of personality data to verify it's correct
SELECT
  id,
  name,
  personality->'scores'->'extroversion' as extroversion,
  personality->'scores'->'agreeableness' as agreeableness,
  personality->'scores'->'conscientiousness' as conscientiousness,
  personality->'scores'->'neuroticism' as neuroticism,
  personality->'scores'->'openness' as openness,
  personality->>'generated_at' as generated_at
FROM interviews
WHERE personality->'scores' IS NOT NULL
LIMIT 10;

-- If you need to see all column names in the table:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'interviews';
