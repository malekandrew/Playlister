"use client";

import { useState, useTransition } from "react";
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
import { updateAppSettings } from "@/actions/settings";

interface SettingsFormProps {
  refreshIntervalMin: number;
}

export function SettingsForm({ refreshIntervalMin }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [interval, setInterval] = useState(refreshIntervalMin);
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      try {
        await updateAppSettings({ refreshIntervalMin: interval });
        setMessage("Settings saved");
        setTimeout(() => setMessage(null), 3000);
      } catch (err) {
        setMessage(
          `Error: ${err instanceof Error ? err.message : "Failed"}`
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Settings</CardTitle>
        <CardDescription>Configure automatic sync behavior</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refreshInterval">
              Default Refresh Interval (minutes)
            </Label>
            <Input
              id="refreshInterval"
              type="number"
              min={30}
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value) || 360)}
            />
            <p className="text-xs text-muted-foreground">
              How often to automatically sync all sources (via Vercel Cron)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Settings"}
            </Button>
            {message && (
              <span className="text-sm text-muted-foreground">{message}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
