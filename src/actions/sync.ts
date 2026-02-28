"use server";

import { runFullSync, syncSingleSource } from "@/lib/sync/engine";
import { getSyncProgress } from "@/lib/sync/progress";
import { isSyncLocked } from "@/lib/sync/lock";

export async function startFullSync() {
  const result = await runFullSync();
  return result;
}

export async function startSourceSync(sourceId: number) {
  const result = await syncSingleSource(sourceId);
  return result;
}

export async function getProgress() {
  return getSyncProgress();
}

export async function getSyncStatus() {
  const [progress, locked] = await Promise.all([
    getSyncProgress(),
    isSyncLocked(),
  ]);
  return { progress, isLocked: locked };
}
