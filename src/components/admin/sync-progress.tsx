"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SyncProgress, SourceSyncStatus } from "@/types";

function formatElapsed(startedAt?: string, endedAt?: string): string {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function SourceRow({ source }: { source: SourceSyncStatus }) {
  const pct =
    source.categoriesTotal > 0
      ? Math.round(
          (source.categoriesProcessed / source.categoriesTotal) * 100
        )
      : 0;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{source.sourceName}</span>
          <Badge
            variant={
              source.status === "error"
                ? "destructive"
                : source.status === "completed"
                  ? "secondary"
                  : source.status === "syncing"
                    ? "default"
                    : "outline"
            }
          >
            {source.status === "syncing" ? (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
                syncing
              </span>
            ) : (
              source.status
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {source.channelsFetched > 0 && (
            <span>{source.channelsFetched.toLocaleString()} channels</span>
          )}
          {source.startedAt && (
            <span>{formatElapsed(source.startedAt, source.completedAt)}</span>
          )}
        </div>
      </div>

      {(source.status === "syncing" || source.status === "completed") &&
        source.categoriesTotal > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Categories: {source.categoriesProcessed} /{" "}
                {source.categoriesTotal}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

      {source.error && (
        <p className="text-xs text-destructive">{source.error}</p>
      )}
    </div>
  );
}

export function SyncProgressCard() {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [polling, setPolling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [, setTick] = useState(0); // force re-render for elapsed time
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/progress");
      if (res.ok) {
        const p: SyncProgress = await res.json();
        setProgress(p);
        if (p.isRunning) {
          setPolling(true);
          setStarting(false);
        } else {
          setPolling(false);
          setCancelling(false);
        }
      }
    } catch {
      // Ignore errors during polling
    }
  }, []);

  // Poll progress while sync is running
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(fetchProgress, 1500);
    return () => clearInterval(interval);
  }, [polling, fetchProgress]);

  // Tick for elapsed time display while running
  useEffect(() => {
    if (polling) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [polling]);

  // Check initial progress
  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  async function handleSync() {
    setStarting(true);
    try {
      await fetch("/api/sync/start", { method: "POST" });
      setPolling(true);
      // Delay first poll slightly to let the engine initialize
      setTimeout(fetchProgress, 500);
    } catch {
      setStarting(false);
    }
  }

  async function handleCancel() {
    if (cancelling) {
      // Second click while already cancelling = force reset
      try {
        await fetch("/api/sync/cancel", { method: "POST" });
        setCancelling(false);
        fetchProgress();
      } catch {
        // ignore
      }
      return;
    }
    setCancelling(true);
    try {
      await fetch("/api/sync/cancel", { method: "POST" });
    } catch {
      setCancelling(false);
    }
  }

  const isRunning = progress?.isRunning || starting;

  const overallPct =
    progress &&
    progress.totalCategories &&
    progress.totalCategories > 0
      ? Math.round(
          ((progress.processedCategories || 0) / progress.totalCategories) * 100
        )
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Sync Engine</CardTitle>
            <CardDescription>
              Fetch channels from all enabled sources
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
              >
                {cancelling ? "Force Reset" : "Cancel"}
              </Button>
            )}
            <Button onClick={handleSync} disabled={isRunning}>
              {starting
                ? "Starting..."
                : isRunning
                  ? "Syncing..."
                  : "Sync Now"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {progress && progress.status !== "idle" && (
          <div className="space-y-4">
            {/* Overall status bar */}
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  progress.status === "error"
                    ? "destructive"
                    : progress.status === "completed_with_errors"
                      ? "destructive"
                      : progress.status === "cancelled"
                        ? "outline"
                        : progress.isRunning
                          ? "default"
                          : "secondary"
                }
              >
                {progress.isRunning ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
                    {progress.currentStep || "syncing"}
                  </span>
                ) : (
                  progress.status
                )}
              </Badge>

              {progress.startedAt && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {progress.isRunning ? "Elapsed: " : "Duration: "}
                  {formatElapsed(progress.startedAt, progress.completedAt)}
                </span>
              )}
            </div>

            {/* Overall progress bar */}
            {progress.isRunning && progress.totalCategories && progress.totalCategories > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Overall: {progress.processedSources || 0}/{progress.totalSources || 0} sources,{" "}
                    {progress.processedCategories || 0}/{progress.totalCategories} categories
                  </span>
                  <span>{overallPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Summary when done */}
            {!progress.isRunning && progress.totalChannels !== undefined && (
              <div className="flex gap-4 text-sm">
                <span>
                  <span className="font-medium">{progress.processedSources || 0}</span>{" "}
                  source(s) processed
                </span>
                <span>
                  <span className="font-medium">{progress.totalChannels.toLocaleString()}</span>{" "}
                  channels total
                </span>
              </div>
            )}

            {/* Per-source breakdown */}
            {progress.sources && progress.sources.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Sources</h4>
                {progress.sources.map((src) => (
                  <SourceRow key={src.sourceId} source={src} />
                ))}
              </div>
            )}

            {/* Errors */}
            {progress.errors.length > 0 && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-destructive">
                  Errors ({progress.errors.length})
                </span>
                <ul className="list-disc pl-5 text-xs text-destructive space-y-0.5">
                  {progress.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timestamps */}
            {progress.startedAt && !progress.isRunning && (
              <p className="text-xs text-muted-foreground">
                Last run: {new Date(progress.startedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {(!progress || progress.status === "idle") && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Sync Now&quot; to fetch channels from all enabled sources.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
