// GET /api/admin/notification-center — everything the compose page needs:
// the addressable roster with each member's reachability, the committees, and
// which delivery channels this deployment can actually use.
import { NextResponse } from "next/server";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import { loadRoster } from "@/lib/notify/broadcast";
import { pushChannel } from "@/lib/notify/channels/push";
import { emailChannel } from "@/lib/notify/channels/email";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let actor;
  try {
    actor = await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }

  try {
    const roster = await loadRoster();
    return NextResponse.json({
      ...roster,
      me: String((actor.submitter as any)._id),
      configured: {
        push: pushChannel.isConfigured(),
        inapp: true,
        email: emailChannel.isConfigured(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to load Notification Center roster");
    return NextResponse.json({ error: "Could not load the roster." }, { status: 500 });
  }
}
