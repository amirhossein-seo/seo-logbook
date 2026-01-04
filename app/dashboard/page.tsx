export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats, getProjects, getTeamMembers, getUserWorkspace } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogFeed } from "@/components/log-feed";
import { FolderKanban, Link as LinkIcon, Activity, CheckSquare, TrendingUp, Clock, User, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import { InvitationToastHandler } from "@/components/invitation-toast-handler";

async function DashboardStats() {
  const stats = await getDashboardStats();

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {/* Projects Card */}
      <Card className="bg-white/70 backdrop-blur-lg border-white/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-muted-foreground">Projects</CardTitle>
          <FolderKanban className="h-4 w-4 text-slate-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900 dark:text-foreground">{stats.totalProjects}</div>
          <p className="text-xs text-slate-500">
            Total projects in workspace
          </p>
        </CardContent>
      </Card>

      {/* Tracked URLs Card */}
      <Card className="bg-white/70 backdrop-blur-lg border-white/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-muted-foreground">Tracked URLs</CardTitle>
          <LinkIcon className="h-4 w-4 text-slate-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900 dark:text-foreground">{stats.monitoredUrls}</div>
          <p className="text-xs text-slate-500">
            URLs with monitoring enabled
          </p>
        </CardContent>
      </Card>

      {/* SEO Changes Card */}
      <Card className="bg-white/70 backdrop-blur-lg border-white/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-muted-foreground">SEO Changes</CardTitle>
          <Activity className="h-4 w-4 text-slate-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900 dark:text-foreground">{stats.weeklyActivity}</div>
          <p className="text-xs text-slate-500">
            Logs created in last 7 days
          </p>
        </CardContent>
      </Card>

      {/* Open Tasks Card */}
      <Card className="bg-white/70 backdrop-blur-lg border-white/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-muted-foreground">Open Tasks</CardTitle>
          <CheckSquare className="h-4 w-4 text-slate-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900 dark:text-foreground">{stats.openTasks}</div>
          <p className="text-xs text-slate-500">
            Tasks not completed
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

async function RecentActivityFeed() {
  const stats = await getDashboardStats();

  if (stats.recentLogs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No recent activity. Create your first log to get started.</p>
      </div>
    );
  }

  return <LogFeed logs={stats.recentLogs} />;
}

async function UpcomingTasks() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) return null;

  // Get all project IDs for this workspace
  const { data: workspaceProjects } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId);

  const projectIds = workspaceProjects?.map((p) => p.id) || [];
  if (projectIds.length === 0) return null;

  // Fetch upcoming tasks (not Done, ordered by due_date)
  const { data: tasks } = await supabase
    .from("tasks")
    .select(`
      *,
      projects (
        name
      )
    `)
    .in("project_id", projectIds)
    .neq("status", "Done")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No upcoming tasks
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "No due date";
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority?.toUpperCase()) {
      case "HIGH":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
      case "MEDIUM":
      case "MED":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
      case "LOW":
        return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      default:
        return "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20";
    }
  };

  return (
    <div className="space-y-2">
      {tasks.map((task: any) => (
        <Link
          key={task.id}
          href={`/projects/${task.project_id}/tasks`}
          className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
        >
          {/* Round Checkbox */}
          <div className="flex-shrink-0 pt-0.5">
            <div className="h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
          </div>
          
          {/* Task Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {task.title}
            </p>
            <div className="mt-1">
              <Badge
                variant="outline"
                className={`text-xs ${getPriorityColor(task.priority)}`}
              >
                {task.priority?.toUpperCase() || "NORMAL"}
              </Badge>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

async function WorkspaceAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) return null;

  const members = await getTeamMembers(workspaceId);

  if (!members || members.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No team members
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.slice(0, 5).map((member: any) => {
        const isProjectGuest = member.role !== "owner" && member.role !== "admin";
        return (
          <div key={member.member_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {member.email}
              </p>
              <div className="flex items-center gap-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{member.role}</p>
                {isProjectGuest && (
                  <>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-400">(Project Guest)</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function WeeklyActivityChart() {
  // Placeholder for chart - you can integrate a charting library later
  return (
    <div className="h-48 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 rounded-lg">
      <div className="text-center">
        <TrendingUp className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Weekly Activity Chart</p>
        <p className="text-xs text-slate-400 mt-1">Chart visualization coming soon</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Check if user has any projects
  const { projects } = await getProjects();
  const hasProjects = projects.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 -m-6 p-6" style={{
      backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.15) 1px, transparent 0)',
      backgroundSize: '20px 20px'
    }}>
      <InvitationToastHandler />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Workspace Overview</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Welcome back! Here's what's happening in your workspace.
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <Suspense
          fallback={
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-white/70 backdrop-blur-lg border-white/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          }
        >
          <div className="mb-6">
            <DashboardStats />
          </div>
        </Suspense>

        {/* Main Grid: 3/4 left, 1/4 right */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: 3/4 width */}
          <div className="lg:col-span-3 space-y-6">
            {/* Recent Activity Feed */}
            {hasProjects ? (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader>
                  <div>
                    <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Activity</CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Latest logs from your workspace
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <Suspense
                    fallback={
                      <div className="text-sm text-muted-foreground py-8">Loading recent activity...</div>
                    }
                  >
                    <RecentActivityFeed />
                  </Suspense>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed bg-white">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No projects yet
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    Create your first project to start tracking SEO activities and URLs.
                  </p>
                  <Button asChild>
                    <Link href="/projects">
                      Create Your First Project
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: 1/4 width */}
          <div className="lg:col-span-1 space-y-6">
            {/* Weekly SEO Activity */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">Weekly SEO Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-48 bg-slate-50 animate-pulse rounded-lg" />}>
                  <WeeklyActivityChart />
                </Suspense>
              </CardContent>
            </Card>

            {/* Upcoming Tasks */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">Upcoming Tasks</CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-600 dark:text-slate-400">
                    + Add New
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="text-sm text-muted-foreground py-4">Loading tasks...</div>}>
                  <UpcomingTasks />
                </Suspense>
              </CardContent>
            </Card>

            {/* Workspace Access */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">Workspace Access</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="text-sm text-muted-foreground py-4">Loading members...</div>}>
                  <WorkspaceAccess />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
