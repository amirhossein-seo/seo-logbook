"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updateWorkspaceName } from "@/app/actions";

interface WorkspaceSettingsFormProps {
  workspaceId: string;
  currentName: string;
}

export function WorkspaceSettingsForm({ workspaceId, currentName }: WorkspaceSettingsFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture form reference immediately before any async operations
    const form = e.currentTarget;
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData(form);
      const result = await updateWorkspaceName(workspaceId, formData);

      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
      } else {
        setIsLoading(false);
        setSuccess(true);
        form.reset();
        router.refresh();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (error) {
      console.error("Error updating workspace:", error);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace Settings</CardTitle>
        <CardDescription>
          Update your workspace name
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspaceName">
              Workspace Name
            </Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              type="text"
              placeholder="Enter workspace name"
              defaultValue={currentName}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Note: Other members will see this name when they join your workspace.
            </p>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-md">
              Workspace name updated successfully!
            </div>
          )}

          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

