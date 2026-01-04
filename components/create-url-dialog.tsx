"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createUrl, bulkCreateUrls, toggleUrlMonitoring, updateMonitorFrequency, getProjectMonitor } from "@/app/actions";
import { Plus } from "lucide-react";

interface CreateUrlDialogProps {
  projectId: string;
}

export function CreateUrlDialog({ projectId }: CreateUrlDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startMonitoring, setStartMonitoring] = useState(false);
  const [frequency, setFrequency] = useState<string>("Weekly");
  const [runImmediately, setRunImmediately] = useState(true);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkUrls, setBulkUrls] = useState("");
  const [detectedUrlCount, setDetectedUrlCount] = useState(0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // Store form reference before any await
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "single") {
        const formData = new FormData(form);
        const urlString = formData.get("url") as string;

        if (!urlString || !urlString.trim()) {
          setError("URL is required");
          setIsLoading(false);
          return;
        }

        // Validate URL format
        try {
          new URL(urlString.trim());
        } catch {
          setError("Invalid URL format");
          setIsLoading(false);
          return;
        }

        // Create the URL
        const createResult = await createUrl(projectId, urlString.trim());

        if (createResult?.error) {
          setError(createResult.error);
          setIsLoading(false);
          return;
        }

        const newUrlId = createResult.urlId!;

        // If monitoring switch is ON, enable monitoring with frequency
        if (startMonitoring) {
          const monitorResult = await toggleUrlMonitoring(newUrlId, true);
          if (monitorResult?.error) {
            console.error("Error enabling monitoring:", monitorResult.error);
            // Don't fail the whole operation, just log the error
            // The URL was created successfully
          } else {
            // Update monitor frequency if different from default
            const monitor = await getProjectMonitor(projectId);
            if (monitor && frequency !== monitor.frequency) {
              await updateMonitorFrequency(monitor.id, frequency);
            }

            // If run immediately is checked, trigger a baseline check (no change log)
            if (runImmediately) {
              // Use Server Action instead of direct import
              const { runInitialBaselineCheck } = await import("@/app/actions");
              await runInitialBaselineCheck(newUrlId, projectId);
            }
          }
        }
      } else {
        // Bulk mode
        if (!bulkUrls || !bulkUrls.trim()) {
          setError("Please enter at least one URL");
          setIsLoading(false);
          return;
        }

        // Sanitize: Parse URLs (one per line), trim whitespace, filter empty lines
        const urlLines = bulkUrls
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (urlLines.length === 0) {
          setError("Please enter at least one valid URL");
          setIsLoading(false);
          return;
        }

        // Validation: Ensure each line starts with http:// or https://
        const invalidUrls: string[] = [];
        const validUrlLines = urlLines.filter((url) => {
          const isValid = url.startsWith("http://") || url.startsWith("https://");
          if (!isValid) {
            invalidUrls.push(url);
          }
          return isValid;
        });

        if (invalidUrls.length > 0) {
          setError(
            `Invalid URLs detected. All URLs must start with http:// or https://. Invalid: ${invalidUrls.slice(0, 3).join(", ")}${invalidUrls.length > 3 ? "..." : ""}`
          );
          setIsLoading(false);
          return;
        }

        if (validUrlLines.length === 0) {
          setError("No valid URLs found. All URLs must start with http:// or https://");
          setIsLoading(false);
          return;
        }

        // Bulk create URLs
        const bulkResult = await bulkCreateUrls(
          projectId,
          validUrlLines,
          startMonitoring,
          frequency,
          runImmediately
        );

        if (bulkResult?.error) {
          setError(bulkResult.error);
          setIsLoading(false);
          return;
        }

        // Show success message with stats
        if (bulkResult.success) {
          const message = bulkResult.message || 
            `Created ${bulkResult.created} URL(s)${bulkResult.skipped > 0 ? `, skipped ${bulkResult.skipped} existing` : ""}`;
          setError(null);
          // We'll show the success in the message
        }
      }

      setIsLoading(false);
      setOpen(false);
      setError(null);
      setStartMonitoring(false);
      setBulkUrls("");
      setDetectedUrlCount(0);
      router.refresh();
      // Reset form
      form.reset();
    } catch (err) {
      console.error("Error in handleSubmit:", err);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when dialog closes
      setStartMonitoring(false);
      setFrequency("Weekly");
      setRunImmediately(true);
      setError(null);
      setMode("single");
      setBulkUrls("");
      setDetectedUrlCount(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New URL
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add URL</DialogTitle>
            <DialogDescription>
              Add a new URL or bulk import multiple URLs to track in this project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single URL</TabsTrigger>
                <TabsTrigger value="bulk">Bulk Add</TabsTrigger>
              </TabsList>
              
              <TabsContent value="single" className="space-y-4 mt-4">
                <div className="grid gap-2">
                  <Label htmlFor="url">
                    URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="url"
                    name="url"
                    type="url"
                    placeholder="https://example.com/page"
                    required={mode === "single"}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the full URL you want to track
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="bulk" className="space-y-4 mt-4">
                <div className="grid gap-2">
                  <Label htmlFor="bulk-urls">
                    URLs (one per line) <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="bulk-urls"
                    value={bulkUrls}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBulkUrls(value);
                      
                      // Count detected URLs (trim, filter empty, check for http/https)
                      const lines = value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0 && (line.startsWith("http://") || line.startsWith("https://")));
                      setDetectedUrlCount(lines.length);
                    }}
                    placeholder={`https://example.com/page1
https://example.com/page2
https://example.com/page3`}
                    rows={8}
                    className="font-mono text-sm whitespace-pre-line"
                    disabled={isLoading}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-xs text-muted-foreground flex-1">
                      Paste multiple URLs, one per line. All URLs must start with http:// or https://
                    </p>
                    {detectedUrlCount > 0 && (
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap flex-shrink-0">
                        {detectedUrlCount} URL{detectedUrlCount !== 1 ? 's' : ''} detected
                      </span>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="monitoring-toggle" className="text-base">
                    Enable Monitoring
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically track Title, Meta, and H1 changes.
                  </p>
                </div>
                <Switch
                  id="monitoring-toggle"
                  checked={startMonitoring}
                  onCheckedChange={setStartMonitoring}
                  disabled={isLoading}
                />
              </div>

              {/* Monitoring Settings - shown when monitoring is enabled */}
              {startMonitoring && (
                <div className="pl-4 border-l-2 border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="frequency-select" className="text-sm font-medium">
                      Frequency
                    </Label>
                    <Select
                      value={frequency}
                      onValueChange={setFrequency}
                      disabled={isLoading}
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

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="run-immediately"
                      checked={runImmediately}
                      onCheckedChange={(checked) => setRunImmediately(checked === true)}
                      disabled={isLoading}
                    />
                    <Label
                      htmlFor="run-immediately"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Run Baseline Scan
                    </Label>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create URL"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

