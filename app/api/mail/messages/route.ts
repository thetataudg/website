// app/api/mail/messages/route.ts
// One page of one folder in the signed-in member's mailbox.
import { NextRequest, NextResponse } from "next/server";
import MailMessage, { MAIL_FOLDERS } from "@/lib/models/MailMessage";
import { mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { toListItem } from "@/lib/mail/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const params = req.nextUrl.searchParams;
    const folder = params.get("folder") || "inbox";
    if (!(MAIL_FOLDERS as readonly string[]).includes(folder) && folder !== "starred") {
      return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
    }

    const query: any = { accountId: account._id };
    if (folder === "starred") {
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

    const before = params.get("before");
    if (before && !Number.isNaN(Date.parse(before))) query.date = { $lt: new Date(before) };

    const [rows, counts] = await Promise.all([
      MailMessage.find(query)
        .sort({ date: -1 })
        .limit(PAGE_SIZE + 1)
        .select("-html -text -references")
        .lean<any[]>(),
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
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE).map(toListItem);
    const folderCounts = Object.fromEntries(
      MAIL_FOLDERS.map((f) => {
        const row = counts.find((c: any) => c._id === f);
        return [f, { total: row?.total ?? 0, unread: row?.unread ?? 0 }];
      })
    );

    return NextResponse.json({
      items,
      counts: folderCounts,
      nextBefore: hasMore ? items[items.length - 1].date : null,
    });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
