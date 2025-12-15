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
} from "lucide-react";

interface Log {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  created_at: string;
  created_by: string;
  urls?: Array<{
    id: string;
    url: string;
    project_id?: string;
  }>;
}

interface LogFeedProps {
  logs: Log[];
  projectId?: string;
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

export function LogFeed({ logs, projectId }: LogFeedProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No logs yet. Create your first log to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {logs.map((log) => (
        <Card key={log.id} className="border-border">
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
                    <h3 className="text-base font-semibold text-foreground mb-1">
                      {log.title}
                    </h3>
                    {/* Meta row: user + date */}
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
                      <span>by {log.created_by || "Unknown user"}</span>
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
                      <p className="text-sm text-muted-foreground mb-2">
                        {log.description}
                      </p>
                    )}
                    {/* Category badge with filter link */}
                    {log.category && (
                      <div className="mt-1">
                        {projectId ? (
                          <Link
                            href={`/projects/${projectId}/logs?category=${encodeURIComponent(
                              log.category,
                            )}`}
                          >
                            <Badge
                              variant="secondary"
                              className="text-xs hover:opacity-80 transition-opacity"
                            >
                              {log.category}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {log.category}
                          </Badge>
                        )}
                      </div>
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
      ))}
    </div>
  );
}

