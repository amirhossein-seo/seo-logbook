import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjectStats } from "@/app/actions";
import { LogFeed } from "@/components/log-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Link as LinkIcon, CheckSquare } from "lucide-react";
import { Suspense } from "react";

async function ProjectStats({ projectId }: { projectId: string }) {
  const stats = await getProjectStats(projectId);

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Unable to load project statistics.</p>
      </div>
    );
  }

  return (
    <>
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLogs}</div>
            <p className="text-xs text-muted-foreground">
              SEO activities tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tracked URLs</CardTitle>
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUrls}</div>
            <p className="text-xs text-muted-foreground">
              URLs being monitored
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTasks}</div>
            <p className="text-xs text-muted-foreground">
              Tasks in progress
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Recent Activity
        </h2>
        {stats.recentActivity.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No recent activity.</p>
          </div>
        ) : (
          <LogFeed logs={stats.recentActivity} projectId={projectId} />
        )}
      </div>
    </>
  );
}

export default async function ProjectOverviewPage({
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
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Project summary and recent activity
        </p>
      </div>

      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading statistics...</div>
        }
      >
        <ProjectStats projectId={resolvedParams.projectId} />
      </Suspense>
    </div>
  );
}

