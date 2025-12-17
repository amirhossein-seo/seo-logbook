-- Migration: Add Invitations Table for Pending User Invites
-- This migration creates a table to store invitations for users who haven't signed up yet

-- Create invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    token UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invitations_workspace_id ON public.invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);

-- Add helpful comments
COMMENT ON TABLE public.invitations IS 'Pending invitations for users who have not yet signed up';
COMMENT ON COLUMN public.invitations.token IS 'Unique token for magic link invitations (to be implemented)';
