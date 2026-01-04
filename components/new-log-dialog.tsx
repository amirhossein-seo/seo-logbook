"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLog } from "@/app/actions";
import { Plus } from "lucide-react";

interface NewLogDialogProps {
  projectId: string;
}

const CATEGORY_OPTIONS = [
  "Content",
  "Technical",
  "Internal Link",
  "External Link",
  "Schema",
  "Other",
] as const;

export function NewLogDialog({ projectId }: NewLogDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture form reference immediately before any async operations
    const form = e.currentTarget;
    setIsLoading(true);
    setError(null);

    // Validate category is selected
    if (!category) {
      setError("Please select a category");
      setIsLoading(false);
      return;
    }

    try {
      const formData = new FormData(form);
      formData.set("category", category);

      const result = await createLog(formData);

      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
      } else {
        setIsLoading(false);
        setOpen(false);
        setError(null);
        setCategory("");
        // Reset form at the end of try block, before any navigation
        form.reset();
        router.refresh();
      }
    } catch (error) {
      console.error("Error creating log:", error);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when dialog closes
      setCategory("");
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New Log
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Log</DialogTitle>
            <DialogDescription>
              Record an SEO activity or update for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <input type="hidden" name="projectId" value={projectId} />
            
            <div className="grid gap-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g., Updated meta descriptions"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={category}
                onValueChange={setCategory}
                required
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe what was done..."
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="urlText">URLs</Label>
              <Textarea
                id="urlText"
                name="urlText"
                placeholder="Paste one or more URLs here (one per line or separated by spaces)"
                rows={6}
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Paste one or more URLs here. You can separate them by newlines or spaces.
              </p>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

