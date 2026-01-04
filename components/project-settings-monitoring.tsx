"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMonitorFrequency, getProjectMonitor } from "@/app/actions";
import { useRouter } from "next/navigation";
import { Loader2, Activity } from "lucide-react";

interface MonitoringSettingsProps {
  projectId: string;
  monitorFrequency: string;
}

export function MonitoringSettings({ projectId, monitorFrequency: initialFrequency }: MonitoringSettingsProps) {
  const router = useRouter();
  const [frequency, setFrequency] = useState(initialFrequency);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleFrequencyChange(newFrequency: string) {
    setFrequency(newFrequency);
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const monitor = await getProjectMonitor(projectId);
      if (!monitor) {
        setError("Monitor not found");
        setFrequency(initialFrequency); // Revert
        setIsLoading(false);
        return;
      }

      const result = await updateMonitorFrequency(monitor.id, newFrequency);
      
      if (result?.error) {
        setError(result.error);
        setFrequency(initialFrequency); // Revert on error
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update monitoring frequency");
      setFrequency(initialFrequency); // Revert on error
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Monitoring Settings
        </CardTitle>
        <CardDescription>
          Configure how often URLs in this project are automatically checked for changes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="monitoring-frequency">Monitoring Frequency</Label>
          <Select
            value={frequency}
            onValueChange={handleFrequencyChange}
            disabled={isLoading}
          >
            <SelectTrigger id="monitoring-frequency">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Weekly">Weekly</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            How often to automatically check all monitored URLs in this project for changes
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Updating frequency...</span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            Monitoring frequency updated successfully
          </div>
        )}
      </CardContent>
    </Card>
  );
}

