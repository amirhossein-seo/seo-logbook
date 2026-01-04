"use client";

import { useState, useEffect } from "react";
import { getMonitoringStatus } from "@/app/actions";
import { MonitoringDrawer } from "./monitoring-drawer";
import { cn } from "@/lib/utils";

interface MonitoringStatusProps {
  urlId: string;
  projectId: string;
}

export function MonitoringStatus({ urlId, projectId }: MonitoringStatusProps) {
  const [isMonitored, setIsMonitored] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      setIsLoading(true);
      const status = await getMonitoringStatus(urlId);
      setIsMonitored(status.isMonitored);
      setLastChecked(status.lastChecked);
      setIsLoading(false);
    }

    fetchStatus();
  }, [urlId, isDrawerOpen]); // Refetch when drawer closes

  if (isLoading) {
    return (
      <div className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse" />
    );
  }

  return (
    <>
      <button
        onClick={() => setIsDrawerOpen(true)}
        className={cn(
          "h-2 w-2 rounded-full transition-all hover:scale-125 cursor-pointer",
          isMonitored
            ? "bg-green-500 animate-pulse shadow-green-500/50 shadow-sm"
            : "bg-muted-foreground/40"
        )}
        title={isMonitored ? "Monitoring active" : "Monitoring inactive"}
        aria-label={isMonitored ? "Monitoring active" : "Monitoring inactive"}
      />
      <MonitoringDrawer
        urlId={urlId}
        projectId={projectId}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        initialIsMonitored={isMonitored}
        initialLastChecked={lastChecked}
        onStatusChange={(monitored, checked) => {
          setIsMonitored(monitored);
          setLastChecked(checked);
        }}
      />
    </>
  );
}

