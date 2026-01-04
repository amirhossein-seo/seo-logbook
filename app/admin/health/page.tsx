import { getAdminErrorFeed, getAdminErrorGrouping, getAdminNoisyDomains } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Globe, Activity } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
  const errorFeed = await getAdminErrorFeed();
  const errorGrouping = await getAdminErrorGrouping();
  const noisyDomains = await getAdminNoisyDomains();

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

  const formatErrors = (errors: any) => {
    if (!errors) return "No errors";
    if (Array.isArray(errors)) {
      return errors.map((e, i) => (
        <div key={i} className="text-xs text-red-600 dark:text-red-400 mb-1">
          {typeof e === "string" ? e : JSON.stringify(e)}
        </div>
      ));
    }
    return <div className="text-xs text-red-600 dark:text-red-400">{String(errors)}</div>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Platform Health & Error Log
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Monitor platform-wide errors and identify problematic domains
        </p>
      </div>

      {/* Top Recurring Errors Card */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            Top Recurring Errors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-900 dark:text-red-100">
                  JSON-LD Parsing Failures
                </span>
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {errorGrouping.jsonLdErrors}
              </div>
              {errorGrouping.total > 0 && (
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  {((errorGrouping.jsonLdErrors / errorGrouping.total) * 100).toFixed(1)}% of all errors
                </p>
              )}
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Network Timeouts
                </span>
              </div>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {errorGrouping.networkTimeouts}
              </div>
              {errorGrouping.total > 0 && (
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                  {((errorGrouping.networkTimeouts / errorGrouping.total) * 100).toFixed(1)}% of all errors
                </p>
              )}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Other Errors
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {errorGrouping.otherErrors}
              </div>
              {errorGrouping.total > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {((errorGrouping.otherErrors / errorGrouping.total) * 100).toFixed(1)}% of all errors
                </p>
              )}
            </div>
          </div>
          {errorGrouping.total > 0 && (
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong>Total Errors Analyzed:</strong> {errorGrouping.total} errors across the last 1000 monitor runs
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Noisy Domains Table */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Scraper Settings Registry - Noisy Domains
          </CardTitle>
        </CardHeader>
        <CardContent>
          {noisyDomains.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p>No noisy domains detected yet.</p>
              <p className="text-xs mt-2 text-slate-400 dark:text-slate-500">
                Domains with high error rates will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Domain
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Error Rate
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Errors
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Total Runs
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Unique URLs
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {noisyDomains.map((domain) => (
                    <tr
                      key={domain.domain}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {domain.domain}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            domain.errorRate >= 50
                              ? "destructive"
                              : domain.errorRate >= 25
                              ? "default"
                              : "secondary"
                          }
                        >
                          {domain.errorRate}%
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                          {domain.errorCount}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {domain.totalRuns}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {domain.uniqueUrls}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Error Feed */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Global Error Feed (Last 50 Runs with Errors)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {errorFeed.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p>No errors found in recent monitor runs.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {errorFeed.map((run: any) => {
                const project = run.monitors?.projects;
                const errors = run.errors || [];
                
                return (
                  <div
                    key={run.id}
                    className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-red-50/50 dark:bg-red-900/10"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {project?.name || "Unknown Project"}
                          </span>
                          <Badge variant="destructive" className="text-xs">
                            {run.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {formatDate(run.started_at)}
                        </p>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {run.urls_checked || 0} URLs checked
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Errors:
                      </p>
                      <div className="space-y-1">
                        {formatErrors(errors)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
