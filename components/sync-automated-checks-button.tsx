"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { processAutomatedChecks } from "@/app/actions";
import { useRouter } from "next/navigation";

export function SyncAutomatedChecksButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
    processed?: number;
    changesDetected?: number;
    monitorsProcessed?: number;
    nextRunTime?: string | null;
  } | null>(null);
  const router = useRouter();

  async function handleSync() {
    setIsLoading(true);
    setResult(null);

    try {
      const result = await processAutomatedChecks();
      setResult(result);
      
      // Refresh the page to show new logs
      if (result.success) {
        setTimeout(() => {
          router.refresh();
        }, 1000);
      }
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-hide result message after 8 seconds
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        setResult(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const formatMessage = () => {
    if (!result) return null;
    
    if (result.error) {
      return result.error;
    }

    if (result.success) {
      if (result.processed === 0 && result.monitorsProcessed === 0) {
        // No monitors due
        return (
          <div className="flex flex-col gap-1">
            <span>{result.message}</span>
            {result.nextRunTime && (
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3 w-3" />
                <span>Next check: {new Date(result.nextRunTime).toLocaleString()}</span>
              </div>
            )}
          </div>
        );
      }
      
      // Monitors were processed
      return (
        <div className="flex flex-col gap-1">
          <span>
            Checked {result.monitorsProcessed || 0} monitor(s), processed {result.processed || 0} URL(s)
          </span>
          {result.changesDetected !== undefined && result.changesDetected > 0 && (
            <span className="text-green-600 dark:text-green-400 font-medium">
              {result.changesDetected} change(s) detected
            </span>
          )}
          {result.nextRunTime && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              <span>Next check: {new Date(result.nextRunTime).toLocaleString()}</span>
            </div>
          )}
        </div>
      );
    }

    return result.message || "Unknown result";
  };

  return (
    <div className="flex items-center gap-2">
      {result && (
        <div className={`flex items-center gap-2 text-sm max-w-md ${
          result.success 
            ? "text-slate-700 dark:text-slate-300" 
            : "text-red-600 dark:text-red-400"
        }`}>
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {formatMessage()}
          </div>
        </div>
      )}
      <Button
        onClick={handleSync}
        disabled={isLoading}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        Sync Automated Checks
      </Button>
    </div>
  );
}

