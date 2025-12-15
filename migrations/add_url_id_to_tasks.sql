-- Migration: Add url_id column to tasks table
-- Run this SQL in your Supabase SQL editor

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS url_id UUID REFERENCES public.urls(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_url_id ON public.tasks(url_id);

-- Add comment
COMMENT ON COLUMN public.tasks.url_id IS 'Optional reference to a URL in the urls table';

