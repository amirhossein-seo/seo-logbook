"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Link as LinkIcon } from "lucide-react";
import { updateTaskStatus } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  created_by: string;
  url_id: string | null;
  urls?: {
    id: string;
    url: string;
    project_id: string;
  } | null;
}

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleMarkDone = async () => {
    if (task.status === "Done") return;

    setIsUpdating(true);
    const result = await updateTaskStatus(task.id, "Done");
    setIsUpdating(false);

    if (result?.error) {
      console.error("Error updating task:", result.error);
    } else {
      router.refresh();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
      case "Medium":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
      case "Low":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox/Button to mark as done */}
          <div className="flex-shrink-0 pt-0.5">
            {task.status === "Done" ? (
              <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded border border-border hover:bg-green-500/10 hover:border-green-500"
                onClick={handleMarkDone}
                disabled={isUpdating}
                title="Mark as done"
              />
            )}
          </div>

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3
                className={`text-sm font-medium ${
                  task.status === "Done"
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {task.title}
              </h3>
              {/* Link Icon Button */}
              {task.urls?.url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => window.open(task.urls!.url, "_blank", "noopener,noreferrer")}
                  title={`Open ${task.urls.url}`}
                >
                  <LinkIcon className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Priority Badge */}
              <Badge
                variant="outline"
                className={`text-xs ${getPriorityColor(task.priority)}`}
              >
                {task.priority}
              </Badge>

              {/* Status */}
              <Badge variant="secondary" className="text-xs">
                {task.status}
              </Badge>

              {/* Assignee Avatar */}
              {task.assignee_id && (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    {task.assignee_id[0]?.toUpperCase() || "?"}
                  </span>
                </div>
              )}

              {/* Due Date */}
              {task.due_date && (
                <span className="text-xs text-muted-foreground">
                  Due: {new Date(task.due_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>

            {/* URL Link - Internal navigation to URL Details page */}
            {task.url_id && task.urls?.url && task.urls?.project_id && (
              <div className="mt-2">
                <Link
                  href={`/projects/${task.urls.project_id}/urls/${task.url_id}`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors truncate block"
                  title={`View details for ${task.urls.url}`}
                >
                  {task.urls.url}
                </Link>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

