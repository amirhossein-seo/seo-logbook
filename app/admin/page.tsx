import { getAdminOverviewStats, getAdminErrorAnalytics } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Link as LinkIcon, Mail, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const stats = await getAdminOverviewStats();
  const errorAnalytics = await getAdminErrorAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Admin Dashboard
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Platform-wide overview and statistics
        </p>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalUsers}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Platform users
            </p>
            <Button
              asChild
              variant="link"
              className="p-0 h-auto mt-2 text-xs"
            >
              <Link href="/admin/users">View Registry →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Total URLs Tracked
            </CardTitle>
            <LinkIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalUrlsTracked}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              URLs being monitored
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Failed Notifications
            </CardTitle>
            <Mail className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              stats.failedNotificationsQueue > 0
                ? "text-red-600 dark:text-red-400"
                : "text-slate-900 dark:text-slate-100"
            }`}>
              {stats.failedNotificationsQueue}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              In queue
            </p>
            {stats.failedNotificationsQueue > 0 && (
              <Button
                asChild
                variant="link"
                className="p-0 h-auto mt-2 text-xs"
              >
                <Link href="/admin/notifications">View Queue →</Link>
              </Button>
            )}
          </CardContent>
        </Card>
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
              </p>
            </div>
          )}
          <div className="mt-4">
            <Button
              asChild
              variant="outline"
              size="sm"
            >
              <Link href="/admin/operations">View Control Room →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              asChild
              variant="outline"
              className="justify-start"
            >
              <Link href="/admin/operations">
                <AlertCircle className="h-4 w-4 mr-2" />
                Control Room
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-start"
            >
              <Link href="/admin/notifications">
                <Mail className="h-4 w-4 mr-2" />
                Delivery Hub
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-start"
            >
              <Link href="/admin/users">
                <Users className="h-4 w-4 mr-2" />
                User Registry
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-start"
            >
              <Link href="/admin/health">
                <AlertCircle className="h-4 w-4 mr-2" />
                Error Log
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

