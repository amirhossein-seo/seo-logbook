"use client";

import { ProjectShareDialog } from "./project-share-dialog";
import { useMounted } from "@/hooks/use-mounted";

interface ProjectHeaderProps {
  projectId: string;
  canShare: boolean;
}

export function ProjectHeader({ projectId, canShare }: ProjectHeaderProps) {
  const mounted = useMounted();

  if (!canShare) {
    return null;
  }

  // Only render the dialog trigger if mounted to ensure IDs match
  if (!mounted) {
    return (
      <div className="mb-4 flex justify-end">
        <div className="h-10 w-20 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mb-4 flex justify-end">
      <ProjectShareDialog projectId={projectId} />
    </div>
  );
}

