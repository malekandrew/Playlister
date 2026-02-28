"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteSource,
  toggleSource,
  fetchCategories,
} from "@/actions/sources";
import Link from "next/link";

interface SourceActionsProps {
  source: {
    id: number;
    name: string;
    isEnabled: boolean;
  };
}

export function SourceActions({ source }: SourceActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDelete, setShowDelete] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  function handleToggle() {
    startTransition(async () => {
      await toggleSource(source.id, !source.isEnabled);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteSource(source.id);
      setShowDelete(false);
      router.refresh();
    });
  }

  function handleFetchCategories() {
    startTransition(async () => {
      const result = await fetchCategories(source.id);
      if (result.success && "count" in result) {
        setFetchResult(
          `Fetched ${result.count} categories${result.removed ? ` (${result.removed} removed)` : ""}`
        );
      } else if (!result.success && "error" in result) {
        setFetchResult(`Error: ${result.error}`);
      }
      router.refresh();
      setTimeout(() => setFetchResult(null), 5000);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            {isPending ? "..." : "⋯"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/sources/${source.id}`}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/sources/${source.id}/categories`}>Categories</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFetchCategories}>
            Fetch Categories
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggle}>
            {source.isEnabled ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDelete(true)}
            className="text-destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {fetchResult && (
        <span className="text-xs text-muted-foreground ml-2">
          {fetchResult}
        </span>
      )}

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{source.name}&quot;? This
              will also remove all associated categories and channels. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
