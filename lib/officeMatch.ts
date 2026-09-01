// lib/officeMatch.ts
// Matching the free-text `ecouncilPosition` against a named office.
//
// Pure, and deliberately in its own file so both the server's permission checks
// and the logic tests can use it without dragging Clerk and a database
// connection along. The normalization has to stay identical to the iOS client's
// `ChapterPermissions.holds(_:)` — lowercase, strip everything that is not a
// letter, compare against a small alias set — because the two clients
// disagreeing about who the Treasurer is means a button that appears on the
// phone and 403s on the server.
export const OFFICE_ALIASES = {
  regent: ["regent"],
  viceRegent: ["viceregent", "vicergent"],
  treasurer: ["treasurer"],
  scribe: ["scribe", "secretary"],
  corresponding: ["correspondingsecretary", "corresponding"],
  marshal: ["marshal", "marshall"],
} as const;

export type OfficeName = keyof typeof OFFICE_ALIASES;

export function normalizeOffice(position: any): string {
  return String(position ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function holdsOffice(position: any, office: OfficeName): boolean {
  const normalized = normalizeOffice(position);
  if (!normalized) return false;
  return (OFFICE_ALIASES[office] as readonly string[]).includes(normalized);
}
