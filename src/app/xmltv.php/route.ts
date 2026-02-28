import { NextResponse } from "next/server";

/**
 * GET /xmltv.php?username=<user>&password=<pass>
 * Returns an empty XMLTV document (EPG stub).
 */
export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="Playlister" generator-info-url="">
</tv>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
