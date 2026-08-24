// lib/dues.ts
import { DateTime } from "luxon";
import { balanceCentsFor, paidCentsFor } from "@/lib/models/DuesCharge";
import { ARIZONA_ZONE } from "@/lib/recurrence";

export const DUES_CURRENCY = "USD";

/// A due date is a calendar day, not a moment. This turns one into the exact
/// instant it stops being "on time" for this chapter.
///
/// The subtlety is what calendar day the input *means*. A date picker sending
/// "2026-09-01" and JSON sending "2026-09-01T00:00:00.000Z" both mean the
/// first of September — but that timestamp is 5pm on August 31st in Phoenix,
/// so reading its local components would shift every deadline a day earlier.
/// The intended day is therefore always read in UTC, and only then anchored to
/// the end of that day in Arizona.
///
/// Applying the same reading on write and on read means legacy rows stored at
/// UTC midnight resolve correctly without a migration.
export function arizonaDueDeadline(
  value: Date | string | null | undefined
): Date | null {
  if (!value) return null;

  let year: number;
  let month: number;
  let day: number;

  const dateOnly =
    typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (dateOnly) {
    year = Number(dateOnly[1]);
    month = Number(dateOnly[2]);
    day = Number(dateOnly[3]);
  } else {
    const jsDate = typeof value === "string" ? new Date(value) : value;
    if (!(jsDate instanceof Date) || Number.isNaN(jsDate.getTime())) return null;
    year = jsDate.getUTCFullYear();
    month = jsDate.getUTCMonth() + 1;
    day = jsDate.getUTCDate();
  }

  const deadline = DateTime.fromObject(
    { year, month, day },
    { zone: ARIZONA_ZONE }
  ).endOf("day");
  return deadline.isValid ? deadline.toJSDate() : null;
}

/// True once the chapter's calendar day for this due date has fully passed.
export function isPastDueInArizona(
  dueDate: Date | string | null | undefined,
  now = new Date()
) {
  const deadline = arizonaDueDeadline(dueDate);
  return Boolean(deadline && now > deadline);
}

/// How a due date should be stored: UTC midnight of the calendar day chosen.
///
/// Storing the calendar date rather than the derived deadline keeps the value
/// idempotent — normalizing an already-normalized date returns it unchanged —
/// and matches the shape rows already have, so nothing needs migrating. The
/// deadline is `arizonaDueDeadline()`'s job, computed fresh on every read.
export function normalizeDueDate(
  value: Date | string | null | undefined
): Date | null {
  if (!value) return null;

  const dateOnly =
    typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (dateOnly) {
    return new Date(`${dateOnly[0]}T00:00:00.000Z`);
  }

  const jsDate = typeof value === "string" ? new Date(value) : value;
  if (!(jsDate instanceof Date) || Number.isNaN(jsDate.getTime())) return null;
  return new Date(
    Date.UTC(jsDate.getUTCFullYear(), jsDate.getUTCMonth(), jsDate.getUTCDate())
  );
}

export interface DuesChargeDTO {
  _id: string;
  memberId: string;
  term: string;
  description: string;
  category: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string | null;
  status: string;
  notes: string;
  isOverdue: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DuesSummaryDTO {
  currency: string;
  balanceCents: number;
  chargedCents: number;
  paidCents: number;
  /// Earliest unpaid due date, so a client can say "due Friday" without
  /// re-deriving it from the line items.
  nextDueDate: string | null;
  hasOverdue: boolean;
  charges: DuesChargeDTO[];
}

/// Flattens a lean DuesCharge document into the shape both the website and the
/// iOS app read. Virtuals don't survive `.lean()`, so the totals are recomputed
/// from the same helpers the schema uses.
///
/// `suppressOverdue` is for members who have already acted and are waiting on
/// the chapter — a payment claim or a plan proposal sitting in the approval
/// queue. They did their part on time, so nothing should mark them late while
/// an officer gets around to it.
export function serializeCharge(
  charge: any,
  now = new Date(),
  suppressOverdue = false
): DuesChargeDTO {
  const balanceCents = balanceCentsFor(charge);
  const dueDate = charge?.dueDate ? new Date(charge.dueDate) : null;
  return {
    _id: charge?._id?.toString?.() ?? "",
    memberId: charge?.memberId?.toString?.() ?? "",
    term: charge?.term ?? "",
    description: charge?.description ?? "",
    category: charge?.category ?? "dues",
    amountCents: Number(charge?.amountCents) || 0,
    paidCents: paidCentsFor(charge),
    balanceCents,
    dueDate: dueDate ? dueDate.toISOString() : null,
    status: charge?.status ?? "open",
    notes: charge?.notes ?? "",
    isOverdue:
      !suppressOverdue && balanceCents > 0 && isPastDueInArizona(dueDate, now),
    createdAt: charge?.createdAt ? new Date(charge.createdAt).toISOString() : null,
    updatedAt: charge?.updatedAt ? new Date(charge.updatedAt).toISOString() : null,
  };
}

export function summarize(
  charges: any[],
  now = new Date(),
  suppressOverdue = false
): DuesSummaryDTO {
  const serialized = charges
    .map((charge) => serializeCharge(charge, now, suppressOverdue))
    .sort((a, b) => {
      // Anything still owed floats to the top, then earliest due date first.
      if (a.balanceCents !== b.balanceCents) return b.balanceCents - a.balanceCents;
      const aDue = a.dueDate ? Date.parse(a.dueDate) : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? Date.parse(b.dueDate) : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

  const outstanding = serialized.filter((charge) => charge.balanceCents > 0);
  const nextDue = outstanding
    .filter((charge) => charge.dueDate)
    .map((charge) => Date.parse(charge.dueDate as string))
    .sort((a, b) => a - b)[0];

  return {
    currency: DUES_CURRENCY,
    balanceCents: serialized.reduce((sum, charge) => sum + charge.balanceCents, 0),
    chargedCents: serialized
      .filter((charge) => charge.status === "open")
      .reduce((sum, charge) => sum + charge.amountCents, 0),
    paidCents: serialized.reduce((sum, charge) => sum + charge.paidCents, 0),
    nextDueDate: nextDue ? new Date(nextDue).toISOString() : null,
    hasOverdue: outstanding.some((charge) => charge.isOverdue),
    charges: serialized,
  };
}

/// Accepts either `amountCents` or a dollar `amount`, so callers can post
/// whichever they have without either side guessing at rounding.
export function readAmountCents(source: any, centsKey = "amountCents", dollarKey = "amount") {
  if (source?.[centsKey] !== undefined && source?.[centsKey] !== null) {
    const cents = Number(source[centsKey]);
    return Number.isFinite(cents) ? Math.round(cents) : null;
  }
  if (source?.[dollarKey] !== undefined && source?.[dollarKey] !== null) {
    const dollars = Number(source[dollarKey]);
    return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
  }
  return null;
}
