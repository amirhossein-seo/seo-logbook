"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Use dynamic import to fix Module factory error
const NewLogDialog = dynamic(
  () => import("@/components/new-log-dialog").then((mod) => ({ default: mod.NewLogDialog })),
  { ssr: false }
);

interface LogsHeaderProps {
  projectId: string;
}

export function LogsHeader({ projectId }: LogsHeaderProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Mount Guard: Return null during SSR to prevent hydration mismatches
  if (!isMounted) {
    return null;
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track SEO activities and updates for this project
        </p>
      </div>
      <NewLogDialog projectId={projectId} />
    </div>
  );
}

