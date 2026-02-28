"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchCategories } from "@/actions/sources";

interface FetchCategoriesButtonProps {
  sourceId: number;
}

export function FetchCategoriesButton({
  sourceId,
}: FetchCategoriesButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleFetch() {
    startTransition(async () => {
      const res = await fetchCategories(sourceId);
      if (res.success && "count" in res) {
        setResult(
          `Fetched ${res.count} categories${res.removed ? ` (${res.removed} removed)` : ""}`
        );
      } else if (!res.success && "error" in res) {
        setResult(`Error: ${res.error}`);
      }
      router.refresh();
      setTimeout(() => setResult(null), 5000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleFetch} disabled={isPending}>
        {isPending ? "Fetching..." : "Fetch Categories"}
      </Button>
      {result && (
        <span className="text-sm text-muted-foreground">{result}</span>
      )}
    </div>
  );
}
