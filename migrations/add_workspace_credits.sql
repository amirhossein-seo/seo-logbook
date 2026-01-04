-- Migration: Add Credits System to Workspaces
-- This migration adds a credits column to workspaces for manual verification tracking

-- Step 1: Add credits column to workspaces table
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 5 NOT NULL;

-- Step 2: Set default credits for existing workspaces (if they don't have any)
UPDATE public.workspaces
SET credits = 5
WHERE credits IS NULL OR credits < 0;

-- Step 3: Add constraint to ensure credits cannot be negative
ALTER TABLE public.workspaces
ADD CONSTRAINT workspaces_credits_non_negative CHECK (credits >= 0);

-- Step 4: Add helpful comment
COMMENT ON COLUMN public.workspaces.credits IS 'Number of manual verification credits available for this workspace. Default is 5 for new workspaces.';

