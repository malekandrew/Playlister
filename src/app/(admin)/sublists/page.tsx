import Link from "next/link";
import { getSublists } from "@/actions/sublists";
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
import { SublistActions } from "@/components/admin/sublist-actions";

export default async function SublistsPage() {
  const sublists = await getSublists();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sublists</h1>
          <p className="text-muted-foreground">
            Manage output playlists for consumers
          </p>
        </div>
        <Button asChild>
          <Link href="/sublists/new">Create Sublist</Link>
        </Button>
      </div>

      {sublists.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">
            No sublists created yet. Create one to start serving playlists.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Xtream User</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-25">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sublists.map((sublist) => (
                <TableRow key={sublist.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/sublists/${sublist.id}`}
                      className="hover:underline"
                    >
                      {sublist.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {sublist.sourcePlaylist.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {sublist.xtreamUsername}
                  </TableCell>
                  <TableCell>{sublist._count.categories}</TableCell>
                  <TableCell>
                    {sublist.lastUsedAt
                      ? new Date(sublist.lastUsedAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    {sublist.isEnabled ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <SublistActions sublist={sublist} />
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
