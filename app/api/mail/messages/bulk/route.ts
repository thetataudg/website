// Bulk actions for selected rows in the signed-in member's mailbox.
import { NextRequest, NextResponse } from "next/server";

import MailMessage from "@/lib/models/MailMessage";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "archive",
  "junk",
  "trash",
  "inbox",
  "read",
  "unread",
  "star",
  "unstar",
  "delete",
]);

export async function POST(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const ids = Array.from(
      new Set((Array.isArray(body.ids) ? body.ids : []).map(String).filter(isObjectId).slice(0, 100))
    );
    if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unknown bulk action" }, { status: 400 });
    if (!ids.length) return NextResponse.json({ error: "Select at least one message" }, { status: 400 });

    const selected = await MailMessage.find({ _id: { $in: ids }, accountId: account._id })
      .select("_id threadId folder")
      .lean<any[]>();
    if (!selected.length) return NextResponse.json({ error: "No messages found" }, { status: 404 });

    const threadIds = Array.from(new Set(selected.map((message) => message.threadId).filter(Boolean)));
    const selectedScope = { accountId: account._id, _id: { $in: selected.map((message) => message._id) } };
    const threadScope = { accountId: account._id, threadId: { $in: threadIds }, folder: { $ne: "drafts" } };

    if (action === "star" || action === "unstar") {
      await MailMessage.updateMany(selectedScope, { $set: { starred: action === "star" } });
    } else if (action === "read" || action === "unread") {
      await MailMessage.updateMany(threadScope, { $set: { read: action === "read" } });
    } else if (action === "delete") {
      // Trash is recoverable everywhere else. Only rows already in Trash (or
      // discarded drafts) are permanently removed.
      const permanentThreads = Array.from(
        new Set(selected.filter((message) => ["trash", "drafts"].includes(message.folder)).map((message) => message.threadId))
      );
      const recoverableThreads = Array.from(
        new Set(selected.filter((message) => !["trash", "drafts"].includes(message.folder)).map((message) => message.threadId))
      );
      if (permanentThreads.length) {
        await MailMessage.deleteMany({ accountId: account._id, threadId: { $in: permanentThreads }, folder: { $in: ["trash", "drafts"] } });
      }
      if (recoverableThreads.length) {
        await MailMessage.updateMany(
          { accountId: account._id, threadId: { $in: recoverableThreads }, folder: { $ne: "drafts" } },
          { $set: { folder: "trash" } }
        );
      }
    } else {
      const folder = action;
      await MailMessage.updateMany({ ...threadScope, direction: "in" }, { $set: { folder } });
      if (folder === "trash") {
        await MailMessage.updateMany({ ...threadScope, direction: "out" }, { $set: { folder: "trash" } });
      } else if (folder === "inbox") {
        await MailMessage.updateMany(
          { ...threadScope, direction: "out", folder: { $in: ["archive", "junk", "trash"] } },
          { $set: { folder: "sent" } }
        );
      }
    }

    return NextResponse.json({ ok: true, selected: selected.length });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
