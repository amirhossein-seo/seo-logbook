"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteProject } from "@/app/actions";

interface ProjectCardProps {
  project: {
    id: string;
    name: string | null;
    domain: string | null;
  };
  userRole: string;
}

export function ProjectCard({ project, userRole }: ProjectCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const canDelete = userRole === "owner" || userRole === "admin";

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canDelete) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name || "this project"}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteProject(project.id);

    if (result?.error) {
      alert(result.error);
      setIsDeleting(false);
    } else {
      router.refresh();
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow h-full relative group">
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      <Link href={`/projects/${project.id}/overview`}>
        <CardHeader>
          <CardTitle className="text-lg pr-8">{project.name || "Unnamed Project"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {project.domain || "No domain set"}
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}

