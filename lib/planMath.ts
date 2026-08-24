// lib/planMath.ts
// The payment-plan calculator, and nothing else.
//
// Separate from `lib/plans.ts` on purpose: the request screen has to draw the
// schedule live as the member moves the installment count, and it must draw
// exactly the schedule the server will build. Importing the server module into
// a browser bundle would drag mongoose and every model behind it, so the shared
// arithmetic lives here with no imports at all — one implementation, both
// sides.

/// Below this the reminder overhead costs more than the money.
export const MIN_INSTALLMENT_CENTS = 2500;
export const MIN_INSTALLMENTS = 2;
/// Eight months covers a semester plus the summer, which is as far out as a
/// chapter should carry a debt.
export const MAX_INSTALLMENTS = 8;

/// How many installments this balance can actually be split into.
///
/// The two rules interact rather than stacking: the $25 floor caps the count on
/// small balances and the 8-month ceiling caps it on large ones. Returning the
/// number rather than validating after the fact is what lets the request screen
/// grey out the impossible options instead of rejecting a choice the member has
/// already made.
///
/// Returns 0 when no plan is possible at all — under $50 there is nothing to
/// split.
export function maxInstallmentsFor(totalCents: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  const affordable = Math.floor(Math.round(totalCents) / MIN_INSTALLMENT_CENTS);
  const capped = Math.min(MAX_INSTALLMENTS, affordable);
  return capped >= MIN_INSTALLMENTS ? capped : 0;
}

export function planIsPossible(totalCents: number): boolean {
  return maxInstallmentsFor(totalCents) >= MIN_INSTALLMENTS;
}

/// "Evenly split" surviving integer cents.
///
/// base = floor(total / n), then the remainder goes one cent at a time onto the
/// earliest installments. Front-loading the stray cent means the final payment is
/// never the odd one out, and the schedule always sums to the penny — which
/// matters, because a plan that lands a cent short leaves a member with an
/// unpayable balance and no way to close it.
export function splitEvenly(totalCents: number, count: number): number[] {
  const total = Math.round(totalCents);
  if (!Number.isInteger(count) || count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base
  );
}

/// A calendar day as this project stores one: UTC midnight of the day meant.
export function toCalendarDay(
  value: Date | string | null | undefined
): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) return new Date(`${dateOnly[0]}T00:00:00.000Z`);
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/// Adds whole months to a calendar day, clamping the overflow.
///
/// A plan anchored on the 31st has to mean something in February. Clamping to
/// the last day of the target month is what every bank does and the only
/// behaviour a member won't be surprised by. The clamp doesn't stick — month
/// two of a Jan 31 plan is back on Mar 31.
export function addMonthsUtc(day: Date, months: number): Date {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const dayOfMonth = day.getUTCDate();
  const lastOfTarget = new Date(Date.UTC(year, month + months + 1, 0));
  return new Date(
    Date.UTC(
      lastOfTarget.getUTCFullYear(),
      lastOfTarget.getUTCMonth(),
      Math.min(dayOfMonth, lastOfTarget.getUTCDate())
    )
  );
}

export interface ScheduledInstallment {
  seq: number;
  dueDate: Date;
  amountCents: number;
}

/// The schedule a proposal produces: first installment on the charge's own due
/// date, then monthly.
///
/// Anchoring on the original due date rather than on today makes the schedule
/// deterministic — the member sees the exact dates at proposal time, and they
/// don't shift because an officer took four days to look at the queue.
export function buildSchedule(
  totalCents: number,
  count: number,
  anchorDueDate: Date | string | null | undefined
): ScheduledInstallment[] {
  const anchor = toCalendarDay(anchorDueDate) ?? toCalendarDay(new Date());
  if (!anchor) return [];
  return splitEvenly(totalCents, count).map((amountCents, index) => ({
    seq: index + 1,
    dueDate: addMonthsUtc(anchor, index),
    amountCents,
  }));
}
