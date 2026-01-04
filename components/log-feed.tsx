"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  FileText,
  Wrench,
  Link as LinkIcon,
  Globe,
  Code,
  Pin,
  ExternalLink,
  History,
  MoreVertical,
  Edit,
  Trash2,
} from "lucide-react";
import { SystemLogCard } from "./system-log-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useRef } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { useSearchParams } from "next/navigation";

interface Log {
  id: string;
  public_id?: string | null;
  title: string;
  category: string | null;
  description: string | null;
  created_at: string;
  created_by: string;
  user_name?: string;
  project_name?: string;
  source?: string | null;
  changes?: string[] | null;
  urls?: Array<{
    id: string;
    url: string;
    project_id?: string;
  }>;
}

interface LogFeedProps {
  logs: Log[];
  projectId?: string;
  highlightId?: string;
}

function getCategoryIcon(category: string | null | undefined) {
  switch (category) {
    case "Content":
      return FileText;
    case "Technical":
      return Wrench;
    case "Internal Link":
      return LinkIcon;
    case "External Link":
      return Globe;
    case "Schema":
      return Code;
    default:
      return Pin;
  }
}

function LogCard({ log, projectId, isHighlighted, logId }: { log: Log; projectId?: string; isHighlighted?: boolean; logId?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const mounted = useMounted();
  const cardRef = useRef<HTMLDivElement>(null);

  // Scroll into view when highlighted
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [isHighlighted]);

  return (
    <Card
      ref={cardRef}
      id={logId ? `log-${logId}` : undefined}
      key={log.id}
      className={`border ${
        isHighlighted
          ? "ring-2 ring-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/20 transition-all duration-1000 border-yellow-400 dark:border-yellow-600 shadow-lg"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
      } group`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Smart Category Icon */}
          <div className="flex-shrink-0">
            {(() => {
              const Icon = getCategoryIcon(log.category);
              return (
                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
              );
            })()}
          </div>

          {/* Log Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  {log.title}
                </h3>
                {/* Meta row: user + project + date */}
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
                  <span>{log.user_name || "Unknown user"}</span>
                  {log.project_name && (
                    <>
                      <span>•</span>
                      <span>{log.project_name}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>
                    {new Date(log.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {log.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                    {log.description}
                  </p>
                )}

                {/* Category badges (up to 2) with filter link */}
                {log.category && (
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {log.category.split(',').slice(0, 2).map((cat, idx) => (
                      projectId ? (
                        <Link
                          key={idx}
                          href={`/projects/${projectId}/logs?category=${encodeURIComponent(
                            cat.trim(),
                          )}`}
                        >
                          <Badge
                            variant="secondary"
                            className="text-xs hover:opacity-80 transition-opacity"
                          >
                            {cat.trim()}
                          </Badge>
                        </Link>
                      ) : (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {cat.trim()}
                        </Badge>
                      )
                    ))}
                  </div>
                )}
              </div>

              {/* Three-dot dropdown menu - appears on hover */}
              <div className={`flex-shrink-0 transition-opacity ${isHovered ? "opacity-100" : "opacity-0"}`}>
                {mounted && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <MoreVertical className="h-4 w-4 text-slate-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* URL Attachments */}
            {log.urls && log.urls.length > 0 && (
              <div className="mt-3 space-y-1">
                {log.urls.map((url) => {
                  const urlProjectId = url.project_id || projectId;
                  const canLinkToDetails = url.id && urlProjectId;

                  if (canLinkToDetails) {
                    return (
                      <Link
                        key={url.id}
                        href={`/projects/${urlProjectId}/urls/${url.id}`}
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline truncate max-w-full"
                        title={url.url}
                      >
                        <History className="h-3 w-3" />
                        <span className="truncate">{url.url}</span>
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={url.id || url.url}
                      href={url.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-full"
                      title={url.url}
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="truncate">{url.url}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LogFeed({ logs, projectId, highlightId: propHighlightId }: LogFeedProps) {
  const searchParams = useSearchParams();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [allLogs, setAllLogs] = useState<Log[]>(logs);
  
  // Get highlight from URL search params - check both 'highlight' and 'log_id' parameters
  const highlightId = searchParams.get("highlight") || searchParams.get("log_id") || propHighlightId;

  // Check if highlighted log is in current view, if not fetch it
  useEffect(() => {
    async function fetchMissingLog() {
      if (!highlightId || !projectId) return;
      
      // Check if log exists in initial logs or already fetched logs
      // Compare against public_id first, then fall back to id for backward compatibility
      const logExists = allLogs.some((log) => 
        (log.public_id && log.public_id === highlightId) || log.id === highlightId
      );
      
      if (!logExists) {
        // Log not in current view - fetch it
        try {
          const { getLogById } = await import("@/app/actions");
          const missingLog = await getLogById(highlightId, projectId);
          
          if (missingLog) {
            // Add the log to the beginning of the list
            setAllLogs((prev) => {
              // Prevent duplicates - check both public_id and id
              const exists = prev.some((log) => 
                (log.public_id && log.public_id === highlightId) || log.id === highlightId
              );
              if (exists) {
                return prev;
              }
              return [missingLog as Log, ...prev];
            });
            setToastMessage("Showing historical log entry");
            
            // Auto-remove toast after 5 seconds
            setTimeout(() => {
              setToastMessage(null);
            }, 5000);
          }
        } catch (error) {
          console.error("Error fetching missing log:", error);
        }
      }
    }
    
    fetchMissingLog();
    // Only depend on highlightId and projectId, not allLogs to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, projectId]);

  // Auto-scroll to highlighted log when component mounts or highlightId changes
  useEffect(() => {
    if (highlightId) {
      // Wait for logs to render, then scroll to highlighted element
      const timer = setTimeout(() => {
        const element = document.getElementById(`log-${highlightId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500); // Increased delay to ensure logs are rendered (including fetched historical logs)
      return () => clearTimeout(timer);
    }
  }, [highlightId, allLogs.length]); // Also depend on allLogs.length to ensure logs are loaded

  if (allLogs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No logs yet. Create your first log to get started.</p>
      </div>
    );
  }

  return (
    <>
      {/* Toast notification for historical log */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[320px] max-w-md animate-in slide-in-from-top-5">
          <History className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-sm text-slate-900 dark:text-slate-100 flex-1">
            {toastMessage}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {allLogs.map((log) => {
          // Compare against public_id first, then fall back to id for backward compatibility
          const isHighlighted = highlightId === (log.public_id || log.id);
          // Use truly unique key combining source, id, and created_at to prevent duplicate key errors
          const uniqueKey = `${log.source || 'user'}-${log.id}-${log.created_at}`;
          // Use public_id for highlighting if available, otherwise use id
          const logIdForHighlight = log.public_id || log.id;
          
          // Render system logs with SystemLogCard
          if (log.source === "system") {
            return <SystemLogCard key={uniqueKey} log={log as any} projectId={projectId} isHighlighted={isHighlighted} logId={logIdForHighlight} />;
          }

          // Render regular user logs with the new LogCard component
          return <LogCard key={uniqueKey} log={log} projectId={projectId} isHighlighted={isHighlighted} logId={logIdForHighlight} />;
        })}
      </div>
    </>
  );
}
