import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSyncProgress } from "@/lib/sync/progress";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const progress = await getSyncProgress({ force: true });
  return NextResponse.json(progress);
}
