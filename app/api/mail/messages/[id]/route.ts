// app/api/mail/messages/[id]/route.ts
// One message in the signed-in member's mailbox, and the conversation it is in.
//
// Every lookup is by (_id, accountId). A message that exists but belongs to
// somebody else is indistinguishable from one that doesn't exist: both 404.
import { NextRequest, NextResponse } from "next/server";
import MailMessage from "@/lib/models/MailMessage";
import MailLabel from "@/lib/models/MailLabel";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { toDetail } from "@/lib/mail/serialize";
import { presignMailGet } from "@/lib/mail/storage";
import { copyAttachments } from "@/lib/mail/ingest";
import { resolveMailPeople } from "@/lib/mail/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/// Inline images reference their attachment by Content-ID. The message is
/// rendered in a sandboxed frame that can't send our session cookie, so each
/// one is swapped for a short-lived signed URL here instead.
async function withInlineImages(detail: ReturnType<typeof toDetail>, raw: any) {
  // A picture the webhook hadn't copied out of Resend yet would show as a
  // broken box. Copy it now, while the member is waiting on this message.
  const uncopied = (raw.attachments ?? []).some(
    (a: any) => a.contentId && !a.storageKey && a.state !== "failed" && detail.html.includes(`cid:${a.contentId}`)
  );
  if (uncopied && raw.resendEmailId) {
    await copyAttachments(raw.resendEmailId).catch(() => undefined);
    const refreshed = await MailMessage.findById(raw._id).select("attachments").lean<any>();
    if (refreshed) raw = { ...raw, attachments: refreshed.attachments };
  }
  const inline = (raw.attachments ?? []).filter((a: any) => a.contentId && a.storageKey);
  if (!inline.length || !detail.html) return { ...detail, inlineImageUrls: [] as string[] };
  let html = detail.html;
  const inlineImageUrls: string[] = [];
  for (const a of inline) {
    try {
      const url = await presignMailGet(a.storageKey, { filename: a.filename, inline: true, expiresIn: 3600 });
      html = html.split(`cid:${a.contentId}`).join(url);
      inlineImageUrls.push(url);
    } catch {
      /* leave the broken image; the attachment is still listed */
    }
  }
  // Listed so the viewer can tell the message's own pictures, which are safe
  // to show, from remote images, which are hidden until asked for.
  return { ...detail, html, inlineImageUrls };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const message = await MailMessage.findOne({ _id: params.id, accountId: account._id }).lean<any>();
    if (!message) return notFound();

    const thread = await MailMessage.find({
      accountId: account._id,
      threadId: message.threadId,
      folder: { $nin: ["drafts"] },
    })
      .sort({ date: 1 })
      .limit(50)
      .lean<any[]>();

    const detailed = await Promise.all(
      (thread.length ? thread : [message]).map((m) => withInlineImages(toDetail(m), m))
    );
    const quotedId = message.folder === "drafts" ? message.replyToId ?? message.forwardOfId : null;
    const quotedRaw = quotedId
      ? await MailMessage.findOne({ _id: quotedId, accountId: account._id }).lean<any>()
      : null;
    const quoted = quotedRaw ? await withInlineImages(toDetail(quotedRaw), quotedRaw) : null;
    // Chapter members and committees behind every address in the conversation,
    // for photos and names in the viewer.
    const people = await resolveMailPeople(
      [...detailed, ...(quoted ? [quoted] : [])].flatMap((m) => [m.from, ...(m.to ?? []), ...(m.cc ?? [])])
    );
    return NextResponse.json({
      message: detailed.find((m) => m.id === params.id) ?? detailed[0],
      thread: detailed,
      people,
      quoted,
    });
  } catch (err) {
    return mailErrorResponse(err);
  }
}

/// Read, star, label or move. `thread: true` applies it to the whole
/// conversation, which is what archive and trash mean from the list.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const message = await MailMessage.findOne({ _id: params.id, accountId: account._id })
      .select("threadId folder direction")
      .lean<any>();
    if (!message) return notFound();

    const body = await req.json().catch(() => ({}));
    const set: Record<string, any> = {};
    if (typeof body.read === "boolean") set.read = body.read;
    if (typeof body.starred === "boolean") set.starred = body.starred;

    // Labels are ids of this mailbox's own labels. Anything else is dropped.
    const own = async (value: any) => {
      const ids = (Array.isArray(value) ? value : []).map(String).filter(isObjectId).slice(0, 50);
      if (!ids.length) return [] as string[];
      const found = await MailLabel.find({ _id: { $in: ids }, accountId: account._id }).select("_id").lean<any[]>();
      return found.map((l) => String(l._id));
    };
    const addLabels = await own(body.addLabels);
    const removeLabels = await own(body.removeLabels);

    let folder: string | undefined;
    if (body.folder !== undefined) {
      // Sent and drafts are where mail is, not where it can be moved to.
      const movable = ["inbox", "archive", "junk", "trash"];
      if (!movable.includes(body.folder)) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
      if (message.folder === "drafts" && body.folder !== "trash") {
        return NextResponse.json({ error: "Drafts can only be moved to trash" }, { status: 400 });
      }
      folder = body.folder;
    }
    if (!Object.keys(set).length && !folder && !addLabels.length && !removeLabels.length) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }

    const scope: any = body.thread
      ? { accountId: account._id, threadId: message.threadId, folder: { $ne: "drafts" } }
      : { accountId: account._id, _id: message._id };

    if (Object.keys(set).length) await MailMessage.updateMany(scope, { $set: set });
    if (addLabels.length) await MailMessage.updateMany(scope, { $addToSet: { labels: { $each: addLabels } } });
    if (removeLabels.length) await MailMessage.updateMany(scope, { $pull: { labels: { $in: removeLabels } } });

    if (folder) {
      // What you received moves. What you sent lives in Sent: archiving or
      // junking a conversation leaves it there, trashing takes it along, and
      // moving back to the inbox brings it home to Sent.
      await MailMessage.updateMany({ ...scope, direction: "in", folder: { $ne: "drafts" } }, { $set: { folder } });
      if (folder === "trash") {
        await MailMessage.updateMany({ ...scope, direction: "out", folder: { $ne: "drafts" } }, { $set: { folder: "trash" } });
      } else if (folder === "inbox") {
        await MailMessage.updateMany(
          { ...scope, direction: "out", folder: { $in: ["archive", "junk", "trash"] } },
          { $set: { folder: "sent" } }
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mailErrorResponse(err);
  }
}

/// Moves to trash, or deletes for good if it is already there.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const message = await MailMessage.findOne({ _id: params.id, accountId: account._id }).select("folder").lean<any>();
    if (!message) return notFound();
    if (message.folder === "trash" || message.folder === "drafts") {
      await MailMessage.deleteOne({ _id: params.id, accountId: account._id });
      return NextResponse.json({ ok: true, deleted: true });
    }
    await MailMessage.updateOne({ _id: params.id, accountId: account._id }, { $set: { folder: "trash" } });
    return NextResponse.json({ ok: true, deleted: false });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
