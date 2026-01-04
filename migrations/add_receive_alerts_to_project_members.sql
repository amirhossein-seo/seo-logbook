-- Migration: Add receive_alerts column to project_members
-- This allows individual project members to opt-in/opt-out of email alerts

ALTER TABLE public.project_members
ADD COLUMN IF NOT EXISTS receive_alerts BOOLEAN DEFAULT true NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN public.project_members.receive_alerts IS 'Whether this project member wants to receive email alerts for monitoring changes';

