import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /series/<username>/<password>/<streamId>.<ext>
 * Validates credentials and redirects to the upstream stream URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  if (path.length < 3) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  const [username, password, streamFile] = path;
  const streamId = parseInt(streamFile.split(".")[0]);

  if (isNaN(streamId)) {
    return new NextResponse("Invalid stream ID", { status: 400 });
  }

  const sublist = await db.sublist.findUnique({
    where: { xtreamUsername: username },
  });

  if (!sublist || sublist.xtreamPassword !== password || !sublist.isEnabled) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const channel = await db.channel.findUnique({
    where: { id: streamId },
  });

  if (!channel) {
    return new NextResponse("Stream not found", { status: 404 });
  }

  return NextResponse.redirect(channel.url, 302);
}
