// lib/notify/from.ts
// Who chapter mail comes from.
//
// Everything automated sends from the `alerts.` subdomain rather than from
// ttdg.org itself. That separation is the whole point: automated mail is what
// generates bounces and spam complaints — sixty dues notices to student
// addresses, some of which have graduated — and keeping it off the apex domain
// means a bad send can never damage deliverability for real mail from real
// people.

/// Overridable so a staging deploy can send from somewhere else without
/// touching code.
export function alertsDomain(): string {
  return process.env.ALERTS_EMAIL_DOMAIN?.trim() || "alerts.ttdg.org";
}

export interface Sender {
  local: string;
  name: string;
}

/// Which mailbox each kind of message comes from.
///
/// Dues, plans and reimbursements deliberately share `dues@`. They are one
/// conversation about one member's money — a plan approval and the payment
/// confirmation that follows it belong in the same thread in the member's
/// inbox, and splitting them across senders would scatter that conversation
/// for no gain. Adding a genuinely different kind of mail is one line here.
const SENDERS: Record<string, Sender> = {
  dues: { local: "dues", name: "Theta Tau Treasury" },
  plan: { local: "dues", name: "Theta Tau Treasury" },
  reimbursement: { local: "dues", name: "Theta Tau Treasury" },
  events: { local: "events", name: "Theta Tau Events" },
  general: { local: "chapter", name: "Theta Tau" },
};

const FALLBACK: Sender = SENDERS.general;

/// A ready-to-send From header: `Theta Tau Treasury <dues@alerts.ttdg.org>`.
export function fromAddressFor(category: string): string {
  const sender = SENDERS[category] ?? FALLBACK;
  return `${sender.name} <${sender.local}@${alertsDomain()}>`;
}

/// Where a member's reply should land.
///
/// Every sending address lives on the alerts subdomain, which has receiving
/// disabled: mail sent to dues@alerts.ttdg.org goes nowhere. So these are
/// no-reply mailboxes in practice, and without a Reply-To a member hitting
/// reply would be typing into a void at exactly the moment they most want a
/// human. Reply-To routes them to someone who reads mail.
///
/// Routed by category rather than one global address, because "I think my dues
/// are wrong" and "when is the next event" are questions for different people.
const REPLY_TO: Record<string, string> = {
  dues: "treasurer@thetatau-dg.org",
  plan: "treasurer@thetatau-dg.org",
  reimbursement: "treasurer@thetatau-dg.org",
  events: "general@thetatau-dg.org",
  general: "general@thetatau-dg.org",
};

const REPLY_FALLBACK = "general@thetatau-dg.org";

export function replyToFor(category: string): string {
  // A single override wins for every category, for a staging deploy that
  // shouldn't be able to mail real officers.
  const override = process.env.CHAPTER_REPLY_TO?.trim();
  if (override) return override;
  return REPLY_TO[category] ?? REPLY_FALLBACK;
}
