import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/sync/engine";

export const maxDuration = 60;

/**
 * Vercel Cron handler — triggers a full sync on schedule.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  // Verify Vercel Cron secret
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runFullSync();
  return NextResponse.json(result);
}
