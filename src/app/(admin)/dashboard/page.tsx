import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { SyncProgressCard } from "@/components/admin/sync-progress";

export default async function DashboardPage() {
  const [sourceCount, channelCount, sublistCount] = await Promise.all([
    db.sourcePlaylist.count(),
    db.channel.count(),
    db.sublist.count(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Playlister instance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sources</CardDescription>
            <CardTitle className="text-4xl">{sourceCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Upstream IPTV providers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Channels</CardDescription>
            <CardTitle className="text-4xl">{channelCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Total synced channels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sublists</CardDescription>
            <CardTitle className="text-4xl">{sublistCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Active output playlists
            </p>
          </CardContent>
        </Card>
      </div>

      <SyncProgressCard />
    </div>
  );
}
