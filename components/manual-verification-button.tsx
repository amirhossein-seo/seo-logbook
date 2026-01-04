"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Play, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { processAutomatedChecks } from "@/app/actions";
import { useRouter } from "next/navigation";

interface ManualVerificationButtonProps {
  projectId: string;
}

export function ManualVerificationButton({ projectId }: ManualVerificationButtonProps) {
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
    processed?: number;
    changesDetected?: number;
    detailedChanges?: Array<{ url: string; changes: Array<{ field: string; old: string | null; new: string | null; category: string }> }>;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse" />
      </div>
    );
  }

  async function handleManualVerification() {
    setIsLoading(true);
    setResult(null);
    setDialogOpen(false);

    try {
      // Pass isManual: true to trigger credit check and deduction
      const result = await processAutomatedChecks(true);
      setResult(result);
      setDialogOpen(true);
      
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
      setDialogOpen(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Button
        onClick={handleManualVerification}
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
            Verify Now (1 Credit)
          </>
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              Verification Results
            </DialogTitle>
            <DialogDescription>
              {result?.success 
                ? `Completed verification for ${result.processed || 0} URL${(result.processed || 0) !== 1 ? 's' : ''}`
                : "An error occurred during verification"}
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              {result.error ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{result.error}</p>
                </div>
              ) : result.success ? (
                <>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      ✅ {result.processed || 0} URL{(result.processed || 0) !== 1 ? 's' : ''} Processed Successfully
                    </p>
                  </div>

                  {result.changesDetected !== undefined && result.changesDetected > 0 && result.detailedChanges ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                          ⚠️ {result.changesDetected} Change{result.changesDetected !== 1 ? 's' : ''} Detected
                        </p>
                      </div>
                      <div className="space-y-3">
                        {result.detailedChanges.map((item, idx) => (
                          <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                            <div className="font-medium text-sm text-slate-900 dark:text-slate-100 mb-2 break-all">
                              {item.url}
                            </div>
                            <div className="space-y-1 pl-2 border-l-2 border-yellow-400 dark:border-yellow-600">
                              {item.changes.map((change, changeIdx) => (
                                <div key={changeIdx} className="text-xs text-slate-600 dark:text-slate-400">
                                  • <span className="font-medium">{change.field}:</span> {change.old ? `"${change.old}"` : '(empty)'} → {change.new ? `"${change.new}"` : '(empty)'}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        ✓ No changes detected
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

