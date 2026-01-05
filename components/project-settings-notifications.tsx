"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProjectEmailAlerts, getProjectMembers, updateMemberAlertPreference } from "@/app/actions";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Bell } from "lucide-react";

interface NotificationSettingsProps {
  projectId: string;
  emailAlertsEnabled: boolean;
}

interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  receiveAlerts: boolean;
  sourceTable: "project_memberships" | "project_members" | "workspace_members";
  avatarUrl?: string | null;
}

export function NotificationSettings({ projectId, emailAlertsEnabled: initialEnabled }: NotificationSettingsProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [updatingMembers, setUpdatingMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchMembers() {
      setLoadingMembers(true);
      try {
        const projectMembers = await getProjectMembers(projectId);
        // Type assertion: getProjectMembers returns sourceTable as string, but we know it's one of the valid values
        setMembers(projectMembers as ProjectMember[]);
      } catch (err) {
        console.error("Error fetching project members:", err);
      } finally {
        setLoadingMembers(false);
      }
    }
    fetchMembers();
  }, [projectId]);

  async function handleToggle(value: boolean) {
    setEnabled(value);
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateProjectEmailAlerts(projectId, value);
      
      if (result?.error) {
        setError(result.error);
        setEnabled(!value); // Revert on error
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings");
      setEnabled(!value); // Revert on error
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMemberToggle(
    uniqueId: string,
    currentValue: boolean,
    sourceTable: "project_memberships" | "project_members" | "workspace_members",
    userId: string
  ) {
    setUpdatingMembers((prev) => new Set(prev).add(uniqueId));
    
    try {
      const result = await updateMemberAlertPreference(
        uniqueId,
        sourceTable,
        projectId,
        userId,
        !currentValue
      );
      
      if (result?.error) {
        setError(result.error);
      } else {
        // Update local state
        setMembers((prev) =>
          prev.map((m) =>
            m.id === uniqueId ? { ...m, receiveAlerts: !currentValue } : m
          )
        );
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member preference");
    } finally {
      setUpdatingMembers((prev) => {
        const next = new Set(prev);
        next.delete(uniqueId);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Email Alerts
          </CardTitle>
          <CardDescription>
            Receive email notifications when monitoring detects changes in your project URLs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-alerts" className="text-base">
                Enable Email Alerts for Monitoring
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified via email when SEO changes are detected on monitored URLs
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                id="email-alerts"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              Settings updated successfully
            </div>
          )}
        </CardContent>
      </Card>

      {enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              Choose which project members should receive email alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading members...</span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No project members found
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email} • {member.role}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`member-${member.id}`} className="text-sm text-muted-foreground">
                        Receive Email Alerts
                      </Label>
                      {updatingMembers.has(member.id) && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      <Checkbox
                        id={`member-${member.id}`}
                        checked={member.receiveAlerts}
                        onCheckedChange={() => handleMemberToggle(member.id, member.receiveAlerts, member.sourceTable, member.userId)}
                        disabled={updatingMembers.has(member.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

