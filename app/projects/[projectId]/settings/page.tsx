import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProject, getUserWorkspaceRole, getProjectMonitor } from "@/app/actions";
import { ProjectSettingsTabs } from "@/components/project-settings-tabs";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Check if user has permission (owner or admin)
  const userRole = await getUserWorkspaceRole();
  if (userRole !== "owner" && userRole !== "admin") {
    redirect(`/projects/${projectId}`);
  }

  const project = await getProject(projectId);
  if (!project) {
    redirect("/projects");
  }

  // Get monitor for monitoring settings
  const monitor = await getProjectMonitor(projectId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Project Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your project settings, monitoring preferences, and notifications
        </p>
      </div>

      <ProjectSettingsTabs 
        projectId={projectId}
        projectName={project.name || ""}
        emailAlertsEnabled={project.email_alerts_enabled || false}
        monitorFrequency={monitor?.frequency || "Weekly"}
      />
    </div>
  );
}
