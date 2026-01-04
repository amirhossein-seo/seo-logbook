-- Migration: Create Invitations Table for Pending Project Invites
-- This migration creates a table to store project-level invitations for users who haven't signed up yet
-- Table name: invitations (as requested)

-- Drop project_invitations if it exists (in case it was created with different name)
DROP TABLE IF EXISTS public.project_invitations CASCADE;

-- Create invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invitations_project_id ON public.invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON public.invitations(invited_by);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invitations
-- Policy: Users can read invitations if they are workspace members
CREATE POLICY "Users can read invitations if workspace member"
    ON public.invitations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = invitations.project_id
        )
    );

-- Policy: Users can insert invitations if they are workspace admin/owner
CREATE POLICY "Users can insert invitations if workspace admin/owner"
    ON public.invitations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = invitations.project_id
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: Users can delete invitations if they are workspace admin/owner or if email matches
CREATE POLICY "Users can delete invitations if workspace admin/owner or matching email"
    ON public.invitations
    FOR DELETE
    USING (
        -- Workspace admin/owner can delete
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.projects p ON p.workspace_id = wm.workspace_id
            WHERE wm.user_id = auth.uid()
            AND p.id = invitations.project_id
            AND wm.role IN ('owner', 'admin')
        )
        -- OR user's email matches (for auto-claiming)
        OR EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = auth.uid()
            AND LOWER(u.email) = LOWER(invitations.email)
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.invitations TO authenticated;

-- Add helpful comments
COMMENT ON TABLE public.invitations IS 'Pending project-level invitations for users who have not yet signed up';
COMMENT ON COLUMN public.invitations.role IS 'Project-level role: editor or viewer';

