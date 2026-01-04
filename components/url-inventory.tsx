"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRight, FileText, Search, Link2, Settings, MoreVertical } from "lucide-react";
import { MonitoringDrawer } from "./monitoring-drawer";

interface UrlWithStats {
  id: string;
  url: string;
  project_id: string;
  created_at: string;
  log_count: number;
  active_task_count: number;
  last_tracked_at?: string | null;
  is_monitored?: boolean;
  monitoring_frequency?: string | null;
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
  const [selectedUrlId, setSelectedUrlId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return urls;
    return urls.filter((u) => u.url.toLowerCase().includes(q));
  }, [query, urls]);

  const handleOpenSettings = (urlId: string) => {
    setSelectedUrlId(urlId);
    setIsDrawerOpen(true);
  };

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
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <CardTitle className="text-sm md:text-base truncate">
                          {path}
                        </CardTitle>
                      </div>
                      {host && (
                        <p className="text-xs text-muted-foreground truncate ml-6">
                          {host}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status Badge */}
                      <Badge
                        variant={url.is_monitored ? "default" : "secondary"}
                        className={
                          url.is_monitored
                            ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                            : "text-slate-600 dark:text-slate-400"
                        }
                      >
                        {url.is_monitored && url.monitoring_frequency
                          ? `Active (${url.monitoring_frequency})`
                          : "Paused"}
                      </Badge>

                      {/* Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenSettings(url.id)}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/projects/${projectId}/urls/${url.id}`}
                              className="flex items-center"
                            >
                              <ArrowRight className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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

      {/* Monitoring Drawer */}
      {selectedUrlId && (
        <MonitoringDrawer
          urlId={selectedUrlId}
          projectId={projectId}
          isOpen={isDrawerOpen}
          onOpenChange={(open) => {
            setIsDrawerOpen(open);
            if (!open) {
              setSelectedUrlId(null);
            }
          }}
          initialIsMonitored={
            urls.find((u) => u.id === selectedUrlId)?.is_monitored || false
          }
          initialLastChecked={
            urls.find((u) => u.id === selectedUrlId)?.last_tracked_at || null
          }
          onStatusChange={() => {
            // Refresh will be handled by router.refresh() in the drawer
          }}
        />
      )}
    </div>
  );
}


