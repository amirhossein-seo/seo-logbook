"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, MoreVertical, Edit, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useRef } from "react";
import { useMounted } from "@/hooks/use-mounted";

interface SystemLog {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  created_at: string;
  source: "system";
  project_name?: string;
  changes?: string[] | null;
  urls?: Array<{
    id: string;
    url: string;
    project_id?: string;
  }>;
}

interface SystemLogCardProps {
  log: SystemLog;
  projectId?: string;
  isHighlighted?: boolean;
  logId?: string;
}

/**
 * Parse a change string to extract field name and before/after values
 * Examples:
 *   "Title: \"old\" → \"new\"" -> { field: "Title", before: "old", after: "new" }
 *   "Meta description changed" -> { field: "Meta description", before: null, after: null }
 */
function parseChange(change: string): {
  field: string;
  before: string | null;
  after: string | null;
} {
  // Check if it's a simple "X changed" format
  if (change.endsWith(" changed")) {
    return {
      field: change.replace(" changed", ""),
      before: null,
      after: null,
    };
  }

  // Parse "Field: \"before\" → \"after\"" format
  // Handle escaped quotes, newlines, and special characters
  // More robust regex that handles escaped characters
  const arrowMatch = change.match(/^(.+?):\s*"((?:[^"\\]|\\.|\\n)*)"\s*→\s*"((?:[^"\\]|\\.|\\n)*)"$/);
  if (arrowMatch) {
    const unescape = (str: string) => str.replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
    return {
      field: arrowMatch[1].trim(),
      before: unescape(arrowMatch[2]),
      after: unescape(arrowMatch[3]),
    };
  }

  // Try to parse with (empty) placeholder
  const emptyMatch = change.match(/^(.+?):\s*"\(empty\)"\s*→\s*"((?:[^"\\]|\\.|\\n)*)"$/);
  if (emptyMatch) {
    const unescape = (str: string) => str.replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
    return {
      field: emptyMatch[1].trim(),
      before: null,
      after: unescape(emptyMatch[2]),
    };
  }

  const emptyMatch2 = change.match(/^(.+?):\s*"((?:[^"\\]|\\.|\\n)*)"\s*→\s*"\(empty\)"$/);
  if (emptyMatch2) {
    const unescape = (str: string) => str.replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
    return {
      field: emptyMatch2[1].trim(),
      before: unescape(emptyMatch2[2]),
      after: null,
    };
  }

  // Fallback: return as-is
  return {
    field: change,
    before: null,
    after: null,
  };
}

export function SystemLogCard({ log, projectId, isHighlighted, logId }: SystemLogCardProps) {
  const isInitialSnapshot = log.title === "URL Monitoring Started";
  const hasChanges = log.changes && Array.isArray(log.changes) && log.changes.length > 0;
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
          {/* Bot Icon or UserPlus for invites */}
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
              {log.title.includes("Invited") || log.title.includes("invited") ? (
                <UserPlus className="h-5 w-5 text-blue-500" />
              ) : (
                <Bot className="h-5 w-5 text-blue-500" />
              )}
            </div>
          </div>

          {/* Log Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  {log.title}
                </h3>
                {/* Meta row: project + date */}
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
                  {log.project_name && (
                    <>
                      <span>{log.project_name}</span>
                      <span>•</span>
                    </>
                  )}
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

                {/* Changes Display */}
                {isInitialSnapshot ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Baseline snapshot captured.
                  </div>
                ) : hasChanges ? (
                  <div className="mt-3 space-y-4">
                    {/* Group changes by category */}
                    {(() => {
                      const parsedChanges = log.changes!.map((change) => parseChange(change));
                      const grouped = parsedChanges.reduce((acc, change, index) => {
                        // Determine category from field name
                        let category = "Other";
                        if (
                          change.field.toLowerCase().includes("schema") ||
                          change.field.toLowerCase().includes("canonical") ||
                          change.field.toLowerCase().includes("robots")
                        ) {
                          category = "Technical";
                        } else if (
                          change.field.toLowerCase().includes("title") ||
                          change.field.toLowerCase().includes("h1") ||
                          change.field.toLowerCase().includes("meta description")
                        ) {
                          category = "On-Page";
                        }

                        if (!acc[category]) {
                          acc[category] = [];
                        }
                        acc[category].push({ ...change, originalIndex: index });
                        return acc;
                      }, {} as Record<string, Array<ReturnType<typeof parseChange> & { originalIndex: number }>>);

                      return Object.entries(grouped).map(([category, changes]) => (
                        <div key={category} className="space-y-2">
                          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            {category}
                          </div>
                          <div className="flex flex-col gap-3 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                            {changes.map((parsed, idx) => {
                              const hasBeforeAfter = parsed.before !== null && parsed.after !== null;
                              const fieldName = parsed.field;

                              return (
                                <div key={`${category}-${idx}`} className="flex flex-col gap-1">
                                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                    {fieldName}
                                  </div>
                                  {hasBeforeAfter ? (
                                    <div className="flex flex-col gap-1">
                                      <div className="text-sm line-through text-red-500 dark:text-red-400 break-words">
                                        {parsed.before}
                                      </div>
                                      <div className="text-sm text-green-600 dark:text-green-400 break-words">
                                        {parsed.after}
                                      </div>
                                    </div>
                                  ) : parsed.before !== null ? (
                                    <div className="text-sm line-through text-red-500 dark:text-red-400 break-words">
                                      {parsed.before}
                                    </div>
                                  ) : parsed.after !== null ? (
                                    <div className="text-sm text-green-600 dark:text-green-400 break-words">
                                      {parsed.after}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground italic">
                                      Value changed (content not available)
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : null}

                {/* Category badges (up to 2) */}
                {log.category && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

