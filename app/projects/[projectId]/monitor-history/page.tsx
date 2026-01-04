export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMonitorRuns, getLogIdForMonitorRun } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, History, ClipboardCheck, ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ManualVerificationButton } from "@/components/manual-verification-button";

async function MonitorRunsTable({ projectId }: { projectId: string }) {
  const runs = await getMonitorRuns(projectId);

  if (runs.length === 0) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <History className="h-12 w-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            No Monitor History
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
            Your first automated check hasn't run yet. Use the "Manual Verification" button above to trigger a check.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string, startedAt: string | null) => {
    // Check if run is stuck (running for more than 5 minutes)
    const isStuck = status === "running" && startedAt && 
      (new Date().getTime() - new Date(startedAt).getTime()) > 5 * 60 * 1000;
    
    if (isStuck) {
      return <XCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
    }
    if (status === "queue") {
      return <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    }
    if (status === "completed") {
      return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    }
    if (status === "completed_with_errors" || status === "failed") {
      return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
    }
    return <History className="h-5 w-5 text-slate-400" />;
  };

  const getStatusLabel = (status: string, startedAt: string | null, urlsChecked?: number, totalUrls?: number) => {
    // Check if run is stuck (running for more than 5 minutes)
    const isStuck = status === "running" && startedAt && 
      (new Date().getTime() - new Date(startedAt).getTime()) > 5 * 60 * 1000;
    
    if (isStuck) {
      return "Timed Out";
    }
    if (status === "queue") {
      return "Queued";
    }
    if (status === "running" && urlsChecked !== undefined && totalUrls !== undefined) {
      return `Processing (${urlsChecked}/${totalUrls} URLs)`;
    }
    if (status === "completed") return "Success";
    if (status === "completed_with_errors") return "Completed with Errors";
    if (status === "failed") return "Failed";
    if (status === "running") return "Running";
    return status;
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

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Monitor Run History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Time
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  URLs Checked
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: any) => {
                const hasChanges = run.changes_detected > 0;
                const isSuccess = run.status === "completed";
                
                return (
                  <tr
                    key={run.id}
                    className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(run.status, run.started_at)}
                        <span className="text-sm text-slate-900 dark:text-slate-100">
                          {getStatusLabel(run.status, run.started_at, run.urls_checked, run.total_urls)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {formatDate(run.started_at)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {run.urls_checked || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {run.changes_detected === 0 ? (
                        <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <span>✅</span>
                          <span>{run.result || "Stable: No changes detected."}</span>
                        </span>
                      ) : (
                        <ViewLogButton projectId={projectId} runStartedAt={run.started_at} changesDetected={run.changes_detected} result={run.result} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

async function ViewLogButton({
  projectId,
  runStartedAt,
  changesDetected,
  result,
}: {
  projectId: string;
  runStartedAt: string;
  changesDetected: number;
  result?: string | null;
}) {
  // Try to get the specific log ID for this run
  const logId = await getLogIdForMonitorRun(projectId, runStartedAt);
  
  // Use result from monitor_runs if available, otherwise construct the message
  const alertMessage = result || `Alert: ${changesDetected} change${changesDetected !== 1 ? 's' : ''} found`;
  
  // Link to specific log if found, otherwise link to filtered logs page
  const logUrl = logId 
    ? `/projects/${projectId}/logs?highlight=${logId}`
    : `/projects/${projectId}/logs?category=Technical`;
  
  return (
    <Link href={logUrl}>
      <Badge className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20 flex items-center gap-1 cursor-pointer hover:bg-orange-500/20 transition-colors">
        <span>⚠️</span>
        <span>{alertMessage}</span>
      </Badge>
    </Link>
  );
}

export default async function MonitorHistoryPage({
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Monitor History
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View automated monitoring run history for this project
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManualVerificationButton projectId={resolvedParams.projectId} />
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/projects/${resolvedParams.projectId}/overview`}>
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>

      {/* Monitor Runs Table */}
      <MonitorRunsTable projectId={resolvedParams.projectId} />
    </div>
  );
}

