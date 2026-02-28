"use client";

import { useState, useTransition } from "react";
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
import { createSource, updateSource } from "@/actions/sources";
import type { SourceFormData, SourceType } from "@/types";

interface SourceFormProps {
  source?: {
    id: number;
    name: string;
    type: string;
    xtreamHost: string | null;
    xtreamUsername: string | null;
    xtreamPassword: string | null;
    m3uUrl: string | null;
    isEnabled: boolean;
    refreshIntervalMin: number;
  };
}

export function SourceForm({ source }: SourceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!source;

  const [type, setType] = useState<SourceType>(
    (source?.type as SourceType) || "xtream"
  );
  const [name, setName] = useState(source?.name || "");
  const [xtreamHost, setXtreamHost] = useState(source?.xtreamHost || "");
  const [xtreamUsername, setXtreamUsername] = useState(
    source?.xtreamUsername || ""
  );
  const [xtreamPassword, setXtreamPassword] = useState(
    source?.xtreamPassword || ""
  );
  const [m3uUrl, setM3uUrl] = useState(source?.m3uUrl || "");
  const [isEnabled, setIsEnabled] = useState(source?.isEnabled ?? true);
  const [refreshIntervalMin, setRefreshIntervalMin] = useState(
    source?.refreshIntervalMin ?? 360
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const data: SourceFormData = {
      name,
      type,
      xtreamHost: type === "xtream" ? xtreamHost : undefined,
      xtreamUsername: type === "xtream" ? xtreamUsername : undefined,
      xtreamPassword: type === "xtream" ? xtreamPassword : undefined,
      m3uUrl: type === "m3u" ? m3uUrl : undefined,
      isEnabled,
      refreshIntervalMin,
    };

    startTransition(async () => {
      try {
        if (isEditing) {
          await updateSource(source.id, data);
        } else {
          await createSource(data);
        }
        router.push("/sources");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
          <CardDescription>Name and type of the source</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Source Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My IPTV Provider"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Source Type</Label>
            <div className="flex gap-4">
              <Button
                type="button"
                variant={type === "xtream" ? "default" : "outline"}
                onClick={() => setType("xtream")}
              >
                Xtream Codes
              </Button>
              <Button
                type="button"
                variant={type === "m3u" ? "default" : "outline"}
                onClick={() => setType("m3u")}
              >
                M3U URL
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {type === "xtream" ? (
        <Card>
          <CardHeader>
            <CardTitle>Xtream Credentials</CardTitle>
            <CardDescription>
              Connection details for the Xtream Codes provider
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="xtreamHost">Server URL</Label>
              <Input
                id="xtreamHost"
                value={xtreamHost}
                onChange={(e) => setXtreamHost(e.target.value)}
                placeholder="http://provider.example.com:8080"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="xtreamUsername">Username</Label>
                <Input
                  id="xtreamUsername"
                  value={xtreamUsername}
                  onChange={(e) => setXtreamUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="xtreamPassword">Password</Label>
                <Input
                  id="xtreamPassword"
                  type="password"
                  value={xtreamPassword}
                  onChange={(e) => setXtreamPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>M3U URL</CardTitle>
            <CardDescription>
              Direct URL to the M3U/M3U8 playlist file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="m3uUrl">Playlist URL</Label>
              <Input
                id="m3uUrl"
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
                placeholder="https://provider.example.com/playlist.m3u8"
                required
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Include this source during sync
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refreshInterval">
              Refresh Interval (minutes)
            </Label>
            <Input
              id="refreshInterval"
              type="number"
              min={30}
              value={refreshIntervalMin}
              onChange={(e) =>
                setRefreshIntervalMin(parseInt(e.target.value) || 360)
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving..."
            : isEditing
              ? "Update Source"
              : "Add Source"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/sources")}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
