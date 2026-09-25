// GET /api/admin/notification-center/history — past sends, newest first.
// The list leaves the per-recipient results out; the detail route has them.
import { NextResponse } from "next/server";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import NotificationBroadcast from "@/lib/models/NotificationBroadcast";
import { serializeBroadcast } from "./serialize";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  try {
    await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }

  try {
    const url = new URL(req.url);
    const before = url.searchParams.get("before");
    const filter = before ? { createdAt: { $lt: new Date(before) } } : {};
    const rows = await NotificationBroadcast.find(filter)
      .select("-recipients")
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .lean<any[]>();

    const page = rows.slice(0, PAGE_SIZE);
    return NextResponse.json({
      items: await Promise.all(page.map((row) => serializeBroadcast(row, false))),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].createdAt : null,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to load Notification Center history");
    return NextResponse.json({ error: "Could not load history." }, { status: 500 });
  }
}
