"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Send, AlertCircle, CheckCircle2 } from "lucide-react";

interface Notification {
  id: string;
  recipient_email: string;
  status: string;
  created_at: string;
  project_id: string;
  monitor_run_id: string;
  error_message?: string | null;
  projects?: { name: string } | null;
  monitor_runs?: { started_at: string } | null;
}

interface AdminNotificationsClientProps {
  initialNotifications: Notification[];
  onForceDispatch: (projectId: string, runId: string) => Promise<void>;
  onRetryAll: () => Promise<{ success: boolean; processed?: number; succeeded?: number; failed?: number; message?: string; error?: string }>;
}

export function AdminNotificationsClient({
  initialNotifications,
  onForceDispatch,
  onRetryAll,
}: AdminNotificationsClientProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [isLoading, setIsLoading] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryResult, setRetryResult] = useState<{ success: boolean; processed?: number; succeeded?: number; failed?: number; message?: string; error?: string } | null>(null);

  async function handleForceDispatch(projectId: string, runId: string) {
    setDispatching(`${projectId}-${runId}`);
    try {
      await onForceDispatch(projectId, runId);
      router.refresh();
    } catch (error) {
      console.error("Error forcing dispatch:", error);
    } finally {
      setDispatching(null);
    }
  }

  async function handleRetryAll() {
    setRetryingAll(true);
    setRetryResult(null);
    try {
      const result = await onRetryAll();
      setRetryResult(result);
      router.refresh();
    } catch (error) {
      console.error("Error retrying all notifications:", error);
      setRetryResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setRetryingAll(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      sent: "default",
      failed: "destructive",
      pending: "secondary",
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

  // Group notifications by project_id and monitor_run_id for Force Dispatch button
  const groupedNotifications = notifications.reduce((acc, notif) => {
    const key = `${notif.project_id}-${notif.monitor_run_id}`;
    if (!acc[key]) {
      acc[key] = {
        projectId: notif.project_id,
        runId: notif.monitor_run_id,
        projectName: notif.projects?.name || "Unknown Project",
        notifications: [],
        hasPending: false,
        hasFailed: false,
      };
    }
    acc[key].notifications.push(notif);
    if (notif.status === "pending") {
      acc[key].hasPending = true;
    }
    if (notif.status === "failed") {
      acc[key].hasFailed = true;
    }
    return acc;
  }, {} as Record<string, { projectId: string; runId: string; projectName: string; notifications: Notification[]; hasPending: boolean; hasFailed: boolean }>);

  // Count failed and pending notifications
  const failedCount = notifications.filter(n => n.status === "failed").length;
  const pendingCount = notifications.filter(n => n.status === "pending").length;
  const totalRetryable = failedCount + pendingCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Delivery Hub
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Email notification logs and manual dispatch controls
          </p>
        </div>
        {totalRetryable > 0 && (
          <Button
            onClick={handleRetryAll}
            disabled={retryingAll}
            variant="default"
            className="gap-2"
          >
            {retryingAll ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send All ({totalRetryable})
              </>
            )}
          </Button>
        )}
      </div>

      {retryResult && (
        <div className={`p-4 rounded-md border ${
          retryResult.success 
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        }`}>
          <div className="flex items-start gap-2">
            {retryResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                retryResult.success 
                  ? "text-green-900 dark:text-green-100" 
                  : "text-red-900 dark:text-red-100"
              }`}>
                {retryResult.success ? retryResult.message : retryResult.error}
              </p>
              {retryResult.success && retryResult.processed !== undefined && (
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Processed: {retryResult.processed} | Succeeded: {retryResult.succeeded} | Failed: {retryResult.failed}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Notification Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p>No notifications found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Project
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Recipient
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Error
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Created At
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((notif) => (
                    <tr
                      key={notif.id}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {notif.projects?.name || "Unknown Project"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {notif.recipient_email}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(notif.status)}
                      </td>
                      <td className="py-3 px-4">
                        {notif.error_message ? (
                          <div className="text-xs text-red-600 dark:text-red-400 break-words max-w-md">
                            <div className="flex items-start gap-1">
                              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="flex-1">{notif.error_message}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {formatDate(notif.created_at)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {(notif.status === "pending" || notif.status === "failed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleForceDispatch(notif.project_id, notif.monitor_run_id)}
                            disabled={dispatching === `${notif.project_id}-${notif.monitor_run_id}`}
                          >
                            {dispatching === `${notif.project_id}-${notif.monitor_run_id}` ? (
                              <>
                                <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                                Dispatching...
                              </>
                            ) : (
                              <>
                                <Send className="h-3 w-3 mr-2" />
                                Retry
                              </>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

