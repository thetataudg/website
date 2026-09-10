// lib/mail/address.ts
// What a chapter address may look like, and which ones to offer.

export function mailDomain(): string {
  return (process.env.MAIL_DOMAIN || process.env.NEXT_PUBLIC_MAIL_DOMAIN || "mail.ttdg.org")
    .trim()
    .toLowerCase();
}

/// Mailboxes nobody gets to claim: the RFC-required ones, anything that reads
/// as the chapter speaking officially, and the officer titles.
const RESERVED = new Set([
  "admin", "administrator", "postmaster", "hostmaster", "webmaster", "abuse",
  "noreply", "no-reply", "donotreply", "mailer-daemon", "root", "support",
  "security", "help", "info", "contact", "billing", "privacy", "legal",
  "chapter", "general", "thetatau", "theta.tau", "ttdg", "officers", "ecouncil",
  "regent", "vice.regent", "viceregent", "treasurer", "scribe", "corresponding.secretary",
  "secretary", "marshal", "inner.guard", "outer.guard", "president", "dues",
  "events", "alerts", "accounts", "invitations", "giving", "availability",
]);

const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/;

/// Lowercase, accents stripped, letters and digits only. "José" → "jose".
function clean(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/// The first word of the first name and the last word of the last name.
/// "Vinny Amato" + "Panchal Miller" gives vinny / miller.
export function nameParts(fName: string, lName: string) {
  const first = clean(String(fName || "").trim().split(/\s+/)[0] || "");
  const lastWords = String(lName || "").trim().split(/\s+/).filter(Boolean);
  const last = clean(lastWords[lastWords.length - 1] || "");
  return { first, last };
}

export function suggestLocalParts(fName: string, lName: string, gradYear?: number | null): string[] {
  const { first, last } = nameParts(fName, lName);
  const out: string[] = [];
  const push = (value: string) => {
    if (value && validateLocalPart(value).ok && !out.includes(value)) out.push(value);
  };
  if (first && last) {
    push(`${first}.${last}`);
    if (gradYear) push(`${first}.${last}${String(gradYear).slice(-2)}`);
    push(`${first[0]}.${last}`);
    push(`${first}${last}`);
    push(`${first}.${last[0]}`);
  } else {
    push(first || last);
  }
  return out;
}

export type LocalPartCheck = { ok: true; localPart: string } | { ok: false; error: string };

export function validateLocalPart(raw: string): LocalPartCheck {
  const localPart = String(raw || "").trim().toLowerCase();
  if (!localPart) return { ok: false, error: "Enter an address." };
  if (localPart.length < 2) return { ok: false, error: "Use at least 2 characters." };
  if (localPart.length > 30) return { ok: false, error: "Use 30 characters or fewer." };
  if (!LOCAL_PART.test(localPart)) {
    return {
      ok: false,
      error: "Use letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.",
    };
  }
  if (/[._-]{2}/.test(localPart)) return { ok: false, error: "Separators can't be next to each other." };
  if (RESERVED.has(localPart)) return { ok: false, error: "That address is reserved." };
  return { ok: true, localPart };
}

export function fullAddress(localPart: string): string {
  return `${localPart}@${mailDomain()}`;
}

/// The bare address out of `Name <a@b.c>`, lowercased.
export function bareAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value || "");
  return (match ? match[1] : value || "").trim().toLowerCase();
}

/// The display name out of `Name <a@b.c>`, if there is one.
export function displayNameOf(value: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(value || "");
  return match ? match[1].trim() : "";
}

const EMAIL = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL.test(bareAddress(value));
}

export function isOurDomain(address: string): boolean {
  return bareAddress(address).endsWith(`@${mailDomain()}`);
}
