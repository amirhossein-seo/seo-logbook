"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { revokeInvitation } from "@/app/actions";
import { Trash2 } from "lucide-react";

interface RevokeInvitationButtonProps {
  invitationId: string;
}

export function RevokeInvitationButton({ invitationId }: RevokeInvitationButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleRevoke() {
    if (!confirm("Are you sure you want to revoke this invitation?")) {
      return;
    }

    setIsLoading(true);
    const result = await revokeInvitation(invitationId);

    if (result?.error) {
      alert(result.error);
      setIsLoading(false);
    } else {
      setIsLoading(false);
      router.refresh();
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-destructive"
      onClick={handleRevoke}
      disabled={isLoading}
      title="Revoke invitation"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
