import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTasks } from "@/app/actions";
import { TaskCard } from "@/components/task-card";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { Suspense } from "react";

async function TasksList({ projectId }: { projectId: string }) {
  const tasks = await getTasks(projectId);

  // Group tasks by status
  const tasksByStatus = {
    Todo: tasks.filter((task) => task.status === "Todo"),
    "In Progress": tasks.filter((task) => task.status === "In Progress"),
    Done: tasks.filter((task) => task.status === "Done"),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Todo Column */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Todo</h2>
          <span className="text-sm text-muted-foreground">
            {tasksByStatus.Todo.length}
          </span>
        </div>
        <div className="space-y-3">
          {tasksByStatus.Todo.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tasks
            </p>
          ) : (
            tasksByStatus.Todo.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))
          )}
        </div>
      </div>

      {/* In Progress Column */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">In Progress</h2>
          <span className="text-sm text-muted-foreground">
            {tasksByStatus["In Progress"].length}
          </span>
        </div>
        <div className="space-y-3">
          {tasksByStatus["In Progress"].length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tasks
            </p>
          ) : (
            tasksByStatus["In Progress"].map((task) => (
              <TaskCard key={task.id} task={task} />
            ))
          )}
        </div>
      </div>

      {/* Done Column */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Done</h2>
          <span className="text-sm text-muted-foreground">
            {tasksByStatus.Done.length}
          </span>
        </div>
        <div className="space-y-3">
          {tasksByStatus.Done.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tasks
            </p>
          ) : (
            tasksByStatus.Done.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage tasks for this project
          </p>
        </div>
        <NewTaskDialog projectId={resolvedParams.projectId} />
      </div>

      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading tasks...</div>
        }
      >
        <TasksList projectId={resolvedParams.projectId} />
      </Suspense>
    </div>
  );
}

