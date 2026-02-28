"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toggleCategory, toggleAllCategories } from "@/actions/sources";

interface CategoryListProps {
  categories: {
    id: number;
    categoryId: string;
    categoryName: string;
    categoryType: string;
    isEnabled: boolean;
    _count: { channels: number };
  }[];
  sourceId: number;
  categoryType: string;
}

export function CategoryList({
  categories,
  sourceId,
  categoryType,
}: CategoryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const enabledCount = categories.filter((c) => c.isEnabled).length;
  const allEnabled = enabledCount === categories.length;
  const noneEnabled = enabledCount === 0;

  function handleToggle(id: number, current: boolean) {
    startTransition(async () => {
      await toggleCategory(id, !current);
      router.refresh();
    });
  }

  function handleToggleAll(enable: boolean) {
    startTransition(async () => {
      await toggleAllCategories(sourceId, categoryType, enable);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleToggleAll(true)}
          disabled={isPending || allEnabled}
        >
          Enable All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleToggleAll(false)}
          disabled={isPending || noneEnabled}
        >
          Disable All
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">
          {enabledCount} of {categories.length} enabled
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Provider ID</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead className="w-20">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">
                  {cat.categoryName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cat.categoryId}
                </TableCell>
                <TableCell>{cat._count.channels}</TableCell>
                <TableCell>
                  <Switch
                    checked={cat.isEnabled}
                    onCheckedChange={() =>
                      handleToggle(cat.id, cat.isEnabled)
                    }
                    disabled={isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
