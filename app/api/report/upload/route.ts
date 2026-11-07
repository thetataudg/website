// POST /api/report/upload: one screenshot, normalized and stored under the
// uploader's own prefix. Returns the key to attach to a report or reply.
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";
import { forbidden, HttpError } from "@/lib/httpError";
import { rateLimit } from "@/lib/rateLimit";
import { SCREENSHOT_MAX_BYTES } from "@/lib/bugs/constants";
import { canReport, screenshotPrefixFor } from "@/lib/bugs/permissions";
import { storeImage } from "@/lib/storedImages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const member = await currentMember(req);
    if (!canReport(member)) throw forbidden("Your account cannot file reports");
    if (!rateLimit(`bug:upload:${member._id}`, 30, 3600).ok) {
      throw new HttpError(429, "Too many uploads. Try again a little later.");
    }
    const form = await req.formData();
    const stored = await storeImage(form.get("file"), screenshotPrefixFor(member), SCREENSHOT_MAX_BYTES);
    return NextResponse.json({ key: stored.key }, { status: 201 });
  } catch (err: any) {
    if (!(err?.statusCode >= 400 && err?.statusCode < 500)) logger.error({ err }, "Failed to upload screenshot");
    return apiErrorResponse(err);
  }
}
