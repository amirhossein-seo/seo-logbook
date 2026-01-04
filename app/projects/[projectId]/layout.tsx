import { redirect } from "next/navigation";
import { getProject, getUserWorkspaceRole } from "@/app/actions";
import { ProjectHeader } from "@/components/project-header";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  // Enforce active workspace context: project must belong to active workspace
  const project = await getProject(projectId);
  if (!project) {
    redirect("/projects");
  }

  // Check if user is owner or admin to show share button
  const userRole = await getUserWorkspaceRole();
  const canShare = userRole === "owner" || userRole === "admin";

  return (
    <>
      <ProjectHeader projectId={projectId} canShare={canShare} />
      {children}
    </>
  );
}

