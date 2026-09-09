// lib/availability/slug.ts
// Pretty, shareable URLs for polls: /member/<committee-slug>/poll/<poll-slug>.
//
// The id-based route stays canonical (notifications link to it, it never
// breaks). The slug is a nicety for a head pasting a link into Discord, so it
// only has to be good enough to resolve back to one poll within a committee.
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "poll"
  );
}

/// A poll slug unique within its committee (or within the chapter-wide set for
/// a committee-less poll). Adds `-2`, `-3`… on collision.
export async function uniquePollSlug(
  title: string,
  committeeId: string | null
): Promise<string> {
  const base = slugify(title);
  const scope = committeeId ? { committeeId } : { committeeId: null };
  const taken = new Set(
    (
      await AvailabilityPoll.find({
        ...scope,
        slug: new RegExp(`^${base}(-\\d+)?$`),
      })
        .select("slug")
        .lean<any[]>()
    ).map((p) => p.slug)
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}
