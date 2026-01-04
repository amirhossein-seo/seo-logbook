"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toggleUrlMonitoring, runManualCheck, getProjectMonitor, updateMonitorFrequency } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MonitoringDrawerProps {
  urlId: string;
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialIsMonitored: boolean;
  initialLastChecked: string | null;
  onStatusChange: (isMonitored: boolean, lastChecked: string | null) => void;
}

export function MonitoringDrawer({
  urlId,
  projectId,
  isOpen,
  onOpenChange,
  initialIsMonitored,
  initialLastChecked,
  onStatusChange,
}: MonitoringDrawerProps) {
  const router = useRouter();
  const [isMonitored, setIsMonitored] = useState(initialIsMonitored);
  const [lastChecked, setLastChecked] = useState<string | null>(
    initialLastChecked
  );
  const [isToggling, setIsToggling] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string>("Daily");
  const [isLoadingFrequency, setIsLoadingFrequency] = useState(true);
  const [isUpdatingFrequency, setIsUpdatingFrequency] = useState(false);

  // Load monitor frequency on mount
  useEffect(() => {
    async function loadFrequency() {
      setIsLoadingFrequency(true);
      const monitor = await getProjectMonitor(projectId);
      if (monitor?.frequency) {
        setFrequency(monitor.frequency);
      }
      setIsLoadingFrequency(false);
    }
    if (isOpen) {
      loadFrequency();
    }
  }, [projectId, isOpen]);

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    setError(null);
    setCheckResult(null);

    const result = await toggleUrlMonitoring(urlId, checked);

    if (result?.error) {
      setError(result.error);
      setIsToggling(false);
    } else {
      setIsMonitored(checked);
      onStatusChange(checked, lastChecked);
      setIsToggling(false);
      router.refresh();
    }
  };

  const handleCheckNow = async () => {
    setIsChecking(true);
    setError(null);
    setCheckResult(null);

    const result = await runManualCheck(urlId);

    if (result?.error) {
      setError(result.error);
      setIsChecking(false);
    } else {
      const now = new Date().toISOString();
      setLastChecked(now);
      onStatusChange(isMonitored, now);
      setCheckResult(
        result.changed
          ? "Changes detected! A new log entry has been created."
          : "No changes detected. Content is the same."
      );
      setIsChecking(false);
      router.refresh();
    }
  };

  const handleFrequencyChange = async (newFrequency: string) => {
    setIsUpdatingFrequency(true);
    setError(null);

    const monitor = await getProjectMonitor(projectId);
    if (!monitor) {
      setError("Monitor not found");
      setIsUpdatingFrequency(false);
      return;
    }

    const result = await updateMonitorFrequency(monitor.id, newFrequency);
    
    if (result?.error) {
      setError(result.error);
    } else {
      setFrequency(newFrequency);
      router.refresh();
    }
    
    setIsUpdatingFrequency(false);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>URL Monitoring</DialogTitle>
          <DialogDescription>
            Monitor this URL for changes to title, meta description, H1, and
            other SEO elements.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Toggle Switch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="monitoring-toggle" className="text-base">
                Enable Monitoring
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically check this URL for changes
              </p>
            </div>
            <Switch
              id="monitoring-toggle"
              checked={isMonitored}
              onCheckedChange={handleToggle}
              disabled={isToggling}
            />
          </div>

          {/* Monitoring Frequency */}
          {isMonitored && (
            <div className="space-y-2">
              <Label htmlFor="frequency-select" className="text-sm font-medium">
                Monitoring Frequency
              </Label>
              <Select
                value={frequency}
                onValueChange={handleFrequencyChange}
                disabled={isLoadingFrequency || isUpdatingFrequency}
              >
                <SelectTrigger id="frequency-select">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often to automatically check this URL for changes
              </p>
            </div>
          )}

          {/* Last Checked */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Last Checked</Label>
            <p className="text-sm text-muted-foreground">
              {formatDate(lastChecked)}
            </p>
          </div>

          {/* Check Now Button */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCheckNow}
              disabled={isChecking || !isMonitored}
              variant="outline"
              className="w-full"
            >
              {isChecking ? "Checking..." : "Check Now"}
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          {/* Check Result */}
          {checkResult && (
            <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 p-2 rounded">
              {checkResult}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

