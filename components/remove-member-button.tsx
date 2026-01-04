"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { removeMember } from "@/app/actions";

interface RemoveMemberButtonProps {
  memberId: string;
  memberEmail: string;
}

export function RemoveMemberButton({ memberId, memberEmail }: RemoveMemberButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleRemove() {
    if (!confirm(`Are you sure you want to remove ${memberEmail} from the workspace?`)) {
      return;
    }

    setIsLoading(true);
    const result = await removeMember(memberId);

    if (result?.error) {
      alert(result.error);
      setIsLoading(false);
    } else {
      router.refresh();
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-destructive"
      title="Remove member"
      onClick={handleRemove}
      disabled={isLoading}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

