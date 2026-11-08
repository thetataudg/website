// GET /api/rush/poster/rush/<stamp>-<uuid>.jpg: the public poster.
//
// Every upload gets a new key, so the response is cacheable forever and
// next/image's one-year cache can never show a stale poster.
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { isSafeImageKey, readImage } from "@/lib/storedImages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { key: string[] } }) {
  const key = (params.key || []).join("/");
  if (!isSafeImageKey(key, "rush")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const bytes = await readImage(key);
    if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    logger.error({ err, key }, "Failed to read rush poster");
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}
