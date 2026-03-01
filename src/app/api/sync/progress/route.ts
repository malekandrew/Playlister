import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSyncProgress, resetSyncProgress } from "@/lib/sync/progress";
import { isSyncLockExpired, forceReleaseSyncLock } from "@/lib/sync/lock";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const progress = await getSyncProgress({ force: true });

  // Auto-recover stale syncs: if the progress says "running" but the lock
  // has expired, the serverless function was killed (Vercel timeout).
  // Reset the progress so the UI isn't stuck forever.
  if (progress.isRunning) {
    const expired = await isSyncLockExpired();
    if (expired) {
      await forceReleaseSyncLock();
      // Mark as completed-with-errors so the user knows it was interrupted
      const recovered = {
        ...progress,
        isRunning: false,
        status: "completed_with_errors" as const,
        currentStep: "Sync interrupted (server timeout) — channels may have been partially updated",
        completedAt: new Date().toISOString(),
        cancelRequested: false,
        errors: [...(progress.errors || []), "Sync process was terminated by the server before completion"],
      };
      // Write recovered state directly
      const { db } = await import("@/lib/db");
      await db.appSettings.update({
        where: { id: 1 },
        data: { syncProgress: recovered as never },
      });
      return NextResponse.json(recovered);
    }
  }

  return NextResponse.json(progress);
}
