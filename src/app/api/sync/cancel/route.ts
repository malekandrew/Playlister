import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestSyncCancel, isCancelRequested, resetSyncProgress } from "@/lib/sync/progress";
import { forceReleaseSyncLock } from "@/lib/sync/lock";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If cancel was already requested (sync didn't respond), force-reset
  const alreadyCancelled = await isCancelRequested();
  if (alreadyCancelled) {
    await resetSyncProgress();
    await forceReleaseSyncLock();
    return NextResponse.json({ forceReset: true });
  }

  await requestSyncCancel();

  return NextResponse.json({ cancelled: true });
}
