import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generatePlaylist } from "@/lib/playlist/generator";

/**
 * GET /playlist.m3u8?key=<apiKey>
 * Serves an M3U8 playlist authenticated by API key.
 */
export async function GET(request: NextRequest) {
  const apiKey = request.nextUrl.searchParams.get("key");

  if (!apiKey) {
    return new NextResponse("Missing API key", { status: 401 });
  }

  const sublist = await db.sublist.findUnique({
    where: { apiKey },
  });

  if (!sublist || !sublist.isEnabled) {
    return new NextResponse("Invalid or disabled API key", { status: 403 });
  }

  try {
    const playlist = await generatePlaylist(sublist.id);

    return new NextResponse(playlist, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpegurl",
        "Content-Disposition": 'inline; filename="playlist.m3u8"',
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("Failed to generate playlist:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
