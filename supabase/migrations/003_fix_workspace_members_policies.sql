-- Fix infinite recursion in workspace_members RLS policies

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON workspace_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON workspace_members;

-- Recreate policies without circular references
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
