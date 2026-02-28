import { notFound } from "next/navigation";
import {
  getSublist,
  getSources,
  getCategoriesForSource,
} from "@/actions/sublists";
import { SublistForm } from "@/components/admin/sublist-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { headers } from "next/headers";

export default async function EditSublistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sublist, sources] = await Promise.all([
    getSublist(parseInt(id)),
    getSources(),
  ]);

  if (!sublist) {
    notFound();
  }

  // Pre-load categories for the sublist's source
  const initialCategories = await getCategoriesForSource(
    sublist.sourcePlaylistId
  );

  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || "http";
  const baseUrl = `${protocol}://${host}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Sublist</h1>
        <p className="text-muted-foreground">
          Update {sublist.name} settings and categories
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection URLs</CardTitle>
          <CardDescription>
            Share these with IPTV players to connect
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">M3U Playlist URL</p>
            <code className="block text-sm bg-muted p-2 rounded break-all">
              {baseUrl}/playlist.m3u8?key={sublist.apiKey}
            </code>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Xtream Login URL</p>
            <code className="block text-sm bg-muted p-2 rounded break-all">
              {baseUrl}/get.php?username={sublist.xtreamUsername}
              &password={sublist.xtreamPassword}&type=m3u_plus
            </code>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">
              Xtream Codes Connection
            </p>
            <div className="text-sm bg-muted p-2 rounded space-y-1">
              <p>
                <span className="text-muted-foreground">Server:</span>{" "}
                {baseUrl}
              </p>
              <p>
                <span className="text-muted-foreground">Username:</span>{" "}
                {sublist.xtreamUsername}
              </p>
              <p>
                <span className="text-muted-foreground">Password:</span>{" "}
                {sublist.xtreamPassword}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <SublistForm
        sublist={{
          ...sublist,
          categories: sublist.categories.map((c) => ({
            categoryId: c.categoryId,
          })),
        }}
        sources={sources}
        initialCategories={initialCategories}
      />
    </div>
  );
}
