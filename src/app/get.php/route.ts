import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generatePlaylist } from "@/lib/playlist/generator";

/**
 * GET /get.php?username=<user>&password=<pass>&type=m3u_plus
 * Xtream Codes M3U endpoint — serves playlist with proxy URLs.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const password = request.nextUrl.searchParams.get("password");

  if (!username || !password) {
    return new NextResponse("Missing credentials", { status: 401 });
  }

  const sublist = await db.sublist.findUnique({
    where: { xtreamUsername: username },
  });

  if (!sublist || sublist.xtreamPassword !== password || !sublist.isEnabled) {
    return new NextResponse("Invalid credentials", { status: 403 });
  }

  try {
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;

    const playlist = await generatePlaylist(sublist.id, {
      useProxyUrls: true,
      baseUrl,
      username: sublist.xtreamUsername,
      password: sublist.xtreamPassword,
    });

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
