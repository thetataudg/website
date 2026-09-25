// GET /api/notification-images/<broadcastId> — a stable address for the
// picture on a Notification Center send.
//
// Public on purpose. The two things that fetch it are a mail client opening
// the email and the app's notification service extension, and neither carries
// a session. The id is an unguessable ObjectId and the picture was sent to the
// people fetching it. Redirects to a signature minted now, because the push
// or the email may be opened long after any presigned URL would expire.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import NotificationBroadcast from "@/lib/models/NotificationBroadcast";
import { signNewsletterImage } from "@/lib/newsletterStorage";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await connectDB();
    const doc = await NotificationBroadcast.findById(params.id).select("imageKey").lean<any>();
    const signed = doc?.imageKey ? await signNewsletterImage(doc.imageKey) : "";
    if (!signed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(signed, 307);
  } catch (err: any) {
    logger.error({ err, id: params.id }, "Failed to resolve notification image");
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
