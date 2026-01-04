import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUrlDetails } from "@/app/actions";
import { LogFeed } from "@/components/log-feed";
import { TaskCard } from "@/components/task-card";
import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { LogsHeader } from "@/components/logs/logs-header";

async function UrlDetailsContent({
  urlId,
  projectId,
}: {
  urlId: string;
  projectId: string;
}) {
  const urlDetails = await getUrlDetails(urlId);

  if (!urlDetails) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">URL not found.</p>
      </div>
    );
  }

  const { url, logs, tasks } = urlDetails;

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-semibold text-foreground break-all">
            <a
              href={url.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-2"
            >
              {url.url}
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          First tracked:{" "}
          {new Date(url.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Related Tasks Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Related Tasks
        </h2>
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No active tasks for this URL.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task: any) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* Change History Section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Change History
        </h2>
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No logs found for this URL.</p>
          </div>
        ) : (
          <LogFeed logs={logs} projectId={projectId} />
        )}
      </div>
    </>
  );
}

export default async function UrlDetailsPage({
  params,
}: {
  params: Promise<{ projectId: string; urlId: string }>;
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
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading URL details...</div>
        }
      >
        <UrlDetailsContent
          urlId={resolvedParams.urlId}
          projectId={resolvedParams.projectId}
        />
      </Suspense>
    </div>
  );
}

