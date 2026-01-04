"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import { resend } from "@/lib/resend";
import { render } from "@react-email/render";
import { SEOAlertEmail } from "@/components/emails/seo-alert-template";

/**
 * Helper function to fetch user names from user IDs
 * Returns a map of user ID to user name (full_name or email)
 */
async function getUserNamesMap(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) {
    return {};
  }

  const userMetadataMap: Record<string, string> = {};
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (serviceRoleKey && supabaseUrl) {
    try {
      const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Use listUsers() to fetch all users, then filter to the ones we need
      const userIdSet = new Set(userIds);
      let page = 1;
      let hasMore = true;
      let foundCount = 0;

      while (hasMore && foundCount < userIds.length) {
        const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 1000, // Fetch up to 1000 users per page
        });

        if (listError) {
          console.error("Error listing users:", listError);
          break;
        }

        if (!usersData?.users || usersData.users.length === 0) {
          hasMore = false;
          break;
        }

        // Process users and add to map if they're in our target list
        for (const user of usersData.users) {
          if (userIdSet.has(user.id)) {
            const email = user.email || "";
            const fullName = user.user_metadata?.full_name || null;
            userMetadataMap[user.id] = fullName || email || "Unknown User";
            foundCount++;
          }
        }

        // Check if there are more pages
        hasMore = usersData.users.length === 1000;
        page++;
      }

      // Fill in any missing user IDs with fallback values
      for (const userId of userIds) {
        if (!userMetadataMap[userId]) {
          userMetadataMap[userId] = "Unknown User";
        }
      }
    } catch (error) {
      console.warn("Admin client not available, falling back to user IDs:", error);
      userIds.forEach((userId) => {
        userMetadataMap[userId] = "Unknown User";
      });
    }
  } else {
    // Fallback: use "Unknown User" if admin client is not available
    userIds.forEach((userId) => {
      userMetadataMap[userId] = "Unknown User";
    });
  }

  return userMetadataMap;
}

export async function signInAction(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return {
      error: "Email and password are required",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUpAction(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return {
      error: "Email and password are required",
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/dashboard`,
    },
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/auth/sign-up-success");
}

/**
 * Accept pending invitations for a user
 * Called automatically when user logs in or loads their workspace
 * @param userId - The user ID
 * @param email - The user's email address
 */
/**
 * Accept pending invitations for a user
 * Queries invitations by email (case-insensitive), adds user to workspaces, and deletes invitations
 * @param userId - The user ID to add to workspaces
 * @param email - The email address to match invitations against (case-insensitive)
 */
async function acceptPendingInvites(userId: string, email: string): Promise<void> {
  const supabase = await createClient();

  // Normalize email for case-insensitive matching
  const normalizedEmail = email.trim().toLowerCase();
  
  if (!normalizedEmail) {
    console.warn("acceptPendingInvites: No email provided");
    return;
  }

  // Find all pending invitations for this email (case-insensitive)
  const { data: invitations, error: invitationsError } = await supabase
    .from("invitations")
    .select("id, workspace_id, role, email")
    .ilike("email", normalizedEmail); // Use ilike for case-insensitive matching

  if (invitationsError) {
    console.error("Error fetching pending invitations:", JSON.stringify(invitationsError, null, 2));
    return;
  }

  if (!invitations || invitations.length === 0) {
    return; // No pending invitations
  }

  console.log(`acceptPendingInvites: Found ${invitations.length} pending invitation(s) for ${normalizedEmail}`);

  // Process each invitation
  for (const invitation of invitations) {
    // Check if user is already a member of this workspace
    const { data: existingMembership, error: checkError } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", invitation.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found" which is expected if user is not a member
      console.error("Error checking existing membership:", JSON.stringify(checkError, null, 2));
      continue; // Skip this invitation
    }

    if (existingMembership) {
      // User is already a member, just delete the invitation
      console.log(`acceptPendingInvites: User already a member of workspace ${invitation.workspace_id}, deleting invitation`);
      const { error: deleteError } = await supabase
        .from("invitations")
        .delete()
        .eq("id", invitation.id);
      
      if (deleteError) {
        console.error("Error deleting duplicate invitation:", JSON.stringify(deleteError, null, 2));
      }
      continue;
    }

    // Add user to workspace
    const { error: membershipError } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
      });

    if (membershipError) {
      console.error("Error adding user to workspace:", JSON.stringify(membershipError, null, 2));
      continue; // Skip this invitation and continue with the next
    }

    console.log(`acceptPendingInvites: ✅ Successfully added user ${userId} to workspace ${invitation.workspace_id} with role ${invitation.role}`);

    // Delete the invitation after successful membership creation
    const { error: deleteError } = await supabase
      .from("invitations")
      .delete()
      .eq("id", invitation.id);

    if (deleteError) {
      console.error("Error deleting invitation after success:", JSON.stringify(deleteError, null, 2));
    } else {
      console.log(`acceptPendingInvites: ✅ Deleted invitation ${invitation.id} after successful membership creation`);
    }
  }

  // Now handle project-level invitations
  const { data: projectInvitations, error: projectInvitationsError } = await supabase
    .from("invitations")
    .select("id, project_id, role, email")
    .ilike("email", normalizedEmail); // Use ilike for case-insensitive matching

  if (projectInvitationsError) {
    console.error("Error fetching pending project invitations:", JSON.stringify(projectInvitationsError, null, 2));
    return; // Don't fail completely, workspace invitations were already processed
  }

  if (!projectInvitations || projectInvitations.length === 0) {
    return; // No pending project invitations
  }

  console.log(`acceptPendingInvites: Found ${projectInvitations.length} pending project invitation(s) for ${normalizedEmail}`);

  // Process each project invitation
  for (const invitation of projectInvitations) {
    // Get the project's workspace_id to ensure user is in the workspace
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", invitation.project_id)
      .single();

    if (projectError || !project) {
      console.error("Error fetching project for invitation:", projectError);
      continue; // Skip this invitation
    }

    // Check if user is already a member of the workspace
    const { data: workspaceMembership, error: workspaceCheckError } = await supabase
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", project.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (workspaceCheckError && workspaceCheckError.code !== "PGRST116") {
      console.error("Error checking workspace membership for project invitation:", workspaceCheckError);
      continue;
    }

    // If user is not in workspace, add them as 'guest'
    if (!workspaceMembership) {
      const { error: workspaceInsertError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: project.workspace_id,
          user_id: userId,
          role: "guest",
        });

      if (workspaceInsertError) {
        console.error("Error adding user to workspace for project invitation:", workspaceInsertError);
        continue; // Skip this invitation
      }
    }

    // Check if user is already a project member
    const { data: existingProjectMember, error: projectMemberCheckError } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", invitation.project_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (projectMemberCheckError && projectMemberCheckError.code !== "PGRST116") {
      console.error("Error checking project membership:", projectMemberCheckError);
      continue;
    }

    if (existingProjectMember) {
      // User is already a project member, just delete the invitation
      console.log(`acceptPendingInvites: User already a member of project ${invitation.project_id}, deleting invitation`);
      const { error: deleteError } = await supabase
        .from("invitations")
        .delete()
        .eq("id", invitation.id);

      if (deleteError) {
        console.error("Error deleting duplicate project invitation:", deleteError);
      }
      continue;
    }

    // Add user to project
    const { error: projectMemberError } = await supabase
      .from("project_members")
      .insert({
        project_id: invitation.project_id,
        user_id: userId,
        role: invitation.role,
      });

    if (projectMemberError) {
      console.error("Error adding user to project:", projectMemberError);
      continue; // Skip this invitation and continue with the next
    }

    console.log(`acceptPendingInvites: ✅ Successfully added user ${userId} to project ${invitation.project_id} with role ${invitation.role}`);

    // Delete the invitation after successful membership creation
    const { error: deleteError } = await supabase
      .from("invitations")
      .delete()
      .eq("id", invitation.id);

    if (deleteError) {
      console.error("Error deleting project invitation after success:", deleteError);
    } else {
      console.log(`acceptPendingInvites: ✅ Deleted project invitation ${invitation.id} after successful membership creation`);
    }
  }
}

/**
 * Claim pending project invitations for a user
 * Searches invitations table for matching email, adds user to project_members, and deletes invitations
 * Returns list of project names that were claimed for toast notifications
 */
export async function claimPendingInvitations(
  userEmail: string,
  userId: string
): Promise<{ claimedProjects: Array<{ id: string; name: string }> }> {
  const supabase = await createClient();

  // Normalize email for case-insensitive matching
  const normalizedEmail = userEmail.trim().toLowerCase();

  if (!normalizedEmail) {
    return { claimedProjects: [] };
  }

  // Find all pending project invitations for this email (only those with project_id)
  try {
    const { data: invitations, error: invitationsError } = await supabase
      .from("invitations")
      .select("id, project_id, role, email, projects(id, name)")
      .ilike("email", normalizedEmail)
      .not("project_id", "is", null); // Only project invitations, not workspace invitations

    if (invitationsError) {
      // Check for PGRST200 (table not found) or other errors
      if (invitationsError.code === "PGRST200" || invitationsError.code === "42P01") {
        console.warn("Invitations table not found or accessible. Skipping invitation check.");
        return { claimedProjects: [] };
      }
      
      console.error("Error fetching pending project invitations:", invitationsError);
      return { claimedProjects: [] };
    }

    if (!invitations || invitations.length === 0) {
      return { claimedProjects: [] };
    }

    console.log(`claimPendingInvitations: Found ${invitations.length} pending project invitation(s) for ${normalizedEmail}`);

    const claimedProjects: Array<{ id: string; name: string }> = [];

    // Process each invitation
    for (const invitation of invitations) {
      const project = invitation.projects as any;
      if (!project || !project.id) {
        console.error("Invalid project data in invitation:", invitation);
        continue;
      }

      const projectId = invitation.project_id;

      // Get the project's workspace_id to ensure user is in the workspace
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("workspace_id")
        .eq("id", projectId)
        .single();

      if (projectError || !projectData) {
        console.error("Error fetching project for invitation:", projectError);
        continue;
      }

      // Check if user is already a member of the workspace
      const { data: workspaceMembership } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", projectData.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();

      // If user is not in workspace, add them as 'guest'
      if (!workspaceMembership) {
        const { error: workspaceInsertError } = await supabase
          .from("workspace_members")
          .insert({
            workspace_id: projectData.workspace_id,
            user_id: userId,
            role: "guest",
          });

        if (workspaceInsertError) {
          console.error("Error adding user to workspace for project invitation:", workspaceInsertError);
          continue;
        }
      }

      // Check if user is already a project member
      const { data: existingProjectMember } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingProjectMember) {
        // User is already a project member, just delete the invitation
        await supabase
          .from("invitations")
          .delete()
          .eq("id", invitation.id);
        continue;
      }

      // Add user to project_members
      const { error: projectMemberError } = await supabase
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: userId,
          role: invitation.role || "viewer",
        });

      if (projectMemberError) {
        console.error("Error adding user to project:", projectMemberError);
        continue;
      }

      console.log(`claimPendingInvitations: ✅ Successfully added user ${userId} to project ${projectId} with role ${invitation.role}`);

      // Delete the invitation after successful membership creation
      const { error: deleteError } = await supabase
        .from("invitations")
        .delete()
        .eq("id", invitation.id);

      if (deleteError) {
        console.error("Error deleting project invitation after success:", deleteError);
      } else {
        // Add to claimed projects list for toast notification
        claimedProjects.push({
          id: projectId,
          name: project.name || "Unknown Project",
        });
      }
    }

    return { claimedProjects };
  } catch (error) {
    console.error("Unexpected error in claimPendingInvitations:", error);
    return { claimedProjects: [] };
  }
}

/**
 * Helper function to get a user's workspace ID
 * Checks cookie first, then falls back to first workspace membership
 * Automatically accepts pending invitations and creates workspace for new users
 * @param userId - The user ID to look up
 * @returns The workspace_id if found, null otherwise
 */
export async function getUserWorkspace(userId: string): Promise<string | null> {
  const supabase = await createClient();

  // Get user's email for accepting invitations
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // PRIORITY 1: Check cookie FIRST (before any other logic)
  // This ensures workspace switching is respected immediately
  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get("seo-logbook-workspace")?.value;

  if (activeWorkspaceId) {
    // Verify user is still a member of this workspace
    const { data: membership, error: membershipCheckError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", activeWorkspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipCheckError && membershipCheckError.code !== "PGRST116") {
      console.error("Error checking cookie workspace membership:", membershipCheckError);
      // Continue to fallback logic
    } else if (membership) {
      // Cookie workspace is valid - return immediately
      return activeWorkspaceId;
    } else {
      // Invalid cookie - user is not a member of this workspace, clear it
      cookieStore.delete("seo-logbook-workspace");
    }
  }

  // Accept pending invitations so new memberships are recognized
  if (user.email) {
    await acceptPendingInvites(userId, user.email);
  }

  // PRIORITY 2: Fallback - Fetch existing memberships (only if cookie was invalid/missing)
  let { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);

  if (membershipError) {
    console.error("Error fetching user workspace:", membershipError);
    return null;
  }

  // PRIORITY 3: If still no memberships, check if the user already owns a workspace
  if (!memberships || memberships.length === 0) {
      const { data: ownedWorkspace, error: ownedError } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", userId)
        .limit(1)
        .maybeSingle();

      if (ownedError && ownedError.code !== "PGRST116") {
        console.error("Error checking owned workspace:", ownedError);
        return null;
      }

      if (ownedWorkspace && ownedWorkspace.id) {
        // Ensure membership link exists
        const { error: membershipInsertError } = await supabase
          .from("workspace_members")
          .upsert(
            {
              workspace_id: ownedWorkspace.id,
              user_id: userId,
              role: "owner",
            },
            { onConflict: "workspace_id,user_id" },
          );

        if (membershipInsertError) {
          console.error("Error repairing membership for owned workspace:", membershipInsertError);
          return null;
        }

        memberships = [{ workspace_id: ownedWorkspace.id }];
      } else {
        // PRIORITY 4: If no owned workspace, create a new Personal Workspace
        const { data: newWorkspace, error: workspaceError } = await supabase
          .from("workspaces")
          .insert({
            name: "My Workspace",
            owner_id: userId,
          })
          .select()
          .single();

        if (workspaceError || !newWorkspace) {
          console.error("Error creating workspace:", workspaceError);
          return null;
        }

        // Add user as owner of the new workspace
        const { error: membershipInsertError } = await supabase
          .from("workspace_members")
          .insert({
            workspace_id: newWorkspace.id,
            user_id: userId,
            role: "owner",
          });

        if (membershipInsertError) {
          console.error("Error adding user to new workspace:", membershipInsertError);
          return null;
        }

        memberships = [{ workspace_id: newWorkspace.id }];
      }
  }

  // PRIORITY 5: Return the first workspace membership
  if (memberships && memberships.length > 0) {
    return memberships[0].workspace_id;
  }

  return null;
}

/**
 * Switch to a different workspace
 * Stores the workspace ID in a cookie
 * @param workspaceId - The workspace ID to switch to
 */
export async function switchWorkspace(workspaceId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to switch workspaces",
    };
  }

  // Verify user is a member of this workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return {
      error: "You are not a member of this workspace",
    };
  }

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set("seo-logbook-workspace", workspaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: true,
    secure: true,
  });

  // Revalidate to force refresh with new workspace context
  revalidatePath("/", "layout");

  return { success: true };
}

/**
 * Get all workspaces the current user belongs to
 * @returns List of workspaces with id and name
 */
/**
 * Get all workspaces the current user is a member of
 * Returns workspaces where user has any role (owner, admin, member, viewer)
 * @returns Array of workspace objects with id and name
 */
export async function getAllWorkspaces() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Fetch all workspace memberships where user_id matches
  // Join with workspaces table to get workspace details
  const { data: memberships, error: membershipsError } = await supabase
    .from("workspace_members")
    .select(`
      workspace_id,
      role,
      workspaces (
        id,
        name
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }); // Most recent first

  if (membershipsError) {
    console.error("Error fetching workspaces:", JSON.stringify(membershipsError, null, 2));
    return [];
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  // Transform the data to flatten workspace structure
  // Filter out any entries where workspace data is missing
  const workspaces = (memberships || [])
    .map((membership: any) => {
      const workspace = membership.workspaces;
      if (!workspace || !workspace.id) {
        return null;
      }
      return {
        id: workspace.id,
        name: workspace.name || "Unnamed Workspace",
      };
    })
    .filter((ws: any) => ws !== null); // Filter out null entries

  console.log(`getAllWorkspaces: Found ${workspaces.length} workspace(s) for user ${user.id}`);
  return workspaces;
}

/**
 * Update user profile information
 * Updates the user's full name in their metadata
 * @param formData - Form data containing the full_name field
 * @returns Success or error response
 */
export async function updateUserProfile(formData: FormData) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update your profile",
    };
  }

  const fullName = formData.get("fullName") as string;

  if (!fullName || !fullName.trim()) {
    return {
      error: "Full name is required",
    };
  }

  // Update profiles.full_name (PRIMARY source for full_name)
  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ full_name: fullName.trim() })
    .eq("id", user.id);

  if (profileUpdateError) {
    console.error("Error updating profile full_name:", profileUpdateError);
    return {
      error: profileUpdateError.message || "Failed to update profile. Please try again.",
    };
  }

  // Also update auth metadata for backward compatibility
  const { error: authUpdateError } = await supabase.auth.updateUser({
    data: {
      full_name: fullName.trim(),
    },
  });

  if (authUpdateError) {
    console.error("Error updating auth metadata:", authUpdateError);
    // Don't fail if auth update fails, profile update succeeded
  }

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Update workspace name
 * Only workspace owners can update the workspace name
 */
export async function updateWorkspaceName(workspaceId: string, formData: FormData) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update workspace settings",
    };
  }

  // Verify user is the owner of the workspace
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      error: "Unable to verify your permissions",
    };
  }

  if (membership.role !== "owner") {
    return {
      error: "Only workspace owners can update workspace settings",
    };
  }

  const workspaceName = formData.get("workspaceName") as string;

  if (!workspaceName || !workspaceName.trim()) {
    return {
      error: "Workspace name is required",
    };
  }

  // Update workspace name
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ name: workspaceName.trim() })
    .eq("id", workspaceId);

  if (updateError) {
    console.error("Error updating workspace name:", updateError);
    return {
      error: updateError.message || "Failed to update workspace name. Please try again.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // Revalidate layout to update sidebar
  return { success: true };
}

export async function getProjects() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { projects: [], userRole: "viewer" };
  }

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    console.error("User has no workspace");
    return { projects: [], userRole: "viewer" };
  }

  // Fetch user's role in the workspace
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("Error fetching user role:", membershipError);
  }

  const userRole = membership?.role || "viewer";

  // Logic Branch: Handle guest vs full workspace members
  if (userRole === "guest") {
    // Guests: Only see projects they're explicitly added to via project_members
    const { data: projectMemberships, error: pmError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    if (pmError) {
      console.error("Error fetching project memberships:", pmError);
      return { projects: [], userRole: userRole };
    }

    if (!projectMemberships || projectMemberships.length === 0) {
      return { projects: [], userRole: userRole };
    }

    // Fetch only the projects the guest has access to
    const projectIds = projectMemberships.map((pm) => pm.project_id);
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .in("id", projectIds)
      .eq("workspace_id", workspaceId) // Still verify workspace match for security
      .order("created_at", { ascending: false });

    if (projectsError) {
      console.error("Error fetching guest projects:", projectsError);
      return { projects: [], userRole: userRole };
    }

    return {
      projects: projects || [],
      userRole: userRole,
    };
  } else {
    // Full workspace members (owner, admin, member, viewer): See all projects
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (projectsError) {
      console.error("Error fetching projects:", projectsError);
      return { projects: [], userRole: userRole };
    }

    return {
      projects: projects || [],
      userRole: userRole,
    };
  }
}

/**
 * Get the current user's role in their active workspace
 * @returns The user's workspace role ('owner', 'admin', 'member', 'viewer', 'guest') or null
 */
export async function getUserWorkspaceRole(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return null;
  }

  return membership.role;
}

/**
 * Get a single project by ID with active workspace enforcement
 * Returns null if the project does not belong to the active workspace
 */
export async function getProject(projectId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const activeWorkspaceId = await getUserWorkspace(user.id);
  if (!activeWorkspaceId) {
    return null;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return null;
  }

  if (project.workspace_id !== activeWorkspaceId) {
    // Project does not belong to the active workspace
    return null;
  }

  return project;
}

export async function createProject(formData: FormData) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to create a project",
    };
  }

  const name = formData.get("name") as string;
  const domain = formData.get("domain") as string;

  if (!name || !name.trim()) {
    return {
      error: "Project name is required",
    };
  }

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace to create a project",
    };
  }

  // Find or create organization for the user
  // First, check if user is a member of any organization
  const { data: orgMemberships, error: orgMembershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations(*)")
    .eq("user_id", user.id)
    .limit(1);

  let organizationId: string;

  if (orgMemberships && orgMemberships.length > 0 && !orgMembershipError) {
    // User is already a member of an organization
    organizationId = orgMemberships[0].organization_id;
  } else {
    // Create a default organization for the user
    const { data: newOrg, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: "My Agency",
      })
      .select()
      .single();

    if (orgError || !newOrg) {
      return {
        error: "Failed to create organization. Please try again.",
      };
    }

    organizationId = newOrg.id;

    // Add user as a member of the organization
    const { error: membershipError } = await supabase
      .from("organization_memberships")
      .insert({
        organization_id: organizationId,
        user_id: user.id,
      });

    if (membershipError) {
      console.error("Error creating organization membership:", membershipError);
      // Continue anyway, the org was created
    }
  }

  // Create the project with workspace_id
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: name.trim(),
      domain: domain?.trim() || null,
      org_id: organizationId,
      workspace_id: workspaceId,
      created_by: user.id,
    })
    .select()
    .single();

  if (projectError || !project) {
    return {
      error: projectError?.message || "Failed to create project",
    };
  }

  // Create project_membership making the user the owner
  const { error: projectMembershipError } = await supabase
    .from("project_memberships")
    .insert({
      project_id: project.id,
      user_id: user.id,
    });

  if (projectMembershipError) {
    console.error("Error creating project membership:", projectMembershipError);
    // Continue anyway, the project was created and user is owner via owner_id
  }

  revalidatePath("/projects");
  return { success: true, projectId: project.id };
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to delete a project",
    };
  }

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace to delete a project",
    };
  }

  // Verify user's role in the workspace (only admin/owner can delete)
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      error: "Unable to verify your permissions",
    };
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return {
      error: "Only workspace admins and owners can delete projects",
    };
  }

  // Verify the project belongs to the user's workspace
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return {
      error: "Project not found",
    };
  }

  if (project.workspace_id !== workspaceId) {
    return {
      error: "You can only delete projects in your workspace",
    };
  }

  // Delete the project (cascade will handle related records)
  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (deleteError) {
    console.error("Error deleting project:", deleteError);
    return {
      error: "Failed to delete project. Please try again.",
    };
  }

  revalidatePath("/projects");
  return { success: true };
}

/**
 * Invite a user to a specific project (project-level guest access)
 * Adds user to workspace as 'guest' if not already a member, then links them to the project
 * @param email - The email address of the user to invite
 * @param projectId - The project ID to grant access to
 * @param role - Project-level role: 'editor' or 'viewer'
 * @returns Success or error response
 */
export async function inviteToProject(email: string, projectId: string, role: "editor" | "viewer") {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to invite users to projects",
    };
  }

  // Validate role
  if (role !== "editor" && role !== "viewer") {
    return {
      error: "Invalid role. Must be 'editor' or 'viewer'",
    };
  }

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace to invite users",
    };
  }

  // Verify the project belongs to the user's workspace
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return {
      error: "Project not found",
    };
  }

  if (project.workspace_id !== workspaceId) {
    return {
      error: "You can only invite users to projects in your workspace",
    };
  }

  // Verify current user has permission (admin/owner)
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      error: "Unable to verify your permissions",
    };
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return {
      error: "Only workspace admins and owners can invite users to projects",
    };
  }

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      error: "Email is required",
    };
  }

  // Query users_sanitized view to find user by email
  // Golden Rule: Always use users_sanitized for email-to-user_id lookups
  const { data: userData, error: userLookupError } = await supabase
    .from("users_sanitized")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  let invitedUserId: string | null = null;

  if (userLookupError) {
    console.error("Error looking up user in users_sanitized:", userLookupError);
  } else if (userData?.id) {
    invitedUserId = userData.id;
  }

  // Get project name for logging
  const { data: projectData } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();

  const projectName = projectData?.name || "this project";

  // If user does NOT exist, create a pending invitation
  if (!invitedUserId) {
    // Check if invitation already exists
    const { data: existingInvitation } = await supabase
      .from("invitations")
      .select("id")
      .eq("project_id", projectId)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingInvitation) {
      return {
        error: "An invitation has already been sent to this email address.",
      };
    }

    // Create pending invitation
    const { error: invitationError } = await supabase
      .from("invitations")
      .insert({
        project_id: projectId,
        email: normalizedEmail,
        invited_by: user.id,
        role: role,
      });

    if (invitationError) {
      console.error("Error creating project invitation:", invitationError);
      return {
        error: "Failed to create invitation. Please try again.",
      };
    }

    // Create log entry for sent invitation with explicit UUID
    const logId = randomUUID();
    const { error: logError } = await supabase.from("logs").insert({
      id: logId,
      project_id: projectId,
      title: "Invitation Sent",
      description: `Invited ${normalizedEmail} to the project`,
      category: "Other",
      created_by: user.id,
    });

    if (logError) {
      console.error("Error creating invitation log:", logError);
      // Don't fail the operation if log creation fails
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return { success: true };
  }

  // User exists - proceed with adding them to the project
  // Step 1: Check if user is already in the workspace
  const { data: existingWorkspaceMember, error: workspaceCheckError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", invitedUserId)
    .maybeSingle();

  if (workspaceCheckError && workspaceCheckError.code !== "PGRST116") {
    console.error("Error checking workspace membership:", workspaceCheckError);
    return {
      error: "Failed to check workspace membership. Please try again.",
    };
  }

  // Step 2: Add to workspace if not already a member
  if (!existingWorkspaceMember) {
    // User is not in workspace, add them as 'guest'
    const { error: workspaceInsertError } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: workspaceId,
        user_id: invitedUserId,
        role: "guest",
      });

    if (workspaceInsertError) {
      console.error("Error adding user to workspace:", workspaceInsertError);
      return {
        error: "Failed to add user to workspace. Please try again.",
      };
    }
  } else {
    // User is already in workspace - don't downgrade their role
    // If they're already owner/admin/member/viewer, keep that role
    // Only set to 'guest' if they're not already a member
    console.log(`User ${invitedUserId} is already in workspace with role: ${existingWorkspaceMember.role}`);
  }

  // Step 3: Add to project_members (or update if exists)
  const { error: projectMemberError } = await supabase
    .from("project_members")
    .upsert(
      {
        project_id: projectId,
        user_id: invitedUserId,
        role: role,
      },
      { onConflict: "project_id,user_id" }
    );

  if (projectMemberError) {
    console.error("Error adding user to project:", projectMemberError);
    return {
      error: "Failed to add user to project. Please try again.",
    };
  }

  // Step 4: Create a log entry for the invitation with explicit UUID
  const logId = randomUUID();
  const { error: logError } = await supabase.from("logs").insert({
    id: logId,
    project_id: projectId,
    title: "User Invited to Project",
    description: `Invited ${normalizedEmail} to ${projectName} as ${role}`,
    category: "Other",
    created_by: user.id,
  });

  if (logError) {
    console.error("Error creating invitation log:", logError);
    // Don't fail the operation if log creation fails
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { success: true };
}

export async function getLogs(projectId: string, category?: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Base query: fetch logs for the project with related URLs
  let query = supabase
    .from("logs")
    .select(`
      *,
      log_urls (
        url_id,
        urls (
          id,
          url,
          project_id
        )
      )
    `)
    .eq("project_id", projectId);

  // Optional category filter
  if (category && category.trim()) {
    query = query.eq("category", category.trim());
  }

  // Sort by newest first
  const { data: logs, error: logsError } = await query.order("created_at", {
    ascending: false,
  });

  if (logsError) {
    console.error("Error fetching logs:", JSON.stringify(logsError, null, 2));
    return [];
  }

  if (!logs || logs.length === 0) {
    return [];
  }

  // Get unique user IDs from logs
  const userIds = [...new Set(logs.map((log: any) => log.created_by).filter(Boolean))];
  const userNamesMap = await getUserNamesMap(userIds);

  // Transform the data to flatten URL structure and attach user names
  return (
    logs?.map((log: any) => {
      const userName = userNamesMap[log.created_by] || "Unknown user";
      
      return {
        ...log,
        created_by: log.created_by, // Keep the user ID
        user_name: userName, // Add user_name property (never show UUID)
        urls:
          log.log_urls
            ?.map((lu: any) => ({
              id: lu.urls?.id,
              url: lu.urls?.url,
              project_id: lu.urls?.project_id,
            }))
            .filter((url: any) => url.id && url.url) || [],
      };
    }) || []
  );
}

/**
 * Get a specific log by ID
 * Used when highlighting a log that might not be in the current page
 */
export async function getLogById(logId: string, projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // Fetch the specific log with related URLs
  // Check if logId is a UUID (contains hyphens) or numeric ID
  // UUIDs should query by public_id, numeric IDs should query by id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(logId);
  
  let query = supabase
    .from("logs")
    .select(`
      *,
      log_urls (
        url_id,
        urls (
          id,
          url,
          project_id
        )
      )
    `)
    .eq("project_id", projectId);
  
  // Query by public_id if UUID, otherwise by numeric id
  // This prevents type mismatch errors when UUID is compared to bigint id column
  if (isUuid) {
    query = query.eq("public_id", logId);
  } else {
    // Try to parse as number for numeric ID
    const numericId = parseInt(logId, 10);
    if (!isNaN(numericId)) {
      query = query.eq("id", numericId);
    } else {
      // If it's not a valid UUID or number, try public_id first (safer)
      query = query.eq("public_id", logId);
    }
  }
  
  const { data: log, error: logError } = await query.single();

  if (logError || !log) {
    console.error("Error fetching log by ID:", logError);
    return null;
  }

  // Get user name for this log
  const userIds = [log.created_by].filter(Boolean);
  const userNamesMap = await getUserNamesMap(userIds);
  const userName = userNamesMap[log.created_by] || "Unknown user";

  // Transform the data to flatten URL structure and attach user name
  return {
    ...log,
    created_by: log.created_by,
    user_name: userName,
    urls:
      log.log_urls
        ?.map((lu: any) => ({
          id: lu.urls?.id,
          url: lu.urls?.url,
          project_id: lu.urls?.project_id,
        }))
        .filter((url: any) => url.id && url.url) || [],
  };
}

export async function getUrls(projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Fetch all URLs for this project
  const { data: urls, error: urlsError } = await supabase
    .from("urls")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (urlsError || !urls) {
    console.error("Error fetching urls:", JSON.stringify(urlsError, null, 2));
    return [];
  }

  if (urls.length === 0) {
    return [];
  }

  const urlIds = urls.map((u: any) => u.id as string);
  const urlIdSet = new Set(urlIds);

  // Count related logs per URL and compute last tracked date
  const { data: logsForUrls, error: logsForUrlsError } = await supabase
    .from("logs")
    .select(
      `
        id,
        created_at,
        log_urls (
          url_id
        )
      `,
    )
    .eq("project_id", projectId);

  const logCounts: Record<string, number> = {};
  const lastTrackedMap: Record<string, string> = {};

  if (!logsForUrlsError && logsForUrls) {
    for (const log of logsForUrls as any[]) {
      const createdAt = log.created_at as string;
      const links = (log.log_urls || []) as Array<{ url_id: string }>;
      for (const link of links) {
        const urlId = link.url_id;
        if (!urlIdSet.has(urlId)) continue;
        logCounts[urlId] = (logCounts[urlId] || 0) + 1;
        const prev = lastTrackedMap[urlId];
        if (!prev || new Date(createdAt) > new Date(prev)) {
          lastTrackedMap[urlId] = createdAt;
        }
      }
    }
  } else if (logsForUrlsError) {
    console.error(
      "Error fetching logs for url stats:",
      JSON.stringify(logsForUrlsError, null, 2),
    );
  }

  // Count related active tasks (status != 'Done') per URL
  const { data: tasksForUrls, error: tasksForUrlsError } = await supabase
    .from("tasks")
    .select("id, status, url_id")
    .eq("project_id", projectId)
    .neq("status", "Done")
    .in("url_id", urlIds);

  const activeTaskCounts: Record<string, number> = {};

  if (!tasksForUrlsError && tasksForUrls) {
    for (const task of tasksForUrls as any[]) {
      const urlId = task.url_id as string | null;
      if (!urlId || !urlIdSet.has(urlId)) continue;
      activeTaskCounts[urlId] = (activeTaskCounts[urlId] || 0) + 1;
    }
  } else if (tasksForUrlsError) {
    console.error(
      "Error fetching tasks for url stats:",
      JSON.stringify(tasksForUrlsError, null, 2),
    );
  }

  // Get monitoring status for all URLs
  const { data: monitor } = await supabase
    .from("monitors")
    .select("id, frequency, is_active")
    .eq("project_id", projectId)
    .eq("name", "Default Monitor")
    .maybeSingle();

  const monitoringStatusMap: Record<string, { isMonitored: boolean; frequency: string | null }> = {};
  
  if (monitor) {
    const { data: monitorUrls } = await supabase
      .from("monitor_urls")
      .select("url_id")
      .eq("monitor_id", monitor.id)
      .in("url_id", urlIds);

    if (monitorUrls) {
      const monitoredUrlIds = new Set(monitorUrls.map((mu: any) => mu.url_id));
      urlIds.forEach((urlId) => {
        monitoringStatusMap[urlId] = {
          isMonitored: monitoredUrlIds.has(urlId),
          frequency: monitor.is_active ? monitor.frequency : null,
        };
      });
    }
  }

  // Combine base URL data with computed stats
  return urls.map((url: any) => {
    const id = url.id as string;
    const monitoringStatus = monitoringStatusMap[id] || { isMonitored: false, frequency: null };
    return {
      ...url,
      log_count: logCounts[id] || 0,
      active_task_count: activeTaskCounts[id] || 0,
      last_tracked_at: lastTrackedMap[id] || null,
      is_monitored: monitoringStatus.isMonitored,
      monitoring_frequency: monitoringStatus.frequency,
    };
  });
}

export async function getUrlDetails(urlId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // Fetch the URL record
  const { data: url, error: urlError } = await supabase
    .from("urls")
    .select("*")
    .eq("id", urlId)
    .single();

  if (urlError || !url) {
    console.error("Error fetching URL:", JSON.stringify(urlError, null, 2));
    return null;
  }

  // Fetch all logs connected to this URL via log_urls
  // First, get all log_ids that reference this url_id
  const { data: logUrls, error: logUrlsError } = await supabase
    .from("log_urls")
    .select("log_id")
    .eq("url_id", urlId);

  let transformedLogs: any[] = [];

  if (!logUrlsError && logUrls && logUrls.length > 0) {
    const logIds = logUrls.map((lu) => lu.log_id);

    // Now fetch the logs with their URLs
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select(`
        *,
        log_urls (
          url_id,
          urls (
            id,
            url,
            project_id
          )
        )
      `)
      .in("id", logIds)
      .order("created_at", { ascending: false });

    if (!logsError && logs) {
      // Get unique user IDs from logs
      const userIds = [...new Set(logs.map((log: any) => log.created_by).filter(Boolean))];
      const userNamesMap = await getUserNamesMap(userIds);

      // Transform the data to flatten URL structure and attach user names
      transformedLogs = logs.map((log: any) => {
        const userName = userNamesMap[log.created_by] || "Unknown user";
        
        return {
          ...log,
          created_by: log.created_by, // Keep the user ID
          user_name: userName, // Add user_name property (never show UUID)
          urls:
            log.log_urls?.map((lu: any) => ({
              id: lu.urls?.id,
              url: lu.urls?.url,
              project_id: lu.urls?.project_id,
            })).filter((url: any) => url.id && url.url) || [],
        };
      });
    } else if (logsError) {
      console.error("Error fetching logs:", JSON.stringify(logsError, null, 2));
    }
  }

  // Fetch tasks linked to this URL
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select(`
      *,
      urls (
        id,
        url,
        project_id
      )
    `)
    .eq("url_id", urlId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (tasksError) {
    console.error("Error fetching tasks:", JSON.stringify(tasksError, null, 2));
    return {
      url,
      logs: transformedLogs,
      tasks: [],
    };
  }

  // Sort tasks: Todo first, then In Progress, then Done
  // Within each status, order by due_date (soonest first)
  const statusOrder = { Todo: 0, "In Progress": 1, Done: 2 };
  const sortedTasks = (tasks || []).sort((a: any, b: any) => {
    const statusDiff = (statusOrder[a.status as keyof typeof statusOrder] ?? 99) - 
                      (statusOrder[b.status as keyof typeof statusOrder] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    
    // If same status, sort by due_date
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });

  return {
    url,
    logs: transformedLogs,
    tasks: sortedTasks,
  };
}

export async function createLog(formData: FormData) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to create a log",
    };
  }

  const projectId = formData.get("projectId") as string;
  const title = formData.get("title") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const urlText = formData.get("urlText") as string;

  if (!projectId || !title) {
    return {
      error: "Project ID and title are required",
    };
  }

  // Insert the new log with explicit UUID for reliable historical linking
  const logId = randomUUID();
  const { data: log, error: logError } = await supabase
    .from("logs")
    .insert({
      id: logId,
      project_id: projectId,
      title,
      category: category || null,
      description: description || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (logError || !log) {
    return {
      error: logError?.message || "Failed to create log",
    };
  }

  // Parse URLs from urlText
  if (urlText && urlText.trim()) {
    // Split by newlines or spaces, then filter and clean
    const urlStrings = urlText
      .split(/\n|\s+/)
      .map((url) => url.trim())
      .filter((url) => {
        // Basic URL validation
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      });

    // Process each URL
    for (const urlString of urlStrings) {
      // Check if URL exists in urls table for this project
      const { data: existingUrl, error: urlCheckError } = await supabase
        .from("urls")
        .select("id")
        .eq("project_id", projectId)
        .eq("url", urlString)
        .single();

      let urlId: string;

      if (existingUrl && !urlCheckError) {
        // URL exists, use its ID
        urlId = existingUrl.id;
      } else {
        // URL doesn't exist, insert it
        const { data: newUrl, error: urlInsertError } = await supabase
          .from("urls")
          .insert({
            project_id: projectId,
            url: urlString,
          })
          .select()
          .single();

        if (urlInsertError || !newUrl) {
          console.error("Error inserting URL:", urlInsertError);
          continue; // Skip this URL and continue with the next one
        }

        urlId = newUrl.id;
      }

      // Create log_urls record
      const { error: logUrlError } = await supabase
        .from("log_urls")
        .insert({
          log_id: log.id,
          url_id: urlId,
        });

      if (logUrlError) {
        console.error("Error creating log_urls record:", logUrlError);
      }
    }
  }

  revalidatePath(`/projects/${projectId}/logs`);
  return { success: true, logId: log.id };
}

export async function getTasks(projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Fetch tasks for the project with related URL, ordered by due_date (soonest first)
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select(`
      *,
      urls (
        id,
        url,
        project_id
      )
    `)
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (tasksError) {
    console.error("Error fetching tasks:", JSON.stringify(tasksError, null, 2));
    return [];
  }

  return tasks || [];
}

export async function createTask(formData: FormData) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to create a task",
    };
  }

  const projectId = formData.get("projectId") as string;
  const title = formData.get("title") as string;
  const status = formData.get("status") as string;
  const priority = formData.get("priority") as string;
  const assigneeId = formData.get("assignee_id") as string;
  const dueDate = formData.get("due_date") as string;
  const urlString = formData.get("url") as string;

  if (!projectId || !title || !status || !priority) {
    return {
      error: "Project ID, title, status, and priority are required",
    };
  }

  // Handle URL if provided
  let urlId: string | null = null;
  if (urlString && urlString.trim()) {
    // Validate URL
    try {
      new URL(urlString);
    } catch {
      return {
        error: "Invalid URL format",
      };
    }

    // Check if URL exists in urls table for this project
    const { data: existingUrl, error: urlCheckError } = await supabase
      .from("urls")
      .select("id")
      .eq("project_id", projectId)
      .eq("url", urlString.trim())
      .single();

    if (existingUrl && !urlCheckError) {
      // URL exists, use its ID
      urlId = existingUrl.id;
    } else {
      // URL doesn't exist, insert it
      const { data: newUrl, error: urlInsertError } = await supabase
        .from("urls")
        .insert({
          project_id: projectId,
          url: urlString.trim(),
        })
        .select()
        .single();

      if (urlInsertError || !newUrl) {
        console.error("Error inserting URL:", urlInsertError);
        return {
          error: "Failed to create URL. Please try again.",
        };
      }

      urlId = newUrl.id;
    }
  }

  // Insert the new task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title,
      status,
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      url_id: urlId,
      created_by: user.id,
    })
    .select()
    .single();

  if (taskError || !task) {
    return {
      error: taskError?.message || "Failed to create task",
    };
  }

  revalidatePath(`/projects/${projectId}/tasks`);
  return { success: true, taskId: task.id };
}

export async function updateTaskStatus(taskId: string, newStatus: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update a task",
    };
  }

  // Update the task status
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId)
    .select()
    .single();

  if (taskError || !task) {
    return {
      error: taskError?.message || "Failed to update task",
    };
  }

  revalidatePath(`/projects/${task.project_id}/tasks`);
  return { success: true };
}

export async function getProjectStats(projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // Run all queries in parallel
  const [logsCount, urlsCount, activeTasksCount, recentLogs] = await Promise.all([
    // Total Logs count
    supabase
      .from("logs")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),

    // Total URLs count
    supabase
      .from("urls")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),

    // Active Tasks count (status != 'Done')
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .neq("status", "Done"),

    // Recent Activity: 5 most recent logs with URLs
    supabase
      .from("logs")
      .select(`
        *,
        log_urls (
          url_id,
          urls (
            id,
            url,
            project_id
          )
        )
      `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Get unique user IDs from recent logs
  const recentLogsData = recentLogs.data || [];
  const userIds = [...new Set(recentLogsData.map((log: any) => log.created_by).filter(Boolean))];
  const userNamesMap = await getUserNamesMap(userIds);

  // Transform recent logs to flatten URL structure and attach user names
  const transformedRecentLogs = recentLogsData.map((log: any) => {
    const userName = userNamesMap[log.created_by] || "Unknown user";
    
    return {
      ...log,
      created_by: log.created_by, // Keep the user ID
      user_name: userName, // Add user_name property (never show UUID)
      urls:
        log.log_urls?.map((lu: any) => ({
          id: lu.urls?.id,
          url: lu.urls?.url,
          project_id: lu.urls?.project_id,
        })).filter((url: any) => url.id && url.url) || [],
    };
  });

  return {
    totalLogs: logsCount.count || 0,
    totalUrls: urlsCount.count || 0,
    activeTasks: activeTasksCount.count || 0,
    recentActivity: transformedRecentLogs,
  };
}

export async function getTeamMembers(workspaceId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Call the secure RPC function to get team data with emails
  const { data: teamData, error: rpcError } = await supabase.rpc(
    "get_workspace_team_data",
    {
      lookup_workspace_id: workspaceId,
    }
  );

  if (rpcError) {
    console.error("Error fetching team members via RPC:", JSON.stringify(rpcError, null, 2));
    return [];
  }

  if (!teamData || teamData.length === 0) {
    return [];
  }

  // Transform the data to match the expected interface
  // The RPC function now returns member_id directly
  return teamData.map((member: any) => ({
    userId: member.user_id,
    email: member.email || "Unknown",
    role: member.role,
    joinedAt: member.joined_at,
    member_id: member.member_id, // Directly from RPC result
  }));
}

export async function inviteMember(email: string, role: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to invite members",
    };
  }

  // Get user's workspace
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace to invite members",
    };
  }

  // Validate role
  const validRoles = ["owner", "admin", "member", "viewer"];
  if (!validRoles.includes(role)) {
    return {
      error: "Invalid role. Must be one of: owner, admin, member, viewer",
    };
  }

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      error: "Email is required",
    };
  }

  // Query users_sanitized view to find user by email
  // Golden Rule: Always use users_sanitized for email-to-user_id lookups
  const { data: userData, error: userLookupError } = await supabase
    .from("users_sanitized")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  let userId: string | null = null;

  if (userLookupError) {
    console.error("Error looking up user in users_sanitized:", userLookupError);
  } else if (userData?.id) {
    userId = userData.id;
  }

  if (!userId) {
    // User not found - create a pending invitation
    // Check if invitation already exists
    const { data: existingInvitation, error: checkInviteError } = await supabase
      .from("invitations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", email.trim())
      .single();

    if (checkInviteError && checkInviteError.code !== "PGRST116") {
      // PGRST116 is "not found" which is expected if invitation doesn't exist
      console.error("Error checking existing invitation:", checkInviteError);
      return {
        error: "Failed to check invitation. Please try again.",
      };
    }

    if (existingInvitation) {
      return {
        error: "An invitation has already been sent to this email address.",
      };
    }

    // Create invitation (normalize email to lowercase for consistent matching)
    const { data: invitation, error: invitationError } = await supabase
      .from("invitations")
      .insert({
        workspace_id: workspaceId,
        email: normalizedEmail,
        role: role,
      })
      .select()
      .single();

    if (invitationError) {
      console.error("Error creating invitation:", invitationError);
      return {
        error: invitationError.message || "Failed to create invitation",
      };
    }

    revalidatePath("/team");
    return {
      success: true,
      message: "Invite sent! (User pending)",
      invitation,
    };
  }

  // Check if user is already a member of this workspace
  const { data: existingMembership, error: checkError } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    // PGRST116 is "not found" which is expected if user is not a member
    console.error("Error checking existing membership:", checkError);
    return {
      error: "Failed to check membership. Please try again.",
    };
  }

  if (existingMembership) {
    return {
      error: "User is already a member of this workspace",
    };
  }

  // Add user to workspace
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      role: role,
    })
    .select()
    .single();

  if (membershipError) {
    console.error("Error adding member to workspace:", membershipError);
    return {
      error: membershipError.message || "Failed to add member",
    };
  }

  revalidatePath("/team");
  return { success: true, membership };
}

/**
 * Remove a member from the workspace
 * Prevents removal of owners - even admins cannot remove owners
 * @param memberId - The workspace_members.id of the member to remove
 * @returns Success or error response
 */
export async function removeMember(memberId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to remove members",
    };
  }

  // Get user's workspace
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace to remove members",
    };
  }

  // Verify current user has permission (admin/owner)
  const { data: currentUserMembership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !currentUserMembership) {
    return {
      error: "Unable to verify your permissions",
    };
  }

  if (currentUserMembership.role !== "owner" && currentUserMembership.role !== "admin") {
    return {
      error: "Only workspace admins and owners can remove members",
    };
  }

  // Get the target member's information to check their role
  const { data: targetMember, error: targetError } = await supabase
    .from("workspace_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (targetError || !targetMember) {
    return {
      error: "Member not found",
    };
  }

  // Backend protection: Prevent removal of owners
  if (targetMember.role === "owner") {
    return {
      error: "Cannot remove workspace owner. Owners cannot be removed from the workspace.",
    };
  }

  // Prevent self-removal (optional safety check)
  if (targetMember.user_id === user.id) {
    return {
      error: "You cannot remove yourself from the workspace",
    };
  }

  // Remove the member
  const { error: deleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("id", memberId)
    .eq("workspace_id", workspaceId);

  if (deleteError) {
    console.error("Error removing member:", deleteError);
    return {
      error: deleteError.message || "Failed to remove member. Please try again.",
    };
  }

  revalidatePath("/team");
  return { success: true };
}

/**
 * Get dashboard statistics for the current workspace
 * Returns project count, monitored URLs count, weekly activity count, and recent logs
 */
export async function getDashboardStats() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      totalProjects: 0,
      monitoredUrls: 0,
      weeklyActivity: 0,
      openTasks: 0,
      recentLogs: [],
    };
  }

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      totalProjects: 0,
      monitoredUrls: 0,
      weeklyActivity: 0,
      openTasks: 0,
      recentLogs: [],
    };
  }

  // Calculate date 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoISO = sevenDaysAgo.toISOString();

  // First, get all project IDs for this workspace
  const { data: workspaceProjects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (projectsError) {
    console.error("Error fetching workspace projects:", projectsError);
    return {
      totalProjects: 0,
      monitoredUrls: 0,
      weeklyActivity: 0,
      openTasks: 0,
      recentLogs: [],
    };
  }

  const projectIds = workspaceProjects?.map((p) => p.id) || [];

  if (projectIds.length === 0) {
    return {
      totalProjects: 0,
      monitoredUrls: 0,
      weeklyActivity: 0,
      openTasks: 0,
      recentLogs: [],
    };
  }

  // Run queries in parallel for better performance
  const [
    projectsCount,
    workspaceUrls,
    weeklyLogsCount,
    recentLogsData,
  ] = await Promise.all([
    // 1. Total count of projects in workspace
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),

    // 2. Get all URLs for workspace projects (to count monitored ones)
    supabase
      .from("urls")
      .select("id")
      .in("project_id", projectIds),

    // 3. Count of logs created in the last 7 days
    supabase
      .from("logs")
      .select("*", { count: "exact", head: true })
      .in("project_id", projectIds)
      .gte("created_at", sevenDaysAgoISO),

    // 4. 10 most recent logs with project and user info
    supabase
      .from("logs")
      .select(`
        *,
        projects (
          id,
          name,
          workspace_id
        ),
        log_urls (
          url_id,
          urls (
            id,
            url,
            project_id
          )
        )
      `)
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Count monitored URLs separately
  let monitoredUrlsCount = 0;
  if (workspaceUrls.data && workspaceUrls.data.length > 0) {
    const urlIds = workspaceUrls.data.map((u: any) => u.id);
    const { count: monitorCount } = await supabase
      .from("monitor_urls")
      .select("*", { count: "exact", head: true })
      .in("url_id", urlIds);
    monitoredUrlsCount = monitorCount || 0;
  }

  // Get unique user IDs from recent logs
  const recentLogs = recentLogsData.data || [];
  const userIds = [...new Set(recentLogs.map((log: any) => log.created_by).filter(Boolean))];
  const userNamesMap = await getUserNamesMap(userIds);

  // Transform recent logs to include user_name and project_name
  const transformedLogs = recentLogs.map((log: any) => {
    const userName = userNamesMap[log.created_by] || "Unknown user";
    
    return {
      ...log,
      created_by: log.created_by, // Keep the user ID
      user_name: userName, // Add user_name property
      project_name: log.projects?.name || "Unknown Project",
      urls:
        log.log_urls
          ?.map((lu: any) => ({
            id: lu.urls?.id,
            url: lu.urls?.url,
            project_id: lu.urls?.project_id,
          }))
          .filter((url: any) => url.id && url.url) || [],
    };
  });

  // Count open tasks (status != 'Done') for workspace projects
  const { count: openTasksCount } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .in("project_id", projectIds)
    .neq("status", "Done");

  return {
    totalProjects: projectsCount.count || 0,
    monitoredUrls: monitoredUrlsCount,
    weeklyActivity: weeklyLogsCount.count || 0,
    openTasks: openTasksCount || 0,
    recentLogs: transformedLogs,
  };
}

export async function getPendingInvitations(workspaceId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Fetch pending invitations for the workspace
  const { data: invitations, error: invitationsError } = await supabase
    .from("invitations")
    .select("id, email, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (invitationsError) {
    console.error("Error fetching invitations:", JSON.stringify(invitationsError, null, 2));
    return [];
  }

  return invitations || [];
}

export async function revokeInvitation(invitationId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to revoke invitations",
    };
  }

  // Get user's workspace to verify they have permission
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace to revoke invitations",
    };
  }

  // Verify the invitation belongs to the user's workspace
  const { data: invitation, error: checkError } = await supabase
    .from("invitations")
    .select("workspace_id")
    .eq("id", invitationId)
    .single();

  if (checkError || !invitation) {
    return {
      error: "Invitation not found",
    };
  }

  if (invitation.workspace_id !== workspaceId) {
    return {
      error: "You don't have permission to revoke this invitation",
    };
  }

  // Delete the invitation
  const { error: deleteError } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (deleteError) {
    console.error("Error revoking invitation:", deleteError);
    return {
      error: deleteError.message || "Failed to revoke invitation",
    };
  }

  revalidatePath("/team");
  return { success: true };
}

/**
 * Toggle URL monitoring on/off
 * Creates or finds the default monitor for the project and adds/removes the URL
 */
export async function toggleUrlMonitoring(
  urlId: string,
  shouldMonitor: boolean
) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to toggle monitoring",
    };
  }

  // Get the URL to find its project_id
  const { data: urlRecord, error: urlError } = await supabase
    .from("urls")
    .select("project_id")
    .eq("id", urlId)
    .single();

  if (urlError || !urlRecord) {
    return {
      error: "URL not found",
    };
  }

  const projectId = urlRecord.project_id;

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return {
      error: "You must belong to a workspace",
    };
  }

  // Find or create the default monitor for this project
  let { data: monitor, error: monitorError } = await supabase
    .from("monitors")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", "Default Monitor")
    .maybeSingle();

  if (monitorError && monitorError.code !== "PGRST116") {
    console.error("Error fetching monitor:", monitorError);
    return {
      error: "Failed to fetch monitor",
    };
  }

  if (!monitor) {
    // When creating a new monitor, set next_run_at to NOW() so it runs immediately
    const now = new Date().toISOString();
    
    // Create default monitor
    const { data: newMonitor, error: createError } = await supabase
      .from("monitors")
      .insert({
        project_id: projectId,
        name: "Default Monitor",
        is_active: true,
        frequency: "Daily",
        next_run_at: now, // Set to NOW() for immediate execution
      })
      .select()
      .single();

    if (createError || !newMonitor) {
      console.error("Error creating monitor:", createError);
      return {
        error: "Failed to create monitor",
      };
    }

    monitor = newMonitor;
  }

  // Ensure monitor exists before using it
  if (!monitor) {
    return {
      error: "Monitor not found or could not be created",
    };
  }

  if (shouldMonitor) {
    // Insert into monitor_urls (use upsert to handle duplicates)
    const { error: insertError } = await supabase
      .from("monitor_urls")
      .upsert(
        {
          monitor_id: monitor.id,
          url_id: urlId,
          last_checked_at: null,
        },
        { onConflict: "monitor_id,url_id" }
      );

    if (insertError) {
      console.error("Error enabling monitoring:", insertError);
      return {
        error: "Failed to enable monitoring",
      };
    }

    // Update monitor's next_run_at to NOW() so it runs immediately
    if (monitor) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("monitors")
        .update({
          next_run_at: now,
        })
        .eq("id", monitor.id);

      if (updateError) {
        console.error("Error updating monitor next_run_at:", updateError);
        // Don't fail the whole operation, just log the error
      }
    }
  } else {
    // Delete from monitor_urls
    if (monitor) {
      const { error: deleteError } = await supabase
        .from("monitor_urls")
        .delete()
        .eq("monitor_id", monitor.id)
        .eq("url_id", urlId);

      if (deleteError) {
        console.error("Error disabling monitoring:", deleteError);
        return {
          error: "Failed to disable monitoring",
        };
      }
    }
  }

  revalidatePath(`/projects/${projectId}/urls`);
  return { success: true };
}

/**
 * Calculate next run time based on frequency
 */
function calculateNextRunAt(frequency: string | null): Date {
  const now = new Date();
  const nextRun = new Date(now);

  switch (frequency?.toLowerCase()) {
    case "daily":
      nextRun.setDate(nextRun.getDate() + 1);
      break;
    case "weekly":
      nextRun.setDate(nextRun.getDate() + 7);
      break;
    case "monthly":
      nextRun.setMonth(nextRun.getMonth() + 1);
      break;
    default:
      // Default to daily if not specified
      nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun;
}

/**
 * Get workspace credits for the current user's active workspace
 * If plan === 'pro', returns -1 to indicate unlimited credits
 */
export async function getWorkspaceCredits(): Promise<number> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return 0;
  }

  // Get user's active workspace
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return 0;
  }

  // Get workspace plan
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("plan")
    .eq("id", workspaceId)
    .single();

  if (workspaceError || !workspace) {
    console.error("Error fetching workspace:", workspaceError);
    return 0;
  }

  // If plan is 'pro', allow unlimited runs
  if (workspace.plan === 'pro') {
    return -1; // -1 indicates unlimited
  }

  // For other plans, return 0 (no credits available)
  return 0;
}

/**
 * Deduct credits from workspace (for manual verification)
 * If plan === 'pro', always returns success without deducting
 */
export async function deductWorkspaceCredits(amount: number = 1): Promise<{ success: boolean; error?: string; remainingCredits?: number }> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be logged in" };
  }

  // Get user's active workspace
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return { success: false, error: "No active workspace found" };
  }

  // Get workspace plan
  const { data: workspace, error: fetchError } = await supabase
    .from("workspaces")
    .select("plan")
    .eq("id", workspaceId)
    .single();

  if (fetchError || !workspace) {
    return { success: false, error: "Failed to fetch workspace" };
  }

  // If plan is 'pro', allow unlimited runs without deducting
  if (workspace.plan === 'pro') {
    return { 
      success: true, 
      remainingCredits: -1 // -1 indicates unlimited
    };
  }

  // For other plans, return error (no credits available)
  return { 
    success: false, 
    error: "Insufficient credits. Upgrade to Pro for unlimited manual scans." 
  };
}

/**
 * Process automated checks for all due monitors
 * Manual verification is allowed based on workspace plan (pro = unlimited)
 */
export async function processAutomatedChecks(isManual: boolean = false) {
  const supabase = await createClient();

  try {
    // Manual verification is allowed for all users (plan-based restrictions handled elsewhere)
    // Find all active monitors that are due to run
    // Use UTC timestamp for comparison (ISO strings are always UTC)
    const now = new Date();
    const nowISO = now.toISOString();
    
    console.log(`[processAutomatedChecks] Checking for due monitors at ${nowISO} (UTC)`);
    
    // First, get all active monitors to debug
    const { data: allActiveMonitors, error: allMonitorsError } = await supabase
      .from("monitors")
      .select("id, project_id, frequency, name, next_run_at, is_active")
      .eq("is_active", true);

    if (allMonitorsError) {
      console.error("Error fetching all active monitors:", allMonitorsError);
    } else {
      console.log(`[processAutomatedChecks] Found ${allActiveMonitors?.length || 0} active monitors total`);
      if (allActiveMonitors && allActiveMonitors.length > 0) {
        allActiveMonitors.forEach((m: any) => {
          console.log(`  - Monitor ${m.id} (${m.name}): next_run_at = ${m.next_run_at}, is_due = ${m.next_run_at && m.next_run_at <= nowISO}`);
        });
      }
    }

    // Now get only due monitors
    const { data: dueMonitors, error: monitorsError } = await supabase
      .from("monitors")
      .select("id, project_id, frequency, name, next_run_at")
      .eq("is_active", true)
      .lte("next_run_at", nowISO);

    if (monitorsError) {
      console.error("Error fetching due monitors:", monitorsError);
      return {
        error: "Failed to fetch due monitors",
        processed: 0,
        changesDetected: 0,
      };
    }

    if (!dueMonitors || dueMonitors.length === 0) {
      // Get the next run time for better feedback
      const { data: nextMonitors } = await supabase
        .from("monitors")
        .select("next_run_at")
        .eq("is_active", true)
        .order("next_run_at", { ascending: true })
        .limit(1);

      const nextRunTime = nextMonitors && nextMonitors.length > 0 
        ? nextMonitors[0].next_run_at 
        : null;

      const message = nextRunTime
        ? `No monitors due for checking. Next check scheduled at ${new Date(nextRunTime).toLocaleString()}`
        : "No monitors due for checking. Found 0 monitors where next_run_at <= NOW()";

      console.log(`[processAutomatedChecks] ${message}`);
      
      return {
        success: true,
        processed: 0,
        changesDetected: 0,
        message,
        nextRunTime,
      };
    }

    console.log(`[processAutomatedChecks] Found ${dueMonitors.length} monitor(s) due for checking`);

    let totalProcessed = 0;
    let totalChangesDetected = 0;
    const detailedChanges: Array<{ url: string; changes: Array<{ field: string; old: string | null; new: string | null; category: string }> }> = [];

    // Process each monitor
    for (const monitor of dueMonitors) {
      // Get all URLs linked to this monitor
      const { data: monitorUrls, error: urlsError } = await supabase
        .from("monitor_urls")
        .select("url_id, urls(id, url, project_id)")
        .eq("monitor_id", monitor.id);

      const totalUrls = monitorUrls?.length || 0;

      // Always create a monitor run record, even if there are zero URLs or errors
      // This ensures users see something in the history instead of just terminal errors
      // Status must be one of: 'running', 'completed', or 'failed'
      const { data: monitorRun, error: runError } = await supabase
        .from("monitor_runs")
        .insert({
          monitor_id: monitor.id,
          started_at: new Date().toISOString(),
          status: "running", // Use 'running' instead of 'queue' to match database constraint
          total_urls: totalUrls,
        })
        .select()
        .single();

      if (runError || !monitorRun) {
        console.error(`Error creating monitor run for ${monitor.id}:`, runError);
        // If we can't create a run record, skip this monitor but log the error
        continue;
      }

      // Handle case where there are zero URLs or fetch error
      if (urlsError || !monitorUrls || monitorUrls.length === 0) {
        console.error(`Error fetching URLs for monitor ${monitor.id} or no URLs found:`, urlsError);
        
        // Update the run record to show it failed/empty
        const emptyStatus = urlsError ? "failed" : "completed";
        const emptyResult = urlsError 
          ? `❌ Error: Failed to fetch URLs` 
          : `ℹ️ Empty: No URLs configured for monitoring`;
        
        await supabase
          .from("monitor_runs")
          .update({
            completed_at: new Date().toISOString(),
            status: emptyStatus,
            urls_checked: 0,
            changes_detected: 0,
            total_urls: 0,
            result: emptyResult,
            errors: urlsError ? [`Error fetching URLs: ${urlsError.message || 'Unknown error'}`] : ["No URLs configured for this monitor"],
          })
          .eq("id", monitorRun.id);
        
        continue;
      }

      // Update status to running
      await supabase
        .from("monitor_runs")
        .update({ status: "running" })
        .eq("id", monitorRun.id);

      // Track stats for this run
      let urlsCheckedCount = 0;
      let runChangesDetected = 0; // Count of URLs with changes in this run
      const runErrors: string[] = [];

      // Process URLs in batches of 5 to prevent timeouts
      const BATCH_SIZE = 5;
      const urlBatches: typeof monitorUrls[] = [];
      
      for (let i = 0; i < monitorUrls.length; i += BATCH_SIZE) {
        urlBatches.push(monitorUrls.slice(i, i + BATCH_SIZE));
      }

      // Wrap URL processing in try/finally to ensure monitor_run is always updated
      try {
        // Process each batch
        for (const batch of urlBatches) {
          // Process batch in parallel
          const batchPromises = batch.map(async (monitorUrl) => {
            const urlId = monitorUrl.url_id;
            const urlData = monitorUrl.urls as any;
            const projectId = urlData?.project_id || monitor.project_id;

            if (!urlId || !projectId) {
              runErrors.push(`Invalid URL data for monitor ${monitor.id}`);
              return null;
            }

            try {
              // Use the existing checkUrl function from monitoring.ts
              // This function already creates logs and links them to URLs
              const { checkUrl } = await import("@/lib/monitoring");
              const result = await checkUrl(urlId, projectId);

              // Increment the count for each URL processed
              urlsCheckedCount++;

              if (result.changed && result.url && result.changes) {
                runChangesDetected++;
                totalChangesDetected++;
                // Collect detailed change information
                detailedChanges.push({
                  url: result.url,
                  changes: result.changes
                });
              }

              if (result.error) {
                runErrors.push(`Error checking URL ${urlId}: ${result.error}`);
              }

              totalProcessed++;
              return { success: true };
            } catch (error) {
              // Still count this URL as checked even if it errored
              urlsCheckedCount++;
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              runErrors.push(`Error checking URL ${urlId}: ${errorMessage}`);
              console.error(`Error checking URL ${urlId}:`, error);
              return { success: false };
            }
          });

          // Wait for batch to complete
          await Promise.all(batchPromises);

          // Update progress in monitor_run with current progress
          await supabase
            .from("monitor_runs")
            .update({
              urls_checked: urlsCheckedCount,
              total_urls: totalUrls, // Include total_urls in progress updates
              status: "running", // Keep status as running during processing
            })
            .eq("id", monitorRun.id);
        }
      } finally {
        // Always update the monitor_run record, even if errors occurred
        // Status must be one of: 'running', 'completed', or 'failed'
        const finalStatus = runErrors.length > 0 ? "failed" : "completed";
        
        // Set result based on findings
        let result: string;
        if (runChangesDetected === 0) {
          result = "✅ Stable: 0 Changes";
        } else {
          result = `⚠️ Alert: ${runChangesDetected} Change${runChangesDetected !== 1 ? 's' : ''} Detected`;
        }
        
        const { error: updateRunError } = await supabase
          .from("monitor_runs")
          .update({
            completed_at: new Date().toISOString(),
            status: finalStatus,
            urls_checked: urlsCheckedCount, // Use actual count, not monitorUrls.length
            changes_detected: runChangesDetected, // Count of URLs with changes
            total_urls: totalUrls, // Ensure total_urls is included in update
            result: result, // Set smart result message
            errors: runErrors.length > 0 ? runErrors : null,
          })
          .eq("id", monitorRun.id);

        if (updateRunError) {
          console.error(`Error updating monitor run ${monitorRun.id}:`, updateRunError);
        } else {
          console.log(`[processAutomatedChecks] Updated monitor_run ${monitorRun.id}: ${urlsCheckedCount} URLs checked, ${runChangesDetected} changes detected`);
        }
      }

      // Check if email alerts are enabled and trigger notifications if changes detected
      // Wrap in separate try/catch to ensure scan succeeds even if notifications fail
      if (runChangesDetected > 0) {
        try {
          // Check if email alerts are enabled for this project
          const { data: project, error: projectError } = await supabase
            .from("projects")
            .select("email_alerts_enabled")
            .eq("id", monitor.project_id)
            .single();

          if (!projectError && project && project.email_alerts_enabled) {
            // Call createPendingNotifications - it never throws, but wrap in try/catch for extra safety
            try {
              await createPendingNotifications(monitor.project_id, monitorRun.id);
              
              // Send emails for pending notifications
              await sendPendingEmailNotifications(monitor.project_id, monitorRun.id);
            } catch (notificationError) {
              // Log but don't abort - createPendingNotifications should never throw, but just in case
              console.error(`[processAutomatedChecks] Notification error (non-fatal) for project ${monitor.project_id}:`, notificationError);
            }
          }
        } catch (notificationError) {
          // Don't crash the scraper if notifications fail - user should see successful scan
          console.error(`[processAutomatedChecks] Error checking email alerts for project ${monitor.project_id}:`, notificationError);
        }
      }

      // Update monitor schedule
      const nextRunAt = calculateNextRunAt(monitor.frequency);
      const { error: updateMonitorError } = await supabase
        .from("monitors")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt.toISOString(),
        })
        .eq("id", monitor.id);

      if (updateMonitorError) {
        console.error(`Error updating monitor ${monitor.id} schedule:`, updateMonitorError);
      }
    }

    // Get next run time for feedback
    const { data: nextMonitors } = await supabase
      .from("monitors")
      .select("next_run_at")
      .eq("is_active", true)
      .order("next_run_at", { ascending: true })
      .limit(1);

    const nextRunTime = nextMonitors && nextMonitors.length > 0 
      ? nextMonitors[0].next_run_at 
      : null;

    const message = isManual 
      ? `Manual verification completed. Processed ${totalProcessed} URL(s). ${totalChangesDetected} change(s) detected.`
      : `Checked ${dueMonitors.length} monitor(s), processed ${totalProcessed} URL(s). ${totalChangesDetected} change(s) detected.${nextRunTime ? ` Next check at ${new Date(nextRunTime).toLocaleString()}` : ''}`;

    console.log(`[processAutomatedChecks] ${message}`);
    
    return {
      success: true,
      processed: totalProcessed,
      changesDetected: totalChangesDetected,
      monitorsProcessed: dueMonitors.length,
      message,
      nextRunTime,
      detailedChanges: isManual ? detailedChanges : undefined, // Only return detailed changes for manual verification
    };
  } catch (error) {
    console.error("Error in processAutomatedChecks:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      processed: 0,
      changesDetected: 0,
    };
  }
}

/**
 * Create pending notifications for project members when monitoring detects changes
 * Uses standardized user lookup: getProjectMembers fetches emails from users_sanitized and names from profiles
 * Only creates logs for members where receive_alerts === true
 * Never throws - logs errors but allows scan to complete successfully
 */
async function createPendingNotifications(
  projectId: string,
  runId: string
): Promise<void> {
  const supabase = await createClient();

  try {
    // Fetch Owners, Admins, and Viewers using standardized getProjectMembers
    // This uses users_sanitized for emails and profiles for full_name
    const allMembers = await getProjectMembers(projectId);

    if (!allMembers || allMembers.length === 0) {
      console.log(`[createPendingNotifications] No project members found for project ${projectId}`);
      return;
    }

    // Filtering: Only create logs for members where receive_alerts === true
    const alertRecipients = allMembers.filter((member) => member.receiveAlerts === true);

    if (alertRecipients.length === 0) {
      console.log(`[createPendingNotifications] No project members with receive_alerts=true for project ${projectId}`);
      return;
    }

    // For every member with receive_alerts: true, insert a row into notification_logs
    // Database columns: project_id, monitor_run_id, recipient_email, status: 'pending'
    let successCount = 0;
    for (const recipient of alertRecipients) {
      if (!recipient.email || recipient.email === "Unknown User") {
        console.warn(`[createPendingNotifications] Skipping recipient with invalid email: ${recipient.userId}`);
        continue;
      }

      try {
        const { error: insertError } = await supabase
          .from("notification_logs")
          .insert({
            project_id: projectId,
            monitor_run_id: runId,
            recipient_email: recipient.email,
            status: "pending",
          });

        if (insertError) {
          console.error(`[createPendingNotifications] Error creating notification log for ${recipient.email}:`, insertError);
        } else {
          successCount++;
          console.log(`[createPendingNotifications] Notification queued for: ${recipient.email}`);
        }
      } catch (insertError) {
        // Individual insert errors should not stop the loop
        console.error(`[createPendingNotifications] Exception creating notification log for ${recipient.email}:`, insertError);
      }
    }

    console.log(`[createPendingNotifications] Created ${successCount}/${alertRecipients.length} pending notification(s) for project ${projectId}`);
  } catch (error) {
    // Never throw - log error but allow scan to complete successfully
    console.error(`[createPendingNotifications] Unexpected error (non-fatal):`, error);
    // Don't re-throw - we want the scan to succeed even if notifications fail
  }
}

/**
 * Send email notifications for pending notification_logs entries
 * Fetches pending notifications and sends emails using Resend
 */
export async function sendPendingEmailNotifications(
  projectId: string,
  runId: string
): Promise<void> {
  // Use admin client to bypass RLS policies
  const admin = createSupabaseAdmin();

  try {
    // Wait 1 second to ensure database commits the pending notifications
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Fetch all pending notifications for this project
    // Using admin client to bypass RLS
    console.log(`[Resend] Searching for pending logs in Project: ${projectId} using Admin Client`);
    const { data: pendingNotifications, error: fetchError } = await admin
      .from("notification_logs")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "pending");

    console.log(`[Resend] Found ${pendingNotifications?.length || 0} pending logs using Admin Client. Error:`, fetchError);

    if (fetchError) {
      console.error(`[Resend] Error fetching pending notifications:`, fetchError);
      return;
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log(`[Resend] No pending notifications found for project ${projectId}`);
      return;
    }

    console.log(`[Resend] Found ${pendingNotifications.length} pending notification(s) for project ${projectId}`);

    // Get project name
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error(`[sendPendingEmailNotifications] Error fetching project:`, projectError);
      return;
    }

    const projectName = project.name || "Your Project";

    // Get monitor run details to find the log
    const { data: monitorRun, error: runError } = await admin
      .from("monitor_runs")
      .select("started_at")
      .eq("id", runId)
      .single();

    if (runError || !monitorRun) {
      console.error(`[sendPendingEmailNotifications] Error fetching monitor run:`, runError);
      return;
    }

    // Get the log associated with this run
    const logPublicId = await getLogIdForMonitorRun(projectId, monitorRun.started_at);
    
    if (!logPublicId) {
      console.warn(`[sendPendingEmailNotifications] No log found for monitor run ${runId}`);
      // Still try to send emails, but without a specific log link
    }

    // Get log details including URL and changes
    let logUrl = "";
    let logChanges: Array<{ field: string; oldValue: string; newValue: string }> = [];
    
    if (logPublicId) {
      const logDetails = await getLogById(logPublicId, projectId);
      if (logDetails) {
        // Get the first URL from the log
        if (logDetails.urls && logDetails.urls.length > 0) {
          logUrl = logDetails.urls[0].url;
        }
        
        // Parse changes from the log's changes array
        if (logDetails.changes && Array.isArray(logDetails.changes)) {
          logChanges = logDetails.changes.map((changeStr: string) => {
            // Parse format: "Field: \"old\" → \"new\""
            const match = changeStr.match(/^([^:]+):\s*"([^"]*)"\s*→\s*"([^"]*)"$/);
            if (match) {
              return {
                field: match[1].trim(),
                oldValue: match[2] || "(empty)",
                newValue: match[3] || "(empty)",
              };
            }
            // Fallback for other formats
            return {
              field: changeStr.split(":")[0] || "Change",
              oldValue: "(empty)",
              newValue: "(empty)",
            };
          });
        }
      }
    }

    // Build the highlight link using public_id
    const highlightLink = logPublicId
      ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/projects/${projectId}/logs?highlight=${logPublicId}`
      : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/projects/${projectId}/logs`;

    // Send email for each pending notification
    for (const notification of pendingNotifications) {
      try {
        console.log(`[Resend] Processing notification ${notification.id} for ${notification.recipient_email}`);
        
        // Render the email template to HTML (render returns a Promise)
        const emailHtml = await render(
          SEOAlertEmail({
            projectName,
            url: logUrl || "URL not available",
            changes: logChanges.length > 0 ? logChanges : [{ field: "Changes detected", oldValue: "", newValue: "See dashboard for details" }],
            viewDetailsUrl: highlightLink,
          })
        );

        // Send email via Resend
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "SEO Monitor <onboarding@resend.dev>",
          to: notification.recipient_email,
          subject: `SEO Change Detected: ${projectName}`,
          html: emailHtml,
        });

        if (emailError) {
          console.error(`[Resend] Error sending email to ${notification.recipient_email}:`, emailError);
          // Format error message for storage
          const errorMessage = emailError instanceof Error 
            ? emailError.message 
            : typeof emailError === 'object' && emailError !== null
            ? JSON.stringify(emailError)
            : String(emailError);
          
          // Update status to failed with error message
          console.log(`[Resend] Attempting to update notification ${notification.id} (type: ${typeof notification.id}) to 'failed'`);
          const { data: updateData, error: updateError } = await admin
            .from("notification_logs")
            .update({ 
              status: "failed",
              error_message: errorMessage
            })
            .eq("id", notification.id)
            .select("id, status, error_message");
          
          if (updateError) {
            console.error(`[Resend] Error updating notification ${notification.id} to failed:`, updateError);
            console.error(`[Resend] Update query details - id: ${notification.id}, type: ${typeof notification.id}`);
          } else {
            console.log(`[Resend] Successfully updated notification ${notification.id} to 'failed'. Updated row:`, updateData);
          }
        } else {
          console.log(`[Resend] Email sent successfully to ${notification.recipient_email}, Resend ID: ${emailData?.id}`);
          // Update status to sent immediately to prevent duplicate sends
          console.log(`[Resend] Attempting to update notification ${notification.id} (type: ${typeof notification.id}) to 'sent'`);
          const { data: updateData, error: updateError } = await admin
            .from("notification_logs")
            .update({ status: "sent" })
            .eq("id", notification.id)
            .select("id, status");
          
          if (updateError) {
            console.error(`[Resend] Error updating notification ${notification.id} to sent:`, updateError);
            console.error(`[Resend] Update query details - id: ${notification.id}, type: ${typeof notification.id}`);
          } else {
            console.log(`[Resend] Successfully updated notification ${notification.id} to 'sent'. Updated row:`, updateData);
          }
        }
      } catch (emailError) {
        console.error(`[Resend] Exception sending email to ${notification.recipient_email}:`, emailError);
        // Format error message for storage
        const errorMessage = emailError instanceof Error 
          ? emailError.message 
          : typeof emailError === 'object' && emailError !== null
          ? JSON.stringify(emailError)
          : String(emailError);
        
        // Update status to failed with error message
        console.log(`[Resend] Attempting to update notification ${notification.id} (type: ${typeof notification.id}) to 'failed' after exception`);
        const { data: updateData, error: updateError } = await admin
          .from("notification_logs")
          .update({ 
            status: "failed",
            error_message: errorMessage
          })
          .eq("id", notification.id)
          .select("id, status, error_message");
        
        if (updateError) {
          console.error(`[Resend] Error updating notification ${notification.id} to failed after exception:`, updateError);
          console.error(`[Resend] Update query details - id: ${notification.id}, type: ${typeof notification.id}`);
        } else {
          console.log(`[Resend] Successfully updated notification ${notification.id} to 'failed' after exception. Updated row:`, updateData);
        }
      }
    }

    console.log(`[sendPendingEmailNotifications] Processed ${pendingNotifications.length} notification(s) for project ${projectId}`);
  } catch (error) {
    // Never throw - log error but allow scan to complete successfully
    console.error(`[sendPendingEmailNotifications] Unexpected error (non-fatal):`, error);
    // Don't re-throw - we want the scan to succeed even if email sending fails
  }
}

/**
 * Send email alerts to project members when monitoring detects changes
 * @deprecated This function is being replaced by triggerNotifications
 */
export async function sendProjectAlertEmails(
  projectId: string,
  monitorRunId: string
): Promise<void> {
  const supabase = await createClient();

  // 1. Check if email alerts are enabled for this project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, email_alerts_enabled, workspace_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project || !project.email_alerts_enabled) {
    return; // Email alerts not enabled for this project
  }

  // 2. Get change summary from monitor_runs record
  const { data: monitorRun, error: runError } = await supabase
    .from("monitor_runs")
    .select("id, changes_detected, started_at")
    .eq("id", monitorRunId)
    .single();

  if (runError || !monitorRun || monitorRun.changes_detected === 0) {
    return; // No changes detected or run not found
  }

  // Get the log entries created during this run to build change summary
  const { data: recentLogs } = await supabase
    .from("logs")
    .select("id, title, changes, created_at")
    .eq("project_id", projectId)
    .eq("title", "URL Content Changed")
    .gte("created_at", monitorRun.started_at)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!recentLogs || recentLogs.length === 0) {
    return; // No logs found
  }

  // Build change summary from logs (Red/Green diff format)
  const changeSummary = recentLogs
    .map((log: any) => {
      const changes = Array.isArray(log.changes) 
        ? log.changes.join("; ") 
        : log.changes || "Changes detected";
      return changes;
    })
    .join("\n\n");

  // 3. Get all project members (includes project_memberships owners, project_members viewers, and workspace_members admins)
  const allMembers = await getProjectMembers(projectId);

  if (!allMembers || allMembers.length === 0) {
    console.log(`[sendProjectAlertEmails] No project members found for project ${projectId}`);
    return;
  }

  // Filter to only members with receive_alerts = true
  const alertRecipients = allMembers.filter((member) => member.receiveAlerts);

  if (alertRecipients.length === 0) {
    console.log(`[sendProjectAlertEmails] No project members with receive_alerts=true for project ${projectId}`);
    return; // No members want alerts
  }

  // 4. Loop through recipients and create notification_logs records
  for (const member of alertRecipients) {
    if (!member.email || member.email === "Unknown") {
      console.warn(`[sendProjectAlertEmails] No email found for user ${member.userId}`);
      continue;
    }

    // Create notification record in notification_logs table
    const { data: notification, error: notificationError } = await supabase
      .from("notification_logs")
      .insert({
        project_id: projectId,
        monitor_run_id: monitorRunId,
        recipient_email: member.email,
        status: "sent",
      })
      .select()
      .single();

    if (notificationError) {
      console.error(`[sendProjectAlertEmails] Error creating notification for ${member.email}:`, JSON.stringify(notificationError, null, 2));
      continue;
    }

    // 5. Placeholder: Log simulated email
    console.log(`[SIMULATED EMAIL SENT]`);
    console.log(`To: ${member.email}`);
    console.log(`Subject: SEO Alert: Changes Detected in ${project.name}`);
    console.log(`Project: ${project.name}`);
    console.log(`Monitor Run ID: ${monitorRunId}`);
    console.log(`Changes Detected: ${monitorRun.changes_detected}`);
    console.log(`\n--- Change Summary (Red/Green Diff) ---\n${changeSummary}\n`);
    console.log(`--- End of Email ---\n`);
  }
}

/**
 * Placeholder function for sending email alerts
 * TODO: Integrate with email service like Resend
 * @deprecated Use sendProjectAlertEmails instead
 */
async function sendEmailAlert(
  projectId: string,
  projectName: string,
  recipientEmail: string,
  changeSummary: string,
  monitorRunId: string,
  logId: string
): Promise<void> {
  const supabase = await createClient();

  const subject = `SEO Alert: Changes Detected in ${projectName}`;
  
  // Log the notification attempt
  const { data: notification, error: notificationError } = await supabase
    .from("notification_logs")
    .insert({
      project_id: projectId,
      monitor_run_id: monitorRunId,
      recipient_email: recipientEmail,
      status: "pending", // Will be updated to 'sent' or 'failed' after actual email send
    })
    .select()
    .single();

  if (notificationError || !notification) {
    console.error("Error logging email notification:", notificationError);
    return;
  }

  // TODO: Replace this with actual email sending logic (e.g., Resend API)
  // Example:
  // try {
  //   await resend.emails.send({
  //     from: 'alerts@yourdomain.com',
  //     to: recipientEmail,
  //     subject: subject,
  //     html: `<h2>SEO Changes Detected</h2><p>Project: ${projectName}</p><pre>${changeSummary}</pre>`,
  //   });
  //   // Update notification status to 'sent'
  //   await supabase.from("notification_logs").update({ status: "sent" }).eq("id", notification.id);
  // } catch (error) {
  //   // Update notification status to 'failed'
  //   await supabase.from("notification_logs").update({ status: "failed" }).eq("id", notification.id);
  // }

  // For now, mark as sent (placeholder - replace with actual email sending)
  await supabase
    .from("notification_logs")
    .update({ status: "sent" })
    .eq("id", notification.id);

  console.log(`[sendEmailAlert] Email notification logged for ${recipientEmail} in project ${projectName}`);
  console.log(`[sendEmailAlert] Change summary: ${changeSummary.substring(0, 100)}...`);
}

/**
 * Update monitor frequency
 */
export async function updateMonitorFrequency(
  monitorId: string,
  frequency: string
) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update monitor frequency",
    };
  }

  // Validate frequency
  const validFrequencies = ["Daily", "Weekly", "Monthly"];
  if (!validFrequencies.includes(frequency)) {
    return {
      error: `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`,
    };
  }

  // Set next_run_at to NOW() so the monitor runs immediately when sync is triggered
  const now = new Date().toISOString();

  // Update monitor
  const { error: updateError } = await supabase
    .from("monitors")
    .update({
      frequency: frequency,
      next_run_at: now, // Set to NOW() for immediate execution
    })
    .eq("id", monitorId);

  if (updateError) {
    console.error("Error updating monitor frequency:", updateError);
    return {
      error: updateError.message || "Failed to update monitor frequency",
    };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Update project name
 */
export async function updateProjectName(
  projectId: string,
  name: string
) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update project settings",
    };
  }

  // Check if user has permission (owner or admin)
  const userRole = await getUserWorkspaceRole();
  if (userRole !== "owner" && userRole !== "admin") {
    return {
      error: "Only workspace owners and admins can update project settings",
    };
  }

  if (!name || !name.trim()) {
    return {
      error: "Project name is required",
    };
  }

  // Update project
  const { error: updateError } = await supabase
    .from("projects")
    .update({ name: name.trim() })
    .eq("id", projectId);

  if (updateError) {
    console.error("Error updating project name:", updateError);
    return {
      error: updateError.message || "Failed to update project name",
    };
  }

  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Update project email alerts setting
 */
export async function updateProjectEmailAlerts(
  projectId: string,
  enabled: boolean
) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update project settings",
    };
  }

  // Check if user has permission (owner or admin)
  const userRole = await getUserWorkspaceRole();
  if (userRole !== "owner" && userRole !== "admin") {
    return {
      error: "Only workspace owners and admins can update project settings",
    };
  }

  // Update project
  const { error: updateError } = await supabase
    .from("projects")
    .update({ email_alerts_enabled: enabled })
    .eq("id", projectId);

  if (updateError) {
    console.error("Error updating project email alerts:", updateError);
    return {
      error: updateError.message || "Failed to update email alerts setting",
    };
  }

  revalidatePath(`/projects/${projectId}/settings`);
  return { success: true };
}

/**
 * Get project members with their alert preferences (Robust Version)
 * Fetches from project_memberships (owners), project_members (viewers), and workspace_members (admins)
 * Merges with user emails, defaults to 'Unknown User' if email lookup fails
 */
export async function getProjectMembers(projectId: string) {
  const supabase = await createClient();

  // Step A: Query projects table to get workspace_id
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    console.error("Error fetching project:", projectError);
    return [];
  }

  // Step B: Query workspace_members for that workspace_id
  // Select: id, user_id, role, receive_alerts
  const { data: workspaceAdminsRaw, error: workspaceError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, receive_alerts")
    .eq("workspace_id", project.workspace_id);

  if (workspaceError) {
    console.error("Error fetching workspace_members:", workspaceError);
  }

  // Step C: Keep existing logic for project_members and project_memberships
  // Fetch Owners (project_memberships)
  const { data: ownersRaw, error: ownersError } = await supabase
    .from("project_memberships")
    .select("user_id, role, receive_alerts")
    .eq("project_id", projectId);

  if (ownersError) {
    console.error("Error fetching project_memberships:", ownersError);
  }

  // Fetch Members (project_members)
  const { data: membersRaw, error: membersError } = await supabase
    .from("project_members")
    .select("id, user_id, role, receive_alerts")
    .eq("project_id", projectId);

  if (membersError) {
    console.error("Error fetching project_members:", membersError);
  }

  // Collect all user_ids from all three sources
  const owners = ownersRaw || [];
  const members = membersRaw || [];
  const workspaceAdmins = workspaceAdminsRaw || [];
  const userIds = new Set<string>();
  
  owners.forEach((owner: any) => {
    if (owner.user_id) userIds.add(owner.user_id);
  });
  
  members.forEach((member: any) => {
    if (member.user_id) userIds.add(member.user_id);
  });

  workspaceAdmins.forEach((admin: any) => {
    if (admin.user_id) userIds.add(admin.user_id);
  });

  // Query public.users_sanitized to get emails and names
  // Golden Rule: Always use users_sanitized for email-to-user_id lookups
  // profiles: PRIMARY source for full_name and avatar_url
  let userEmailMap = new Map<string, string>();
  let userNameMap = new Map<string, string>();
  let userAvatarMap = new Map<string, string | null>();
  
  if (userIds.size > 0) {
    // Parallel fetch: users_sanitized for emails and profiles for full_name + avatar_url
    const [usersResult, profilesResult] = await Promise.all([
      supabase
        .from("users_sanitized")
        .select("id, email, name")
        .in("id", Array.from(userIds)),
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", Array.from(userIds))
    ]);

    // Process users_sanitized results
    if (usersResult.error) {
      console.error("Error fetching user data from users_sanitized:", usersResult.error);
    } else if (usersResult.data) {
      userEmailMap = new Map(
        usersResult.data.map((u: any) => [u.id, u.email])
      );
      // Start with name from users_sanitized (from metadata) as fallback
      userNameMap = new Map(
        usersResult.data.map((u: any) => [u.id, u.name || null])
      );
    }

    // Process profiles results and merge with userNameMap
    // profiles: PRIMARY source for full_name and avatar_url
    if (profilesResult.error) {
      console.error("Error fetching profiles:", profilesResult.error);
    } else if (profilesResult.data) {
      // Merge: profile.full_name takes priority, then users_sanitized.name, then email
      for (const profile of profilesResult.data) {
        if (profile.full_name) {
          userNameMap.set(profile.id, profile.full_name);
        }
        // Store avatar_url from profiles
        userAvatarMap.set(profile.id, profile.avatar_url || null);
      }
    }

    // Final fallback: if name is still null, use email
    for (const userId of userIds) {
      const name = userNameMap.get(userId);
      const email = userEmailMap.get(userId);
      if (!name && email) {
        userNameMap.set(userId, email);
      }
      // Ensure all users have an avatar entry (null if not found)
      if (!userAvatarMap.has(userId)) {
        userAvatarMap.set(userId, null);
      }
    }
  }

  // Merge & Dedupe: Combine all three lists with priority to project-level records
  const finalMembers: Array<{
    id: string;
    userId: string;
    email: string;
    name: string;
    role: string;
    receiveAlerts: boolean;
    sourceTable: string;
    avatarUrl?: string | null;
  }> = [];

  // Track which user_ids we've already added (for deduplication)
  const addedUserIds = new Set<string>();

  // Priority 1: Process Owners (project_memberships) - highest priority
  for (const owner of owners) {
    if (!addedUserIds.has(owner.user_id)) {
      const email = userEmailMap.get(owner.user_id) || "Unknown User";
      const name = userNameMap.get(owner.user_id) || email;
      const avatarUrl = userAvatarMap.get(owner.user_id) || null;
      
      finalMembers.push({
        id: `owner_${owner.user_id}`, // Synthetic ID
        userId: owner.user_id,
        email: email,
        name: name,
        role: owner.role || "owner",
        receiveAlerts: owner.receive_alerts ?? true,
        sourceTable: "project_memberships",
        avatarUrl: avatarUrl,
      });
      addedUserIds.add(owner.user_id);
    }
  }

  // Priority 2: Process Members (project_members) - second priority
  for (const member of members) {
    if (!addedUserIds.has(member.user_id)) {
      const email = userEmailMap.get(member.user_id) || "Unknown User";
      const name = userNameMap.get(member.user_id) || email;
      const avatarUrl = userAvatarMap.get(member.user_id) || null;
      
      finalMembers.push({
        id: member.id, // Actual ID
        userId: member.user_id,
        email: email,
        name: name,
        role: member.role || "viewer",
        receiveAlerts: member.receive_alerts ?? true,
        sourceTable: "project_members",
        avatarUrl: avatarUrl,
      });
      addedUserIds.add(member.user_id);
    }
  }

  // Priority 3: Process Workspace Admins (workspace_members) - lowest priority
  for (const admin of workspaceAdmins) {
    if (!addedUserIds.has(admin.user_id)) {
      const email = userEmailMap.get(admin.user_id) || "Unknown User";
      const name = userNameMap.get(admin.user_id) || email;
      const avatarUrl = userAvatarMap.get(admin.user_id) || null;
      
      finalMembers.push({
        id: admin.id, // Actual ID
        userId: admin.user_id,
        email: email,
        name: name,
        role: admin.role || "admin",
        receiveAlerts: admin.receive_alerts ?? true,
        sourceTable: "workspace_members",
        avatarUrl: avatarUrl,
      });
      addedUserIds.add(admin.user_id);
    }
  }

  console.log(`getProjectMembers: Found ${owners.length} owners, ${members.length} members, ${workspaceAdmins.length} workspace admins. Total merged: ${finalMembers.length}`);

  return finalMembers;
}

/**
 * Update a project member's receive_alerts preference
 * @param uniqueId - The unique identifier (synthetic id for project_memberships, actual id for others)
 * @param sourceTable - The source table: 'project_memberships', 'project_members', or 'workspace_members'
 * @param projectId - The project ID (required for project_memberships composite key update)
 * @param userId - The user ID (required for composite key updates)
 * @param enabled - Whether the member should receive alerts
 */
export async function updateMemberAlertPreference(
  uniqueId: string,
  sourceTable: "project_memberships" | "project_members" | "workspace_members",
  projectId: string,
  userId: string,
  enabled: boolean
) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to update alert preferences",
    };
  }

  // Check if user has permission (owner or admin)
  const userRole = await getUserWorkspaceRole();
  if (userRole !== "owner" && userRole !== "admin") {
    return {
      error: "Only workspace owners and admins can update alert preferences",
    };
  }

  // Get workspace_id for workspace_members updates
  let workspaceId: string | null = null;
  if (sourceTable === "workspace_members") {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return {
        error: "Failed to fetch project workspace",
      };
    }
    workspaceId = project.workspace_id;
  }

  // Use switch statement to update the correct table
  let updateError;
  switch (sourceTable) {
    case "project_memberships":
      // Update project_memberships using composite key (project_id + user_id)
      // This table doesn't have an id column
      const { error: membershipError } = await supabase
        .from("project_memberships")
        .update({ receive_alerts: enabled })
        .eq("project_id", projectId)
        .eq("user_id", userId);
      updateError = membershipError;
      break;

    case "project_members":
      // Update project_members using standard id column
      const { error: memberError } = await supabase
        .from("project_members")
        .update({ receive_alerts: enabled })
        .eq("id", uniqueId);
      updateError = memberError;
      break;

    case "workspace_members":
      // Update workspace_members using user_id and workspace_id
      if (!workspaceId) {
        return {
          error: "Workspace ID is required for workspace_members updates",
        };
      }
      const { error: workspaceError } = await supabase
        .from("workspace_members")
        .update({ receive_alerts: enabled })
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId);
      updateError = workspaceError;
      break;

    default:
      return {
        error: `Invalid sourceTable: ${sourceTable}. Must be 'project_memberships', 'project_members', or 'workspace_members'`,
      };
  }

  if (updateError) {
    console.error(`Error updating ${sourceTable}:`, updateError);
    return {
      error: updateError.message || `Failed to update alert preference in ${sourceTable}`,
    };
  }

  revalidatePath("/projects/[projectId]/settings", "page");
  return { success: true };
}

/**
 * Get email notifications for a project
 */
export async function getEmailNotifications(projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Fetch notifications from notification_logs table
  // Simple query without joins - just fetch all rows for the projectId
  // RLS policy should allow access if user has access to the project
  const { data: notifications, error } = await supabase
    .from("notification_logs")
    .select("id, project_id, monitor_run_id, recipient_email, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[getEmailNotifications] Fetch Error:", JSON.stringify(error, null, 2));
    // Log the error details for debugging RLS issues
    if (error.code === "42501") {
      console.error("[getEmailNotifications] RLS Policy Error: User may not have access to notification_logs for this project");
    }
    return [];
  }

  // Return notifications - recipient_email is already in the table, no need to join
  // If we need to display names, we can look them up client-side using the standardized identity lookup
  return notifications || [];
}

/**
 * Run an initial baseline check (no change logs)
 * Used when adding URLs to create the first snapshot without logging
 */
export async function runInitialBaselineCheck(urlId: string, projectId: string) {
  const { checkUrl } = await import("@/lib/monitoring");
  const result = await checkUrl(urlId, projectId, true);
  
  if (result.error) {
    console.error(`Error running initial baseline check for URL ${urlId}:`, result.error);
  }
  
  return {
    success: !result.error,
    error: result.error,
  };
}

/**
 * Run a manual check on a URL
 */
export async function runManualCheck(urlId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to run checks",
    };
  }

  // Get the URL to find its project_id
  const { data: urlRecord, error: urlError } = await supabase
    .from("urls")
    .select("project_id")
    .eq("id", urlId)
    .single();

  if (urlError || !urlRecord) {
    return {
      error: "URL not found",
    };
  }

  const projectId = urlRecord.project_id;

  // Import and call checkUrl
  const { checkUrl } = await import("@/lib/monitoring");
  const result = await checkUrl(urlId, projectId, false);

  if (result.error) {
    return {
      error: result.error,
    };
  }

  // Revalidate at the end of the action, not inside the function
  revalidatePath(`/projects/${projectId}/urls`);
  return {
    success: true,
    changed: result.changed,
  };
}

/**
 * Get monitoring status for a URL
 */
/**
 * Get monitor for a project
 */
export async function getProjectMonitor(projectId: string) {
  const supabase = await createClient();

  const { data: monitor, error } = await supabase
    .from("monitors")
    .select("id, frequency, name, is_active, next_run_at, last_run_at")
    .eq("project_id", projectId)
    .eq("name", "Default Monitor")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching monitor:", error);
    return null;
  }

  return monitor;
}

/**
 * Get monitor runs for a project
 */
export async function getMonitorRuns(projectId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Get monitor for this project
  const monitor = await getProjectMonitor(projectId);
  if (!monitor) {
    return [];
  }

  // Get all runs for this monitor
  const { data: runs, error: runsError } = await supabase
    .from("monitor_runs")
    .select("*")
    .eq("monitor_id", monitor.id)
    .order("started_at", { ascending: false });

  if (runsError) {
    console.error("Error fetching monitor runs:", runsError);
    return [];
  }

  return runs || [];
}

/**
 * Cleanup old monitor_runs (older than 7 days)
 * Only deletes if workspace doesn't have 'Extended History' add-on
 */
export async function cleanupOldMonitorRuns() {
  const supabase = await createClient();

  try {
    // Get all workspaces and check for Extended History add-on
    // For now, we'll check the plan field - you can extend this to check addons JSONB field later
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id, plan");

    if (workspacesError) {
      console.error("Error fetching workspaces for cleanup:", workspacesError);
      return { error: "Failed to fetch workspaces", deleted: 0 };
    }

    // Get workspace IDs that have Extended History (for now, check if plan is 'pro' or 'enterprise')
    // You can extend this to check a JSONB addons field: addons->>'extended_history' = 'true'
    const extendedHistoryWorkspaceIds = new Set(
      (workspaces || [])
        .filter((w: any) => w.plan === "pro" || w.plan === "enterprise")
        .map((w: any) => w.id)
    );

    // Get all monitors and their workspace IDs
    const { data: monitors, error: monitorsError } = await supabase
      .from("monitors")
      .select("id, project_id, projects!inner(workspace_id)");

    if (monitorsError) {
      console.error("Error fetching monitors for cleanup:", monitorsError);
      return { error: "Failed to fetch monitors", deleted: 0 };
    }

    // Calculate cutoff date (7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffISO = sevenDaysAgo.toISOString();

    let totalDeleted = 0;

    // Process each monitor
    for (const monitor of monitors || []) {
      const workspaceId = (monitor.projects as any)?.workspace_id;
      
      // Skip if workspace has Extended History
      if (workspaceId && extendedHistoryWorkspaceIds.has(workspaceId)) {
        continue;
      }

      // Delete old runs for this monitor
      const { data: deletedRuns, error: deleteError } = await supabase
        .from("monitor_runs")
        .delete()
        .eq("monitor_id", monitor.id)
        .lt("started_at", cutoffISO)
        .select("id");

      if (deleteError) {
        console.error(`Error deleting old runs for monitor ${monitor.id}:`, deleteError);
      } else {
        const deletedCount = deletedRuns?.length || 0;
        totalDeleted += deletedCount;
        if (deletedCount > 0) {
          console.log(`[cleanupOldMonitorRuns] Deleted ${deletedCount} old runs for monitor ${monitor.id}`);
        }
      }
    }

    return {
      success: true,
      deleted: totalDeleted,
      message: `Cleaned up ${totalDeleted} monitor run(s) older than 7 days`,
    };
  } catch (error) {
    console.error("Error in cleanupOldMonitorRuns:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      deleted: 0,
    };
  }
}

/**
 * Get log ID for a monitor run that detected changes
 */
export async function getLogIdForMonitorRun(
  projectId: string,
  runStartedAt: string
) {
  const supabase = await createClient();

  // Find logs created around the same time as the run
  // We'll look for logs created within 5 minutes of the run start time
  const runTime = new Date(runStartedAt);
  const beforeTime = new Date(runTime.getTime() - 5 * 60 * 1000);
  const afterTime = new Date(runTime.getTime() + 5 * 60 * 1000);

  const { data: logs, error } = await supabase
    .from("logs")
    .select("id, public_id, created_at, title, source")
    .eq("project_id", projectId)
    .eq("source", "system")
    .eq("title", "URL Content Changed")
    .gte("created_at", beforeTime.toISOString())
    .lte("created_at", afterTime.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !logs || logs.length === 0) {
    return null;
  }

  // Return public_id for stable highlighting
  return logs[0].public_id || logs[0].id;
}

export async function getMonitoringStatus(urlId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      isMonitored: false,
      lastChecked: null,
    };
  }

  // Check if URL is in monitor_urls
  const { data: monitorUrl, error: monitorError } = await supabase
    .from("monitor_urls")
    .select("last_checked_at")
    .eq("url_id", urlId)
    .maybeSingle();

  if (monitorError && monitorError.code !== "PGRST116") {
    console.error("Error fetching monitoring status:", monitorError);
    return {
      isMonitored: false,
      lastChecked: null,
    };
  }

  return {
    isMonitored: !!monitorUrl,
    lastChecked: monitorUrl?.last_checked_at || null,
  };
}

/**
 * Create a new URL in a project
 * Returns the created URL ID or error
 */
export async function createUrl(projectId: string, url: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to create URLs",
    };
  }

  // Validate URL format
  try {
    new URL(url.trim());
  } catch {
    return {
      error: "Invalid URL format",
    };
  }

  // Check if URL already exists in this project
  const { data: existingUrl, error: checkError } = await supabase
    .from("urls")
    .select("id")
    .eq("project_id", projectId)
    .eq("url", url.trim())
    .maybeSingle();

  if (checkError && checkError.code !== "PGRST116") {
    console.error("Error checking URL:", checkError);
    return {
      error: "Failed to check URL. Please try again.",
    };
  }

  if (existingUrl) {
    // URL already exists, return its ID
    return {
      success: true,
      urlId: existingUrl.id,
      isNew: false,
    };
  }

  // Create new URL
  const { data: newUrl, error: insertError } = await supabase
    .from("urls")
    .insert({
      project_id: projectId,
      url: url.trim(),
    })
    .select()
    .single();

  if (insertError || !newUrl) {
    console.error("Error creating URL:", insertError);
    return {
      error: insertError?.message || "Failed to create URL. Please try again.",
    };
  }

  revalidatePath(`/projects/${projectId}/urls`);
  return {
    success: true,
    urlId: newUrl.id,
    isNew: true,
  };
}

/**
 * Bulk create URLs from a list of URL strings
 * De-duplicates and validates all URLs before creating
 */
export async function bulkCreateUrls(
  projectId: string,
  urls: string[],
  enableMonitoring: boolean = false,
  frequency: string = "Weekly",
  runImmediately: boolean = false
) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "You must be logged in to create URLs",
      created: 0,
      skipped: 0,
      errors: [],
    };
  }

  // Parse, validate, and de-duplicate URLs
  const validUrls: string[] = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const urlString of urls) {
    const trimmed = urlString.trim();
    
    // Skip empty lines (should already be filtered, but double-check)
    if (!trimmed) continue;

    // Validation: Ensure URL starts with http:// or https://
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      errors.push(`URL must start with http:// or https://: ${trimmed}`);
      continue;
    }

    // Normalize URL (lowercase for comparison)
    const normalized = trimmed.toLowerCase();

    // Check for duplicates in the input
    if (seenUrls.has(normalized)) {
      continue; // Skip duplicate in input
    }
    seenUrls.add(normalized);

    // Validate URL format using URL constructor
    try {
      new URL(trimmed);
      validUrls.push(trimmed);
    } catch {
      errors.push(`Invalid URL format: ${trimmed}`);
    }
  }

  if (validUrls.length === 0) {
    return {
      error: errors.length > 0 
        ? `No valid URLs found. ${errors.join("; ")}`
        : "No URLs provided",
      created: 0,
      skipped: 0,
      errors,
    };
  }

  // Check which URLs already exist in this project
  const { data: existingUrls, error: checkError } = await supabase
    .from("urls")
    .select("url")
    .eq("project_id", projectId)
    .in("url", validUrls);

  if (checkError) {
    console.error("Error checking existing URLs:", checkError);
    return {
      error: "Failed to check existing URLs. Please try again.",
      created: 0,
      skipped: 0,
      errors: [],
    };
  }

  const existingUrlSet = new Set(
    (existingUrls || []).map((u: any) => u.url.toLowerCase())
  );

  // Filter out existing URLs
  const newUrls = validUrls.filter(
    (url) => !existingUrlSet.has(url.toLowerCase())
  );
  const skippedCount = validUrls.length - newUrls.length;

  if (newUrls.length === 0) {
    return {
      success: true,
      message: `All ${validUrls.length} URL(s) already exist in this project`,
      created: 0,
      skipped: skippedCount,
      errors,
    };
  }

  // Bulk insert new URLs
  const urlsToInsert = newUrls.map((url) => ({
    project_id: projectId,
    url: url.trim(),
  }));

  const { data: createdUrls, error: insertError } = await supabase
    .from("urls")
    .insert(urlsToInsert)
    .select("id, url");

  if (insertError || !createdUrls) {
    console.error("Error bulk creating URLs:", insertError);
    return {
      error: insertError?.message || "Failed to create URLs. Please try again.",
      created: 0,
      skipped: skippedCount,
      errors,
    };
  }

  const createdIds = createdUrls.map((u: any) => u.id);

  // If monitoring is enabled, add all URLs to the monitor
  if (enableMonitoring && createdIds.length > 0) {
    const monitor = await getProjectMonitor(projectId);
    if (monitor) {
      // Update monitor frequency if needed
      if (frequency !== monitor.frequency) {
        await updateMonitorFrequency(monitor.id, frequency);
      }

      // Add all URLs to monitor_urls
      const monitorUrlInserts = createdIds.map((urlId: string) => ({
        monitor_id: monitor.id,
        url_id: urlId,
      }));

      const { error: monitorError } = await supabase
        .from("monitor_urls")
        .insert(monitorUrlInserts);

      if (monitorError) {
        console.error("Error adding URLs to monitor:", monitorError);
        // Don't fail the whole operation, just log the error
      }

      // If run immediately is checked, trigger baseline checks for all URLs
      // These are initial checks, so they should only create baseline snapshots, not change logs
      if (runImmediately) {
        // Run baseline checks in background (don't await to avoid blocking)
        Promise.all(
          createdIds.map(async (urlId: string) => {
            try {
              await runInitialBaselineCheck(urlId, projectId);
            } catch (error) {
              console.error(`Error running initial baseline check for URL ${urlId}:`, error);
            }
          })
        ).catch((error) => {
          console.error("Error running initial baseline checks:", error);
        });
      }
    }
  }

  // Revalidate at the end of the action, after all URLs are processed
  revalidatePath(`/projects/${projectId}/urls`);
  return {
    success: true,
    message: `Created ${createdIds.length} URL(s)${skippedCount > 0 ? `, skipped ${skippedCount} existing` : ""}`,
    created: createdIds.length,
    skipped: skippedCount,
    urlIds: createdIds,
    errors: errors.length > 0 ? errors : undefined,
  };
}

