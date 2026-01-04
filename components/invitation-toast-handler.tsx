"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { claimPendingInvitations } from "@/app/actions";
import { CheckCircle2 } from "lucide-react";

export function InvitationToastHandler() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    async function checkAndClaimInvitations() {
      // Only check once per mount
      if (hasChecked) return;
      
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user || !user.email) {
          setHasChecked(true);
          return;
        }

        // Claim pending invitations
        const result = await claimPendingInvitations(user.email, user.id);

        if (result.claimedProjects.length > 0) {
          // Create toast notifications for each claimed project
          const newToasts = result.claimedProjects.map((project, index) => ({
            id: `toast-${project.id}-${Date.now()}-${index}`,
            message: `Welcome! You have been automatically added to ${project.name}.`,
          }));

          setToasts(newToasts);

          // Auto-remove toasts after 5 seconds
          newToasts.forEach((toast) => {
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }, 5000);
          });
        }
      } catch (error) {
        console.error("Error claiming invitations:", error);
      } finally {
        setHasChecked(true);
      }
    }

    checkAndClaimInvitations();
  }, [hasChecked]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[320px] max-w-md animate-in slide-in-from-top-5"
        >
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-sm text-slate-900 dark:text-slate-100 flex-1">
            {toast.message}
          </p>
        </div>
      ))}
    </div>
  );
}

