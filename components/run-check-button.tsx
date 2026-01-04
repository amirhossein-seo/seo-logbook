"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { processAutomatedChecks } from "@/app/actions";
import { useRouter } from "next/navigation";

interface RunCheckButtonProps {
  projectId: string;
}

export function RunCheckButton({ projectId }: RunCheckButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  async function handleRunCheck() {
    setIsLoading(true);
    setResult(null);

    try {
      const result = await processAutomatedChecks();
      setResult(result);
      
      // Refresh the page to show new runs
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

  return (
    <div className="flex items-center gap-2">
      {result && (
        <div className={`flex items-center gap-2 text-sm ${
          result.success 
            ? "text-green-600 dark:text-green-400" 
            : "text-red-600 dark:text-red-400"
        }`}>
          {result.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span className="max-w-xs truncate">
            {result.message || result.error}
          </span>
        </div>
      )}
      <Button
        onClick={handleRunCheck}
        disabled={isLoading}
        className="gap-2"
      >
        {isLoading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Run Check Now
          </>
        )}
      </Button>
    </div>
  );
}

