import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLogs } from "@/app/actions";
import { LogFeed } from "@/components/log-feed";
import { NewLogDialog } from "@/components/new-log-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";

async function LogsList({
  projectId,
  category,
}: {
  projectId: string;
  category?: string;
}) {
  const logs = await getLogs(projectId, category);
  return <LogFeed logs={logs} projectId={projectId} />;
}

export default async function ProjectLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const category = resolvedSearchParams.category;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track SEO activities and updates for this project
          </p>
        </div>
        <NewLogDialog projectId={resolvedParams.projectId} />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          "All",
          "Content",
          "Technical",
          "Internal Link",
          "External Link",
          "Schema",
          "Other",
        ].map((cat) => {
          const isAll = cat === "All";
          const isActive = isAll
            ? !category || !category.trim()
            : category?.trim() === cat;

          const href = isAll
            ? `/projects/${resolvedParams.projectId}/logs`
            : `/projects/${resolvedParams.projectId}/logs?category=${encodeURIComponent(
                cat,
              )}`;

          return (
            <Link key={cat} href={href}>
              <Badge
                variant={isActive ? "default" : "secondary"}
                className="cursor-pointer px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80"
              >
                {cat}
              </Badge>
            </Link>
          );
        })}
      </div>

      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading logs...</div>
        }
      >
        <LogsList
          projectId={resolvedParams.projectId}
          category={category}
        />
      </Suspense>
    </div>
  );
}

