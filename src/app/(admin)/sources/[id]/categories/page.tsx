import { notFound } from "next/navigation";
import Link from "next/link";
import { getSource, getCategories } from "@/actions/sources";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryList } from "@/components/admin/category-list";
import { FetchCategoriesButton } from "@/components/admin/fetch-categories-button";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sourceId = parseInt(id);
  const [source, categories] = await Promise.all([
    getSource(sourceId),
    getCategories(sourceId),
  ]);

  if (!source) {
    notFound();
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/sources"
              className="text-sm text-muted-foreground hover:underline"
            >
              Sources
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <Link
              href={`/sources/${source.id}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {source.name}
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm">Categories</span>
          </div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground">
            {categories.length} categories from {source.name}
          </p>
        </div>
        <FetchCategoriesButton sourceId={source.id} />
      </div>

      {categories.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground mb-4">
            No categories fetched yet. Click &quot;Fetch Categories&quot; to
            load them from the provider.
          </p>
          <FetchCategoriesButton sourceId={source.id} />
        </div>
      ) : (
        <Tabs
          defaultValue={categoryTypes[0]?.key || "live"}
          className="space-y-4"
        >
          <TabsList>
            {categoryTypes.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}{" "}
                <Badge variant="secondary" className="ml-1.5">
                  {t.items.length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {categoryTypes.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <CategoryList
                categories={t.items}
                sourceId={source.id}
                categoryType={t.key}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
