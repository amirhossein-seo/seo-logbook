import { getAdminMonitorRuns, getAdminErrorAnalytics, forceGlobalSync, cleanupStuckRuns } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, History, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { AdminOperationsClient } from "./client";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic';

async function forceSyncAction() {
  "use server";
  const result = await forceGlobalSync();
  revalidatePath("/admin/operations");
  return result;
}

async function cleanupStuckAction() {
  "use server";
  const result = await cleanupStuckRuns();
  revalidatePath("/admin/operations");
  return result;
}

export default async function AdminOperationsPage() {
  const runs = await getAdminMonitorRuns(20);
  const errorAnalytics = await getAdminErrorAnalytics();

  const getStatusIcon = (status: string) => {
    if (status === "completed") {
      return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    }
    if (status === "completed_with_errors" || status === "failed") {
      return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
    }
    if (status === "running") {
      return <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    }
    return <AlertCircle className="h-5 w-5 text-slate-400" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      completed: "default",
      completed_with_errors: "destructive",
      failed: "destructive",
      running: "secondary",
      queue: "secondary",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return "N/A";
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) {
      return `${diffSeconds}s`;
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ${diffMinutes % 60}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Control Room
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Platform-wide monitoring operations and status
          </p>
        </div>
        <AdminOperationsClient 
          onForceSync={forceSyncAction}
          onCleanupStuck={cleanupStuckAction}
        />
      </div>

      {/* Error Analytics Card */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            Error Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Runs Analyzed</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {errorAnalytics.totalRuns}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Parsing Failures</p>
              <p className={`text-2xl font-semibold mt-1 ${
                errorAnalytics.parsingFailures > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}>
                {errorAnalytics.parsingFailures}
              </p>
              {errorAnalytics.totalRuns > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {((errorAnalytics.parsingFailures / errorAnalytics.totalRuns) * 100).toFixed(1)}% failure rate
                </p>
              )}
            </div>
          </div>
          {errorAnalytics.parsingFailures > 0 && (
            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md">
              <p className="text-sm text-orange-900 dark:text-orange-100">
                ⚠️ {errorAnalytics.parsingFailures} run(s) detected JSON-LD parsing errors. 
                Check individual runs for details (e.g., "Position 516" errors).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitor Run Feed */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Recent Monitor Runs (Last 20)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p>No monitor runs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Project
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      URLs Checked
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Changes Detected
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run: any) => {
                    const project = run.monitors?.projects;
                    
                    return (
                      <tr
                        key={run.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(run.status)}
                            {getStatusBadge(run.status)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-900 dark:text-slate-100">
                            {project?.name || "Unknown Project"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {run.urls_checked || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-sm font-medium ${
                            run.changes_detected > 0
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-slate-600 dark:text-slate-400"
                          }`}>
                            {run.changes_detected || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {calculateDuration(run.started_at, run.completed_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
