-- Remove modality column from campaigns table
ALTER TABLE campaigns DROP COLUMN IF EXISTS modality;
