import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import logger from "@/lib/logger";
import { proxyRequestFor } from "@/lib/voteGeo";
import { notify } from "@/lib/notify";
import { officerRecipients } from "@/lib/notify/audience";
import { officerTemplateFor } from "@/lib/notify/templates";

/**
 * Tell E-Council a proxy request just landed.
 *
 * Straight away, and by push, because this one has a deadline attached that
 * nothing else in the app does: a proxy can only be decided while the vote is
 * still closed. An officer who reads it the next morning reads it too late.
 *
 * Never allowed to fail the request. The member's ask is recorded either way,
 * and a push that didn't get through is not a reason to tell them it didn't
 * work.
 */
async function announceProxyRequest(opts: {
  vote: any;
  requester: any;
  reason: string;
}): Promise<void> {
  try {
    const officers = await officerRecipients();
    const name = `${opts.requester.fName ?? ""} ${opts.requester.lName ?? ""}`.trim() || "A member";
    const voteName =
      opts.vote.type === "Election" && opts.vote.title ? opts.vote.title : `${opts.vote.type} vote`;

    const title = "Proxy vote requested";
    const body = opts.reason
      ? `${name} asked to vote by proxy on the ${voteName}: ${opts.reason}`
      : `${name} asked to vote by proxy on the ${voteName}.`;

    await Promise.all(
      officers.map((recipient) =>
        notify({
          recipient,
          template: officerTemplateFor("proxy_requested"),
          context: { firstName: recipient.firstName, amountCents: 0 },
          message: {
            title,
            body,
            // Kept short: iOS truncates, and a request that ends mid-name is
            // worse than one that never mentioned it.
            push: `${name} wants to vote by proxy on the ${voteName}.`,
            emailSubject: `${title}: ${name}`,
            link: "/member/vote",
            category: "general",
            // The generic label for this link is "Open the vote", which is
            // true but passive. An officer reading this has a decision to
            // make, so the button says so.
            ctaLabel: "Review the request",
          },
          amountCents: null,
          // The one notification in this app with a hard deadline attached: a
          // proxy can only be decided while the vote is still closed, and the
          // window is often the few minutes before chapter starts. An officer
          // whose phone is on Do Not Disturb during a meeting is exactly the
          // person who needs to see it, and exactly the person a normal push
          // would not reach.
          timeSensitive: true,
          // Nothing here touches anybody's ledger, so nothing belongs on a
          // financial timeline.
          audit: false,
        })
      )
    );
  } catch (err: any) {
    logger.warn({ err }, "Could not announce proxy request");
  }
}

/**
 * Proxy voting, as a request that somebody has to grant.
 *
 * A proxy ballot is cast before the vote opens, by a member who will not be in
 * the room. Left as a self-service switch it is indistinguishable from someone
 * voting early from their apartment and ticking the box that excuses it, which
 * is exactly what the location record exists to catch. So the chapter agrees
 * to it in advance: the member asks, E-Council answers, and only an approved
 * request unlocks the early ballot.
 */

async function requireMember(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) throw new Error("Not authorized");
  return { member, clerkId };
}

/** Regent, Vice Regent and Scribe run votes; admins cover for them. */
function canDecide(member: any): boolean {
  if (member.role === "admin" || member.role === "superadmin") return true;
  const position = (member.ecouncilPosition || "").toLowerCase();
  return position.includes("regent") || position.includes("scribe");
}

// POST: ask to vote by proxy
export async function POST(req: Request) {
  try {
    const { member, clerkId } = await requireMember(req);
    const { voteId, reason } = await req.json();

    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }

    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    // A proxy exists to cover an absence from a vote that has not happened
    // yet. Once the room is voting, the member is either there or not.
    if (vote.started || vote.ended) {
      return NextResponse.json(
        { error: "This vote is already under way. Proxies have to be arranged before it opens." },
        { status: 400 }
      );
    }

    const existing = proxyRequestFor(vote, clerkId);
    if (existing && existing.status !== "denied") {
      return NextResponse.json(
        {
          error:
            existing.status === "approved"
              ? "You have already been approved to vote by proxy."
              : "You already have a proxy request waiting.",
        },
        { status: 400 }
      );
    }

    const trimmedReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";

    if (existing) {
      // A denial can be appealed with a better reason rather than leaving the
      // member with no route back.
      existing.status = "pending";
      existing.reason = trimmedReason;
      existing.requestedAt = new Date();
      existing.decidedAt = undefined;
      existing.decidedBy = undefined;
      existing.decisionNote = undefined;
    } else {
      vote.proxyRequests.push({
        clerkId,
        reason: trimmedReason,
        status: "pending",
        requestedAt: new Date(),
      });
    }

    await vote.save();

    // Fire and forget from the member's point of view: the request is saved,
    // and the push is a courtesy on top of it.
    await announceProxyRequest({ vote, requester: member, reason: trimmedReason });

    return NextResponse.json({ success: true, status: "pending" }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to submit proxy request");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// GET: your own standing, or the whole queue if you're the one deciding
export async function GET(req: Request) {
  try {
    const { member, clerkId } = await requireMember(req);
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get("voteId");

    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }

    const vote = await Vote.findById(voteId).lean();
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    const own = proxyRequestFor(vote, clerkId);

    if (!canDecide(member)) {
      return NextResponse.json({
        canDecide: false,
        own: own
          ? {
              status: own.status,
              reason: own.reason || null,
              decisionNote: own.decisionNote || null,
              requestedAt: own.requestedAt || null,
            }
          : null,
        requests: [],
      });
    }

    // Names are attached here on purpose. A proxy request is not a ballot —
    // it is an administrative decision about a named person, and the officer
    // deciding it has to know who they are agreeing to. The anonymity the
    // bylaws require is over the *ballot*, which is stored somewhere else
    // entirely and never joined back to this.
    const requests = vote.proxyRequests || [];
    const members = await Member.find({
      clerkId: { $in: requests.map((r: any) => r.clerkId) },
    })
      .select("clerkId fName lName rollNo")
      .lean();
    const byClerkId = new Map(members.map((m: any) => [m.clerkId, m]));

    return NextResponse.json({
      canDecide: true,
      own: own ? { status: own.status, reason: own.reason || null } : null,
      requests: requests
        .map((r: any) => {
          const m: any = byClerkId.get(r.clerkId);
          return {
            clerkId: r.clerkId,
            name: m ? `${m.fName} ${m.lName}` : "Unknown member",
            rollNo: m?.rollNo || "",
            reason: r.reason || null,
            status: r.status,
            requestedAt: r.requestedAt || null,
            decidedAt: r.decidedAt || null,
            decisionNote: r.decisionNote || null,
          };
        })
        // Pending first: that is the only part of this list anyone has to act on.
        .sort((a: any, b: any) => {
          if (a.status === b.status) return a.name.localeCompare(b.name);
          if (a.status === "pending") return -1;
          if (b.status === "pending") return 1;
          return a.status.localeCompare(b.status);
        }),
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to list proxy requests");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// DELETE: take back your own request
//
// Only while it is still pending, and only your own. An approved proxy has
// already unlocked the ballot, and a denied one is a decision somebody made —
// neither is the requester's to erase. Asking again after a denial is what
// POST is for.
export async function DELETE(req: Request) {
  try {
    const { clerkId } = await requireMember(req);
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get("voteId");

    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }

    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    const existing = proxyRequestFor(vote, clerkId);
    if (!existing) {
      return NextResponse.json({ error: "You have no proxy request on this vote" }, { status: 404 });
    }

    if (existing.status !== "pending") {
      return NextResponse.json(
        {
          error:
            existing.status === "approved"
              ? "Your proxy has already been approved. Speak to E-Council to give it up."
              : "That request has already been decided.",
        },
        { status: 400 }
      );
    }

    vote.proxyRequests = vote.proxyRequests.filter((r: any) => r.clerkId !== clerkId);
    await vote.save();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to withdraw proxy request");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// PATCH: approve or deny one request
export async function PATCH(req: Request) {
  try {
    const { member, clerkId } = await requireMember(req);
    if (!canDecide(member)) {
      return NextResponse.json(
        { error: "Only the Regent, Vice Regent or Scribe can decide proxy requests." },
        { status: 403 }
      );
    }

    const { voteId, clerkId: subjectId, decision, note } = await req.json();

    if (!voteId || !subjectId || !["approved", "denied"].includes(decision)) {
      return NextResponse.json(
        { error: "voteId, clerkId and a decision of approved or denied are required" },
        { status: 400 }
      );
    }

    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    const request = proxyRequestFor(vote, subjectId);
    if (!request) {
      return NextResponse.json({ error: "No proxy request from that member" }, { status: 404 });
    }

    // Revoking an approval after the ballot is in would leave a counted vote
    // whose proxy marking no longer matches the record. Decisions are final
    // once the vote opens.
    if (vote.started || vote.ended) {
      return NextResponse.json(
        { error: "This vote has already opened. Proxy decisions are closed." },
        { status: 400 }
      );
    }

    request.status = decision;
    request.decidedAt = new Date();
    request.decidedBy = clerkId;
    request.decisionNote = typeof note === "string" ? note.trim().slice(0, 300) : undefined;

    await vote.save();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to decide proxy request");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
