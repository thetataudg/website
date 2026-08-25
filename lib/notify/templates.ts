// lib/notify/templates.ts
// Every message the treasury can send, and the three shapes each one takes.
//
// One template renders once into all three: a one-line in-app row, an email
// with the amount and a link, and a push body short enough that iOS won't cut
// it off mid-sentence. Writing them together is deliberate — three separate
// copies of "you owe $250" drift, and the member notices when the email and the
// notification disagree.
import { formatCents } from "@/lib/financeEvents";

/// Chased at somebody who hasn't acted. Subject to the 24-hour cooldown.
export const REMINDER_TEMPLATES = [
  "assigned",
  "upcoming",
  "due_soon",
  "due_today",
  "overdue",
  "installment_due",
] as const;

/// Direct answers to something the member did. These bypass the cooldown —
/// suppressing "your payment was verified" because they were reminded that
/// morning would be absurd, and none of them can arrive unprompted.
export const TRANSACTIONAL_TEMPLATES = [
  "payment_verified",
  "payment_rejected",
  "plan_approved",
  "plan_denied",
  "credit_paid_out",
  // Everything below answers something an officer did to a member's ledger.
  // They bypass the cooldown for the same reason the five above do: none of
  // them can arrive unprompted, and silencing "your claim was approved"
  // because the member was reminded that morning would be absurd.
  "reimbursement_approved",
  "reimbursement_denied",
  "reimbursement_received",
  "charge_amended",
  "charge_waived",
  "charge_voided",
  "payment_recorded",
  "payment_removed",
  "plan_cancelled",
  "plan_completed",
  "plan_defaulted",
  "installment_missed",
  "credit_applied",
] as const;

export type ReminderTemplate = (typeof REMINDER_TEMPLATES)[number];
export type TransactionalTemplate = (typeof TRANSACTIONAL_TEMPLATES)[number];
export type NotifyTemplate = ReminderTemplate | TransactionalTemplate;

export function isReminderTemplate(value: string): value is ReminderTemplate {
  return (REMINDER_TEMPLATES as readonly string[]).includes(value);
}

export interface TemplateContext {
  firstName: string;
  amountCents: number;
  /// Already formatted in Phoenix by the caller — templates never do timezone
  /// arithmetic, because "due today" is a calendar-day question answered once,
  /// upstream, rather than three times in three renderers.
  dueLabel?: string;
  daysOverdue?: number;
  description?: string;
  installmentSeq?: number;
  installmentCount?: number;
  reason?: string;
  method?: string;
  /// "$45 still owed." / "Your balance is settled." Composed by the caller,
  /// which is the only place that knows what the balance did.
  remainingLabel?: string;
  /// Who the ledger line belongs to, and who moved it. Officer notifications
  /// are about somebody else, so they need both; member templates ignore them.
  memberName?: string;
  actorName?: string;
}

export interface RenderedMessage {
  title: string;
  /// The in-app row and the email's opening line.
  body: string;
  /// Under 120 characters, because iOS truncates and a reminder that ends
  /// mid-number is worse than no reminder.
  push: string;
  emailSubject: string;
  link: string;
  category: "dues" | "reimbursement" | "plan" | "general";
  /// What the email's button says. Optional, and usually left unset: the
  /// wording is derived from `link` by `ctaLabelFor` so the button can never
  /// promise somewhere it does not go. Set it only when the action deserves
  /// its own verb, like a proxy request an officer has to decide.
  ctaLabel?: string;
}

/// What to write on the button, worked out from where the button lands.
///
/// This is derived rather than stored because the alternative was a literal
/// string sitting in the email channel, and that string said "Open your dues"
/// on every message the chapter sent. A proxy-vote request to an officer
/// arrived with a maroon button reading "Open your dues" that went to the
/// voting page. Deriving from `link` makes the two impossible to disagree:
/// change where a message points and the words follow.
///
/// The dues page is three things at once: what you owe, your payment plan, and
/// your reimbursements. One destination, so `CTA_BY_PATH` marks it with this
/// sentinel and the category picks the wording. All three labels name something
/// that is genuinely on that page, so none of them promises a page that does
/// not exist. There is no `/member/reimbursements` route, and a button that
/// implied one would be the same bug in a new coat.
const DUES_PAGE = "\u0000dues-page";

const DUES_PAGE_LABELS: Record<RenderedMessage["category"], string> = {
  dues: "Open your dues",
  plan: "Open your payment plan",
  reimbursement: "Open your reimbursements",
  general: "Open your dues",
};

/// Most specific path first, since these are prefix matches and
/// `/member/admin/dues/requests` starts with `/member/admin/dues`.
const CTA_BY_PATH: ReadonlyArray<readonly [string, string]> = [
  ["/member/admin/dues/requests", "Open the queue"],
  ["/member/admin/dues", "Open the ledger"],
  ["/member/admin/members", "Open the roster"],
  ["/member/admin/pending", "Open the pending list"],
  ["/member/admin/committees", "Open committees"],
  ["/member/admin/gem", "Open the GEM report"],
  ["/member/admin", "Open the admin tools"],
  ["/member/dues", DUES_PAGE],
  ["/member/vote", "Open the vote"],
  ["/member/events", "Open the event"],
  ["/member/committees", "Open committees"],
  ["/member/minutes", "Open the minutes"],
  ["/member/brothers", "Open the roster"],
  ["/member/gem", "Open your GEM standing"],
  ["/member/profile", "Open your profile"],
  ["/member", "Open the portal"],
] as const;


/// Fallback wording when the link is something the table has not seen. Keyed on
/// the category, which is the next-best thing we know about the message.
const CTA_BY_CATEGORY: Record<RenderedMessage["category"], string> = {
  dues: "Open your dues",
  plan: "Open your payment plan",
  reimbursement: "Open your reimbursements",
  general: "Open the portal",
};

export function ctaLabelFor(
  message: Pick<RenderedMessage, "link" | "category"> &
    Partial<Pick<RenderedMessage, "ctaLabel">>
): string {
  if (message.ctaLabel?.trim()) return message.ctaLabel.trim();

  // Compare on the path alone. A link may carry a query string or a fragment,
  // and `/member/vote?id=7` is still the voting page.
  const path = (message.link || "").split(/[?#]/)[0];
  for (const [prefix, label] of CTA_BY_PATH) {
    if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    return label === DUES_PAGE ? DUES_PAGE_LABELS[message.category] : label;
  }
  return CTA_BY_CATEGORY[message.category] ?? "Open the portal";
}

export function renderTemplate(
  template: NotifyTemplate,
  context: TemplateContext
): RenderedMessage {
  const amount = formatCents(context.amountCents);
  // "on Sept 1" when we know the day, "soon" when we don't. Reads like a person
  // wrote it either way, which a bare template slot never does.
  const when = context.dueLabel ? `on ${context.dueLabel}` : "soon";
  const name = context.firstName || "there";
  // "venmo" off the wire, "Venmo" on the page.
  const method = context.method
    ? context.method.charAt(0).toUpperCase() + context.method.slice(1)
    : "";

  switch (template) {
    case "assigned":
      return {
        title: "Your semester dues",
        body: `Your ${context.description || "chapter dues"} came out to ${amount}, due ${when}. Take a look when you get a chance.`,
        push: `Your semester dues are ${amount}, due ${when}.`,
        emailSubject: "Your semester dues",
        link: "/member/dues",
        category: "dues",
      };

    case "upcoming":
      return {
        title: "Your dues are coming up",
        body: `Quick heads up that your semester dues of ${amount} are due ${when}.`,
        push: `${amount} in dues due ${when}.`,
        emailSubject: `Your dues are due ${context.dueLabel || "soon"}`,
        link: "/member/dues",
        category: "dues",
      };

    case "due_soon":
      return {
        title: "Your dues are due tomorrow",
        body: `Your semester dues of ${amount} are due tomorrow. Last day to pay in full or ask for a payment plan.`,
        push: `${amount} in dues due tomorrow.`,
        emailSubject: "Your dues are due tomorrow",
        link: "/member/dues",
        category: "dues",
      };

    case "due_today":
      return {
        title: "Your dues are due today",
        body: `Your semester dues of ${amount} are due today. Let us know once you've sent it.`,
        push: `${amount} in dues due today.`,
        emailSubject: "Your dues are due today",
        link: "/member/dues",
        category: "dues",
      };

    case "overdue": {
      const days = context.daysOverdue ?? 0;
      const late = days > 0 ? ` about ${days} day${days === 1 ? "" : "s"} ago` : "";
      return {
        title: "Your dues are still outstanding",
        body: `Your semester dues of ${amount} were due${late} and we haven't got them yet. If you've already paid, mark it in the app and we'll sort it out.`,
        push: `${amount} in dues still outstanding.`,
        emailSubject: "Your dues are still outstanding",
        link: "/member/dues",
        category: "dues",
      };
    }

    case "installment_due":
      return {
        title: "Your next plan payment",
        body: `Your next payment plan installment of ${amount} is due ${when}. That's ${context.installmentSeq ?? 1} of ${context.installmentCount ?? 1}.`,
        push: `Plan installment of ${amount} due ${when}.`,
        emailSubject: `Your next plan payment is due ${context.dueLabel || "soon"}`,
        link: "/member/dues",
        category: "plan",
      };

    case "payment_verified":
      return {
        title: "Payment confirmed",
        body: `Got it. Your ${amount} payment${method ? ` by ${method}` : ""} is confirmed. ${context.reason || ""}`.trim(),
        push: `Your ${amount} payment is confirmed. Thanks, ${name}.`,
        emailSubject: "Payment confirmed",
        link: "/member/dues",
        category: "dues",
      };

    case "payment_rejected":
      return {
        title: "About your payment",
        body: `We couldn't match your ${amount} payment to anything on our end. ${context.reason || ""}`.trim(),
        push: `We couldn't confirm your ${amount} payment.`,
        emailSubject: "About your payment",
        link: "/member/dues",
        category: "dues",
      };

    case "plan_approved":
      return {
        title: "Your payment plan is approved",
        body: `You're all set. Your plan splits ${amount} over ${context.installmentCount ?? 0} months, with the first installment due ${when}.`,
        push: `Payment plan approved. First installment ${when}.`,
        emailSubject: "Your payment plan is approved",
        link: "/member/dues",
        category: "plan",
      };

    case "plan_denied":
      return {
        title: "About your payment plan",
        body: `We weren't able to approve your payment plan for ${amount}. ${context.reason || ""}`.trim(),
        push: `We couldn't approve your payment plan.`,
        emailSubject: "About your payment plan",
        link: "/member/dues",
        category: "plan",
      };

    case "credit_paid_out":
      return {
        title: "We've paid you back",
        body: `We've sent you ${amount}${method ? ` by ${method}` : ""} for what you covered. Let us know if that doesn't match what you got.`,
        push: `${amount} sent back to you.`,
        emailSubject: "We've paid you back",
        link: "/member/dues",
        category: "reimbursement",
      };

    case "reimbursement_received":
      return {
        title: "We got your claim",
        body: `Your ${amount} claim${context.description ? ` for ${context.description}` : ""} is in and waiting on an officer. We'll let you know as soon as it's been looked at.`,
        push: `Your ${amount} claim is in. We'll be in touch.`,
        emailSubject: "We got your claim",
        link: "/member/dues",
        category: "reimbursement",
      };

    case "reimbursement_approved":
      return {
        title: "Your claim was approved",
        body: `Approved: ${amount}${context.description ? ` for ${context.description}` : ""}. ${context.remainingLabel || "It's been added to your account as credit."}`.trim(),
        push: `Your ${amount} claim was approved.`,
        emailSubject: "Your claim was approved",
        link: "/member/dues",
        category: "reimbursement",
      };

    case "reimbursement_denied":
      return {
        title: "About your claim",
        body: `We weren't able to approve your ${amount} claim${context.description ? ` for ${context.description}` : ""}. ${context.reason || ""}`.trim(),
        push: `We couldn't approve your ${amount} claim.`,
        emailSubject: "About your claim",
        link: "/member/dues",
        category: "reimbursement",
      };

    case "charge_amended":
      return {
        title: "Your dues were updated",
        body: `Your ${context.description || "charge"} is now ${amount}${context.dueLabel ? `, due ${when}` : ""}. ${context.reason || ""}`.trim(),
        push: `Your ${context.description || "charge"} is now ${amount}.`,
        emailSubject: "Your dues were updated",
        link: "/member/dues",
        category: "dues",
      };

    case "charge_waived":
      return {
        title: "A charge was waived",
        body: `Your ${context.description || "charge"} of ${amount} has been waived, you don't owe it. ${context.reason || ""}`.trim(),
        push: `Your ${amount} ${context.description || "charge"} was waived.`,
        emailSubject: "A charge was waived",
        link: "/member/dues",
        category: "dues",
      };

    case "charge_voided":
      return {
        title: "A charge was removed",
        body: `Your ${context.description || "charge"} of ${amount} was removed, it shouldn't have been there. ${context.reason || ""}`.trim(),
        push: `Your ${amount} ${context.description || "charge"} was removed.`,
        emailSubject: "A charge was removed",
        link: "/member/dues",
        category: "dues",
      };

    case "payment_recorded":
      return {
        title: "A payment was recorded",
        body: `We've put ${amount}${method ? ` by ${method}` : ""} against your account. ${context.remainingLabel || ""}`.trim(),
        push: `${amount} recorded against your account.`,
        emailSubject: "A payment was recorded",
        link: "/member/dues",
        category: "dues",
      };

    case "payment_removed":
      return {
        title: "A payment was removed",
        body: `A ${amount} payment has been taken off your account. ${context.reason || "If that doesn't look right, tell an officer."}`.trim(),
        push: `A ${amount} payment was removed from your account.`,
        emailSubject: "A payment was removed",
        link: "/member/dues",
        category: "dues",
      };

    case "plan_cancelled":
      return {
        title: "Your payment plan was cancelled",
        body: `Your plan for ${amount} has been cancelled. ${context.reason || "The full balance is owed as normal."}`.trim(),
        push: `Your ${amount} payment plan was cancelled.`,
        emailSubject: "Your payment plan was cancelled",
        link: "/member/dues",
        category: "plan",
      };

    case "plan_completed":
      return {
        title: "Your payment plan is done",
        body: `That's the last one. Your ${amount} plan is paid off in full. Nothing further owed.`,
        push: `Your ${amount} payment plan is paid off.`,
        emailSubject: "Your payment plan is done",
        link: "/member/dues",
        category: "plan",
      };

    case "plan_defaulted":
      return {
        title: "About your payment plan",
        body: `Your plan for ${amount} has missed two installments in a row, so it's been flagged for a conversation. Nothing has been added to what you owe, so get in touch and we'll sort it out.`,
        push: `Your payment plan needs a conversation.`,
        emailSubject: "About your payment plan",
        link: "/member/dues",
        category: "plan",
      };

    case "installment_missed":
      return {
        title: "A plan payment was missed",
        body: `Installment ${context.installmentSeq ?? 1} of ${context.installmentCount ?? 1}, ${amount} due ${when}, hasn't come in yet. The rest of the plan is unchanged.`,
        push: `Plan installment of ${amount} was missed.`,
        emailSubject: "A plan payment was missed",
        link: "/member/dues",
        category: "plan",
      };

    case "credit_applied":
      return {
        title: "Your credit was applied",
        body: `We've put ${amount} of your credit towards ${context.description || "what you owe"}. ${context.remainingLabel || ""}`.trim(),
        push: `${amount} of credit applied to your balance.`,
        emailSubject: "Your credit was applied",
        link: "/member/dues",
        category: "dues",
      };
  }
}

// ---------------------------------------------------------------------------
// The officer feed
// ---------------------------------------------------------------------------
// E-Council and the admins get told about every movement on the chapter ledger,
// whoever caused it. That is a different kind of message from the ones above:
// those are written *to* the person the money belongs to, and these are written
// *about* them, to the people who have to keep the books straight.
//
// So they are rendered once, generically, rather than hand-authored per event.
// The headline says what kind of thing happened and the body is the same
// sentence the FinanceEvent already recorded — which is the house's own phrasing
// of that exact event, composed at write time with the numbers as they were
// then. Writing twenty-five more bespoke officer templates would produce twenty
// five more chances for the notification and the audit row to disagree about
// what happened, which is the one thing a treasurer cannot afford.

/// Officer templates are namespaced so a member's bell and an officer's feed
/// can never collide on the cooldown key, and so `template` stays readable in
/// the database: `officer_payment_submitted`, not `activity`.
export type OfficerTemplate = `officer_${string}`;

export function officerTemplateFor(event: string): OfficerTemplate {
  return `officer_${event}`;
}

export function isOfficerTemplate(value: string): value is OfficerTemplate {
  return value.startsWith("officer_");
}

interface OfficerHeadline {
  title: string;
  category: RenderedMessage["category"];
  /// Where an officer wants to land — usually the queue that now has one more
  /// thing in it, not the member's own dues page.
  link: string;
}

const OFFICER_HEADLINES: Record<string, OfficerHeadline> = {
  charge_assigned:  { title: "Dues assigned",        category: "dues",          link: "/member/admin/dues" },
  charge_amended:   { title: "Charge amended",       category: "dues",          link: "/member/admin/dues" },
  charge_waived:    { title: "Charge waived",        category: "dues",          link: "/member/admin/dues" },
  charge_voided:    { title: "Charge voided",        category: "dues",          link: "/member/admin/dues" },

  // The three that put something in a queue. These are the ones an officer is
  // actually being asked to do something about.
  payment_submitted:       { title: "New payment claim",     category: "dues",          link: "/member/admin/dues/requests" },
  plan_proposed:           { title: "New plan request",      category: "plan",          link: "/member/admin/dues/requests" },
  reimbursement_submitted: { title: "New reimbursement claim", category: "reimbursement", link: "/member/admin/dues/requests" },

  payment_verified: { title: "Payment verified",     category: "dues",          link: "/member/admin/dues/requests" },
  payment_rejected: { title: "Payment rejected",     category: "dues",          link: "/member/admin/dues/requests" },
  payment_recorded: { title: "Payment recorded",     category: "dues",          link: "/member/admin/dues" },
  payment_removed:  { title: "Payment removed",      category: "dues",          link: "/member/admin/dues" },

  plan_approved:    { title: "Plan approved",        category: "plan",          link: "/member/admin/dues/requests" },
  plan_denied:      { title: "Plan denied",          category: "plan",          link: "/member/admin/dues/requests" },
  plan_cancelled:   { title: "Plan cancelled",       category: "plan",          link: "/member/admin/dues/requests" },
  plan_completed:   { title: "Plan completed",       category: "plan",          link: "/member/admin/dues" },
  plan_defaulted:   { title: "Plan defaulted",       category: "plan",          link: "/member/admin/dues" },

  installment_due:    { title: "Installment due",    category: "plan",          link: "/member/admin/dues" },
  installment_paid:   { title: "Installment paid",   category: "plan",          link: "/member/admin/dues" },
  installment_missed: { title: "Installment missed", category: "plan",          link: "/member/admin/dues" },

  reimbursement_approved: { title: "Reimbursement approved", category: "reimbursement", link: "/member/admin/dues/requests" },
  reimbursement_denied:   { title: "Reimbursement denied",   category: "reimbursement", link: "/member/admin/dues/requests" },

  credit_applied:   { title: "Credit applied",       category: "dues",          link: "/member/admin/dues" },
  credit_paid_out:  { title: "Credit paid out",      category: "reimbursement", link: "/member/admin/dues" },
  credit_adjusted:  { title: "Credit adjusted",      category: "dues",          link: "/member/admin/dues" },
};

export interface OfficerMessageInput {
  event: string;
  /// Whose ledger moved.
  memberName: string;
  /// Who moved it. Empty when the nightly job did, which is worth showing —
  /// "the system marked it late" and "an officer marked it late" are different
  /// facts and only one of them has a person to ask about it.
  actorName?: string;
  /// The FinanceEvent's own sentence, reused verbatim.
  summary: string;
}

export function renderOfficerMessage(input: OfficerMessageInput): RenderedMessage {
  const headline = OFFICER_HEADLINES[input.event] ?? {
    title: "Ledger activity",
    category: "general" as const,
    link: "/member/admin/dues",
  };
  const who = input.memberName || "A member";
  const by = input.actorName ? ` (by ${input.actorName})` : "";

  // "Vinny Panchal: Reported $45 paid by venmo on Aug 20, 2026 (by Vinny
  // Panchal)". Whose ledger first, because an officer scanning a feed is
  // looking for a name before anything else.
  const body = `${who}: ${input.summary}${by}`;

  // The push has no room for the actor, and on the lock screen the name and
  // the amount are the whole message.
  const push = `${who}: ${input.summary}`;

  return {
    title: headline.title,
    body,
    push: push.length > 120 ? `${push.slice(0, 117)}...` : push,
    emailSubject: `${headline.title}: ${who}`,
    link: headline.link,
    category: headline.category,
  };
}
