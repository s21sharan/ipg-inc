-- Add columns to track batch processing
ALTER TABLE campaign_analyses
ADD COLUMN IF NOT EXISTS batch_processing JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS total_batches INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS completed_batches INTEGER DEFAULT 0;

-- batch_processing structure:
-- {
--   "batches": [
--     {
--       "batch_id": "batch_xxx",
--       "status": "pending|processing|completed|failed",
--       "conversation_start": 0,
--       "conversation_end": 50,
--       "error": "error message if failed"
--     }
--   ],
--   "merge_batch_id": "batch_yyy",
--   "merge_status": "pending|processing|completed|failed"
-- }

COMMENT ON COLUMN campaign_analyses.batch_processing IS 'Tracks individual batch jobs and merge status';
COMMENT ON COLUMN campaign_analyses.total_batches IS 'Total number of conversation batches to process';
COMMENT ON COLUMN campaign_analyses.completed_batches IS 'Number of completed batches';
