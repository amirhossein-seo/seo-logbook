"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, FileText, Search, Link2 } from "lucide-react";

interface UrlWithStats {
  id: string;
  url: string;
  project_id: string;
  created_at: string;
  log_count: number;
  active_task_count: number;
  last_tracked_at?: string | null;
}

interface UrlInventoryProps {
  urls: UrlWithStats[];
  projectId: string;
}

function splitUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || "/";
    const host = parsed.hostname;
    return { path, host };
  } catch {
    // Not a full URL, treat as path
    return { path: url, host: "" };
  }
}

export function UrlInventory({ urls, projectId }: UrlInventoryProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return urls;
    return urls.filter((u) => u.url.toLowerCase().includes(q));
  }, [query, urls]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search URLs..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No URLs match your search.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((url) => {
            const { path, host } = splitUrl(url.url);
            const lastTracked =
              url.last_tracked_at || url.created_at || null;

            return (
              <Card
                key={url.id}
                className="border-border hover:shadow-sm transition-shadow"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm md:text-base truncate">
                          {path}
                        </CardTitle>
                      </div>
                      {host && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {host}
                        </p>
                      )}
                    </div>

                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                    >
                      <Link
                        href={`/projects/${projectId}/urls/${url.id}`}
                      >
                        View
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
                    {/* Stats badges */}
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="text-xs font-medium flex items-center gap-1"
                      >
                        📝 {url.log_count} Logs
                      </Badge>

                      <Badge
                        variant={
                          url.active_task_count > 0
                            ? "secondary"
                            : "outline"
                        }
                        className={`text-xs font-medium flex items-center gap-1 ${
                          url.active_task_count > 0
                            ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300"
                            : "text-muted-foreground"
                        }`}
                      >
                        ✅ {url.active_task_count} Tasks
                      </Badge>
                    </div>

                    {/* Last tracked */}
                    {lastTracked && (
                      <span className="text-xs text-muted-foreground">
                        Last tracked{" "}
                        {new Date(lastTracked).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}

                    {/* External link shortcut */}
                    <div className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                      <Link2 className="h-3 w-3" />
                      <a
                        href={url.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate max-w-[180px]"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


