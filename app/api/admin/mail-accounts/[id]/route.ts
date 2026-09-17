// app/api/admin/mail-accounts/[id]/route.ts
// What an admin can do to a chapter mailbox after it was handed out.
//
//   pause    → no access, no delivery. Address and mail kept. Resumes as it was.
//   revoke   → the same, but the member is told it was closed, not paused.
//   resume   → back to active, from either of those.
//   reassign → the address and everything in it move to another member.
//   DELETE   → the mailbox, its messages and their attachments, for good. The
//              address becomes free to request again.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import MailAccount from "@/lib/models/MailAccount";
import MailMessage from "@/lib/models/MailMessage";
import Member from "@/lib/models/Member";
import { ELIGIBLE_STATUSES, isObjectId } from "@/lib/mail/session";
import { deleteMailObjects, storageConfigured } from "@/lib/mail/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGED = ["active", "suspended", "revoked"];

async function authorize(req: NextRequest) {
  await connectDB();
  return requireRole(req, ["superadmin", "admin"]);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let admin: any;
  try {
    admin = await authorize(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }
  if (!isObjectId(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const note = String(body?.note || "").trim().slice(0, 500);

  try {
    const account = await MailAccount.findOne({ _id: params.id, status: { $in: MANAGED } });
    if (!account) return NextResponse.json({ error: "That mailbox no longer exists." }, { status: 404 });

    const stamp = () => {
      account.statusChangedBy = admin.clerkId;
      account.statusChangedAt = new Date();
      account.statusNote = note;
    };

    if (action === "pause") {
      if (account.status !== "active") {
        return NextResponse.json({ error: "Only an active mailbox can be paused." }, { status: 409 });
      }
      account.status = "suspended";
      account.pausedByAdmin = true;
      stamp();
    } else if (action === "revoke") {
      if (account.status === "revoked") {
        return NextResponse.json({ error: "This mailbox is already revoked." }, { status: 409 });
      }
      account.status = "revoked";
      account.pausedByAdmin = false;
      stamp();
    } else if (action === "resume") {
      if (account.status === "active") {
        return NextResponse.json({ error: "This mailbox is already active." }, { status: 409 });
      }
      const owner = await Member.findById(account.memberId).select("status").lean<any>();
      if (!owner || !ELIGIBLE_STATUSES.includes(owner.status)) {
        return NextResponse.json(
          { error: `Members marked ${owner?.status ?? "missing"} can't have an active mailbox. Reassign it instead.` },
          { status: 400 }
        );
      }
      account.status = "active";
      account.pausedByAdmin = false;
      stamp();
    } else if (action === "reassign" && account.kind === "role") {
      return NextResponse.json(
        { error: "A committee mailbox belongs to whoever heads the committee. Change the committee head to move it." },
        { status: 400 }
      );
    } else if (action === "reassign") {
      const rollNo = String(body?.rollNo || "").trim();
      const target = await Member.findOne({ rollNo }).select("_id fName lName status rollNo").lean<any>();
      if (!target) return NextResponse.json({ error: "That member wasn't found." }, { status: 404 });
      if (String(target._id) === String(account.memberId)) {
        return NextResponse.json({ error: "This mailbox already belongs to them." }, { status: 400 });
      }
      if (!ELIGIBLE_STATUSES.includes(target.status)) {
        return NextResponse.json(
          { error: `Members marked ${target.status} can't have a chapter mailbox.` },
          { status: 400 }
        );
      }
      const theirs = await MailAccount.findOne({ memberId: target._id, kind: { $ne: "role" } }).lean<any>();
      if (theirs && MANAGED.includes(theirs.status)) {
        return NextResponse.json(
          { error: `${target.fName} already has ${theirs.address}. Delete or reassign that one first.` },
          { status: 409 }
        );
      }
      // A request of theirs still in review, or a denied one, would hold the
      // one-mailbox-per-member index. Handing them a real mailbox supersedes it.
      if (theirs) await MailAccount.deleteOne({ _id: theirs._id });

      account.memberId = target._id;
      account.displayName = `${target.fName} ${target.lName}`.trim();
      stamp();
      logger.info(
        { accountId: String(account._id), address: account.address, to: target.rollNo, by: admin.clerkId },
        "Chapter mailbox reassigned"
      );
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await account.save();
    logger.info(
      { accountId: String(account._id), address: account.address, action, by: admin.clerkId },
      "Chapter mailbox updated by admin"
    );
    return NextResponse.json({ ok: true, status: account.status });
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "That member already has a mailbox." }, { status: 409 });
    }
    logger.error({ err, accountId: params.id, action }, "Failed to update chapter mailbox");
    return NextResponse.json({ error: "Couldn't update that mailbox." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let admin: any;
  try {
    admin = await authorize(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }
  if (!isObjectId(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const account = await MailAccount.findOne({ _id: params.id, status: { $in: MANAGED } }).lean<any>();
    if (!account) return NextResponse.json({ error: "That mailbox no longer exists." }, { status: 404 });
    if (account.kind === "role" && account.statusNote !== "Committee deleted") {
      return NextResponse.json(
        { error: "This committee still exists, so its mailbox would come straight back. Pause or revoke it instead." },
        { status: 400 }
      );
    }

    // Stop delivery before anything else goes, so nothing lands in a mailbox
    // that is halfway through being removed.
    await MailAccount.updateOne({ _id: account._id }, { $set: { status: "revoked" } });

    const messages = await MailMessage.find({ accountId: account._id })
      .select("attachments.storageKey")
      .lean<any[]>();
    const keys = messages.flatMap((m) => (m.attachments ?? []).map((a: any) => a.storageKey));

    let storageFailures = 0;
    if (keys.length && storageConfigured()) {
      try {
        storageFailures = await deleteMailObjects(keys);
      } catch (err: any) {
        storageFailures = keys.length;
        logger.warn({ err, accountId: String(account._id) }, "Couldn't remove mailbox attachments");
      }
    }

    const { deletedCount } = await MailMessage.deleteMany({ accountId: account._id });
    await MailAccount.deleteOne({ _id: account._id });

    logger.info(
      {
        address: account.address,
        messages: deletedCount,
        attachments: keys.length,
        storageFailures,
        by: admin.clerkId,
      },
      "Chapter mailbox deleted"
    );
    return NextResponse.json({ ok: true, messagesDeleted: deletedCount, storageFailures });
  } catch (err: any) {
    logger.error({ err, accountId: params.id }, "Failed to delete chapter mailbox");
    return NextResponse.json({ error: "Couldn't delete that mailbox." }, { status: 500 });
  }
}
