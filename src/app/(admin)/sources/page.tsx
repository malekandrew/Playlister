import Link from "next/link";
import { getSources } from "@/actions/sources";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceActions } from "@/components/admin/source-actions";

export default async function SourcesPage() {
  const sources = await getSources();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sources</h1>
          <p className="text-muted-foreground">
            Manage your upstream IPTV providers
          </p>
        </div>
        <Button asChild>
          <Link href="/sources/new">Add Source</Link>
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">
            No sources configured yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-25">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/sources/${source.id}`}
                      className="hover:underline"
                    >
                      {source.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {source.type === "xtream" ? "Xtream" : "M3U"}
                    </Badge>
                  </TableCell>
                  <TableCell>{source._count.categories}</TableCell>
                  <TableCell>{source._count.channels}</TableCell>
                  <TableCell>
                    {source.lastSyncedAt
                      ? new Date(source.lastSyncedAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    {source.lastSyncError ? (
                      <Badge variant="destructive">Error</Badge>
                    ) : source.isEnabled ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <SourceActions source={source} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
