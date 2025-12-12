-- Fix swarm_sessions status check constraint to include 'generating_consensus'
ALTER TABLE swarm_sessions DROP CONSTRAINT IF EXISTS swarm_sessions_status_check;
ALTER TABLE swarm_sessions ADD CONSTRAINT swarm_sessions_status_check
    CHECK (status IN ('active', 'completed', 'terminated', 'error', 'generating_consensus'));
