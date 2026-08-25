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

/**
 * The two shades every key is drawn in.
 *
 * Identical to the iOS app's `CalendarPalette`, value for value, because the
 * same committee has to be the same colour on a phone and on a laptop. The
 * light values are saturated enough to read on white; the dark ones are the
 * same hues pushed to a pastel, because a deep teal on a black card is
 * indistinguishable from the card.
 */
export interface CalendarSwatch {
  key: string;
  /** Said out loud in a label — a colour nobody can name carries meaning by hue alone. */
  name: string;
  light: string;
  dark: string;
}

/**
 * Chapter-wide events. Not assignable to a committee: it is the brand mark,
 * and it means "everybody", which is a different kind of thing from "the Rush
 * committee".
 */
export const CHAPTER_SWATCH: CalendarSwatch = {
  key: "chapter",
  name: "Chapter",
  light: "#7A0104",
  dark: "#E9868C",
};

export const CALENDAR_SWATCHES: Record<CalendarColor, CalendarSwatch> = {
  teal: { key: "teal", name: "Teal", light: "#005F73", dark: "#7FC4D8" },
  cyan: { key: "cyan", name: "Cyan", light: "#0A9396", dark: "#76D2D4" },
  sage: { key: "sage", name: "Sage", light: "#3F8F76", dark: "#94D2BD" },
  olive: { key: "olive", name: "Olive", light: "#6F7F1E", dark: "#CBD98C" },
  sand: { key: "sand", name: "Sand", light: "#94781C", dark: "#E9D8A6" },
  amber: { key: "amber", name: "Amber", light: "#C08000", dark: "#F3C56E" },
  orange: { key: "orange", name: "Orange", light: "#CA6702", dark: "#F2AC6A" },
  rust: { key: "rust", name: "Rust", light: "#BB3E03", dark: "#F09877" },
  plum: { key: "plum", name: "Plum", light: "#7A3B70", dark: "#D8A8D0" },
  indigo: { key: "indigo", name: "Indigo", light: "#3F4E8F", dark: "#A8B4E9" },
};

/** The swatch stored under this key, if it is one we know. */
export function swatchForKey(key: string | null | undefined): CalendarSwatch | null {
  if (!key) return null;
  const normalised = key.toLowerCase();
  if (normalised === CHAPTER_SWATCH.key) return CHAPTER_SWATCH;
  return isCalendarColor(normalised) ? CALENDAR_SWATCHES[normalised] : null;
}

/**
 * A stable colour for a committee the server has not assigned one to yet.
 *
 * Hashed rather than random, and hashed the same way the iOS app hashes it —
 * FNV-1a over the id's bytes — so an un-coloured committee comes back the same
 * colour on every device rather than a different one per client.
 */
export function swatchForId(id: string): CalendarSwatch {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(id)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x00000100000001b3n);
  }
  const keys = CALENDAR_COLORS;
  return CALENDAR_SWATCHES[keys[Number(hash % BigInt(keys.length))]];
}

/** The shade this appearance draws the swatch in. */
export function swatchHex(swatch: CalendarSwatch, isDark: boolean): string {
  return isDark ? swatch.dark : swatch.light;
}

/** `#RRGGBB` at an opacity, for a wash or a hairline. */
export function swatchAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * The filled ground, hairline and ink an event is drawn with.
 *
 * The dark wash is heavier than the light one for the same reason the hues are
 * pastel there: a 14% tint of anything on black is black.
 */
export function swatchStyle(
  swatch: CalendarSwatch,
  isDark: boolean
): { backgroundColor: string; boxShadow: string; color: string } {
  const hex = swatchHex(swatch, isDark);
  return {
    backgroundColor: swatchAlpha(hex, isDark ? 0.26 : 0.14),
    boxShadow: `inset 0 0 0 1px ${swatchAlpha(hex, isDark ? 0.4 : 0.24)}`,
    color: hex,
  };
}
