-- Migration: Add Project Invitations Table for Pending Project Invites
-- This migration creates a table to store project-level invitations for users who haven't signed up yet

-- Create project_invitations table
CREATE TABLE IF NOT EXISTS public.project_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_project_invitations_project_id ON public.project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON public.project_invitations(email);
CREATE INDEX IF NOT EXISTS idx_project_invitations_invited_by ON public.project_invitations(invited_by);

-- Add helpful comments
COMMENT ON TABLE public.project_invitations IS 'Pending project-level invitations for users who have not yet signed up';
COMMENT ON COLUMN public.project_invitations.role IS 'Project-level role: editor or viewer';

