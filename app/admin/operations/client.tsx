"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2 } from "lucide-react";

interface AdminOperationsClientProps {
  onForceSync: () => Promise<{ success: boolean; message?: string; error?: string }>;
  onCleanupStuck: () => Promise<{ success: boolean; message?: string; cleaned?: number; error?: string }>;
}

export function AdminOperationsClient({ onForceSync, onCleanupStuck }: AdminOperationsClientProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [cleanupResult, setCleanupResult] = useState<{ success: boolean; message?: string; cleaned?: number; error?: string } | null>(null);

  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await onForceSync();
      setSyncResult(result);
      router.refresh();
    } catch (error) {
      console.error("Error forcing sync:", error);
      setSyncResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCleanupStuck = async () => {
    setIsCleaning(true);
    setCleanupResult(null);
    try {
      const result = await onCleanupStuck();
      setCleanupResult(result);
      router.refresh();
    } catch (error) {
      console.error("Error cleaning up stuck runs:", error);
      setCleanupResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleForceSync}
        disabled={isSyncing}
        variant="default"
        className="gap-2"
      >
        {isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Force Global Sync
          </>
        )}
      </Button>
      <Button
        onClick={handleCleanupStuck}
        disabled={isCleaning}
        variant="outline"
        className="gap-2"
      >
        {isCleaning ? (
          <>
            <Trash2 className="h-4 w-4 animate-spin" />
            Cleaning...
          </>
        ) : (
          <>
            <Trash2 className="h-4 w-4" />
            Cleanup Stuck Runs
          </>
        )}
      </Button>
      {syncResult && (
        <div className={`text-xs px-2 py-1 rounded ${
          syncResult.success
            ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300"
            : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300"
        }`}>
          {syncResult.success ? syncResult.message : syncResult.error}
        </div>
      )}
      {cleanupResult && (
        <div className={`text-xs px-2 py-1 rounded ${
          cleanupResult.success
            ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300"
            : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300"
        }`}>
          {cleanupResult.success ? cleanupResult.message : cleanupResult.error}
        </div>
      )}
    </div>
  );
}

