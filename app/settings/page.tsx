import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateUserProfile, getUserWorkspace } from "@/app/actions";
import { UserProfileForm } from "@/components/user-profile-form";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get current full name from user metadata
  const currentFullName = (user.user_metadata?.full_name as string) || "";

  // Get current workspace
  const workspaceId = await getUserWorkspace(user.id);
  let workspaceName = "My Workspace";
  if (workspaceId) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .single();
    if (workspace?.name) {
      workspaceName = workspace.name;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and workspace settings
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <UserProfileForm currentFullName={currentFullName} />
        {workspaceId && (
          <WorkspaceSettingsForm workspaceId={workspaceId} currentName={workspaceName} />
        )}
      </div>
    </div>
  );
}

