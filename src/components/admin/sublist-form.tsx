"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createSublist,
  updateSublist,
  getCategoriesForSource,
} from "@/actions/sublists";

interface SourceOption {
  id: number;
  name: string;
}

interface CategoryItem {
  id: number;
  categoryId: string;
  categoryName: string;
  categoryType: string;
  _count: { channels: number };
}

interface SublistFormProps {
  sublist?: {
    id: number;
    name: string;
    sourcePlaylistId: number;
    apiKey: string;
    xtreamUsername: string;
    xtreamPassword: string;
    isEnabled: boolean;
    categories: {
      categoryId: number;
    }[];
  };
  sources: SourceOption[];
  initialCategories?: CategoryItem[];
}

export function SublistForm({
  sublist,
  sources,
  initialCategories,
}: SublistFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!sublist;

  const [name, setName] = useState(sublist?.name || "");
  const [sourcePlaylistId, setSourcePlaylistId] = useState<number | null>(
    sublist?.sourcePlaylistId ?? null
  );
  const [xtreamUsername, setXtreamUsername] = useState(
    sublist?.xtreamUsername || ""
  );
  const [xtreamPassword, setXtreamPassword] = useState(
    sublist?.xtreamPassword || ""
  );
  const [isEnabled, setIsEnabled] = useState(sublist?.isEnabled ?? true);
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(
    new Set(sublist?.categories.map((c) => c.categoryId) || [])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState<CategoryItem[]>(
    initialCategories || []
  );
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Fetch categories when source changes
  useEffect(() => {
    if (!sourcePlaylistId) {
      setCategories([]);
      return;
    }
    // Skip fetch if we already have initial categories for this source (editing)
    if (
      isEditing &&
      initialCategories &&
      initialCategories.length > 0 &&
      sourcePlaylistId === sublist?.sourcePlaylistId
    ) {
      return;
    }

    setLoadingCategories(true);
    setSelectedCategories(new Set());
    getCategoriesForSource(sourcePlaylistId)
      .then((cats) => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setLoadingCategories(false));
  }, [sourcePlaylistId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCategory(id: number) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      for (const c of filteredCategories) next.add(c.id);
      return next;
    });
  }

  function deselectAll() {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      for (const c of filteredCategories) next.delete(c.id);
      return next;
    });
  }

  function selectAllInTab(cats: CategoryItem[]) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const filtered = cats.filter(
        (c) =>
          !searchQuery ||
          c.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      for (const c of filtered) next.add(c.id);
      return next;
    });
  }

  function deselectAllInTab(cats: CategoryItem[]) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const filtered = cats.filter(
        (c) =>
          !searchQuery ||
          c.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      for (const c of filtered) next.delete(c.id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourcePlaylistId) {
      setError("Please select a source playlist");
      return;
    }

    startTransition(async () => {
      try {
        const data = {
          name,
          xtreamUsername: xtreamUsername || undefined,
          xtreamPassword: xtreamPassword || undefined,
          isEnabled,
          categoryIds: Array.from(selectedCategories),
        };

        if (isEditing) {
          await updateSublist(sublist.id, data);
        } else {
          await createSublist({ ...data, sourcePlaylistId });
        }
        router.push("/sublists");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  // Filter categories by search query
  const filteredCategories = categories.filter(
    (c) =>
      !searchQuery ||
      c.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group all categories by type (unfiltered, for tab counts)
  const liveCategories = categories.filter((c) => c.categoryType === "live");
  const movieCategories = categories.filter((c) => c.categoryType === "movie");
  const seriesCategories = categories.filter(
    (c) => c.categoryType === "series"
  );

  const categoryTypes = [
    { key: "live", label: "Live TV", items: liveCategories },
    { key: "movie", label: "Movies", items: movieCategories },
    { key: "series", label: "Series", items: seriesCategories },
  ].filter((t) => t.items.length > 0);

  const selectedSourceName = sources.find(
    (s) => s.id === sourcePlaylistId
  )?.name;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sublist Info</CardTitle>
          <CardDescription>Name, source, and connection credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Living Room TV"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source Playlist</Label>
            {isEditing ? (
              <p className="text-sm bg-muted p-2 rounded">
                {selectedSourceName || "Unknown source"}
              </p>
            ) : (
              <select
                id="source"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={sourcePlaylistId ?? ""}
                onChange={(e) =>
                  setSourcePlaylistId(
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                required
              >
                <option value="">Select a source playlist...</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "Source cannot be changed after creation"
                : "Choose which source playlist this sublist pulls categories from"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="xtreamUsername">
                Xtream Username{" "}
                <span className="text-muted-foreground">(auto-generated)</span>
              </Label>
              <Input
                id="xtreamUsername"
                value={xtreamUsername}
                onChange={(e) => setXtreamUsername(e.target.value)}
                placeholder="Auto-generated"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="xtreamPassword">Xtream Password</Label>
              <Input
                id="xtreamPassword"
                value={xtreamPassword}
                onChange={(e) => setXtreamPassword(e.target.value)}
                placeholder="Auto-generated"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Allow consumers to access this sublist
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {isEditing && sublist.apiKey && (
            <div className="space-y-1">
              <Label>API Key</Label>
              <p className="font-mono text-sm bg-muted p-2 rounded">
                {sublist.apiKey}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {sourcePlaylistId && (
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              Select categories from{" "}
              <span className="font-medium">{selectedSourceName}</span> to
              include ({selectedCategories.size} selected)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingCategories ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Loading categories...
              </p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No categories available. Sync this source first.
              </p>
            ) : (
              <>
                <Input
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <Tabs
                  defaultValue={categoryTypes[0]?.key || "live"}
                  className="space-y-4"
                >
                  <TabsList>
                    {categoryTypes.map((t) => {
                      const selectedInTab = t.items.filter((c) =>
                        selectedCategories.has(c.id)
                      ).length;
                      return (
                        <TabsTrigger key={t.key} value={t.key}>
                          {t.label}{" "}
                          <Badge variant="secondary" className="ml-1.5">
                            {selectedInTab}/{t.items.length}
                          </Badge>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {categoryTypes.map((t) => {
                    const filtered = t.items.filter(
                      (c) =>
                        !searchQuery ||
                        c.categoryName
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase())
                    );
                    const allSelected =
                      filtered.length > 0 &&
                      filtered.every((c) => selectedCategories.has(c.id));

                    return (
                      <TabsContent key={t.key} value={t.key}>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => selectAllInTab(t.items)}
                              disabled={allSelected}
                            >
                              Select All
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => deselectAllInTab(t.items)}
                              disabled={
                                !filtered.some((c) =>
                                  selectedCategories.has(c.id)
                                )
                              }
                            >
                              Deselect All
                            </Button>
                            <span className="text-sm text-muted-foreground ml-auto">
                              {filtered.length} categories
                              {searchQuery ? " matching" : ""}
                            </span>
                          </div>

                          {filtered.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                              No categories match your search.
                            </p>
                          ) : (
                            <div className="rounded-lg border max-h-96 overflow-y-auto">
                              <div className="grid grid-cols-1 md:grid-cols-2">
                                {filtered.map((cat) => (
                                  <label
                                    key={cat.id}
                                    className="flex items-center gap-2 p-2.5 border-b last:border-b-0 hover:bg-muted cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={selectedCategories.has(cat.id)}
                                      onCheckedChange={() =>
                                        toggleCategory(cat.id)
                                      }
                                    />
                                    <span className="text-sm flex-1 truncate">
                                      {cat.categoryName}
                                    </span>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {cat._count.channels} ch
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        <Button type="submit" disabled={isPending || !sourcePlaylistId}>
          {isPending
            ? "Saving..."
            : isEditing
              ? "Update Sublist"
              : "Create Sublist"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/sublists")}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
