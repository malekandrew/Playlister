import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runFullSync } from "@/lib/sync/engine";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fire-and-forget — don't block the response
  runFullSync().catch(() => {});

  return NextResponse.json({ started: true });
}
