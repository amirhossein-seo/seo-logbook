-- Migration: Fix RLS '42501' error for project_members
-- This migration ensures that authenticated users can properly insert/update project_members
-- when using server-side operations (like accepting invitations)

-- Ensure RLS is enabled
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate them)
DROP POLICY IF EXISTS "Users can read project_members if workspace member" ON public.project_members;
DROP POLICY IF EXISTS "Users can insert project_members if workspace admin/owner" ON public.project_members;
DROP POLICY IF EXISTS "Users can update project_members if workspace admin/owner" ON public.project_members;
DROP POLICY IF EXISTS "Users can delete project_members if workspace admin/owner" ON public.project_members;

-- Policy: Users can read project_members if they are members of the parent workspace OR if they are the user being added
CREATE POLICY "Users can read project_members if workspace member"
    ON public.project_members
    FOR SELECT
    USING (
        -- User is a member of the workspace that owns the project
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = project_members.project_id
        )
        -- OR user is the project member themselves (for checking their own membership)
        OR project_members.user_id = auth.uid()
    );

-- Policy: Users can insert project_members if they are workspace admin/owner OR if they are accepting an invitation
CREATE POLICY "Users can insert project_members if workspace admin/owner"
    ON public.project_members
    FOR INSERT
    WITH CHECK (
        -- User is workspace admin/owner
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = project_members.project_id
            AND wm.role IN ('owner', 'admin')
        )
        -- OR user is inserting themselves (for accepting invitations)
        OR project_members.user_id = auth.uid()
    );

-- Policy: Users can update project_members if they are workspace admin/owner
CREATE POLICY "Users can update project_members if workspace admin/owner"
    ON public.project_members
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = project_members.project_id
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: Users can delete project_members if they are workspace admin/owner
CREATE POLICY "Users can delete project_members if workspace admin/owner"
    ON public.project_members
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = project_members.project_id
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Ensure proper grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;

COMMENT ON POLICY "Users can insert project_members if workspace admin/owner" ON public.project_members IS 
    'Allows workspace admins/owners to add project members, or users to add themselves when accepting invitations';

