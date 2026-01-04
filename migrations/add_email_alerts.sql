-- Migration: Add Email Alerts Support
-- This migration adds email alert settings to projects and creates a notifications log table

-- Step 1: Add email_alerts_enabled column to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS email_alerts_enabled BOOLEAN DEFAULT false NOT NULL;

-- Step 2: Create email_notifications table to log sent alerts
CREATE TABLE IF NOT EXISTS public.email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    monitor_run_id UUID REFERENCES public.monitor_runs(id) ON DELETE SET NULL,
    log_id UUID REFERENCES public.logs(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    change_summary TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_notifications_project_id ON public.email_notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at ON public.email_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_notifications_monitor_run_id ON public.email_notifications(monitor_run_id);

-- Add helpful comments
COMMENT ON COLUMN public.projects.email_alerts_enabled IS 'Whether email alerts are enabled for monitoring changes in this project';
COMMENT ON TABLE public.email_notifications IS 'Log of email alerts sent for monitoring changes';
COMMENT ON COLUMN public.email_notifications.change_summary IS 'Summary of changes detected (Title, H1, JSON-LD, etc.)';

