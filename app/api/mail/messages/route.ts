// app/api/mail/messages/route.ts
// One page of one folder in the signed-in member's mailbox.
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import MailMessage, { MAIL_FOLDERS } from "@/lib/models/MailMessage";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { toListItem } from "@/lib/mail/serialize";
import { syncReceivedMail } from "@/lib/mail/sync";
import { backfillQuotedSnippets } from "@/lib/mail/snippets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    // Anything the webhook missed, stored before the list is read.
    await Promise.all([syncReceivedMail(), backfillQuotedSnippets()]);
    const params = req.nextUrl.searchParams;
    const folder = params.get("folder") || "inbox";
    const labelId = params.get("label") || "";
    if (labelId && !isObjectId(labelId)) return NextResponse.json({ error: "Unknown label" }, { status: 400 });
    if (!labelId && !(MAIL_FOLDERS as readonly string[]).includes(folder) && !["starred", "all"].includes(folder)) {
      return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
    }

    const query: any = { accountId: account._id };
    if (labelId) {
      // A label view is everything carrying it, as in Gmail, less what has
      // been thrown away.
      query.labels = labelId;
      query.folder = { $nin: ["trash", "junk", "drafts"] };
    } else if (folder === "all") {
      // Gmail's All Mail: every message except junk, trash and drafts.
      query.folder = { $nin: ["trash", "junk", "drafts"] };
    } else if (folder === "starred") {
      query.starred = true;
      query.folder = { $ne: "trash" };
    } else {
      query.folder = folder;
    }
    if (params.get("unread") === "1") query.read = false;

    const q = (params.get("q") || "").trim().slice(0, 100);
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      query.$or = [{ subject: pattern }, { snippet: pattern }, { from: pattern }, { fromName: pattern }, { to: pattern }];
    }

    // The cursor is the last conversation's newest date + id. Both fields are
    // needed so messages with the same timestamp cannot be skipped.
    const before = params.get("before") || "";
    const [beforeDate, beforeId] = before.split("|");
    const cursorDate = beforeDate && !Number.isNaN(Date.parse(beforeDate)) ? new Date(beforeDate) : null;
    const cursorMatch = cursorDate && isObjectId(beforeId)
      ? {
          $or: [
            { date: { $lt: cursorDate } },
            { date: cursorDate, _id: { $lt: new Types.ObjectId(beforeId) } },
          ],
        }
      : null;

    const conversationPipeline: any[] = [
      { $match: query },
      // The newest matching message represents each conversation in the list.
      { $sort: { date: -1, _id: -1 } },
      { $group: { _id: "$threadId", row: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$row" } },
      ...(cursorMatch ? [{ $match: cursorMatch }] : []),
      { $sort: { date: -1, _id: -1 } },
      { $limit: PAGE_SIZE + 1 },
      { $project: { html: 0, text: 0, references: 0 } },
    ];

    const [rows, conversationCountRows, counts, labelRows] = await Promise.all([
      MailMessage.aggregate(conversationPipeline),
      MailMessage.aggregate([
        { $match: query },
        { $group: { _id: "$threadId" } },
        { $count: "total" },
      ]),
      MailMessage.aggregate([
        { $match: { accountId: account._id } },
        {
          $group: {
            _id: "$folder",
            total: { $sum: 1 },
            unread: { $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] } },
          },
        },
      ]),
      // Unread per label, which is the number Gmail puts beside one.
      MailMessage.aggregate([
        { $match: { accountId: account._id, read: false, folder: { $nin: ["trash", "junk", "drafts"] }, "labels.0": { $exists: true } } },
        { $unwind: "$labels" },
        { $group: { _id: "$labels", unread: { $sum: 1 } } },
      ]),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE).map(toListItem);
    const last = items[items.length - 1];
    const folderCounts = Object.fromEntries(
      MAIL_FOLDERS.map((f) => {
        const row = counts.find((c: any) => c._id === f);
        return [f, { total: row?.total ?? 0, unread: row?.unread ?? 0 }];
      })
    );

    return NextResponse.json({
      items,
      counts: folderCounts,
      labelCounts: Object.fromEntries(labelRows.map((r: any) => [String(r._id), r.unread])),
      total: conversationCountRows[0]?.total ?? 0,
      pageSize: PAGE_SIZE,
      nextBefore: hasMore && last ? `${last.date}|${last.id}` : null,
    });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
