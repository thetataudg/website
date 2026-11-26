// lib/budgetNotify.ts
// Who hears about committee budget activity, and how.
//
//   - The Treasurer hears about anything a head files.
//   - A head hears about anything the treasury does to their committee.
//   - Big moments (decisions, payouts, thresholds) go to every channel;
//     routine movements (money moved in or out) are in-app only.
//
// Never throws: the change and its log row already exist by the time this
// runs, and a push failing must not turn a saved approval into an error.
// The wording reuses the log summary so the two can't disagree. No em dashes.
import logger from "@/lib/logger";
import Committee from "@/lib/models/Committee";
import { notify } from "@/lib/notify";
import { memberRecipient, treasuryRecipients } from "@/lib/notify/audience";
import type { RenderedMessage } from "@/lib/notify/templates";

export function headBudgetLink(committeeId: any) {
  return `/member/committees/${committeeId}/budget`;
}
export const TREASURER_BUDGET_LINK = "/member/admin/budgets";

function message(title: string, body: string, link: string, category: RenderedMessage["category"] = "reimbursement"): RenderedMessage {
  const push = body.length > 118 ? `${body.slice(0, 117)}…` : body;
  return { title, body, push, emailSubject: title, link, category };
}

interface Send {
  event: string;
  title: string;
  body: string;
  link: string;
  amountCents?: number | null;
  refs?: Record<string, any>;
  actorId?: any;
  /// In-app only: no push, no email.
  quiet?: boolean;
}

/// Set by `npm run check:budgets-db`, which drives these services against the
/// development database and must not push real officers' phones.
function disabled() {
  return process.env.BUDGET_NOTIFY_DISABLED === "1";
}

async function sendTo(recipients: any[], input: Send) {
  if (disabled()) return;
  for (const recipient of recipients) {
    if (!recipient) continue;
    try {
      await notify({
        recipient,
        template: `officer_budget_${input.event}`,
        context: {} as any,
        message: message(input.title, input.body, input.link),
        amountCents: input.amountCents ?? null,
        refs: input.refs ?? {},
        sentBy: input.actorId ?? null,
        channels: input.quiet ? [] : undefined,
        audit: false,
      });
    } catch (err: any) {
      logger.warn({ err, event: input.event }, "Budget notification failed");
    }
  }
}

export async function tellTreasurer(input: Send) {
  try {
    await sendTo(await treasuryRecipients(), { ...input, link: input.link || TREASURER_BUDGET_LINK });
  } catch (err: any) {
    logger.warn({ err, event: input.event }, "Budget notification to treasurer failed");
  }
}

/// The committee's current head, unless they are the one who acted.
export async function tellHead(committeeId: any, input: Send) {
  try {
    const committee = await Committee.findById(committeeId).select("committeeHeadId").lean<any>();
    const headId = committee?.committeeHeadId;
    if (!headId) return;
    if (input.actorId && String(input.actorId) === String(headId)) return;
    await sendTo([await memberRecipient(headId)], { ...input, link: input.link || headBudgetLink(committeeId) });
  } catch (err: any) {
    logger.warn({ err, event: input.event }, "Budget notification to head failed");
  }
}

/// One specific member: the person a claim pays.
export async function tellMember(memberId: any, input: Send) {
  try {
    if (input.actorId && String(input.actorId) === String(memberId)) return;
    await sendTo([await memberRecipient(memberId)], input);
  } catch (err: any) {
    logger.warn({ err, event: input.event }, "Budget notification to member failed");
  }
}
