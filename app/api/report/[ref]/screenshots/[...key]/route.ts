// GET /api/report/TTDG-R2741/screenshots/bugs/<member>/<file>.jpg
// Access-checked on every request and never cached by shared caches.
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";
import { canSeeScreenshot } from "@/lib/bugs/service";
import { isSafeImageKey, readImage } from "@/lib/storedImages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: Request, { params }: { params: { ref: string; key: string[] } }) {
  const key = (params.key || []).join("/");
  if (!isSafeImageKey(key, "bugs")) return notFound();
  let member: any;
  try {
    member = await currentMember(req);
  } catch {
    return NextResponse.json({ error: "Sign in to view this" }, { status: 401 });
  }
  if (!(await canSeeScreenshot(member, params.ref, key))) return notFound();
  try {
    const bytes = await readImage(key);
    if (!bytes) return notFound();
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  } catch (err: any) {
    logger.error({ err, key }, "Failed to read bug screenshot");
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}
