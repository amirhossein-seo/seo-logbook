"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { getEmailNotifications } from "@/app/actions";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface NotificationsHistoryTableProps {
  projectId: string;
}

interface Notification {
  id: string;
  project_id: string;
  monitor_run_id: string | null;
  recipient_email: string;
  status: "pending" | "sent" | "failed";
  created_at: string;
}

export function NotificationsHistoryTable({ projectId }: NotificationsHistoryTableProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        setLoading(true);
        const data = await getEmailNotifications(projectId);
        setNotifications(data || []);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }

    fetchNotifications();
  }, [projectId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
            Sent
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">
            Failed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
            Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-12 bg-slate-100 dark:bg-slate-900 rounded-md animate-pulse" />
        <div className="h-12 bg-slate-100 dark:bg-slate-900 rounded-md animate-pulse" />
        <div className="h-12 bg-slate-100 dark:bg-slate-900 rounded-md animate-pulse" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No notifications have been sent for this project yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Recipient
            </th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Status
            </th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Triggered By
            </th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((notification) => (
            <tr
              key={notification.id}
              className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
            >
              <td className="py-3 px-4">
                <span className="text-sm text-slate-900 dark:text-slate-100">
                  {notification.recipient_email}
                </span>
              </td>
              <td className="py-3 px-4">
                {getStatusBadge(notification.status)}
              </td>
              <td className="py-3 px-4">
                {notification.monitor_run_id ? (
                  <Link
                    href={`/projects/${projectId}/monitor-history`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>View Run</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-sm text-slate-400">N/A</span>
                )}
              </td>
              <td className="py-3 px-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {formatDate(notification.created_at)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

