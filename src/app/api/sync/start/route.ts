import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { runFullSync } from "@/lib/sync/engine";

export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use after() so the sync keeps running after the response is sent
  after(async () => {
    await runFullSync();
  });

  return NextResponse.json({ started: true });
}
