-- Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create workspace_members table for multi-user access
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Add workspace_id to campaigns table
ALTER TABLE campaigns
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Create index on workspace_id for faster queries
CREATE INDEX IF NOT EXISTS campaigns_workspace_id_idx ON campaigns(workspace_id);

-- Create interview_responses table to persist interview data
CREATE TABLE IF NOT EXISTS interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  conversation_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  topic_index INTEGER NOT NULL,
  topic_name TEXT,
  user_message TEXT NOT NULL,
  ai_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for interview_responses
CREATE INDEX IF NOT EXISTS interview_responses_workspace_id_idx ON interview_responses(workspace_id);
CREATE INDEX IF NOT EXISTS interview_responses_campaign_id_idx ON interview_responses(campaign_id);
CREATE INDEX IF NOT EXISTS interview_responses_session_id_idx ON interview_responses(session_id);
CREATE INDEX IF NOT EXISTS interview_responses_created_at_idx ON interview_responses(created_at DESC);

-- Enable Row Level Security on new tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_responses ENABLE ROW LEVEL SECURITY;

-- Workspaces RLS Policies
-- Users can view workspaces they own or are members of
CREATE POLICY "Users can view their workspaces"
  ON workspaces
  FOR SELECT
  USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
    )
  );

-- Users can create workspaces
CREATE POLICY "Users can create workspaces"
  ON workspaces
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Only owners can update workspaces
CREATE POLICY "Owners can update their workspaces"
  ON workspaces
  FOR UPDATE
  USING (auth.uid() = owner_id);

-- Only owners can delete workspaces
CREATE POLICY "Owners can delete their workspaces"
  ON workspaces
  FOR DELETE
  USING (auth.uid() = owner_id);

-- Workspace Members RLS Policies
-- Users can view members of workspaces they own or are members of
CREATE POLICY "Users can view workspace members"
  ON workspace_members
  FOR SELECT
  USING (
    -- User is viewing their own membership
    user_id = auth.uid()
    OR
    -- User owns the workspace
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_members.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Workspace owners can add members
CREATE POLICY "Workspace owners can add members"
  ON workspace_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_members.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Workspace owners can update member roles
CREATE POLICY "Workspace owners can update members"
  ON workspace_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_members.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Workspace owners can remove members
CREATE POLICY "Workspace owners can remove members"
  ON workspace_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_members.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Update Campaigns RLS Policies to include workspace access
DROP POLICY IF EXISTS "Users can view their own campaigns" ON campaigns;
CREATE POLICY "Users can view workspace campaigns"
  ON campaigns
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = campaigns.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = campaigns.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own campaigns" ON campaigns;
CREATE POLICY "Users can insert campaigns in their workspaces"
  ON campaigns
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      workspace_id IS NULL
      OR EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_members.workspace_id = campaigns.workspace_id
        AND workspace_members.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM workspaces
        WHERE workspaces.id = campaigns.workspace_id
        AND workspaces.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own campaigns" ON campaigns;
CREATE POLICY "Users can update workspace campaigns"
  ON campaigns
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = campaigns.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = campaigns.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own campaigns" ON campaigns;
CREATE POLICY "Users can delete workspace campaigns"
  ON campaigns
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = campaigns.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Interview Responses RLS Policies
-- Users can view responses from their workspace campaigns
CREATE POLICY "Users can view workspace interview responses"
  ON interview_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = interview_responses.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = interview_responses.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Users can insert responses for workspace campaigns
CREATE POLICY "Users can insert workspace interview responses"
  ON interview_responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = interview_responses.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = interview_responses.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Workspace owners and admins can delete responses
CREATE POLICY "Workspace owners can delete interview responses"
  ON interview_responses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = interview_responses.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = interview_responses.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role = 'admin'
    )
  );

-- Add updated_at trigger to workspaces table
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically add workspace owner as a member
CREATE OR REPLACE FUNCTION add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to add owner as member when workspace is created
CREATE TRIGGER add_workspace_owner_as_member
  AFTER INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION add_owner_as_member();
