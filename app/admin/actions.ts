"use server";

import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

/**
 * Check if current user is a super_admin
 * Redirects to sign-in if not authenticated, or to dashboard if not super_admin
 */
export async function requireSuperAdmin() {
  const supabase = await createClient();
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/sign-in");
  }

  // Check profile for global_role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.global_role !== "super_admin") {
    redirect("/dashboard");
  }

  return { user, profile };
}

/**
 * Get all monitor runs across all projects (admin view)
 */
export async function getAdminMonitorRuns(limit: number = 100) {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  const { data: runs, error } = await admin
    .from("monitor_runs")
    .select(`
      *,
      monitors (
        project_id,
        projects (
          id,
          name
        )
      )
    `)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching admin monitor runs:", error);
    return [];
  }

  return runs || [];
}

/**
 * Get error analytics for monitor runs
 * Counts JSON-LD parsing failures from the last 100 runs
 */
export async function getAdminErrorAnalytics() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  // Fetch last 100 monitor runs
  const { data: runs, error } = await admin
    .from("monitor_runs")
    .select("errors")
    .order("started_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error fetching error analytics:", error);
    return { parsingFailures: 0, totalRuns: 0 };
  }

  if (!runs || runs.length === 0) {
    return { parsingFailures: 0, totalRuns: 0 };
  }

  // Count runs with JSON-LD errors
  let parsingFailures = 0;
  for (const run of runs) {
    const errors = run.errors || [];
    if (Array.isArray(errors)) {
      // Check if any error contains 'JSON-LD' or 'json-ld' or 'Position'
      const hasJsonLdError = errors.some((error: any) => {
        const errorStr = typeof error === "string" ? error : JSON.stringify(error);
        return errorStr.toLowerCase().includes("json-ld") || 
               errorStr.includes("Position") ||
               errorStr.toLowerCase().includes("parsing");
      });
      if (hasJsonLdError) {
        parsingFailures++;
      }
    } else if (typeof errors === "string") {
      if (errors.toLowerCase().includes("json-ld") || 
          errors.includes("Position") ||
          errors.toLowerCase().includes("parsing")) {
        parsingFailures++;
      }
    }
  }

  return {
    parsingFailures,
    totalRuns: runs.length,
  };
}

/**
 * Force global sync - triggers processAutomatedChecks
 */
export async function forceGlobalSync() {
  await requireSuperAdmin();
  
  try {
    const { processAutomatedChecks } = await import("../actions");
    const result = await processAutomatedChecks(false);
    return {
      success: true,
      message: `Processed ${result.processed || 0} monitor(s). ${result.changesDetected || 0} change(s) detected.`,
      result,
    };
  } catch (error) {
    console.error("Error forcing global sync:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get admin overview statistics
 * Returns: Total Users, Total URLs Tracked, Failed Notifications Queue
 */
export async function getAdminOverviewStats() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  try {
    // Count total users
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1, // We only need the count
    });

    // Get actual count by fetching all users (or use a more efficient method if available)
    let totalUsers = 0;
    if (!usersError && usersData) {
      // Fetch all users to get accurate count
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const { data: pageData, error: pageError } = await admin.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (pageError || !pageData?.users) {
          hasMore = false;
          break;
        }
        totalUsers += pageData.users.length;
        hasMore = pageData.users.length === 1000;
        page++;
      }
    }

    // Count total URLs tracked
    const { count: totalUrls, error: urlsError } = await admin
      .from("urls")
      .select("*", { count: "exact", head: true });

    if (urlsError) {
      console.error("Error counting URLs:", urlsError);
    }

    // Count failed notifications
    const { count: failedNotifications, error: notificationsError } = await admin
      .from("notification_logs")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    if (notificationsError) {
      console.error("Error counting failed notifications:", notificationsError);
    }

    return {
      totalUsers: totalUsers || 0,
      totalUrlsTracked: totalUrls || 0,
      failedNotificationsQueue: failedNotifications || 0,
    };
  } catch (error) {
    console.error("Error fetching admin overview stats:", error);
    return {
      totalUsers: 0,
      totalUrlsTracked: 0,
      failedNotificationsQueue: 0,
    };
  }
}

/**
 * Cleanup stuck runs - sets runs older than 1 hour with 'running' status to 'failed'
 */
export async function cleanupStuckRuns() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  try {
    // Calculate timestamp 1 hour ago
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const oneHourAgoISO = oneHourAgo.toISOString();

    // Find stuck runs
    const { data: stuckRuns, error: findError } = await admin
      .from("monitor_runs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", oneHourAgoISO);

    if (findError) {
      console.error("Error finding stuck runs:", findError);
      return {
        success: false,
        error: "Failed to find stuck runs",
      };
    }

    if (!stuckRuns || stuckRuns.length === 0) {
      return {
        success: true,
        message: "No stuck runs found",
        cleaned: 0,
      };
    }

    // Update stuck runs to 'failed'
    const { error: updateError } = await admin
      .from("monitor_runs")
      .update({ 
        status: "failed",
        completed_at: new Date().toISOString(),
      })
      .in("id", stuckRuns.map(r => r.id));

    if (updateError) {
      console.error("Error updating stuck runs:", updateError);
      return {
        success: false,
        error: "Failed to update stuck runs",
      };
    }

    return {
      success: true,
      message: `Cleaned up ${stuckRuns.length} stuck run(s)`,
      cleaned: stuckRuns.length,
    };
  } catch (error) {
    console.error("Error cleaning up stuck runs:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all notification logs (admin view)
 * Fetches 50 most recent notifications with error details
 */
export async function getAdminNotifications(limit: number = 50) {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  const { data: notifications, error } = await admin
    .from("notification_logs")
    .select(`
      *,
      projects (
        id,
        name
      ),
      monitor_runs (
        id,
        started_at
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching admin notifications:", error);
    return [];
  }

  return notifications || [];
}

/**
 * Force dispatch pending email notifications
 */
export async function forceDispatchNotifications(projectId: string, runId: string) {
  await requireSuperAdmin();
  
  // Import the function from actions.ts
  // Note: We'll need to export sendPendingEmailNotifications or create a wrapper
  const { sendPendingEmailNotifications } = await import("../actions");
  
  try {
    await sendPendingEmailNotifications(projectId, runId);
    return { success: true };
  } catch (error) {
    console.error("Error forcing notification dispatch:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Get global error feed - 50 most recent monitor_runs with errors
 */
export async function getAdminErrorFeed() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  try {
    // Fetch monitor runs with errors, including related monitor and project info
    const { data: runs, error } = await admin
      .from("monitor_runs")
      .select(`
        *,
        monitors (
          project_id,
          projects (
            id,
            name
          )
        )
      `)
      .not("errors", "is", null)
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching error feed:", error);
      return [];
    }

    return runs || [];
  } catch (error) {
    console.error("Error fetching error feed:", error);
    return [];
  }
}

/**
 * Get top recurring errors grouped by type
 */
export async function getAdminErrorGrouping() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  try {
    // Fetch all monitor runs with errors
    const { data: runs, error } = await admin
      .from("monitor_runs")
      .select("errors")
      .not("errors", "is", null)
      .order("started_at", { ascending: false })
      .limit(1000); // Analyze last 1000 runs

    if (error) {
      console.error("Error fetching error grouping:", error);
      return {
        jsonLdErrors: 0,
        networkTimeouts: 0,
        otherErrors: 0,
        total: 0,
      };
    }

    if (!runs || runs.length === 0) {
      return {
        jsonLdErrors: 0,
        networkTimeouts: 0,
        otherErrors: 0,
        total: 0,
      };
    }

    let jsonLdErrors = 0;
    let networkTimeouts = 0;
    let otherErrors = 0;

    for (const run of runs) {
      const errors = run.errors || [];
      if (Array.isArray(errors)) {
        for (const error of errors) {
          const errorStr = typeof error === "string" ? error : JSON.stringify(error);
          const lowerError = errorStr.toLowerCase();
          
          if (lowerError.includes("json-ld") || 
              lowerError.includes("parse") && lowerError.includes("json") ||
              lowerError.includes("position")) {
            jsonLdErrors++;
          } else if (lowerError.includes("timeout") || 
                     lowerError.includes("network") ||
                     lowerError.includes("econnreset") ||
                     lowerError.includes("fetch failed")) {
            networkTimeouts++;
          } else {
            otherErrors++;
          }
        }
      } else if (typeof errors === "string") {
        const lowerError = errors.toLowerCase();
        if (lowerError.includes("json-ld") || 
            lowerError.includes("parse") && lowerError.includes("json") ||
            lowerError.includes("position")) {
          jsonLdErrors++;
        } else if (lowerError.includes("timeout") || 
                   lowerError.includes("network") ||
                   lowerError.includes("econnreset") ||
                   lowerError.includes("fetch failed")) {
          networkTimeouts++;
        } else {
          otherErrors++;
        }
      }
    }

    return {
      jsonLdErrors,
      networkTimeouts,
      otherErrors,
      total: jsonLdErrors + networkTimeouts + otherErrors,
    };
  } catch (error) {
    console.error("Error fetching error grouping:", error);
    return {
      jsonLdErrors: 0,
      networkTimeouts: 0,
      otherErrors: 0,
      total: 0,
    };
  }
}

/**
 * Get noisy domains - domains with high error rates
 */
export async function getAdminNoisyDomains() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();

  try {
    // Fetch monitor runs with errors and their related URLs
    const { data: runs, error: runsError } = await admin
      .from("monitor_runs")
      .select(`
        id,
        errors,
        started_at,
        monitors (
          monitor_urls (
            urls (
              url
            )
          )
        )
      `)
      .not("errors", "is", null)
      .order("started_at", { ascending: false })
      .limit(1000); // Analyze last 1000 runs

    if (runsError) {
      console.error("Error fetching noisy domains:", runsError);
      return [];
    }

    if (!runs || runs.length === 0) {
      return [];
    }

    // Extract domain from URL
    function extractDomain(url: string): string | null {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace("www.", "");
      } catch {
        return null;
      }
    }

    // Track errors per domain
    const domainErrorCounts: Record<string, number> = {};
    const domainTotalRuns: Record<string, number> = {};
    const domainUrls: Record<string, Set<string>> = {};

    for (const run of runs) {
      const errors = run.errors || [];
      const hasErrors = Array.isArray(errors) ? errors.length > 0 : !!errors;
      
      // Get URLs from monitor_urls
      const monitor = run.monitors as any;
      const monitorUrls = monitor?.monitor_urls || [];
      
      for (const monitorUrl of monitorUrls) {
        const urlData = monitorUrl.urls as any;
        const url = urlData?.url;
        
        if (!url) continue;
        
        const domain = extractDomain(url);
        if (!domain) continue;

        // Initialize domain tracking
        if (!domainErrorCounts[domain]) {
          domainErrorCounts[domain] = 0;
          domainTotalRuns[domain] = 0;
          domainUrls[domain] = new Set();
        }

        domainTotalRuns[domain]++;
        domainUrls[domain].add(url);

        if (hasErrors) {
          domainErrorCounts[domain]++;
        }
      }
    }

    // Calculate error rates and format results
    const noisyDomains = Object.keys(domainErrorCounts)
      .map(domain => {
        const errorCount = domainErrorCounts[domain];
        const totalRuns = domainTotalRuns[domain];
        const errorRate = totalRuns > 0 ? (errorCount / totalRuns) * 100 : 0;
        const uniqueUrls = domainUrls[domain].size;

        return {
          domain,
          errorCount,
          totalRuns,
          errorRate: Math.round(errorRate * 10) / 10, // Round to 1 decimal
          uniqueUrls,
        };
      })
      .filter(d => d.totalRuns >= 3) // Only show domains with at least 3 runs
      .sort((a, b) => b.errorRate - a.errorRate) // Sort by error rate descending
      .slice(0, 20); // Top 20 noisiest domains

    return noisyDomains;
  } catch (error) {
    console.error("Error fetching noisy domains:", error);
    return [];
  }
}

/**
 * Get JSON-LD parsing errors grouped by URL
 * @deprecated Use getAdminErrorFeed, getAdminErrorGrouping, and getAdminNoisyDomains instead
 */
export async function getAdminHealthLogs() {
  await requireSuperAdmin();
  
  // Placeholder: In a real implementation, you'd query an error_logs table
  // or parse logs from a structured logging system
  // For now, return empty array as the user mentioned this needs to be implemented
  return [];
}

/**
 * Get all platform users with their profile data and workspace counts
 * Only accessible by the hardcoded super-admin user ID
 */
export async function getAdminUsers() {
  const supabase = await createClient();
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/sign-in");
  }

  // Hardcoded super-admin check
  const SUPER_ADMIN_ID = "781c7402-f347-42ac-a4ad-942b78848278";
  if (user.id !== SUPER_ADMIN_ID) {
    redirect("/projects");
  }

  const admin = createSupabaseAdmin();
  
  try {
    // Fetch all users using admin client
    const { data: usersData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.error("Error listing users:", listError);
      return [];
    }

    if (!usersData?.users || usersData.users.length === 0) {
      return [];
    }

    // Fetch profiles for all users
    const userIds = usersData.users.map(u => u.id);
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, global_role, full_name, created_at")
      .in("id", userIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
    }

    // Create a map of profiles by user ID
    const profilesMap = new Map(
      (profiles || []).map(p => [p.id, p])
    );

    // Fetch workspace counts for all users
    const { data: workspaceMembers, error: workspaceError } = await admin
      .from("workspace_members")
      .select("user_id");

    if (workspaceError) {
      console.error("Error fetching workspace members:", workspaceError);
    }

    // Count workspaces per user
    const workspaceCounts = new Map<string, number>();
    (workspaceMembers || []).forEach((wm: any) => {
      const currentCount = workspaceCounts.get(wm.user_id) || 0;
      workspaceCounts.set(wm.user_id, currentCount + 1);
    });

    // Fetch workspace quotas (max_urls, max_monitors) for workspaces owned by users
    const { data: workspaces, error: workspacesError } = await admin
      .from("workspaces")
      .select("owner_id, max_urls, max_monitors")
      .not("owner_id", "is", null);

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
    }

    // Map workspace quotas by owner_id (assuming one workspace per owner)
    const quotasMap = new Map<string, { max_urls: number | null; max_monitors: number | null }>();
    (workspaces || []).forEach((ws: any) => {
      if (ws.owner_id) {
        quotasMap.set(ws.owner_id, {
          max_urls: ws.max_urls || null,
          max_monitors: ws.max_monitors || null,
        });
      }
    });

    // Combine user data with profiles and workspace counts
    const users = usersData.users.map((user) => {
      const profile = profilesMap.get(user.id);
      const workspaceCount = workspaceCounts.get(user.id) || 0;
      const quotas = quotasMap.get(user.id) || { max_urls: null, max_monitors: null };

      return {
        id: user.id,
        email: user.email || "No email",
        joinedDate: user.created_at || profile?.created_at || null,
        globalRole: profile?.global_role || "user",
        fullName: profile?.full_name || null,
        workspaceCount,
        maxUrls: quotas.max_urls,
        maxMonitors: quotas.max_monitors,
      };
    });

    // Sort by joined date (newest first)
    users.sort((a, b) => {
      const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
      const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
      return dateB - dateA;
    });

    return users;
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return [];
  }
}

/**
 * Update workspace quotas for a user
 * Only accessible by the hardcoded super-admin user ID
 */
export async function updateUserQuotas(
  userId: string,
  maxUrls: number | null,
  maxMonitors: number | null
) {
  const supabase = await createClient();
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/sign-in");
  }

  // Hardcoded super-admin check
  const SUPER_ADMIN_ID = "781c7402-f347-42ac-a4ad-942b78848278";
  if (user.id !== SUPER_ADMIN_ID) {
    redirect("/projects");
  }

  const admin = createSupabaseAdmin();

  try {
    // Find workspace(s) owned by this user
    const { data: workspaces, error: findError } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId);

    if (findError) {
      console.error("Error finding workspaces:", findError);
      return { success: false, error: "Failed to find user's workspace" };
    }

    if (!workspaces || workspaces.length === 0) {
      return { success: false, error: "User does not own any workspace" };
    }

    // Update all workspaces owned by this user
    const updateData: { max_urls?: number | null; max_monitors?: number | null } = {};
    if (maxUrls !== undefined) {
      updateData.max_urls = maxUrls;
    }
    if (maxMonitors !== undefined) {
      updateData.max_monitors = maxMonitors;
    }

    const { error: updateError } = await admin
      .from("workspaces")
      .update(updateData)
      .in("id", workspaces.map(w => w.id));

    if (updateError) {
      console.error("Error updating workspace quotas:", updateError);
      return { success: false, error: updateError.message || "Failed to update quotas" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating user quotas:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Retry all failed or pending notifications
 * Finds all rows where status = 'failed' or 'pending' and re-runs the email sending logic
 */
export async function retryAllFailedNotifications() {
  await requireSuperAdmin();
  
  const admin = createSupabaseAdmin();
  const { resend } = await import("@/lib/resend");
  const { render } = await import("@react-email/render");
  const { SEOAlertEmail } = await import("@/components/emails/seo-alert-template");
  const { getLogIdForMonitorRun, getLogById } = await import("../actions");

  try {
    // Find all failed or pending notifications
    const { data: notifications, error: fetchError } = await admin
      .from("notification_logs")
      .select(`
        *,
        projects (
          id,
          name
        ),
        monitor_runs (
          id,
          started_at
        )
      `)
      .in("status", ["failed", "pending"])
      .order("created_at", { ascending: true }); // Process oldest first

    if (fetchError) {
      console.error("[retryAllFailedNotifications] Error fetching notifications:", fetchError);
      return { 
        success: false, 
        error: "Failed to fetch notifications",
        processed: 0,
        succeeded: 0,
        failed: 0
      };
    }

    if (!notifications || notifications.length === 0) {
      return { 
        success: true, 
        message: "No failed or pending notifications to retry",
        processed: 0,
        succeeded: 0,
        failed: 0
      };
    }

    console.log(`[retryAllFailedNotifications] Found ${notifications.length} notification(s) to retry`);

    let succeeded = 0;
    let failed = 0;

    // Process each notification
    for (const notification of notifications) {
      try {
        const project = notification.projects as any;
        const projectId = notification.project_id;
        const projectName = project?.name || "Your Project";
        const runId = notification.monitor_run_id;

        // Get monitor run details to find the log
        let logPublicId: string | null = null;
        if (runId) {
          const { data: monitorRun } = await admin
            .from("monitor_runs")
            .select("started_at")
            .eq("id", runId)
            .single();

          if (monitorRun) {
            logPublicId = await getLogIdForMonitorRun(projectId, monitorRun.started_at);
          }
        }

        // Get log details including URL and changes
        let logUrl = "";
        let logChanges: Array<{ field: string; oldValue: string; newValue: string }> = [];
        
        if (logPublicId) {
          const logDetails = await getLogById(logPublicId, projectId);
          if (logDetails) {
            if (logDetails.urls && logDetails.urls.length > 0) {
              logUrl = logDetails.urls[0].url;
            }
            
            if (logDetails.changes && Array.isArray(logDetails.changes)) {
              logChanges = logDetails.changes.map((changeStr: string) => {
                const match = changeStr.match(/^([^:]+):\s*"([^"]*)"\s*→\s*"([^"]*)"$/);
                if (match) {
                  return {
                    field: match[1].trim(),
                    oldValue: match[2] || "(empty)",
                    newValue: match[3] || "(empty)",
                  };
                }
                return {
                  field: changeStr.split(":")[0] || "Change",
                  oldValue: "(empty)",
                  newValue: "(empty)",
                };
              });
            }
          }
        }

        // Build the highlight link
        const highlightLink = logPublicId
          ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/projects/${projectId}/logs?highlight=${logPublicId}`
          : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/projects/${projectId}/logs`;

        // Render the email template
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
          // Format error message
          const errorMessage = emailError instanceof Error 
            ? emailError.message 
            : typeof emailError === 'object' && emailError !== null
            ? JSON.stringify(emailError)
            : String(emailError);
          
          // Update status to failed with error message
          await admin
            .from("notification_logs")
            .update({ 
              status: "failed",
              error_message: errorMessage
            })
            .eq("id", notification.id);
          
          failed++;
          console.error(`[retryAllFailedNotifications] Failed to send to ${notification.recipient_email}:`, errorMessage);
        } else {
          // Update status to sent and clear error message
          await admin
            .from("notification_logs")
            .update({ 
              status: "sent",
              error_message: null
            })
            .eq("id", notification.id);
          
          succeeded++;
          console.log(`[retryAllFailedNotifications] Successfully sent to ${notification.recipient_email}, Resend ID: ${emailData?.id}`);
        }
      } catch (error) {
        // Format error message
        const errorMessage = error instanceof Error 
          ? error.message 
          : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error);
        
        // Update status to failed with error message
        await admin
          .from("notification_logs")
          .update({ 
            status: "failed",
            error_message: errorMessage
          })
          .eq("id", notification.id);
        
        failed++;
        console.error(`[retryAllFailedNotifications] Exception sending to ${notification.recipient_email}:`, errorMessage);
      }
    }

    return {
      success: true,
      processed: notifications.length,
      succeeded,
      failed,
      message: `Processed ${notifications.length} notification(s): ${succeeded} succeeded, ${failed} failed`
    };
  } catch (error) {
    console.error("[retryAllFailedNotifications] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processed: 0,
      succeeded: 0,
      failed: 0
    };
  }
}

