// lib/availability/slug.ts
// Pretty, shareable URLs for polls: /member/<committee-slug>/poll/<poll-slug>.
//
// The id-based route stays canonical (notifications link to it, it never
// breaks). The slug is a nicety for a head pasting a link into Discord, so it
// only has to be good enough to resolve back to one poll within a committee.
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Committee from "@/lib/models/Committee";

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

/// The poll behind a shared link. "chapter" is the committee slug for
/// chapter-wide polls. Callers connect to the database first.
export async function resolvePollSlug(
  committeeSlug: string,
  pollSlug: string
): Promise<{ pollId: string; committeeId: string | null } | null> {
  let committeeId: string | null = null;
  if (committeeSlug !== "chapter") {
    const committees = await Committee.find().select("_id name").lean<any[]>();
    const match = committees.find(
      (c) => slugify(c.name || "") === committeeSlug
    );
    if (!match) return null;
    committeeId = String(match._id);
  }

  const poll = await AvailabilityPoll.findOne({ slug: pollSlug, committeeId })
    .select("_id")
    .lean<any>();
  if (!poll) return null;
  return { pollId: String(poll._id), committeeId };
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
