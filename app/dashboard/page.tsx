export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Suspense } from "react";

async function LogsFeed() {
  const supabase = await createClient();
  
  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Fetch logs from the 'logs' table
  const { data: logs, error } = await supabase
    .from("logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching logs:", error);
    return (
      <div className="text-sm text-muted-foreground">
        Error loading logs. Please make sure the 'logs' table exists in your Supabase database.
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No logs yet. Create your first log to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log) => (
        <Card key={log.id} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Placeholder Avatar */}
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-medium text-muted-foreground">
                    {log.action?.[0]?.toUpperCase() || "?"}
                  </span>
                </div>
              </div>
              
              {/* Log Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {log.action || "No action"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "No date"}
                    </p>
                  </div>
                  
                  {/* Category Badge */}
                  {log.category && (
                    <Badge variant="secondary" className="flex-shrink-0">
                      {log.category}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header with New Log Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your SEO activities and updates
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          New Log
        </Button>
      </div>

      {/* Logs Feed */}
      <div className="mt-4">
        <Suspense
          fallback={
            <div className="text-sm text-muted-foreground">Loading logs...</div>
          }
        >
          <LogsFeed />
        </Suspense>
      </div>
    </div>
  );
}

