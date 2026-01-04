-- Migration: Add global_role column to profiles table
-- This migration adds a global_role column for admin dashboard access control

-- Step 1: Add global_role column with default value 'user'
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS global_role TEXT NOT NULL DEFAULT 'user' CHECK (global_role IN ('user', 'super_admin'));

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_global_role ON public.profiles(global_role);

-- Step 3: Add helpful comment
COMMENT ON COLUMN public.profiles.global_role IS 'Global role: user (default) or super_admin (admin dashboard access)';

-- Note: After running this migration, manually set your profile's global_role to 'super_admin' using:
-- UPDATE public.profiles SET global_role = 'super_admin' WHERE id = 'YOUR_USER_ID';

