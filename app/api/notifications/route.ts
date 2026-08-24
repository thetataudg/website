// app/api/notifications/route.ts
// A member's own bell. Read-only apart from marking things read — nothing about
// a notification can be edited or deleted, because it's also the member's copy
// of what the chapter told them and when.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Notification from "@/lib/models/Notification";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface NotificationPage {
  notifications: NotificationDTO[];
  unreadCount: number;
  hasMore: boolean;
  /// The `createdAt` of the last row, to be sent back as `before`.
  nextCursor: string | null;
}

export interface NotificationDTO {
  _id: string;
  template: string;
  title: string;
  body: string;
  link: string;
  category: string;
  amountCents: number | null;
  readAt: string | null;
  channels: string[];
  createdAt: string | null;
}

function serialize(notification: any): NotificationDTO {
  return {
    _id: notification?._id?.toString?.() ?? "",
    template: notification?.template ?? "",
    title: notification?.title ?? "",
    body: notification?.body ?? "",
    link: notification?.link ?? "",
    category: notification?.category ?? "general",
    amountCents:
      notification?.amountCents === null || notification?.amountCents === undefined
        ? null
        : Number(notification.amountCents),
    readAt: notification?.readAt ? new Date(notification.readAt).toISOString() : null,
    channels: notification?.channels ?? [],
    createdAt: notification?.createdAt
      ? new Date(notification.createdAt).toISOString()
      : null,
  };
}

export async function GET(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 40));

    const filter: any = { memberId: member._id };

    // Cursor rather than an offset: the list is strictly newest-first and new
    // notifications arrive at the head of it, so paging by position would
    // repeat a row every time one landed mid-scroll.
    const before = searchParams.get("before");
    if (before) {
      const cutoff = new Date(before);
      if (!Number.isNaN(cutoff.getTime())) {
        filter.createdAt = { $lt: cutoff };
      }
    }

    const query = (searchParams.get("q") || "").trim();
    if (query) {
      // Escaped, because a member searching for "$45" must not have the "$"
      // read as a regex anchor.
      const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(safe, "i");
      filter.$or = [{ title: pattern }, { body: pattern }];
    }

    const [rows, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        // One more than asked for, purely to answer "is there another page?"
        // without a second count query.
        .limit(limit + 1)
        .lean<any[]>(),
      Notification.countDocuments({ memberId: member._id, readAt: null }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json(
      {
        notifications: page.map(serialize),
        unreadCount,
        hasMore,
        // What the client sends back as `before` for the next page.
        nextCursor: page.length
          ? new Date(page[page.length - 1].createdAt).toISOString()
          : null,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to load notifications");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// Mark one as read, or all of them. Scoped to the caller's own rows by the
/// query itself rather than by a check afterwards, so there's no path where a
/// wrong id reads someone else's bell.
export async function PATCH(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const filter: any = { memberId: member._id, readAt: null };
    if (body?.id) filter._id = body.id;

    const result = await Notification.updateMany(filter, {
      $set: { readAt: new Date() },
    });
    const unreadCount = await Notification.countDocuments({
      memberId: member._id,
      readAt: null,
    });

    return NextResponse.json(
      { markedRead: result.modifiedCount ?? 0, unreadCount },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to mark notifications read");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
