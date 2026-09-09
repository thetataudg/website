// lib/phone-sync-utils.ts
//
// Works out what an Airtable phone sync would change. Pure: no database, no
// network, so `npm run check:phones` can exercise the whole decision table.

import { normalizePhone } from "@/lib/phone";
import type { AirtableMemberRow } from "@/lib/airtable";

export type PhoneSyncOutcome = "set" | "change" | "same" | "invalid" | "blank";

export interface PhoneSyncRow {
  rollNo: string;
  name: string;
  current: string | null;
  incoming: string | null;
  raw: string;
  outcome: PhoneSyncOutcome;
  error?: string;
}

export interface PhoneSyncPlan {
  /** Had no number, gets one. */
  sets: PhoneSyncRow[];
  /** Had a different number. */
  changes: PhoneSyncRow[];
  unchanged: PhoneSyncRow[];
  /** Airtable holds a value that will not normalize. */
  invalid: PhoneSyncRow[];
  /** Airtable row has no phone cell. */
  blank: PhoneSyncRow[];
  /** In Airtable, no member with that roll number. */
  unmatchedAirtable: PhoneSyncRow[];
  /** A member with no row in Airtable at all. */
  unmatchedMembers: PhoneSyncRow[];
  /** Same roll number twice in Airtable. Blocks the commit. */
  duplicateRolls: string[];
  warnings: string[];
}

export interface SyncableMember {
  rollNo: string;
  fName?: string;
  lName?: string;
  phone?: string | null;
}

/** Both sides of the match go through this, or nothing lines up. */
export function normalizeRoll(value: unknown): string {
  return String(value ?? "").trim().replace(/^#/, "");
}

const displayName = (m: SyncableMember) =>
  [m.fName, m.lName].filter(Boolean).join(" ").trim() || m.rollNo;

export function buildPhoneSyncPlan(
  members: SyncableMember[],
  rows: AirtableMemberRow[]
): PhoneSyncPlan {
  const plan: PhoneSyncPlan = {
    sets: [], changes: [], unchanged: [], invalid: [], blank: [],
    unmatchedAirtable: [], unmatchedMembers: [], duplicateRolls: [], warnings: [],
  };

  const byRoll = new Map<string, SyncableMember>();
  for (const member of members) byRoll.set(normalizeRoll(member.rollNo), member);

  const seen = new Set<string>();
  const matchedRolls = new Set<string>();

  for (const row of rows) {
    const roll = normalizeRoll(row.roll);

    if (!roll) {
      plan.unmatchedAirtable.push({
        rollNo: "", name: row.name, current: null, incoming: null,
        raw: row.phoneRaw, outcome: "invalid",
        error: "This Airtable row has no roll number.",
      });
      continue;
    }

    // Last-write-wins would make the result depend on Airtable's row order,
    // so two rows claiming one roll number is a stop, not a coin flip.
    if (seen.has(roll)) {
      if (!plan.duplicateRolls.includes(roll)) plan.duplicateRolls.push(roll);
      continue;
    }
    seen.add(roll);

    const member = byRoll.get(roll);
    if (!member) {
      plan.unmatchedAirtable.push({
        rollNo: roll, name: row.name, current: null, incoming: null,
        raw: row.phoneRaw, outcome: "invalid",
        error: "No member with this roll number.",
      });
      continue;
    }

    matchedRolls.add(roll);
    const current = member.phone ?? null;
    const base = { rollNo: roll, name: displayName(member), current, raw: row.phoneRaw };
    const normalized = normalizePhone(row.phoneRaw);

    if (!normalized.ok) {
      plan.invalid.push({ ...base, incoming: null, outcome: "invalid", error: normalized.error });
      continue;
    }
    if (!normalized.e164) {
      // No number in Airtable. Never treated as "clear the one we have" —
      // an absent cell is missing data, not an instruction to delete.
      plan.blank.push({ ...base, incoming: null, outcome: "blank" });
      continue;
    }

    const incoming = normalized.e164;
    if (current === incoming) {
      plan.unchanged.push({ ...base, incoming, outcome: "same" });
    } else if (!current) {
      plan.sets.push({ ...base, incoming, outcome: "set" });
    } else {
      plan.changes.push({ ...base, incoming, outcome: "change" });
    }
  }

  for (const member of members) {
    const roll = normalizeRoll(member.rollNo);
    if (matchedRolls.has(roll)) continue;
    if (plan.unmatchedAirtable.some((r) => r.rollNo === roll)) continue;
    plan.unmatchedMembers.push({
      rollNo: roll, name: displayName(member), current: member.phone ?? null,
      incoming: null, raw: "", outcome: "blank",
    });
  }

  if (plan.duplicateRolls.length) {
    plan.warnings.push(
      `${plan.duplicateRolls.length} roll number(s) appear more than once in Airtable. Fix them there before applying.`
    );
  }
  if (rows.length > 0 && plan.blank.length === rows.length) {
    plan.warnings.push(
      "Every Airtable row came back with an empty phone number. That usually means the phone column is named differently than this server expects."
    );
  }

  return plan;
}

/** What the commit would actually write. */
export function pendingWrites(plan: PhoneSyncPlan): PhoneSyncRow[] {
  return [...plan.sets, ...plan.changes];
}
