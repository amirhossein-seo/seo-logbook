-- Migration: Add Project-Level Access Control (Guest Access)
-- This migration creates project_members table and updates workspace roles to support 'guest'

-- Step 1: Create project_members table
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON public.project_members(project_id, user_id);

-- Add helpful comments
COMMENT ON TABLE public.project_members IS 'Project-level access control. Links users to specific projects with editor/viewer roles.';
COMMENT ON COLUMN public.project_members.role IS 'Project-level role: editor (can edit) or viewer (read-only)';

-- Step 2: Update workspace_members to support 'guest' role
-- Check if the constraint exists and update it
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'workspace_members_role_check'
    ) THEN
        ALTER TABLE public.workspace_members 
        DROP CONSTRAINT workspace_members_role_check;
    END IF;
    
    -- Add new constraint with 'guest' role
    ALTER TABLE public.workspace_members 
    ADD CONSTRAINT workspace_members_role_check 
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'guest'));
END $$;

COMMENT ON COLUMN public.workspace_members.role IS 'Workspace role: owner, admin, member, viewer, or guest (project-level access only)';

-- Step 3: RLS Policies for project_members

-- Enable RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read project_members if they are members of the parent workspace
CREATE POLICY "Users can read project_members if workspace member"
    ON public.project_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = project_members.project_id
            AND wm.user_id = auth.uid()
        )
    );

-- Policy: Users can insert project_members if they are workspace admin/owner
CREATE POLICY "Workspace admins can add project members"
    ON public.project_members
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = project_members.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: Users can update project_members if they are workspace admin/owner
CREATE POLICY "Workspace admins can update project members"
    ON public.project_members
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = project_members.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: Users can delete project_members if they are workspace admin/owner
CREATE POLICY "Workspace admins can delete project members"
    ON public.project_members
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = project_members.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Step 4: Update projects RLS policy to allow project_members access

-- Drop existing SELECT policy if it exists (you may need to adjust this based on your existing policies)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'projects' 
        AND policyname = 'Users can view projects in their workspace'
    ) THEN
        DROP POLICY IF EXISTS "Users can view projects in their workspace" ON public.projects;
    END IF;
END $$;

-- Create new SELECT policy that includes project_members
CREATE POLICY "Users can view projects in workspace or as project member"
    ON public.projects
    FOR SELECT
    USING (
        -- Workspace members (owner, admin, member, viewer)
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = projects.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- Project-level guests
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = projects.id
            AND pm.user_id = auth.uid()
        )
    );

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;

