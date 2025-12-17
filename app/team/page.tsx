export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamMembers, getUserWorkspace, getPendingInvitations } from "@/app/actions";
import { InviteMemberDialog } from "@/components/invite-member-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Trash2, Mail } from "lucide-react";
import { RevokeInvitationButton } from "@/components/revoke-invitation-button";

async function PendingInvitationsList({ workspaceId }: { workspaceId: string }) {
  const invitations = await getPendingInvitations(workspaceId);

  if (invitations.length === 0) {
    return null;
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      case "member":
      case "viewer":
      default:
        return "outline";
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "admin":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
      case "member":
      case "viewer":
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Pending Invitations</h2>
      {invitations.map((invitation: any) => (
        <Card key={invitation.id} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Mail Icon */}
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>

                {/* Email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {invitation.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invited {new Date(invitation.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>

                {/* Role Badge */}
                <div className="flex-shrink-0">
                  <Badge
                    variant={getRoleBadgeVariant(invitation.role)}
                    className={`text-xs capitalize ${getRoleBadgeClass(invitation.role)}`}
                  >
                    {invitation.role}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 ml-4">
                <RevokeInvitationButton invitationId={invitation.id} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function TeamMembersList({ workspaceId, currentUserEmail }: { workspaceId: string; currentUserEmail?: string | null }) {
  const members = await getTeamMembers(workspaceId);

  if (members.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No team members yet. Invite your first member to get started.</p>
      </div>
    );
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default"; // Blue
      case "admin":
        return "secondary"; // Can be styled with custom classes
      case "member":
        return "outline"; // Gray
      case "viewer":
        return "outline"; // Gray
      default:
        return "outline";
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "admin":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
      case "member":
      case "viewer":
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      {members.map((member: { member_id: string; email: string; role: string; joinedAt: string; userId: string }) => (
        <Card key={member.member_id} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* User Icon */}
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>

                {/* Email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {member.email}
                    {currentUserEmail && member.email === currentUserEmail && (
                      <span className="text-muted-foreground ml-1">(You)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Joined {new Date(member.joinedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>

                {/* Role Badge */}
                <div className="flex-shrink-0">
                  <Badge
                    variant={getRoleBadgeVariant(member.role)}
                    className={`text-xs capitalize ${getRoleBadgeClass(member.role)}`}
                  >
                    {member.role}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 ml-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get user's workspace
  const workspaceId = await getUserWorkspace(user.id);
  if (!workspaceId) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your workspace team
          </p>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">You must belong to a workspace to view team members.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your workspace team
          </p>
        </div>
        <InviteMemberDialog />
      </div>

      <PendingInvitationsList workspaceId={workspaceId} />

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Team Members</h2>
        <TeamMembersList workspaceId={workspaceId} currentUserEmail={user.email} />
      </div>
    </div>
  );
}

