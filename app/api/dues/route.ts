// app/api/dues/route.ts
// Treasurer-facing ledger: list every charge, or raise new ones. Members read
// their own balance from /api/dues/me instead.
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import mongoose from "mongoose";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge from "@/lib/models/DuesCharge";
import { getDefaultSemesterRange } from "@/lib/gem";
import {
  normalizeDueDate,
  readAmountCents,
  serializeCharge,
} from "@/lib/dues";
import { requireTreasury } from "@/lib/duesAuth";
import { loadDuesRoster, loadMemberLedger } from "@/lib/duesRead";
import { balanceCentsFor } from "@/lib/models/DuesCharge";
import { applyCreditToOpenCharges, creditBalancesFor } from "@/lib/credit";
import { formatCents, recordFinanceEvents } from "@/lib/financeEvents";
import { notifyMany } from "@/lib/notify";
import { announceBulk } from "@/lib/notify/announce";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { phoenixDayLabel } from "@/lib/notify/selector";
import logger from "@/lib/logger";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let viewer;
  try {
    viewer = await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const filter: any = {};

    const memberIdParam = searchParams.get("memberId");
    const rollNoParam = searchParams.get("rollNo");
    if (memberIdParam) {
      if (!mongoose.Types.ObjectId.isValid(memberIdParam)) {
        return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
      }
      filter.memberId = memberIdParam;
    } else if (rollNoParam) {
      const target = await Member.findOne({ rollNo: rollNoParam }).select("_id").lean<any>();
      if (!target) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
      filter.memberId = target._id;
    }

    const term = searchParams.get("term");
    if (term) filter.term = term;
    const status = searchParams.get("status");
    if (status) filter.status = status;

    const charges = await DuesCharge.find(filter).sort({ createdAt: -1 }).lean();

    // "Who owes what" is a per-member question, but the ledger is stored
    // per-charge. The roster view answers it directly so the treasurer's main
    // screen isn't sixty rows of line items to mentally group.
    if (searchParams.get("view") === "roster") {
      // The roster arithmetic lives in `lib/duesRead.ts`, shared with the MCP
      // server so a treasurer's numbers agree on both sides.
      return NextResponse.json(await loadDuesRoster(charges as any[]), {
        status: 200,
      });
    }

    // A single-member query is really "show me this person's ledger", so hand
    // back the same summary shape /api/dues/me returns.
    if (filter.memberId) {
      return NextResponse.json(
        await loadMemberLedger(filter.memberId, {
          ...(filter.term ? { term: filter.term } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        }),
        { status: 200 }
      );
    }

    // The treasurer's list is read as "who owes what", so every row carries the
    // member it belongs to. One extra query for the whole page beats a populate
    // per charge.
    const memberIds = Array.from(
      new Set(charges.map((charge: any) => charge.memberId?.toString()).filter(Boolean))
    );
    const members = await Member.find({ _id: { $in: memberIds } })
      .select("rollNo fName lName")
      .lean<any[]>();
    const memberById = new Map(
      members.map((member) => [member._id.toString(), member])
    );

    const rows = charges.map((charge: any) => {
      const member = memberById.get(charge.memberId?.toString());
      return {
        ...serializeCharge(charge),
        member: member
          ? { rollNo: member.rollNo, fName: member.fName, lName: member.lName }
          : null,
      };
    });

    return NextResponse.json(
      {
        charges: rows,
        totals: {
          currency: "USD",
          outstandingCents: rows.reduce(
            (sum, row) => sum + row.balanceCents,
            0
          ),
          collectedCents: rows.reduce((sum, row) => sum + row.paidCents, 0),
          memberCount: memberIds.length,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to list dues charges");
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request) {
  let viewer;
  try {
    viewer = await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    const body = await req.json();
    const amountCents = readAmountCents(body);
    if (amountCents === null || amountCents < 0) {
      return NextResponse.json(
        { error: "amountCents (or amount, in dollars) is required" },
        { status: 400 }
      );
    }

    // Either one member, or every active member at once — issuing semester
    // dues one row at a time is exactly the chore this should absorb.
    let targets: any[] = [];
    if (body?.allActive) {
      targets = await Member.find({ status: "Active" }).select("_id").lean();
    } else {
      const rollNos: string[] = Array.isArray(body?.rollNos)
        ? body.rollNos.map((value: any) => String(value).trim()).filter(Boolean)
        : body?.rollNo
        ? [String(body.rollNo).trim()]
        : [];
      if (rollNos.length) {
        targets = await Member.find({ rollNo: { $in: rollNos } }).select("_id").lean();
        if (targets.length !== rollNos.length) {
          return NextResponse.json(
            { error: "One or more roll numbers didn't match a member" },
            { status: 404 }
          );
        }
      } else if (body?.memberId) {
        if (!mongoose.Types.ObjectId.isValid(body.memberId)) {
          return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
        }
        const target = await Member.findById(body.memberId).select("_id").lean<any>();
        if (!target) {
          return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }
        targets = [target];
      }
    }

    if (!targets.length) {
      return NextResponse.json(
        { error: "Provide memberId, rollNo, rollNos, or allActive" },
        { status: 400 }
      );
    }

    const term = String(body?.term || "").trim() || getDefaultSemesterRange().name;
    const category = body?.category || "dues";
    const description =
      String(body?.description || "").trim() || "Chapter dues";

    // Stored as the calendar day chosen, not the instant it was submitted —
    // "due Sept 1" has to mean the same thing regardless of who set it or from
    // what timezone.
    const dueDate = body?.dueDate ? normalizeDueDate(body.dueDate) : null;
    if (body?.dueDate && !dueDate) {
      return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
    }
    // Reminders, overdue status, and the window for proposing a payment plan
    // are all functions of the due date. A dues charge without one is
    // invisible to every one of them.
    if (!dueDate && category === "dues") {
      return NextResponse.json(
        { error: "dueDate is required for dues charges" },
        { status: 400 }
      );
    }

    // Raising the same charge twice is the expensive mistake here: one stray
    // second click on "assign to everyone" silently doubles the whole
    // chapter's balance. Refuse by default, and make the caller say so
    // explicitly if they really did mean to charge someone twice.
    if (!body?.allowDuplicates) {
      const existing = await DuesCharge.find({
        memberId: { $in: targets.map((target) => target._id) },
        term,
        category,
        description,
        status: "open",
      })
        .select("memberId")
        .lean<any[]>();

      if (existing.length) {
        const clashIds = new Set(
          existing.map((charge) => charge.memberId?.toString())
        );
        const clashing = await Member.find({
          _id: { $in: Array.from(clashIds) },
        })
          .select("rollNo fName lName")
          .lean<any[]>();
        return NextResponse.json(
          {
            error: `${clashing.length} member(s) already have an open "${description}" charge for ${term}`,
            duplicates: clashing.map((member) => ({
              rollNo: member.rollNo,
              name: `${member.fName} ${member.lName}`,
            })),
            hint: "Re-send with allowDuplicates: true to charge them anyway",
          },
          { status: 409 }
        );
      }
    }

    // One id across everything raised by this click, so a batch can be
    // reviewed — or undone — as the single action it was.
    const batchId = randomUUID();

    const created = await DuesCharge.insertMany(
      targets.map((target) => ({
        memberId: target._id,
        term,
        description,
        category,
        amountCents,
        dueDate,
        notes: String(body?.notes || ""),
        createdBy: viewer._id,
        batchId,
      }))
    );

    await recordFinanceEvents(
      created.map((charge: any) => ({
        memberId: charge.memberId,
        actorId: viewer._id,
        type: "charge_assigned" as const,
        amountCents: charge.amountCents,
        summary: dueDate
          ? `Assigned ${formatCents(charge.amountCents)} for ${description}, due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" })}`
          : `Assigned ${formatCents(charge.amountCents)} for ${description}`,
        refs: { chargeId: charge._id },
        meta: { term, category, batchId },
      }))
    );

    // Anyone the chapter already owes gets that taken off the new charge
    // before they're ever asked for a dollar. Balances are checked in one
    // batch first, because on an "assign to everyone" run this would otherwise
    // be two aggregations per member to discover that almost none of them
    // have credit.
    const creditHolders = await creditBalancesFor(
      created.map((charge: any) => charge.memberId)
    );
    let creditAppliedCents = 0;
    for (const [memberId, balance] of creditHolders) {
      if (balance <= 0) continue;
      const application = await applyCreditToOpenCharges(memberId, viewer._id);
      creditAppliedCents += application.appliedCents;
    }

    // Re-read anything credit just touched so the response carries the real
    // balance rather than the one from a moment ago.
    const finalCharges = creditAppliedCents > 0
      ? await DuesCharge.find({
          _id: { $in: created.map((charge: any) => charge._id) },
        }).lean()
      : created.map((charge: any) => charge.toObject());

    // Tell them it landed — but only the people who actually owe something
    // afterwards. Somebody whose credit swallowed the whole charge should not
    // get a notification asking for money they don't owe.
    let notified = 0;
    try {
      const stillOwing = (finalCharges as any[]).filter(
        (charge) => balanceCentsFor(charge) > 0
      );
      if (stillOwing.length) {
        const owners = await Member.find({
          _id: { $in: stillOwing.map((charge) => charge.memberId) },
        })
          .select("_id rollNo fName lName email")
          .lean<any[]>();
        await ensureMemberEmails(owners.map((member) => member._id));
        const fresh = await Member.find({ _id: { $in: owners.map((m) => m._id) } })
          .select("_id rollNo fName lName email")
          .lean<any[]>();
        const memberById = new Map(fresh.map((member) => [String(member._id), member]));

        const report = await notifyMany(
          stillOwing.flatMap((charge) => {
            const member = memberById.get(String(charge.memberId));
            if (!member) return [];
            return [
              {
                recipient: {
                  memberId: member._id,
                  firstName: member.fName ?? "",
                  lastName: member.lName ?? "",
                  rollNo: member.rollNo ?? "",
                  email: member.email ?? null,
                },
                template: "assigned" as const,
                context: {
                  firstName: member.fName ?? "",
                  amountCents: balanceCentsFor(charge),
                  dueLabel: phoenixDayLabel(charge.dueDate ? new Date(charge.dueDate) : null),
                  description,
                },
                amountCents: balanceCentsFor(charge),
                refs: { chargeId: charge._id },
                sentBy: viewer._id,
              },
            ];
          })
        );
        notified = report.sentCount;
      }
    } catch (err: any) {
      // Raising the charge is the thing that matters. A notification layer
      // having a bad night must not roll back sixty ledger rows.
      logger.warn({ err, batchId }, "Dues assigned, but the notices didn't all go out");
    }

    // One line for the officers, not one per member. Assigning dues to sixty
    // people is a single decision somebody made; fanning it out per member
    // would put hundreds of notifications on a handful of phones and the
    // feature would be muted by morning.
    await announceBulk({
      event: "charge_assigned",
      actorId: viewer._id,
      amountCents: amountCents * created.length,
      summary:
        `${formatCents(amountCents)} ${description} assigned to ${created.length} member${created.length === 1 ? "" : "s"}` +
        ` for ${term}` +
        (dueDate
          ? `, due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" })}`
          : "") +
        `, ${formatCents(amountCents * created.length)} in total`,
    });

    logger.info(
      { count: created.length, term, amountCents, batchId, creditAppliedCents, notified },
      "Dues charges created"
    );
    return NextResponse.json(
      {
        batchId,
        creditAppliedCents,
        notified,
        charges: finalCharges.map((charge: any) => serializeCharge(charge)),
      },
      { status: 201 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to create dues charges");
    return apiErrorResponse(err);
  }
}
