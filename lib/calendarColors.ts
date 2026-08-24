/**
 * The colours a committee's calendar can be.
 *
 * Stored as a key rather than as a hex value: the iOS app draws a deep teal on
 * white and a pastel one on black, and a single stored colour cannot be both.
 * Every client maps these ten keys onto its own light and dark shades.
 *
 * The crimson end of the chapter's palette is deliberately absent — that is
 * reserved for chapter-wide events, and a committee wearing it would read as
 * one.
 */
export const CALENDAR_COLORS = [
  "teal",
  "cyan",
  "sage",
  "olive",
  "sand",
  "amber",
  "orange",
  "rust",
  "plum",
  "indigo",
] as const;

export type CalendarColor = (typeof CALENDAR_COLORS)[number];

/**
 * The colour a new committee should get: whichever is least used so far, so a
 * chapter with four committees gets four visibly different ones rather than
 * whatever a random draw happens to repeat. Ties break by palette order, which
 * keeps it deterministic and testable.
 */
export function nextCalendarColor(taken: (string | null | undefined)[]): CalendarColor {
  const counts = new Map<CalendarColor, number>(
    CALENDAR_COLORS.map((color) => [color, 0])
  );
  for (const color of taken) {
    if (color && counts.has(color as CalendarColor)) {
      counts.set(color as CalendarColor, (counts.get(color as CalendarColor) ?? 0) + 1);
    }
  }
  let best: CalendarColor = CALENDAR_COLORS[0];
  for (const color of CALENDAR_COLORS) {
    if ((counts.get(color) ?? 0) < (counts.get(best) ?? 0)) best = color;
  }
  return best;
}

export function isCalendarColor(value: unknown): value is CalendarColor {
  return typeof value === "string" && (CALENDAR_COLORS as readonly string[]).includes(value);
}
