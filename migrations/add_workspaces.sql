-- Migration: Add Multi-Tenant Workspaces Support
-- This migration creates workspaces and workspace_members tables,
-- adds workspace_id to projects, and backfills existing data.

-- Step 1: Create workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    plan TEXT DEFAULT 'free',
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Step 2: Create workspace_members table
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Step 3: Add workspace_id column to projects table (nullable initially)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Step 4: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON public.projects(workspace_id);

-- Step 5: Backfill existing data
-- For each user, create a workspace and assign their projects to it
DO $$
DECLARE
    user_record RECORD;
    new_workspace_id UUID;
    user_email TEXT;
BEGIN
    -- Loop through all users in auth.users
    FOR user_record IN 
        SELECT id, email FROM auth.users
    LOOP
        -- Get user email (handle potential null)
        user_email := COALESCE(user_record.email, 'user_' || user_record.id::TEXT);
        
        -- Create a workspace for this user
        INSERT INTO public.workspaces (name, owner_id)
        VALUES (user_email || '''s Workspace', user_record.id)
        RETURNING id INTO new_workspace_id;
        
        -- Add user as owner of the workspace
        INSERT INTO public.workspace_members (workspace_id, user_id, role)
        VALUES (new_workspace_id, user_record.id, 'owner')
        ON CONFLICT (workspace_id, user_id) DO NOTHING;
        
        -- Update all projects created by this user to belong to the new workspace
        UPDATE public.projects
        SET workspace_id = new_workspace_id
        WHERE created_by = user_record.id
        AND workspace_id IS NULL;
        
    END LOOP;
END $$;

-- Step 6: Make workspace_id NOT NULL after backfilling
-- First, handle any edge cases where projects might not have a workspace
-- (e.g., projects created by users that no longer exist)
DO $$
DECLARE
    orphaned_count INTEGER;
    default_workspace_id UUID;
BEGIN
    -- Count projects without workspace_id
    SELECT COUNT(*) INTO orphaned_count
    FROM public.projects
    WHERE workspace_id IS NULL;
    
    -- If there are orphaned projects, create a default workspace for them
    IF orphaned_count > 0 THEN
        -- Create a default workspace (you might want to assign this to a system user)
        INSERT INTO public.workspaces (name, owner_id)
        VALUES ('Default Workspace', NULL)
        ON CONFLICT DO NOTHING
        RETURNING id INTO default_workspace_id;
        
        -- If we couldn't get the ID (conflict), fetch it
        IF default_workspace_id IS NULL THEN
            SELECT id INTO default_workspace_id
            FROM public.workspaces
            WHERE name = 'Default Workspace'
            LIMIT 1;
        END IF;
        
        -- Assign orphaned projects to default workspace
        UPDATE public.projects
        SET workspace_id = default_workspace_id
        WHERE workspace_id IS NULL;
    END IF;
END $$;

-- Now make workspace_id NOT NULL
ALTER TABLE public.projects
ALTER COLUMN workspace_id SET NOT NULL;

-- Step 7: Add helpful comments
COMMENT ON TABLE public.workspaces IS 'Multi-tenant workspaces for organizing projects and team members';
COMMENT ON TABLE public.workspace_members IS 'Membership table linking users to workspaces with roles';
COMMENT ON COLUMN public.projects.workspace_id IS 'The workspace this project belongs to (required for multi-tenancy)';

