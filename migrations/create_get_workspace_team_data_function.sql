-- Migration: Create Secure Function to Get Workspace Team Data with Emails
-- This function allows reading emails from auth.users securely

CREATE OR REPLACE FUNCTION public.get_workspace_team_data(lookup_workspace_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requesting_user_id UUID;
BEGIN
  -- Get the current authenticated user
  requesting_user_id := auth.uid();
  
  -- Security check: Verify the requesting user is a member of this workspace
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = lookup_workspace_id
    AND user_id = requesting_user_id
  ) THEN
    -- User is not a member, return empty result
    RETURN;
  END IF;
  
  -- User is authorized, return team data with emails
  RETURN QUERY
  SELECT
    wm.user_id,
    au.email::TEXT,
    wm.role,
    wm.created_at as joined_at
  FROM public.workspace_members wm
  INNER JOIN auth.users au ON wm.user_id = au.id
  WHERE wm.workspace_id = lookup_workspace_id
  ORDER BY wm.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_workspace_team_data(UUID) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_workspace_team_data(UUID) IS 'Securely retrieves workspace team members with their emails. Only accessible by workspace members.';

