"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

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

  // CRITICAL: Always accept pending invitations FIRST, before fetching memberships
  // This ensures new invites are processed on every page load, even if user already has workspaces
  if (user.email) {
    await acceptPendingInvites(userId, user.email);
  }

  // Step 1: Fetch existing memberships (after accepting invites)
  let { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);

  if (membershipError) {
    console.error("Error fetching user workspace:", membershipError);
    return null;
  }

  // Step 2: If still no memberships, check if the user already owns a workspace
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
        // Step 4: If no owned workspace, create a new Personal Workspace
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

  // Check cookie for active workspace (if we have memberships)
  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get("seo-logbook-workspace")?.value;

  if (activeWorkspaceId && memberships) {
    // Verify user is a member of the cookie workspace
    const isMemberOfCookieWorkspace = memberships.some(
      (m) => m.workspace_id === activeWorkspaceId
    );

    if (isMemberOfCookieWorkspace) {
      return activeWorkspaceId;
    }
    // If cookie workspace is invalid, clear it
    cookieStore.delete("seo-logbook-workspace");
  }

  // Return the first workspace membership
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
    secure: process.env.NODE_ENV === "production",
  });

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

export async function getProjects() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // Get user's workspace ID
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    console.error("User has no workspace");
    return [];
  }

  // Fetch projects in the user's workspace
  // Filter by workspace_id only (trust workspace membership for access control)
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (projectsError) {
    console.error("Error fetching projects:", projectsError);
    return [];
  }

  return projects || [];
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

  // Transform the data to flatten URL structure and attach a readable author label
  return (
    logs?.map((log: any) => ({
      ...log,
      created_by: user.email || log.created_by,
      urls:
        log.log_urls
          ?.map((lu: any) => ({
            id: lu.urls?.id,
            url: lu.urls?.url,
            project_id: lu.urls?.project_id,
          }))
          .filter((url: any) => url.id && url.url) || [],
    })) || []
  );
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

  // Combine base URL data with computed stats
  return urls.map((url: any) => {
    const id = url.id as string;
    return {
      ...url,
      log_count: logCounts[id] || 0,
      active_task_count: activeTaskCounts[id] || 0,
      last_tracked_at: lastTrackedMap[id] || null,
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
      // Transform the data to flatten URL structure and attach a readable author label
      transformedLogs = logs.map((log: any) => ({
        ...log,
        created_by: user.email || log.created_by,
        urls:
          log.log_urls?.map((lu: any) => ({
            id: lu.urls?.id,
            url: lu.urls?.url,
            project_id: lu.urls?.project_id,
          })).filter((url: any) => url.id && url.url) || [],
      }));
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

  // Insert the new log
  const { data: log, error: logError } = await supabase
    .from("logs")
    .insert({
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

  // Transform recent logs to flatten URL structure and attach a readable author label
  const transformedRecentLogs = recentLogs.data?.map((log: any) => ({
    ...log,
    created_by: user.email || log.created_by,
    urls:
      log.log_urls?.map((lu: any) => ({
        id: lu.urls?.id,
        url: lu.urls?.url,
        project_id: lu.urls?.project_id,
      })).filter((url: any) => url.id && url.url) || [],
  })) || [];

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

  // Look up user by email using RPC function
  const { data: userId, error: userLookupError } = await supabase.rpc(
    "get_user_id_by_email",
    { email: email.trim() }
  );

  if (userLookupError) {
    console.error("Error looking up user by email:", userLookupError);
    return {
      error: "Failed to look up user. Please try again.",
    };
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
        email: email.trim().toLowerCase(),
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

