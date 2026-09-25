// GET /api/admin/notification-center/history/<id> — one send, with every
// recipient and what happened on each channel.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import NotificationBroadcast from "@/lib/models/NotificationBroadcast";
import { serializeBroadcast } from "../serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await NotificationBroadcast.findById(params.id).lean<any>();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await serializeBroadcast(row, true));
}
