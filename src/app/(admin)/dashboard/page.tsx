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
  const [sourceCount, channelCount, sublistCount, liveCount, movieCount, seriesCount] = await Promise.all([
    db.sourcePlaylist.count(),
    db.channel.count(),
    db.sublist.count(),
    db.channel.count({ where: { category: { categoryType: "live" } } }),
    db.channel.count({ where: { category: { categoryType: "movie" } } }),
    db.channel.count({ where: { category: { categoryType: "series" } } }),
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
            <CardTitle className="text-4xl">{channelCount.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Total synced channels
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">
                <span className="font-semibold">{liveCount.toLocaleString()}</span> Live
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-purple-600 dark:text-purple-400">
                <span className="font-semibold">{movieCount.toLocaleString()}</span> Movies
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                <span className="font-semibold">{seriesCount.toLocaleString()}</span> Series
              </span>
            </div>
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
