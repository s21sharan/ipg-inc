-- Swarm sessions table
CREATE TABLE IF NOT EXISTS swarm_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated', 'error', 'generating_consensus')),
    config JSONB NOT NULL DEFAULT '{}',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Swarm participants (link between swarm and interviews/agents)
CREATE TABLE IF NOT EXISTS swarm_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID NOT NULL REFERENCES swarm_sessions(id) ON DELETE CASCADE,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    message_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Swarm messages (conversation log)
CREATE TABLE IF NOT EXISTS swarm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID NOT NULL REFERENCES swarm_sessions(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    speaker_id TEXT NOT NULL,
    speaker_name TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'response',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consensus summaries (generated after swarm completion)
CREATE TABLE IF NOT EXISTS consensus_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swarm_id UUID NOT NULL REFERENCES swarm_sessions(id) ON DELETE CASCADE,
    key_insights JSONB NOT NULL DEFAULT '[]',
    areas_of_agreement JSONB NOT NULL DEFAULT '[]',
    areas_of_disagreement JSONB NOT NULL DEFAULT '[]',
    synthesized_conclusion TEXT NOT NULL,
    actionable_items JSONB NOT NULL DEFAULT '[]',
    confidence_score FLOAT NOT NULL DEFAULT 0.0,
    consensus_strength TEXT NOT NULL DEFAULT 'moderate',
    critic_evaluation JSONB NOT NULL DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(swarm_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_swarm_participants_swarm ON swarm_participants(swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_messages_swarm ON swarm_messages(swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_messages_turn ON swarm_messages(swarm_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_consensus_swarm ON consensus_summaries(swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_sessions_status ON swarm_sessions(status);
