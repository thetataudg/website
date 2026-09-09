// scripts/check-phone-sync.ts
// Offline proof that phone normalization and the Airtable reconciliation agree
// with what the admin tool promises. No network, no database.
//
//   npm run check:phones
import { normalizePhone, formatPhone, isValidPhone } from "@/lib/phone";
import { buildPhoneSyncPlan, pendingWrites } from "@/lib/phone-sync-utils";
import type { AirtableMemberRow } from "@/lib/airtable";

let pass = 0,
  fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}${
      ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
    }`
  );
  ok ? pass++ : fail++;
}

console.log("\nnormalizing what people actually type");
const e164 = (input: unknown) => normalizePhone(input);
check("bare 10 digits assume US", e164("4805550123"), { ok: true, e164: "+14805550123" });
check("punctuated 10 digits", e164("(480) 555-0123"), { ok: true, e164: "+14805550123" });
check("dots", e164("480.555.0123"), { ok: true, e164: "+14805550123" });
check("leading 1", e164("14805550123"), { ok: true, e164: "+14805550123" });
check("already E.164", e164("+14805550123"), { ok: true, e164: "+14805550123" });
check("non-US passes through", e164("+447700900123"), { ok: true, e164: "+447700900123" });
check("blank is 'not provided', not an error", e164(""), { ok: true, e164: null });
check("whitespace is blank", e164("   "), { ok: true, e164: null });
check("undefined is blank", e164(undefined), { ok: true, e164: null });

console.log("\nrefusing what cannot be dialled");
check("too short", e164("555-0123").ok, false);
check("12 digits with no country code", e164("480555012345").ok, false);
check("letters only", e164("call me").ok, false);
// The ordering trap: strip punctuation first and "x12" silently becomes digits.
check("extension is refused, not absorbed", e164("480-555-0123 x12").ok, false);
check("comma pause is refused", e164("4805550123,12").ok, false);

console.log("\nisValidPhone treats blank as unusable");
check("blank is not valid", isValidPhone(""), false);
check("real number is valid", isValidPhone("4805550123"), true);

console.log("\nformatting for display");
check("US formats", formatPhone("+14805550123"), "(480) 555-0123");
check("non-US returns as stored", formatPhone("+447700900123"), "+447700900123");
check("null renders empty", formatPhone(null), "");

console.log("\nreconciling a roster against Airtable");
const members = [
  { rollNo: "454", fName: "Anay", lName: "Bengeri", phone: null },              // set
  { rollNo: "455", fName: "Evan", lName: "Birkenkamp", phone: "+16025550000" }, // change
  { rollNo: "456", fName: "Sydney", lName: "Braun", phone: "+14807610804" },    // same
  { rollNo: "457", fName: "Neal", lName: "Chandra", phone: null },              // invalid
  { rollNo: "458", fName: "Alec", lName: "Fishbach", phone: null },             // blank
  { rollNo: "999", fName: "Ghost", lName: "Member", phone: null },              // not in Airtable
];
const row = (roll: string, name: string, phoneRaw: string): AirtableMemberRow => ({
  id: `rec${roll}`, roll, name, phoneRaw,
});
const rows = [
  row("454", "Anay Bengeri", "(408) 239-6665"),
  row("455", "Evan Birkenkamp", "815-345-9807"),
  row("456", "Sydney Braun", "(480) 761-0804"),
  row("457", "Neal Chandra", "650-305-6403 x22"),
  row("458", "Alec Fishbach", ""),
  row("777", "Nobody Here", "602-555-0000"),
  row("454", "Anay Duplicate", "408-000-0000"),
];
const plan = buildPhoneSyncPlan(members, rows);

check("a member with no number is a 'set'", plan.sets.map((r) => r.rollNo), ["454"]);
check("the set carries the normalized number", plan.sets[0]?.incoming, "+14082396665");
check("a different number is a 'change'", plan.changes.map((r) => r.rollNo), ["455"]);
check(
  "the change records both sides",
  [plan.changes[0]?.current, plan.changes[0]?.incoming],
  ["+16025550000", "+18153459807"]
);
check("same number is left alone", plan.unchanged.map((r) => r.rollNo), ["456"]);
check("an extension lands in invalid", plan.invalid.map((r) => r.rollNo), ["457"]);
check("an empty cell is 'blank', never a delete", plan.blank.map((r) => r.rollNo), ["458"]);
check("an Airtable roll with no member", plan.unmatchedAirtable.map((r) => r.rollNo), ["777"]);
check("a member absent from Airtable", plan.unmatchedMembers.map((r) => r.rollNo), ["999"]);
check("a repeated roll number is caught", plan.duplicateRolls, ["454"]);
check("only sets and changes are written", pendingWrites(plan).map((r) => r.rollNo), ["454", "455"]);

console.log("\nthe silent-wipe guard");
// A renamed Airtable column makes every cell read empty. Nothing may be
// proposed for deletion, and it has to be called out.
const wiped = buildPhoneSyncPlan(members, members.map((m) => row(m.rollNo, "x", "")));
check("nothing is written", pendingWrites(wiped).length, 0);
check("and it warns", wiped.warnings.length > 0, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
