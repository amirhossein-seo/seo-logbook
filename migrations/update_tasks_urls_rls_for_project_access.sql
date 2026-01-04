-- Migration: Update RLS Policies for tasks and urls to use Project-Based Access
-- This migration updates RLS policies so that users can access tasks/urls if they have access to the parent project

-- ============================================================================
-- TASKS TABLE POLICIES
-- ============================================================================

-- Drop existing policies on tasks (if they exist)
DO $$
BEGIN
    -- Drop all existing policies on tasks
    DROP POLICY IF EXISTS "Users can view tasks in their workspace" ON public.tasks;
    DROP POLICY IF EXISTS "Users can insert tasks in their workspace" ON public.tasks;
    DROP POLICY IF EXISTS "Users can update tasks in their workspace" ON public.tasks;
    DROP POLICY IF EXISTS "Users can delete tasks in their workspace" ON public.tasks;
    DROP POLICY IF EXISTS "Users can view tasks" ON public.tasks;
    DROP POLICY IF EXISTS "Users can insert tasks" ON public.tasks;
    DROP POLICY IF EXISTS "Users can update tasks" ON public.tasks;
    DROP POLICY IF EXISTS "Users can delete tasks" ON public.tasks;
END $$;

-- Ensure RLS is enabled on tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT tasks if they have access to the parent project
CREATE POLICY "Users can view tasks if they have project access"
    ON public.tasks
    FOR SELECT
    USING (
        -- Check if user is a workspace member (owner, admin, member, viewer) of the project's workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = tasks.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- OR check if user is in project_members for that project
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id
            AND pm.user_id = auth.uid()
        )
    );

-- Policy: Users can INSERT tasks if they have project access
CREATE POLICY "Users can insert tasks if they have project access"
    ON public.tasks
    FOR INSERT
    WITH CHECK (
        -- Check if user is a workspace member (owner, admin, member, viewer) of the project's workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = tasks.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- OR check if user is in project_members with editor role (guests with viewer role cannot create tasks)
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id
            AND pm.user_id = auth.uid()
            AND pm.role = 'editor'
        )
    );

-- Policy: Users can UPDATE tasks if they have project access
CREATE POLICY "Users can update tasks if they have project access"
    ON public.tasks
    FOR UPDATE
    USING (
        -- Check if user is a workspace member (owner, admin, member, viewer) of the project's workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = tasks.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- OR check if user is in project_members with editor role (guests with viewer role cannot update tasks)
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id
            AND pm.user_id = auth.uid()
            AND pm.role = 'editor'
        )
    );

-- Policy: Users can DELETE tasks if they have project access (admin/owner only)
CREATE POLICY "Users can delete tasks if they are workspace admin/owner"
    ON public.tasks
    FOR DELETE
    USING (
        -- Only workspace admins/owners can delete tasks
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = tasks.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- URLS TABLE POLICIES
-- ============================================================================

-- Drop existing policies on urls (if they exist)
DO $$
BEGIN
    -- Drop all existing policies on urls
    DROP POLICY IF EXISTS "Users can view urls in their workspace" ON public.urls;
    DROP POLICY IF EXISTS "Users can insert urls in their workspace" ON public.urls;
    DROP POLICY IF EXISTS "Users can update urls in their workspace" ON public.urls;
    DROP POLICY IF EXISTS "Users can delete urls in their workspace" ON public.urls;
    DROP POLICY IF EXISTS "Users can view urls" ON public.urls;
    DROP POLICY IF EXISTS "Users can insert urls" ON public.urls;
    DROP POLICY IF EXISTS "Users can update urls" ON public.urls;
    DROP POLICY IF EXISTS "Users can delete urls" ON public.urls;
END $$;

-- Ensure RLS is enabled on urls
ALTER TABLE public.urls ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT urls if they have access to the parent project
CREATE POLICY "Users can view urls if they have project access"
    ON public.urls
    FOR SELECT
    USING (
        -- Check if user is a workspace member (owner, admin, member, viewer) of the project's workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = urls.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- OR check if user is in project_members for that project
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = urls.project_id
            AND pm.user_id = auth.uid()
        )
    );

-- Policy: Users can INSERT urls if they have project access
CREATE POLICY "Users can insert urls if they have project access"
    ON public.urls
    FOR INSERT
    WITH CHECK (
        -- Check if user is a workspace member (owner, admin, member, viewer) of the project's workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = urls.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- OR check if user is in project_members with editor role (guests with viewer role cannot create urls)
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = urls.project_id
            AND pm.user_id = auth.uid()
            AND pm.role = 'editor'
        )
    );

-- Policy: Users can UPDATE urls if they have project access
CREATE POLICY "Users can update urls if they have project access"
    ON public.urls
    FOR UPDATE
    USING (
        -- Check if user is a workspace member (owner, admin, member, viewer) of the project's workspace
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = urls.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'member', 'viewer')
        )
        OR
        -- OR check if user is in project_members with editor role (guests with viewer role cannot update urls)
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = urls.project_id
            AND pm.user_id = auth.uid()
            AND pm.role = 'editor'
        )
    );

-- Policy: Users can DELETE urls if they have project access (admin/owner only)
CREATE POLICY "Users can delete urls if they are workspace admin/owner"
    ON public.urls
    FOR DELETE
    USING (
        -- Only workspace admins/owners can delete urls
        EXISTS (
            SELECT 1 FROM public.projects p
            INNER JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
            WHERE p.id = urls.project_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
        )
    );

-- Add helpful comments
COMMENT ON POLICY "Users can view tasks if they have project access" ON public.tasks IS 
    'Allows users to view tasks if they are workspace members OR project members';
COMMENT ON POLICY "Users can view urls if they have project access" ON public.urls IS 
    'Allows users to view urls if they are workspace members OR project members';

