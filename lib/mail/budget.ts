// lib/mail/budget.ts
// The daily send budget shared by every email the app sends.
//
// Resend's free plan allows 100 sends a day across the whole account. Member
// mail is the only kind a person can generate at will, so it is the kind that
// gets capped: once the day's total reaches MAIL_DAILY_BUDGET, member sends are
// refused and the remaining headroom is left for dues notices, approvals and
// the rest of the system mail, which are only ever counted, never refused.
import MailSendCounter from "@/lib/models/MailSendCounter";
import logger from "@/lib/logger";

export function dailyBudget(): number {
  const configured = Number(process.env.MAIL_DAILY_BUDGET);
  return Number.isFinite(configured) && configured > 0 ? configured : 70;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/// Claim `count` sends for member mail. False when that would cross the budget.
///
/// Atomic: the condition and the increment are one update, so two members
/// sending at the same instant can't both squeeze past the last slot.
export async function reserveMemberSends(count: number): Promise<boolean> {
  const date = today();
  await MailSendCounter.updateOne(
    { date },
    { $setOnInsert: { date, count: 0, memberCount: 0 } },
    { upsert: true }
  ).catch(() => undefined);
  const claimed = await MailSendCounter.findOneAndUpdate(
    { date, count: { $lte: dailyBudget() - count } },
    { $inc: { count, memberCount: count } },
    { new: true }
  );
  return Boolean(claimed);
}

/// Hand back a reservation whose send never happened.
export async function releaseMemberSends(count: number): Promise<void> {
  await MailSendCounter.updateOne(
    { date: today() },
    { $inc: { count: -count, memberCount: -count } }
  ).catch(() => undefined);
}

/// Record system mail. Never refuses and never throws: a dues notice matters
/// more than our tally of it.
export async function recordSystemSend(count = 1): Promise<void> {
  try {
    const date = today();
    await MailSendCounter.updateOne({ date }, { $inc: { count } }, { upsert: true });
  } catch (err) {
    logger.warn({ err }, "Could not record a system send against the daily budget");
  }
}

export async function sentToday(): Promise<{ count: number; budget: number }> {
  const row = await MailSendCounter.findOne({ date: today() }).lean<any>();
  return { count: row?.count ?? 0, budget: dailyBudget() };
}
