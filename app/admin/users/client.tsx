"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit, Users } from "lucide-react";

interface User {
  id: string;
  email: string;
  joinedDate: string | null;
  globalRole: string;
  fullName: string | null;
  workspaceCount: number;
  maxUrls: number | null;
  maxMonitors: number | null;
}

interface AdminUsersClientProps {
  initialUsers: User[];
  onUpdateQuotas: (userId: string, maxUrls: number | null, maxMonitors: number | null) => Promise<{ success: boolean; error?: string }>;
}

export function AdminUsersClient({ initialUsers, onUpdateQuotas }: AdminUsersClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [maxUrls, setMaxUrls] = useState<string>("");
  const [maxMonitors, setMaxMonitors] = useState<string>("");

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setMaxUrls(user.maxUrls?.toString() || "");
    setMaxMonitors(user.maxMonitors?.toString() || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingUser) return;

    setIsLoading(true);
    try {
      const result = await onUpdateQuotas(
        editingUser.id,
        maxUrls === "" ? null : parseInt(maxUrls, 10),
        maxMonitors === "" ? null : parseInt(maxMonitors, 10)
      );

      if (result.success) {
        setDialogOpen(false);
        setEditingUser(null);
        router.refresh();
      } else {
        alert(result.error || "Failed to update quotas");
      }
    } catch (error) {
      console.error("Error updating quotas:", error);
      alert("An error occurred while updating quotas");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getRoleBadge = (role: string) => {
    if (role === "super_admin") {
      return <Badge variant="destructive">Super Admin</Badge>;
    }
    return <Badge variant="secondary">User</Badge>;
  };

  return (
    <>
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Platform Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p>No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Joined Date
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Global Role
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Workspaces
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Max URLs
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Max Monitors
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {user.email}
                          </span>
                          {user.fullName && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {user.fullName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                        {formatDate(user.joinedDate)}
                      </td>
                      <td className="py-3 px-4">
                        {getRoleBadge(user.globalRole)}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                        {user.workspaceCount}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                        {user.maxUrls !== null ? user.maxUrls : "Unlimited"}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                        {user.maxMonitors !== null ? user.maxMonitors : "Unlimited"}
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(user)}
                          className="gap-2"
                        >
                          <Edit className="h-3 w-3" />
                          Edit Limits
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Quota Limits</DialogTitle>
            <DialogDescription>
              Update the maximum URLs and monitors for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="max-urls">Max URLs</Label>
              <Input
                id="max-urls"
                type="number"
                placeholder="Unlimited (leave empty)"
                value={maxUrls}
                onChange={(e) => setMaxUrls(e.target.value)}
                min="0"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leave empty for unlimited
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max-monitors">Max Monitors</Label>
              <Input
                id="max-monitors"
                type="number"
                placeholder="Unlimited (leave empty)"
                value={maxMonitors}
                onChange={(e) => setMaxMonitors(e.target.value)}
                min="0"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leave empty for unlimited
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

