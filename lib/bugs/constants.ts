// lib/bugs/constants.ts
// The bug portal's fixed vocabulary. Pure, shared by the form and the server.
export { PUBLIC_STATUSES, PUBLIC_STATUS_LABEL, type PublicStatus } from "@/lib/tasks/logic";

export const AREAS = [
  "website",
  "dashboard",
  "ios",
  "mail",
  "dues",
  "events",
  "discord",
  "other",
] as const;
export type BugArea = (typeof AREAS)[number];

export const AREA_LABEL: Record<BugArea, string> = {
  website: "Website (public)",
  dashboard: "Member dashboard",
  ios: "iOS app",
  mail: "Chapter Mail",
  dues: "Dues and payments",
  events: "Events and check-in",
  discord: "Discord bot",
  other: "Other",
};

export const SEVERITIES = ["blocker", "annoying", "minor", "idea"] as const;
export type BugSeverity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<BugSeverity, string> = {
  blocker: "Blocks me",
  annoying: "Annoying",
  minor: "Minor",
  idea: "Idea",
};

export const SEVERITY_HELP: Record<BugSeverity, string> = {
  blocker: "I can't do something I need to do.",
  annoying: "It works, but it gets in the way.",
  minor: "Small, cosmetic, or rare.",
  idea: "Not broken. Something that would be better.",
};

export const MAX_SCREENSHOTS = 3;
export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

/// Statuses the reporter sees as finished.
export const CLOSED_PUBLIC = ["fixed", "wont_fix", "duplicate", "closed_by_reporter"] as const;

/// Report numbers read `TTDG-R4821`: the chapter prefix, R for "report"
/// (tasks are `TTDG-7K2M`), and a random four-digit number.
export const formatRef = (n: number) => `TTDG-R${String(n).padStart(4, "0")}`;

/// "TTDG-R4821", "R4821", "r-4821" or "4821" → 4821. Old "R-27" links still work.
export function parseRef(value: string): number | null {
  const match = /^(?:TTDG-)?R-?(\d{1,7})$|^(\d{4})$/i.exec((value || "").trim());
  if (!match) return null;
  return Number(match[1] ?? match[2]);
}

export function newRefNumber(random: () => number = Math.random): number {
  return 1000 + Math.floor(random() * 9000);
}
